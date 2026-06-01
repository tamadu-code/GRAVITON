const url = 'https://urqygjltionvaxuacfzr.supabase.co/rest/v1/students?select=student_id,name&limit=10';
const key = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVycXlnamx0aW9udmF4dWFjZnpyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzcwMzEzMDEsImV4cCI6MjA5MjYwNzMwMX0.Vpk7rifsfjMCVBSYpEdVzkHv3w324iKp8B7urlKc_e4';

fetch(url, {
    headers: {
        'apikey': key,
        'Authorization': `Bearer ${key}`
    }
})
.then(res => res.json())
.then(data => {
    console.log('Students found:');
    console.log(JSON.stringify(data, null, 2));
})
.catch(err => {
    console.error('Error fetching students:', err);
});
