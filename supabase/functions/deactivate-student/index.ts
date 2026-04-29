import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const ATTENDANCE_SYSTEM_URL = Deno.env.get('ATTENDANCE_SYSTEM_URL')
const ATTENDANCE_TOKEN = Deno.env.get('ATTENDANCE_TOKEN')
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')

serve(async (req) => {
  try {
    const { student_id } = await req.json()
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

    // 1. Get student attendance_code
    const { data: student, error: fetchError } = await supabase
      .from('students')
      .select('attendance_code')
      .eq('student_id', student_id)
      .single()

    if (fetchError || !student) throw new Error('Student not found')

    // 2. Update SMS (Soft Delete)
    const { error: updateError } = await supabase
      .from('students')
      .update({ is_active: false })
      .eq('student_id', student_id)

    if (updateError) throw updateError

    // 3. Call Attendance System
    if (student.attendance_code) {
      try {
        const response = await fetch(`${ATTENDANCE_SYSTEM_URL}/deactivate-student`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${ATTENDANCE_TOKEN}`
          },
          body: JSON.stringify({ attendance_code: student.attendance_code })
        })

        if (!response.ok) {
          console.error(`Failed to deactivate in Attendance System: ${await response.text()}`)
        }
      } catch (err) {
        console.error('Attendance System call failed:', err.message)
      }
    }

    return new Response(JSON.stringify({ success: true }), {
      headers: { 'Content-Type': 'application/json' },
      status: 200,
    })

  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { 'Content-Type': 'application/json' },
      status: 500,
    })
  }
})
