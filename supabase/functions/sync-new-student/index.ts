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

    // Call Attendance System
    const baseUrl = ATTENDANCE_SYSTEM_URL.endsWith('/') ? ATTENDANCE_SYSTEM_URL.slice(0, -1) : ATTENDANCE_SYSTEM_URL;
    const apiUrl = `${baseUrl}/rest/v1/students`;
    
    console.log(`Calling Attendance System at: ${apiUrl}`);

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
        class: record.class_name,
        student_id: record.student_id
      }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ message: 'Could not parse error response' }));
      console.error(`Attendance System Error [${response.status}]:`, errorData);
      throw new Error(`Failed to create student in Attendance System: ${JSON.stringify(errorData)}`);
    }

    const responseData = await response.json();
    console.log('Attendance System Response:', responseData);
    
    // Use 'code' from the response (as confirmed by user)
    const attendance_code = responseData[0]?.code;
    
    if (!attendance_code) {
        throw new Error('Attendance system did not return a biometric code');
    }

    const newStudentId = `NKQMS-${admissionYear}-${attendance_code}`;
    console.log(`Generated Final Student ID: ${newStudentId}`);

    // Update student in SMS
    const { error: updateError } = await supabase
      .from('students')
      .update({ 
        attendance_code, 
        student_id: newStudentId,
        legacy_student_id: currentStudentId // Preserve old ID
      })
      .eq('student_id', currentStudentId);

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
