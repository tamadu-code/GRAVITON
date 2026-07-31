// === SCORE CLASS_NAME DIAGNOSTIC & REPAIR ===
// Run this in the browser console on the Graviton LMS page
// Step 1: Diagnose - shows how many scores are missing class_name
// Step 2: Repair - fills in class_name from student records where possible

(async () => {
    const database = window.db;
    if (!database) {
        console.error("Database 'db' not found. Run this on the Graviton LMS page.");
        return;
    }

    try {
        // === STEP 1: DIAGNOSE ===
        const allScores = await database.scores.toArray();
        const allStudents = await database.students.toArray();
        
        const studentMap = {};
        allStudents.forEach(s => { studentMap[s.student_id] = s; });

        const missing = allScores.filter(s => !s.class_name);
        const hasClass = allScores.filter(s => s.class_name);

        console.log(`\n========== SCORE CLASS_NAME DIAGNOSTIC ==========`);
        console.log(`Total scores: ${allScores.length}`);
        console.log(`With class_name: ${hasClass.length}`);
        console.log(`Missing class_name: ${missing.length}`);
        console.log(`=================================================\n`);

        if (missing.length === 0) {
            console.log('✅ All scores have class_name set. No repair needed.');
            
            // Show sample of what class_names look like
            const classCounts = {};
            allScores.forEach(s => {
                const cn = s.class_name || 'EMPTY';
                classCounts[cn] = (classCounts[cn] || 0) + 1;
            });
            console.log('Score distribution by class_name:');
            console.table(classCounts);
            return;
        }

        // Show sample of missing scores
        console.log('Sample of scores MISSING class_name:');
        console.table(missing.slice(0, 5).map(s => ({
            id: s.id,
            student_id: s.student_id,
            subject_id: s.subject_id,
            term: s.term,
            session: s.session,
            class_name: s.class_name || '(EMPTY)',
            total: s.total
        })));

        // === STEP 2: REPAIR ===
        console.log(`\n🔧 Repairing ${missing.length} scores with missing class_name...`);
        
        let repairedCount = 0;
        let unreparableCount = 0;

        for (const score of missing) {
            const student = studentMap[score.student_id];
            if (student && student.class_name) {
                // Use the student's current class_name as fallback
                // This is the best we can do without enrollment history
                score.class_name = student.class_name;
                score.updated_at = new Date().toISOString();
                score.is_synced = 0;
                await database.scores.put(score);
                repairedCount++;
            } else {
                unreparableCount++;
                console.warn(`  ⚠ Cannot repair score ${score.id} - student ${score.student_id} not found`);
            }
        }

        console.log(`\n✅ Repair complete!`);
        console.log(`   Repaired: ${repairedCount}`);
        console.log(`   Could not repair: ${unreparableCount}`);
        
        // Show final distribution
        const updatedScores = await database.scores.toArray();
        const classCounts = {};
        updatedScores.forEach(s => {
            const cn = s.class_name || 'STILL EMPTY';
            classCounts[cn] = (classCounts[cn] || 0) + 1;
        });
        console.log('\nScore distribution by class_name after repair:');
        console.table(classCounts);

        alert(`Diagnostic & Repair Complete!\n\n📊 Total scores: ${allScores.length}\n✅ Already had class_name: ${hasClass.length}\n🔧 Repaired: ${repairedCount}\n⚠ Could not repair: ${unreparableCount}`);

    } catch (err) {
        console.error("Script failed:", err);
        alert("Failed: " + err.message);
    }
})();
