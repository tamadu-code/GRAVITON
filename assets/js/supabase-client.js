/**
 * Graviton CMS - Supabase Sync Engine
 * Handles cloud synchronization and real-time status
 */

import db from './db.js';

// Configuration (To be updated by user)
const SB_CONFIG = {
    url: localStorage.getItem('sb_url') || '',
    key: localStorage.getItem('sb_key') || ''
};

let supabase = null;

if (SB_CONFIG.url && SB_CONFIG.key) {
    supabase = supabase.createClient(SB_CONFIG.url, SB_CONFIG.key);
}

/**
 * Initialize Supabase Client
 */
export function initSupabase(url, key) {
    localStorage.setItem('sb_url', url);
    localStorage.setItem('sb_key', key);
    supabase = window.supabase.createClient(url, key);
    return supabase;
}

export function getSupabase() {
    return supabase;
}

/**
 * Sync Engine - Push local changes to cloud
 */
export async function syncToCloud() {
    if (!supabase) return { success: false, message: 'Supabase not configured' };

    const tables = ['profiles', 'students', 'classes', 'subjects', 'subject_assignments', 'form_teachers', 'scores', 'attendance'];
    let syncCount = 0;

    for (const table of tables) {
        // Find records where is_synced is 0
        const unsynced = await db[table].where('is_synced').equals(0).toArray();
        
        if (unsynced.length > 0) {
            console.log(`Syncing ${unsynced.length} records for ${table}...`);
            
            // Remove the is_synced flag before sending to Supabase
            const dataToSync = unsynced.map(item => {
                const { is_synced, ...rest } = item;
                return rest;
            });

            const { error } = await supabase.from(table).upsert(dataToSync);

            if (!error) {
                // Mark as synced locally
                const ids = unsynced.map(item => item.id || item.student_id);
                const pk = table === 'students' ? 'student_id' : 'id';
                
                for (const item of unsynced) {
                    await db[table].update(item[pk], { is_synced: 1 });
                }
                syncCount += unsynced.length;
            } else {
                console.error(`Sync error for ${table}:`, error);
            }
        }
    }

    return { success: true, count: syncCount };
}

/**
 * Sync Engine - Pull cloud changes to local
 */
export async function syncFromCloud() {
    if (!supabase) return;

    const tables = ['profiles', 'students', 'classes', 'subjects', 'subject_assignments', 'form_teachers', 'scores', 'attendance'];
    const lastSync = localStorage.getItem('last_sync_timestamp') || new Date(0).toISOString();

    for (const table of tables) {
        const { data, error } = await supabase
            .from(table)
            .select('*')
            .gt('updated_at', lastSync);

        if (!error && data) {
            for (const item of data) {
                const pk = table === 'students' ? 'student_id' : 'id';
                await db[table].put({ ...item, is_synced: 1 });
            }
        }
    }

    localStorage.setItem('last_sync_timestamp', new Date().toISOString());
}

/**
 * Start Background Sync Loop
 */
export function startSyncLoop(intervalMs = 60000) {
    // Initial sync
    syncFromCloud().then(() => syncToCloud());

    setInterval(async () => {
        const status = await syncToCloud();
        if (status.count > 0) {
            window.dispatchEvent(new CustomEvent('sync-complete', { detail: status }));
        }
    }, intervalMs);
}
