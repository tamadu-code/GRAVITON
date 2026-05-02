/**
 * Graviton CMS - Main Entry Point
 */

import { UI } from './ui.js';
window.UI = UI;
import { loginUser, logoutUser, getCurrentSession, getUserProfile, registerUser, resetPassword, startSyncLoop, syncToCloud, syncFromCloud } from './supabase-client.js';
import db from './db.js';
import { Notifications } from './utils.js';

// Expose utilities to window for HTML event attributes (e.g. onclick="Notifications.show()")
window.Notifications = Notifications;
window.db = db;


// Initialize Lucide Icons safely
if (typeof lucide !== 'undefined') {
    lucide.createIcons();
} else {
    console.warn('Lucide icons failed to load from CDN.');
}

// ─── DOM Elements ───
const loginScreen = document.getElementById('login-screen');
const createAccountScreen = document.getElementById('create-account-screen');
const forgotPasswordScreen = document.getElementById('forgot-password-screen');
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

// ─── App Initialization ───
let isInitializing = false;
async function initApp() {
    if (isInitializing) return;
    isInitializing = true;
    
    console.log('Graviton CMS: Initializing App...');
    
    // Run icon creation first
    if (typeof lucide !== 'undefined') lucide.createIcons();
    
    // Show a small loader on login button if we are still checking session
    if (loginBtn) {
        console.log('Disabling login button for session check...');
        loginBtn.disabled = true;
        loginBtn.innerHTML = '<span>Verifying Session...</span><div class="loader" style="width:14px; height:14px; border:2px solid white; border-top-color:transparent; border-radius:50%; animation:spin 1s linear infinite;"></div>';
    }

    try {
        // Add a timeout to session check to prevent permanent "Verifying Session" state
        const sessionPromise = getCurrentSession();
        const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error('Session check timed out')), 5000));
        
        const session = await Promise.race([sessionPromise, timeoutPromise]);
        
        if (session) {
            console.log('Session found, loading app...');
            await loadAuthenticatedApp(session.user);
        } else {
            console.log('No session found, showing login.');
            showLoginScreen();
        }
    } catch (e) {
        console.warn('Initialization notice/error:', e.message);
        showLoginScreen();
    } finally {
        isInitializing = false;
        // ALWAYS ensure the login button is re-enabled if we are still on the login screen
        if (loginBtn) {
            const isLoginVisible = window.getComputedStyle(loginScreen).display !== 'none';
            if (isLoginVisible) {
                console.log('Re-enabling login button...');
                loginBtn.disabled = false;
                loginBtn.innerHTML = '<span>Sign In to Account</span><i data-lucide="log-in"></i>';
                if (typeof lucide !== 'undefined') lucide.createIcons();
            }
        }
    }
}

async function loadAuthenticatedApp(authUser) {
    console.log('Loading authenticated app for:', authUser.email);
    
    // Fetch user profile from Supabase
    let profile = await getUserProfile(authUser.id);

    // Safety net: If profile fetch failed, build a local-only fallback.
    // IMPORTANT: Do NOT upsert back to DB here — that would overwrite the
    // real role (e.g. 'Admin') with the registration metadata role ('Pending').
    if (!profile) {
        console.warn('Profile fetch failed — using auth metadata as fallback. Check Supabase RLS policies on the profiles table.');
        const { full_name } = authUser.user_metadata || {};
        profile = {
            id: authUser.id,
            full_name: full_name || authUser.email.split('@')[0],
            // Don't use user_metadata.role here — it was set at registration
            // and is likely 'Pending'. Treat as Admin so the owner is not locked out.
            role: 'Admin',
        };
    }

    // Update UI State
    const currentName = profile.full_name || authUser.email;
    const currentRole = profile.role || 'Admin';

    UI.currentUser = {
        id: authUser.id,
        email: authUser.email,
        role: currentRole,
        name: currentName,
        assigned_id: profile.assigned_id || null
    };

    // Initialize sidebar visibility based on role
    UI.initSidebar();

    // Update Topbar & Sidebar Footer UI
    const userNameEl = document.querySelector('.user-name');
    const userRoleEl = document.querySelector('.user-role');
    const footerNameEl = document.getElementById('footer-user-name');
    const footerRoleEl = document.getElementById('footer-user-role');
    const footerAvatarEl = document.querySelector('.user-avatar-small');

    if (userNameEl) userNameEl.textContent = currentName;
    if (userRoleEl) userRoleEl.textContent = currentRole;
    if (footerNameEl) footerNameEl.textContent = currentName;
    if (footerRoleEl) footerRoleEl.textContent = currentRole;
    if (footerAvatarEl) footerAvatarEl.textContent = currentName.charAt(0).toUpperCase();

    const teacherAllowed = ['dashboard', 'students', 'classes', 'subjects', 'attendance', 'gradebook', 'cbt', 'noticeboard', 'insights'];
    const studentAllowed = ['dashboard', 'attendance', 'gradebook', 'cbt', 'noticeboard'];
    const parentAllowed = ['dashboard', 'attendance', 'gradebook', 'cbt', 'noticeboard'];

    document.querySelectorAll('.nav-item').forEach(item => {
        const view = item.getAttribute('data-view');
        if (currentRole === 'Teacher' && !teacherAllowed.includes(view)) {
            item.style.display = 'none';
        } else if (currentRole === 'Student' && !studentAllowed.includes(view)) {
            item.style.display = 'none';
        } else if (currentRole === 'Parent' && !parentAllowed.includes(view)) {
            item.style.display = 'none';
        } else {
            item.style.display = 'flex';
        }
    });

    // Re-render icons
    if (typeof lucide !== 'undefined') lucide.createIcons();

    // Hide all auth screens, show app (Done last to ensure app is ready)
    loginScreen.style.display = 'none';
    createAccountScreen.style.display = 'none';
    forgotPasswordScreen.style.display = 'none';
    appContainer.style.display = 'flex';

    // Start Data Sync Loop and update status when first sync completes
    updateSyncStatus('Syncing', 'syncing');
    startSyncLoop().then(() => {
        updateSyncStatus('Online', 'live');
    }).catch(() => {
        updateSyncStatus('Offline', 'offline');
    });

    // ─── Auto-Hydration Check ───
    try {
        const studentCount = await db.students.count();
        if (studentCount === 0 && navigator.onLine) {
            if (window.Notifications) window.Notifications.show('Detecting fresh environment... Syncing academic data.', 'info');
            // initial sync is already triggered by startSyncLoop()
        }
    } catch (dbErr) {
        console.warn('Auto-hydration deferred: Database initializing...', dbErr);
    }

    // Handle initial route
    const hash = window.location.hash.substring(1) || 'dashboard';
    const activeNav = document.querySelector(`.nav-item[data-view="${hash}"]`);
    if (activeNav) {
        activeNav.click();
    } else {
        UI.renderView('dashboard');
    }
}

// ─── Login Form Submit ───
if (loginForm) {
    loginForm.addEventListener('submit', async (e) => {
        e.preventDefault();

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

            // --- Student ID Login Translation ---
            // Now handled inside loginUser in supabase-client.js
            // ------------------------------------

            const { data, error } = await loginUser(email, password);

            if (error) {
                loginError.textContent = error.message || 'Invalid email or password.';
                loginError.style.display = 'block';
                loginBtn.disabled = false;
                loginBtn.innerHTML = '<span>Sign In to Account</span><i data-lucide="log-in"></i>';
                if (typeof lucide !== 'undefined') lucide.createIcons();
            } else if (data && data.session) {
                console.log('Login successful, loading app...');
                await loadAuthenticatedApp(data.session.user);
            } else {
                // Successful auth but no session returned (unexpected)
                loginError.textContent = 'Session could not be established. Please try again.';
                loginError.style.display = 'block';
                loginBtn.disabled = false;
                loginBtn.innerHTML = '<span>Sign In to Account</span><i data-lucide="log-in"></i>';
            }
        } catch (err) {
            console.error('Login error:', err);
            loginError.textContent = err.message || 'An unexpected error occurred during login.';
            loginError.style.display = 'block';
            loginBtn.disabled = false;
            loginBtn.innerHTML = '<span>Sign In to Account</span><i data-lucide="log-in"></i>';
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
        // Optimistic UI: Hide app immediately
        appContainer.style.display = 'none';
        loginScreen.style.display = 'flex';
        
        logoutBtn.textContent = 'Clearing Session...';
        logoutBtn.disabled = true;

        try {
            // Give Supabase 2 seconds to sign out, then force reload anyway
            await Promise.race([
                logoutUser(),
                new Promise(resolve => setTimeout(resolve, 2000))
            ]);
        } catch(e) {
            console.error('Logout error:', e);
        } finally {
            // Clear any lingering auth keys in localStorage
            for (let key in localStorage) {
                if (key.includes('supabase.auth.token') || key.includes('sb-')) {
                    localStorage.removeItem(key);
                }
            }
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
        const teacherAllowed = ['dashboard', 'students', 'classes', 'subjects', 'attendance', 'gradebook', 'cbt', 'noticeboard', 'insights'];

        if (role === 'Teacher' && !teacherAllowed.includes(view)) {
            if (window.Notifications) Notifications.show('Access Denied: Admin privileges required.', 'error');
            return;
        }

        // UI State
        navItems.forEach(ni => ni.classList.remove('active'));
        item.classList.add('active');

        // Render View
        UI.renderView(view);

        // Update URL hash without jumping
        history.pushState(null, null, `#${view}`);
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
            }, (err) => {
                console.log('ServiceWorker registration failed: ', err);
            });
    });
}
