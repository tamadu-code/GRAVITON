const url = 'https://urqygjltionvaxuacfzr.supabase.co';
const key = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVycXlnamx0aW9udmF4dWFjZnpyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzcwMzEzMDEsImV4cCI6MjA5MjYwNzMwMX0.Vpk7rifsfjMCVBSYpEdVzkHv3w324iKp8B7urlKc_e4';

async function main() {
    console.log(`[Query] Fetching all profiles from Supabase...`);

    const res = await fetch(`${url}/rest/v1/profiles?select=*`, {
        method: 'GET',
        headers: {
            'apikey': key,
            'Content-Type': 'application/json'
        }
    });

    if (!res.ok) {
        console.error('Failed to query profiles:', await res.json());
        return;
    }

    const data = await res.json();
    console.log('\n--- ALL PROFILES ---');
    data.forEach(p => {
        console.log(`ID: ${p.id} | Name: ${p.full_name} | Role: ${p.role} | Email: ${p.email} | Staff ID: ${p.assigned_id}`);
    });
}

main().catch(console.error);
