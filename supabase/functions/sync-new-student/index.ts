import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const ATTENDANCE_SYSTEM_URL = Deno.env.get('ATTENDANCE_SYSTEM_URL')
const ATTENDANCE_TOKEN = Deno.env.get('ATTENDANCE_TOKEN')
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
const ATTENDANCE_ANON_KEY = Deno.env.get('ATTENDANCE_ANON_KEY') || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Ind1emxpb2R2ZGR6bWhlaGZmcWZ4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzY4NTkxNTEsImV4cCI6MjA5MjQzNTE1MX0.0ASY-NuhdHPhyg9pB2XYiXOLJTnrocXxjkC6gpqO_vQ'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  if (!ATTENDANCE_SYSTEM_URL) {
    return new Response(JSON.stringify({ error: 'Biometric system not configured. ATTENDANCE_SYSTEM_URL is not set.' }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 503,
    })
  }

  try {
    const { record } = await req.json()

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
    const baseUrl = ATTENDANCE_SYSTEM_URL.endsWith('/') ? ATTENDANCE_SYSTEM_URL.slice(0, -1) : ATTENDANCE_SYSTEM_URL
    const classNameFull = record.sub_class ? `${record.class_name}${record.sub_class}` : record.class_name

    // If the student already has an attendance_code, we update their class/arm in biometric system
    const isUpdate = !!record.attendance_code;
    const tenantIdVal = record.tenant_id || '00000000-0000-0000-0000-000000000001';
    if (isUpdate) {
      console.log(`Updating student ${record.name} (Code: ${record.attendance_code}) to class ${classNameFull}`)
      
      // Filter by code and tenant_id to update the correct tenant's student in the biometric database
      const updateUrl = `${baseUrl}/rest/v1/students?code=eq.${record.attendance_code}&tenant_id=eq.${tenantIdVal}`
      const response = await fetch(updateUrl, {
        method: 'PATCH',
        headers: {
          'apikey': ATTENDANCE_ANON_KEY,
          'Authorization': `Bearer ${ATTENDANCE_ANON_KEY}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          name: record.name,
          class: classNameFull,
          tenant_id: tenantIdVal
        }),
      })

      if (!response.ok) {
        console.error(`Failed to update biometric record: ${response.statusText}`)
      }

      return new Response(JSON.stringify({ success: true, updated: true, attendance_code: record.attendance_code }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      })
    }

    console.log(`Syncing new student: ${record.name}`)

    // SAFETY: Check if student already exists in Attendance System (scoped to the same school/tenant)
    const checkUrl = `${baseUrl}/rest/v1/students?name=eq.${encodeURIComponent(record.name)}&tenant_id=eq.${tenantIdVal}&select=code`
    const checkResponse = await fetch(checkUrl, {
      headers: {
        'apikey': ATTENDANCE_ANON_KEY,
        'Authorization': `Bearer ${ATTENDANCE_ANON_KEY}`,
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
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 200,
        })
      }
    }

    // Student does NOT exist — create them
    const functionsUrl = baseUrl.includes('/functions/v1') ? baseUrl : `${baseUrl}/functions/v1`
    const apiUrl = `${functionsUrl}/create-student`
    console.log(`Creating student at: ${apiUrl}`)

    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${ATTENDANCE_TOKEN}`
      },
      body: JSON.stringify({
        name: record.name,
        class: record.sub_class ? `${record.class_name}${record.sub_class}` : record.class_name,
        tenant_id: tenantIdVal
      }),
    })

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ message: 'Could not parse error response' }))
      console.error(`Attendance System Error [${response.status}]:`, errorData)
      throw new Error(`Failed to create student in Attendance System: ${JSON.stringify(errorData)}`)
    }

    const responseData = await response.json()
    console.log('Attendance System Response:', responseData)
    
    const attendance_code = responseData.attendance_code
    
    if (!attendance_code) {
      throw new Error('Attendance system did not return a biometric code')
    }

    console.log(`Received biometric code: ${attendance_code}`)

    // CALCULATE NEW ID: PREFIX-YEAR-CODE
    let prefix = 'NKQMS';
    if (record.tenant_id) {
      const { data: tenantData } = await supabase
        .from('tenants')
        .select('student_id_prefix')
        .eq('id', record.tenant_id)
        .maybeSingle();
      if (tenantData && tenantData.student_id_prefix) {
        prefix = tenantData.student_id_prefix;
      }
    }
    const year = record.admission_year || new Date().getFullYear()
    const new_student_id = `${prefix}-${year}-${attendance_code}`

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
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    })

  } catch (error) {
    console.error('Error in sync-new-student:', error.message)
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 500,
    })
  }
})
