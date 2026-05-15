/**
 * One-off script to reset Admin password
 * Usage: node reset-admin.js
 */
const { createClient } = require('@supabase/supabase-js');

// Config - Replace SERVICE_ROLE_KEY with your actual secret key from Supabase Settings
const SUPABASE_URL = 'https://urqygjltionvaxuacfzr.supabase.co';
const SERVICE_ROLE_KEY = 'YOUR_SERVICE_ROLE_KEY_HERE'; // <--- GET THIS FROM Project Settings > API

if (SERVICE_ROLE_KEY === 'YOUR_SERVICE_ROLE_KEY_HERE') {
    console.error('ERROR: You must replace YOUR_SERVICE_ROLE_KEY_HERE with your secret SERVICE_ROLE key from the Supabase Dashboard.');
    process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: {
        autoRefreshToken: false,
        persistSession: false
    }
});

async function resetAdminPassword() {
    const targetEmail = 'orukari878@gmail.com';
    const newPassword = 'Tama@360180';

    console.log(`[Admin Tool] Searching for user: ${targetEmail}...`);

    try {
        // 1. Fetch user by email
        const { data: { users }, error: listError } = await supabase.auth.admin.listUsers();
        
        if (listError) throw listError;

        const user = users.find(u => u.email === targetEmail);

        if (!user) {
            console.error(`[Error] User with email ${targetEmail} not found in Supabase Auth.`);
            return;
        }

        console.log(`[Admin Tool] User found (ID: ${user.id}). Updating password...`);

        // 2. Update the password
        const { data, error: updateError } = await supabase.auth.admin.updateUserById(
            user.id,
            { password: newPassword }
        );

        if (updateError) throw updateError;

        console.log('--------------------------------------------------');
        console.log('✅ SUCCESS: Admin password has been reset!');
        console.log(`Email: ${targetEmail}`);
        console.log(`New Password: ${newPassword}`);
        console.log('--------------------------------------------------');
        console.log('You can now log in to the application.');

    } catch (err) {
        console.error('[Fatal Error]', err.message || err);
    }
}

resetAdminPassword();
