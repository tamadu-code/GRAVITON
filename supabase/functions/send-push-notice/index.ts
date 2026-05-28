import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"
import webpush from "https://esm.sh/web-push@3.6.7"

const VAPID_PUBLIC_KEY = Deno.env.get('VAPID_PUBLIC_KEY')
const VAPID_PRIVATE_KEY = Deno.env.get('VAPID_PRIVATE_KEY')
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')

serve(async (req) => {
  // Handle CORS preflight request
  if (req.method === 'OPTIONS') {
    return new Response('ok', {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST',
        'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
      }
    })
  }

  try {
    if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) {
      throw new Error('VAPID keys not configured in Edge Function environment variables.')
    }

    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      throw new Error('Supabase URL or Service Role Key is missing.')
    }

    // Configure web-push with VAPID details
    // mailto: address is required by push services (Google, Apple, Mozilla) to contact you if there is an abuse issue
    webpush.setVapidDetails(
      'mailto:admin@montessori-portal.com',
      VAPID_PUBLIC_KEY,
      VAPID_PRIVATE_KEY
    )

    // Parse the payload sent by Supabase Database Webhook trigger
    const payload = await req.json()
    console.log('[Push Notice] Received webhook trigger:', JSON.stringify(payload))

    // Supabase DB webhooks send the row in the 'record' property
    const record = payload.record
    if (!record) {
      return new Response(JSON.stringify({ error: 'Missing notice record in request body' }), {
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
        status: 400
      })
    }

    // Only process active notices
    if (record.is_active === 0 || record.is_active === false) {
      return new Response(JSON.stringify({ message: 'Notice is inactive. Skipping push.' }), {
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
        status: 200
      })
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

    // Determine target user IDs
    let targetUserIds: string[] = []
    
    if (record.target === 'Staff' || record.target === 'All') {
      // Broadcast to all staff/teacher profiles
      const { data: profiles, error } = await supabase
        .from('profiles')
        .select('id')
        .neq('status', 'Deactivated')
        
      if (error) throw error
      targetUserIds = profiles?.map(p => String(p.id)) || []
      
    } else if (record.target === 'Students') {
      // Broadcast to all student profiles
      const { data: profiles, error } = await supabase
        .from('profiles')
        .select('id')
        .eq('role', 'Student')
        
      if (error) throw error
      targetUserIds = profiles?.map(p => String(p.id)) || []
      
    } else if (record.target && record.target.trim() !== '') {
      // Could be a specific teacher ID (e.g. UUID or String ID) OR a Class Name (e.g. SSS 1)
      // Check if it matches a profile ID directly
      const { data: profile } = await supabase
        .from('profiles')
        .select('id')
        .eq('id', record.target)
        .maybeSingle()

      if (profile) {
        targetUserIds = [String(profile.id)]
      } else {
        // Target is likely a Class Name (e.g. 'SSS 1')
        // Find all student profiles who are registered in this class
        const { data: classStudents, error: studentError } = await supabase
          .from('students')
          .select('student_id')
          .eq('class_name', record.target)
          .eq('status', 'Active')

        if (studentError) throw studentError
        const studentIds = classStudents?.map(s => s.student_id) || []

        if (studentIds.length > 0) {
          // Resolve student profiles
          const { data: profiles, error: profileError } = await supabase
            .from('profiles')
            .select('id')
            .in('assigned_id', studentIds)

          if (profileError) throw profileError
          targetUserIds = profiles?.map(p => String(p.id)) || []
        }

        // Also include any Form Teacher or Subject Teachers assigned to this class!
        const { data: subjectAssignments } = await supabase
          .from('subject_assignments')
          .select('teacher_id')
          .eq('class_name', record.target)

        const { data: formTeachers } = await supabase
          .from('form_teachers')
          .select('teacher_id')
          .eq('class_name', record.target)

        const teacherIds = new Set<string>()
        subjectAssignments?.forEach(a => { if (a.teacher_id) teacherIds.add(String(a.teacher_id)) })
        formTeachers?.forEach(f => { if (f.teacher_id) teacherIds.add(String(f.teacher_id)) })

        teacherIds.forEach(id => targetUserIds.push(id))
      }
    }

    // Deduplicate user IDs
    targetUserIds = [...new Set(targetUserIds)]
    
    if (targetUserIds.length === 0) {
      return new Response(JSON.stringify({ success: true, message: 'No target users resolved for this notice.' }), {
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
        status: 200
      })
    }

    console.log(`[Push Notice] Sending notifications to ${targetUserIds.length} target users...`)

    // Fetch active device subscriptions for target users
    const { data: subscriptions, error: subError } = await supabase
      .from('push_subscriptions')
      .select('*')
      .in('user_id', targetUserIds)

    if (subError) throw subError

    if (!subscriptions || subscriptions.length === 0) {
      return new Response(JSON.stringify({ success: true, message: 'No active device subscriptions found for target users.' }), {
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
        status: 200
      })
    }

    console.log(`[Push Notice] Dispatched pushes to ${subscriptions.length} active device endpoints.`)

    // Prepare message payload
    const pushPayload = JSON.stringify({
      title: record.title || '🔔 Graviton CMS Notification',
      body: record.content || 'A new announcement has been posted.',
      data: {
        noticeId: record.id,
        category: record.category || 'General',
        timestamp: record.updated_at
      }
    })

    let successCount = 0
    let failureCount = 0

    // Send notifications concurrently
    const pushPromises = subscriptions.map(async (sub) => {
      const pushSubscription = {
        endpoint: sub.endpoint,
        keys: {
          p256dh: sub.p256dh,
          auth: sub.auth
        }
      }

      try {
        await webpush.sendNotification(pushSubscription, pushPayload)
        successCount++
      } catch (err) {
        failureCount++
        console.warn(`[Push Notice] Notification failed for user ${sub.user_id} on endpoint:`, sub.endpoint, err.message)
        
        // Auto-cleanup stale/invalid subscription endpoints (expired or revoked permissions)
        if (err.statusCode === 410 || err.statusCode === 404) {
          console.log(`[Push Notice] Cleaning up expired subscription ID ${sub.id} for user ${sub.user_id}`)
          await supabase
            .from('push_subscriptions')
            .delete()
            .eq('id', sub.id)
        }
      }
    })

    await Promise.all(pushPromises)

    return new Response(JSON.stringify({
      success: true,
      processed_users: targetUserIds.length,
      device_subscriptions: subscriptions.length,
      dispatched_success: successCount,
      dispatched_failures: failureCount
    }), {
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      status: 200
    })

  } catch (error) {
    console.error('[Push Notice] Fatal error:', error.message)
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      status: 500
    })
  }
})
