import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const HF_API_KEY = Deno.env.get('HF_API_KEY') || Deno.env.get('GPTZERO_API_KEY')
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// Helper to determine if a key is a placeholder or empty
function getValidApiKey(key: string | undefined): string | null {
  if (!key) return null;
  const normalized = key.trim().replace(/['"“”]/g, ''); // strip quotes
  if (
    normalized === "" || 
    normalized === "your_free_huggingface_token" || 
    normalized === "your_api_key_here" ||
    normalized.startsWith("your_free_")
  ) {
    return null;
  }
  return normalized;
}

serve(async (req) => {
  // CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
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

    const activeApiKey = getValidApiKey(HF_API_KEY)

    // ── Call Hugging Face Inference API ────────────────────────────
    const headers: Record<string, string> = {
      'Content-Type': 'application/json'
    }
    if (activeApiKey) {
      headers['Authorization'] = `Bearer ${activeApiKey}`
    }

    const hfRes = await fetch('https://router.huggingface.co/hf-inference/models/roberta-base-openai-detector', {
      method: 'POST',
      headers,
      body: JSON.stringify({ inputs: text })
    })

    if (!hfRes.ok) {
      const errBody = await hfRes.text()
      try {
        const parsedErr = JSON.parse(errBody)
        
        // Handle loading/warming up state
        if (parsedErr.error && parsedErr.error.includes('loading')) {
          return new Response(
            JSON.stringify({ 
              success: false, 
              error: `AI model is warming up on Hugging Face. Estimated time: ${Math.round(parsedErr.estimated_time || 20)}s. Please try again shortly.` 
            }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
          )
        }
        
        // Handle unauthorized token
        if (hfRes.status === 401 || hfRes.status === 403) {
          return new Response(
            JSON.stringify({
              success: false,
              error: `Hugging Face API authorization failed. Please verify your HF_API_KEY setting in Supabase. Details: ${parsedErr.error || errBody}`
            }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
          )
        }
      } catch (_) {}
      throw new Error(`Hugging Face API returned error (${hfRes.status}): ${errBody}`)
    }

    const hfData = await hfRes.json()
    
    // Hugging Face returns [[{"label": "Real", "score": ...}, {"label": "Fake", "score": ...}]]
    const predictions = Array.isArray(hfData[0]) ? hfData[0] : (Array.isArray(hfData) ? hfData : [])
    
    const fakePred = predictions.find((p: any) => p.label === 'Fake' || p.label === 'LABEL_1')
    const realPred = predictions.find((p: any) => p.label === 'Real' || p.label === 'LABEL_0')

    const aiProb = fakePred ? Math.round(fakePred.score * 100) : 0
    const predictedClass = aiProb > 50 ? 'AI-Generated' : 'Human-Written'

    const result = {
      ai_probability: aiProb,
      predicted_class: predictedClass,
      class_probabilities: {
        fake: fakePred ? fakePred.score : 0,
        real: realPred ? realPred.score : 0
      },
      scanned_at: new Date().toISOString(),
      provider: 'huggingface'
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
    }

    return new Response(
      JSON.stringify({ success: true, result }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
    )

  } catch (err) {
    console.error('AI Detection Error:', err.message)
    // Return errors as 200 JSON responses so client receives the clean error message instead of general non-2xx failures
    return new Response(
      JSON.stringify({ success: false, error: err.message }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
    )
  }
})
