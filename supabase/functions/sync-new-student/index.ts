import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const ATTENDANCE_SYSTEM_URL = Deno.env.get('ATTENDANCE_SYSTEM_URL')
const ATTENDANCE_TOKEN = Deno.env.get('ATTENDANCE_TOKEN')
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')

serve(async (req) => {
  try {
    const { record } = await req.json()
    const currentStudentId = record.student_id
    const admissionYear = record.admission_year || new Date().getFullYear()

    console.log(`Syncing student ${currentStudentId}...`)

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

    // Call Attendance System with retries
    let response
    let attempts = 0
    const maxAttempts = 3
    
    while (attempts < maxAttempts) {
      try {
        response = await fetch(`${ATTENDANCE_SYSTEM_URL}/create-student`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${ATTENDANCE_TOKEN}`
          },
          body: JSON.stringify({
            name: record.name,
            class: record.class,
            sub_class: record.sub_class
          })
        })
        
        if (response.ok) break
        
      } catch (err) {
        console.error(`Attempt ${attempts + 1} failed:`, err)
      }
      
      attempts++
      if (attempts < maxAttempts) {
        await new Promise(resolve => setTimeout(resolve, Math.pow(2, attempts) * 1000))
      }
    }

    if (!response || !response.ok) {
      const errorText = response ? await response.text() : 'Fetch failed'
      throw new Error(`Failed to create student in Attendance System: ${errorText}`)
    }

    const { attendance_code } = await response.json()
    const newStudentId = `NKQMS-${admissionYear}-${attendance_code}`

    // Update student in SMS
    const { error: updateError } = await supabase
      .from('students')
      .update({ 
        attendance_code, 
        student_id: newStudentId,
        legacy_student_id: currentStudentId // Preserve old ID
      })
      .eq('student_id', currentStudentId)

    if (updateError) throw updateError

    return new Response(JSON.stringify({ success: true, attendance_code, student_id: newStudentId }), {
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
