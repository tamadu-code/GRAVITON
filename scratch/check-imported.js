// Let's inspect the local IndexedDB database to see the parsed questions.
// Since we are running under Node, we can't directly open Dexie/IndexedDB, but we can write a script
// that the browser can execute, or we can look at the data if we can query it.
// Wait! We can write a JS snippet that runs in the browser console.
// Or we can check the database structure via the background sync if we have a way.
// Let's write a browser-executable script that we can instruct the user to run, or we can inspect the database.
// Wait, we can query Supabase cbt_questions for the latest exam!
// That will tell us exactly what was synced to the cloud!
// Let's query the database using fetch.

const url = 'https://urqygjltionvaxuacfzr.supabase.co/rest/v1/cbt_questions?select=*&order=updated_at.desc&limit=10';
const key = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVycXlnamx0aW9udmF4dWFjZnpyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzcwMzEzMDEsImV4cCI6MjA5MjYwNzMwMX0.Vpk7rifsfjMCVBSYpEdVzkHv3w324iKp8B7urlKc_e4';

async function run() {
  try {
    const res = await fetch(url, {
      method: 'GET',
      headers: {
        'apikey': key,
        'Authorization': `Bearer ${key}`
      }
    });
    console.log('Status:', res.status);
    const data = await res.json();
    console.log('Latest 10 questions in cloud:');
    data.forEach((q, idx) => {
      console.log(`\n--- Question ${idx + 1} ---`);
      console.log(`ID: ${q.id}`);
      console.log(`Exam ID: ${q.exam_id}`);
      console.log(`Question: ${q.question_text}`);
      console.log(`Passage: ${q.passage_text}`);
      console.log(`A: ${q.option_a}`);
      console.log(`B: ${q.option_b}`);
      console.log(`C: ${q.option_c}`);
      console.log(`D: ${q.option_d}`);
      console.log(`Correct: ${q.correct_option}`);
    });
  } catch (e) {
    console.error('Fetch error:', e);
  }
}

run();
