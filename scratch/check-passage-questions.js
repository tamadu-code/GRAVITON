const url = 'https://urqygjltionvaxuacfzr.supabase.co/rest/v1/cbt_questions?select=*&passage_text=not.is.null&limit=10';
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
    console.log('Found questions with passages:', data.length);
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
