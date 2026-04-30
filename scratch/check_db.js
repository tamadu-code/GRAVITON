
import db from './assets/js/db.js';

async function checkAttendance() {
    try {
        const records = await db.attendance_records.limit(5).toArray();
        console.log('Sample Attendance Records:', JSON.stringify(records, null, 2));
    } catch (e) {
        console.error('Error checking DB:', e);
    }
}

checkAttendance();
