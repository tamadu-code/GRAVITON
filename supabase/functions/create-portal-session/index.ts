import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    // Get auth user from JWT header
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'No authorization header' }), { status: 401, headers: corsHeaders })
    }

    const token = authHeader.replace('Bearer ', '')
    const { data: { user }, error: authError } = await supabase.auth.getUser(token)
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized user' }), { status: 401, headers: corsHeaders })
    }

    // Extract user_metadata tenant_id and role
    const tenantId = user.user_metadata?.tenant_id
    const userRole = user.user_metadata?.role

    if (!tenantId || (userRole !== 'Admin' && userRole !== 'SuperAdmin')) {
      return new Response(JSON.stringify({ error: 'Only Tenant Admins can manage subscriptions' }), { status: 403, headers: corsHeaders })
    }

    // Fetch subscription details
    const { data: sub, error: subError } = await supabase
      .from('subscriptions')
      .select('*')
      .eq('tenant_id', tenantId)
      .maybeSingle()

    if (subError) throw subError

    const stripeApiKey = Deno.env.get('STRIPE_SECRET_KEY')
    if (!stripeApiKey) {
      return new Response(JSON.stringify({ error: 'Stripe is not configured on the server' }), { status: 500, headers: corsHeaders })
    }

    let sessionUrl = ""

    // If they have a Stripe Customer ID, redirect to Customer Portal
    if (sub && sub.customer_id) {
      const response = await fetch('https://api.stripe.com/v1/billing_portal/sessions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${stripeApiKey}`,
          'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: new URLSearchParams({
          'customer': sub.customer_id,
          'return_url': `${req.headers.get('origin') || 'http://localhost:3000'}/#config`
        })
      })

      if (!response.ok) {
        const err = await response.json()
        throw new Error(`Stripe Portal session failed: ${JSON.stringify(err)}`)
      }

      const session = await response.json()
      sessionUrl = session.url
    } else {
      // Create new Checkout Session
      const response = await fetch('https://api.stripe.com/v1/checkout/sessions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${stripeApiKey}`,
          'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: new URLSearchParams({
          'success_url': `${req.headers.get('origin') || 'http://localhost:3000'}/#config?checkout=success`,
          'cancel_url': `${req.headers.get('origin') || 'http://localhost:3000'}/#config?checkout=cancel`,
          'mode': 'subscription',
          'client_reference_id': tenantId,
          'customer_email': user.email || '',
          'line_items[0][price]': Deno.env.get('STRIPE_STANDARD_PRICE_ID') || '',
          'line_items[0][quantity]': '1'
        })
      })

      if (!response.ok) {
        const err = await response.json()
        throw new Error(`Stripe Checkout session failed: ${JSON.stringify(err)}`)
      }

      const session = await response.json()
      sessionUrl = session.url
    }

    return new Response(JSON.stringify({ url: sessionUrl }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200
    })

  } catch (error) {
    console.error('Error in create-portal-session:', error.message)
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 500
    })
  }
})
