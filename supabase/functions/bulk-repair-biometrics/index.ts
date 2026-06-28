import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const ATTENDANCE_SYSTEM_URL = Deno.env.get('ATTENDANCE_SYSTEM_URL')
const ATTENDANCE_TOKEN = Deno.env.get('ATTENDANCE_TOKEN')
const ATTENDANCE_ANON_KEY = Deno.env.get('ATTENDANCE_ANON_KEY') || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Ind1emxpb2R2ZGR6bWhlaGZmcWZ4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzY4NTkxNTEsImV4cCI6MjA5MjQzNTE1MX0.0ASY-NuhdHPhyg9pB2XYiXOLJTnrocXxjkC6gpqO_vQ'
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

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
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

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

    // Unless SuperAdmin, we require a valid tenant claim
    if (!isSuperAdmin && !caller_tenant_id) {
      return new Response(JSON.stringify({ error: 'Unauthorized: Missing tenant context' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

    if (!ATTENDANCE_SYSTEM_URL) {
      return new Response(JSON.stringify({ error: 'Biometric system not configured. ATTENDANCE_SYSTEM_URL is not set.' }), {
        status: 503,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }
    
    console.log('Starting optimized bulk arm repair...')

    // 1. Fetch all active students from SMS (scoped to tenant)
    let query = supabase
      .from('students')
      .select('student_id, name, attendance_code, class_name, sub_class, tenant_id')
      .eq('is_active', true)

    if (!isSuperAdmin) {
      query = query.eq('tenant_id', caller_tenant_id)
    } else {
      // SuperAdmin can optionally pass tenant_id in body
      try {
        const body = await req.json()
        if (body && body.tenant_id) {
          query = query.eq('tenant_id', body.tenant_id)
        }
      } catch (e) {}
    }

    const { data: students, error: fetchError } = await query

    if (fetchError) throw fetchError

    console.log(`Analyzing ${students.length} students in parallel batches...`)

    const results = {
      total: students.length,
      updated: 0,
      errors: 0,
      skipped: 0
    }

    const baseUrl = ATTENDANCE_SYSTEM_URL.endsWith('/') ? ATTENDANCE_SYSTEM_URL.slice(0, -1) : ATTENDANCE_SYSTEM_URL
    const BATCH_SIZE = 10;

    for (let i = 0; i < students.length; i += BATCH_SIZE) {
      const batch = students.slice(i, i + BATCH_SIZE);
      console.log(`Processing batch ${Math.floor(i / BATCH_SIZE) + 1} of ${Math.ceil(students.length / BATCH_SIZE)}...`);

      await Promise.all(batch.map(async (student) => {
        try {
          if (!student.attendance_code) {
            results.skipped++
            return
          }

          // Query Biometric System for this student
          const checkUrl = `${baseUrl}/rest/v1/students?code=eq.${student.attendance_code}&select=name,class`
          const response = await fetch(checkUrl, {
            headers: {
              'apikey': ATTENDANCE_ANON_KEY,
              'Authorization': `Bearer ${ATTENDANCE_ANON_KEY}`,
            },
          })

          if (!response.ok) {
            console.warn(`Failed to check student ${student.name} (${student.attendance_code})`)
            results.errors++
            return
          }

          const attStudents = await response.json()
          if (attStudents.length > 0) {
            const attStudent = attStudents[0]
            const bioClass = attStudent.class || '' // e.g. "JSS 1A"
            
            if (bioClass && bioClass !== student.class_name) {
              console.log(`Repairing ${student.name}: ${student.class_name} -> ${bioClass}`)
              
              const studentTenantId = student.tenant_id || caller_tenant_id || '00000000-0000-0000-0000-000000000001'

              // 1. Ensure the new class exists in the 'classes' table for this tenant
              const { data: existingClass } = await supabase
                .from('classes')
                .select('id')
                .eq('name', bioClass)
                .eq('tenant_id', studentTenantId)
                .maybeSingle()

              if (!existingClass) {
                console.log(`Creating new class: ${bioClass} for tenant ${studentTenantId}`)
                await supabase.from('classes').insert({
                  name: bioClass,
                  level: student.class_name.match(/\d+/) ? student.class_name.match(/\d+/)[0] : '1',
                  tenant_id: studentTenantId,
                  updated_at: new Date().toISOString()
                })
              }

              // 2. Update the student's class and clear sub_class (since it's now part of the name)
              const { error: updateError } = await supabase
                .from('students')
                .update({ 
                  class_name: bioClass, 
                  sub_class: '', 
                  updated_at: new Date().toISOString() 
                })
                .eq('student_id', student.student_id)

              if (updateError) throw updateError
              results.updated++
            } else {
              results.skipped++
            }
          } else {
            results.skipped++
          }
        } catch (e) {
          console.error(`Error processing ${student.name}:`, e.message)
          results.errors++
        }
      }));
    }

    return new Response(JSON.stringify({ success: true, results }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    })

  } catch (error) {
    console.error('Fatal error in bulk-repair:', error.message)
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 500,
    })
  }
})
