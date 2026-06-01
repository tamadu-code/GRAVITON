const url = 'https://urqygjltionvaxuacfzr.supabase.co';
const key = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVycXlnamx0aW9udmF4dWFjZnpyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzcwMzEzMDEsImV4cCI6MjA5MjYwNzMwMX0.Vpk7rifsfjMCVBSYpEdVzkHv3w324iKp8B7urlKc_e4';

const email = 'demo.admin@example.com';
const password = 'DemoAdmin!2026';
const fullName = 'Demo Admin';
const role = 'Admin';

async function main() {
    console.log(`[Register] Attempting to sign up ${email}...`);

    // 1. Sign up user via GoTrue API
    const signupRes = await fetch(`${url}/auth/v1/signup`, {
        method: 'POST',
        headers: {
            'apikey': key,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            email: email,
            password: password,
            data: {
                full_name: fullName,
                role: role
            }
        })
    });

    let signupData = await signupRes.json();
    let accessToken = null;
    let userId = null;

    if (!signupRes.ok) {
        const errMsg = signupData.message || signupData.msg || '';
        const errCode = signupData.error_code || '';
        if (errMsg.includes('already registered') || errMsg.includes('already exists') || errCode === 'user_already_exists') {
            console.log(`[Register] User already exists. Logging in...`);
            const loginRes = await fetch(`${url}/auth/v1/token?grant_type=password`, {
                method: 'POST',
                headers: {
                    'apikey': key,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    email: email,
                    password: password
                })
            });
            const loginData = await loginRes.json();
            if (!loginRes.ok) {
                console.error('Login failed:', loginData);
                return;
            }
            accessToken = loginData.access_token;
            userId = loginData.user.id;
            console.log(`[Register] Logged in successfully, user ID: ${userId}`);
        } else {
            console.error('Signup failed:', signupData);
            return;
        }
    } else {
        accessToken = signupData.access_token;
        userId = signupData.user.id;
        console.log(`[Register] Signed up successfully. User ID: ${userId}`);
    }

    // 2. Try to insert profile if it doesn't exist (using user's bearer token)
    console.log(`[Register] Upserting profile for ${email}...`);
    const profileRes = await fetch(`${url}/rest/v1/profiles`, {
        method: 'POST',
        headers: {
            'apikey': key,
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
            'Prefer': 'resolution=merge-duplicates'
        },
        body: JSON.stringify({
            id: userId,
            full_name: fullName,
            role: role,
            email: email,
            status: 'Active',
            updated_at: new Date().toISOString()
        })
    });
    if (!profileRes.ok) {
        console.warn('Profile upsert warning/error:', await profileRes.json());
    } else {
        console.log('✅ Profile upserted successfully!');
    }
}

main().catch(console.error);
