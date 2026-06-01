const url = 'https://urqygjltionvaxuacfzr.supabase.co';
const key = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVycXlnamx0aW9udmF4dWFjZnpyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzcwMzEzMDEsImV4cCI6MjA5MjYwNzMwMX0.Vpk7rifsfjMCVBSYpEdVzkHv3w324iKp8B7urlKc_e4';

async function main() {
    console.log('Fetching students from Supabase...');
    const res = await fetch(`${url}/rest/v1/students?select=student_id,name,class_name&limit=10`, {
        headers: {
            'apikey': key,
            'Content-Type': 'application/json'
        }
    });
    if (!res.ok) {
        console.error('Error fetching students:', await res.json());
        return;
    }
    const students = await res.json();
    console.log('Students found:');
    console.log(JSON.stringify(students, null, 2));
}

main().catch(console.error);
