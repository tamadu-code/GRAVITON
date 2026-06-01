const url = 'https://urqygjltionvaxuacfzr.supabase.co';
const key = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVycXlnamx0aW9udmF4dWFjZnpyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzcwMzEzMDEsImV4cCI6MjA5MjYwNzMwMX0.Vpk7rifsfjMCVBSYpEdVzkHv3w324iKp8B7urlKc_e4';

async function main() {
    console.log('Fetching parent profiles from Supabase...');
    const profRes = await fetch(`${url}/rest/v1/profiles?role=eq.Parent`, {
        headers: {
            'apikey': key,
            'Content-Type': 'application/json'
        }
    });
    if (profRes.ok) {
        const profiles = await profRes.json();
        console.log('Parent profiles:', JSON.stringify(profiles, null, 2));
    } else {
        console.error('Error fetching parent profiles:', await profRes.json());
    }

    console.log('Fetching parent_links from Supabase...');
    const linkRes = await fetch(`${url}/rest/v1/parent_links`, {
        headers: {
            'apikey': key,
            'Content-Type': 'application/json'
        }
    });
    if (linkRes.ok) {
        const links = await linkRes.json();
        console.log('Parent links:', JSON.stringify(links, null, 2));
    } else {
        console.error('Error fetching parent links:', await linkRes.json());
    }
}

main().catch(console.error);
