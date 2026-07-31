(async () => {
    const database = window.db;
    if (!database) {
        console.error("Database 'db' not found. Run this on the Graviton LMS page console.");
        return;
    }
    
    try {
        const students = await database.students.toArray();
        let demotedCount = 0;
        let reactivatedCount = 0;
        let skippedCount = 0;

        console.log(`Found ${students.length} total students. Processing...`);

        for (const s of students) {
            const currentClass = (s.class_name || '').toUpperCase().trim();
            let newClass = '';

            // Graduated students → back to SSS 3
            if (s.status === 'Graduated' || currentClass === 'GRADUATED' || Number(s.is_active) === 0) {
                newClass = 'SSS 3';
                s.class_name = newClass;
                s.status = 'Active';
                s.is_active = 1;
                s.deactivated_at = null;
                s.updated_at = new Date().toISOString();
                s.is_synced = 0;
                await database.students.put(s);
                reactivatedCount++;
                console.log(`  ↩ Reactivated: ${s.name} → SSS 3`);
            }
            // Demote by one class
            else if (currentClass === 'JSS 2' || currentClass === 'JS 2') newClass = 'JSS 1';
            else if (currentClass === 'JSS 3' || currentClass === 'JS 3') newClass = 'JSS 2';
            else if (currentClass === 'SSS 1' || currentClass === 'SS 1') newClass = 'JSS 3';
            else if (currentClass === 'SSS 2' || currentClass === 'SS 2') newClass = 'SSS 1';
            else if (currentClass === 'SSS 3' || currentClass === 'SS 3') newClass = 'SSS 2';

            if (newClass && s.status !== 'Active') {
                // Already handled above for graduated
            } else if (newClass && currentClass !== 'GRADUATED') {
                s.class_name = newClass;
                s.updated_at = new Date().toISOString();
                s.is_synced = 0;
                await database.students.put(s);
                demotedCount++;
                console.log(`  ⬇ Demoted: ${s.name} (${currentClass} → ${newClass})`);
            } else if (!newClass && currentClass === 'JSS 1') {
                skippedCount++;
                console.log(`  ⏭ Skipped (already JSS 1): ${s.name}`);
            } else {
                skippedCount++;
                console.log(`  ⏭ Skipped (no match): ${s.name} [${currentClass}]`);
            }
        }

        console.log(`\n✅ Done! Demoted: ${demotedCount} | Reactivated: ${reactivatedCount} | Skipped: ${skippedCount}`);
        alert(`Demotion complete!\n\n⬇ Demoted: ${demotedCount} students\n↩ Reactivated: ${reactivatedCount} graduated students\n⏭ Skipped: ${skippedCount} students\n\nPage will reload.`);
        window.location.reload();
    } catch (err) {
        console.error("Demotion failed:", err);
        alert("Demotion failed: " + err.message);
    }
})();
