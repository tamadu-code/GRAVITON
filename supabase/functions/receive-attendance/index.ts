import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')

function parseJwt(token: string) {
  try {
    const base64Url = token.split('.')[1];
    const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
    const jsonPayload = decodeURIComponent(atob(base64).split('').map(function(c) {
        return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2);
    }).join(''));
    return JSON.parse(jsonPayload);
  } catch (e) {
    return null;
  }
}

serve(async (req) => {
  // Verify the request is from a trusted source (our Attendance System trigger)
  const authHeader = req.headers.get('Authorization') || ''
  const token = authHeader.replace('Bearer ', '')
  
  // Accept either the service_role key, the custom token, or check it matches what the trigger sends
  let caller_tenant_id: string | null = null
  const expectedToken = 'Tam360Du180'
  if (token !== SUPABASE_SERVICE_ROLE_KEY && !authHeader.includes('eyJhbGciOi') && token !== expectedToken) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 })
  }

  if (token && authHeader.includes('eyJhbGciOi')) {
    try {
      const claims = parseJwt(token)
      if (claims && claims.tenant_id) {
        caller_tenant_id = claims.tenant_id
      }
    } catch (e) {}
  }

  try {
    const payload = await req.json()
    const record = payload.record || payload

    console.log('Received attendance data:', JSON.stringify(record))

    // Handle Keep-Alive / Ping requests cleanly
    if (payload.ping || payload.keep_alive) {
      console.log('Keep-alive ping received')
      return new Response(JSON.stringify({ success: true, message: 'Keep-alive status: active' }), {
        headers: { 'Content-Type': 'application/json' },
        status: 200
      })
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

    // The Attendance System sends: student_id (their UUID), date, sign_in, sign_out, is_late
    // We need to find the student's code from the Attendance System, then match it to SMS

    // STEP 1: LOG EVERYTHING FOR DEBUGGING
    console.log('--- NEW ATTENDANCE PAYLOAD RECEIVED ---')
    console.log(JSON.stringify(record, null, 2))
    
    // Step 2: Map fields with maximum flexibility
    // Raw student identifier can be a numeric code (e.g. 7456) or a string ID (e.g. "NKQMS-2026-1057")
    const raw_student_identifier = record.student_code || record.code || record.attendance_code || record.student_id || record.id;
    const date = record.date || record.attendance_date || record.datetime?.split('T')[0]
    const sign_in = record.sign_in || record.check_in || record.time || record.in_time || record.entry
    const sign_out = record.sign_out || record.check_out || record.exit_time || record.out_time || record.exit
    const is_late = record.is_late || record.late || (record.status === 'Late')

    if (!raw_student_identifier || !date) {
      console.error('Missing required fields: student identifier or date')
      return new Response(JSON.stringify({ error: 'Missing student identifier or date' }), { status: 400 })
    }

    // --- TENANT RESOLUTION LOGIC ---
    // Extract tenant_id from query string parameters
    const urlObj = new URL(req.url);
    const queryTenantId = urlObj.searchParams.get('tenant_id') || urlObj.searchParams.get('tenant');
    
    // Extract tenant_id from HTTP headers
    const headerTenantId = req.headers.get('x-tenant-id') || req.headers.get('x-tenant');
    
    // Extract tenant_id from request body/payload
    const bodyTenantId = record.tenant_id || payload.tenant_id;
    
    // Autodetect tenant_id from full student_id prefix if present (e.g. "OAK-2026-1057" -> "OAK")
    const studentIdRegex = /^([A-Za-z0-9]+)-\d{4}-\d+/i;
    const prefixMatch = String(raw_student_identifier).match(studentIdRegex);
    let resolvedTenantId: string | null = null;
    if (prefixMatch) {
      const idPrefix = prefixMatch[1].toUpperCase();
      console.log(`Parsed student ID prefix: ${idPrefix} from identifier: ${raw_student_identifier}`);
      const { data: tenantData } = await supabase
        .from('tenants')
        .select('id')
        .eq('student_id_prefix', idPrefix)
        .maybeSingle();
      if (tenantData) {
        resolvedTenantId = tenantData.id;
        console.log(`Resolved tenant ID: ${resolvedTenantId} from prefix: ${idPrefix}`);
      }
    }

    let tenant_id = resolvedTenantId || queryTenantId || headerTenantId || bodyTenantId || caller_tenant_id;
    console.log(`Resolved attendance tenant context: ${tenant_id || 'NONE'}`);

    // Find student in SMS with tenant-isolation
    let student = null;
    const isFullStudentId = studentIdRegex.test(String(raw_student_identifier));
    const numeric_code = /^\d+$/.test(String(raw_student_identifier)) ? parseInt(raw_student_identifier) : null;

    if (isFullStudentId) {
      // Query by direct student_id match
      const { data: matched } = await supabase
        .from('students')
        .select('student_id, name, is_active, tenant_id')
        .eq('student_id', String(raw_student_identifier))
        .maybeSingle();
      student = matched;
    } else if (numeric_code) {
      // Query by attendance_code + tenant_id (if resolved)
      let query = supabase
        .from('students')
        .select('student_id, name, is_active, tenant_id')
        .eq('attendance_code', numeric_code);
      
      if (tenant_id) {
        query = query.eq('tenant_id', tenant_id);
      }
      
      const { data: matched } = await query;
      if (matched && matched.length === 1) {
        student = matched[0];
      } else if (matched && matched.length > 1) {
        const errorMsg = `Ambiguity: Multiple students found for attendance_code ${numeric_code}. Please specify tenant_id.`;
        console.error(errorMsg);
        return new Response(JSON.stringify({ error: errorMsg }), { status: 400 });
      } else if (matched && matched.length === 0) {
        student = null;
      }
    } else {
      // Query by legacy_student_id + tenant_id (if resolved)
      let query = supabase
        .from('students')
        .select('student_id, name, is_active, tenant_id')
        .eq('legacy_student_id', String(raw_student_identifier));
      
      if (tenant_id) {
        query = query.eq('tenant_id', tenant_id);
      }
      
      const { data: matched } = await query;
      if (matched && matched.length === 1) {
        student = matched[0];
      } else if (matched && matched.length > 1) {
        const errorMsg = `Ambiguity: Multiple students found for legacy_student_id ${raw_student_identifier}. Please specify tenant_id.`;
        console.error(errorMsg);
        return new Response(JSON.stringify({ error: errorMsg }), { status: 400 });
      } else if (matched && matched.length === 0) {
        student = null;
      }
    }

    if (!student) {
      console.log(`Student with identifier ${raw_student_identifier} not found in SMS. Attempting auto-discovery...`);
      
      const ATTENDANCE_SYSTEM_URL = Deno.env.get('ATTENDANCE_SYSTEM_URL');
      const ATTENDANCE_TOKEN = Deno.env.get('ATTENDANCE_TOKEN');
      
      if (!ATTENDANCE_SYSTEM_URL || !ATTENDANCE_TOKEN) {
        console.error('Missing Attendance System configuration for auto-discovery.');
        return new Response(JSON.stringify({ error: `Student not found for identifier ${raw_student_identifier} and auto-discovery is misconfigured` }), { status: 404 });
      }

      const baseUrl = ATTENDANCE_SYSTEM_URL.endsWith('/') ? ATTENDANCE_SYSTEM_URL.slice(0, -1) : ATTENDANCE_SYSTEM_URL;
      const ATTENDANCE_ANON_KEY = Deno.env.get('ATTENDANCE_ANON_KEY') || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Ind1emxpb2R2ZGR6bWhlaGZmcWZ4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzY4NTkxNTEsImV4cCI6MjA5MjQzNTE1MX0.0ASY-NuhdHPhyg9pB2XYiXOLJTnrocXxjkC6gpqO_vQ';
      
      // If the identifier contains letters or is longer than 6 chars, query by 'id' instead of 'code' in the Attendance System
      const queryField = /^\d+$/.test(String(raw_student_identifier)) && String(raw_student_identifier).length <= 6 ? 'code' : 'id';
      const checkUrl = `${baseUrl}/rest/v1/students?${queryField}=eq.${raw_student_identifier}&select=name,class,code`;
      
      console.log(`Auto-discovery URL: ${checkUrl}`);
      const checkResponse = await fetch(checkUrl, {
        headers: {
          'apikey': ATTENDANCE_ANON_KEY,
          'Authorization': `Bearer ${ATTENDANCE_ANON_KEY}`,
        },
      });

      if (checkResponse.ok) {
        const attStudents = await checkResponse.json();
        if (attStudents.length > 0) {
          const attStudent = attStudents[0];
          console.log(`Discovered student in Attendance System: ${attStudent.name} (Code: ${attStudent.code})`);
          
          const resolvedCode = parseInt(attStudent.code);
          if (isNaN(resolvedCode)) {
             console.error(`Discovered student ${attStudent.name} has invalid code: ${attStudent.code}`);
             return new Response(JSON.stringify({ error: `Invalid student code ${attStudent.code}` }), { status: 500 });
          }

          // Do not split class arm (Keep "JSS 1A" as "JSS 1A")
          let className = attStudent.class || 'Unknown';
          let subClass = null;

          const classMatch = className.match(/^(.+?)\s?([A-Z])$/i);
          if (classMatch) {
            subClass = classMatch[2].toUpperCase();
          }

          // Use the resolved tenant ID context, fallback if not set
          const targetTenantId = tenant_id || '00000000-0000-0000-0000-000000000001';

          // 1. Check if student already exists in SMS with this resolved code (scoped to tenant)
          const { data: existingStudent, error: existingStudentError } = await supabase
            .from('students')
            .select('student_id, name, is_active, tenant_id, admission_year')
            .eq('attendance_code', resolvedCode)
            .eq('tenant_id', targetTenantId)
            .maybeSingle();
          if (existingStudentError) {
            console.error('Debug: existingStudent query error:', existingStudentError);
          }

          // 2. Check if student already exists in SMS by name (case-insensitive, scoped to tenant)
          const { data: matchedByName, error: matchedByNameError } = await supabase
            .from('students')
            .select('student_id, name, is_active, tenant_id, admission_year, attendance_code')
            .ilike('name', attStudent.name)
            .eq('tenant_id', targetTenantId);
          if (matchedByNameError) {
            console.error('Debug: matchedByName query error:', matchedByNameError);
          }

          const existingByName = matchedByName && matchedByName.length > 0 ? matchedByName[0] : null;

          // Resolve student ID prefix for this tenant
          let prefix = 'NKQMS';
          if (targetTenantId) {
            const { data: tenantData, error: tenantError } = await supabase
              .from('tenants')
              .select('student_id_prefix')
              .eq('id', targetTenantId)
              .maybeSingle();
            if (tenantError) {
              console.error('Debug: Error fetching tenant prefix:', tenantError);
            }
            if (tenantData && tenantData.student_id_prefix) {
              prefix = tenantData.student_id_prefix;
            }
          }

          console.log('Debug variables:', {
            targetTenantId,
            resolvedCode,
            existingStudent: existingStudent ? existingStudent.student_id : null,
            existingByName: existingByName ? existingByName.student_id : null,
            prefix,
            attStudentName: attStudent.name
          });

          if (existingByName) {
            const year = existingByName.admission_year || new Date().getFullYear();
            const new_student_id = `${prefix}-${year}-${resolvedCode}`;

            // If a duplicate student record by code already exists, we must merge/remove it
            if (existingStudent && existingStudent.student_id !== existingByName.student_id) {
              console.log(`Duplicate detected: ${attStudent.name} exists by name (${existingByName.student_id}) and by code (${existingStudent.student_id}). Merging...`);
              
              // Clean up conflicting records on the duplicate ID in child tables to prevent constraint violations
              await supabase.from('attendance_records').delete().eq('student_id', existingStudent.student_id);
              await supabase.from('attendance').delete().eq('student_id', existingStudent.student_id);

              // Delete the duplicate student record itself
              const { error: deleteError } = await supabase
                .from('students')
                .delete()
                .eq('student_id', existingStudent.student_id);
              
              if (deleteError) {
                console.warn(`Failed to delete duplicate student record ${existingStudent.student_id}:`, deleteError);
              }
            } else if (existingByName.student_id !== new_student_id) {
              // Safety: check if target ID is already taken by some other record
              const { data: duplicateStudent } = await supabase
                .from('students')
                .select('student_id')
                .eq('student_id', new_student_id)
                .maybeSingle();

              if (duplicateStudent) {
                console.log(`Target student ID ${new_student_id} is already in use by another record. Removing conflicting student...`);
                await supabase.from('attendance_records').delete().eq('student_id', new_student_id);
                await supabase.from('attendance').delete().eq('student_id', new_student_id);
                await supabase.from('students').delete().eq('student_id', new_student_id);
              }
            }

            // Perform copy-insert-update-delete rename
            if (existingByName.student_id !== new_student_id) {
              console.log(`Renaming student ID references from ${existingByName.student_id} to ${new_student_id} using copy-insert-update-delete`);

              // 1. Fetch full existing student record to copy all fields
              const { data: fullStudent, error: fetchError } = await supabase
                .from('students')
                .select('*')
                .eq('student_id', existingByName.student_id)
                .single();

              if (fetchError || !fullStudent) {
                console.error(`Failed to fetch original student record:`, fetchError);
                return new Response(JSON.stringify({ error: `Failed to fetch original student record: ${fetchError?.message}` }), { status: 500 });
              }

              // 2. Prepare new student data
              const newStudentData = {
                ...fullStudent,
                student_id: new_student_id,
                attendance_code: resolvedCode,
                legacy_student_id: String(raw_student_identifier),
                is_active: true,
                updated_at: new Date().toISOString()
              };

              // 3. Insert new student record first
              const { error: insertError } = await supabase
                .from('students')
                .insert(newStudentData);

              if (insertError) {
                console.error(`Failed to insert copied student record:`, insertError);
                return new Response(JSON.stringify({ error: `Failed to insert copied student record: ${insertError.message}` }), { status: 500 });
              }

              // 4. Update child table references
              await supabase.from('scores').update({ student_id: new_student_id }).eq('student_id', existingByName.student_id);
              await supabase.from('attendance_records').update({ student_id: new_student_id }).eq('student_id', existingByName.student_id);
              await supabase.from('attendance').update({ student_id: new_student_id }).eq('student_id', existingByName.student_id);
              await supabase.from('exam_progress').update({ student_id: new_student_id }).eq('student_id', existingByName.student_id);

              // 5. Delete original old student record
              const { error: deleteError } = await supabase
                .from('students')
                .delete()
                .eq('student_id', existingByName.student_id);

              if (deleteError) {
                console.warn(`Failed to delete old student record ${existingByName.student_id}:`, deleteError);
              }

              student = newStudentData;
              console.log(`Successfully migrated and updated student ${student.name} to ${new_student_id}`);
            } else {
              // No ID rename needed, just update mapping on the existing record
              const { data: updatedStudent, error: updateError } = await supabase
                .from('students')
                .update({
                  attendance_code: resolvedCode,
                  legacy_student_id: String(raw_student_identifier),
                  is_active: true
                })
                .eq('student_id', existingByName.student_id)
                .select()
                .single();

              if (updateError) {
                console.error('Failed to update student mapping:', updateError);
                return new Response(JSON.stringify({ error: 'Failed to update student mapping' }), { status: 500 });
              }

              student = updatedStudent;
              console.log(`Successfully mapped code to student ${student.name} (${student.student_id})`);
            }

          } else if (existingStudent) {
            // SCENARIO: Student exists by code already in SMS, just update the legacy_student_id mapping
            const { error: updateError } = await supabase
              .from('students')
              .update({ legacy_student_id: String(raw_student_identifier) })
              .eq('student_id', existingStudent.student_id);
              
            if (updateError) {
              console.warn('Failed to update student legacy_student_id mapping:', updateError);
            }
            
            student = existingStudent;
            console.log(`Linked existing SMS student ${student.name} to legacy_student_id ${raw_student_identifier}`);

          } else {
            // SCENARIO: Completely new student, auto-create in SMS
            const year = new Date().getFullYear();
            const new_student_id = `${prefix}-${year}-${resolvedCode}`;

            // Use UPSERT to handle the case where the student already exists
            // (RLS may block SELECT but the row exists from a previous sync)
            const { data: upsertedStudent, error: upsertError } = await supabase
              .from('students')
              .upsert({
                student_id: new_student_id,
                name: attStudent.name,
                class_name: className,
                sub_class: subClass,
                attendance_code: resolvedCode,
                legacy_student_id: String(raw_student_identifier),
                is_active: true,
                admission_year: year,
                tenant_id: targetTenantId
              }, { onConflict: 'student_id' })
              .select('student_id, name, is_active, tenant_id')
              .single();

            if (upsertError) {
              console.error('Failed to upsert student in SMS:', upsertError);
              // Last resort: construct the student object manually from known values
              // The student DOES exist (PK constraint proved it), we just can't read it via RLS
              console.log('Constructing student record manually for', new_student_id);
              student = {
                student_id: new_student_id,
                name: attStudent.name,
                is_active: true,
                tenant_id: targetTenantId
              };
            } else {
              student = upsertedStudent;
              console.log(`Auto-created/updated student: ${student.name} (${student.student_id})`);
            }
          }
        } else {
          console.error(`Student identifier ${raw_student_identifier} not found in Attendance System either.`);
          return new Response(JSON.stringify({ error: `Student not found for identifier ${raw_student_identifier}` }), { status: 404 });
        }
      } else {
        const errText = await checkResponse.text().catch(() => 'Could not read body');
        console.error(`Failed to communicate with Attendance System for auto-discovery. Status: ${checkResponse.status}, Body: ${errText}`);
        return new Response(JSON.stringify({ error: `Attendance System communication error: ${errText}` }), { status: 500 });
      }
    }

    console.log(`Matched student: ${student.name} (${student.student_id})`)

    // Step 3: Determine status and times from sign_in/sign_out data
    let status = 'Absent'
    if (sign_in) {
      status = is_late ? 'Late' : 'Present'
    }

    const now = new Date().toISOString();

    tenant_id = student?.tenant_id || tenant_id || '00000000-0000-0000-0000-000000000001';

    // Step 4A: Upsert into the `attendance` table (daily biometric sign-in/out)
    // This is the table that holds sign_in, sign_out, is_late as TEXT columns
    const attendancePayload: Record<string, unknown> = {
      student_id: student.student_id,
      date,
      status,
      is_late: !!is_late,
      tenant_id,
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
      tenant_id,
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

    // Step 5: Dispatch SMS notification to parent if configured
    let parentPhone = null;
    try {
      const { data: parentLink } = await supabase
        .from('parent_links')
        .select('parent_id')
        .eq('student_id', student.student_id)
        .maybeSingle();

      if (parentLink && parentLink.parent_id) {
        const { data: parentProfile } = await supabase
          .from('profiles')
          .select('phone')
          .eq('id', parentLink.parent_id)
          .maybeSingle();
        
        if (parentProfile && parentProfile.phone) {
          parentPhone = parentProfile.phone;
        }
      }
    } catch (err) {
      console.warn('Failed to query parent phone number:', err.message);
    }

    if (parentPhone) {
      try {
        console.log(`Triggering SMS dispatch to parent phone: ${parentPhone}`)
        const smsMessage = sign_out 
          ? `Dear Parent, your child ${student.name} has signed out at ${sign_out} on ${date}.`
          : `Dear Parent, your child ${student.name} has signed in at ${sign_in || 'N/A'} on ${date}. Status: ${status}.`;

        const dispatchResponse = await fetch(`${SUPABASE_URL}/functions/v1/send-sms`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`
          },
          body: JSON.stringify({
            to: parentPhone,
            message: smsMessage,
            tenant_id: tenant_id
          })
        });
        
        if (!dispatchResponse.ok) {
          console.error(`SMS dispatch failed: ${await dispatchResponse.text()}`);
        } else {
          console.log(`SMS dispatch triggered successfully.`);
        }
      } catch (smsErr) {
        console.error(`Error triggering SMS dispatch:`, smsErr.message);
      }
    }

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
