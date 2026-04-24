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
        console.log('Sync Complete:', e.detail);
        // Refresh current view if needed
    });
});
