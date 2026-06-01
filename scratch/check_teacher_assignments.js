const url = 'https://urqygjltionvaxuacfzr.supabase.co';
const key = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVycXlnamx0aW9udmF4dWFjZnpyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzcwMzEzMDEsImV4cCI6MjA5MjYwNzMwMX0.Vpk7rifsfjMCVBSYpEdVzkHv3w324iKp8B7urlKc_e4';

async function main() {
    const id1 = '4c739ecc-9643-45f7-8687-badca4480252';
    const id2 = '2654293d-835e-4351-926c-1eb8fa07ac91';

    console.log(`[Query] Querying subject assignments for AMAMINA IFIYEMI OGARA...`);

    const res1 = await fetch(`${url}/rest/v1/subject_assignments?teacher_id=eq.${id1}`, {
        method: 'GET',
        headers: { 'apikey': key, 'Content-Type': 'application/json' }
    });
    const assignments1 = await res1.json();
    console.log(`UUID ${id1} (email: null) assignments:`, assignments1.length);

    const res2 = await fetch(`${url}/rest/v1/subject_assignments?teacher_id=eq.${id2}`, {
        method: 'GET',
        headers: { 'apikey': key, 'Content-Type': 'application/json' }
    });
    const assignments2 = await res2.json();
    console.log(`UUID ${id2} (email: ogaraifiyemi@yahoo.com) assignments:`, assignments2.length);
}

main().catch(console.error);
