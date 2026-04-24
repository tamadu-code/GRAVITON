/**
 * Graviton CMS - Main Entry Point
 */

import { UI } from './ui.js';
import { startSyncLoop } from './supabase-client.js';

document.addEventListener('DOMContentLoaded', () => {
    // Initialize Lucide Icons
    lucide.createIcons();
    
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

    // Role Selector
    const roleSelector = document.getElementById('role-selector');
    roleSelector.value = localStorage.getItem('user_role') || 'Admin';
    roleSelector.addEventListener('change', (e) => {
        const newRole = e.target.value;
        localStorage.setItem('user_role', newRole);
        UI.currentUser.role = newRole;
        
        // Refresh Current View
        const hash = window.location.hash.substring(1) || 'dashboard';
        UI.renderView(hash);
        Notifications.show(`Switched to ${newRole} view`, 'info');
    });

    // Navigation / Routing
    const navItems = document.querySelectorAll('.nav-item');
    navItems.forEach(item => {
        item.addEventListener('click', (e) => {
            e.preventDefault();
            
            // UI State
            navItems.forEach(ni => ni.classList.remove('active'));
            item.classList.add('active');
            
            // Render View
            const view = item.getAttribute('data-view');
            UI.renderView(view);
            
            // Update URL hash without jumping
            history.pushState(null, null, `#${view}`);
        });
    });

    // Handle initial route
    const hash = window.location.hash.substring(1) || 'dashboard';
    const activeNav = document.querySelector(`.nav-item[data-view="${hash}"]`);
    if (activeNav) activeNav.click();

    // Start Sync Loop
    startSyncLoop();
    
    // Global event listeners
    window.addEventListener('sync-complete', (e) => {
        const statusEl = document.getElementById('sync-status');
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

    // Offline Detection
    window.addEventListener('online', () => {
        const indicator = document.querySelector('.status-indicator');
        indicator.className = 'status-indicator live';
        document.querySelector('.status-text').textContent = 'Cloud Live';
    });

    window.addEventListener('offline', () => {
        const indicator = document.querySelector('.status-indicator');
        indicator.className = 'status-indicator offline';
        document.querySelector('.status-text').textContent = 'Local Storage';
    });
});
