/**
 * One-time script: Pull sub_class (A/B) from the Attendance System
 * and update the SMS students table.
 * 
 * Usage: Set environment variables then run:
 *   node scratch/sync_subclasses.js
 * 
 * Required env vars:
 *   SUPABASE_URL          - SMS Supabase project URL
 *   SUPABASE_SERVICE_KEY  - SMS service_role key
 *   ATTENDANCE_URL        - Attendance Supabase project URL
 *   ATTENDANCE_KEY        - Attendance anon/service key
 */

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY;
const ATTENDANCE_URL = process.env.ATTENDANCE_URL;
const ATTENDANCE_KEY = process.env.ATTENDANCE_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY || !ATTENDANCE_URL || !ATTENDANCE_KEY) {
    console.error('Missing environment variables. Please set SUPABASE_URL, SUPABASE_SERVICE_KEY, ATTENDANCE_URL, ATTENDANCE_KEY');
    process.exit(1);
}

async function main() {
    console.log('=== Sub-Class Sync: Attendance System → SMS ===\n');

    // 1. Fetch all students from Attendance System
    console.log('Fetching students from Attendance System...');
    const attRes = await fetch(`${ATTENDANCE_URL}/rest/v1/students?select=name,code,class`, {
        headers: {
            'apikey': ATTENDANCE_KEY,
            'Authorization': `Bearer ${ATTENDANCE_KEY}`,
        }
    });

    if (!attRes.ok) {
        console.error('Failed to fetch from Attendance System:', await attRes.text());
        process.exit(1);
    }

    const attStudents = await attRes.json();
    console.log(`Found ${attStudents.length} students in Attendance System.\n`);

    // 2. Fetch all SMS students who have an attendance_code
    console.log('Fetching students from SMS...');
    const smsRes = await fetch(`${SUPABASE_URL}/rest/v1/students?select=student_id,name,class_name,sub_class,attendance_code&attendance_code=not.is.null`, {
        headers: {
            'apikey': SUPABASE_KEY,
            'Authorization': `Bearer ${SUPABASE_KEY}`,
        }
    });

    if (!smsRes.ok) {
        console.error('Failed to fetch from SMS:', await smsRes.text());
        process.exit(1);
    }

    const smsStudents = await smsRes.json();
    console.log(`Found ${smsStudents.length} SMS students with attendance codes.\n`);

    // 3. Match and update
    let updated = 0;
    let skipped = 0;
    let notFound = 0;

    for (const sms of smsStudents) {
        // Find matching student in attendance system by code
        const attMatch = attStudents.find(a => String(a.code) === String(sms.attendance_code));

        if (!attMatch) {
            console.log(`  ⚠ No match for ${sms.name} (code: ${sms.attendance_code})`);
            notFound++;
            continue;
        }

        // Parse the attendance system class (e.g., "JSS 1A" -> class="JSS 1", sub="A")
        const fullClass = attMatch.class || '';
        const classMatch = fullClass.match(/^(.+?)\s?([A-Za-z])$/);

        if (!classMatch) {
            console.log(`  ⏭ ${sms.name}: class "${fullClass}" has no sub-class suffix. Skipping.`);
            skipped++;
            continue;
        }

        const baseClass = classMatch[1].trim();
        const subClass = classMatch[2].toUpperCase();

        // Only update if the SMS student doesn't already have the correct sub_class
        if (sms.sub_class === subClass) {
            console.log(`  ✓ ${sms.name}: already has sub_class=${subClass}. Skipping.`);
            skipped++;
            continue;
        }

        console.log(`  → ${sms.name}: "${sms.class_name}" → class_name="${baseClass}", sub_class="${subClass}"`);

        // Update SMS
        const updateRes = await fetch(
            `${SUPABASE_URL}/rest/v1/students?student_id=eq.${encodeURIComponent(sms.student_id)}`,
            {
                method: 'PATCH',
                headers: {
                    'apikey': SUPABASE_KEY,
                    'Authorization': `Bearer ${SUPABASE_KEY}`,
                    'Content-Type': 'application/json',
                    'Prefer': 'return=minimal',
                },
                body: JSON.stringify({
                    class_name: baseClass,
                    sub_class: subClass,
                }),
            }
        );

        if (updateRes.ok) {
            updated++;
        } else {
            console.error(`    ✗ Failed to update ${sms.name}:`, await updateRes.text());
        }
    }

    console.log('\n=== Summary ===');
    console.log(`Updated:   ${updated}`);
    console.log(`Skipped:   ${skipped}`);
    console.log(`Not Found: ${notFound}`);
    console.log('Done!');
}

main().catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
});
