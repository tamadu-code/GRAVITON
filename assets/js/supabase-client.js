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
    if (SB_CONFIG.url && SB_CONFIG.key) {
        if (typeof window.supabase !== 'undefined') {
            try {
                sb = window.supabase.createClient(SB_CONFIG.url, SB_CONFIG.key);
            } catch (e) {
                console.error('Failed to initialize Supabase:', e);
            }
        } else {
            console.warn('Supabase CDN library not detected yet. Initialization deferred.');
        }
    }
}

// Initial attempt
createClient();

/**
 * Initialize Supabase Client
 */
export function initSupabase(url, key) {
    localStorage.setItem('sb_url', url);
    localStorage.setItem('sb_key', key);
    sb = window.supabase.createClient(url, key);
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

    // --- Data Migration for CA Components ---
    try {
        const brokenScores = await db.scores.toArray();
        const toFix = brokenScores.filter(s => s.ass !== undefined || s.t1 !== undefined);
        if (toFix.length > 0) {
            const fixed = toFix.map(s => {
                s.assignment = s.ass !== undefined ? s.ass : (s.assignment || 0);
                s.test1 = s.t1 !== undefined ? s.t1 : (s.test1 || 0);
                s.test2 = s.t2 !== undefined ? s.t2 : (s.test2 || 0);
                s.project = s.prj !== undefined ? s.prj : (s.project || 0);
                delete s.ass;
                delete s.t1;
                delete s.t2;
                delete s.prj;
                return s;
            });
            await db.scores.bulkPut(fixed);
            console.log(`Migrated ${fixed.length} score records to use 'assignment', 'test1', 'test2', 'project'.`);
        }
    } catch (e) { console.error('Migration error:', e); }
    // ----------------------------------------

    const tables = ['profiles', 'students', 'classes', 'subjects', 'subject_assignments', 'form_teachers', 'scores', 'attendance', 'attendance_records', 'timetable', 'settings'];
    let syncCount = 0;

    for (const table of tables) {
        try {
            // Find records where is_synced is 0
            const unsynced = await db[table].where('is_synced').equals(0).toArray();
            
            if (unsynced.length > 0 && sb) {
                console.log(`Syncing ${unsynced.length} records for ${table}...`);
                
                // Chunk size of 50 to avoid payload limits
                const CHUNK_SIZE = 50;
                for (let i = 0; i < unsynced.length; i += CHUNK_SIZE) {
                    const chunk = unsynced.slice(i, i + CHUNK_SIZE);
                    
                    // Only send columns that are known to exist in the database
                    const dataToSync = chunk.map(item => {
                        const sanitized = {};
                        const allowedColumns = {
                            students: ['student_id', 'name', 'gender', 'address', 'class_name', 'status', 'is_active', 'attendance_code', 'admission_year', 'sub_class', 'legacy_student_id', 'passport_url', 'updated_at'],
                            profiles: ['id', 'full_name', 'role', 'assigned_id', 'updated_at'],
                            classes: ['id', 'name', 'level', 'updated_at'],
                            subjects: ['id', 'name', 'type', 'credits', 'updated_at'],
                            subject_assignments: ['id', 'teacher_id', 'subject_id', 'class_name', 'updated_at'],
                            form_teachers: ['id', 'teacher_id', 'class_name', 'updated_at'],
                            scores: ['id', 'student_id', 'subject_id', 'term', 'session', 'assignment', 'test1', 'test2', 'project', 'exam', 'total', 'grade', 'rank', 'updated_at'],
                            attendance: ['id', 'student_id', 'date', 'status', 'updated_at'],
                            attendance_records: ['id', 'student_id', 'date', 'status', 'check_in', 'check_out', 'subject_name', 'period_number', 'is_subject_based', 'updated_at'],
                            timetable: ['id', 'class_name', 'day_of_week', 'period_number', 'subject_id', 'teacher_id', 'updated_at'],
                            notices: ['id', 'title', 'is_active', 'updated_at'],
                            settings: ['id', 'key', 'value', 'updated_at']

                        };

                        const columns = allowedColumns[table] || Object.keys(item);
                        columns.forEach(col => {
                            if (item[col] !== undefined) sanitized[col] = item[col];
                        });
                        return sanitized;
                    });

                    const { error } = await sb.from(table).upsert(dataToSync);

                    if (!error) {
                        // Mark as synced locally
                        const pk = table === 'students' ? 'student_id' : 'id';
                        for (const item of chunk) {
                            await db[table].update(item[pk], { is_synced: 1 });
                        }
                        syncCount += chunk.length;
                    } else {
                        console.error(`Sync error for ${table} [Batch ${i/CHUNK_SIZE + 1}]:`, error);
                        // Trigger event with full error context
                        window.dispatchEvent(new CustomEvent('sync-error', { 
                            detail: { 
                                table, 
                                error: error.message || 'Unknown error',
                                code: error.code,
                                hint: error.hint,
                                details: error.details
                            } 
                        }));
                    }
                }
            }
        } catch (e) {
            console.error(`Local sync error for ${table}:`, e);
        }
    }

    return { success: true, count: syncCount };
}

/**
 * Sync Engine - Pull cloud changes to local
 */
export async function syncFromCloud(forceAll = false) {
    const client = getSupabase();
    if (!client) return;

    const tables = ['profiles', 'students', 'classes', 'subjects', 'subject_assignments', 'form_teachers', 'scores', 'attendance', 'attendance_records', 'timetable', 'settings'];
    
    // If forceAll is true, we look back to beginning of time
    const lastSyncTime = localStorage.getItem('last_sync_timestamp');
    const lastSync = (lastSyncTime && !forceAll) ? new Date(new Date(lastSyncTime).getTime() - 300000).toISOString() : new Date(0).toISOString();

    for (const table of tables) {
        try {
            let hasMore = true;
            let offset = 0;
            const BATCH_SIZE = 1000;

            while (hasMore) {
                let query = sb.from(table).select('*').range(offset, offset + BATCH_SIZE - 1);
                
                if (!forceAll) {
                    query = query.gt('updated_at', lastSync);
                }

                const { data, error } = await query;

                if (error) {
                    // If table doesn't exist, skip it instead of failing
                    if (error.code === '42P01' || error.message.includes('not exist')) {
                        console.warn(`Table ${table} not found in Supabase, skipping...`);
                        hasMore = false;
                        continue;
                    }
                    console.error(`Pull error for ${table}:`, error);
                    throw error;
                }

                if (data && data.length > 0) {
                    await db[table].bulkPut(data.map(item => ({ 
                        ...item, 
                        is_synced: 1 
                    })));
                    console.log(`Synced ${data.length} records for ${table} (Offset: ${offset})...`);
                    
                    if (data.length < BATCH_SIZE) {
                        hasMore = false;
                    } else {
                        offset += BATCH_SIZE;
                    }
                } else {
                    hasMore = false;
                }
            }
        } catch (e) {
            console.error(`Skipping sync for ${table} due to error:`, e);
        }
    }

    localStorage.setItem('last_sync_timestamp', new Date().toISOString());
}

/**
 * Start Background Sync Loop
 */
/**
 * Start Background Sync Loop
 * Returns the initial sync promise so callers can await first completion.
 */
export function startSyncLoop(intervalMs = 60000) {
    // Initial sync — return the promise so UI can update on completion
    const initialSync = syncFromCloud().then(() => syncToCloud());

    setInterval(async () => {
        try {
            // 1. Pull changes from cloud
            await syncFromCloud();
            
            // 2. Push local changes to cloud
            const status = await syncToCloud();
            
            if (status.count > 0) {
                window.dispatchEvent(new CustomEvent('sync-complete', { detail: status }));
            }
        } catch (err) {
            console.error('Background sync failed:', err);
        }
    }, intervalMs);

    return initialSync;
}

// ─────────────────────────────────────────
// Authentication Methods
// ─────────────────────────────────────────

/**
 * Sign in with email and password
 */
export async function loginUser(email, password) {
    const client = getSupabase();
    if (!client) return { data: null, error: { message: 'Supabase not initialized' } };
    const { data, error } = await client.auth.signInWithPassword({ email, password });
    return { data, error };
}

/**
 * Sign out
 */
export async function logoutUser() {
    const client = getSupabase();
    if (!client) return true; // No Supabase — just let the caller reload
    try {
        await client.auth.signOut();
    } catch(e) {
        console.error('Sign out error:', e);
    }
    return true;
}

/**
 * Get current session
 */
export async function getCurrentSession() {
    const client = getSupabase();
    if (!client) return null;
    const { data, error } = await client.auth.getSession();
    if (error) return null;
    return data.session;
}

/**
 * Get user profile from the profiles table
 */
export async function getUserProfile(userId) {
    const client = getSupabase();
    if (!client) return null;
    const { data, error } = await client.from('profiles').select('*').eq('id', userId).single();
    if (error) {
        console.error("Error fetching profile:", error);
        return null;
    }
    return data;
}

/**
 * Register a new user account
 * Creates auth user and inserts profile row
 */
export async function registerUser(email, password, fullName, role) {
    const client = getSupabase();
    if (!client) return { data: null, error: { message: 'Supabase not initialized' } };

    // 1. Create auth user
    const { data, error } = await client.auth.signUp({
        email,
        password,
        options: {
            data: {
                full_name: fullName,
                role: role
            }
        }
    });

    if (error) return { data: null, error };

    // 2. Insert profile row (Supabase trigger may also do this, but this is a safety net)
    if (data.user) {
        const profileData = {
            id: data.user.id,
            full_name: fullName,
            role: role,
            updated_at: new Date().toISOString()
        };

        const { error: profileError } = await client.from('profiles').upsert(profileData);
        if (profileError) {
            console.warn('Profile insert warning (may already exist via trigger):', profileError.message);
        }
    }

    return { data, error: null };
}

/**
 * Send password reset email
 */
export async function resetPassword(email) {
    const client = getSupabase();
    if (!client) return { error: { message: 'Supabase not initialized' } };

    const { data, error } = await client.auth.resetPasswordForEmail(email, {
        redirectTo: window.location.origin
    });

    return { data, error };
}
