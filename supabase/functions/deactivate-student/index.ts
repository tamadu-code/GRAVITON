import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const ATTENDANCE_SYSTEM_URL = Deno.env.get('ATTENDANCE_SYSTEM_URL')
const ATTENDANCE_TOKEN = Deno.env.get('ATTENDANCE_TOKEN')
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
  try {
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
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

    // 1. Get student details
    const { data: student, error: fetchError } = await supabase
      .from('students')
      .select('attendance_code, tenant_id')
      .eq('student_id', student_id)
      .single()

    if (fetchError || !student) throw new Error('Student not found')

    // Enforce tenant isolation
    if (!isSuperAdmin) {
      if (!caller_tenant_id || (student.tenant_id && student.tenant_id !== caller_tenant_id)) {
        return new Response(JSON.stringify({ error: 'Forbidden: You do not have permission to deactivate this student' }), { status: 403 })
      }
    }

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
