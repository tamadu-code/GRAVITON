import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const WEBHOOK_SECRET = Deno.env.get('WEBHOOK_SECRET')
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')

serve(async (req) => {
  // Authentication
  const authHeader = req.headers.get('Authorization')
  if (authHeader !== `Bearer ${WEBHOOK_SECRET}`) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 })
  }

  try {
    const { attendance_code, status, date } = await req.json()
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

    // 1. Find student by attendance_code
    const { data: student, error: fetchError } = await supabase
      .from('students')
      .select('student_id, is_active')
      .eq('attendance_code', attendance_code)
      .single()

    if (fetchError || !student) {
      return new Response(JSON.stringify({ error: 'Student not found' }), { status: 404 })
    }

    // 2. Upsert attendance record
    const { error: upsertError } = await supabase
      .from('attendance_records')
      .upsert({
        student_id: student.student_id,
        date: date,
        status: status
      }, { onConflict: 'student_id,date' })

    if (upsertError) throw upsertError

    return new Response(JSON.stringify({ success: true }), { status: 200 })

  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500 })
  }
})
