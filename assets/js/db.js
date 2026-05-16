import Dexie from 'https://cdn.jsdelivr.net/npm/dexie@3/dist/dexie.mjs';

const db = new Dexie('GravitonDB');

// Version History:
// 1-27: Core LMS tables (students, attendance, scores, etc.)
// 28-29: Profile and security updates
// 30: Basic CBT infrastructure
// 31: Unified Multi-Subject CBT Support
// 32+: Audit logs and future expansions

db.version(30).stores({
    cbt_question_bank: 'id, subject_id, question_text, topic_area, difficulty_level, updated_at, is_synced',
    cbt_options: 'id, question_id, option_label, option_text, is_correct, updated_at, is_synced',
    cbt_exam_questions: 'id, exam_id, question_id, question_number, [exam_id+question_id], updated_at, is_synced',
    cbt_exams: 'id, title, subject_id, class_name, teacher_id, mode, term, session, score_field, date, start_time, end_time, duration, status, updated_at, is_synced'
});

db.version(31).stores({
    cbt_exams: 'id, title, subject_id, class_name, teacher_id, mode, term, session, score_field, date, start_time, end_time, duration, status, is_unified, updated_at, is_synced',
    cbt_exam_sections: 'id, exam_id, subject_id, score_field, question_count, target_mark, updated_at, is_synced'
});

db.version(32).stores({
    audit_logs: 'id, operation, table, record_id, timestamp, user_id, is_synced'
});

// Final stable schema for Unified CBT + Comprehension Support + Class Filtering
db.version(37).stores({
    profiles: 'id, full_name, role, assigned_id, email, status, updated_at, is_synced',
    students: 'student_id, name, gender, address, class_name, status, is_active, deactivated_at, attendance_code, admission_year, sub_class, legacy_student_id, updated_at, is_synced',
    classes: 'id, name, level, updated_at, is_synced',
    subjects: 'id, name, type, credits, updated_at, is_synced',
    subject_assignments: 'id, teacher_id, subject_id, class_name, specialization, updated_at, is_synced',
    form_teachers: 'id, teacher_id, class_name, updated_at, is_synced',
    scores: 'id, student_id, subject_id, term, session, class_name, [student_id+subject_id+term+session], updated_at, is_synced',
    attendance: 'id, student_id, date, status, sign_in, sign_out, is_late, updated_at, is_synced',
    attendance_records: 'id, student_id, date, status, term, session, [student_id+term+session], subject_name, period_number, is_subject_based, updated_at, is_synced',
    settings: 'id, key, value, updated_at, is_synced',
    cbt_exams: 'id, title, subject_id, class_name, teacher_id, mode, term, session, score_field, date, start_time, end_time, duration, status, is_unified, updated_at, is_synced',
    cbt_exam_sections: 'id, exam_id, subject_id, class_name, score_field, question_count, target_mark, updated_at, is_synced',
    cbt_question_bank: 'id, subject_id, class_name, question_text, passage_text, topic_area, difficulty_level, updated_at, is_synced',
    cbt_options: 'id, question_id, option_label, option_text, is_correct, updated_at, is_synced',
    cbt_exam_questions: 'id, exam_id, question_id, question_number, [exam_id+question_id], updated_at, is_synced',
    cbt_questions: 'id, exam_id, question_text, passage_text, option_a, option_b, option_c, option_d, option_e, correct_option, marks, updated_at, is_synced',
    cbt_results: 'id, exam_id, student_id, [student_id+exam_id], score, total_questions, total_marks, answers, warnings, violations, started_at, status, updated_at, is_synced',
    audit_logs: 'id, operation, table, record_id, timestamp, user_id, is_synced'
});

db.on('versionchange', (event) => {
    console.warn('Database upgrade pending. Closing connections...');
    db.close(); 
    window.location.reload(); 
    return false; 
});

export async function generateStudentId() {
    const year = new Date().getFullYear();
    const prefix = 'NKQMS';
    const count = await db.students.where('admission_year').equals(year).count();
    const sequence = (count + 1).toString().padStart(4, '0');
    const studentId = `${prefix}-${year}-${sequence}`;
    const attendanceCode = Math.floor(100000 + Math.random() * 900000).toString();
    return { student_id: studentId, attendance_code: attendanceCode, admission_year: year };
}

export function prepareForSync(data) {
    const sanitized = { ...data };
    Object.keys(sanitized).forEach(key => { if (sanitized[key] === "") sanitized[key] = null; });
    return { ...sanitized, updated_at: new Date().toISOString(), is_synced: 0 };
}

export default db;
