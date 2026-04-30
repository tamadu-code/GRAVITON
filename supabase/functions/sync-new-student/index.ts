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

    // Build Attendance System URL
    const baseUrl = ATTENDANCE_SYSTEM_URL.endsWith('/') ? ATTENDANCE_SYSTEM_URL.slice(0, -1) : ATTENDANCE_SYSTEM_URL

    // SAFETY: Check if student already exists in Attendance System
    const checkUrl = `${baseUrl}/rest/v1/students?name=eq.${encodeURIComponent(record.name)}&select=code`
    console.log(`Checking if student exists at: ${checkUrl}`)
    
    const checkResponse = await fetch(checkUrl, {
      headers: {
        'apikey': ATTENDANCE_TOKEN,
        'Authorization': `Bearer ${ATTENDANCE_TOKEN}`,
      },
    })

    if (checkResponse.ok) {
      const existing = await checkResponse.json()
      if (existing.length > 0 && existing[0].code) {
        // Student already exists in Attendance System — just grab their code
        const attendance_code = existing[0].code
        console.log(`Student already exists with code ${attendance_code}. Updating SMS only.`)
        
        const { error: updateError } = await supabase
          .from('students')
          .update({ attendance_code })
          .eq('student_id', record.student_id)

        if (updateError) throw updateError

        return new Response(JSON.stringify({ success: true, attendance_code, existed: true }), {
          headers: { 'Content-Type': 'application/json' },
          status: 200,
        })
      }
    }

    // Student does NOT exist — create them
    const apiUrl = `${baseUrl}/rest/v1/students`
    console.log(`Creating student at: ${apiUrl}`)

    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'apikey': ATTENDANCE_TOKEN,
        'Authorization': `Bearer ${ATTENDANCE_TOKEN}`,
        'Content-Type': 'application/json',
        'Prefer': 'return=representation,resolution=merge-duplicates'
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
    
    const attendance_code = responseData[0]?.code
    
    if (!attendance_code) {
      throw new Error('Attendance system did not return a biometric code')
    }

    console.log(`Received biometric code: ${attendance_code}`)

    // CALCULATE NEW ID: NKQMS-YEAR-CODE
    const year = record.admission_year || new Date().getFullYear()
    const new_student_id = `NKQMS-${year}-${attendance_code}`

    console.log(`Renaming student ID from ${record.student_id} to ${new_student_id}`)

    // PERFORM ATOMIC RENAME (Update references first)
    // We do this in order to maintain data integrity
    await supabase.from('scores').update({ student_id: new_student_id }).eq('student_id', record.student_id)
    await supabase.from('attendance_records').update({ student_id: new_student_id }).eq('student_id', record.student_id)
    
    // Finally update the student record itself (including the ID)
    const { error: updateError } = await supabase
      .from('students')
      .update({ 
        student_id: new_student_id,
        attendance_code: attendance_code 
      })
      .eq('student_id', record.student_id)

    if (updateError) throw updateError

    console.log(`Successfully synced and renamed ${record.name} to ${new_student_id}`)

    return new Response(JSON.stringify({ success: true, attendance_code, new_student_id }), {
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
