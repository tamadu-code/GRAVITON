async function run() {
    try {
        const authRes = await fetch('https://urqygjltionvaxuacfzr.supabase.co/auth/v1/token?grant_type=password', {
            method: 'POST',
            headers: {
                'apikey': 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVycXlnamx0aW9udmF4dWFjZnpyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzcwMzEzMDEsImV4cCI6MjA5MjYwNzMwMX0.Vpk7rifsfjMCVBSYpEdVzkHv3w324iKp8B7urlKc_e4',
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                email: 'orukari878@gmail.com',
                password: 'Tama@360180'
            })
        });

        if (!authRes.ok) {
            console.error('Auth failed:', authRes.status, await authRes.text());
            return;
        }

        const authData = await authRes.json();
        console.log('Auth success!');
        const token = authData.access_token;

        const base64Url = token.split('.')[1];
        const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
        const payload = JSON.parse(Buffer.from(base64, 'base64').toString());
        console.log('JWT Claims tenant_id:', payload.tenant_id);
        console.log('JWT Claims user_role:', payload.user_role);

        const subRes = await fetch('https://urqygjltionvaxuacfzr.supabase.co/rest/v1/subscriptions?select=*', {
            headers: {
                'apikey': 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVycXlnamx0aW9udmF4dWFjZnpyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzcwMzEzMDEsImV4cCI6MjA5MjYwNzMwMX0.Vpk7rifsfjMCVBSYpEdVzkHv3w324iKp8B7urlKc_e4',
                'Authorization': `Bearer ${token}`
            }
        });

        if (!subRes.ok) {
            console.error('Sub fetch failed:', subRes.status, await subRes.text());
            return;
        }

        console.log('Subscription Data:', await subRes.json());
    } catch (e) {
        console.error(e);
    }
}

run();
