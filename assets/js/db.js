/**
 * Graviton CMS - Database Layer (Dexie.js)
 * Manages local persistence with IndexedDB
 */

const db = new Dexie('GravitonDB');
window.db = db; // Expose to console for administration

// Define Schema
db.version(1).stores({
    profiles: 'id, full_name, role, assigned_id, updated_at, is_synced',
    students: 'student_id, name, gender, class_name, status, updated_at, is_synced',
    classes: 'id, name, level, updated_at, is_synced',
    subjects: 'id, name, type, credits, updated_at, is_synced',
    subject_assignments: 'id, teacher_id, subject_id, class_name, updated_at, is_synced',
    form_teachers: 'id, teacher_id, class_name, updated_at, is_synced',
    scores: 'id, student_id, subject_id, term, session, updated_at, is_synced',
    attendance: 'id, student_id, date, status, updated_at, is_synced'
});

db.version(2).stores({
    notices: 'id, title, is_active, updated_at, is_synced'
});

db.version(3).stores({
    scores: 'id, student_id, subject_id, term, session, rank, updated_at, is_synced'
});

db.version(4).stores({
    students: 'student_id, name, gender, address, class_name, status, updated_at, is_synced'
});

db.version(5).stores({
    cbt_exams: 'id, title, subject_id, class_name, teacher_id, date, duration, status, updated_at, is_synced',
    cbt_questions: 'id, exam_id, question_text, option_a, option_b, option_c, option_d, correct_option, updated_at, is_synced'
});

db.version(8).stores({
    subject_assignments: 'id, teacher_id, subject_id, class_name, specialization, updated_at, is_synced',
    cbt_exams: 'id, title, subject_id, class_name, teacher_id, mode, term, session, score_field, date, start_time, end_time, duration, status, updated_at, is_synced',
    cbt_questions: 'id, exam_id, question_text, option_a, option_b, option_c, option_d, option_e, correct_option, updated_at, is_synced',
    cbt_results: 'id, exam_id, student_id, score, total_questions, answers, warnings, updated_at, is_synced',
    exam_progress: 'id, exam_id, student_id, current_answers, time_left, last_saved'
});

/**
 * Smart ID Generation
 * Format: SMS/YEAR/INCREMENT (e.g., SMS/2026/104)
 */
export async function generateStudentId() {
    const year = new Date().getFullYear();
    const prefix = `SMS/${year}/`;
    
    // Find all students for this year
    const students = await db.students
        .filter(s => s.student_id.startsWith(prefix))
        .toArray();
    
    let maxId = 100; // Starting number
    
    students.forEach(s => {
        const parts = s.student_id.split('/');
        const num = parseInt(parts[2]);
        if (!isNaN(num) && num > maxId) {
            maxId = num;
        }
    });
    
    return `${prefix}${maxId + 1}`;
}

/**
 * Mark record for synchronization
 */
export function prepareForSync(data) {
    return {
        ...data,
        updated_at: new Date().toISOString(),
        is_synced: 0 // 0 for false, 1 for true (IndexedDB handles integers better for filtering)
    };
}

export default db;
