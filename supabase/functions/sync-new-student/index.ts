import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const ATTENDANCE_SYSTEM_URL = Deno.env.get("ATTENDANCE_SYSTEM_URL")
const ATTENDANCE_TOKEN = Deno.env.get("ATTENDANCE_TOKEN")
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")

serve(async (req) => {
  const { student_id_internal } = await req.json()

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

  // 1. Fetch student details
  const { data: student, error: fetchError } = await supabase
    .from('students')
    .select('*')
    .eq('id', student_id_internal)
    .single()

  if (fetchError || !student) {
    return new Response(JSON.stringify({ error: "Student not found" }), { status: 404 })
  }

  // 2. Call Attendance System with retries
  let attendanceData;
  let attempts = 0;
  const maxAttempts = 3;

  while (attempts < maxAttempts) {
    try {
      const response = await fetch(`${ATTENDANCE_SYSTEM_URL}/create-student`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${ATTENDANCE_TOKEN}`
        },
        body: JSON.stringify({
          name: student.name,
          class: student.class,
          sub_class: student.sub_class
        })
      })

      if (response.ok) {
        attendanceData = await response.json()
        break
      }
    } catch (e) {
      console.error(`Attempt ${attempts + 1} failed:`, e)
    }
    
    attempts++
    if (attempts < maxAttempts) {
      await new Promise(resolve => setTimeout(resolve, Math.pow(2, attempts) * 1000))
    }
  }

  if (!attendanceData) {
    return new Response(JSON.stringify({ error: "Failed to sync with Attendance System after retries" }), { status: 500 })
  }

  // 3. Update SMS student record
  const newStudentId = `NKQMS-${student.admission_year}-${attendanceData.attendance_code}`
  
  const { error: updateError } = await supabase
    .from('students')
    .update({
      attendance_code: attendanceData.attendance_code,
      student_id: newStudentId, // Updating the main student_id column to the new format
      legacy_student_id: student.student_id // Moving old ID to legacy if not already there
    })
    .eq('id', student_id_internal)

  if (updateError) {
    return new Response(JSON.stringify({ error: "Failed to update student in SMS" }), { status: 500 })
  }

  return new Response(JSON.stringify({ success: true, student_id: newStudentId }), { status: 200 })
})
