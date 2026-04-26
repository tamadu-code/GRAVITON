/**
 * Graviton CMS - Supabase Sync Engine
 * Handles cloud synchronization and real-time status
 */

import db from './db.js';

// Configuration
const SB_CONFIG = {
    url: 'https://urqygjltionvaxuacfzr.supabase.co',
    key: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVycXlnamx0aW9udmF4dWFjZnpyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzcwMzEzMDEsImV4cCI6MjA5MjYwNzMwMX0.Vpk7rifsfjMCVBSYpEdVzkHv3w324iKp8B7urlKc_e4'
};

let sb = null;

if (SB_CONFIG.url && SB_CONFIG.key) {
    try {
        sb = window.supabase.createClient(SB_CONFIG.url, SB_CONFIG.key);
    } catch (e) {
        console.error('Failed to initialize Supabase:', e);
    }
}

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
    return sb;
}

/**
 * Sync Engine - Push local changes to cloud
 */
export async function syncToCloud() {
    if (!sb) return { success: false, message: 'Supabase not configured' };

    const tables = ['profiles', 'students', 'classes', 'subjects', 'subject_assignments', 'form_teachers', 'scores', 'attendance'];
    let syncCount = 0;

    for (const table of tables) {
        try {
            // Find records where is_synced is 0
            const unsynced = await db[table].where('is_synced').equals(0).toArray();
            
            if (unsynced.length > 0 && sb) {
                console.log(`Syncing ${unsynced.length} records for ${table}...`);
                
                // Remove the is_synced flag before sending to Supabase
                const dataToSync = unsynced.map(item => {
                    const { is_synced, ...rest } = item;
                    return rest;
                });

                const { error } = await sb.from(table).upsert(dataToSync);

                if (!error) {
                    // Mark as synced locally
                    const pk = table === 'students' ? 'student_id' : 'id';
                    for (const item of unsynced) {
                        await db[table].update(item[pk], { is_synced: 1 });
                    }
                    syncCount += unsynced.length;
                } else {
                    console.error(`Sync error for ${table}:`, error);
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
export async function syncFromCloud() {
    if (!sb) return;

    const tables = ['profiles', 'students', 'classes', 'subjects', 'subject_assignments', 'form_teachers', 'scores', 'attendance'];
    const lastSync = localStorage.getItem('last_sync_timestamp') || new Date(0).toISOString();

    for (const table of tables) {
        try {
            const { data, error } = await sb
                .from(table)
                .select('*')
                .gt('updated_at', lastSync);

            if (!error && data) {
                for (const item of data) {
                    await db[table].put({ ...item, is_synced: 1 });
                }
            }
        } catch (e) {
            console.error(`Pull error for ${table}:`, e);
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
        const status = await syncToCloud();
        if (status.count > 0) {
            window.dispatchEvent(new CustomEvent('sync-complete', { detail: status }));
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
    if (!sb) return { data: null, error: { message: 'Supabase not initialized' } };
    const { data, error } = await sb.auth.signInWithPassword({ email, password });
    return { data, error };
}

/**
 * Sign out
 */
export async function logoutUser() {
    if (!sb) return true; // No Supabase — just let the caller reload
    try {
        await sb.auth.signOut();
    } catch(e) {
        console.error('Sign out error:', e);
    }
    return true;
}

/**
 * Get current session
 */
export async function getCurrentSession() {
    if (!sb) return null;
    const { data, error } = await sb.auth.getSession();
    if (error) return null;
    return data.session;
}

/**
 * Get user profile from the profiles table
 */
export async function getUserProfile(userId) {
    if (!sb) return null;
    const { data, error } = await sb.from('profiles').select('*').eq('id', userId).single();
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
    if (!sb) return { data: null, error: { message: 'Supabase not initialized' } };

    // 1. Create auth user
    const { data, error } = await sb.auth.signUp({
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

        const { error: profileError } = await sb.from('profiles').upsert(profileData);
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
    if (!sb) return { error: { message: 'Supabase not initialized' } };

    const { data, error } = await sb.auth.resetPasswordForEmail(email, {
        redirectTo: window.location.origin
    });

    return { data, error };
}
