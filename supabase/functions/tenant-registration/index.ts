import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    const { 
      school_name, 
      school_slug, 
      student_id_prefix, 
      admin_email, 
      admin_password, 
      admin_full_name 
    } = await req.json()

    // 1. Basic validation
    if (!school_name || !school_slug || !student_id_prefix || !admin_email || !admin_password || !admin_full_name) {
      return new Response(JSON.stringify({ error: "Missing required fields" }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400
      })
    }

    // 2. Check if slug already exists
    const { data: existingTenant } = await supabase
      .from('tenants')
      .select('id')
      .eq('slug', school_slug)
      .maybeSingle()

    if (existingTenant) {
      return new Response(JSON.stringify({ error: "School URL slug is already taken" }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400
      })
    }

    // 3. Create Tenant
    const { data: tenant, error: tenantError } = await supabase
      .from('tenants')
      .insert({
        name: school_name,
        slug: school_slug,
        student_id_prefix: student_id_prefix.toUpperCase(),
        status: 'active' // Active by default for trial phase
      })
      .select()
      .single()

    if (tenantError) throw tenantError

    // 4. Create initial subscription (standard tier trial)
    const { error: subError } = await supabase
      .from('subscriptions')
      .insert({
        tenant_id: tenant.id,
        plan_tier: 'standard',
        status: 'trialing',
        max_student_limit: 200,
        expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString() // 30-day trial
      })

    if (subError) throw subError

    // 5. Register Admin User in Supabase Auth via admin API
    const { data: authUser, error: authError } = await supabase.auth.admin.createUser({
      email: admin_email,
      password: admin_password,
      email_confirm: true, // Auto-confirm email to make onboarding seamless
      user_metadata: { 
        full_name: admin_full_name,
        role: 'Admin',
        tenant_id: tenant.id
      }
    })

    if (authError) {
      // Rollback tenant creation on auth failure to keep DB clean
      await supabase.from('tenants').delete().eq('id', tenant.id)
      throw authError
    }

    // 6. Create Profile for the admin
    const { error: profileError } = await supabase
      .from('profiles')
      .insert({
        id: authUser.user.id,
        full_name: admin_full_name,
        role: 'Admin',
        assigned_id: `ADM-${student_id_prefix.toUpperCase()}`,
        email: admin_email,
        status: 'Active',
        tenant_id: tenant.id
      })

    if (profileError) {
      // Rollback auth user and tenant on failure
      await supabase.auth.admin.deleteUser(authUser.user.id)
      await supabase.from('tenants').delete().eq('id', tenant.id)
      throw profileError
    }

    // 7. Handle Payment / Stripe Integration if Keys are present
    const stripeApiKey = Deno.env.get('STRIPE_SECRET_KEY')
    let checkoutUrl = null

    if (stripeApiKey) {
      try {
        // Stripe integration example
        const response = await fetch('https://api.stripe.com/v1/checkout/sessions', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${stripeApiKey}`,
            'Content-Type': 'application/x-www-form-urlencoded'
          },
          body: new URLSearchParams({
            'success_url': `${req.headers.get('origin') || 'http://localhost:3000'}/#dashboard?checkout=success`,
            'cancel_url': `${req.headers.get('origin') || 'http://localhost:3000'}/#billing?checkout=cancel`,
            'mode': 'subscription',
            'client_reference_id': tenant.id,
            'customer_email': admin_email,
            'line_items[0][price]': Deno.env.get('STRIPE_STANDARD_PRICE_ID') || '',
            'line_items[0][quantity]': '1'
          })
        })

        if (response.ok) {
          const session = await response.json()
          checkoutUrl = session.url
        }
      } catch (stripeErr) {
        console.error('Stripe session creation failed, falling back to trial activation:', stripeErr)
      }
    }

    return new Response(JSON.stringify({ 
      success: true, 
      tenant_id: tenant.id, 
      user_id: authUser.user.id,
      checkout_url: checkoutUrl,
      message: "School registered successfully. Welcome to Graviton!" 
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200
    })

  } catch (error) {
    console.error('Error in tenant-registration:', error.message)
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 500
    })
  }
})
