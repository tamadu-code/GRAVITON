import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const ATTENDANCE_SYSTEM_URL = Deno.env.get('ATTENDANCE_SYSTEM_URL')
const ATTENDANCE_TOKEN = Deno.env.get('ATTENDANCE_TOKEN')
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')

serve(async (req) => {
  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
    
    console.log('Starting bulk arm repair...')

    // 1. Fetch all active students from SMS
    const { data: students, error: fetchError } = await supabase
      .from('students')
      .select('student_id, name, attendance_code, class_name, sub_class')
      .eq('is_active', true)

    if (fetchError) throw fetchError

    console.log(`Analyzing ${students.length} students...`)

    const results = {
      total: students.length,
      updated: 0,
      errors: 0,
      skipped: 0
    }

    const baseUrl = ATTENDANCE_SYSTEM_URL.endsWith('/') ? ATTENDANCE_SYSTEM_URL.slice(0, -1) : ATTENDANCE_SYSTEM_URL

    for (const student of students) {
      try {
        if (!student.attendance_code) {
          results.skipped++
          continue
        }

        // Query Biometric System for this student
        const checkUrl = `${baseUrl}/rest/v1/students?code=eq.${student.attendance_code}&select=name,class`
        const response = await fetch(checkUrl, {
          headers: {
            'apikey': ATTENDANCE_TOKEN,
            'Authorization': `Bearer ${ATTENDANCE_TOKEN}`,
          },
        })

        if (!response.ok) {
          console.warn(`Failed to check student ${student.name} (${student.attendance_code})`)
          results.errors++
          continue
        }

        const attStudents = await response.json()
        if (attStudents.length > 0) {
          const attStudent = attStudents[0]
          const bioClass = attStudent.class || '' // e.g. "JSS 1A"
          
          // Check if we can extract the arm (e.g. from "JSS 1A" get "A")
          // Assuming class_name is "JSS 1", and bioClass is "JSS 1A"
          if (bioClass.startsWith(student.class_name)) {
            const arm = bioClass.replace(student.class_name, '').trim()
            if (arm && arm !== student.sub_class) {
              console.log(`Repairing ${student.name}: ${student.sub_class} -> ${arm}`)
              
              const { error: updateError } = await supabase
                .from('students')
                .update({ sub_class: arm, updated_at: new Date().toISOString() })
                .eq('student_id', student.student_id)

              if (updateError) throw updateError
              results.updated++
            } else {
              results.skipped++
            }
          } else {
             // Maybe the whole class name is different (e.g. "JSS1A" vs "JSS 1")
             // We try a regex match for the last character if it's a letter
             const match = bioClass.match(/([A-Z])$/)
             if (match) {
                 const arm = match[1]
                 if (arm !== student.sub_class) {
                     console.log(`Regex Repair for ${student.name}: ${student.sub_class} -> ${arm}`)
                     await supabase.from('students').update({ sub_class: arm }).eq('student_id', student.student_id)
                     results.updated++
                 } else {
                     results.skipped++
                 }
             } else {
                 results.skipped++
             }
          }
        } else {
          results.skipped++
        }
      } catch (e) {
        console.error(`Error processing ${student.name}:`, e.message)
        results.errors++
      }
    }

    return new Response(JSON.stringify({ success: true, results }), {
      headers: { 'Content-Type': 'application/json' },
      status: 200,
    })

  } catch (error) {
    console.error('Fatal error in bulk-repair:', error.message)
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { 'Content-Type': 'application/json' },
      status: 500,
    })
  }
})
