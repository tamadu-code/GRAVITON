import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const ATTENDANCE_SYSTEM_URL = Deno.env.get("ATTENDANCE_SYSTEM_URL")
const ATTENDANCE_TOKEN = Deno.env.get("ATTENDANCE_TOKEN")
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")

serve(async (req) => {
  const { student_id_internal } = await req.json()

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

  // 1. Update SMS student: is_active = false
  const { data: student, error: updateError } = await supabase
    .from('students')
    .update({ is_active: false })
    .eq('id', student_id_internal)
    .select('attendance_code')
    .single()

  if (updateError || !student) {
    return new Response(JSON.stringify({ error: "Failed to deactivate student in SMS" }), { status: 500 })
  }

  // 2. Call Attendance System to deactivate
  if (student.attendance_code) {
    try {
      const response = await fetch(`${ATTENDANCE_SYSTEM_URL}/deactivate-student`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${ATTENDANCE_TOKEN}`
        },
        body: JSON.stringify({
          attendance_code: student.attendance_code
        })
      })

      if (!response.ok) {
        console.error("Failed to deactivate student in Attendance System:", await response.text())
        // We still return 200 because SMS is updated, but log the error
      }
    } catch (e) {
      console.error("Error calling Attendance System:", e)
    }
  }

  return new Response(JSON.stringify({ success: true }), { status: 200 })
})
