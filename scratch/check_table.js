async function run() {
    try {
        const res = await fetch('https://urqygjltionvaxuacfzr.supabase.co/rest/v1/plans?select=*', {
            headers: {
                'apikey': 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVycXlnamx0aW9udmF4dWFjZnpyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzcwMzEzMDEsImV4cCI6MjA5MjYwNzMwMX0.Vpk7rifsfjMCVBSYpEdVzkHv3w324iKp8B7urlKc_e4'
            }
        });
        console.log('Status:', res.status);
        console.log('Plans:', await res.json());
    } catch (e) {
        console.error(e);
    }
}
run();
