const url = 'https://urqygjltionvaxuacfzr.supabase.co';
const key = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVycXlnamx0aW9udmF4dWFjZnpyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzcwMzEzMDEsImV4cCI6MjA5MjYwNzMwMX0.Vpk7rifsfjMCVBSYpEdVzkHv3w324iKp8B7urlKc_e4';

const email = 'demo.parent@example.com';
const password = 'DemoParent!2026';
const studentId2 = 'NKQMS-2026-9002'; // INAMI WESLEY

async function main() {
    console.log(`[Register] Logging in to get token...`);
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
    const accessToken = loginData.access_token;
    const userId = loginData.user.id;
    console.log(`[Register] Logged in successfully, user ID: ${userId}`);

    // Link parent to student in parent_links table
    console.log(`[Link] Upserting second parent link from ${userId} to student ${studentId2}...`);
    const linkRes = await fetch(`${url}/rest/v1/parent_links`, {
        method: 'POST',
        headers: {
            'apikey': key,
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
            'Prefer': 'resolution=merge-duplicates'
        },
        body: JSON.stringify({
            id: require('crypto').randomUUID(),
            parent_id: userId,
            student_id: studentId2,
            updated_at: new Date().toISOString()
        })
    });

    if (!linkRes.ok) {
        console.error('Error creating second parent link:', await linkRes.json());
    } else {
        console.log('✅ Second parent link established successfully!');
    }
}

main().catch(console.error);
