import Dexie from 'https://cdn.jsdelivr.net/npm/dexie@3/dist/dexie.mjs';

const db = new Dexie('GravitonDB');

// Version History:
// 1-27: Core LMS tables (students, attendance, scores, etc.)
// 28-29: Profile and security updates
// 30: Basic CBT infrastructure
// 31: Unified Multi-Subject CBT Support
// 32+: Audit logs and future expansions
// 37: Unified CBT + Comprehension Support + Class Filtering
// 38: RESTORATION OF ALL MISSING CORE TABLES

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

// Final consolidated schema for Graviton Core v25.6
db.version(40).stores({
    // --- CORE IDENTITY & ACCESS ---
    profiles: 'id, full_name, role, assigned_id, email, status, updated_at, is_synced',
    students: 'student_id, name, gender, address, class_name, status, is_active, deactivated_at, attendance_code, admission_year, sub_class, legacy_student_id, updated_at, is_synced',
    parent_links: 'id, parent_id, student_id, updated_at, is_synced',
    
    // --- ACADEMIC STRUCTURE ---
    classes: 'id, name, level, updated_at, is_synced',
    subjects: 'id, name, type, credits, updated_at, is_synced',
    subject_assignments: 'id, teacher_id, subject_id, class_name, specialization, updated_at, is_synced',
    form_teachers: 'id, teacher_id, class_name, updated_at, is_synced',
    timetable: 'id, class_name, day_of_week, period_number, subject_id, teacher_id, updated_at, is_synced',
    
    // --- PERFORMANCE & RECORDS ---
    scores: 'id, student_id, subject_id, term, session, class_name, [student_id+subject_id+term+session], updated_at, is_synced',
    student_analytics: 'student_id, average, rank, fee_balance, attendance_rate, updated_at, is_synced',
    
    // --- ATTENDANCE & TRACKING ---
    attendance: 'id, student_id, date, status, sign_in, sign_out, is_late, updated_at, is_synced',
    attendance_records: 'id, student_id, date, status, term, session, [student_id+term+session], subject_name, period_number, is_subject_based, updated_at, is_synced',
    biometric_data: 'id, student_id, biometric_hash, updated_at, is_synced',
    staggered_signout_queue: 'id, student_id, requested_at, status, updated_at, is_synced',
    staggered_signout_logs: 'id, student_id, signed_out_at, updated_at, is_synced',
    
    // --- COMPUTER BASED TESTING (CBT) ---
    cbt_exams: 'id, title, subject_id, class_name, teacher_id, mode, term, session, score_field, date, start_time, end_time, duration, status, is_unified, updated_at, is_synced',
    cbt_exam_sections: 'id, exam_id, subject_id, class_name, score_field, question_count, target_mark, updated_at, is_synced',
    cbt_question_bank: 'id, subject_id, class_name, term, session, question_text, passage_text, topic_area, difficulty_level, updated_at, is_synced',
    cbt_options: 'id, question_id, option_label, option_text, is_correct, updated_at, is_synced',
    cbt_exam_questions: 'id, exam_id, question_id, question_number, [exam_id+question_id], updated_at, is_synced',
    cbt_questions: 'id, exam_id, question_text, passage_text, option_a, option_b, option_c, option_d, option_e, correct_option, marks, updated_at, is_synced',
    cbt_results: 'id, exam_id, student_id, [student_id+exam_id], score, total_questions, total_marks, answers, warnings, violations, started_at, status, updated_at, is_synced',
    exam_progress: 'id, exam_id, student_id, [student_id+exam_id], current_question, answers, started_at, updated_at, is_synced',
    
    // --- COMMUNICATION & NOTICES ---
    notices: 'id, title, content, category, target, is_active, updated_at, is_synced',
    notices_read: 'id, notice_id, user_id, read_at, updated_at, is_synced',
    duty_assignments: 'id, staff_id, duty_type, week_start, week_end, updated_at, is_synced',
    
    // --- FINANCE & INVENTORY ---
    payments: 'id, student_id, amount, date, term, session, category, updated_at, is_synced',
    fee_items: 'id, name, amount, category, updated_at, is_synced',
    fee_balances: 'id, student_id, balance, updated_at, is_synced',
    fee_structures: 'id, class_name, amount, term, session, category, updated_at, is_synced',
    pins: 'id, pin_code, serial, status, student_id, term, session, used_count, usage_limit, updated_at, is_synced',
    receipts: 'id, student_id, amount, date, details, updated_at, is_synced',
    inventory: 'id, item_name, category, quantity, unit, updated_at, is_synced',
    inventory_transactions: 'id, item_id, type, quantity, reason, date, updated_at, is_synced',
    
    // --- LOGISTICS & ADMIN ---
    id_card_batches: 'id, name, status, updated_at, is_synced',
    id_card_requests: 'id, student_id, status, batch_id, updated_at, is_synced',
    id_card_print_queue: 'id, student_id, status, updated_at, is_synced',
    settings: 'id, key, value, updated_at, is_synced',
    audit_logs: 'id, operation, table, record_id, timestamp, user_id, is_synced'
});

// Version 41: Multi-Tenancy Indexing Support
db.version(41).stores({
    // --- CORE IDENTITY & ACCESS ---
    profiles: 'id, full_name, role, assigned_id, email, status, tenant_id, updated_at, is_synced',
    students: 'student_id, name, gender, address, class_name, status, is_active, deactivated_at, attendance_code, admission_year, sub_class, legacy_student_id, tenant_id, updated_at, is_synced',
    parent_links: 'id, parent_id, student_id, tenant_id, updated_at, is_synced',
    
    // --- ACADEMIC STRUCTURE ---
    classes: 'id, name, level, tenant_id, updated_at, is_synced',
    subjects: 'id, name, type, credits, tenant_id, updated_at, is_synced',
    subject_assignments: 'id, teacher_id, subject_id, class_name, specialization, tenant_id, updated_at, is_synced',
    form_teachers: 'id, teacher_id, class_name, tenant_id, updated_at, is_synced',
    timetable: 'id, class_name, day_of_week, period_number, subject_id, teacher_id, tenant_id, updated_at, is_synced',
    
    // --- PERFORMANCE & RECORDS ---
    scores: 'id, student_id, subject_id, term, session, class_name, [student_id+subject_id+term+session], tenant_id, updated_at, is_synced',
    student_analytics: 'student_id, average, rank, fee_balance, attendance_rate, tenant_id, updated_at, is_synced',
    
    // --- ATTENDANCE & TRACKING ---
    attendance: 'id, student_id, date, status, sign_in, sign_out, is_late, tenant_id, updated_at, is_synced',
    attendance_records: 'id, student_id, date, status, term, session, [student_id+term+session], subject_name, period_number, is_subject_based, tenant_id, updated_at, is_synced',
    biometric_data: 'id, student_id, biometric_hash, tenant_id, updated_at, is_synced',
    staggered_signout_queue: 'id, student_id, requested_at, status, tenant_id, updated_at, is_synced',
    staggered_signout_logs: 'id, student_id, signed_out_at, tenant_id, updated_at, is_synced',
    
    // --- COMPUTER BASED TESTING (CBT) ---
    cbt_exams: 'id, title, subject_id, class_name, teacher_id, mode, term, session, score_field, date, start_time, end_time, duration, status, is_unified, tenant_id, updated_at, is_synced',
    cbt_exam_sections: 'id, exam_id, subject_id, class_name, score_field, question_count, target_mark, tenant_id, updated_at, is_synced',
    cbt_question_bank: 'id, subject_id, class_name, term, session, question_text, passage_text, topic_area, difficulty_level, tenant_id, updated_at, is_synced',
    cbt_options: 'id, question_id, option_label, option_text, is_correct, tenant_id, updated_at, is_synced',
    cbt_exam_questions: 'id, exam_id, question_id, question_number, [exam_id+question_id], tenant_id, updated_at, is_synced',
    cbt_questions: 'id, exam_id, question_text, passage_text, option_a, option_b, option_c, option_d, option_e, correct_option, marks, tenant_id, updated_at, is_synced',
    cbt_results: 'id, exam_id, student_id, [student_id+exam_id], score, total_questions, total_marks, answers, warnings, violations, started_at, status, tenant_id, updated_at, is_synced',
    exam_progress: 'id, exam_id, student_id, [student_id+exam_id], current_question, answers, started_at, tenant_id, updated_at, is_synced',
    
    // --- COMMUNICATION & NOTICES ---
    notices: 'id, title, content, category, target, tenant_id, updated_at, is_synced',
    notices_read: 'id, notice_id, user_id, read_at, tenant_id, updated_at, is_synced',
    duty_assignments: 'id, staff_id, duty_type, week_start, week_end, tenant_id, updated_at, is_synced',
    
    // --- FINANCE & INVENTORY ---
    payments: 'id, student_id, amount, date, term, session, category, tenant_id, updated_at, is_synced',
    fee_items: 'id, name, amount, category, tenant_id, updated_at, is_synced',
    fee_balances: 'id, student_id, balance, tenant_id, updated_at, is_synced',
    fee_structures: 'id, class_name, amount, term, session, category, tenant_id, updated_at, is_synced',
    pins: 'id, pin_code, serial, status, student_id, term, session, used_count, usage_limit, tenant_id, updated_at, is_synced',
    receipts: 'id, student_id, amount, date, details, tenant_id, updated_at, is_synced',
    inventory: 'id, item_name, category, quantity, unit, tenant_id, updated_at, is_synced',
    inventory_transactions: 'id, item_id, type, quantity, reason, date, tenant_id, updated_at, is_synced',
    
    // --- LOGISTICS & ADMIN ---
    id_card_batches: 'id, name, status, tenant_id, updated_at, is_synced',
    id_card_requests: 'id, student_id, status, batch_id, tenant_id, updated_at, is_synced',
    id_card_print_queue: 'id, student_id, status, tenant_id, updated_at, is_synced',
    settings: 'id, key, value, tenant_id, updated_at, is_synced',
    audit_logs: 'id, operation, table, record_id, timestamp, user_id, tenant_id, is_synced'
});

db.audit_logs.hook('creating', (primKey, obj, transaction) => {
    const tenantId = localStorage.getItem('tenant_id');
    if (tenantId && obj.tenant_id === undefined) {
        obj.tenant_id = tenantId;
    }
    if (!obj.timestamp) {
        obj.timestamp = new Date().toISOString();
    }
    obj.is_synced = 0;
});

db.on('versionchange', (event) => {
    console.warn('Database upgrade pending. Closing connections...');
    db.close(); 
    window.location.reload(); 
    return false; 
});

export async function generateStudentId() {
    const year = new Date().getFullYear();
    const prefix = localStorage.getItem('tenant_student_id_prefix') || 'NKQMS';
    const tenantId = localStorage.getItem('tenant_id');
    
    let query = db.students.where('admission_year').equals(year);
    if (tenantId) {
        query = query.filter(s => s.tenant_id === tenantId);
    }
    const count = await query.count();
    
    const sequence = (count + 1).toString().padStart(4, '0');
    const studentId = `${prefix}-${year}-${sequence}`;
    const attendanceCode = Math.floor(100000 + Math.random() * 900000).toString();
    return { student_id: studentId, attendance_code: attendanceCode, admission_year: year };
}

export function prepareForSync(data) {
    const sanitized = { ...data };
    Object.keys(sanitized).forEach(key => { if (sanitized[key] === "") sanitized[key] = null; });
    
    // Stamp with active tenant_id if available
    const tenantId = localStorage.getItem('tenant_id');
    if (tenantId && sanitized.tenant_id === undefined) {
        sanitized.tenant_id = tenantId;
    }
    
    return { ...sanitized, updated_at: new Date().toISOString(), is_synced: 0 };
}

export default db;
