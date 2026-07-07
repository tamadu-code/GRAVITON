import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const GPTZERO_API_KEY = Deno.env.get('GPTZERO_API_KEY')
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  // CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    if (!GPTZERO_API_KEY) {
      throw new Error('GPTZERO_API_KEY is not configured. Please add it to your Edge Function secrets.')
    }
    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      throw new Error('Supabase environment variables are missing.')
    }

    const { submission_id, text } = await req.json()

    if (!submission_id || !text) {
      throw new Error('Missing required fields: submission_id and text')
    }

    if (text.trim().split(/\s+/).length < 50) {
      throw new Error('Text is too short for AI analysis. Minimum 50 words required.')
    }

    // ── Call GPTZero API ──────────────────────────────────────────
    const gptzeroRes = await fetch('https://api.gptzero.me/v2/predict/text', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': GPTZERO_API_KEY
      },
      body: JSON.stringify({
        document: text,
        version: '2024-04-04'
      })
    })

    if (!gptzeroRes.ok) {
      const errBody = await gptzeroRes.text()
      throw new Error(`GPTZero API error (${gptzeroRes.status}): ${errBody}`)
    }

    const gptzeroData = await gptzeroRes.json()

    // ── Extract results ───────────────────────────────────────────
    const doc = gptzeroData.documents?.[0] || {}
    const result = {
      ai_probability: Math.round((doc.completely_generated_prob || 0) * 100),
      predicted_class: doc.predicted_class || 'unknown',
      class_probabilities: doc.class_probabilities || {},
      average_perplexity: doc.average_generated_prob != null
        ? Math.round(doc.average_generated_prob * 100) : null,
      sentence_count: doc.sentences?.length || 0,
      flagged_sentences: (doc.sentences || [])
        .filter(s => s.generated_prob > 0.7)
        .map(s => ({
          text: s.sentence,
          ai_prob: Math.round(s.generated_prob * 100)
        }))
        .slice(0, 10), // Cap at 10 flagged sentences
      scanned_at: new Date().toISOString(),
      provider: 'gptzero'
    }

    // ── Persist result to Supabase ────────────────────────────────
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

    const { error: updateError } = await supabase
      .from('elearning_submissions')
      .update({ 
        ai_scan_result: result,
        updated_at: new Date().toISOString()
      })
      .eq('id', submission_id)

    if (updateError) {
      console.error('Failed to persist AI scan result:', updateError)
      // Don't throw — still return the result to the client
    }

    return new Response(
      JSON.stringify({ success: true, result }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
    )

  } catch (err) {
    console.error('AI Detection Error:', err.message)
    return new Response(
      JSON.stringify({ success: false, error: err.message }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
    )
  }
})
