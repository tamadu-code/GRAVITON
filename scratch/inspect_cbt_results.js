const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = 'https://urqygjltionvaxuacfzr.supabase.co';
const ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVycXlnamx0aW9udmF4dWFjZnpyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzcwMzEzMDEsImV4cCI6MjA5MjYwNzMwMX0.Vpk7rifsfjMCVBSYpEdVzkHv3w324iKp8B7urlKc_e4';

const supabase = createClient(SUPABASE_URL, ANON_KEY);

async function inspect() {
    try {
        const { data, error } = await supabase.from('cbt_results').select('*').limit(1);
        if (error) {
            console.error('Error fetching cbt_results:', error);
        } else {
            console.log('Successfully fetched cbt_results row:', data);
            if (data && data.length > 0) {
                console.log('Columns in cbt_results:', Object.keys(data[0]));
            } else {
                console.log('No rows in cbt_results table.');
            }
        }
    } catch (e) {
        console.error('Inspection failed:', e);
    }
}

inspect();
