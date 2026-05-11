/**
 * Graviton CMS - Supabase Sync Engine
 * Handles cloud synchronization and real-time status
 */

import db from './db.js';

// Configuration - Prioritize localStorage over hardcoded defaults
const SB_CONFIG = {
    url: localStorage.getItem('sb_url') || 'https://urqygjltionvaxuacfzr.supabase.co',
    key: localStorage.getItem('sb_key') || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVycXlnamx0aW9udmF4dWFjZnpyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzcwMzEzMDEsImV4cCI6MjA5MjYwNzMwMX0.Vpk7rifsfjMCVBSYpEdVzkHv3w324iKp8B7urlKc_e4'
};

let sb = null;

function createClient() {
    if (sb) return sb;
    if (SB_CONFIG.url && SB_CONFIG.key) {
        if (typeof window.supabase !== 'undefined') {
            try {
                sb = window.supabase.createClient(SB_CONFIG.url, SB_CONFIG.key);
                window.supabaseClient = sb;
            } catch (e) {
                console.error('Failed to initialize Supabase:', e);
            }
        } else {
            console.warn('Supabase CDN library not detected yet. Initialization deferred.');
        }
    }
}

// Initial attempt
if (!sb) createClient();

/**
 * Initialize Supabase Client
 */
export function initSupabase(url, key) {
    localStorage.setItem('sb_url', url);
    localStorage.setItem('sb_key', key);
    sb = window.supabase.createClient(url, key);
    window.supabaseClient = sb;
    return sb;
}

export function getSupabase() {
    if (!sb) createClient();
    return sb;
}

/**
 * Sync Engine - Push local changes to cloud
 */
export async function syncToCloud() {
    const client = getSupabase();
    if (!client) return { success: false, message: 'Supabase not configured' };

    const tables = ['profiles', 'students', 'classes', 'subjects', 'subject_assignments', 'form_teachers', 'scores', 'attendance', 'attendance_records', 'timetable', 'notices', 'settings', 'pins', 'payments', 'fee_structures', 'student_analytics', 'audit_logs', 'duty_assignments', 'parent_links', 'cbt_exams', 'cbt_questions', 'cbt_results'];
    let syncCount = 0;
    const failedTables = new Set();

    if (window._isSyncingToCloud) return { success: false, message: 'Sync already in progress' };
    window._isSyncingToCloud = true;

    try {
        for (const table of tables) {
            // Skip tables based on dependencies
            if ((table === 'scores' || table === 'subject_assignments' || table === 'cbt_exams') && failedTables.has('subjects')) continue;
            if (table === 'cbt_questions' && failedTables.has('cbt_exams')) continue;
            if (table === 'cbt_results' && failedTables.has('students')) continue;

            try {
                const unsynced = await db[table].filter(r => r.is_synced === 0 || r.is_synced === -1).toArray();
                if (unsynced.length === 0) continue;

                console.log(`Syncing ${unsynced.length} records for ${table}...`);
                
                // Table-level field whitelists
                const whitelist = {
                    profiles: ['id', 'full_name', 'role', 'assigned_id', 'email', 'phone', 'department', 'qualification', 'emp_type', 'status', 'is_archived', 'passport', 'updated_at'],
                    students: ['student_id', 'name', 'gender', 'address', 'class_name', 'status', 'is_active', 'attendance_code', 'admission_year', 'sub_class', 'legacy_student_id', 'dob', 'phone', 'parent_name', 'parent_phone', 'parent_email', 'blood_group', 'genotype', 'passport_url', 'updated_at'],
                    classes: ['id', 'name', 'level', 'updated_at'],
                    subjects: ['id', 'name', 'type', 'credits', 'updated_at'],
                    subject_assignments: ['id', 'teacher_id', 'subject_id', 'class_name', 'specialization', 'updated_at'],
                    form_teachers: ['id', 'teacher_id', 'class_name', 'updated_at'],
                    scores: ['id', 'student_id', 'subject_id', 'term', 'session', 'assignment', 'test1', 'test2', 'project', 'exam', 'total', 'grade', 'rank', 'updated_at'],
                    attendance: ['id', 'student_id', 'date', 'status', 'sign_in', 'sign_out', 'is_late', 'updated_at'],
                    attendance_records: ['id', 'student_id', 'date', 'status', 'subject_name', 'period_number', 'is_subject_based', 'updated_at'],
                    timetable: ['id', 'class_name', 'day_of_week', 'period_number', 'subject_id', 'teacher_id', 'updated_at'],
                    notices: ['id', 'title', 'content', 'category', 'target', 'author', 'is_active', 'updated_at'],
                    settings: ['id', 'key', 'value', 'updated_at'],
                    pins: ['id', 'pin_code', 'serial', 'status', 'student_id', 'term', 'session', 'used_count', 'usage_limit', 'updated_at'],
                    payments: ['id', 'student_id', 'amount', 'category', 'term', 'session', 'reference', 'status', 'date', 'updated_at'],
                    fee_structures: ['id', 'class_name', 'amount', 'term', 'session', 'category', 'updated_at'],
                    student_analytics: ['student_id', 'average', 'rank', 'fee_balance', 'attendance_rate', 'updated_at'],
                    cbt_exams: ['id', 'title', 'subject_id', 'class_name', 'teacher_id', 'mode', 'term', 'session', 'score_field', 'date', 'start_time', 'end_time', 'duration', 'question_limit', 'status', 'updated_at'],
                    cbt_questions: ['id', 'exam_id', 'question_text', 'option_a', 'option_b', 'option_c', 'option_d', 'option_e', 'correct_option', 'marks', 'updated_at'],
                    cbt_results: ['id', 'exam_id', 'student_id', 'score', 'total_questions', 'total_marks', 'answers', 'warnings', 'violations', 'started_at', 'status', 'updated_at'],
                    duty_assignments: ['id', 'staff_id', 'week_start', 'week_end', 'duty_type', 'updated_at'],
                    audit_logs: ['id', 'operation', 'table', 'record_id', 'timestamp', 'user_id'],
                    parent_links: ['id', 'parent_id', 'student_id', 'relationship', 'updated_at']
                };

                const CHUNK_SIZE = 50;
                for (let i = 0; i < unsynced.length; i += CHUNK_SIZE) {
                    const chunk = unsynced.slice(i, i + CHUNK_SIZE);
                    
                    // Filter logic for Question Bank questions (exclude from cloud sync)
                    let dataToSync = chunk.map(item => {
                        const sanitized = {};
                        const columns = whitelist[table] || Object.keys(item);
                        columns.forEach(col => {
                            if (item[col] !== undefined) sanitized[col] = item[col];
                        });
                        return sanitized;
                    });

                    // We now allow BANK questions to sync to the cloud
                    // Note: Requires the cloud DB to have the FK constraint relaxed or Bank IDs added to cbt_exams
                    if (table === 'cbt_questions') {
                        dataToSync = dataToSync.filter(r => r.question_text); // Only skip empty records
                    }

                    if (dataToSync.length > 0) {
                        const { error } = await client.from(table).upsert(dataToSync);
                        if (error) {
                            console.error(`Sync error for ${table}:`, error);
                            failedTables.add(table);
                            continue; 
                        }
                    }

                    // Mark as synced locally
                    const pk = (table === 'students' || table === 'student_analytics') ? 'student_id' : 'id';
                    for (const item of chunk) {
                        if (item[pk]) {
                            try {
                                await db[table].update(item[pk], { is_synced: 1 });
                            } catch (e) {
                                console.warn(`Local sync mark failed for ${table} [${item[pk]}]:`, e);
                            }
                        } else {
                            console.warn(`Record in ${table} is missing its primary key (${pk}). Skipping sync mark.`);
                        }
                    }
                    syncCount += chunk.length;
                }
            } catch (err) {
                console.error(`Failed to sync table ${table}:`, err);
                failedTables.add(table);
            }
        }
    } finally {
        window._isSyncingToCloud = false;
    }

    return { success: true, count: syncCount };
}

/**
 * Sync Engine - Pull cloud changes to local
 */
export async function syncFromCloud(forceAll = false) {
    const client = getSupabase();
    if (!client) return;

    const tables = ['profiles', 'students', 'classes', 'subjects', 'subject_assignments', 'form_teachers', 'scores', 'attendance', 'attendance_records', 'timetable', 'notices', 'settings', 'pins', 'payments', 'fee_structures', 'student_analytics', 'duty_assignments', 'parent_links', 'cbt_exams', 'cbt_questions', 'cbt_results'];
    
    // ── Clear stale lock (may persist across page reloads) ──
    if (window._isSyncingFromCloud && !forceAll) return;
    window._isSyncingFromCloud = true;

    const lastSyncTime = localStorage.getItem('last_sync_timestamp');
    // Subtract 10 minutes as buffer to avoid missing records at boundary
    const lastSync = (lastSyncTime && !forceAll)
        ? new Date(new Date(lastSyncTime).getTime() - 600000).toISOString()
        : new Date(0).toISOString();

    try {
        for (const table of tables) {
            console.log(`[Sync] Pulling table: ${table}...`);
            try {
                let hasMore = true;
                let offset = 0;
                const BATCH_SIZE = (table === 'attendance_records' || table === 'attendance') ? 2000 : 1000;

                while (hasMore) {
                    let query = client.from(table).select('*').range(offset, offset + BATCH_SIZE - 1);
                    
                    if (!forceAll) {
                        // For attendance tables: filter by EITHER updated_at OR date
                        // (biometric records may have null/stale updated_at but a valid date)
                        if (table === 'attendance_records' || table === 'attendance') {
                            // Look back 60 days to catch historical data correctly
                            const sixtyDaysAgo = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
                            query = client.from(table).select('*')
                                .or(`updated_at.gt.${lastSync},date.gte.${sixtyDaysAgo}`)
                                .range(offset, offset + BATCH_SIZE - 1);
                        } else {
                            query = query.gt('updated_at', lastSync);
                        }
                    }

                    const { data, error } = await query;
                    if (error) {
                        if (error.code === '42P01') { hasMore = false; continue; }
                        console.warn(`Pull error for ${table}:`, error.message);
                        hasMore = false; continue;
                    }

                    if (data && data.length > 0) {
                        const pk = (table === 'students' || table === 'student_analytics') ? 'student_id' : 'id';
                        const validData = data.filter(item => item[pk]).map(item => ({ ...item, is_synced: 1 }));
                        if (validData.length > 0) {
                            await db[table].bulkPut(validData);
                            if (table === 'attendance_records' || table === 'attendance') {
                                console.log(`[Sync] Pulled ${validData.length} records into '${table}' table.`);
                            }
                        } else {
                            if (table === 'attendance_records' || table === 'attendance') {
                                console.log(`[Sync] No new records found for '${table}' in this batch.`);
                            }
                        }
                        if (data.length < BATCH_SIZE) hasMore = false;
                        else offset += BATCH_SIZE;
                    } else {
                        hasMore = false;
                    }
                }
            } catch (e) { console.warn(`Pull error for ${table}:`, e); }
        }
    } catch (err) {
        console.error('[Sync] Fatal error in syncFromCloud:', err);
        throw err;
    } finally {
        window._isSyncingFromCloud = false;
        if (!forceAll) {
            localStorage.setItem('last_sync_timestamp', new Date().toISOString());
        }
        console.log('[Sync] Cloud Pull sequence complete.');
    }
}


export function startSyncLoop(intervalMs = 60000) {
    const initialSync = syncFromCloud().then(() => syncToCloud());
    setInterval(async () => {
        await syncFromCloud();
        await syncToCloud();
    }, intervalMs);
    return initialSync;
}

// Authentication Methods
export async function loginUser(identifier, password) {
    const client = getSupabase();
    if (!client) return { data: null, error: { message: 'Supabase not initialized' } };

    let email = identifier;
    let loginPassword = password;

    // ─── Student ID Login Translation ───
    const studentIdRegex = /^NKQMS-\d{4}-\d+/i;
    const isStandardId = studentIdRegex.test(identifier) && !identifier.includes('@');

    if (isStandardId) {
        email = `${identifier.toLowerCase()}@student.school`;
        // Students use their full ID as both username and password
        if (!password || password === identifier) loginPassword = identifier;
    } 
    // Legacy numeric login disabled as per user request
    else if (/^\d{3,8}$/.test(identifier)) {
        return { data: null, error: { message: 'Please use your full Student ID (NKQMS-...) to login.' } };
    }

    const { data, error } = await client.auth.signInWithPassword({ email: email, password: loginPassword });
    return { data, error };
}

export async function logoutUser() {
    const client = getSupabase();
    if (!client) return true;
    try {
        localStorage.removeItem('user_role');
        await client.auth.signOut();
    } catch(e) { console.error('Sign out error:', e); }
    return true;
}

export async function getCurrentSession() {
    const client = getSupabase();
    if (!client) return null;
    const { data } = await client.auth.getSession();
    return data.session;
}

export async function getUserProfile(userId) {
    const client = getSupabase();
    if (!client) return null;
    const { data } = await client.from('profiles').select('*').eq('id', userId).maybeSingle();
    return data;
}

export async function registerUser(email, password, fullName, role) {
    const client = getSupabase();
    if (!client) return { error: { message: 'Supabase not initialized' } };

    const { data, error } = await client.auth.signUp({
        email,
        password,
        options: { data: { full_name: fullName, role: role } }
    });

    if (!error && data.user) {
        await client.from('profiles').upsert({
            id: data.user.id,
            full_name: fullName,
            role: role,
            email: email,
            status: 'Active',
            updated_at: new Date().toISOString()
        });
    }
    return { data, error };
}

export async function updateUserPassword(email, newPassword) {
    const client = getSupabase();
    if (!client) return { error: { message: 'Supabase not initialized' } };
    const { data, error } = await client.auth.updateUser({ password: newPassword });
    return { data, error };
}

export async function resetPassword(email) {
    const client = getSupabase();
    if (!client) return { error: { message: 'Supabase not initialized' } };
    return await client.auth.resetPasswordForEmail(email, { redirectTo: window.location.origin });
}

export async function uploadPassport(id, type, file) {
    const client = getSupabase();
    if (!client) return { error: 'Supabase not initialized' };

    const filePath = `${type}/${id.replace(/[^a-zA-Z0-9]/g, '_')}_${Date.now()}.${file.name.split('.').pop()}`;

    try {
        const { error: storageError } = await client.storage.from('passports').upload(filePath, file, { upsert: true });
        if (storageError) throw storageError;

        const { data: { publicUrl } } = client.storage.from('passports').getPublicUrl(filePath);
        const update = type === 'student' ? { passport_url: publicUrl } : { passport: publicUrl };
        const key = type === 'student' ? 'student_id' : 'id';

        await client.from(type === 'student' ? 'students' : 'profiles').update({ ...update, updated_at: new Date().toISOString() }).eq(key, id);
        await db[type === 'student' ? 'students' : 'profiles'].update(id, { ...update, is_synced: 1 });

        return { success: true, url: publicUrl };
    } catch (err) {
        console.error('Passport upload failed:', err);
        return { error: err.message };
    }
}
