import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { email, password, full_name, role, id } = await req.json()

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
    
    // --- New Path: Update Auth by User ID (e.g. Email / Profile changes) ---
    if (id) {
      console.log(`Updating auth user for ID: ${id}...`);
      const updateParams: any = {
        email_confirm: true,
        user_metadata: { full_name, role }
      };
      if (email) updateParams.email = email;
      if (password) updateParams.password = password;

      const { data: userData, error: updateError } = await supabase.auth.admin.updateUserById(id, updateParams);
      if (updateError) throw updateError;

      // Update their profile table row as well
      const profileUpdate: any = {
        id: id,
        full_name: full_name || '',
        role: role || 'Student',
        status: 'Active',
        updated_at: new Date().toISOString()
      };
      if (email) profileUpdate.email = email;

      await supabase.from('profiles').upsert(profileUpdate);

      return new Response(JSON.stringify({ success: true, message: 'Auth user updated successfully by ID', user: userData.user }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      });
    }

    if (!email || !password) {
      return new Response(JSON.stringify({ error: 'Email and password required' }), { status: 400, headers: corsHeaders })
    }
    
    // 1. Try to find if user exists in auth.users by getting them from profiles
    const { data: profile } = await supabase.from('profiles').select('id').eq('email', email).maybeSingle()
    
    let userId = profile?.id;

    if (userId) {
        console.log(`User found in profiles (${userId}). Updating password via admin API...`);
        // We update the password for the existing user
        const { data, error } = await supabase.auth.admin.updateUserById(userId, {
            email: email,
            password: password,
            email_confirm: true,
            user_metadata: { full_name, role }
        });
        
        if (error) {
           console.log(`Failed to update user by ID. Attempting to list users by email...`);
           // Fallback: list users and match email
           const { data: users } = await supabase.auth.admin.listUsers();
           const user = users.users.find(u => u.email === email);
           if (user) {
               userId = user.id;
               const { error: updateErr } = await supabase.auth.admin.updateUserById(userId, { email, password, email_confirm: true });
               if (updateErr) throw updateErr;
           } else {
               throw error;
           }
        }
        
        return new Response(JSON.stringify({ success: true, message: 'Password reset for existing user', user: { id: userId } }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 200,
        })
    } else {
        // Find if user exists in auth.users but not in profiles
        const { data: users } = await supabase.auth.admin.listUsers();
        const existingUser = users.users.find(u => u.email === email);
        
        if (existingUser) {
            console.log(`User found in auth.users but not in profiles. Updating password...`);
            userId = existingUser.id;
            const { error: updateErr } = await supabase.auth.admin.updateUserById(userId, { password, email_confirm: true });
            if (updateErr) throw updateErr;
            
            // Re-create profile
            await supabase.from('profiles').upsert({
                id: userId,
                email: email,
                full_name: full_name || '',
                role: role || 'Student',
                status: 'Active'
            });
            
            return new Response(JSON.stringify({ success: true, message: 'Password reset and profile restored', user: { id: userId } }), {
              headers: { ...corsHeaders, 'Content-Type': 'application/json' },
              status: 200,
            });
        }
        
        console.log(`User not found anywhere. Creating new auth user...`);
        // User does not exist, create them
        const { data: newUser, error: createError } = await supabase.auth.admin.createUser({
            email: email,
            password: password,
            email_confirm: true,
            user_metadata: { full_name, role }
        });
        
        if (createError) throw createError;
        
        let createdUserId = newUser?.user?.id;
        if (newUser && newUser.user) {
            await supabase.from('profiles').upsert({
                id: newUser.user.id,
                email: email,
                full_name: full_name || '',
                role: role || 'Student',
                status: 'Active'
            });
        }
        
        return new Response(JSON.stringify({ success: true, message: 'New user provisioned', user: { id: createdUserId } }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 200,
        })
    }

  } catch (error) {
    console.error('Fatal error in admin-repair-auth:', error.message)
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 500,
    })
  }
})
