/**
 * Graviton CMS - Database Layer (Dexie.js)
 * Manages local persistence with IndexedDB
 */

const db = new Dexie('GravitonDB');
window.db = db; // Expose to console for administration

// Define Schema
db.version(1).stores({
    profiles: 'id, full_name, role, assigned_id, updated_at, is_synced',
    students: 'student_id, name, gender, class_name, status, legacy_id, updated_at, is_synced',
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
    students: 'student_id, name, gender, address, class_name, status, is_active, updated_at, is_synced'
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

db.version(12).stores({
    students: 'student_id, name, gender, address, class_name, status, is_active, attendance_code, admission_year, sub_class, updated_at, is_synced',
    attendance_records: 'id, student_id, date, status, subject_name, period_number, is_subject_based, updated_at, is_synced',
    timetable: 'id, class_name, day_of_week, period_number, subject_id, teacher_id, [class_name+day_of_week+period_number], updated_at, is_synced',
    settings: 'id, key, value, updated_at, is_synced'
});

db.version(13).stores({
    notices: 'id, title, target, category, is_active, updated_at, is_synced',
    students: 'student_id, name, gender, address, class_name, status, is_active, attendance_code, admission_year, sub_class, updated_at, is_synced',
    attendance_records: 'id, student_id, date, status, subject_name, period_number, is_subject_based, updated_at, is_synced',
    timetable: 'id, class_name, day_of_week, period_number, subject_id, teacher_id, [class_name+day_of_week+period_number], updated_at, is_synced',
    settings: 'id, key, value, updated_at, is_synced'
});

db.version(17).stores({
    notices: 'id, title, target, category, is_active, updated_at, is_synced',
    students: 'student_id, name, gender, address, class_name, status, is_active, attendance_code, admission_year, sub_class, updated_at, is_synced',
    attendance_records: 'id, student_id, date, status, subject_name, period_number, is_subject_based, updated_at, is_synced',
    timetable: 'id, class_name, day_of_week, period_number, subject_id, teacher_id, [class_name+day_of_week+period_number], updated_at, is_synced',
    settings: 'id, key, value, updated_at, is_synced',
    pins: 'id, pin_code, serial, status, student_id, term, session, used_count, usage_limit, updated_at, is_synced',
    payments: 'id, student_id, amount, category, term, session, reference, status, date, updated_at, is_synced',
    fee_structures: 'id, class_name, amount, term, session, category, updated_at, is_synced',
    student_analytics: 'student_id, average, rank, fee_balance, attendance_rate, updated_at, is_synced',
    audit_logs: 'id, operation, table, record_id, timestamp, user_id, is_synced',
    duty_assignments: 'id, staff_id, week_start, week_end, duty_type, updated_at, is_synced',
    parent_links: 'id, parent_id, student_id, relationship, updated_at, is_synced',
    cbt_exams: 'id, title, subject_id, class_name, teacher_id, mode, term, session, score_field, date, start_time, end_time, duration, status, updated_at, is_synced',
    cbt_questions: 'id, exam_id, question_text, option_a, option_b, option_c, option_d, option_e, correct_option, updated_at, is_synced',
    cbt_results: 'id, exam_id, student_id, score, total_questions, answers, warnings, updated_at, is_synced',
    exam_progress: 'id, exam_id, student_id, current_answers, time_left, last_saved'
});

db.version(18).stores({
    profiles: 'id, full_name, role, assigned_id, email, status, updated_at, is_synced'
});

db.version(19).stores({
    students: 'student_id, name, gender, address, class_name, status, is_active, attendance_code, admission_year, sub_class, legacy_id, updated_at, is_synced'
});



/**
 * Smart ID Generation
 * Format: NKQMS-{year}-{attendance_code}
 */
export async function generateStudentId() {
    const year = new Date().getFullYear();
    const prefix = 'NKQMS';
    
    // Get count of students for this year to generate sequential suffix
    const count = await db.students.where('admission_year').equals(year).count();
    const sequence = (count + 1).toString().padStart(4, '0');
    
    const studentId = `${prefix}-${year}-${sequence}`;
    const attendanceCode = Math.floor(100000 + Math.random() * 900000).toString(); // 6-digit code
    
    return {
        student_id: studentId,
        attendance_code: attendanceCode,
        admission_year: year
    };
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
