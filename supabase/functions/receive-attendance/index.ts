import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')

serve(async (req) => {
  // Accept requests authenticated with either the service_role key or a custom webhook secret
  const authHeader = req.headers.get('Authorization')
  const WEBHOOK_SECRET = Deno.env.get('WEBHOOK_SECRET')

  const isAuthorized = 
    authHeader === `Bearer ${SUPABASE_SERVICE_ROLE_KEY}` ||
    (WEBHOOK_SECRET && authHeader === `Bearer ${WEBHOOK_SECRET}`)

  if (!isAuthorized) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 })
  }

  try {
    const payload = await req.json()
    const record = payload.record || payload

    console.log('Received attendance data:', JSON.stringify(record))

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

    // The Attendance System sends: student_id (their UUID), date, sign_in, sign_out, is_late
    // We need to find the student's code from the Attendance System, then match it to SMS

    // Step 1: We receive the attendance_code directly (mapped by the trigger)
    const attendance_code = record.attendance_code || record.code
    const date = record.date
    const sign_in = record.sign_in
    const sign_out = record.sign_out
    const is_late = record.is_late

    if (!attendance_code || !date) {
      console.error('Missing required fields: attendance_code or date')
      return new Response(JSON.stringify({ error: 'Missing attendance_code or date' }), { status: 400 })
    }

    // Step 2: Find student in SMS by attendance_code
    const { data: student, error: fetchError } = await supabase
      .from('students')
      .select('student_id, name, is_active')
      .eq('attendance_code', parseInt(attendance_code))
      .single()

    if (fetchError || !student) {
      console.error(`Student with code ${attendance_code} not found in SMS`)
      return new Response(JSON.stringify({ error: `Student not found for code ${attendance_code}` }), { status: 404 })
    }

    console.log(`Matched student: ${student.name} (${student.student_id})`)

    // Step 3: Determine status from sign_in/sign_out data
    let status = 'Absent'
    if (sign_in) {
      status = is_late ? 'Late' : 'Present'
    }

    // Step 4: Upsert attendance record in SMS
    const { error: upsertError } = await supabase
      .from('attendance_records')
      .upsert({
        student_id: student.student_id,
        date: date,
        status: status,
        updated_at: new Date().toISOString()
      }, { onConflict: 'student_id,date' })

    if (upsertError) {
      console.error('Failed to upsert attendance:', upsertError)
      throw upsertError
    }

    console.log(`Attendance recorded: ${student.name} → ${status} on ${date}`)

    return new Response(JSON.stringify({ 
      success: true, 
      student: student.name, 
      status, 
      date 
    }), {
      headers: { 'Content-Type': 'application/json' },
      status: 200,
    })

  } catch (error) {
    console.error('Error in receive-attendance:', error.message)
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { 'Content-Type': 'application/json' },
      status: 500,
    })
  }
})
