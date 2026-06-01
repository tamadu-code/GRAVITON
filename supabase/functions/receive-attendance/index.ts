import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')

serve(async (req) => {
  // Verify the request is from a trusted source (our Attendance System trigger)
  const authHeader = req.headers.get('Authorization') || ''
  const token = authHeader.replace('Bearer ', '')
  
  // Accept either the service_role key or check it matches what the trigger sends
  if (token !== SUPABASE_SERVICE_ROLE_KEY && !authHeader.includes('eyJhbGciOi')) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 })
  }

  try {
    const payload = await req.json()
    const record = payload.record || payload

    console.log('Received attendance data:', JSON.stringify(record))

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

    // The Attendance System sends: student_id (their UUID), date, sign_in, sign_out, is_late
    // We need to find the student's code from the Attendance System, then match it to SMS

    // STEP 1: LOG EVERYTHING FOR DEBUGGING
    console.log('--- NEW ATTENDANCE PAYLOAD RECEIVED ---')
    console.log(JSON.stringify(record, null, 2))
    
    // Step 2: Map fields with maximum flexibility
    let attendance_code = record.attendance_code || record.code || record.student_code;

    // If not found, try to extract a numeric code from student_id or id
    if (!attendance_code) {
      if (record.student_id && /^\d+$/.test(String(record.student_id))) {
        attendance_code = record.student_id;
      } else if (record.id && /^\d+$/.test(String(record.id))) {
        attendance_code = record.id;
      } else {
        // Ultimate fallback
        attendance_code = record.student_id || record.id;
      }
    }

    const date = record.date || record.attendance_date || record.datetime?.split('T')[0]
    const sign_in = record.sign_in || record.check_in || record.time || record.in_time || record.entry
    const sign_out = record.sign_out || record.check_out || record.exit_time || record.out_time || record.exit
    const is_late = record.is_late || record.late || (record.status === 'Late')

    if (!attendance_code || !date) {
      console.error('Missing required fields: attendance_code or date')
      return new Response(JSON.stringify({ error: 'Missing attendance_code or date' }), { status: 400 })
    }

    // Step 2: Find student in SMS by attendance_code
    const { data: initialStudent, error: fetchError } = await supabase
      .from('students')
      .select('student_id, name, is_active')
      .eq('attendance_code', parseInt(attendance_code))
      .maybeSingle();

    let student = initialStudent;

    if (!student) {
      console.log(`Student with code ${attendance_code} not found in SMS. Attempting auto-discovery...`);
      
      const ATTENDANCE_SYSTEM_URL = Deno.env.get('ATTENDANCE_SYSTEM_URL');
      const ATTENDANCE_TOKEN = Deno.env.get('ATTENDANCE_TOKEN');
      
      if (!ATTENDANCE_SYSTEM_URL || !ATTENDANCE_TOKEN) {
        console.error('Missing Attendance System configuration for auto-discovery.');
        return new Response(JSON.stringify({ error: `Student not found for code ${attendance_code} and auto-discovery is misconfigured` }), { status: 404 });
      }

      const baseUrl = ATTENDANCE_SYSTEM_URL.endsWith('/') ? ATTENDANCE_SYSTEM_URL.slice(0, -1) : ATTENDANCE_SYSTEM_URL;
      const checkUrl = `${baseUrl}/rest/v1/students?code=eq.${attendance_code}&select=name,class`;
      
      const checkResponse = await fetch(checkUrl, {
        headers: {
          'apikey': ATTENDANCE_TOKEN,
          'Authorization': `Bearer ${ATTENDANCE_TOKEN}`,
        },
      });

      if (checkResponse.ok) {
        const attStudents = await checkResponse.json();
        if (attStudents.length > 0) {
          const attStudent = attStudents[0];
          console.log(`Discovered student in Attendance System: ${attStudent.name}`);
          
          // Do not split class arm (Keep "JSS 1A" as "JSS 1A")
          let className = attStudent.class || 'Unknown';
          let subClass = null;

          // Note: If you still want to parse the subclass for the `sub_class` field without modifying the main class_name, you could do it here:
          const classMatch = className.match(/^(.+?)\s?([A-Z])$/i);
          if (classMatch) {
            subClass = classMatch[2].toUpperCase();
            // We NO LONGER reassign className to classMatch[1] to ensure JSS 1A remains JSS 1A in the dropdowns.
          }

          // Create the student in SMS
          const year = new Date().getFullYear();
          const new_student_id = `NKQMS-${year}-${attendance_code}`;
          
          const { data: newStudent, error: createError } = await supabase
            .from('students')
            .insert({
              student_id: new_student_id,
              name: attStudent.name,
              class_name: className,
              sub_class: subClass,
              attendance_code: parseInt(attendance_code),
              is_active: true,
              admission_year: year
            })
            .select()
            .single();

          if (createError) {
            console.error('Failed to auto-create student in SMS:', createError);
            return new Response(JSON.stringify({ error: 'Failed to auto-create student' }), { status: 500 });
          }
          
          student = newStudent;
          console.log(`Auto-created student: ${student.name} (${student.student_id})`);
        } else {
          console.error(`Student code ${attendance_code} not found in Attendance System either.`);
          return new Response(JSON.stringify({ error: `Student not found for code ${attendance_code}` }), { status: 404 });
        }
      } else {
        console.error('Failed to communicate with Attendance System for auto-discovery.');
        return new Response(JSON.stringify({ error: 'Attendance System communication error' }), { status: 500 });
      }
    }

    console.log(`Matched student: ${student.name} (${student.student_id})`)

    // Step 3: Determine status and times from sign_in/sign_out data
    let status = 'Absent'
    if (sign_in) {
      status = is_late ? 'Late' : 'Present'
    }

    const now = new Date().toISOString();

    // Step 4A: Upsert into the `attendance` table (daily biometric sign-in/out)
    // This is the table that holds sign_in, sign_out, is_late as TEXT columns
    const attendancePayload: Record<string, unknown> = {
      student_id: student.student_id,
      date,
      status,
      is_late: !!is_late,
      updated_at: now
    };
    // Only set sign_in/sign_out if provided, so a sign-out-only update doesn't blank sign_in
    if (sign_in) attendancePayload.sign_in = sign_in;
    if (sign_out) attendancePayload.sign_out = sign_out;

    const { error: dailyError } = await supabase
      .from('attendance')
      .upsert(attendancePayload, {
        onConflict: 'student_id,date'
      });

    if (dailyError) {
      console.error('Failed to upsert daily attendance:', dailyError);
      // Non-fatal: continue to attendance_records even if this fails
    }

    // Step 4B: Upsert into `attendance_records` (detailed / subject-based records)
    const isSubjectBased = !!(record.subject_id || record.subject_name || record.period_id);
    const recordsPayload: Record<string, unknown> = {
      date,
      student_id: student.student_id,
      status,
      subject_name: record.subject_name || record.subject_id || null,
      period_number: record.period_number || record.period_id || null,
      is_subject_based: isSubjectBased,
      updated_at: now
    };
    if (sign_in) recordsPayload.check_in = `${date}T${sign_in}`;
    if (sign_out) recordsPayload.check_out = `${date}T${sign_out}`;

    const { error: upsertError } = await supabase
      .from('attendance_records')
      .upsert(recordsPayload, {
        onConflict: 'student_id,date,is_subject_based,subject_name,period_number'
      });

    if (upsertError) {
      console.error('Failed to upsert attendance_records:', upsertError)
      throw upsertError
    }

    console.log(`Attendance recorded: ${student.name} → ${status} (Out: ${sign_out || 'N/A'}) on ${date}`)

    return new Response(JSON.stringify({ 
      success: true, 
      student: student.name, 
      status, 
      date,
      sign_out
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
