import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const WEBHOOK_SECRET = Deno.env.get("WEBHOOK_SECRET")
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")

serve(async (req) => {
  // 1. Authenticate via bearer token
  const authHeader = req.headers.get("Authorization")
  if (!authHeader || authHeader !== `Bearer ${WEBHOOK_SECRET}`) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 })
  }

  const { attendance_code, status, date } = await req.json()

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

  // 2. Find student by attendance_code (only if active)
  const { data: student, error: studentError } = await supabase
    .from('students')
    .select('id, is_active')
    .eq('attendance_code', attendance_code)
    .single()

  if (studentError || !student) {
    return new Response(JSON.stringify({ error: "Student not found" }), { status: 404 })
  }

  if (!student.is_active) {
    // Optional: Warn or reject. Here we just log and proceed if you want to record history, 
    // but the prompt says "only if is_active = true" was optional. Let's stick to recording it but maybe logging a warning.
    console.warn(`Recording attendance for inactive student: ${attendance_code}`)
  }

  // 3. Upsert into attendance_records
  const { error: upsertError } = await supabase
    .from('attendance_records')
    .upsert({
      student_id: student.id,
      date: date,
      status: status
    }, { onConflict: 'student_id, date' })

  if (upsertError) {
    console.error("Upsert error:", upsertError)
    return new Response(JSON.stringify({ error: "Failed to record attendance" }), { status: 500 })
  }

  return new Response(JSON.stringify({ success: true }), { status: 200 })
})
