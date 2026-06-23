import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const ATTENDANCE_SYSTEM_URL = Deno.env.get('ATTENDANCE_SYSTEM_URL')
const ATTENDANCE_TOKEN = Deno.env.get('ATTENDANCE_TOKEN')
const ATTENDANCE_ANON_KEY = Deno.env.get('ATTENDANCE_ANON_KEY') || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Ind1emxpb2R2ZGR6bWhlaGZmcWZ4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzY4NTkxNTEsImV4cCI6MjA5MjQzNTE1MX0.0ASY-NuhdHPhyg9pB2XYiXOLJTnrocXxjkC6gpqO_vQ'
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
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Content-Type': 'application/json'
  }

  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const url = new URL(req.url)

    const authHeader = req.headers.get('Authorization') || ''
    const token = authHeader.replace('Bearer ', '')
    
    let caller_tenant_id: string | null = null
    let isSuperAdmin = false
    
    if (token && authHeader.includes('eyJhbGciOi')) {
      try {
        const claims = parseJwt(token)
        if (claims) {
          if (claims.user_role === 'SuperAdmin') {
            isSuperAdmin = true;
          }
          if (claims.tenant_id) {
            caller_tenant_id = claims.tenant_id
          }
        }
      } catch (e) {}
    }

    const { student_id } = await req.json()
    if (!student_id) {
      return new Response(JSON.stringify({ error: 'student_id is required' }), { status: 400, headers: corsHeaders })
    }

    const supabase = createClient(SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY!)

    // 1. Get student details before deletion
    const { data: student, error: fetchError } = await supabase
      .from('students')
      .select('attendance_code, legacy_student_id, name, tenant_id')
      .eq('student_id', student_id)
      .maybeSingle()

    if (fetchError) throw fetchError

    // Enforce tenant isolation
    if (!isSuperAdmin) {
      if (!caller_tenant_id || (student && student.tenant_id && student.tenant_id !== caller_tenant_id)) {
        return new Response(JSON.stringify({ error: 'Forbidden: You do not have permission to delete this student' }), { status: 403, headers: corsHeaders })
      }
    }

    console.log(`[DeleteStudentAttendance] Processing deletion for: ${student_id}`, student)

    // 2. Cascade delete all related records from SMS cloud
    const cascadeTables = [
      'attendance',
      'attendance_records',
      'scores',
      'payments',
      'cbt_results',
      'parent_links',
      'student_analytics',
      'pins'
    ]

    for (const table of cascadeTables) {
      const { error } = await supabase.from(table).delete().eq('student_id', student_id)
      if (error) {
        console.warn(`[DeleteStudentAttendance] Failed to cascade delete from ${table}:`, error.message)
      } else {
        console.log(`[DeleteStudentAttendance] Cascade deleted from ${table}`)
      }
    }

    // Delete linked profiles (student portal accounts)
    await supabase.from('profiles').delete().eq('assigned_id', student_id)

    // 3. Delete the student record itself from SMS cloud
    const { error: deleteError } = await supabase
      .from('students')
      .delete()
      .eq('student_id', student_id)

    if (deleteError) {
      console.error(`[DeleteStudentAttendance] Failed to delete student from SMS cloud:`, deleteError)
    }

    // 4. Notify the external Attendance System (biometric system)
    if (student && (student.attendance_code || student.legacy_student_id)) {
      if (!ATTENDANCE_SYSTEM_URL || !ATTENDANCE_TOKEN) {
        console.warn('[DeleteStudentAttendance] Attendance System not configured, skipping external notification.')
      } else {
        const baseUrl = ATTENDANCE_SYSTEM_URL.endsWith('/') ? ATTENDANCE_SYSTEM_URL.slice(0, -1) : ATTENDANCE_SYSTEM_URL

        // Try to deactivate in the external attendance system
        try {
          const response = await fetch(`${baseUrl}/functions/v1/deactivate-student`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${ATTENDANCE_TOKEN}`
            },
            body: JSON.stringify({
              attendance_code: student.attendance_code,
              student_id: student.legacy_student_id || student_id,
              tenant_id: student.tenant_id
            })
          })

          if (!response.ok) {
            console.error(`[DeleteStudentAttendance] External system deactivation failed: ${await response.text()}`)
          } else {
            console.log(`[DeleteStudentAttendance] External Attendance System notified successfully.`)
          }
        } catch (err) {
          console.error('[DeleteStudentAttendance] External Attendance System call failed:', err.message)
        }

        // Also try to delete attendance records from the external system
        try {
          const identifier = student.legacy_student_id || student.attendance_code
          if (identifier) {
            const queryField = /^\d+$/.test(String(identifier)) && String(identifier).length <= 6 ? 'code' : 'id'
            const deleteUrl = `${baseUrl}/rest/v1/attendance?student_${queryField}=eq.${identifier}`

            const delResponse = await fetch(deleteUrl, {
              method: 'DELETE',
              headers: {
                'apikey': ATTENDANCE_ANON_KEY,
                'Authorization': `Bearer ${ATTENDANCE_ANON_KEY}`,
                'Prefer': 'return=minimal'
              }
            })

            if (delResponse.ok) {
              console.log(`[DeleteStudentAttendance] External attendance records deleted.`)
            } else {
              console.warn(`[DeleteStudentAttendance] External attendance record deletion returned: ${delResponse.status}`)
            }
          }
        } catch (err) {
          console.warn('[DeleteStudentAttendance] External attendance record cleanup failed:', err.message)
        }
      }
    }

    return new Response(JSON.stringify({
      success: true,
      student_id,
      student_name: student?.name || 'Unknown'
    }), { status: 200, headers: corsHeaders })

  } catch (error) {
    console.error('[DeleteStudentAttendance] Fatal error:', error.message)
    return new Response(JSON.stringify({ error: error.message }), {
      headers: corsHeaders,
      status: 500,
    })
  }
})
