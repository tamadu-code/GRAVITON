/**
 * ATTENDANCE EXPORT SCRIPT
 * Run this in your browser console to export the last 30 days of attendance
 */
async function exportAttendance() {
    console.log("Starting export...");
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    
    // 1. Fetch Students (for name mapping)
    const students = await db.students.toArray();
    const studentMap = {};
    students.forEach(s => {
        const id = String(s.student_id || '').trim();
        studentMap[id] = { name: s.name, class: s.class_name };
        
        // Also map by numeric suffix if available
        const suffix = id.split('-').pop();
        if (suffix) studentMap[suffix] = { name: s.name, class: s.class_name };
    });

    // 2. Fetch Records
    const records = await db.attendance_records.where('date').aboveOrEqual(thirtyDaysAgo).toArray();
    
    // 3. Map names and classes
    const enriched = records.map(r => {
        const rid = String(r.student_id || '').trim();
        const info = studentMap[rid] || { name: "Unknown", class: "Unknown" };
        return {
            date: r.date,
            student_id: rid,
            student_name: info.name,
            class_name: info.class,
            status: r.status,
            subject: r.subject_name || 'N/A'
        };
    });

    console.log(`Exported ${enriched.length} records.`);
    
    // 4. Download as JSON
    const blob = new Blob([JSON.stringify(enriched, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `attendance_export_${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
    
    console.log("Download triggered. Please upload the resulting file here.");
}

exportAttendance();
