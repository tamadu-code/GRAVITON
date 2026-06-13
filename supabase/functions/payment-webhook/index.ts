import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

serve(async (req) => {
  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    // Verify webhook signature (optional but recommended in prod, we check event type in this helper)
    const bodyText = await req.text()
    let event: any
    try {
      event = JSON.parse(bodyText)
    } catch (e) {
      return new Response("Invalid JSON body", { status: 400 })
    }

    console.log(`[Webhook] Received Stripe event: ${event.type}`)

    const dataObj = event.data?.object
    if (!dataObj) {
      return new Response("Missing data object", { status: 400 })
    }

    // ─── Event Handling ───
    if (event.type === 'checkout.session.completed') {
      const tenantId = dataObj.client_reference_id
      const customerId = dataObj.customer
      const subscriptionId = dataObj.subscription

      if (tenantId) {
        console.log(`[Webhook] Checkout completed for tenant: ${tenantId}`)
        
        // Update subscription info
        const { error } = await supabase
          .from('subscriptions')
          .update({
            billing_provider: 'stripe',
            customer_id: customerId,
            subscription_id: subscriptionId,
            status: 'active',
            updated_at: new Date().toISOString()
          })
          .eq('tenant_id', tenantId)

        if (error) throw error
      }
    } 
    else if (event.type === 'invoice.payment_succeeded') {
      const subscriptionId = dataObj.subscription
      const customerId = dataObj.customer

      if (subscriptionId) {
        console.log(`[Webhook] Payment succeeded for subscription: ${subscriptionId}`)

        // Fetch subscription period end from Stripe (or calculate default 30 days)
        // Here we default to +30 days for safety if period end is not passed in payload
        const expiresAt = dataObj.lines?.data?.[0]?.period?.end
          ? new Date(dataObj.lines.data[0].period.end * 1000).toISOString()
          : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()

        const { error } = await supabase
          .from('subscriptions')
          .update({
            status: 'active',
            expires_at: expiresAt,
            updated_at: new Date().toISOString()
          })
          .eq('subscription_id', subscriptionId)

        if (error) throw error
      }
    } 
    else if (event.type === 'invoice.payment_failed' || event.type === 'customer.subscription.updated') {
      const subscriptionId = dataObj.id || dataObj.subscription
      const stripeStatus = dataObj.status // e.g. 'past_due', 'canceled', 'unpaid', 'active'
      
      if (subscriptionId && stripeStatus) {
        console.log(`[Webhook] Subscription ${subscriptionId} status updated: ${stripeStatus}`)

        let mappedStatus = 'active'
        if (stripeStatus === 'past_due') mappedStatus = 'past_due'
        else if (stripeStatus === 'canceled' || stripeStatus === 'unpaid') mappedStatus = 'canceled'
        else if (stripeStatus === 'incomplete') mappedStatus = 'past_due'

        const { error } = await supabase
          .from('subscriptions')
          .update({
            status: mappedStatus,
            updated_at: new Date().toISOString()
          })
          .eq('subscription_id', subscriptionId)

        if (error) throw error
      }
    }
    else if (event.type === 'customer.subscription.deleted') {
      const subscriptionId = dataObj.id
      console.log(`[Webhook] Subscription canceled: ${subscriptionId}`)

      const { error } = await supabase
        .from('subscriptions')
        .update({
          status: 'canceled',
          updated_at: new Date().toISOString()
        })
        .eq('subscription_id', subscriptionId)

      if (error) throw error
    }

    return new Response(JSON.stringify({ received: true }), {
      headers: { 'Content-Type': 'application/json' },
      status: 200
    })

  } catch (error) {
    console.error('Webhook error:', error.message)
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { 'Content-Type': 'application/json' },
      status: 500
    })
  }
})
