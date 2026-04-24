/**
 * Graviton CMS - Main Entry Point
 */

import { UI } from './ui.js';
import { startSyncLoop } from './supabase-client.js';

// Module scripts are deferred by default, so the DOM is already ready here.

// Initialize Lucide Icons safely
if (typeof lucide !== 'undefined') {
    lucide.createIcons();
} else {
    console.warn('Lucide icons failed to load from CDN.');
}

// Sidebar Toggle
const sidebar = document.getElementById('sidebar');
const toggle = document.getElementById('sidebar-toggle');

toggle.addEventListener('click', () => {
    sidebar.classList.toggle('collapsed');
    const icon = toggle.querySelector('i');
    if (sidebar.classList.contains('collapsed')) {
        icon.setAttribute('data-lucide', 'chevron-right');
    } else {
        icon.setAttribute('data-lucide', 'chevron-left');
    }
    lucide.createIcons();
});

// Auth Imports
import { loginUser, logoutUser, getCurrentSession, getUserProfile, startSyncLoop } from './supabase-client.js';

// DOM Elements
const loginScreen = document.getElementById('login-screen');
const appContainer = document.getElementById('app-container');
const loginForm = document.getElementById('login-form');
const loginBtn = document.getElementById('login-submit-btn');
const loginError = document.getElementById('login-error');
const logoutBtn = document.getElementById('logout-btn');

/**
 * App Initialization Flow
 */
async function initApp() {
    // 1. Check Session
    const session = await getCurrentSession();
    
    if (session) {
        // User is logged in
        await loadAuthenticatedApp(session.user);
    } else {
        // Show Login
        showLoginScreen();
    }
}

function showLoginScreen() {
    loginScreen.style.display = 'flex';
    appContainer.style.display = 'none';
}

async function loadAuthenticatedApp(authUser) {
    // Hide login, show app
    loginScreen.style.display = 'none';
    appContainer.style.display = 'flex';
    
    // Fetch user profile to get role and assigned_id
    const profile = await getUserProfile(authUser.id);
    
    // Fallback if profile doesn't exist yet (for testing)
    const userRole = profile ? profile.role : 'Admin';
    const userName = profile ? profile.full_name : authUser.email;
    const assignedId = profile ? profile.assigned_id : null;
    
    // Update UI State
    UI.currentUser = {
        id: authUser.id,
        email: authUser.email,
        role: userRole,
        name: userName,
        assigned_id: assignedId
    };
    
    // Update Topbar UI
    document.getElementById('display-user-name').textContent = userName;
    document.getElementById('display-user-role').textContent = userRole;
    
    // Start Data Sync Loop
    startSyncLoop();
    
    // Handle initial route
    const hash = window.location.hash.substring(1) || 'dashboard';
    const activeNav = document.querySelector(`.nav-item[data-view="${hash}"]`);
    if (activeNav) {
        activeNav.click();
    } else {
        UI.renderView('dashboard'); // Fallback
    }
}

/**
 * Event Listeners
 */

// Login Form Submit
if (loginForm) {
    loginForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const email = document.getElementById('login-email').value;
        const password = document.getElementById('login-password').value;
        
        loginBtn.disabled = true;
        loginBtn.innerHTML = '<div class="loader" style="width:16px; height:16px; border-width:2px;"></div>';
        loginError.style.display = 'none';
        
        const { data, error } = await loginUser(email, password);
        
        if (error) {
            loginError.textContent = error.message;
            loginError.style.display = 'block';
            loginBtn.disabled = false;
            loginBtn.innerHTML = '<i data-lucide="log-in"></i> Sign In';
            if (typeof lucide !== 'undefined') lucide.createIcons();
        } else if (data && data.session) {
            // Success
            await loadAuthenticatedApp(data.session.user);
        }
    });
}

// Logout Button
if (logoutBtn) {
    logoutBtn.addEventListener('click', async () => {
        await logoutUser();
        window.location.reload(); // Reload to clear all state
    });
}

// Navigation / Routing
const navItems = document.querySelectorAll('.nav-item');
navItems.forEach(item => {
    item.addEventListener('click', (e) => {
        e.preventDefault();
        
        const view = item.getAttribute('data-view');
        
        // Strict Role-Based Protection
        const role = UI.currentUser.role;
        if (role === 'Parent' && ['academic', 'promotion', 'settings', 'students'].includes(view)) {
            if (window.Notifications) Notifications.show('Access Denied', 'error');
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

// Sidebar Toggle
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

// Global Sync & Network Events
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

window.addEventListener('online', () => {
    const indicator = document.querySelector('.status-indicator');
    const text = document.querySelector('.status-text');
    if (indicator && text) {
        indicator.className = 'status-indicator live';
        text.textContent = 'Cloud Live';
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

// Start the App
initApp();

