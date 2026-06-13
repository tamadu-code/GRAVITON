import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

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

async function sendTwilioSms(to: string, body: string, apiKey: string, senderId: string) {
  // apiKey for Twilio should be format: "ACxxxxx:auth_token"
  const parts = apiKey.split(':');
  if (parts.length !== 2) {
    throw new Error('Twilio API Key must be formatted as "accountSid:authToken"');
  }
  const [accountSid, authToken] = parts;
  const url = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`;
  
  const from = senderId || Deno.env.get('DEFAULT_TWILIO_FROM') || '';
  const formData = new URLSearchParams();
  formData.append('To', to);
  formData.append('From', from);
  formData.append('Body', body);

  const creds = btoa(`${accountSid}:${authToken}`);
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `Basic ${creds}`,
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body: formData.toString()
  });

  if (!response.ok) {
    throw new Error(`Twilio returned error status ${response.status}: ${await response.text()}`);
  }
  return await response.json();
}

async function sendTermiiSms(to: string, body: string, apiKey: string, senderId: string) {
  const url = 'https://api.ng.termii.com/api/sms/send';
  const payload = {
    to: to,
    from: senderId || 'SMSAlert',
    sms: body,
    type: 'plain',
    channel: 'generic',
    api_key: apiKey
  };

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    throw new Error(`Termii returned error status ${response.status}: ${await response.text()}`);
  }
  return await response.json();
}

async function sendAfricasTalkingSms(to: string, body: string, apiKey: string, senderId: string) {
  const url = 'https://api.africastalking.com/version1/messaging';
  
  const parts = apiKey.split(':');
  if (parts.length !== 2) {
    throw new Error('Africa\'s Talking API Key must be formatted as "username:apiKey"');
  }
  const [username, token] = parts;
  
  const formData = new URLSearchParams();
  formData.append('username', username);
  formData.append('to', to);
  formData.append('message', body);
  if (senderId) {
    formData.append('from', senderId);
  }

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Accept': 'application/json',
      'ApiKey': token,
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body: formData.toString()
  });

  if (!response.ok) {
    throw new Error(`Africa's Talking returned error status ${response.status}: ${await response.text()}`);
  }
  return await response.json();
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
    let isServiceRole = false
    
    if (token === SUPABASE_SERVICE_ROLE_KEY) {
      isServiceRole = true
    } else if (token && authHeader.includes('eyJhbGciOi')) {
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

    const { to, message, tenant_id } = await req.json()

    if (!to || !message || !tenant_id) {
      return new Response(JSON.stringify({ error: 'to, message, and tenant_id are required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    // Verify caller has permissions to send for this tenant
    if (!isServiceRole && !isSuperAdmin) {
      if (!caller_tenant_id || caller_tenant_id !== tenant_id) {
        return new Response(JSON.stringify({ error: 'Forbidden: You do not have permission to send messages for this tenant' }), {
          status: 403,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        })
      }
    }

    const supabase = createClient(SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY!)

    // Fetch tenant-specific SMS configuration
    const { data: smsConfig, error: configError } = await supabase
      .from('sms_configurations')
      .select('*')
      .eq('tenant_id', tenant_id)
      .maybeSingle()

    if (configError) {
      console.error('Failed to query SMS configuration:', configError)
      throw configError
    }

    if (!smsConfig || !smsConfig.is_active || smsConfig.provider === 'none') {
      console.log(`SMS notifications are not configured or inactive for tenant ${tenant_id}.`)
      return new Response(JSON.stringify({ success: false, reason: 'SMS configuration not active' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200
      })
    }

    const provider = smsConfig.provider;
    const apiKey = smsConfig.api_key;
    const senderId = smsConfig.sender_id;

    if (!apiKey) {
      throw new Error(`SMS configuration API key is missing for tenant ${tenant_id}`);
    }

    console.log(`Sending SMS to ${to} using ${provider} for tenant ${tenant_id}...`)

    let apiResult = null;
    if (provider === 'twilio') {
      apiResult = await sendTwilioSms(to, message, apiKey, senderId)
    } else if (provider === 'termii') {
      apiResult = await sendTermiiSms(to, message, apiKey, senderId)
    } else if (provider === 'africas_talking') {
      apiResult = await sendAfricasTalkingSms(to, message, apiKey, senderId)
    } else {
      throw new Error(`Unsupported SMS provider: ${provider}`)
    }

    console.log(`SMS dispatched successfully. Result:`, JSON.stringify(apiResult))

    // Log the transaction in the database
    // Note: We can write to the audit_logs or settings or keep a log of SMS, or just return success.
    // Let's return success
    return new Response(JSON.stringify({ success: true, provider, result: apiResult }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200
    })

  } catch (error) {
    console.error('Error in send-sms:', error.message)
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 500,
    })
  }
})
