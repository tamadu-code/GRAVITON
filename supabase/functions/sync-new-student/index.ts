import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const ATTENDANCE_SYSTEM_URL = Deno.env.get('ATTENDANCE_SYSTEM_URL')
const ATTENDANCE_TOKEN = Deno.env.get('ATTENDANCE_TOKEN')
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')

serve(async (req) => {
  try {
    const { record } = await req.json()

    // SAFETY: If the student already has an attendance_code, do nothing
    if (record.attendance_code) {
      console.log(`Student ${record.name} already has code ${record.attendance_code}. Skipping.`)
      return new Response(JSON.stringify({ success: true, skipped: true }), {
        headers: { 'Content-Type': 'application/json' },
        status: 200,
      })
    }

    console.log(`Syncing new student: ${record.name}`)

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

    // Call Attendance System
    const baseUrl = ATTENDANCE_SYSTEM_URL.endsWith('/') ? ATTENDANCE_SYSTEM_URL.slice(0, -1) : ATTENDANCE_SYSTEM_URL
    const apiUrl = `${baseUrl}/rest/v1/students`
    
    console.log(`Calling Attendance System at: ${apiUrl}`)

    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'apikey': ATTENDANCE_TOKEN,
        'Authorization': `Bearer ${ATTENDANCE_TOKEN}`,
        'Content-Type': 'application/json',
        'Prefer': 'return=representation'
      },
      body: JSON.stringify({
        name: record.name,
        class: record.class_name
      }),
    })

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ message: 'Could not parse error response' }))
      console.error(`Attendance System Error [${response.status}]:`, errorData)
      throw new Error(`Failed to create student in Attendance System: ${JSON.stringify(errorData)}`)
    }

    const responseData = await response.json()
    console.log('Attendance System Response:', responseData)
    
    // Get the biometric code from the Attendance system
    const attendance_code = responseData[0]?.code
    
    if (!attendance_code) {
      throw new Error('Attendance system did not return a biometric code')
    }

    console.log(`Received biometric code: ${attendance_code}`)

    // SAFE UPDATE: Only update attendance_code. NEVER change student_id.
    const { error: updateError } = await supabase
      .from('students')
      .update({ attendance_code: attendance_code })
      .eq('student_id', record.student_id)

    if (updateError) throw updateError

    console.log(`Successfully synced ${record.name} with code ${attendance_code}`)

    return new Response(JSON.stringify({ success: true, attendance_code }), {
      headers: { 'Content-Type': 'application/json' },
      status: 200,
    })

  } catch (error) {
    console.error('Error in sync-new-student:', error.message)
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { 'Content-Type': 'application/json' },
      status: 500,
    })
  }
})
