/**
 * Graviton CMS - Main Entry Point
 */

import { UI } from './ui.js';
import { loginUser, logoutUser, getCurrentSession, getUserProfile, getSupabase, registerUser, resetPassword, startSyncLoop, syncToCloud, syncFromCloud } from './supabase-client.js';
import db, { prepareForSync } from './db.js';
import { Notifications } from './utils.js';
import { initPushNotifications } from './push.js';

console.log("--- GRAVITON CORE v27.5 (BUILD v349) - INITIALIZING ---");
window.UI = UI;

// Expose utilities to window for HTML event attributes (e.g. onclick="Notifications.show()")
window.Notifications = Notifications;
window.db = db;
window.getSupabase = getSupabase;
window.syncToCloud = syncToCloud;
window.syncFromCloud = syncFromCloud;


// Initialize Lucide Icons safely
if (typeof lucide !== 'undefined') {
    lucide.createIcons();
} else {
    console.warn('Lucide icons failed to load from CDN.');
}

// ─── DOM Elements ───
const splashScreen = document.getElementById('splash-screen');
const loginScreen = document.getElementById('login-screen');
const createAccountScreen = document.getElementById('create-account-screen');
const forgotPasswordScreen = document.getElementById('forgot-password-screen');
const resetPasswordScreen = document.getElementById('reset-password-screen');
const appContainer = document.getElementById('app');

// Login form
const loginForm = document.getElementById('login-form');
const loginBtn = document.getElementById('login-submit-btn');
const loginError = document.getElementById('login-error');

// Create account form
const createAccountForm = document.getElementById('create-account-form');
const createAccountBtn = document.getElementById('create-account-btn');
const registerError = document.getElementById('register-error');
const registerSuccess = document.getElementById('register-success');

// Forgot password form
const forgotPasswordForm = document.getElementById('forgot-password-form');
const resetSubmitBtn = document.getElementById('reset-submit-btn');
const resetError = document.getElementById('reset-error');
const resetSuccess = document.getElementById('reset-success');

// Reset password (new password) form
const resetPasswordForm = document.getElementById('reset-password-form');
const newPasswordInput = document.getElementById('new-password-input');
const updatePasswordBtn = document.getElementById('update-password-btn');

// Navigation links between auth screens
const showCreateAccountLink = document.getElementById('show-create-account');
const backToLoginLink = document.getElementById('back-to-login');
const forgotPasswordLink = document.getElementById('forgot-password-link');
const backToLoginFromResetLink = document.getElementById('back-to-login-from-reset');

// ─── Password Visibility Toggle ───
document.querySelectorAll('.pw-toggle').forEach(button => {
    button.addEventListener('click', () => {
        const targetId = button.getAttribute('data-target');
        const input = document.getElementById(targetId);
        const icon = button.querySelector('i');
        
        if (input.type === 'password') {
            input.type = 'text';
            if (icon) icon.setAttribute('data-lucide', 'eye');
        } else {
            input.type = 'password';
            if (icon) icon.setAttribute('data-lucide', 'eye-off');
        }
        
        // Refresh icons
        if (typeof lucide !== 'undefined') lucide.createIcons();
    });
});

// ─── Screen Switching Helpers ───
function showScreen(screen) {
    if (splashScreen) splashScreen.style.display = 'none';
    loginScreen.style.display = 'none';
    createAccountScreen.style.display = 'none';
    forgotPasswordScreen.style.display = 'none';
    appContainer.style.display = 'none';
    screen.style.display = 'flex';

    // Re-render icons for the newly visible screen
    if (typeof lucide !== 'undefined') lucide.createIcons();
}

function showLoginScreen() {
    showScreen(loginScreen);
}

function showResetPasswordScreen() {
    showScreen(resetPasswordScreen);
}

// ─── App Initialization ───
let isInitializing = false;
async function initApp() {
    if (isInitializing) return;
    isInitializing = true;
    
    console.log('Graviton CMS: Initializing App...');
    
    // Fast-path: If no session token is found in localStorage, show login immediately
    // This avoids waiting for a Supabase network round-trip just to be told no session exists.
    const hasPotentialSession = Object.keys(localStorage).some(key => key.startsWith('sb-') && key.endsWith('-auth-token'));
    
    // Check if we are arriving from an auth link (Magic Link, Recovery, etc.)
    const hash = window.location.hash;
    const isAuthLink = hash.includes('access_token=') || hash.includes('type=recovery') || hash.includes('type=magiclink') || hash.includes('type=invite');
    
    if (!hasPotentialSession && !isAuthLink) {
        console.log('No local session token found, skipping session check.');
        showLoginScreen();
        isInitializing = false;
        if (typeof lucide !== 'undefined') lucide.createIcons();
        return;
    }

    if (isAuthLink) {
        console.log('Auth link detected in URL, waiting for session processing...');
        // Wait a small moment for Supabase to parse the hash
        await new Promise(r => setTimeout(r, 500));
    }

    // Show a small loader on login button if we are actually checking a real session
    if (loginBtn) {
        console.log('Verifying existing session...');
        loginBtn.disabled = true;
        loginBtn.innerHTML = '<span>Resuming Session...</span><div class="loader" style="width:14px; height:14px; border:2px solid white; border-top-color:transparent; border-radius:50%; animation:spin 1s linear infinite;"></div>';
    }

    try {
        // Add a timeout to session check
        const sessionPromise = getCurrentSession();
        const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error('Session check timed out')), 4000));
        
        const session = await Promise.race([sessionPromise, timeoutPromise]);
        
        if (session) {
            console.log('Session verified, loading app...');
            await loadAuthenticatedApp(session.user);
        } else {
            console.log('No active session found, showing login.');
            showLoginScreen();
        }
    } catch (e) {
        console.warn('Initialization notice:', e.message);
        showLoginScreen();
    } finally {
        isInitializing = false;
        // Re-enable login button if we ended up on the login screen
        if (loginBtn) {
            const isLoginVisible = window.getComputedStyle(loginScreen).display !== 'none';
            if (isLoginVisible) {
                loginBtn.disabled = false;
                loginBtn.innerHTML = '<span>Login</span><i data-lucide="arrow-right"></i>';
                lucide.createIcons();
            }
        }
    }

    // ─── Setup Auth Listener for Password Recovery ───
    const client = getSupabase();
    if (client) {
        client.auth.onAuthStateChange(async (event, session) => {
            console.log('[Auth] State Change:', event);
            if (event === 'PASSWORD_RECOVERY') {
                console.log('[Auth] Entering Password Recovery mode...');
                showResetPasswordScreen();
            }
        });
    }
}
function parseJwt(token) {
    try {
        const base64Url = token.split('.')[1];
        const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
        const jsonPayload = decodeURIComponent(window.atob(base64).split('').map(function(c) {
            return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2);
        }).join(''));
        return JSON.parse(jsonPayload);
    } catch (e) {
        console.error('Failed to parse JWT:', e);
        return null;
    }
}

async function loadAuthenticatedApp(authUser) {
    console.log('Loading authenticated app for:', authUser.email);
    
    const client = getSupabase();
    
    // Extract tenant_id from current session JWT
    const session = await getCurrentSession();
    if (session && session.access_token) {
        const claims = parseJwt(session.access_token);
        if (claims) {
            console.log('[Auth Hook] JWT Claims:', claims);
            
            // Check for client-side impersonation overrides
            const impTenantId = localStorage.getItem('impersonate_tenant_id');
            const impRole = localStorage.getItem('impersonate_role');
            if (impTenantId && impRole && (claims.user_role === 'SuperAdmin' || localStorage.getItem('original_user_role') === 'SuperAdmin')) {
                console.log(`[Impersonation] Overriding claims with target tenant: ${impTenantId}, role: ${impRole}`);
                if (!localStorage.getItem('original_user_role')) {
                    localStorage.setItem('original_user_role', claims.user_role);
                }
                claims.tenant_id = impTenantId;
                claims.user_role = impRole;
            }

            if (claims.tenant_id && claims.user_role !== 'SuperAdmin') {
                // ── TENANT SWITCH DETECTION ──
                // Only purge when a DIFFERENT tenant is logging in (not on first login or same tenant re-login)
                const previousTenantId = localStorage.getItem('last_active_tenant_id');
                if (previousTenantId && previousTenantId !== claims.tenant_id) {
                    console.warn(`[Tenant Switch] Detected tenant change: ${previousTenantId} → ${claims.tenant_id}. Purging local database...`);
                    try {
                        const allTables = db.tables.map(t => t.name);
                        for (const tableName of allTables) {
                            await db[tableName].clear();
                        }
                        // Clear sync timestamp to force full re-pull
                        localStorage.removeItem('last_sync_timestamp');
                        // Clear ALL tenant-specific branding/config from localStorage
                        localStorage.removeItem('tenant_school_name');
                        localStorage.removeItem('tenant_student_id_prefix');
                        localStorage.removeItem('tenant_subscription_status');
                        localStorage.removeItem('tenant_plan_tier');
                        localStorage.removeItem('tenant_max_student_limit');
                        console.log(`[Tenant Switch] Local database purged. ${allTables.length} tables cleared. Tenant localStorage keys reset.`);
                    } catch (purgeErr) {
                        console.error('[Tenant Switch] Failed to purge local DB:', purgeErr);
                        // Nuclear option: delete and recreate the entire database
                        try {
                            await db.delete();
                            window.location.reload();
                            return;
                        } catch (e) { console.error('[Tenant Switch] Nuclear purge also failed:', e); }
                    }
                } else if (!previousTenantId) {
                    console.log(`[Tenant Switch] First login for tenant ${claims.tenant_id}. No purge needed.`);
                } else {
                    console.log(`[Tenant Switch] Same tenant re-login (${claims.tenant_id}). Skipping purge.`);
                }

                localStorage.setItem('tenant_id', claims.tenant_id);
                localStorage.setItem('last_active_tenant_id', claims.tenant_id);
                
                // Fetch tenant configuration (e.g. prefix) and subscription status from database
                if (navigator.onLine && client) {
                    try {
                        const { data: tenantData } = await client
                            .from('tenants')
                            .select('student_id_prefix, name')
                            .eq('id', claims.tenant_id)
                            .maybeSingle();
                        if (tenantData && tenantData.student_id_prefix) {
                            localStorage.setItem('tenant_student_id_prefix', tenantData.student_id_prefix);
                            console.log(`[Auth Hook] Set tenant prefix: ${tenantData.student_id_prefix}`);
                        }
                        if (tenantData && tenantData.name) {
                            const cleanName = tenantData.name.toLowerCase().includes('default school') ? '' : tenantData.name;
                            localStorage.setItem('tenant_school_name', cleanName);
                        }

                        const { data: subData } = await client
                            .from('subscriptions')
                            .select('status, plan_tier, max_student_limit')
                            .eq('tenant_id', claims.tenant_id)
                            .order('updated_at', { ascending: false })
                            .limit(1)
                            .maybeSingle();
                        if (subData) {
                            localStorage.setItem('tenant_subscription_status', subData.status || 'active');
                            localStorage.setItem('tenant_plan_tier', subData.plan_tier || 'standard');
                            localStorage.setItem('tenant_max_student_limit', subData.max_student_limit || '200');
                            console.log(`[Auth Hook] Set subscription status: ${subData.status}, tier: ${subData.plan_tier}, limit: ${subData.max_student_limit}`);
                        } else {
                            localStorage.setItem('tenant_subscription_status', 'active');
                            localStorage.setItem('tenant_plan_tier', 'standard');
                            localStorage.setItem('tenant_max_student_limit', '200');
                        }
                    } catch (tenantErr) {
                        console.warn('Failed to fetch tenant prefix/subscription:', tenantErr);
                    }
                }
            } else {
                // If they are SuperAdmin, perform a clean purge of any previously active tenant cached data
                if (claims.user_role === 'SuperAdmin') {
                    const previousTenantId = localStorage.getItem('last_active_tenant_id');
                    if (previousTenantId) {
                        console.log(`[Tenant Switch] SuperAdmin active: cleaning up previous tenant (${previousTenantId}) data...`);
                        try {
                            const allTables = db.tables.map(t => t.name);
                            for (const tableName of allTables) {
                                await db[tableName].clear();
                            }
                            localStorage.removeItem('last_sync_timestamp');
                            localStorage.removeItem('last_active_tenant_id');
                        } catch (purgeErr) {
                            console.error('[Tenant Switch] Failed to clear local DB for SuperAdmin:', purgeErr);
                        }
                    }
                }

                localStorage.removeItem('tenant_id');
                localStorage.removeItem('tenant_student_id_prefix');
                localStorage.removeItem('tenant_subscription_status');
                localStorage.removeItem('tenant_plan_tier');
                localStorage.removeItem('tenant_max_student_limit');
                localStorage.removeItem('tenant_school_name');
            }
            
            if (claims.user_role) {
                localStorage.setItem('user_role', claims.user_role);
            }
        }
    }
    
    // Fetch user profile from Supabase
    let profile = null;
    try {
        profile = await getUserProfile(authUser.id);
        if (profile) {
            // [PASSPORT SUPPORT] Fetch student passport photo from students table
            if (profile.role === 'Student' || (profile.email && profile.email.toLowerCase().includes('@student.school'))) {
                const identifier = profile.assigned_id || (profile.email && profile.email.split('@')[0].toUpperCase());
                if (identifier) {
                    let sourceData = await db.students.get(identifier);
                    if (!sourceData && client) {
                        const { data } = await client.from('students').select('*').eq('student_id', identifier).maybeSingle();
                        sourceData = data;
                    }
                    if (sourceData) {
                        profile.passport = sourceData.passport_url || sourceData.passport || null;
                    }
                }
            }
        }
        
        // --- AUTO-REPAIR / PROVISIONING ---
        // If not found in profiles, we need to recover from the respective source table
        if (!profile) {
            console.log('[AutoRepair] Profile missing, attempting recovery...');
            const email = authUser.email.toLowerCase();
            const identifier = email.split('@')[0].toUpperCase();

            if (email.includes('@student.school') || email.includes('@school-portal.com')) {
                // Recover Student
                // 1. Try local first (faster)
                let sourceData = await db.students.get(identifier);
                
                // 2. Try cloud if local is empty
                if (!sourceData && client) {
                    const { data } = await client.from('students').select('*').eq('student_id', identifier).maybeSingle();
                    sourceData = data;
                }

                if (sourceData) {
                    profile = {
                        id: authUser.id,
                        full_name: sourceData.name,
                        role: 'Student',
                        assigned_id: sourceData.student_id,
                        email: authUser.email,
                        status: 'Active',
                        passport: sourceData.passport_url || sourceData.passport || null,
                        updated_at: new Date().toISOString()
                    };
                    
                    // Force save to profiles table
                    if (client) await client.from('profiles').upsert({
                        id: profile.id,
                        full_name: profile.full_name,
                        role: profile.role,
                        assigned_id: profile.assigned_id,
                        email: profile.email,
                        status: profile.status,
                        updated_at: profile.updated_at
                    });
                    console.log('[AutoRepair] Successfully re-provisioned student profile:', identifier);
                }
            }
        }
    } catch (e) {
        console.warn('Profile resolution fallback:', e);
    }

    if (!profile) {
        console.warn('Profile fetch failed — using auth metadata as fallback.');
        const { full_name, role: metaRole } = authUser.user_metadata || {};
        
        let detectedRole = metaRole || 'Admin'; 
        if (authUser.email.toLowerCase().includes('student')) detectedRole = 'Student';
        else if (authUser.email.toLowerCase().includes('parent')) detectedRole = 'Parent';
        
        const allowedRoles = ['Admin', 'Teacher', 'Student', 'Parent', 'Staff'];
        const matchedRole = allowedRoles.find(r => r.toLowerCase() === detectedRole.toLowerCase());
        if (matchedRole) {
            detectedRole = matchedRole;
        } else {
            detectedRole = 'Student';
        }

        profile = {
            id: authUser.id,
            full_name: full_name || authUser.email,
            role: detectedRole,
            assigned_id: authUser.email.split('@')[0].toUpperCase(),
            email: authUser.email,
            status: 'Active',
            updated_at: new Date().toISOString()
        };

        // Self-provision the missing profile row in Supabase (await to prevent race with push subscriptions)
        let isSynced = 0;
        const client = getSupabase();
        if (client) {
            try {
                const { error } = await client.from('profiles').upsert(profile);
                if (error) {
                    console.warn('Automatic profile provisioning deferred:', error.message);
                } else {
                    console.log('Profile successfully self-provisioned for:', authUser.email);
                    isSynced = 1;
                }
            } catch (provisionErr) {
                console.warn('Profile provisioning error:', provisionErr);
            }
        }

        // Cache in local IndexedDB so it's available offline immediately
        try {
            await db.profiles.put({ ...profile, is_synced: isSynced });
            console.log('Profile cached locally in IndexedDB.');
        } catch (dbErr) {
            console.warn('Failed to cache self-provisioned profile locally:', dbErr);
        }
    }

    // Update UI State
    const currentName = profile.full_name || authUser.email;
    let currentRole = profile.role || 'Admin';

    // Impersonation Override for UI
    const impRole = localStorage.getItem('impersonate_role');
    const impTenantId = localStorage.getItem('impersonate_tenant_id');
    if (impRole && impTenantId && (profile.role === 'SuperAdmin' || localStorage.getItem('original_user_role') === 'SuperAdmin')) {
        currentRole = impRole;
        profile.role = impRole;
        profile.tenant_id = impTenantId;
    }

    // Aggressive Role Correction: If email is @student.school, they MUST be a Student
    if (authUser.email.toLowerCase().includes('@student.school')) {
        currentRole = 'Student';
    } else if (authUser.email.toLowerCase().includes('@parent.school')) {
        currentRole = 'Parent';
    } else if (authUser.email.toLowerCase().includes('@staff.school') && currentRole !== 'Admin') {
        currentRole = 'Staff';
    }

    // Persist role for UI initialization
    localStorage.setItem('user_role', currentRole);

    UI.currentUser = {
        id: authUser.id,
        email: authUser.email,
        role: currentRole,
        name: currentName,
        assigned_id: profile.assigned_id || null,
        passport: profile.passport || null
    };

    // Initialize Push Notifications asynchronously
    initPushNotifications(authUser.id).catch(err => console.warn('[Push] Setup warning:', err));

    // Initialize sidebar visibility based on role
    UI.initSidebar();

    // Update Topbar & Sidebar Footer UI
    const userNameEl = document.querySelector('.user-name');
    const userRoleEl = document.querySelector('.user-role');
    const footerNameEl = document.getElementById('footer-user-name');
    const footerRoleEl = document.getElementById('footer-user-role');
    const footerAvatarEl = document.querySelector('.user-avatar-small');
    const headerAvatarImg = document.querySelector('.user-avatar img');

    if (userNameEl) userNameEl.textContent = currentName;
    if (userRoleEl) userRoleEl.textContent = currentRole;
    if (footerNameEl) footerNameEl.textContent = currentName;
    if (footerRoleEl) footerRoleEl.textContent = currentRole;

    if (footerAvatarEl) {
        if (profile.passport) {
            footerAvatarEl.innerHTML = `<img src="${profile.passport}" style="width: 100%; height: 100%; object-fit: cover; border-radius: 50%;">`;
            footerAvatarEl.style.padding = '0';
            footerAvatarEl.style.overflow = 'hidden';
        } else {
            footerAvatarEl.textContent = currentName.charAt(0).toUpperCase();
            footerAvatarEl.style.padding = '';
        }
    }

    if (headerAvatarImg) {
        if (profile.passport) {
            headerAvatarImg.src = profile.passport;
        } else {
            headerAvatarImg.src = `https://api.dicebear.com/7.x/avataaars/svg?seed=${currentName || 'User'}`;
        }
    }

    const teacherAllowed = ['dashboard', 'students', 'classes', 'subjects', 'attendance', 'gradebook', 'cbt', 'noticeboard', 'insights', 'profile'];
    const studentAllowed = ['dashboard', 'attendance', 'gradebook', 'cbt', 'noticeboard', 'finances'];
    const parentAllowed = ['dashboard'];
    const accountsAllowed = ['dashboard', 'finances', 'noticeboard'];
    const superAdminAllowed = ['superadmin', 'profile'];

    document.querySelectorAll('.nav-item').forEach(item => {
        const view = item.getAttribute('data-view');
        if (currentRole === 'SuperAdmin' && !superAdminAllowed.includes(view)) {
            item.style.display = 'none';
        } else if (view === 'superadmin' && currentRole !== 'SuperAdmin') {
            item.style.display = 'none';
        } else if (currentRole === 'Teacher' && !teacherAllowed.includes(view)) {
            item.style.display = 'none';
        } else if (currentRole === 'Student' && !studentAllowed.includes(view)) {
            item.style.display = 'none';
        } else if (currentRole === 'Parent' && !parentAllowed.includes(view)) {
            item.style.display = 'none';
        } else if (currentRole === 'Accounts Officer' && !accountsAllowed.includes(view)) {
            item.style.display = 'none';
        } else {
            item.style.display = 'flex';
        }
    });

    // Hide section headers for non-admin roles (SuperAdmin has its own console)
    if (currentRole !== 'Admin' && currentRole !== 'SuperAdmin') {
        document.querySelectorAll('.nav-section-header').forEach(h => {
            h.style.display = 'none';
        });
    }
    if (currentRole === 'SuperAdmin') {
        document.querySelectorAll('.nav-section-header').forEach(h => {
            h.style.display = 'none';
        });
        // Replace school branding with platform branding for SuperAdmin
        const sidebarLogo = document.getElementById('sidebar-school-logo');
        const sidebarName = document.getElementById('sidebar-school-name');
        if (sidebarLogo) sidebarLogo.textContent = '⚙';
        if (sidebarName) sidebarName.innerHTML = 'GRAVITON<br>PLATFORM ADMIN';
    }

    // Re-render icons
    if (typeof lucide !== 'undefined') lucide.createIcons();

    // Hide all auth screens, show app (Done last to ensure app is ready)
    if (splashScreen) splashScreen.style.display = 'none';
    loginScreen.style.display = 'none';
    createAccountScreen.style.display = 'none';
    forgotPasswordScreen.style.display = 'none';
    appContainer.style.display = 'flex';

    // Run Data Health Check (Admin only)
    await UI.runDatabaseHealthCheck();

    // Start Data Sync Loop and update status when first sync completes (skip for SuperAdmin)
    if (currentRole === 'SuperAdmin') {
        updateSyncStatus('Platform Admin', 'live');
    } else {
        updateSyncStatus('Syncing', 'syncing');
        startSyncLoop().then(() => {
            updateSyncStatus('Online', 'live');
            // Retry initializing push notifications if they failed earlier due to missing key
            if (!localStorage.getItem('vapid_public_key')) {
                initPushNotifications(authUser.id).catch(err => console.warn('[Push] Setup retry warning:', err));
            }
        }).catch(() => {
            updateSyncStatus('Offline', 'offline');
        });
    }

    // ─── Data Health Check & Auto-Purge ───
    async function checkInactiveHealth() {
        if (currentRole !== 'Admin') return;
        
        try {
            const ninetyDaysAgo = new Date();
            ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90); // ~1 Term (3 months)
            
            // Find students deactivated more than 90 days ago
            const oldInactive = await db.students.filter(s => s.is_active === 0 && s.deactivated_at && new Date(s.deactivated_at) < ninetyDaysAgo).toArray();
            
            if (oldInactive.length > 0) {
                Notifications.show(`Data Maintenance: ${oldInactive.length} students have been inactive for over 1 term. You can purge them in Settings to save space.`, 'info');
                console.log(`[HealthCheck] Found ${oldInactive.length} stale inactive records.`);
            }
        } catch (e) {
            console.warn('Health check failed:', e);
        }
    }
    checkInactiveHealth();

    // ─── Data Health Check & Auto-Repair ───
    async function repairCBTData() {
        try {
            const brokenExams = await db.cbt_exams.where('start_time').equals('').or('end_time').equals('').toArray();
            if (brokenExams.length > 0) {
                console.log(`Self-Heal: Fixing ${brokenExams.length} broken CBT records...`);
                for (const exam of brokenExams) {
                    await db.cbt_exams.update(exam.id, {
                        start_time: exam.start_time === '' ? null : exam.start_time,
                        end_time: exam.end_time === '' ? null : exam.end_time,
                        is_synced: 0
                    });
                }
            }
        } catch (e) { console.warn('Self-heal deferred:', e); }
    }
    await repairCBTData();

    // ─── One-Time Migration: Resolve UUID to Student ID in Scores & Results ───
    async function resolveUUIDStudentIds() {
        try {
            const profiles = await db.profiles.toArray();
            const profileMap = profiles.reduce((acc, p) => {
                if (p.assigned_id) acc[p.id] = p.assigned_id;
                return acc;
            }, {});

            let repairedCount = 0;

            // 1. Repair db.scores
            const allScores = await db.scores.toArray();
            for (const s of allScores) {
                const standardId = profileMap[s.student_id];
                if (standardId) {
                    console.log(`[Self-Heal] Mapping score student_id: ${s.student_id} -> ${standardId}`);
                    const newId = s.id.replace(s.student_id, standardId);
                    await db.scores.delete(s.id);
                    await db.scores.put(prepareForSync({
                        ...s,
                        id: newId,
                        student_id: standardId
                    }));
                    repairedCount++;
                }
            }

            // 2. Repair db.cbt_results
            const allResults = await db.cbt_results.toArray();
            for (const r of allResults) {
                const standardId = profileMap[r.student_id];
                if (standardId) {
                    console.log(`[Self-Heal] Mapping cbt_results student_id: ${r.student_id} -> ${standardId}`);
                    await db.cbt_results.delete(r.id);
                    await db.cbt_results.put(prepareForSync({
                        ...r,
                        student_id: standardId
                    }));
                    repairedCount++;
                }
            }

            // 3. Repair all tables missing tenant_id
            const activeTenantId = localStorage.getItem('tenant_id');
            if (activeTenantId) {
                const tablesToHeal = [
                    'profiles', 'students', 'classes', 'subjects', 'scores', 'timetable', 
                    'attendance', 'payments', 'fee_structures', 'form_teachers', 
                    'subject_assignments', 'student_analytics', 'duty_assignments', 
                    'parent_links', 'cbt_exams', 'cbt_questions', 'cbt_results', 
                    'cbt_question_bank', 'cbt_options', 'cbt_exam_questions', 
                    'cbt_exam_sections', 'push_subscriptions', 'audit_logs'
                ];
                for (const tableName of tablesToHeal) {
                    try {
                        const table = db[tableName];
                        if (table) {
                            const untenanted = await table.filter(row => !row.tenant_id).toArray();
                            if (untenanted.length > 0) {
                                console.log(`[Self-Heal] Auto-assigning tenant_id to ${untenanted.length} records in ${tableName}`);
                                for (const row of untenanted) {
                                    const pk = table.schema.primKey.name;
                                    await table.update(row[pk], { tenant_id: activeTenantId, is_synced: 0 });
                                }
                            }
                        }
                    } catch (tableErr) {
                        console.warn(`[Self-Heal] Failed to heal table ${tableName}:`, tableErr);
                    }
                }
            }

            if (repairedCount > 0) {
                console.log(`[Self-Heal] Repaired ${repairedCount} legacy UUID records.`);
                if (typeof syncToCloud === 'function') {
                    syncToCloud();
                }
            }
        } catch (e) {
            console.warn('[Self-Heal] Legacy UUID repair deferred:', e);
        }
    }
    await resolveUUIDStudentIds();

    // ─── One-Time Migration: Backfill class_name on Question Bank ───
    async function patchBankClassNames() {
        const PATCH_KEY = 'bank_classname_patch_v1';
        if (localStorage.getItem(PATCH_KEY)) return;
        try {
            const bankRecords = await db.cbt_question_bank.toArray();
            const needsPatch = bankRecords.filter(q => !q.class_name);
            if (needsPatch.length === 0) { localStorage.setItem(PATCH_KEY, '1'); return; }

            // Build a lookup from cbt_questions BANK exam_ids
            const allQ = await db.cbt_questions.toArray();
            const bankQ = allQ.filter(q => q.exam_id && q.exam_id.startsWith('BANK-'));
            const idToClass = {};
            bankQ.forEach(q => {
                // Format: BANK-{subjectId}__{className}__{term}__{session}
                const parts = q.exam_id.replace('BANK-', '').split('__');
                if (parts[1]) idToClass[q.id] = parts[1];
            });

            let patched = 0;
            for (const rec of needsPatch) {
                const className = idToClass[rec.id];
                if (className) {
                    await db.cbt_question_bank.update(rec.id, { class_name: className, is_synced: 0 });
                    patched++;
                }
            }
            console.log(`[Migration] Backfilled class_name on ${patched}/${needsPatch.length} bank records.`);
            localStorage.setItem(PATCH_KEY, '1');
        } catch (e) { console.warn('[Migration] Bank class_name patch deferred:', e); }
    }
    await patchBankClassNames();

    // Handle initial route — SuperAdmin goes straight to the console
    const defaultView = currentRole === 'SuperAdmin' ? 'superadmin' : 'dashboard';
    const initialHash = window.location.hash.substring(1) || defaultView;
    // Set initial browser history state so popstate has something to work with
    history.replaceState({ view: initialHash }, '', `#${initialHash}`);
    const activeNav = document.querySelector(`.nav-item[data-view="${initialHash}"]`);
    if (activeNav) {
        activeNav.click();
    } else {
        UI.renderView(defaultView);
    }
}

// ─── Login Form Submit (Moved Up for Reliability) ───
if (loginForm) {
    console.log('Login form found, attaching listener...');
    loginForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        console.log('Login event triggered!');

        try {
            console.log('Login form submitted...');
            let email = document.getElementById('login-email').value.trim();
            const password = document.getElementById('login-password').value;

            if (!email || !password) {
                Notifications.show('Please enter both ID/Email and password.', 'warning');
                return;
            }

            loginBtn.disabled = true;
            loginBtn.innerHTML = '<div class="loader" style="width:16px; height:16px; border-width:2px;"></div>';
            loginError.style.display = 'none';

            const { data, error } = await loginUser(email, password);
            console.log(`[Auth Debug] Login attempt finished. Success: ${!!data?.session}, Error: ${error?.message || 'None'}`);

            if (error) {
                loginError.textContent = error.message || 'Invalid email or password.';
                loginError.style.display = 'block';
                loginBtn.disabled = false;
                loginBtn.innerHTML = '<span>Login</span><i data-lucide="log-in"></i>';
                if (typeof lucide !== 'undefined') lucide.createIcons();
            } else if (data && data.session) {
                console.log('Login successful, loading app...');
                await loadAuthenticatedApp(data.session.user);
            } else {
                loginError.textContent = 'Session could not be established. Please try again.';
                loginError.style.display = 'block';
                loginBtn.disabled = false;
                loginBtn.innerHTML = '<span>Login</span><i data-lucide="log-in"></i>';
            }
        } catch (err) {
            console.error('Login form error:', err);
            loginBtn.disabled = false;
            loginBtn.innerHTML = '<span>Login</span><i data-lucide="log-in"></i>';
        }
    });
}

// ─── Reset Password (New Password) Form Submit ───
if (resetPasswordForm) {
    resetPasswordForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const newPassword = newPasswordInput.value;

        if (newPassword.length < 6) {
            Notifications.show('Password must be at least 6 characters.', 'error');
            return;
        }

        updatePasswordBtn.disabled = true;
        updatePasswordBtn.innerHTML = '<span>Updating...</span><div class="loader" style="width:14px; height:14px; border:2px solid white; border-top-color:transparent; border-radius:50%; animation:spin 1s linear infinite;"></div>';

        try {
            const { error } = await updateUserPassword(null, newPassword);
            if (error) throw error;

            Notifications.show('Password updated successfully! Logging you in...', 'success');
            
            // Redirect to login or load app if session is now active
            setTimeout(() => {
                window.location.href = window.location.origin + window.location.pathname;
            }, 1500);
        } catch (err) {
            console.error('Password reset error:', err);
            Notifications.show(err.message || 'Failed to update password.', 'error');
            updatePasswordBtn.disabled = false;
            updatePasswordBtn.innerHTML = '<span>Update Password</span><i data-lucide="arrow-right"></i>';
            if (typeof lucide !== 'undefined') lucide.createIcons();
        }
    });
}


// ─── Create Account Form Submit ───
if (createAccountForm) {
    createAccountForm.addEventListener('submit', async (e) => {
        e.preventDefault();

        const fullName = document.getElementById('register-name').value.trim();
        const email = document.getElementById('register-email').value.trim();
        const password = document.getElementById('register-password').value;
        const confirmPassword = document.getElementById('register-confirm-password').value;

        // Hide previous messages
        registerError.style.display = 'none';
        registerSuccess.style.display = 'none';

        // Validation
        if (password !== confirmPassword) {
            registerError.textContent = 'Passwords do not match.';
            registerError.style.display = 'block';
            return;
        }

        if (password.length < 6) {
            registerError.textContent = 'Password must be at least 6 characters.';
            registerError.style.display = 'block';
            return;
        }

        createAccountBtn.disabled = true;
        createAccountBtn.innerHTML = '<div class="loader" style="width:16px; height:16px; border-width:2px;"></div>';

        const { data, error } = await registerUser(email, password, fullName, 'Pending');

        if (error) {
            registerError.textContent = error.message || 'Failed to create account.';
            registerError.style.display = 'block';
            createAccountBtn.disabled = false;
            createAccountBtn.innerHTML = '<span>Create Account</span><i data-lucide="arrow-right"></i>';
            if (typeof lucide !== 'undefined') lucide.createIcons();
        } else {
            registerSuccess.textContent = 'Account created! Verify your email, then an admin will assign your role.';
            registerSuccess.style.display = 'block';
            createAccountForm.reset();
            createAccountBtn.disabled = false;
            createAccountBtn.innerHTML = '<span>Create Account</span><i data-lucide="arrow-right"></i>';
            if (typeof lucide !== 'undefined') lucide.createIcons();

            // Auto-redirect to login after a delay
            setTimeout(() => {
                showLoginScreen();
                registerSuccess.style.display = 'none';
            }, 4000);
        }
    });
}

// ─── Forgot Password Form Submit ───
if (forgotPasswordForm) {
    forgotPasswordForm.addEventListener('submit', async (e) => {
        e.preventDefault();

        const email = document.getElementById('reset-email').value.trim();

        resetError.style.display = 'none';
        resetSuccess.style.display = 'none';

        resetSubmitBtn.disabled = true;
        resetSubmitBtn.innerHTML = '<div class="loader" style="width:16px; height:16px; border-width:2px;"></div>';

        const { error } = await resetPassword(email);

        if (error) {
            resetError.textContent = error.message || 'Failed to send reset link.';
            resetError.style.display = 'block';
        } else {
            resetSuccess.textContent = 'Reset link sent! Check your email inbox.';
            resetSuccess.style.display = 'block';
            forgotPasswordForm.reset();
        }

        resetSubmitBtn.disabled = false;
        resetSubmitBtn.innerHTML = '<span>Send Reset Link</span><i data-lucide="send"></i>';
        if (typeof lucide !== 'undefined') lucide.createIcons();
    });
}

// ─── Auth Screen Navigation ───
if (showCreateAccountLink) {
    showCreateAccountLink.addEventListener('click', (e) => {
        e.preventDefault();
        showScreen(createAccountScreen);
    });
}

if (backToLoginLink) {
    backToLoginLink.addEventListener('click', (e) => {
        e.preventDefault();
        showScreen(loginScreen);
    });
}

if (forgotPasswordLink) {
    forgotPasswordLink.addEventListener('click', (e) => {
        e.preventDefault();
        showScreen(forgotPasswordScreen);
    });
}

if (backToLoginFromResetLink) {
    backToLoginFromResetLink.addEventListener('click', (e) => {
        e.preventDefault();
        showScreen(loginScreen);
    });
}

/**
 * Update Sync Status UI
 */
function updateSyncStatus(title, statusClass = 'live') {
    const syncBox = document.querySelector('.sync-status-box');
    const syncTitle = document.querySelector('.sync-title');
    
    if (syncTitle) syncTitle.textContent = title;
    
    if (syncBox) {
        syncBox.classList.remove('live', 'offline', 'syncing');
        syncBox.classList.add(statusClass);
    }
}

// Listen for sync events
window.addEventListener('sync-complete', (e) => {
    updateSyncStatus('Syncing', 'syncing');
    setTimeout(() => updateSyncStatus('Online', 'live'), 2000);
});

// Global Sync Error Listener
window.addEventListener('sync-error', (e) => {
    const { table, error, code, hint } = e.detail;
    console.error(`Sync error on ${table}:`, e.detail);
    
    if (Notifications) {
        let msg = `Sync failed for ${table}: ${error}`;
        if (code === '42501') msg = `Permission Denied on ${table}. Please check RLS Policies.`;
        if (code === 'PGRST301') msg = `Authentication error. Please logout and re-login.`;
        if (hint) msg += ` (Hint: ${hint})`;
        
        Notifications.show(msg, 'error');
    }
    updateSyncStatus('Sync Error', 'offline');
});

// Logout Button Logic
const logoutBtn = document.getElementById('logout-btn');
if (logoutBtn) {
    logoutBtn.addEventListener('click', async () => {
        // Instant Feedback: Show premium splash instead of freezing on login
        if (splashScreen) {
            splashScreen.style.display = 'flex';
            splashScreen.style.opacity = '1';
        }
        
        try {
            // Sign out in the background
            await logoutUser(); 
            
            // Safe cleanup: collect keys first to avoid index-shifting bugs
            const keysToRemove = [];
            for (let i = 0; i < localStorage.length; i++) {
                const key = localStorage.key(i);
                if (key && (key.includes('supabase.auth.token') || key.startsWith('sb-') || key.includes('user_role') || key.includes('tenant_'))) {
                    keysToRemove.push(key);
                }
            }
            keysToRemove.forEach(key => localStorage.removeItem(key));
            sessionStorage.clear();
            
        } catch(e) {
            console.error('Logout error:', e);
        } finally {
            // Quick redirect to reset the app state cleanly
            window.location.href = window.location.origin + window.location.pathname;
        }
    });
}

// ─── Navigation / Routing ───
const navItems = document.querySelectorAll('.nav-item');
navItems.forEach(item => {
    item.addEventListener('click', (e) => {
        e.preventDefault();

        const view = item.getAttribute('data-view');

        // Strict Role-Based Protection
        const role = UI.currentUser?.role;
        const teacherAllowed = ['dashboard', 'students', 'classes', 'subjects', 'attendance', 'gradebook', 'cbt', 'noticeboard', 'insights', 'profile'];
        const accountsAllowed = ['dashboard', 'finances', 'noticeboard'];

        if (role === 'Teacher' && !teacherAllowed.includes(view)) {
            if (window.Notifications) Notifications.show('Access Denied: Admin privileges required.', 'error');
            return;
        }

        if (role === 'Accounts Officer' && !accountsAllowed.includes(view)) {
            if (window.Notifications) Notifications.show('Access Denied: Financial module access restricted.', 'error');
            return;
        }

        // UI State
        navItems.forEach(ni => ni.classList.remove('active'));
        item.classList.add('active');

        // Render View
        UI.renderView(view);
    });
});

// ─── Sidebar Toggle (Desktop) ───
const sidebar = document.getElementById('sidebar');
const toggle = document.getElementById('sidebar-toggle');
if (toggle) {
    toggle.addEventListener('click', () => {
        sidebar.classList.toggle('collapsed');
        const icon = toggle.querySelector('i');
        if (sidebar.classList.contains('collapsed')) {
            icon.setAttribute('data-lucide', 'chevron-right');
        } else {
            icon.setAttribute('data-lucide', 'chevron-left');
        }
        if (typeof lucide !== 'undefined') lucide.createIcons();
    });
}

// ─── Mobile Sidebar Toggle ───
const mobileMenuBtn = document.getElementById('mobile-menu-btn');
if (mobileMenuBtn && sidebar) {
    let overlay = document.querySelector('.sidebar-overlay');
    if (!overlay) {
        overlay = document.createElement('div');
        overlay.className = 'sidebar-overlay';
        document.body.appendChild(overlay);
    }

    const toggleMobileMenu = () => {
        sidebar.classList.toggle('mobile-open');
        overlay.classList.toggle('active');
    };

    mobileMenuBtn.addEventListener('click', toggleMobileMenu);
    overlay.addEventListener('click', toggleMobileMenu);

    // Close sidebar when clicking a nav item on mobile/half-desktop
    navItems.forEach(item => {
        item.addEventListener('click', () => {
            if (window.innerWidth <= 1024 && sidebar.classList.contains('mobile-open')) {
                toggleMobileMenu();
            }
        });
    });
}
// ─── Manual Sync Button ───
const manualSyncBtn = document.getElementById('manual-sync-btn');
if (manualSyncBtn) {
    manualSyncBtn.addEventListener('click', async () => {
        const icon = manualSyncBtn.querySelector('i');
        if (icon) icon.classList.add('spinning');
        
        updateSyncStatus('Deep Syncing...', 'syncing');
        Notifications.show('Pulling fresh data from cloud...', 'info');
        
        try {
            // Force a deep sync by passing true
            await syncFromCloud(true);
            await syncToCloud();
            
            updateSyncStatus('Online', 'live');
            Notifications.show('Sync complete! All records updated.', 'success');
            
            // Re-render current view to show new data
            const currentHash = window.location.hash.substring(1) || 'dashboard';
            UI.renderView(currentHash);
        } catch (err) {
            console.error('Manual sync failed:', err);
            updateSyncStatus('Sync Error', 'offline');
            Notifications.show('Sync failed. Check your internet.', 'error');
        } finally {
            if (icon) icon.classList.remove('spinning');
        }
    });
}

// ─── Global Sync & Network Events ───
window.addEventListener('sync-complete', (e) => {
    const statusEl = document.getElementById('sync-status');
    if (!statusEl) return;
    const indicator = statusEl.querySelector('.status-indicator');
    const text = statusEl.querySelector('.status-text');
    if (e.detail.count > 0) {
        indicator.className = 'status-indicator syncing';
        text.textContent = `Syncing ${e.detail.count} records...`;
        setTimeout(() => {
            indicator.className = 'status-indicator live';
            text.textContent = 'Cloud Live';
        }, 3000);
    }
});

window.addEventListener('online', async () => {
    const indicator = document.querySelector('.status-indicator');
    const text = document.querySelector('.status-text');
    if (indicator && text) {
        indicator.className = 'status-indicator live';
        text.textContent = 'Cloud Live';
    }

    // NEW: Immediate push of offline data upon reconnection
    Notifications.show('Connection restored! Syncing pending data...', 'info');
    try {
        await syncToCloud();
        Notifications.show('All offline data synchronized successfully.', 'success');
    } catch (err) {
        console.error('Reconnection sync failed:', err);
    }
});


window.addEventListener('offline', () => {
    const indicator = document.querySelector('.status-indicator');
    const text = document.querySelector('.status-text');
    if (indicator && text) {
        indicator.className = 'status-indicator offline';
        text.textContent = 'Local Storage';
    }
});

// ─── Start the App ───
window.addEventListener('error', (e) => {
    console.error('Global Error Captured:', e.message, 'at', e.filename, ':', e.lineno);
});

window.addEventListener('unhandledrejection', (e) => {
    console.error('Unhandled Promise Rejection:', e.reason);
});

initApp();

// ─── PWA Service Worker Registration ───
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('./sw.js')
            .then((registration) => {
                console.log('ServiceWorker registration successful with scope: ', registration.scope);
                // Check for updates periodically
                setInterval(() => {
                    registration.update();
                }, 60000 * 5); // Check every 5 minutes
            }, (err) => {
                console.log('ServiceWorker registration failed: ', err);
            });
    });

    // Reload the page when the new Service Worker has taken over
    let refreshing = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
        if (refreshing) return;
        refreshing = true;
        console.log('[SW] Controller changed. Reloading page...');
        window.location.reload();
    });
}

// ─── PWA Back Button Navigation ───
// Tracks consecutive rapid back presses; 3 within 1.5s closes the PWA.
let _backPressTimestamps = [];
const BACK_PRESS_WINDOW_MS = 1500;
const BACK_PRESSES_TO_CLOSE = 3;

window.addEventListener('popstate', (e) => {
    // Track rapid back presses for close-on-triple-tap
    const now = Date.now();
    _backPressTimestamps.push(now);
    // Keep only presses within the time window
    _backPressTimestamps = _backPressTimestamps.filter(t => now - t < BACK_PRESS_WINDOW_MS);

    if (_backPressTimestamps.length >= BACK_PRESSES_TO_CLOSE) {
        _backPressTimestamps = [];
        // Close the PWA / minimize to home screen
        if (window.Notifications) {
            Notifications.show('Closing app...', 'info');
        }
        // Small delay so the toast is visible, then close
        setTimeout(() => {
            window.close();
            // Fallback: if window.close() doesn't work (some browsers block it),
            // navigate to a blank page which effectively "exits" the PWA.
            if (!window.closed) {
                window.location.href = 'about:blank';
            }
        }, 300);
        return;
    }

    // Normal back navigation: go to the previous view in the app's history stack
    const prevView = UI._navigationHistory.pop();
    if (prevView) {
        UI._isPopstateNav = true;
        UI.renderView(prevView);
        UI._isPopstateNav = false;

        // Update the active sidebar nav highlight
        const navItems = document.querySelectorAll('.nav-item');
        navItems.forEach(ni => ni.classList.remove('active'));
        const activeItem = document.querySelector(`.nav-item[data-view="${prevView}"]`);
        if (activeItem) activeItem.classList.add('active');
    } else {
        // No more app history. If already on dashboard, push a state so
        // the next back press still fires popstate (for the triple-tap check).
        if (UI.currentView === 'dashboard') {
            history.pushState({ view: 'dashboard' }, '', '#dashboard');
            if (window.Notifications) {
                Notifications.show('Press back 2 more times to exit', 'info');
            }
        } else {
            // Go to dashboard as a fallback
            UI._isPopstateNav = true;
            UI.renderView('dashboard');
            UI._isPopstateNav = false;
            history.pushState({ view: 'dashboard' }, '', '#dashboard');

            const navItems = document.querySelectorAll('.nav-item');
            navItems.forEach(ni => ni.classList.remove('active'));
            const dashItem = document.querySelector('.nav-item[data-view="dashboard"]');
            if (dashItem) dashItem.classList.add('active');
        }
    }
});
