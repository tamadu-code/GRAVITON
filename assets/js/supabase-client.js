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

    const tables = ['profiles', 'students', 'classes', 'subjects', 'subject_assignments', 'form_teachers', 'scores', 'attendance', 'attendance_records', 'timetable', 'notices', 'settings', 'pins', 'payments', 'fee_structures', 'student_analytics', 'audit_logs', 'duty_assignments', 'parent_links', 'cbt_exams', 'cbt_questions', 'cbt_results', 'cbt_exam_sections', 'cbt_question_bank', 'cbt_options'];
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
            if (table === 'cbt_options' && failedTables.has('cbt_question_bank')) continue;

            try {
                const unsynced = await db[table].filter(r => r.is_synced === 0 || r.is_synced === -1).toArray();
                if (unsynced.length === 0) continue;

                console.log(`Syncing ${unsynced.length} records for ${table}...`);
                
                // Table-level field whitelists
                const whitelist = {
                    profiles: ['id', 'full_name', 'role', 'email', 'status', 'updated_at'],
                    students: ['student_id', 'name', 'gender', 'address', 'class_name', 'status', 'is_active', 'attendance_code', 'admission_year', 'sub_class', 'legacy_student_id', 'passport_url', 'updated_at'],
                    classes: ['id', 'name', 'level', 'updated_at'],
                    subjects: ['id', 'name', 'type', 'credits', 'updated_at'],
                    subject_assignments: ['id', 'teacher_id', 'subject_id', 'class_name', 'specialization', 'updated_at'],
                    form_teachers: ['id', 'teacher_id', 'class_name', 'updated_at'],
                    scores: ['id', 'student_id', 'subject_id', 'term', 'session', 'assignment', 'test1', 'test2', 'project', 'exam', 'total', 'grade', 'rank', 'updated_at'],
                    attendance: ['id', 'student_id', 'date', 'status', 'updated_at'],
                    attendance_records: ['id', 'student_id', 'date', 'status', 'subject_name', 'period_number', 'is_subject_based', 'updated_at'],
                    timetable: ['id', 'class_name', 'day_of_week', 'period_number', 'subject_id', 'teacher_id', 'updated_at'],
                    notices: ['id', 'title', 'content', 'category', 'target', 'author', 'is_active', 'updated_at'],
                    settings: ['id', 'key', 'value', 'updated_at'],
                    pins: ['id', 'pin_code', 'serial', 'status', 'student_id', 'term', 'session', 'used_count', 'usage_limit', 'updated_at'],
                    payments: ['id', 'student_id', 'amount', 'category', 'term', 'session', 'reference', 'status', 'date', 'updated_at'],
                    fee_structures: ['id', 'class_name', 'amount', 'term', 'session', 'category', 'updated_at'],
                    student_analytics: ['student_id', 'average', 'rank', 'fee_balance', 'attendance_rate', 'updated_at'],
                    cbt_exams: ['id', 'title', 'subject_id', 'class_name', 'teacher_id', 'mode', 'term', 'session', 'score_field', 'date', 'start_time', 'end_time', 'duration', 'question_limit', 'status', 'is_unified', 'specialization', 'updated_at'],
                    cbt_questions: ['id', 'exam_id', 'question_text', 'passage_text', 'option_a', 'option_b', 'option_c', 'option_d', 'option_e', 'correct_option', 'marks', 'updated_at'],
                    cbt_results: ['id', 'exam_id', 'student_id', 'score', 'total_questions', 'total_marks', 'answers', 'warnings', 'violations', 'started_at', 'status', 'updated_at'],
                    cbt_exam_sections: ['id', 'exam_id', 'subject_id', 'class_name', 'score_field', 'question_count', 'target_mark', 'specialization', 'updated_at'],
                    duty_assignments: ['id', 'staff_id', 'week_start', 'week_end', 'duty_type', 'updated_at'],
                    audit_logs: ['operation', 'table', 'record_id', 'timestamp', 'user_id'],
                    parent_links: ['id', 'parent_id', 'student_id', 'relationship', 'updated_at'],
                    cbt_question_bank: ['id', 'subject_id', 'class_name', 'question_text', 'passage_text', 'term', 'session', 'topic_area', 'difficulty_level', 'updated_at'],
                    cbt_options: ['id', 'question_id', 'option_label', 'option_text', 'is_correct', 'updated_at']
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
                        
                        // Defensive check for profiles role constraint
                        if (table === 'profiles') {
                            const allowedRoles = ['Admin', 'Teacher', 'Student', 'Parent', 'Staff', 'Principal'];
                            const currentRole = (sanitized.role || '').trim();
                            const matchedRole = allowedRoles.find(r => r.toLowerCase() === currentRole.toLowerCase());
                            
                            if (matchedRole) {
                                sanitized.role = matchedRole; // Normalize to exact DB case
                            } else {
                                sanitized.role = 'Student'; // Default to safest
                            }
                        }

                        return sanitized;
                    });

                    // --- NEW: Cloud Protection ---
                    // Prevent local stale records from overwriting newer cloud data (e.g. Admin re-opens or corrections)
                    if ((table === 'cbt_results' || table === 'scores') && dataToSync.length > 0) {
                        const ids = dataToSync.map(d => d.id).filter(Boolean);
                        if (ids.length > 0) {
                            try {
                                const { data: cloudStates } = await client.from(table).select('id, updated_at').in('id', ids);
                                if (cloudStates && cloudStates.length > 0) {
                                    dataToSync = dataToSync.filter(local => {
                                        const remote = cloudStates.find(c => c.id === local.id);
                                        if (!remote) return true;
                                        // Only push if local is actually NEWER
                                        const isNewer = new Date(local.updated_at || 0) > new Date(remote.updated_at || 0);
                                        if (!isNewer) console.log(`[Sync] Skipping push for ${table} ${local.id} - Cloud has newer data.`);
                                        return isNewer;
                                    });
                                }
                            } catch (e) { console.warn(`Cloud protection check failed for ${table}:`, e); }
                        }
                    }

                    // We now allow BANK questions to sync to the cloud
                    if (table === 'cbt_questions') {
                        dataToSync = dataToSync.filter(r => r.question_text);
                    }

                    if (dataToSync.length > 0) {
                        let { error } = await client.from(table).upsert(dataToSync);
                        
                        if (error) {
                            // Self-healing for Unique Constraint Violations (e.g. duplicate subject assignments)
                            if (error.code === '23505') {
                                console.warn(`[Sync Self-Heal] Record already exists in cloud for ${table}. Marking as synced to resolve loop.`);
                                error = null; // Clear error to allow local sync mark
                                await db[table].where(pk).equals(dataToSync[0][pk]).modify({ is_synced: 1 });
                            } else if (error.code === '22001') {
                                console.error(`[Sync Error] Field too long for ${table}:`, error.message);
                                if (typeof Notifications !== 'undefined') Notifications.show(`Database Error: A field in ${table} is too long. Please increase column length in Supabase.`, 'error');
                            } else if (error.message.includes('violations') || error.message.includes('warnings')) {
                                console.warn(`[Sync Self-Heal] Cloud schema mismatch for ${table}. Retrying without telemetry columns...`);
                                const sanitizedData = dataToSync.map(item => {
                                    const cleaned = { ...item };
                                    delete cleaned.violations;
                                    delete cleaned.warnings;
                                    return cleaned;
                                });
                                const retry = await client.from(table).upsert(sanitizedData);
                                error = retry.error;
                            } else if (error.code === 'PGRST204' || error.message.toLowerCase().includes('column') || error.message.toLowerCase().includes('does not exist')) {
                                let healError = error;
                                let healedData = [...dataToSync];
                                let attempts = 0;
                                while (healError && (healError.code === 'PGRST204' || healError.message.toLowerCase().includes('column') || healError.message.toLowerCase().includes('does not exist')) && attempts < 10) {
                                    attempts++;
                                    let missingCol = null;
                                    const colMatch = healError.message.match(/column\s+[^a-zA-Z0-9_]*([a-zA-Z0-9_]+)/i);
                                    if (colMatch && colMatch[1]) {
                                        const parsedCol = colMatch[1].toLowerCase();
                                        if (parsedCol !== 'of' && parsedCol !== 'relation' && parsedCol !== 'in' && parsedCol !== 'table' && parsedCol !== 'schema') {
                                            missingCol = colMatch[1];
                                        }
                                    }
                                    if (missingCol) {
                                        console.warn(`[Sync Self-Heal] Column "${missingCol}" not found in cloud table ${table}. Stripping and retrying (Attempt ${attempts})...`);
                                        healedData = healedData.map(item => {
                                            const cleaned = { ...item };
                                            delete cleaned[missingCol];
                                            return cleaned;
                                        });
                                        const retry = await client.from(table).upsert(healedData);
                                        healError = retry.error;
                                    } else {
                                        console.error(`[Sync Self-Heal] Unable to parse missing column name from error:`, healError.message);
                                        break;
                                    }
                                }
                                error = healError;
                            } else {
                                console.error(`Sync error for ${table}:`, error, "Data:", chunk);
                            }
                        }

                        if (error) {
                            failedTables.add(table);
                            continue; 
                        }
                    }

                    // --- Process Deletions from Cloud ---
                    if (table === 'audit_logs') {
                        const deletions = chunk.filter(log => log.operation === 'DELETE');
                        for (const del of deletions) {
                            try {
                                const pk = (del.table === 'students' || del.table === 'student_analytics') ? 'student_id' : 'id';
                                
                                // Cascade cloud deletions to satisfy foreign key constraints before deleting parent
                                if (del.table === 'classes') {
                                    const { data: clsData } = await client.from('classes').select('name').eq('id', del.record_id).maybeSingle();
                                    if (clsData && clsData.name) {
                                        console.log(`[Sync Delete] Cascade cleaning cloud dependencies for class: ${clsData.name}`);
                                        await client.from('form_teachers').delete().eq('class_name', clsData.name);
                                        await client.from('subject_assignments').delete().eq('class_name', clsData.name);
                                    }
                                } else if (del.table === 'students') {
                                    console.log(`[Sync Delete] Cascade cleaning cloud dependencies for student: ${del.record_id}`);
                                    await client.from('attendance').delete().eq('student_id', del.record_id);
                                    await client.from('attendance_records').delete().eq('student_id', del.record_id);
                                    await client.from('scores').delete().eq('student_id', del.record_id);
                                    await client.from('payments').delete().eq('student_id', del.record_id);
                                }

                                const { error: delErr } = await client.from(del.table).delete().eq(pk, del.record_id);
                                if (delErr) {
                                    console.error(`[Sync Delete] FAILED for ${del.table}/${del.record_id}:`, delErr.message);
                                    window.dispatchEvent(new CustomEvent('sync-error', { detail: { table: del.table, error: `Delete failed: ${delErr.message}`, code: delErr.code, hint: delErr.hint } }));
                                } else {
                                    console.log(`[Sync Delete] OK: ${del.table}/${del.record_id}`);
                                }
                            } catch (e) {
                                console.warn(`[Sync Delete] Deferred: ${del.table}/${del.record_id}:`, e.message);
                            }
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

    const tables = ['profiles', 'students', 'classes', 'subjects', 'subject_assignments', 'form_teachers', 'scores', 'attendance', 'attendance_records', 'timetable', 'notices', 'settings', 'pins', 'payments', 'fee_structures', 'student_analytics', 'duty_assignments', 'parent_links', 'cbt_exams', 'cbt_questions', 'cbt_results', 'cbt_question_bank', 'cbt_options', 'cbt_exam_questions', 'cbt_exam_sections'];
    
    // ── Block sync during active exam to prevent flickering and state resets ──
    if (document.body.classList.contains('exam-mode')) {
        console.log('[Sync] Background pull blocked during active exam session.');
        return;
    }

    // ── Clear stale lock (may persist across page reloads) ──
    if (window._isSyncingFromCloud && !forceAll) return;
    window._isSyncingFromCloud = true;

    const lastSyncTime = localStorage.getItem('last_sync_timestamp');
    // Subtract 60 minutes as buffer to avoid missing records at boundary
    const lastSync = (lastSyncTime && !forceAll)
        ? new Date(new Date(lastSyncTime).getTime() - 3600000).toISOString()
        : new Date(0).toISOString();

    try {
        for (const table of tables) {
            console.log(`[Sync] Pulling table: ${table}...`);
            try {
                let hasMore = true;
                let offset = 0;
                let totalPulled = 0;
                const BATCH_SIZE = 1000; // Match standard Supabase default limit

                while (hasMore) {
                    let query = client.from(table).select('*').range(offset, offset + BATCH_SIZE - 1);
                    
                    if (!forceAll) {
                        // For attendance tables: filter by EITHER updated_at OR date
                        if (table === 'attendance_records' || table === 'attendance') {
                            const sixtyDaysAgo = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
                            const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
                            
                            // Deep sync the last 3 days regardless of lastSync to catch late clock-outs
                            query = client.from(table).select('*')
                                .or(`updated_at.gt.${lastSync},date.gte.${threeDaysAgo}`)
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
                        
                        // --- NEW: Deletion Shield ---
                        // Don't pull back items that we have recently deleted locally but haven't synced yet
                        const pendingDeletes = await db.audit_logs.where('table').equals(table).and(log => log.operation === 'DELETE').toArray();
                        const deletedIds = new Set(pendingDeletes.map(log => String(log.record_id)));
                        
                        const validData = data
                            .filter(item => item[pk] && !deletedIds.has(String(item[pk])))
                            .map(item => ({ ...item, is_synced: 1 }));
                            
                        if (validData.length > 0) {
                            // --- NEW: Smart ID Rename Handling for Students ---
                            if (table === 'students') {
                                for (const item of validData) {
                                    // Search for local records that match by name and class but have a DIFFERENT primary key
                                    // This catches cases where the cloud function renamed the student after biometric assignment
                                    const matches = await db.students.where('name').equals(item.name).toArray();
                                    const oldRecord = matches.find(m => m.class_name === item.class_name && m.student_id !== item.student_id);
                                    
                                    if (oldRecord) {
                                        console.log(`[Sync] ID Rename detected for ${item.name}: ${oldRecord.student_id} -> ${item.student_id}`);
                                        // Delete the old record locally before putting the new one
                                        await db.students.delete(oldRecord.student_id);
                                        // Cleanup local dependencies to point to the new ID
                                        await db.scores.where('student_id').equals(oldRecord.student_id).modify({ student_id: item.student_id });
                                        await db.attendance_records.where('student_id').equals(oldRecord.student_id).modify({ student_id: item.student_id });
                                        await db.attendance.where('student_id').equals(oldRecord.student_id).modify({ student_id: item.student_id });
                                    }
                                }
                            }
                            
                        let processedData = validData;

                            // --- 1A: API-layer null normalisation for cbt_questions ---
                            // Coerce null option fields to '' before writing to IndexedDB
                            // so the exam renderer never receives null values
                            if (table === 'cbt_questions') {
                                processedData = validData.map(q => ({
                                    ...q,
                                    option_a: q.option_a ?? '',
                                    option_b: q.option_b ?? '',
                                    option_c: q.option_c ?? '',
                                    option_d: q.option_d ?? '',
                                    option_e: q.option_e ?? '',
                                    correct_option: q.correct_option ?? 'A',
                                    marks: q.marks ?? 1
                                }));
                            }

                            // --- 1A2: Passage Text Preservation for cbt_questions & cbt_question_bank ---
                            // Cloud may have null passage_text if it was synced before the whitelist fix.
                            // Preserve local passage_text when cloud sends null.
                            if (table === 'cbt_questions' || table === 'cbt_question_bank') {
                                const passagePreserved = [];
                                for (const cloudItem of processedData) {
                                    if (!cloudItem.passage_text) {
                                        try {
                                            const localItem = await db[table].get(cloudItem.id);
                                            if (localItem && localItem.passage_text) {
                                                cloudItem.passage_text = localItem.passage_text;
                                            }
                                        } catch (e) {}
                                    }
                                    passagePreserved.push(cloudItem);
                                }
                                processedData = passagePreserved;
                            }

                            // --- 1B: Answer Protection for cbt_results ---
                            if (table === 'cbt_results') {
                                const finalResults = [];
                                for (const cloudItem of processedData) {
                                    const localItem = await db.cbt_results.get(cloudItem.id);
                                    if (localItem && localItem.answers && Object.keys(localItem.answers).length > 0) {
                                        const cloudAnswers = cloudItem.answers || {};
                                        if (Object.keys(cloudAnswers).length < Object.keys(localItem.answers).length) {
                                            cloudItem.answers = localItem.answers;
                                        }
                                    }
                                    finalResults.push(cloudItem);
                                }
                                processedData = finalResults;
                            }

                            // --- 1C: Local Modification Shield (Generic) ---
                            // Don't overwrite local records that have unsynced changes (is_synced: 0)
                            // unless the cloud version is explicitly newer (based on updated_at)
                            const finalProcessedData = [];
                            const pk = (table === 'students' || table === 'student_analytics') ? 'student_id' : 'id';
                            
                            for (const cloudItem of processedData) {
                                const localItem = await db[table].get(cloudItem[pk]);
                                if (localItem && localItem.is_synced === 0) {
                                    const localTime = new Date(localItem.updated_at || 0).getTime();
                                    const cloudTime = new Date(cloudItem.updated_at || 0).getTime();
                                    
                                    if (cloudTime <= localTime) {
                                        console.log(`[Sync Shield] Skipping pull overwrite for modified ${table}/${cloudItem[pk]}`);
                                        continue; 
                                    }
                                }
                                finalProcessedData.push(cloudItem);
                            }
                            processedData = finalProcessedData;

                            if (processedData.length > 0) {
                                await db[table].bulkPut(processedData);
                            }
                        }
                        
                        totalPulled += data.length;
                        if (data.length < BATCH_SIZE) {
                            hasMore = false;
                        } else {
                            offset += data.length;
                        }
                    } else {
                        hasMore = false;
                    }
                }
                if (totalPulled > 0) {
                    console.log(`[Sync] Pulled ${totalPulled} total records into '${table}' table.`);
                }

                // --- Deletion Reconciliation for Core Tables ---
                // Ensures deletions (e.g. classes, subjects) are propagated to devices
                const syncCleanTables = ['classes', 'subjects', 'students', 'cbt_exams', 'cbt_questions', 'subject_assignments'];
                if (syncCleanTables.includes(table)) {
                    // ONLY reconcile records that are already synced (is_synced: 1)
                    // If is_synced is 0, it's a new local record that hasn't reached the cloud yet; don't delete it!
                    const localItems = await db[table].where('is_synced').equals(1).toArray();
                    
                    if (localItems.length > 0) {
                        const pk = (table === 'students' || table === 'student_analytics') ? 'student_id' : 'id';
                        const localIds = localItems.map(item => item[pk]);
                        
                        // Check which of these IDs still exist in the cloud
                        const { data: cloudIds } = await client.from(table).select(pk).in(pk, localIds);
                        
                        if (cloudIds) {
                            const cloudIdSet = new Set(cloudIds.map(c => String(c[pk])));
                            const staleIds = localIds.filter(id => !cloudIdSet.has(String(id)));
                            
                            if (staleIds.length > 0) {
                                console.log(`[Sync Cleanup] Removing ${staleIds.length} stale records from ${table} that no longer exist in cloud.`);
                                await db[table].bulkDelete(staleIds);
                            }
                        }
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
    // Run the initial sync immediately and return the promise
    // (so callers can .then() on it to know when first sync is done)
    const initialSync = syncFromCloud().then(() => syncToCloud()).catch(err => {
        console.warn('[Sync] Initial sync error:', err);
    });

    // Sequential loop: wait for each sync to FULLY FINISH before scheduling next
    // This prevents parallel requests on slow mobile connections
    const scheduleNext = () => {
        setTimeout(async () => {
            try {
                await syncFromCloud();
                await syncToCloud();
            } catch (err) {
                console.warn('[Sync] Periodic sync error:', err);
            }
            // Only schedule next AFTER this one completes
            scheduleNext();
        }, intervalMs);
    };

    scheduleNext();
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

    // ─── DIAGNOSTIC LOG ───
    console.log(`[Auth] Attempting login at ${SB_CONFIG.url} for: ${identifier} -> Translated Email: ${email}`);

    const { data, error } = await client.auth.signInWithPassword({ email: email, password: loginPassword });
    
    // Fallback 1: Lowercase Student ID failed -> Try exact casing
    if (error && isStandardId) {
        // Try @school-portal.com as it seems to be the project default
        const portalEmail = `${identifier.toLowerCase()}@school-portal.com`;
        console.log(`[Auth] Fallback 1 (Portal Domain): ${portalEmail}`);
        const retry = await client.auth.signInWithPassword({ email: portalEmail, password: loginPassword });
        if (!retry.error) return retry;

        // Try exact casing @student.school
        const fallbackEmail = `${identifier}@student.school`;
        console.log(`[Auth] Fallback 1b (Exact Casing): ${fallbackEmail}`);
        const retry2 = await client.auth.signInWithPassword({ email: fallbackEmail, password: loginPassword });
        if (!retry2.error) return retry2;
    }

    // Fallback 2: Maybe it's a staff ID? (e.g. SCH/STF/...)
    if (error && !identifier.includes('@') && !isStandardId) {
        console.log(`[Auth] Staff ID detected, performing profile lookup for: ${identifier}`);
        
        // 1. Try the default portal domain first (fastest)
        const portalEmail = `${identifier.toLowerCase()}@school-portal.com`;
        const retry1 = await client.auth.signInWithPassword({ email: portalEmail, password: loginPassword });
        if (!retry1.error) return retry1;

        // 2. Perform a database lookup to find the ACTUAL email linked to this ID or Name
        try {
            console.log(`[Auth] Searching profiles for: ${identifier}`);
            const { data: profile } = await client.from('profiles')
                .select('email')
                .or(`assigned_id.eq.${identifier},full_name.ilike.%${identifier}%`)
                .maybeSingle();

            if (profile && profile.email) {
                const actualEmail = profile.email.trim();
                console.log(`[Auth] Retrying login with linked email: ${actualEmail}`);
                
                const retry2 = await client.auth.signInWithPassword({ 
                    email: actualEmail, 
                    password: loginPassword 
                });

                if (!retry2.error) {
                    console.log('--- GRAVITON CORE v24.0 (BUILD v237) - INITIALIZING ---');
                    return retry2;
                } else {
                    console.error('[Auth] Login retry failed:', retry2.error.message);
                }
            }
        } catch (lookupError) {
            console.warn('[Auth] Profile/Name lookup failed:', lookupError);
        }
    }

    if (error) {
        console.error(`[Auth] Login failed: ${error.message}`);
        // [DIAGNOSTIC] specifically catch unconfirmed email error
        if (error.message.toLowerCase().includes('email not confirmed')) {
            return { data, error: { message: 'Account exists but email is not confirmed. Please contact Administrator to manually verify your account in Supabase.' } };
        }
    }
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
        }, { onConflict: 'email' });
    } else if (error && (error.message.includes('already registered') || error.message.includes('already exists'))) {
        console.log(`[Register] User ${email} already exists, attempting to recover ID...`);
        // If profile exists, use it. If not, we can't easily get the ID, but we can return null error to allow caller to proceed
        const { data: profile } = await client.from('profiles').select('id').eq('email', email).maybeSingle();
        return { data: { user: profile ? { id: profile.id } : null }, error: null };
    }
    return { data, error };
}

export async function updateUserPassword(email, newPassword) {
    const client = getSupabase();
    if (!client) return { error: { message: 'Supabase not initialized' } };
    
    // [SECURITY] auth.updateUser only updates the CURRENTLY LOGGED IN user.
    // We should only call this if we are sure we want to change the active session's password.
    const { data: { user } } = await client.auth.getUser();
    if (user && user.email !== email) {
        console.warn('[Auth] Attempted to change password for a different user. This is blocked to prevent admin lockout.');
        return { error: { message: 'Cannot reset other users passwords from the frontend. Use Supabase Dashboard or an Edge Function.' } };
    }

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
