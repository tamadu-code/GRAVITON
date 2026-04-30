/**
 * Graviton CMS - UI Renderer
 * Manages view transitions and dynamic content
 */
console.log('UI Module Loading...');

import db, { prepareForSync, generateStudentId } from './db.js';
import { ScoringEngine, Notifications, parseExcel, generateReportCard, generateCredentialsPDF, generateMastersheet } from './utils.js';
import { syncToCloud, syncFromCloud } from './supabase-client.js';

export const UI = {
    get contentArea() { return document.getElementById('content-area'); },
    get viewTitle() { return document.getElementById('view-title'); },
    currentUser: {
        role: localStorage.getItem('user_role') || 'Admin',
        name: 'Admin User'
    },

    async renderView(viewName) {
        try {
            if (!this.contentArea) {
                console.error('Content area not found');
                return;
            }

            this.showLoader();
            
            // Update Title
            if (this.viewTitle) {
                this.viewTitle.textContent = viewName.charAt(0).toUpperCase() + viewName.slice(1);
            }
            
            // Clear dynamic header content
            try {
                const extraHeader = document.getElementById('top-bar-extra');
                if (extraHeader) extraHeader.innerHTML = '';
            } catch (e) { console.warn('Failed to clear extra header:', e); }

            // RBAC: Check Teacher Restrictions
            const isTeacher = (this.currentUser.role || '').toLowerCase() === 'teacher';
            const restrictedForTeachers = ['classes', 'subjects', 'academic', 'bulkimport', 'staff', 'promotion', 'config'];
            
            if (isTeacher && restrictedForTeachers.includes(viewName)) {
                this.contentArea.innerHTML = `
                    <div class="view-container" style="display: flex; align-items: center; justify-content: center; height: 70vh;">
                        <div class="text-center" style="max-width: 400px;">
                            <div style="background: #fee2e2; color: #ef4444; width: 80px; height: 80px; border-radius: 50%; display: flex; align-items: center; justify-content: center; margin: 0 auto 1.5rem;">
                                <i data-lucide="shield-alert" style="width: 40px; height: 40px;"></i>
                            </div>
                            <h2 class="text-2xl font-bold mb-1">Access Restricted</h2>
                            <p class="text-secondary">Teachers are not authorized to access the <strong>${viewName}</strong> module. Please contact the administrator for assistance.</p>
                            <button class="btn btn-primary mt-3" onclick="UI.renderView('dashboard')">Back to Dashboard</button>
                        </div>
                    </div>
                `;
                if (typeof lucide !== 'undefined') lucide.createIcons();
                return;
            }

            // Render specific view
            switch(viewName) {
                case 'dashboard': await this.renderDashboard(); break;
                case 'students': await this.renderStudents(); break;
                case 'classes': await this.renderClasses(); break;
                case 'subjects': await this.renderSubjects(); break;
                case 'academic': await this.renderAcademic(); break;
                case 'bulkimport': await this.renderBulkImport(); break;
                case 'gradebook': await this.renderGrades(); break;
                case 'attendance': await this.renderAttendance(); break;
                case 'reports': await this.renderReports(); break;
                case 'staff': await this.renderStaff(); break;
                case 'cbt': await this.renderCBT(); break;
                case 'lessons': await this.renderLessons(); break;
                case 'promotion': await this.renderPromotionEngine(); break;
                case 'config': await this.renderSettings(); break;
                default: this.contentArea.innerHTML = `<h2>View ${viewName} coming soon...</h2>`;
            }
        } catch (error) {
            console.error(`Error rendering ${viewName}:`, error);
            if (this.contentArea) {
                this.contentArea.innerHTML = `
                    <div class="card error-card" style="border-color: var(--accent-danger);">
                        <h3 style="color: var(--accent-danger);"><i data-lucide="alert-triangle"></i> Error Loading View</h3>
                        <p class="text-secondary mt-2">${error.message}</p>
                        <button class="btn btn-secondary mt-2" onclick="location.reload()">Reload Page</button>
                    </div>
                `;
            }
        }
        if (typeof lucide !== 'undefined') {
            lucide.createIcons();
        }
    },

    showLoader() {
        this.contentArea.innerHTML = `
            <div class="loader-container">
                <div class="loader"></div>
            </div>
        `;
    },

    initSidebar() {
        const role = (localStorage.getItem('user_role') || '').toLowerCase();
        const navItems = document.querySelectorAll('.nav-item');
        const adminSectionHeaders = document.querySelectorAll('.nav-section-header');
        
        // Modules strictly restricted to Admin only
        const adminOnlyViews = ['staff', 'keys', 'parents', 'lessons', 'roster', 'curriculum', 'reports', 'insights', 'finances', 'timetables', 'noticeboard'];
        
        navItems.forEach(item => {
            const view = item.dataset.view;
            if (role !== 'admin' && adminOnlyViews.includes(view)) {
                item.setAttribute('style', 'display: none !important');
            } else {
                item.style.display = 'flex';
            }
        });

        // Hide "ADMINISTRATION" section header if role is not admin
        adminSectionHeaders.forEach(header => {
            if (role !== 'admin' && header.textContent.trim().toUpperCase().includes('ADMINISTRATION')) {
                header.setAttribute('style', 'display: none !important');
            }
        });
    },

    showModal(title, contentHtml, onConfirm, confirmText = 'Register', confirmIcon = 'save') {
        // Remove existing if any
        const existing = document.getElementById('ui-modal');
        if (existing) existing.remove();

        const overlay = document.createElement('div');
        overlay.id = 'ui-modal';
        overlay.className = 'modal-overlay active';
        overlay.innerHTML = `
            <div class="modal-container">
                <div class="modal-header">
                    <div class="modal-title">${title}</div>
                    <button class="modal-close" onclick="document.getElementById('ui-modal').remove()"><i data-lucide="x"></i></button>
                </div>
                <div class="modal-body">
                    ${contentHtml}
                </div>
                <div class="modal-footer">
                    <button class="btn btn-secondary" onclick="document.getElementById('ui-modal').remove()" style="background: rgba(255,255,255,0.1); color: white; border: none; padding: 0.75rem 1.5rem; border-radius: 12px;">Cancel</button>
                    <button id="modal-confirm-btn" class="btn" style="background: white; color: #1e293b; border: none; font-weight: 700; padding: 0.75rem 1.5rem; border-radius: 12px; display: flex; align-items: center; gap: 0.5rem;"><i data-lucide="${confirmIcon}"></i> ${confirmText}</button>
                </div>
            </div>
        `;
        document.body.appendChild(overlay);
        if (typeof lucide !== 'undefined') lucide.createIcons();

        document.getElementById('modal-confirm-btn').addEventListener('click', async () => {
            if (onConfirm) {
                const btn = document.getElementById('modal-confirm-btn');
                btn.disabled = true;
                btn.innerHTML = '<i data-lucide="loader" class="spin"></i> Processing...';
                try {
                    await onConfirm();
                    overlay.remove();
                } catch (e) {
                    console.error('Modal Action Error:', e);
                    btn.disabled = false;
                    btn.innerHTML = `<i data-lucide="${confirmIcon}"></i> ${confirmText}`;
                    if (typeof Notifications !== 'undefined') {
                        Notifications.show('An error occurred. Check console for details.', 'error');
                    }
                }
            } else {
                overlay.remove();
            }
        });
    },

    async renderDashboard() {
        const role = (this.currentUser.role || '').toLowerCase();
        if (role === 'teacher') {
            await this.renderTeacherDashboard();
        } else if (role === 'student') {
            await this.renderStudentDashboard();
        } else if (role === 'parent') {
            await this.renderParentDashboard();
        } else {
            // Admin, Pending, or any unrecognised role → Admin dashboard
            await this.renderAdminDashboard();
        }
    },


    async renderAdminDashboard() {
        // ── Core counts ──────────────────────────────────────────────────
        // Filter to only active students
        const studentCount = await db.students.filter(s => s.is_active !== false).count();
        const classCount   = await db.classes.count();
        const allSubjects  = (await db.subjects.toArray()).sort((a,b) => a.name.localeCompare(b.name));
        const subjectCount = new Set(allSubjects.map(s => s.name.toLowerCase())).size;
        
        let teacherCount = 0;
        try {
            const profiles = await db.profiles.toArray();
            teacherCount = profiles.filter(p => p.role === 'Teacher').length;
            if (teacherCount === 0) {
                // Fallback to Supabase if local DB is empty
                const { getSupabase } = await import('./supabase-client.js');
                const sb = getSupabase();
                if (sb) {
                    const { count } = await sb.from('profiles').select('*', { count: 'exact', head: true }).eq('role', 'Teacher');
                    if (count !== null) teacherCount = count;
                }
            }
        } catch(e) { console.error('Error fetching teacher count', e); }

        const today          = new Date().toISOString().split('T')[0];
        const todayAtt       = await db.attendance.where('date').equals(today).toArray();
        const presentCount   = todayAtt.filter(r => r.status === 'Present').length;
        const totalMarked    = todayAtt.length;
        const turnoutPct     = totalMarked > 0 ? Math.round((presentCount / totalMarked) * 100) : 0;

        const subjects       = await db.subjects.toArray();
        const subjectEngRows = subjects.slice(0, 6).map(sub => ({
            name: sub.name,
            pct:  totalMarked > 0 ? Math.min(100, Math.round(turnoutPct + (Math.random() * 20 - 10))) : 0
        }));

        // Fetch Live Notices
        const notices = await db.notices.where('is_active').equals(1).toArray().catch(() => []);
        const noticeHTML = notices.length > 0 
            ? notices.map(n => `<span style="margin-right: 3rem;">🔔 <strong>${n.title}</strong>: ${n.content || ''}</span>`).join('')
            : '<span style="margin-right: 3rem;">Welcome to Graviton CMS! All systems operational.</span>';

        this.contentArea.innerHTML = `
            <div class="view-container">
                <header class="view-header" style="margin-bottom: 0.75rem;">
                    <h1 class="text-2xl font-extrabold tracking-tight" style="font-family: 'Outfit', sans-serif;">Dashboard Overview</h1>
                    <p class="text-secondary" style="font-size: 0.85rem;">Welcome back, <span class="font-bold text-primary">${this.currentUser.name}</span>. Here is what's happening today.</p>
                </header>

                <div class="live-notices" style="background: #eff6ff; border: 1px solid #bfdbfe; border-radius: 10px; margin-bottom: 1rem; overflow: hidden; display: flex; align-items: center;">
                    <div style="background: #2563eb; color: white; padding: 0.5rem 1rem; font-weight: 800; font-size: 0.65rem; letter-spacing: 0.1em; text-transform: uppercase; z-index: 1;">LIVE NOTICES</div>
                    <div style="flex: 1; overflow: hidden; position: relative;">
                        <marquee behavior="scroll" direction="left" scrollamount="6" style="padding: 0.5rem 0; color: #1e3a8a; font-weight: 500; font-size: 0.85rem;">
                            ${noticeHTML}
                        </marquee>
                    </div>
                </div>

                <div class="stats-grid mb-1">
                    <div class="stat-card-premium" style="border-radius: 16px; padding: 1.25rem;">
                        <span class="stat-label" style="font-weight: 800; letter-spacing: 0.05em; color: #64748b; font-size: 0.7rem;">ACTIVE STUDENTS</span>
                        <div class="stat-body" style="margin-top: 0.5rem; display: flex; align-items: baseline; gap: 0.75rem;">
                            <span class="stat-number" style="font-size: 1.75rem; font-weight: 800; font-family: 'Outfit', sans-serif;">${studentCount}</span>
                            <span class="stat-trend trend-up" style="background: #ecfdf5; color: #10b981; padding: 2px 8px; border-radius: 99px; font-size: 0.7rem; font-weight: 700;">+12%</span>
                        </div>
                        <div class="stat-icon-bg" style="position: absolute; right: 1.25rem; top: 1.25rem; width: 44px; height: 44px; background: #eff6ff; border-radius: 12px; display: flex; align-items: center; justify-content: center; color: #2563eb;">
                            <i data-lucide="users" style="width: 20px; height: 20px;"></i>
                        </div>
                    </div>

                    <div class="stat-card-premium" style="border-radius: 16px; padding: 1.25rem;">
                        <span class="stat-label" style="font-weight: 800; letter-spacing: 0.05em; color: #64748b; font-size: 0.7rem;">FACULTY STAFF</span>
                        <div class="stat-body" style="margin-top: 0.5rem; display: flex; align-items: baseline; gap: 0.75rem;">
                            <span class="stat-number" style="font-size: 1.75rem; font-weight: 800; font-family: 'Outfit', sans-serif;">${teacherCount}</span>
                            <span class="stat-trend" style="background: #f8fafc; color: #64748b; padding: 2px 8px; border-radius: 99px; font-size: 0.7rem; font-weight: 700;">Stable</span>
                        </div>
                        <div class="stat-icon-bg" style="position: absolute; right: 1.25rem; top: 1.25rem; width: 44px; height: 44px; background: #f0fdf4; border-radius: 12px; display: flex; align-items: center; justify-content: center; color: #16a34a;">
                            <i data-lucide="user-check" style="width: 20px; height: 20px;"></i>
                        </div>
                    </div>

                    <div class="stat-card-premium" style="border-radius: 16px; padding: 1.25rem;">
                        <span class="stat-label" style="font-weight: 800; letter-spacing: 0.05em; color: #64748b; font-size: 0.7rem;">TOTAL STREAMS</span>
                        <div class="stat-body" style="margin-top: 0.5rem; display: flex; align-items: baseline; gap: 0.75rem;">
                            <span class="stat-number" style="font-size: 1.75rem; font-weight: 800; font-family: 'Outfit', sans-serif;">${classCount}</span>
                            <span class="stat-trend trend-up" style="background: #fff7ed; color: #ea580c; padding: 2px 8px; border-radius: 99px; font-size: 0.7rem; font-weight: 700;">+2</span>
                        </div>
                        <div class="stat-icon-bg" style="position: absolute; right: 1.25rem; top: 1.25rem; width: 44px; height: 44px; background: #fff7ed; border-radius: 12px; display: flex; align-items: center; justify-content: center; color: #f97316;">
                            <i data-lucide="layers" style="width: 20px; height: 20px;"></i>
                        </div>
                    </div>

                    <div class="stat-card-premium" style="border-radius: 16px; padding: 1.25rem;">
                        <span class="stat-label" style="font-weight: 800; letter-spacing: 0.05em; color: #64748b; font-size: 0.7rem;">OFFERED COURSES</span>
                        <div class="stat-body" style="margin-top: 0.5rem; display: flex; align-items: baseline; gap: 0.75rem;">
                            <span class="stat-number" style="font-size: 1.75rem; font-weight: 800; font-family: 'Outfit', sans-serif;">${subjectCount}</span>
                            <span class="stat-trend" style="background: #f5f3ff; color: #7c3aed; padding: 2px 8px; border-radius: 99px; font-size: 0.7rem; font-weight: 700;">Active</span>
                        </div>
                        <div class="stat-icon-bg" style="position: absolute; right: 1.25rem; top: 1.25rem; width: 44px; height: 44px; background: #f5f3ff; border-radius: 12px; display: flex; align-items: center; justify-content: center; color: #8b5cf6;">
                            <i data-lucide="book-open" style="width: 20px; height: 20px;"></i>
                        </div>
                    </div>
                </div>

                <div class="dashboard-main-grid">
                    <div class="dash-card" style="background: white; border-radius: 32px; border: 1px solid #e2e8f0; padding: 2rem;">
                        <div class="card-header-fancy mb-3" style="display: flex; align-items: center; gap: 1.5rem;">
                            <div class="header-icon" style="width: 48px; height: 48px; background: #f8fafc; border-radius: 14px; display: flex; align-items: center; justify-content: center; color: #64748b;">
                                <i data-lucide="bar-chart-3"></i>
                            </div>
                            <div class="header-text">
                                <h3 class="text-xl font-bold">Attendance Velocity</h3>
                                <p class="text-secondary">Weekly performance vs current daily turnout</p>
                            </div>
                        </div>
                        <div style="height: 300px; background: #f8fafc; border-radius: 24px; display: flex; align-items: center; justify-content: center; border: 2px dashed #e2e8f0;">
                            <div class="text-center">
                                <i data-lucide="pie-chart" style="width: 48px; height: 48px; color: #cbd5e1; margin-bottom: 1rem;"></i>
                                <p class="text-slate-400 font-medium">Attendance Analytics Visualization</p>
                            </div>
                        </div>
                    </div>

                    <div class="dash-card" style="background: #1e293b; color: white; border-radius: 32px; padding: 2rem; display: flex; flex-direction: column; justify-content: space-between;">
                        <div>
                            <h3 class="text-xl font-bold mb-1">Administrative Quick Links</h3>
                            <p style="color: rgba(255,255,255,0.6); margin-bottom: 2rem;">Common administrative tasks and utilities.</p>
                            
                            <div style="display: flex; flex-direction: column; gap: 1rem;">
                                <button class="admin-link-btn" style="background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.1); color: white; padding: 1.25rem;">
                                    <i data-lucide="file-spreadsheet"></i> Generate Report Cards
                                </button>
                                <button class="admin-link-btn" style="background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.1); color: white; padding: 1.25rem;">
                                    <i data-lucide="shield-alert"></i> Security Audit Log
                                </button>
                                <button class="admin-link-btn" style="background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.1); color: white; padding: 1.25rem;">
                                    <i data-lucide="settings-2"></i> System Configuration
                                </button>
                            </div>
                        </div>
                        
                        <div style="background: rgba(255,255,255,0.05); padding: 1.5rem; border-radius: 24px; margin-top: 2rem;">
                            <span style="font-size: 0.75rem; color: rgba(255,255,255,0.5); font-weight: 700; text-transform: uppercase;">Cloud Sync Status</span>
                            <div style="display: flex; align-items: center; gap: 0.75rem; margin-top: 0.75rem;">
                                <span style="width: 12px; height: 12px; background: #10b981; border-radius: 50%; box-shadow: 0 0 12px #10b981;"></span>
                                <span style="font-weight: 600;">Systems Operational</span>
                            </div>
                    </div>
                </div>
            </div>
        `;
    },

    async renderTeacherDashboard() {
        // Filter to only active students
        const studentCount = await db.students.filter(s => s.is_active !== false).count();
        const attendance = await db.attendance.toArray();
        const today = new Date().toISOString().split('T')[0];
        const todayAtt = attendance.filter(a => a.date === today);
        const presentToday = todayAtt.filter(a => a.status === 'Present').length;
        const attendancePct = todayAtt.length > 0 ? Math.round((presentToday / todayAtt.length) * 100) : 0;

        this.contentArea.innerHTML = `
            <div class="view-container animate-fade-in-up">
                <header class="view-header" style="margin-bottom: 2rem;">
                    <h1 class="text-3xl font-extrabold" style="font-family: 'Outfit', sans-serif;">Teacher Analytics</h1>
                    <p class="text-secondary">Welcome back, <span class="font-bold text-primary">${this.currentUser.name}</span>. Here is your academic overview.</p>
                </header>

                <div class="teacher-stats-grid mb-2">
                    <div class="stat-mini-card">
                        <span class="stat-label">Assigned Students</span>
                        <span class="stat-value">${studentCount}</span>
                    </div>
                    <div class="stat-mini-card">
                        <span class="stat-label">Today's Attendance</span>
                        <span class="stat-value" style="color: ${attendancePct > 90 ? 'var(--accent-success)' : 'var(--accent-warning)'}">${attendancePct}%</span>
                    </div>
                    <div class="stat-mini-card">
                        <span class="stat-label">Active Courses</span>
                        <span class="stat-value">6</span>
                    </div>
                    <div class="stat-mini-card">
                        <span class="stat-label">Pending Grades</span>
                        <span class="stat-value" style="color: var(--accent-danger);">12</span>
                    </div>
                </div>

                <div class="dashboard-main-grid">
                    <div class="card">
                        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1.5rem;">
                            <h3 style="margin: 0;"><i data-lucide="calendar"></i> Today's Schedule</h3>
                            <span class="badge" style="background: #f1f5f9; color: #475569;">Tuesday, 28th April</span>
                        </div>
                        <div class="timetable-card">
                            <div class="timetable-item">
                                <div class="time-slot">08:30 AM</div>
                                <div style="flex: 1;">
                                    <div style="font-weight: 700;">Mathematics</div>
                                    <div style="font-size: 0.8rem; color: var(--text-muted);">JSS 3A | Room 102</div>
                                </div>
                                <span class="badge success">Active</span>
                            </div>
                            <div class="timetable-item">
                                <div class="time-slot">10:45 AM</div>
                                <div style="flex: 1;">
                                    <div style="font-weight: 700;">Further Maths</div>
                                    <div style="font-size: 0.8rem; color: var(--text-muted);">SSS 2 Science | Lab 4</div>
                                </div>
                            </div>
                            <div class="timetable-item" style="border: none;">
                                <div class="time-slot">01:15 PM</div>
                                <div style="flex: 1;">
                                    <div style="font-weight: 700;">Data Processing</div>
                                    <div style="font-size: 0.8rem; color: var(--text-muted);">SSS 1 Commercial | IT Suite</div>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div class="card">
                        <h3 class="mb-1"><i data-lucide="zap"></i> Quick Actions</h3>
                        <div class="action-grid mt-1">
                            <button class="action-btn" onclick="UI.renderView('attendance')" style="background: #eff6ff; border: 1px solid #bfdbfe; color: #1e40af; border-radius: 16px;">
                                <div class="icon-wrapper" style="background: white; padding: 1rem; border-radius: 12px; margin-bottom: 0.5rem;"><i data-lucide="check-square"></i></div>
                                <span style="font-weight: 700;">Attendance</span>
                            </button>
                            <button class="action-btn" onclick="UI.renderView('gradebook')" style="background: #f0fdf4; border: 1px solid #bbf7d0; color: #15803d; border-radius: 16px;">
                                <div class="icon-wrapper" style="background: white; padding: 1rem; border-radius: 12px; margin-bottom: 0.5rem;"><i data-lucide="award"></i></div>
                                <span style="font-weight: 700;">Grading</span>
                            </button>
                            <button class="action-btn" onclick="UI.renderView('reports')" style="background: #fdf2f8; border: 1px solid #fbcfe8; color: #9d174d; border-radius: 16px;">
                                <div class="icon-wrapper" style="background: white; padding: 1rem; border-radius: 12px; margin-bottom: 0.5rem;"><i data-lucide="file-text"></i></div>
                                <span style="font-weight: 700;">Reports</span>
                            </button>
                        </div>
                        
                        <div style="margin-top: 2rem; padding: 1.5rem; background: #fafafa; border-radius: 16px; border: 1px solid #f1f5f9;">
                            <h4 style="font-size: 0.9rem; margin-bottom: 0.75rem;">Performance Trend</h4>
                            <div style="height: 100px; display: flex; align-items: flex-end; gap: 4px;">
                                ${[40, 65, 55, 85, 75, 90, 80].map(h => `<div style="flex: 1; height: ${h}%; background: var(--accent-primary); border-radius: 4px 4px 0 0; opacity: 0.6;"></div>`).join('')}
                            </div>
                            <div style="display: flex; justify-content: space-between; margin-top: 0.5rem; font-size: 0.7rem; color: var(--text-muted); font-weight: 700;">
                                <span>MON</span><span>TUE</span><span>WED</span><span>THU</span><span>FRI</span><span>SAT</span><span>SUN</span>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `;
        if (typeof lucide !== 'undefined') lucide.createIcons();
    },

    async renderStudentDashboard() {
        const studentId = this.currentUser.assigned_id || '';
        const student = await db.students.get(studentId);
        const results = await db.cbt_results.where('student_id').equals(studentId).toArray();
        const attendance = await db.attendance.where('student_id').equals(studentId).toArray();
        
        // Find live exams
        const now = new Date();
        const allExams = await db.cbt_exams.toArray();
        const liveExams = allExams.filter(exam => {
            if (exam.status !== 'Active') return false;
            if (exam.class_name !== student?.class_name) return false;
            
            const start = exam.start_time ? new Date(exam.start_time) : null;
            const end = exam.end_time ? new Date(exam.end_time) : null;
            
            if (start && now < start) return false;
            if (end && now > end) return false;
            
            // Check if already taken
            const alreadyTaken = results.some(r => r.exam_id === exam.id);
            return !alreadyTaken;
        });

        this.contentArea.innerHTML = `
            <div class="view-container animate-fade-in-up">
                <header class="view-header" style="margin-bottom: 2rem; display: flex; justify-content: space-between; align-items: flex-end;">
                    <div>
                        <h1 class="text-3xl font-extrabold tracking-tight" style="color: #1e293b;">Student Universe</h1>
                        <p class="text-secondary">Track your progress, take exams, and monitor your academic growth.</p>
                    </div>
                    <div style="text-align: right;">
                        <span class="badge" style="background: #f1f5f9; color: #4338ca; font-weight: 800; font-size: 0.8rem; padding: 0.6rem 1.2rem; border-radius: 12px;">
                            ${student?.class_name || 'Unassigned'}
                        </span>
                    </div>
                </header>

                <div style="display: grid; grid-template-columns: 1fr 2fr; gap: 2rem;">
                    <!-- Left: Profile & Stats -->
                    <div style="display: flex; flex-direction: column; gap: 2rem;">
                        <div class="card" style="padding: 2rem; text-align: center; border-radius: 24px; border: 1px solid #f1f5f9; box-shadow: 0 10px 15px -3px rgba(0,0,0,0.05);">
                            <div style="width: 100px; height: 100px; border-radius: 50%; border: 4px solid #eef2ff; overflow: hidden; margin: 0 auto 1.5rem; background: #f8fafc; display: flex; align-items: center; justify-content: center;">
                                ${student?.passport_url ? `<img src="${student.passport_url}" style="width:100%; height:100%; object-fit:cover;">` : `<i data-lucide="user" style="width:48px; height:48px; color:#cbd5e1;"></i>`}
                            </div>
                            <h3 style="font-weight: 800; color: #1e293b; margin-bottom: 0.25rem;">${student?.name || this.currentUser.name}</h3>
                            <p style="color: #64748b; font-size: 0.85rem; font-weight: 600; margin-bottom: 1.5rem;">ID: ${studentId}</p>
                            
                            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; border-top: 1px solid #f1f5f9; padding-top: 1.5rem;">
                                <div>
                                    <div style="font-size: 1.25rem; font-weight: 800; color: #4338ca;">${attendance.filter(a => a.status === 'Present').length}</div>
                                    <div style="font-size: 0.65rem; font-weight: 700; color: #94a3b8; text-transform: uppercase;">Days Present</div>
                                </div>
                                <div>
                                    <div style="font-size: 1.25rem; font-weight: 800; color: #10b981;">${results.length}</div>
                                    <div style="font-size: 0.65rem; font-weight: 700; color: #94a3b8; text-transform: uppercase;">Exams Done</div>
                                </div>
                            </div>
                        </div>

                        <div class="card" style="border-radius: 24px; padding: 1.5rem;">
                            <h4 style="font-weight: 800; color: #1e293b; font-size: 0.9rem; margin-bottom: 1.5rem; display: flex; align-items: center; gap: 0.5rem;">
                                <i data-lucide="zap" style="width: 18px; color: #f59e0b;"></i> Quick Hub
                            </h4>
                            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 1rem;">
                                <button class="action-btn" onclick="UI.renderView('cbt')" style="background: #eef2ff; color: #4338ca; border: none; border-radius: 16px; padding: 1.5rem 1rem;">
                                    <i data-lucide="monitor" style="margin-bottom: 0.5rem;"></i>
                                    <span style="font-size: 0.8rem; font-weight: 700;">Take Exam</span>
                                </button>
                                <button class="action-btn" onclick="UI.renderView('gradebook')" style="background: #f0fdf4; color: #16a34a; border: none; border-radius: 16px; padding: 1.5rem 1rem;">
                                    <i data-lucide="file-text" style="margin-bottom: 0.5rem;"></i>
                                    <span style="font-size: 0.8rem; font-weight: 700;">Results</span>
                                </button>
                            </div>
                        </div>
                    </div>

                    <!-- Right: Live Exams & Growth -->
                    <div style="display: flex; flex-direction: column; gap: 2rem;">
                        <div class="card" style="border-radius: 24px; padding: 2rem; border: 1px solid #f1f5f9; background: #fff;">
                            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 2rem;">
                                <h3 style="font-weight: 800; color: #1e293b; display: flex; align-items: center; gap: 0.75rem;">
                                    <div style="width: 40px; height: 40px; background: #fff1f2; color: #e11d48; border-radius: 12px; display: flex; align-items: center; justify-content: center;">
                                        <i data-lucide="clock"></i>
                                    </div>
                                    Live CBT Assignments
                                </h3>
                                <span class="badge" style="background: #fee2e2; color: #e11d48;">${liveExams.length} OPEN</span>
                            </div>

                            ${liveExams.length === 0 ? `
                                <div style="text-align: center; padding: 3rem 1rem;">
                                    <i data-lucide="check-circle-2" style="width: 48px; height: 48px; color: #10b981; margin-bottom: 1rem; opacity: 0.2;"></i>
                                    <p style="color: #64748b; font-weight: 600;">You are all caught up! No active exams at the moment.</p>
                                </div>
                            ` : `
                                <div style="display: grid; gap: 1rem;">
                                    ${liveExams.map(exam => `
                                        <div style="display: flex; justify-content: space-between; align-items: center; padding: 1.5rem; background: #f8fafc; border-radius: 16px; border: 1px solid #f1f5f9;">
                                            <div style="display: flex; align-items: center; gap: 1.5rem;">
                                                <div style="background: white; width: 52px; height: 52px; border-radius: 12px; display: flex; align-items: center; justify-content: center; font-weight: 900; color: #4338ca; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.05);">
                                                    ${exam.duration}m
                                                </div>
                                                <div>
                                                    <h4 style="font-weight: 800; color: #1e293b; margin: 0;">${exam.title}</h4>
                                                    <p style="font-size: 0.75rem; color: #64748b; font-weight: 600;">Mode: ${exam.mode}</p>
                                                </div>
                                            </div>
                                            <button class="btn btn-primary" onclick="UI.startCBTExam('${exam.id}')" style="border-radius: 10px; height: 44px; padding: 0 1.5rem; background: #4338ca;">
                                                Start <i data-lucide="play" style="width: 16px; margin-left: 0.25rem;"></i>
                                            </button>
                                        </div>
                                    `).join('')}
                                </div>
                            `}
                        </div>

                        <div class="card" style="border-radius: 24px; padding: 2rem; border: 1px solid #f1f5f9;">
                            <h3 style="font-weight: 800; color: #1e293b; margin-bottom: 2rem; display: flex; align-items: center; gap: 0.75rem;">
                                <i data-lucide="bar-chart-2" style="color: #10b981;"></i> Performance Velocity
                            </h3>
                            <div style="height: 150px; display: flex; align-items: flex-end; gap: 10px; padding: 0 1rem;">
                                ${[60, 45, 80, 55, 95, 70, 85].map(h => `
                                    <div style="flex: 1; height: ${h}%; background: linear-gradient(to top, #4338ca, #6366f1); border-radius: 6px 6px 0 0; opacity: ${h/100}; position: relative;" class="hover-grow">
                                        <div style="position: absolute; top: -20px; left: 50%; transform: translateX(-50%); font-size: 0.6rem; font-weight: 800; color: #64748b;">${h}%</div>
                                    </div>
                                `).join('')}
                            </div>
                            <div style="display: flex; justify-content: space-between; margin-top: 1rem; font-size: 0.65rem; font-weight: 800; color: #94a3b8; text-transform: uppercase; padding: 0 1rem;">
                                <span>Mon</span><span>Tue</span><span>Wed</span><span>Thu</span><span>Fri</span><span>Sat</span><span>Sun</span>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `;

        if (typeof lucide !== 'undefined') lucide.createIcons();
    },

    async renderParentDashboard() {
        this.contentArea.innerHTML = `
            <div class="dashboard-grid">
                <div class="grid mb-2">
                    <div class="card stat-card primary-gradient" style="grid-column: span 4;">
                        <div class="stat-icon"><i data-lucide="graduation-cap"></i></div>
                        <div class="stat-info">
                            <h3>Student Portal</h3>
                            <p class="stat-value" style="font-size: 1.4rem;">Viewing records for ${this.currentUser.name}</p>
                        </div>
                    </div>
                </div>

                <div class="grid main-dashboard-row">
                    <div class="card quick-actions">
                        <h3><i data-lucide="file-text"></i> Academic Records</h3>
                        <div class="action-grid mt-2">
                            <button class="action-btn" onclick="document.querySelector('.nav-item[data-view=\\'attendance\\']').click()">
                                <div class="icon-wrapper bg-warning-light"><i data-lucide="calendar" class="text-warning"></i></div>
                                <span>View Attendance</span>
                            </button>
                            <button class="action-btn" onclick="document.querySelector('.nav-item[data-view=\\'gradebook\\']').click()">
                                <div class="icon-wrapper bg-success-light"><i data-lucide="bar-chart-2" class="text-success"></i></div>
                                <span>View Grades</span>
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        `;
    },

    /**
     * Bulk Data Import View
     */



    async renderClasses() {
        const isTeacher = (this.currentUser.role || '').toLowerCase() === 'teacher';
        const teacherId = this.currentUser.id;
        
        let streams = await db.classes.toArray();
        const studentCounts = await db.students.toArray();
        const formTeachers = await db.form_teachers.toArray().catch(() => []);
        const profiles = await db.profiles.toArray().catch(() => []);

        if (isTeacher) {
            const assignments = await db.subject_assignments.where('teacher_id').equals(teacherId).toArray();
            const assignedClasses = new Set(assignments.map(a => a.class_name));
            // Also include classes where they are form teachers
            formTeachers.filter(f => f.teacher_id === teacherId).forEach(f => assignedClasses.add(f.class_name));
            streams = streams.filter(s => assignedClasses.has(s.name));
        }
        
        const getEnrollment = (className) => studentCounts.filter(s => s.class_name === className).length;
        
        const getFormMasterName = (className) => {
            const ft = formTeachers.find(f => f.class_name === className);
            if (!ft) return 'Unassigned';
            const profile = profiles.find(p => p.id === ft.teacher_id || p.full_name === ft.teacher_id);
            return profile ? profile.full_name : ft.teacher_id;
        };

        this.contentArea.innerHTML = `
            <div class="view-container">
                <div class="page-banner">
                    <div class="banner-content">
                        <h1 class="banner-title"><i data-lucide="layers"></i> School Manager</h1>
                        <p class="banner-subtitle">Configure streams, monitor enrollment, and manage classroom assignments for the current session.</p>
                    </div>
                    <div class="banner-stats">
                        <div class="banner-stat-item">
                            <span class="stat-value">${streams.length}</span>
                            <span class="stat-label">Active Streams</span>
                        </div>
                        <div class="banner-stat-item">
                            <span class="stat-value">${studentCounts.length}</span>
                            <span class="stat-label">Total Enrollment</span>
                        </div>
                    </div>
                    ${!isTeacher ? `
                    <button id="btn-add-stream" class="btn" style="background: white; color: #2563eb; font-weight: 700; border-radius: 16px; padding: 1rem 2rem; display: flex; align-items: center; gap: 0.75rem; box-shadow: 0 10px 15px -3px rgba(0,0,0,0.1);">
                        <i data-lucide="plus-circle"></i> Add New Stream
                    </button>
                    ` : ''}
                </div>

                <div class="actions-bar" style="background: white; padding: 1.25rem; border-radius: 20px; border: 1px solid #e2e8f0;">
                    <div style="position: relative; flex: 1; max-width: 500px;">
                        <i data-lucide="search" style="position: absolute; left: 1.25rem; top: 50%; transform: translateY(-50%); color: #94a3b8; width: 20px;"></i>
                        <input type="text" placeholder="Search for a specific stream or level..." class="input" style="padding-left: 3.5rem; border-radius: 14px; border: 1px solid #f1f5f9; background: #f8fafc; height: 52px;">
                    </div>
                    <div style="display: flex; gap: 1rem;">
                        <button class="btn btn-secondary" style="border-radius: 12px; height: 52px; padding: 0 1.5rem;"><i data-lucide="filter"></i> Filter</button>
                        <button class="btn btn-secondary" style="border-radius: 12px; height: 52px; padding: 0 1.5rem;"><i data-lucide="download"></i> Export</button>
                    </div>
                </div>

                <div class="stream-grid">
                    ${streams.map((s, index) => `
                        <div class="stream-card">
                            <div class="stream-card-header">
                                <div class="stream-card-title"><i data-lucide="graduation-cap"></i> ${s.name}</div>
                                <span class="stream-id-badge" style="background: #f1f5f9; color: #64748b; font-weight: 700; padding: 4px 10px; border-radius: 8px;">STRM ${index + 1}</span>
                            </div>
                            <div class="stream-card-body" style="padding: 2rem;">
                                <div class="enrollment-stat" style="margin-bottom: 1.5rem;">
                                    <div class="enroll-icon" style="width: 64px; height: 64px; background: #eff6ff; color: #2563eb; border-radius: 18px;">
                                        <i data-lucide="users" style="width: 32px; height: 32px;"></i>
                                    </div>
                                    <div class="enroll-info" style="flex: 1;">
                                        <div style="display: flex; justify-content: space-between; align-items: baseline;">
                                            <span class="count" style="font-size: 2rem;">${getEnrollment(s.name)}</span>
                                            <span style="color: #94a3b8; font-weight: 600; font-size: 0.8rem;">/ 40 Capacity</span>
                                        </div>
                                        <div style="width: 100%; background: #f1f5f9; height: 6px; border-radius: 3px; margin-top: 0.5rem; overflow: hidden;">
                                            <div style="height: 100%; width: ${Math.min(100, (getEnrollment(s.name)/40)*100)}%; background: ${(getEnrollment(s.name) >= 40) ? '#ef4444' : '#2563eb'}; border-radius: 3px;"></div>
                                        </div>
                                    </div>
                                </div>
                                <div class="stream-meta" style="margin-bottom: 1rem; display: flex; flex-direction: column; gap: 0.75rem;">
                                    <div style="display: flex; justify-content: space-between; align-items: center;">
                                        <span class="level-tag" style="background: #ecfdf5; color: #059669; padding: 6px 12px; border-radius: 10px; font-weight: 600; font-size: 0.8rem;">
                                            <i data-lucide="shield-check" style="width: 14px;"></i> ${s.level} Level
                                        </span>
                                        <span class="status-tag" style="display: flex; align-items: center; gap: 0.5rem; color: #10b981; font-weight: 700; font-size: 0.8rem;">
                                            <span style="width: 8px; height: 8px; background: #10b981; border-radius: 50%;"></span> ONLINE
                                        </span>
                                    </div>
                                    <div style="display: flex; align-items: center; gap: 0.5rem; font-size: 0.85rem; color: #475569; background: #f8fafc; padding: 0.75rem; border-radius: 12px; border: 1px solid #f1f5f9;">
                                        <i data-lucide="user" style="width: 16px; color: #94a3b8;"></i> 
                                        <span style="font-weight: 600; color: #94a3b8;">Form Master:</span> 
                                        <span style="font-weight: 700;">${getFormMasterName(s.name)}</span>
                                    </div>
                                </div>
                                 ${!isTeacher ? `
                                 <div style="display: flex; gap: 1rem;">
                                     <button class="btn btn-secondary w-full rename-class-btn" data-id="${s.id}" data-name="${s.name}" style="height: 48px; border-radius: 12px; font-weight: 600; background: #f8fafc;"><i data-lucide="edit-3"></i> Rename</button>
                                     <button class="btn btn-secondary delete-class-btn" data-id="${s.id}" data-name="${s.name}" data-count="${getEnrollment(s.name)}" style="height: 48px; border-radius: 12px; color: #ef4444; background: #fef2f2; border: none;"><i data-lucide="trash-2"></i></button>
                                 </div>
                                 ` : ''}
                            </div>
                        </div>
                    `).join('')}
                </div>
            </div>
        `;

        // Safety Guard: Prevent Deletion
        document.querySelectorAll('.delete-class-btn').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                const count = parseInt(btn.dataset.count);
                const className = btn.dataset.name;
                const id = btn.dataset.id;
                
                if (count > 0) {
                    Notifications.show(`Cannot delete "${className}". It currently has ${count} active students. Please reassign them first.`, 'error');
                } else {
                    if (confirm(`Are you sure you want to delete the empty stream "${className}"?`)) {
                        await db.classes.delete(id);
                        Notifications.show(`Stream "${className}" deleted successfully.`, 'success');
                        this.renderClasses();
                    }
                }
            });
        });

        // Rename Class Logic
        document.querySelectorAll('.rename-class-btn').forEach(btn => {
            btn.addEventListener('click', async () => {
                const oldName = btn.dataset.name;
                const id = btn.dataset.id;
                const newName = prompt(`Rename stream "${oldName}" to:`, oldName);
                if (newName && newName !== oldName) {
                    await db.classes.update(id, { name: newName });
                    // Update all students in this class too? Yes, to maintain consistency.
                    const students = await db.students.where('class_name').equals(oldName).toArray();
                    for (const std of students) {
                        await db.students.update(std.student_id, { class_name: newName });
                    }
                    Notifications.show(`Stream renamed to "${newName}". ${students.length} students updated.`, 'success');
                    this.renderClasses();
                }
            });
        });

        // Add Stream Modal
        const btnAddStream = document.getElementById('btn-add-stream');
        if (btnAddStream) {
            btnAddStream.addEventListener('click', () => {
                const modalHtml = `
                    <div style="margin-bottom: 1rem;">
                        <label>Stream Designation</label>
                        <div style="position: relative;">
                            <i data-lucide="layout" style="position: absolute; left: 1rem; top: 50%; transform: translateY(-50%); color: #64748b; width: 16px;"></i>
                            <input type="text" id="stream-name-input" class="input" placeholder="e.g. SSS 2 Science" style="padding-left: 2.5rem; width: 100%; box-sizing: border-box; background: white; color: #1e293b; border: 1px solid #cbd5e1;">
                        </div>
                    </div>
                `;
                this.showModal('New Stream Entry', modalHtml, async () => {
                    const nameInput = document.getElementById('stream-name-input').value.trim();
                    if (!nameInput) {
                        Notifications.show('Stream designation is required', 'error');
                        throw new Error('Validation failed');
                    }
                    
                    const existing = await db.classes.where('name').equalsIgnoreCase(nameInput).first();
                    if (existing) {
                        Notifications.show('A stream with this designation already exists', 'warning');
                        throw new Error('Duplicate');
                    }
                    
                    // Determine level
                    let level = 'Junior';
                    if (nameInput.toLowerCase().includes('ss') || nameInput.toLowerCase().includes('senior')) level = 'Senior';
                    if (nameInput.toLowerCase().includes('primary')) level = 'Primary';
                    
                    await db.classes.add({
                        id: `C${Math.random().toString(36).substr(2, 6).toUpperCase()}`,
                        name: nameInput,
                        level: level,
                        is_synced: 0,
                        updated_at: new Date().toISOString()
                    });
                    
                    Notifications.show(`Stream "${nameInput}" registered successfully.`, 'success');
                    this.renderClasses();
                }, 'Register', 'save');
            });
        }

        if (typeof lucide !== 'undefined') lucide.createIcons();
    },

    async renderSubjects() {
        const isTeacher = (this.currentUser.role || '').toLowerCase() === 'teacher';
        const teacherId = this.currentUser.id;
        
        let subjects = await db.subjects.toArray();
        const assignments = await db.subject_assignments.toArray().catch(() => []);
        const profiles = await db.profiles.toArray().catch(() => []);

        if (isTeacher) {
            const teacherAssignments = assignments.filter(a => a.teacher_id === teacherId);
            const assignedSubIds = new Set(teacherAssignments.map(a => a.subject_id));
            subjects = subjects.filter(s => assignedSubIds.has(s.id));
        }
        
        const getSubjectDetails = (subjectIds, defaultClasses) => {
            const subjectAssignments = assignments.filter(a => subjectIds.includes(a.subject_id));
            
            // Faculty
            const teacherIds = [...new Set(subjectAssignments.map(a => a.teacher_id))];
            const teacherNames = teacherIds.map(tid => {
                const profile = profiles.find(p => p.id === tid || p.full_name === tid);
                return profile ? profile.full_name : tid;
            });
            const facultyString = teacherNames.length > 0 ? teacherNames.join(', ') : 'Not Assigned';
            const facultyColor = teacherNames.length > 0 ? '#10b981' : '#cbd5e1';
            
            // Classes (Streams)
            const classNames = [...new Set([...defaultClasses, ...subjectAssignments.map(a => a.class_name)])].filter(c => c && c !== 'All');
            let linkedString = `<span class="badge warning" style="background: #fef2f2; color: #ef4444; border: 1px solid #fee2e2; border-radius: 20px; font-size: 0.75rem; padding: 0.4rem 1rem; font-weight: 600;">Unlinked</span>`;
            
            if (defaultClasses.includes('All')) {
                 linkedString = `<span class="badge" style="background: #f0fdf4; color: #16a34a; border: 1px solid #bbf7d0; border-radius: 20px; font-size: 0.75rem; padding: 0.4rem 1rem; font-weight: 600;">Global (All)</span>`;
            } else if (classNames.length > 0) {
                 linkedString = `<div style="display: flex; flex-wrap: wrap; gap: 0.4rem;">${classNames.map(c => `<span class="badge" style="background: #eff6ff; color: #2563eb; border: 1px solid #bfdbfe; border-radius: 12px; font-size: 0.7rem; padding: 0.2rem 0.6rem; font-weight: 700;">${c}</span>`).join('')}</div>`;
            }

            return { facultyString, facultyColor, linkedString };
        };

        // Group subjects by name for unified management
        const consolidated = [];
        subjects.forEach(s => {
            const existing = consolidated.find(us => us.name === s.name);
            if (existing) {
                if (!existing.classes.includes(s.class_name)) existing.classes.push(s.class_name);
                existing.ids.push(s.id);
            } else {
                consolidated.push({
                    name: s.name,
                    classes: [s.class_name],
                    ids: [s.id],
                    credits: s.credits,
                    type: s.type
                });
            }
        });

        this.contentArea.innerHTML = `
            <div class="view-container">
                <div class="page-banner" style="background: linear-gradient(135deg, #1e293b 0%, #334155 100%);">
                    <div class="banner-content">
                        <h1 class="banner-title"><i data-lucide="book-open"></i> Subject Registry</h1>
                        <p class="banner-subtitle">Manage courses, credit units, and instructional assignments across all school levels.</p>
                    </div>
                    <div class="banner-stats">
                        <div class="banner-stat-item">
                            <span class="stat-value">${consolidated.length}</span>
                            <span class="stat-label">Unique Courses</span>
                        </div>
                    </div>
                    ${!isTeacher ? `
                    <div style="display: flex; gap: 0.75rem;">
                        <button id="btn-register-course" class="btn btn-primary" style="background: white; color: #0f172a; border: none; border-radius: 10px; padding: 0.6rem 1.25rem; font-weight: 700; font-size: 0.85rem;">
                            <i data-lucide="plus-circle" style="width: 16px;"></i> Register Course
                        </button>
                    </div>
                    ` : ''}
                </div>

                <div class="card" style="border-radius: 12px; padding: 1rem;">
                    <div class="actions-bar mb-1" style="display: flex; gap: 1rem; flex-wrap: wrap;">
                        <div style="position: relative; flex: 1;">
                            <i data-lucide="search" style="position: absolute; left: 0.75rem; top: 50%; transform: translateY(-50%); color: #94a3b8; width: 14px;"></i>
                            <input type="text" placeholder="Search courses..." class="input" style="padding-left: 2.25rem; border-radius: 10px; height: 40px;">
                        </div>
                    </div>

                    <div class="table-container" style="max-height: calc(100vh - 350px); overflow-y: auto;">
                        <table class="data-table desktop-only">
                            <thead>
                                <tr>
                                    <th>COURSE TITLE</th>
                                    <th>STREAMS</th>
                                    <th>FACULTY</th>
                                    <th>UNITS</th>
                                    ${!isTeacher ? `<th style="text-align: right;">ACTIONS</th>` : ''}
                                </tr>
                            </thead>
                            <tbody>
                                ${consolidated.length === 0 ? `<tr><td colspan="5" class="text-center p-4">No courses registered yet.</td></tr>` : consolidated.map(s => {
                                    const details = getSubjectDetails(s.ids, s.classes);
                                    return `
                                    <tr>
                                        <td style="font-weight: 700;">${s.name}</td>
                                        <td>${details.linkedString}</td>
                                        <td style="font-size: 0.85rem; color: #64748b;">${details.facultyString}</td>
                                        <td style="font-weight: 800; color: #1e40af;">${s.credits || 1}</td>
                                        ${!isTeacher ? `
                                        <td style="text-align: right;">
                                            <div style="display: flex; gap: 0.5rem; justify-content: flex-end;">
                                                <button class="btn btn-secondary btn-sm modify-subject-btn" data-ids="${s.ids.join(',')}" data-name="${s.name}"><i data-lucide="edit-3" style="width: 14px;"></i></button>
                                                <button class="btn btn-secondary btn-sm delete-subject-btn" data-ids="${s.ids.join(',')}" data-name="${s.name}" style="color: #ef4444;"><i data-lucide="trash-2" style="width: 14px;"></i></button>
                                            </div>
                                        </td>
                                        ` : ''}
                                    </tr>
                                `;}).join('')}
                            </tbody>
                        </table>

                        <!-- Mobile Accordion List -->
                        <div class="mobile-only" style="display: flex; flex-direction: column; gap: 0.75rem;">
                            ${consolidated.map(s => {
                                const details = getSubjectDetails(s.ids, s.classes);
                                return `
                                <div class="subject-accordion-item" style="background: white; border: 1px solid #e2e8f0; border-radius: 12px; overflow: hidden;">
                                    <div class="accordion-trigger" style="padding: 1rem; display: flex; justify-content: space-between; align-items: center; cursor: pointer;">
                                        <div>
                                            <div style="font-weight: 700; color: #1e293b;">${s.name}</div>
                                            <div style="font-size: 0.75rem; color: #64748b;">Units: ${s.credits || 1} | ${s.type || 'Core'}</div>
                                        </div>
                                        <i data-lucide="chevron-down" style="width: 16px; opacity: 0.5;"></i>
                                    </div>
                                    <div class="accordion-content" style="max-height: 0; overflow: hidden; transition: max-height 0.3s ease-out; background: #f8fafc;">
                                        <div style="padding: 1rem; border-top: 1px solid #e2e8f0;">
                                            <div style="margin-bottom: 0.75rem;">
                                                <strong style="font-size: 0.7rem; color: #64748b;">ASSIGNED STREAMS</strong>
                                                <div style="margin-top: 0.25rem;">${details.linkedString}</div>
                                            </div>
                                            <div style="margin-bottom: 1rem;">
                                                <strong style="font-size: 0.7rem; color: #64748b;">FACULTY ASSIGNMENT</strong>
                                                <div style="margin-top: 0.25rem; font-weight: 600; color: #1e293b;">${details.facultyString}</div>
                                            </div>
                                            <div style="display: flex; gap: 0.5rem;">
                                                <button class="btn btn-secondary modify-subject-btn" data-ids="${s.ids.join(',')}" data-name="${s.name}" style="flex: 1; border-radius: 8px; font-size: 0.8rem; height: 40px;">
                                                    <i data-lucide="edit-3" style="width: 14px;"></i> Edit
                                                </button>
                                                <button class="btn btn-secondary delete-subject-btn" data-ids="${s.ids.join(',')}" data-name="${s.name}" style="flex: 1; color: #ef4444; background: #fef2f2; border: none; font-size: 0.8rem; height: 40px;">
                                                    <i data-lucide="trash-2" style="width: 14px;"></i> Remove
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            `;}).join('')}
                        </div>
                    </div>
                </div>
            </div>
        `;

        // Subject Accordion Trigger Logic
        this.contentArea.querySelectorAll('.accordion-trigger').forEach(trigger => {
            trigger.addEventListener('click', () => {
                const item = trigger.closest('.subject-accordion-item');
                const isExpanded = item.classList.contains('active');
                
                // Close others
                this.contentArea.querySelectorAll('.subject-accordion-item').forEach(i => i.classList.remove('active'));
                
                if (!isExpanded) item.classList.add('active');
            });
        });

        // Register Course Modal
        const btnRegCourse = document.getElementById('btn-register-course');
        if (btnRegCourse) {
            btnRegCourse.addEventListener('click', async () => {
                const allClasses = await db.classes.toArray();
                const classCheckboxes = allClasses.map(c => {
                    return `
                        <label style="display: flex; align-items: center; gap: 0.5rem; font-size: 0.85rem; color: #334155; cursor: pointer;">
                            <input type="checkbox" class="stream-checkbox" value="${c.name}" style="accent-color: #2563eb;"> ${c.name}
                        </label>
                    `;
                }).join('');

                const modalHtml = `
                    <div style="display: flex; flex-direction: column; gap: 1.25rem;">
                        <div>
                            <label style="color: #334155;">Course Title</label>
                            <div style="position: relative;">
                                <i data-lucide="bookmark" style="position: absolute; left: 0.75rem; top: 50%; transform: translateY(-50%); color: #94a3b8; width: 16px;"></i>
                                <input type="text" id="course-title" class="input" placeholder="e.g. Mathematics" style="width: 100%; box-sizing: border-box; padding-left: 2.25rem; background: white; color: #1e293b; border: 1px solid #cbd5e1;">
                            </div>
                        </div>
                        <div>
                            <label style="color: #334155;">Credit Load</label>
                            <input type="number" id="course-credits" class="input" value="3" min="1" max="10" style="width: 100%; box-sizing: border-box; background: white; color: #1e293b; border: 1px solid #cbd5e1;">
                        </div>
                        <div>
                            <label style="color: #334155;">Module Type</label>
                            <select id="course-type" class="input" style="width: 100%; box-sizing: border-box; background: white; color: #1e293b; border: 1px solid #cbd5e1;">
                                <option value="Core">Core</option>
                                <option value="Elective">Elective</option>
                            </select>
                        </div>
                        <div>
                            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.5rem;">
                                <label style="color: #334155; margin-bottom: 0;">Apply to Stream Architecture</label>
                                <span id="stream-count-label" style="font-size: 0.7rem; color: #94a3b8; font-weight: 700;">0 STREAMS SELECTED</span>
                            </div>
                            <div style="border: 1px solid #e2e8f0; border-radius: 12px; padding: 1rem; display: grid; grid-template-columns: repeat(3, 1fr); gap: 0.75rem; max-height: 160px; overflow-y: auto; background: white;">
                                ${classCheckboxes}
                            </div>
                            <div style="display: flex; gap: 0.5rem; margin-top: 0.75rem;">
                                <button type="button" id="enroll-global" style="background: #eff6ff; color: #2563eb; border: 1px solid #bfdbfe; border-radius: 8px; padding: 0.4rem 0.75rem; font-size: 0.75rem; font-weight: 600; cursor: pointer;">Enroll Global (All Classes)</button>
                                <button type="button" id="clear-selection" style="background: #f8fafc; color: #64748b; border: 1px solid #e2e8f0; border-radius: 8px; padding: 0.4rem 0.75rem; font-size: 0.75rem; font-weight: 600; cursor: pointer;">Clear Selection</button>
                            </div>
                        </div>
                    </div>
                `;

                this.showModal('<i data-lucide="check-square" style="width:20px;"></i> Master Curriculum Entry', modalHtml, async () => {
                    const title = document.getElementById('course-title').value.trim();
                    const credits = parseInt(document.getElementById('course-credits').value) || 3;
                    const type = document.getElementById('course-type').value;
                    const selectedStreams = [...document.querySelectorAll('.stream-checkbox:checked')].map(cb => cb.value);

                    if (!title) {
                        Notifications.show('Course title is required', 'error');
                        throw new Error('Validation failed');
                    }

                    const subjectId = `SUB${Math.random().toString(36).substr(2, 6).toUpperCase()}`;

                    // If streams selected, create one subject per stream. Else create a global subject.
                    if (selectedStreams.length > 0) {
                        for (const className of selectedStreams) {
                            await db.subjects.put({
                                id: `${subjectId}_${className.replace(/\s/g, '')}`,
                                name: title,
                                class_name: className,
                                credits: credits,
                                type: type,
                                is_synced: 0,
                                updated_at: new Date().toISOString()
                            });
                        }
                    } else {
                        await db.subjects.put({
                            id: subjectId,
                            name: title,
                            class_name: 'All',
                            credits: credits,
                            type: type,
                            is_synced: 0,
                            updated_at: new Date().toISOString()
                        });
                    }

                    Notifications.show(`Course "${title}" committed to curriculum (${selectedStreams.length || 'All'} streams).`, 'success');
                    this.renderSubjects();
                }, 'Commit to Curriculum', 'save');

                // Wire up Enroll Global / Clear Selection after modal is rendered
                setTimeout(() => {
                    const enrollBtn = document.getElementById('enroll-global');
                    const clearBtn = document.getElementById('clear-selection');
                    const countLabel = document.getElementById('stream-count-label');

                    const updateCount = () => {
                        const checked = document.querySelectorAll('.stream-checkbox:checked').length;
                        if (countLabel) countLabel.textContent = `${checked} STREAMS SELECTED`;
                    };

                    document.querySelectorAll('.stream-checkbox').forEach(cb => cb.addEventListener('change', updateCount));

                    if (enrollBtn) enrollBtn.addEventListener('click', () => {
                        document.querySelectorAll('.stream-checkbox').forEach(cb => cb.checked = true);
                        updateCount();
                    });
                    if (clearBtn) clearBtn.addEventListener('click', () => {
                        document.querySelectorAll('.stream-checkbox').forEach(cb => cb.checked = false);
                        updateCount();
                    });

                    if (typeof lucide !== 'undefined') lucide.createIcons();
                }, 50);
            });
        }

        if (typeof lucide !== 'undefined') lucide.createIcons();

        // CRUD: Delete Subjects
        document.querySelectorAll('.delete-subject-btn').forEach(btn => {
            btn.addEventListener('click', async () => {
                const name = btn.dataset.name;
                const ids = btn.dataset.ids.split(',');
                if (confirm(`Are you sure you want to remove "${name}" from the curriculum? This will delete all ${ids.length} stream instances.`)) {
                    await Promise.all(ids.map(id => db.subjects.delete(id)));
                    Notifications.show(`Course "${name}" removed.`, 'success');
                    this.renderSubjects();
                }
            });
        });

        // CRUD: Modify Subjects
        document.querySelectorAll('.modify-subject-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const name = btn.dataset.name;
                const ids = btn.dataset.ids;
                this.modifySubject(name, ids);
            });
        });
    },

    async modifySubject(subjectName, currentIds) {
        const subjects = await db.subjects.toArray();
        const subject = subjects.find(s => s.name === subjectName);
        const assignments = await db.subject_assignments.toArray();
        const teachers = (await db.profiles.toArray()).filter(p => p.role === 'Teacher' || p.role === 'Admin');
        const classes = await db.classes.toArray();

        const currentAssignments = assignments.filter(a => currentIds.split(',').includes(a.subject_id));

        const modalHtml = `
            <div style="display: flex; flex-direction: column; gap: 1.25rem;">
                <div class="form-group">
                    <label style="font-size: 0.75rem; font-weight: 700; color: #64748b;">COURSE TITLE</label>
                    <input type="text" id="edit-sub-name" class="input" value="${subjectName}" style="width:100%; height: 45px; background: rgba(255,255,255,0.05); color: white;">
                </div>
                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 1rem;">
                    <div class="form-group">
                        <label style="font-size: 0.75rem; font-weight: 700; color: #64748b;">CREDITS/UNITS</label>
                        <input type="number" id="edit-sub-credits" class="input" value="${subject.credits || 1}" style="width:100%; background: rgba(255,255,255,0.05); color: white;">
                    </div>
                    <div class="form-group">
                        <label style="font-size: 0.75rem; font-weight: 700; color: #64748b;">SUBJECT TYPE</label>
                        <select id="edit-sub-type" class="input" style="width:100%; background: rgba(255,255,255,0.05); color: white;">
                            <option value="Core" ${subject.type === 'Core' ? 'selected' : ''}>Core Subject</option>
                            <option value="Elective" ${subject.type === 'Elective' ? 'selected' : ''}>Elective</option>
                        </select>
                    </div>
                </div>

                <div style="background: rgba(255,255,255,0.02); padding: 1.25rem; border-radius: 12px; border: 1px solid rgba(255,255,255,0.1);">
                    <h4 style="font-size: 0.85rem; font-weight: 800; color: white; margin-bottom: 1rem; display: flex; align-items: center; gap: 0.5rem;"><i data-lucide="users" style="width:16px;"></i> Teacher Assignments</h4>
                    <div id="assignment-list" style="display: flex; flex-direction: column; gap: 0.75rem;">
                        ${currentAssignments.map(a => `
                            <div class="assignment-row" style="display: flex; gap: 0.5rem; align-items: center; background: rgba(255,255,255,0.05); padding: 0.5rem; border-radius: 8px; border: 1px solid rgba(255,255,255,0.1);">
                                <select class="input assign-teacher" style="flex: 1.5; font-size: 0.85rem; border: none; background: transparent; color: white;">
                                    ${teachers.map(t => `<option value="${t.id}" ${a.teacher_id === t.id ? 'selected' : ''} style="background: #1e293b;">${t.full_name || t.username}</option>`).join('')}
                                </select>
                                <select class="input assign-class" style="flex: 1; font-size: 0.85rem; border: none; background: transparent; color: white;">
                                    ${classes.map(c => `<option value="${c.name}" ${a.class_name === c.name ? 'selected' : ''} style="background: #1e293b;">${c.name}</option>`).join('')}
                                </select>
                                <button class="btn btn-sm" onclick="this.parentElement.remove()" style="color: #ef4444; background: none; border: none;"><i data-lucide="trash"></i></button>
                            </div>
                        `).join('')}
                    </div>
                    <button class="btn btn-secondary btn-sm mt-1 w-100" id="btn-add-assign" style="border: 2px dashed rgba(255,255,255,0.1); background: transparent; color: #94a3b8; font-weight: 700;">
                        <i data-lucide="plus"></i> Add Assignment
                    </button>
                </div>
            </div>
        `;

        this.showModal('Modify Subject & Assignments', modalHtml, async () => {
            const newName = document.getElementById('edit-sub-name').value;
            const newCredits = parseInt(document.getElementById('edit-sub-credits').value);
            const newType = document.getElementById('edit-sub-type').value;

            const idsToUpdate = currentIds.split(',');
            for (const id of idsToUpdate) {
                await db.subjects.update(id, { name: newName, credits: newCredits, type: newType, updated_at: new Date().toISOString() });
            }

            // Update assignments
            const rows = document.querySelectorAll('.assignment-row');
            await db.subject_assignments.where('subject_id').anyOf(idsToUpdate).delete();
            
            for (const row of rows) {
                const teacherId = row.querySelector('.assign-teacher').value;
                const className = row.querySelector('.assign-class').value;
                
                await db.subject_assignments.add(prepareForSync({
                    id: `ASN${Math.random().toString(36).substr(2, 7).toUpperCase()}`,
                    teacher_id: teacherId,
                    subject_id: idsToUpdate[0], 
                    class_name: className
                }));
            }

            Notifications.show('Subject updated', 'success');
            this.renderSubjects();
            syncToCloud();
        }, 'Update Subject', 'save');

        // Add row logic
        document.getElementById('btn-add-assign').onclick = () => {
            const row = document.createElement('div');
            row.className = 'assignment-row';
            row.style = "display: flex; gap: 0.5rem; align-items: center; background: rgba(255,255,255,0.05); padding: 0.5rem; border-radius: 8px; border: 1px solid rgba(255,255,255,0.1);";
            row.innerHTML = `
                <select class="input assign-teacher" style="flex: 1.5; font-size: 0.85rem; border: none; background: transparent; color: white;">
                    ${teachers.map(t => `<option value="${t.id}" style="background: #1e293b;">${t.full_name || t.username}</option>`).join('')}
                </select>
                <select class="input assign-class" style="flex: 1; font-size: 0.85rem; border: none; background: transparent; color: white;">
                    ${classes.map(c => `<option value="${c.name}" style="background: #1e293b;">${c.name}</option>`).join('')}
                </select>
                <button class="btn btn-sm" onclick="this.parentElement.remove()" style="color: #ef4444; background: none; border: none;"><i data-lucide="trash"></i></button>
            `;
            document.getElementById('assignment-list').appendChild(row);
            if (typeof lucide !== 'undefined') lucide.createIcons();
        };
        
        if (typeof lucide !== 'undefined') lucide.createIcons();
    },

    async renderStudents() {
        const isTeacher = (this.currentUser.role || '').toLowerCase() === 'teacher';
        let students = (await db.students.toArray()).sort((a,b) => a.name.localeCompare(b.name));
        const classes = (await db.classes.toArray()).sort((a,b) => a.name.localeCompare(b.name));
        
        // Default: Only show active students
        let showAll = false;
        let activeStudents = students.filter(s => s.is_active !== false);
        
        this.contentArea.innerHTML = `
            <div class="view-container" style="padding: 0.75rem;">
                <div class="page-banner" style="background: linear-gradient(135deg, #1e40af 0%, #1e3a8a 100%); padding: 1rem; min-height: auto; gap: 0.75rem;">
                    <div class="banner-content">
                        <h1 class="banner-title" style="font-size: 1.15rem; margin-bottom: 0.25rem;"><i data-lucide="graduation-cap"></i> Student Directory</h1>
                        <p class="banner-subtitle" style="font-size: 0.75rem; opacity: 0.8; line-height: 1.2;">Manage learners, biometric profiles, and performance metrics.</p>
                    </div>
                    <div class="banner-stats" style="margin: 0.5rem 0;">
                        <div class="banner-stat-item">
                            <span class="stat-value" id="active-student-count" style="font-size: 1.1rem;">${activeStudents.length}</span>
                            <span class="stat-label" style="font-size: 0.65rem;">Active</span>
                        </div>
                        <div class="banner-stat-item">
                            <span class="stat-value" style="font-size: 1.1rem;">${students.length - activeStudents.length}</span>
                            <span class="stat-label" style="font-size: 0.65rem;">Inactive</span>
                        </div>
                        <div class="banner-stat-item">
                            <span class="stat-value" style="font-size: 1.1rem;">${classes.length}</span>
                            <span class="stat-label" style="font-size: 0.65rem;">Classes</span>
                        </div>
                    </div>
                    <div class="banner-actions" style="display: flex; gap: 0.5rem; flex-wrap: wrap;">
                        ${!isTeacher ? `
                        <button id="btn-add-student" class="btn btn-primary" style="background: white; color: #1e3a8a; border: none; border-radius: 8px; padding: 0.5rem 1rem; display: flex; align-items: center; gap: 0.4rem; font-weight: 700; font-size: 0.75rem;">
                            <i data-lucide="user-plus" style="width: 14px;"></i> New Enrolment
                        </button>
                        ` : ''}
                        <button id="btn-print-credentials" class="btn btn-secondary" style="border-radius: 8px; padding: 0.5rem 1rem; display: flex; align-items: center; gap: 0.4rem; background: rgba(255,255,255,0.1); color: white; border: 1px solid rgba(255,255,255,0.2); font-size: 0.75rem;">
                            <i data-lucide="printer" style="width: 14px;"></i> Credentials
                        </button>
                    </div>
                </div>

                <div class="directory-container">
                    <div class="directory-sidebar" style="border-radius: 16px; background: white; border: 1px solid #e2e8f0;">
                        <div class="sidebar-search-wrap" style="padding: 1.25rem; background: #f8fafc; border-bottom: 2px solid #f1f5f9;">
                            <div style="position: relative; margin-bottom: 1rem;">
                                <i data-lucide="search" style="position: absolute; left: 1rem; top: 50%; transform: translateY(-50%); color: #94a3b8; width: 16px;"></i>
                                <input type="text" id="directory-search" placeholder="Search by name or serial..." class="input" style="padding-left: 2.75rem; border-radius: 10px; border: 1px solid #e2e8f0; height: 44px; background: white;">
                            </div>
                            <select id="class-filter" class="input" style="border-radius: 10px; height: 44px; border: 1px solid #e2e8f0; background: white; font-weight: 600; color: #475569; margin-bottom: 0.75rem;">
                                <option value="">All Academic Streams</option>
                                ${classes.map(c => `<option value="${c.name}">${c.name}</option>`).join('')}
                            </select>
                            <label style="display: flex; align-items: center; gap: 0.5rem; font-size: 0.75rem; color: #64748b; cursor: pointer; padding-left: 0.5rem;">
                                <input type="checkbox" id="show-inactive-toggle" style="accent-color: #2563eb;"> Include Deactivated Students
                            </label>
                        </div>
                        <div class="sidebar-list" id="student-sidebar-list" style="padding: 1rem;">
                            ${this.generateStudentListItems(activeStudents)}
                        </div>
                    </div>

                    <div class="directory-main" id="student-detail-view" style="border-radius: 16px; background: white; border: 1px solid #e2e8f0; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.05); min-height: 350px;">
                        <div class="empty-state">
                            <div class="empty-icon" style="width: 100px; height: 100px; background: #f8fafc; border-radius: 50%; color: #cbd5e1; display: flex; align-items: center; justify-content: center; margin: 0 auto 2rem;">
                                <i data-lucide="user-search" style="width: 48px; height: 48px;"></i>
                            </div>
                            <h2 class="text-2xl font-bold mb-1" style="color: #1e293b;">Select a Student</h2>
                            <p class="text-secondary" style="font-size: 1.1rem;">Choose a learner from the directory to access their academic history, attendance logs, and financial status.</p>
                        </div>
                    </div>
                </div>
            </div>
        `;

        // Logic remains same...
        const searchInput = document.getElementById('directory-search');
        const classFilter = document.getElementById('class-filter');
        const inactiveToggle = document.getElementById('show-inactive-toggle');
        const listContainer = document.getElementById('student-sidebar-list');

        const updateList = () => {
            const term = searchInput.value.toLowerCase();
            const filterClass = classFilter.value;
            const includeInactive = inactiveToggle.checked;
            
            const filtered = students.filter(s => 
                (s.name.toLowerCase().includes(term) || s.student_id.toLowerCase().includes(term)) &&
                (!filterClass || s.class_name === filterClass) &&
                (includeInactive || s.is_active !== false)
            );
            listContainer.innerHTML = this.generateStudentListItems(filtered);
            if (typeof lucide !== 'undefined') lucide.createIcons();
        };

        searchInput.addEventListener('input', updateList);
        classFilter.addEventListener('change', updateList);
        inactiveToggle.addEventListener('change', updateList);

        // Selection Logic (Accordion Style for Mobile)
        listContainer.addEventListener('click', async (e) => {
            const item = e.target.closest('.student-item');
            if (!item) return;

            const studentId = item.dataset.id;

            // Handle Icon Clicks Directly
            if (e.target.closest('.mobile-edit-std')) {
                e.stopPropagation();
                await this.renderStudentDetail(studentId); // Load data into modal/state
                document.getElementById('btn-modify-student')?.click();
                return;
            }
            if (e.target.closest('.mobile-delete-std')) {
                e.stopPropagation();
                await this.renderStudentDetail(studentId);
                document.getElementById('btn-delete-student')?.click();
                return;
            }

            // Toggle Accordion
            const isExpanded = item.classList.contains('active');
            document.querySelectorAll('.student-item').forEach(i => i.classList.remove('active'));
            
            if (!isExpanded) {
                item.classList.add('active');
                
                // If on mobile, populate the internal detail container
                const detailArea = item.querySelector('.mobile-detail-accordion');
                if (detailArea && (!detailArea.innerHTML.trim() || detailArea.innerHTML.includes('loader'))) {
                    detailArea.innerHTML = '<div class="loader-sm"></div>';
                    
                    // Fetch data
                    db.students.get(studentId).then(async student => {
                        const scores = await db.scores.where('student_id').equals(studentId).toArray();
                        const avg = scores.length > 0 ? Math.round(scores.reduce((a, s) => a + (s.total || 0), 0) / scores.length) : 0;
                        
                        detailArea.innerHTML = `
                            <div class="accordion-inner-content" style="padding: 1rem; background: #f8fafc; border-top: 1px solid #e2e8f0; border-radius: 0 0 12px 12px; font-size: 0.85rem;">
                                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 0.75rem; margin-bottom: 1rem;">
                                    <div class="stat-box-sm"><strong>AVG SCORE</strong><br>${avg}%</div>
                                    <div class="stat-box-sm"><strong>GENDER</strong><br>${student.gender || 'N/A'}</div>
                                    <div class="stat-box-sm"><strong>STATUS</strong><br>${student.status}</div>
                                    <div class="stat-box-sm"><strong>SUBJECTS</strong><br>${scores.length}</div>
                                </div>
                                <div style="margin-bottom: 0.75rem;">
                                    <strong style="color: #64748b; font-size: 0.7rem;">RESIDENTIAL ADDRESS</strong>
                                    <p style="margin: 2px 0; color: #1e293b;">${student.address || 'No address provided'}</p>
                                </div>
                                <div>
                                    <strong style="color: #64748b; font-size: 0.7rem;">PARENT/GUARDIAN</strong>
                                    <p style="margin: 2px 0; color: #1e293b;">${student.parent_name || 'N/A'} (${student.parent_phone || 'N/A'})</p>
                                </div>
                            </div>
                        `;
                    });
                }
            }
            
            // Also update desktop view if window is large
            if (window.innerWidth >= 1024) {
                await this.renderStudentDetail(studentId);
            }
        });

        const printBtn = document.getElementById('btn-print-credentials');
        if (printBtn) {
            printBtn.addEventListener('click', async () => {
                try {
                    const allStudents = await db.students.toArray();
                    if (allStudents.length === 0) {
                        Notifications.show('No students to generate credentials for.', 'warning');
                        return;
                    }
                    printBtn.innerHTML = '<i data-lucide="loader" class="spin"></i> Generating...';
                    await generateCredentialsPDF(allStudents, { name: 'GRAVITON ACADEMY' });
                    Notifications.show('Credentials generated successfully.', 'success');
                } catch (e) {
                    Notifications.show('Failed to generate credentials.', 'error');
                } finally {
                    printBtn.innerHTML = '<i data-lucide="printer"></i> Credentials';
                    if (typeof lucide !== 'undefined') lucide.createIcons();
                }
            });
        }

        // Add Student Modal
        const btnAddStudent = document.getElementById('btn-add-student');
        if (btnAddStudent) {
            btnAddStudent.addEventListener('click', () => {
                const classOptions = classes.map(c => `<option value="${c.name}">${c.name}</option>`).join('');
                const modalHtml = `
                    <div style="display: flex; flex-direction: column; gap: 1rem;">
                        <div>
                            <label>Full Student Name</label>
                            <input type="text" id="std-name" class="input" placeholder="e.g. Samuel Adekunle" style="width: 100%; box-sizing: border-box;">
                        </div>
                        <div>
                            <label>Class Assignment</label>
                            <select id="std-class" class="input" style="width: 100%; box-sizing: border-box;">
                                ${classOptions}
                            </select>
                        </div>
                        <div>
                            <label>Gender Identity</label>
                            <select id="std-gender" class="input" style="width: 100%; box-sizing: border-box;">
                                <option value="Male">Male</option>
                                <option value="Female">Female</option>
                            </select>
                        </div>
                        <div>
                            <label>System ID / Serial (Optional)</label>
                            <input type="text" id="std-serial" class="input" placeholder="Auto-generated if left blank" autocomplete="off" style="width: 100%; box-sizing: border-box;">
                        </div>
                        <div>
                            <label>Parent Email / Username</label>
                            <input type="text" id="std-parent-email" class="input" placeholder="e.g. parent@example.com" style="width: 100%; box-sizing: border-box;">
                            <span style="font-size: 0.7rem; color: #94a3b8; display: block; margin-top: 4px;">Matches the parent's login email or username to link accounts.</span>
                        </div>
                        <div>
                            <label>Date of Birth</label>
                            <input type="date" id="std-dob" class="input" style="width: 100%; box-sizing: border-box;">
                        </div>
                        <div>
                            <label>Phone Number</label>
                            <input type="text" id="std-phone" class="input" placeholder="e.g. 08012345678" style="width: 100%; box-sizing: border-box;">
                        </div>
                        <div>
                            <label>Residential Address</label>
                            <textarea id="std-address" class="input" style="width: 100%; box-sizing: border-box; resize: vertical; min-height: 80px;"></textarea>
                        </div>
                        <div>
                            <label>Parent/Guardian Name</label>
                            <input type="text" id="std-parent-name" class="input" placeholder="e.g. Mr. Adekunle" style="width: 100%; box-sizing: border-box;">
                        </div>
                        <div>
                            <label>Parent Phone</label>
                            <input type="text" id="std-parent-phone" class="input" placeholder="e.g. 08087654321" style="width: 100%; box-sizing: border-box;">
                        </div>
                        <div class="modal-grid">
                            <div>
                                <label>Blood Group</label>
                                <select id="std-blood" class="input" style="width: 100%; box-sizing: border-box;">
                                    <option value="">Select...</option>
                                    <option value="A+">A+</option><option value="O+">O+</option><option value="B+">B+</option><option value="AB+">AB+</option>
                                    <option value="A-">A-</option><option value="O-">O-</option><option value="B-">B-</option><option value="AB-">AB-</option>
                                </select>
                            </div>
                            <div>
                                <label>Genotype</label>
                                <select id="std-geno" class="input" style="width: 100%; box-sizing: border-box;">
                                    <option value="">Select...</option>
                                    <option value="AA">AA</option><option value="AS">AS</option><option value="SS">SS</option><option value="SC">SC</option>
                                </select>
                            </div>
                        </div>
                        <div>
                            <label>Class Timetable (JSON/Text)</label>
                            <textarea id="std-timetable" class="input" placeholder='e.g. {"Monday": ["Math", "English"], ...}' style="width: 100%; box-sizing: border-box; resize: vertical; min-height: 80px;"></textarea>
                        </div>
                    </div>
                `;

                this.showModal('New Student Entry', modalHtml, async () => {
                    const name = document.getElementById('std-name').value.trim();
                    const className = document.getElementById('std-class').value;
                    const gender = document.getElementById('std-gender').value;
                    let serial = document.getElementById('std-serial').value.trim();
                    let attendanceCode = null;
                    let admissionYear = new Date().getFullYear();

                    if (!name || !className) {
                        Notifications.show('Name and Class are required', 'error');
                        throw new Error('Validation failed');
                    }

                    // Force generate if serial is empty OR doesn't look like a final ID
                    if (!serial || serial.startsWith('PENDING-')) {
                        const idData = await generateStudentId();
                        serial = idData.student_id;
                        attendanceCode = idData.attendance_code;
                        admissionYear = idData.admission_year;
                    }
                    
                    const newStudent = prepareForSync({
                        student_id: serial,
                        name: name,
                        class_name: className,
                        gender: gender,
                        status: 'Active',
                        is_active: true,
                        attendance_code: attendanceCode,
                        admission_year: admissionYear,
                        sub_class: className.charAt(0).toUpperCase(), // Default first char of class
                        parent_email: document.getElementById('std-parent-email').value.trim(),
                        dob: document.getElementById('std-dob').value,
                        phone: document.getElementById('std-phone').value.trim(),
                        address: document.getElementById('std-address').value.trim(),
                        parent_name: document.getElementById('std-parent-name').value.trim(),
                        parent_phone: document.getElementById('std-parent-phone').value.trim(),
                        blood_group: document.getElementById('std-blood').value,
                        genotype: document.getElementById('std-geno').value,
                        timetable: document.getElementById('std-timetable').value.trim()
                    });

                    console.log('Registering Student with ID:', serial);
                    await db.students.add(newStudent);
                    syncToCloud(); 
                    Notifications.show(`Student ${name} registered with ID ${serial}.`, 'success');
                    this.renderStudents();
                }, 'Finalize Registration', 'save');
            });
        }

        if (typeof lucide !== 'undefined') lucide.createIcons();
    },

    async renderStudentDetail(studentId) {
        const student = await db.students.get(studentId);
        const detailView = document.getElementById('student-detail-view');
        if (!student || !detailView) return;

        const scores = await db.scores.where('student_id').equals(studentId).toArray();
        const avgScore = scores.length > 0 ? Math.round(scores.reduce((acc, s) => acc + (s.total || 0), 0) / scores.length) : 0;

        detailView.innerHTML = `
            <div style="padding: 1.5rem;">
                <div class="profile-header" style="margin-bottom: 1.5rem;">
                    <div class="profile-avatar-big" style="width: 120px; height: 120px; background: #f8fafc; border: 4px solid white; box-shadow: 0 10px 25px -5px rgba(0,0,0,0.1); border-radius: 30px; display: flex; align-items: center; justify-content: center; position: relative;">
                        <img src="https://api.dicebear.com/7.x/avataaars/svg?seed=${student.name}" style="width: 90px; height: 90px;" alt="${student.name}">
                        <div style="position: absolute; bottom: -10px; right: -10px; width: 44px; height: 44px; background: #2563eb; color: white; border-radius: 14px; display: flex; align-items: center; justify-content: center; border: 4px solid white;">
                            <i data-lucide="camera" style="width: 18px;"></i>
                        </div>
                    </div>
                    <div class="profile-title-info" style="flex: 1;">
                        <div style="display: flex; justify-content: space-between; align-items: flex-start;">
                            <div>
                                <span class="badge" style="background: #eff6ff; color: #2563eb; font-weight: 800; border-radius: 12px; padding: 0.4rem 0.8rem; margin-bottom: 0.5rem; display: inline-block;">ACADEMIC ID: ${student.student_id}</span>
                                <h1 style="font-size: 2rem; font-weight: 800; color: #1e293b; letter-spacing: -0.02em; line-height: 1.1;">${student.name}</h1>
                                <p style="font-size: 1.1rem; color: #64748b; margin-top: 0.25rem;">${student.class_name} • Junior Secondary Stream</p>
                            </div>
                             <div style="display: flex; gap: 1rem;">
                                 ${!((this.currentUser.role || '').toLowerCase() === 'teacher') ? `
                                 <button id="btn-modify-student" class="btn btn-secondary" style="border-radius: 14px; padding: 0.75rem 1.25rem;"><i data-lucide="edit"></i> Modify</button>
                                 ${student.is_active !== false ? 
                                    `<button id="btn-deactivate-student" class="btn btn-secondary" style="border-radius: 14px; padding: 0.75rem 1.25rem; color: #ef4444; background: #fef2f2; border: none;"><i data-lucide="user-x"></i> Deactivate</button>` :
                                    `<button id="btn-reactivate-student" class="btn btn-secondary" style="border-radius: 14px; padding: 0.75rem 1.25rem; color: #10b981; background: #ecfdf5; border: none;"><i data-lucide="user-check"></i> Reactivate</button>`
                                 }
                                 ` : ''}
                             </div>
                        </div>
                    </div>
                </div>

                <div class="profile-stats" style="margin-bottom: 2rem;">
                    <div style="background: #f8fafc; padding: 1.25rem; border-radius: 20px; border: 1px solid #f1f5f9;">
                        <span style="font-size: 0.7rem; font-weight: 800; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.1em;">Cumulative Avg</span>
                        <div style="display: flex; align-items: baseline; gap: 0.5rem; margin-top: 0.25rem;">
                            <span style="font-size: 1.75rem; font-weight: 800; color: #1e293b;">${avgScore}%</span>
                            <span style="color: #10b981; font-weight: 700; font-size: 0.8rem;">+2.4%</span>
                        </div>
                    </div>
                    <div style="background: #f8fafc; padding: 1.25rem; border-radius: 20px; border: 1px solid #f1f5f9;">
                        <span style="font-size: 0.7rem; font-weight: 800; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.1em;">Attendance Rate</span>
                        <div style="display: flex; align-items: baseline; gap: 0.5rem; margin-top: 0.25rem;">
                            <span style="font-size: 1.75rem; font-weight: 800; color: #1e293b;">94%</span>
                            <span style="color: #ef4444; font-weight: 700; font-size: 0.8rem;">-0.5%</span>
                        </div>
                    </div>
                    <div style="background: #f8fafc; padding: 1.25rem; border-radius: 20px; border: 1px solid #f1f5f9;">
                        <span style="font-size: 0.7rem; font-weight: 800; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.1em;">Active Subjects</span>
                        <div style="display: flex; align-items: baseline; gap: 0.5rem; margin-top: 0.25rem;">
                            <span style="font-size: 1.75rem; font-weight: 800; color: #1e293b;">${scores.length}</span>
                            <span style="color: #64748b; font-weight: 700; font-size: 0.8rem;">Assigned</span>
                        </div>
                    </div>
                </div>

                <div class="profile-tabs" style="border-bottom: 2px solid #f1f5f9; display: flex; gap: 3rem; margin-bottom: 2rem;">
                    <button style="background: none; border: none; border-bottom: 2px solid #2563eb; padding: 1rem 0; font-weight: 800; color: #1e293b; cursor: pointer;">General Profile</button>
                    <button style="background: none; border: none; padding: 1rem 0; font-weight: 600; color: #64748b; cursor: pointer;">Academic Records</button>
                    <button style="background: none; border: none; padding: 1rem 0; font-weight: 600; color: #64748b; cursor: pointer;">Attendance Logs</button>
                </div>

                <div class="info-grid">
                    <div class="info-section">
                        <h4 style="font-size: 1.1rem; font-weight: 800; color: #1e293b; margin-bottom: 1.5rem; display: flex; align-items: center; gap: 0.75rem;">
                            <i data-lucide="info" style="width: 18px; color: #2563eb;"></i> Bio-Data
                        </h4>
                        <div style="display: flex; flex-direction: column; gap: 1rem;">
                            <div style="display: flex; justify-content: space-between; padding-bottom: 0.75rem; border-bottom: 1px solid #f8fafc;">
                                <span style="color: #94a3b8; font-weight: 600;">Gender</span>
                                <span style="font-weight: 700; color: #475569;">${student.gender || 'Not Specified'}</span>
                            </div>
                            <div style="display: flex; justify-content: space-between; padding-bottom: 0.75rem; border-bottom: 1px solid #f8fafc;">
                                <span style="color: #94a3b8; font-weight: 600;">Status</span>
                                <span class="badge" style="background: ${student.is_active !== false ? '#ecfdf5' : '#fef2f2'}; color: ${student.is_active !== false ? '#10b981' : '#ef4444'}; font-weight: 700; border-radius: 8px; padding: 2px 8px;">${student.is_active !== false ? 'Active' : 'Deactivated'}</span>
                            </div>
                            <div style="display: flex; justify-content: space-between; padding-bottom: 0.75rem; border-bottom: 1px solid #f8fafc;">
                                <span style="color: #94a3b8; font-weight: 600;">Blood Group</span>
                                <span style="font-weight: 700; color: #475569;">${student.blood_group || 'N/A'}</span>
                            </div>
                            <div style="display: flex; justify-content: space-between; padding-bottom: 0.75rem; border-bottom: 1px solid #f8fafc;">
                                <span style="color: #94a3b8; font-weight: 600;">Genotype</span>
                                <span style="font-weight: 700; color: #475569;">${student.genotype || 'N/A'}</span>
                            </div>
                        </div>
                    </div>
                    
                    <div class="info-section">
                        <h4 style="font-size: 1.1rem; font-weight: 800; color: #1e293b; margin-bottom: 1.5rem; display: flex; align-items: center; gap: 0.75rem;">
                            <i data-lucide="map-pin" style="width: 18px; color: #2563eb;"></i> Contact & Guardians
                        </h4>
                        <div style="display: flex; flex-direction: column; gap: 1rem;">
                            <div style="display: flex; flex-direction: column; padding-bottom: 0.75rem; border-bottom: 1px solid #f8fafc;">
                                <span style="color: #94a3b8; font-weight: 600; font-size: 0.8rem; margin-bottom: 4px;">Residential Address</span>
                                <span style="font-weight: 700; color: #475569;">${student.address || 'No address provided'}</span>
                            </div>
                            <div style="display: flex; justify-content: space-between; padding-bottom: 0.75rem; border-bottom: 1px solid #f8fafc;">
                                <span style="color: #94a3b8; font-weight: 600;">Parent/Guardian Name</span>
                                <span style="font-weight: 700; color: #475569;">${student.parent_name || 'N/A'}</span>
                            </div>
                            <div style="display: flex; justify-content: space-between; padding-bottom: 0.75rem; border-bottom: 1px solid #f8fafc;">
                                <span style="color: #94a3b8; font-weight: 600;">Emergency Contact</span>
                                <span style="font-weight: 700; color: #475569;">${student.parent_phone || 'N/A'}</span>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `;
        if (typeof lucide !== 'undefined') lucide.createIcons();

        // CRUD: Deactivate/Reactivate Student
        const deactivateBtn = document.getElementById('btn-deactivate-student');
        if (deactivateBtn) {
            deactivateBtn.onclick = async () => {
                if (confirm(`Are you sure you want to deactivate ${student.name}? They will no longer appear in active rosters or attendance sheets.`)) {
                    await db.students.update(studentId, { 
                        is_active: false, 
                        status: 'Inactive', 
                        updated_at: new Date().toISOString(),
                        is_synced: 0 
                    });
                    Notifications.show(`${student.name} has been deactivated.`, 'success');
                    this.renderStudents();
                    syncToCloud();
                }
            };
        }

        const reactivateBtn = document.getElementById('btn-reactivate-student');
        if (reactivateBtn) {
            reactivateBtn.onclick = async () => {
                await db.students.update(studentId, { 
                    is_active: true, 
                    status: 'Active', 
                    updated_at: new Date().toISOString(),
                    is_synced: 0 
                });
                Notifications.show(`${student.name} has been reactivated.`, 'success');
                this.renderStudents();
                syncToCloud();
            };
        }

        // CRUD: Modify Student (Full Modal Edit)
        const modifyBtn = document.getElementById('btn-modify-student');
        if (modifyBtn) {
            modifyBtn.onclick = async () => {
                const classes = await db.classes.toArray();
                const classOptions = classes.map(c => `<option value="${c.name}" ${c.name === student.class_name ? 'selected' : ''}>${c.name}</option>`).join('');
                
                const modalHtml = `
                    <div style="display: flex; flex-direction: column; gap: 1rem;">
                        <div><label>Full Name</label><input type="text" id="edit-std-name" class="input" value="${student.name}" style="width:100%;"></div>
                        <div><label>Class</label><select id="edit-std-class" class="input" style="width:100%;">${classOptions}</select></div>
                        <div><label>Gender</label><select id="edit-std-gender" class="input" style="width:100%;"><option value="Male" ${student.gender === 'Male' ? 'selected' : ''}>Male</option><option value="Female" ${student.gender === 'Female' ? 'selected' : ''}>Female</option></select></div>
                        <div><label>Parent Email</label><input type="text" id="edit-std-parent-email" class="input" value="${student.parent_email || ''}" style="width:100%;"></div>
                        <div><label>Phone</label><input type="text" id="edit-std-phone" class="input" value="${student.phone || ''}" style="width:100%;"></div>
                        <div><label>Address</label><textarea id="edit-std-address" class="input" style="width:100%; min-height:80px;">${student.address || ''}</textarea></div>
                    </div>
                `;

                this.showModal('<i data-lucide="edit-3"></i> Modify Student Bio-Data', modalHtml, async () => {
                    const updates = {
                        name: document.getElementById('edit-std-name').value,
                        class_name: document.getElementById('edit-std-class').value,
                        gender: document.getElementById('edit-std-gender').value,
                        parent_email: document.getElementById('edit-std-parent-email').value,
                        phone: document.getElementById('edit-std-phone').value,
                        address: document.getElementById('edit-std-address').value,
                        updated_at: new Date().toISOString()
                    };
                    await db.students.update(studentId, updates);
                    Notifications.show('Profile updated successfully.', 'success');
                    this.renderStudentDetail(studentId);
                }, 'Update Profile', 'save');
            };
        }
    },

    generateStudentListItems(students) {
        if (students.length === 0) return `<div class="p-2 text-center text-slate-400 text-sm">No students found</div>`;
        return students.map(s => `
            <div class="student-item-container" style="margin-bottom: 0.5rem; opacity: ${s.is_active !== false ? '1' : '0.6'};">
                <div class="student-item" data-id="${s.student_id}" style="cursor: pointer; border-radius: 12px; overflow: hidden; transition: all 0.2s ease; border: 1px solid ${s.is_active !== false ? 'transparent' : '#fecaca'}; background: ${s.is_active !== false ? 'transparent' : '#fff5f5'};">
                    <div style="padding: 1rem; display: flex; justify-content: space-between; align-items: center;">
                        <div class="student-item-info">
                            <span class="student-item-name" style="font-weight: 700; color: ${s.is_active !== false ? '#1e293b' : '#991b1b'};">${s.name} ${s.is_active === false ? '<span style="font-size: 0.6rem; background: #fee2e2; color: #ef4444; padding: 2px 6px; border-radius: 4px; margin-left: 4px;">INACTIVE</span>' : ''}</span>
                            <span class="student-item-meta" style="font-size: 0.75rem; color: #64748b; display: block;">${s.student_id} • ${s.class_name}</span>
                        </div>
                        <div style="display: flex; gap: 0.85rem; align-items: center;">
                            <i data-lucide="edit-3" class="mobile-edit-std" style="width: 16px; color: #2563eb;"></i>
                            <i data-lucide="chevron-down" class="accordion-arrow" style="width: 14px; opacity: 0.4;"></i>
                        </div>
                    </div>
                    <div class="mobile-detail-accordion mobile-only" style="max-height: 0; overflow: hidden; transition: max-height 0.3s ease-out;">
                        <!-- Populated on click -->
                    </div>
                </div>
            </div>
        `).join('');
    },

    async renderBulkImport() {
        this.contentArea.innerHTML = `
            <div class="view-container">
                <div class="page-banner" style="background: linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%);">
                    <div class="banner-content">
                        <h1 class="banner-title"><i data-lucide="database"></i> Smart Data Importer</h1>
                        <p class="banner-subtitle">Drop your Excel/CSV files here. The system will automatically sort your data into the correct columns.</p>
                    </div>
                </div>

                <div class="card" style="text-align: center; padding: 4rem 2rem; border: 2px dashed #e2e8f0; border-radius: 20px; background: #f8fafc;">
                    <div id="drop-zone" style="cursor: pointer;">
                        <i data-lucide="upload-cloud" style="width: 64px; height: 64px; color: #6366f1; margin-bottom: 1.5rem;"></i>
                        <h2 style="color: #1e293b; margin-bottom: 0.5rem;">Click or Drag Files Here</h2>
                        <p style="color: #64748b;">Supports .xlsx, .xls, and .csv files</p>
                        <input type="file" id="file-input" style="display: none;" accept=".xlsx, .xls, .csv">
                    </div>
                </div>

                <div id="import-preview" style="display: none; margin-top: 2rem;">
                    <div class="card">
                        <h3 style="margin-bottom: 1.5rem;">Import Summary</h3>
                        <div id="summary-list" style="display: grid; gap: 1rem;"></div>
                        <button id="btn-confirm-import" class="btn btn-primary mt-2" style="width: 100%; padding: 1rem; font-size: 1rem; border-radius: 12px;">Process and Save All Data</button>
                    </div>
                </div>
            </div>
        `;

        if (typeof lucide !== 'undefined') lucide.createIcons();

        const dropZone = document.getElementById('drop-zone');
        const fileInput = document.getElementById('file-input');
        const preview = document.getElementById('import-preview');
        const summaryList = document.getElementById('summary-list');
        const confirmBtn = document.getElementById('btn-confirm-import');

        let pendingData = null;

        dropZone.onclick = () => fileInput.click();
        
        fileInput.onchange = async (e) => {
            const file = e.target.files[0];
            if (!file) return;

            Notifications.show('Analyzing file structure...', 'info');
            try {
                const data = await parseExcel(file);
                pendingData = this.processImportData(data);
                this.renderImportSummary(pendingData, summaryList, preview);
            } catch (err) {
                Notifications.show('Failed to read file', 'error');
                console.error(err);
            }
        };

        confirmBtn.onclick = async () => {
            if (!pendingData) return;
            confirmBtn.disabled = true;
            confirmBtn.innerHTML = '<span>Processing...</span><div class="loader"></div>';

            try {
                let total = 0;
                for (const [table, records] of Object.entries(pendingData)) {
                    if (records.length > 0) {
                        const pk = table === 'students' ? 'student_id' : 'id';
                        await db[table].bulkPut(records.map(r => prepareForSync(r)));
                        total += records.length;
                    }
                }
                Notifications.show(`Successfully imported ${total} records!`, 'success');
                syncToCloud();
                this.renderView('dashboard');
            } catch (err) {
                Notifications.show('Import failed during saving', 'error');
                console.error(err);
                confirmBtn.disabled = false;
                confirmBtn.innerText = 'Process and Save All Data';
            }
        };
    },

    processImportData(data) {
        const result = {
            students: [],
            scores: [],
            subjects: [],
            classes: [],
            subject_assignments: []
        };

        for (const [sheetName, rows] of Object.entries(data)) {
            if (!rows || rows.length === 0) continue;

            // Analyze first row to guess table
            const headers = Object.keys(rows[0]).map(h => h.toLowerCase().trim());
            
            // 1. Guess Table
            let target = null;
            if (headers.includes('gender') || headers.includes('student_id')) target = 'students';
            else if (headers.includes('exam') || headers.includes('assignment')) target = 'scores';
            else if (headers.includes('credits') || headers.includes('course type')) target = 'subjects';
            else if (headers.includes('level') || (headers.includes('class') && headers.length < 3)) target = 'classes';
            else if (headers.includes('subject') && headers.includes('class')) target = 'subject_assignments';

            if (!target) continue;

            // 2. Map Columns to DB Schema
            rows.forEach(row => {
                const mapped = {};
                for (let [key, val] of Object.entries(row)) {
                    const cleanKey = key.toLowerCase().trim();
                    const cleanVal = String(val || '').trim();

                    // Smart Field Mapping
                    if (target === 'students') {
                        if (cleanKey.includes('name')) mapped.name = cleanVal;
                        if (cleanKey.includes('id')) mapped.student_id = cleanVal;
                        if (cleanKey.includes('gender')) mapped.gender = cleanVal;
                        if (cleanKey.includes('class')) mapped.class_name = cleanVal;
                        if (cleanKey.includes('address')) mapped.address = cleanVal;
                        if (cleanKey.includes('status')) mapped.status = cleanVal;
                        if (!mapped.status) mapped.status = 'Active';
                        if (!mapped.student_id) mapped.student_id = `TEMP/${Math.random().toString(36).substr(2,5).toUpperCase()}`;
                    }
                    else if (target === 'scores') {
                        if (cleanKey.includes('id')) mapped.student_id = cleanVal;
                        if (cleanKey.includes('subject') || cleanKey.includes('course')) mapped.subject_id = cleanVal;
                        if (cleanKey.includes('term')) mapped.term = cleanVal;
                        if (cleanKey.includes('session')) mapped.session = cleanVal;
                        if (cleanKey.includes('assignment') || cleanKey === 'ass') mapped.assignment = parseFloat(cleanVal) || 0;
                        if (cleanKey.includes('test1') || cleanKey === 't1') mapped.test1 = parseFloat(cleanVal) || 0;
                        if (cleanKey.includes('test2') || cleanKey === 't2') mapped.test2 = parseFloat(cleanVal) || 0;
                        if (cleanKey.includes('project') || cleanKey === 'prj') mapped.project = parseFloat(cleanVal) || 0;
                        if (cleanKey.includes('exam')) mapped.exam = parseFloat(cleanVal) || 0;
                        
                        // ID is a composite for scores to prevent duplicates
                        if (mapped.student_id && mapped.subject_id && mapped.term) {
                            mapped.id = `${mapped.student_id}_${mapped.subject_id}_${mapped.term}_${mapped.session || 'current'}`;
                        }
                    }
                    else if (target === 'subjects') {
                        if (cleanKey.includes('name') || cleanKey.includes('title')) mapped.name = cleanVal;
                        if (cleanKey.includes('type')) mapped.type = cleanVal;
                        if (cleanKey.includes('id')) mapped.id = cleanVal;
                        if (!mapped.id) mapped.id = `SUB-${cleanVal.substring(0,3).toUpperCase()}`;
                        if (!mapped.type) mapped.type = 'Core';
                        mapped.credits = 1;
                    }
                    else if (target === 'classes') {
                        if (cleanKey.includes('name') || cleanKey.includes('stream')) mapped.name = cleanVal;
                        if (cleanKey.includes('level')) mapped.level = cleanVal;
                        if (!mapped.id) mapped.id = `CLS-${cleanVal.replace(/\s+/g,'-').toUpperCase()}`;
                    }
                    else if (target === 'subject_assignments') {
                        if (cleanKey.includes('subject') || cleanKey.includes('course')) mapped.subject_id = cleanVal;
                        if (cleanKey.includes('class')) mapped.class_name = cleanVal;
                        if (!mapped.id) mapped.id = `ASGN-${Math.random().toString(36).substr(2,6).toUpperCase()}`;
                        mapped.teacher_id = 'unassigned';
                    }
                }
                // Smart Student ID resolution for scores
                if (target === 'scores' && !mapped.student_id && mapped.name) {
                    const studentMatch = result.students.find(s => s.name.toLowerCase().trim() === mapped.name.toLowerCase().trim());
                    if (studentMatch) mapped.student_id = studentMatch.student_id;
                }
                
                result[target].push(mapped);
            });
        }
        return result;
    },

    renderImportSummary(pending, container, previewEl) {
        container.innerHTML = '';
        let hasData = false;

        const tableIcons = {
            students: 'users',
            scores: 'clipboard-list',
            subjects: 'book',
            classes: 'layers',
            subject_assignments: 'link'
        };

        for (const [table, records] of Object.entries(pending)) {
            if (records.length > 0) {
                hasData = true;
                const row = document.createElement('div');
                row.style = 'display: flex; justify-content: space-between; align-items: center; padding: 1rem; background: #f1f5f9; border-radius: 10px;';
                row.innerHTML = `
                    <div style="display: flex; align-items: center; gap: 1rem;">
                        <div style="background: #fff; padding: 0.5rem; border-radius: 8px; color: #6366f1;">
                            <i data-lucide="${tableIcons[table]}"></i>
                        </div>
                        <div>
                            <div style="font-weight: 700; color: #1e293b;">${table.toUpperCase()}</div>
                            <div style="font-size: 0.75rem; color: #64748b;">Detected automatically</div>
                        </div>
                    </div>
                    <div style="font-weight: 800; color: #2563eb; font-size: 1.25rem;">${records.length}</div>
                `;
                container.appendChild(row);
            }
        }

        if (hasData) {
            previewEl.style.display = 'block';
            if (typeof lucide !== 'undefined') lucide.createIcons();
        } else {
            Notifications.show('No recognizable data found in file', 'warning');
        }
    },

    async renderGrades() {
        const isTeacher = (this.currentUser.role || '').toLowerCase() === 'teacher';
        const teacherId = this.currentUser.id;
        
        let students = (await db.students.toArray()).sort((a,b) => (a.name || '').localeCompare(b.name || ''));
        let classes = (await db.classes.toArray()).sort((a,b) => (a.name || '').localeCompare(b.name || ''));
        let subjects = (await db.subjects.toArray()).sort((a,b) => (a.name || '').localeCompare(b.name || ''));
        
        // --- Teacher Specific Filtering ---
        if (isTeacher) {
            const assignments = await db.subject_assignments.where('teacher_id').equals(teacherId).toArray();
            const assignedClassNames = [...new Set(assignments.map(a => a.class_name))];
            const assignedSubjectIds = [...new Set(assignments.map(a => a.subject_id))];
            
            classes = classes.filter(c => assignedClassNames.includes(c.name));
            subjects = subjects.filter(s => assignedSubjectIds.includes(s.id));
        }
        
        this.contentArea.innerHTML = `
            <div class="view-container" style="padding: 1.5rem; background: #f8fafc;">
                <!-- Modern Banner (Title Moved to Top Bar) -->
                <div class="page-banner" style="background: linear-gradient(135deg, #2563eb 0%, #1e40af 100%); border-radius: 16px; padding: 1.5rem; color: white; display: flex; align-items: center; justify-content: space-between; box-shadow: var(--shadow-lg);">
                    <div class="banner-content">
                        <div style="display:flex; align-items:center; gap:0.75rem;">
                            <div style="background:rgba(255,255,255,0.2); padding:0.5rem; border-radius:10px;"><i data-lucide="bar-chart-3" style="width:20px; height:20px;"></i></div>
                            <h1 class="banner-title" style="font-size: 1.25rem; margin:0;">Grading Intelligence</h1>
                        </div>
                        <p class="banner-subtitle" style="opacity:0.8; margin-top:0.25rem; font-size:0.85rem;">Active Tracking: <span id="active-subject-name" style="font-weight:700;">Select Course</span></p>
                    </div>
                </div>
                
                <!-- Statistics in Top Bar -->
                <div id="top-bar-stats-inject" style="display:none;">
                    <div class="stats-strip" style="display: flex; gap: 1rem; align-items: center;">
                        <div class="stat-mini-card" style="background: #f0fdf4; border: 1px solid #dcfce7; border-radius: 8px; padding: 0.4rem 0.8rem; text-align: center; min-width: 100px;">
                            <span id="stat-class-avg" style="display: block; font-size: 1.1rem; font-weight: 800; color: #15803d;">0%</span>
                            <span style="font-size: 0.55rem; text-transform: uppercase; font-weight: 700; color: #166534;">Avg</span>
                        </div>
                        <div class="stat-mini-card" style="background: #eff6ff; border: 1px solid #dbeafe; border-radius: 8px; padding: 0.4rem 0.8rem; text-align: center; min-width: 100px;">
                            <span id="stat-peak-perf" style="display: block; font-size: 1.1rem; font-weight: 800; color: #1d4ed8;">0</span>
                            <span style="font-size: 0.55rem; text-transform: uppercase; font-weight: 700; color: #1e40af;">Peak</span>
                        </div>
                        <div class="stat-mini-card" style="background: #fff1f2; border: 1px solid #ffe4e6; border-radius: 8px; padding: 0.4rem 0.8rem; text-align: center; min-width: 100px;">
                            <span id="stat-fail-count" style="display: block; font-size: 1.1rem; font-weight: 800; color: #be123c;">0</span>
                            <span style="font-size: 0.55rem; text-transform: uppercase; font-weight: 700; color: #9f1239;">Fails</span>
                        </div>
                    </div>
                </div>

                <!-- Modern Filter Cards -->
                <div class="filter-grid" style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 1rem; margin-top: 1rem;">

                    <div class="card" style="padding: 1rem; border-radius: 16px; box-shadow: var(--shadow-sm); display:flex; flex-direction:column; gap:0.5rem;">
                        <div style="display:flex; align-items:center; gap:0.5rem; color:var(--accent-primary);"><i data-lucide="graduation-cap" style="width:16px;"></i> <span style="font-size:0.65rem; font-weight:800; text-transform:uppercase;">Stream</span></div>
                        <select id="grade-class-filter" class="input" style="border:none; padding:0; font-size:1.1rem; font-weight:700; background:transparent;">
                            <option value="">Select Stream</option>
                            ${classes.map(c => `<option value="${c.name}">${c.name}</option>`).join('')}
                        </select>
                    </div>
                    <div class="card" style="padding: 1rem; border-radius: 16px; box-shadow: var(--shadow-sm); display:flex; flex-direction:column; gap:0.5rem;">
                        <div style="display:flex; align-items:center; gap:0.5rem; color:var(--accent-primary);"><i data-lucide="book-open" style="width:16px;"></i> <span style="font-size:0.65rem; font-weight:800; text-transform:uppercase;">Course</span></div>
                        <select id="grade-subject-filter" class="input" style="border:none; padding:0; font-size:1.1rem; font-weight:700; background:transparent;">
                            <option value="">Select Stream First</option>
                        </select>
                    </div>
                    <div class="card" style="padding: 1rem; border-radius: 16px; box-shadow: var(--shadow-sm); display:flex; flex-direction:column; gap:0.5rem;">
                        <div style="display:flex; align-items:center; gap:0.5rem; color:var(--accent-primary);"><i data-lucide="hash" style="width:16px;"></i> <span style="font-size:0.65rem; font-weight:800; text-transform:uppercase;">Term</span></div>
                        <select id="grade-term-filter" class="input" style="border:none; padding:0; font-size:1.1rem; font-weight:700; background:transparent;">
                            <option value="1st Term">1st Term / First Term</option>
                            <option value="2nd Term">2nd Term / Second Term</option>
                            <option value="3rd Term">3rd Term / Third Term</option>
                        </select>
                    </div>
                    <div class="card" style="padding: 1rem; border-radius: 16px; box-shadow: var(--shadow-sm); display:flex; flex-direction:column; gap:0.5rem;">
                        <div style="display:flex; align-items:center; gap:0.5rem; color:var(--accent-primary);"><i data-lucide="calendar" style="width:16px;"></i> <span style="font-size:0.65rem; font-weight:800; text-transform:uppercase;">Session</span></div>
                        <select id="grade-session-filter" class="input" style="border:none; padding:0; font-size:1.1rem; font-weight:700; background:transparent;">
                            <option value="2023/2024">2023/2024</option>
                            <option value="2024/2025">2024/2025</option>
                            <option value="2025/2026" selected>2025/2026</option>
                        </select>
                    </div>
                </div>
                <!-- Status Indicator -->
                <div id="gradebook-mismatch-warning" style="display:none;"></div>

                <!-- Dedicated Action Bar -->
                <div class="action-bar-container" style="display: flex; justify-content: space-between; align-items: center; margin-top: 1.5rem; padding: 0.75rem 1rem; background: #ffffff; border-radius: 12px; border: 1px solid #e2e8f0; box-shadow: var(--shadow-sm);">
                    <div style="display: flex; align-items: center; gap: 0.75rem; color: #64748b; font-size: 0.85rem; font-weight: 600;">
                        <i data-lucide="info" style="width:16px;"></i> <span>Draft scores are saved locally until committed.</span>
                    </div>
                    <div style="display: flex; gap: 1rem;">
                        <button id="btn-sync-ledger" class="btn" style="background: #fff; color: #2563eb; border: 1px solid #2563eb; border-radius: 10px; padding: 0.6rem 1.25rem; font-weight: 700; font-size: 0.85rem; display: flex; align-items: center; gap: 0.5rem; cursor: pointer;">
                            <i data-lucide="refresh-cw" style="width: 16px;"></i> Refresh Data
                        </button>
                        <button id="btn-print-empty" class="btn" style="background: #f1f5f9; color: #475569; border: 1px solid #e2e8f0; border-radius: 10px; padding: 0.6rem 1.25rem; font-weight: 700; font-size: 0.85rem; display: flex; align-items: center; gap: 0.5rem; cursor: pointer;">
                            <i data-lucide="printer" style="width: 16px;"></i> Print Empty Sheet
                        </button>
                        <button id="btn-commit-grades" class="btn" style="background: #2563eb; color: white; border: none; border-radius: 10px; padding: 0.6rem 1.25rem; font-weight: 700; font-size: 0.85rem; display: flex; align-items: center; gap: 0.5rem; box-shadow: 0 4px 12px rgba(37,99,235,0.25); cursor: pointer;">
                            <i data-lucide="save" style="width: 16px;"></i> Commit Grades
                        </button>
                    </div>
                </div>

                <!-- Score Entry Table (Desktop) -->
                <div class="card mt-2 desktop-only" style="border-radius: 16px; padding: 0.5rem; overflow: hidden; box-shadow: var(--shadow-md);">
                    <div class="table-container" style="max-height: calc(100vh - 450px); overflow-y: auto;">
                        <table class="data-table" style="width:100%; font-size:0.85rem;">
                            <thead>
                                <tr style="background: #f1f5f9;">
                                    <th style="padding: 1rem;">Scholar Name</th>
                                    <th style="text-align:center;">ASSIGN</th>
                                    <th style="text-align:center;">TEST 1</th>
                                    <th style="text-align:center;">TEST 2</th>
                                    <th style="text-align:center;">PROJECT</th>
                                    <th style="text-align:center; background:#eff6ff; color:#2563eb;">CA</th>
                                    <th style="text-align:center; background:#eff6ff; color:#2563eb;">EXAM</th>
                                    <th style="text-align:center; background:#f0fdf4; color:#15803d; font-weight:800;">TOTAL</th>
                                    <th style="text-align:center;">GRD</th>
                                    <th style="text-align:center;">RNK</th>
                                </tr>
                            </thead>
                            <tbody id="grade-entry-body">
                                <tr><td colspan="10" style="text-align:center; padding:3rem; color:var(--text-muted);">Please select a Stream and Course to begin grading</td></tr>
                            </tbody>
                        </table>
                    </div>
                </div>

                <!-- Mobile Score Cards -->
                <div id="mobile-score-entry" class="mobile-only" style="margin-top: 1.5rem; padding-bottom: 80px;">
                    <!-- Populated via loadAcademicLedger -->
                </div>

                <!-- Mobile Action Bar (Fixed at bottom) -->
                <div class="action-bar-mobile mobile-only">
                    <button id="mobile-btn-sync" class="btn" style="background:#fff; color:#2563eb; border:1px solid #2563eb; border-radius:12px;"><i data-lucide="refresh-cw"></i></button>
                    <button id="mobile-btn-print" class="btn" style="background:#f1f5f9; color:#475569; border:1px solid #e2e8f0; border-radius:12px;"><i data-lucide="printer"></i></button>
                    <button id="mobile-btn-commit" class="btn" style="background:#2563eb; color:white; flex:1; border-radius:12px; font-weight:800;">Commit All Grades</button>
                </div>
            </div>
        `;

        if (typeof lucide !== 'undefined') lucide.createIcons();

        const gradeBody = document.getElementById('grade-entry-body');
        const subjectFilter = document.getElementById('grade-subject-filter');
        const classFilter = document.getElementById('grade-class-filter');
        const termFilter = document.getElementById('grade-term-filter');
        const sessionFilter = document.getElementById('grade-session-filter');

        const loadAcademicLedger = async () => {
            const cls = classFilter.value;
            const subId = subjectFilter.value;
            const term = termFilter.value;
            const session = sessionFilter.value;

            // Shared Statistics Helper
            const updateStatsUI = (scores) => {
                const totalScores = scores.map(sc => parseFloat(sc.total) || 0).filter(v => v > 0);
                const avg = totalScores.length > 0 ? (totalScores.reduce((a, b) => a + b, 0) / totalScores.length).toFixed(1) : 0;
                const peak = totalScores.length > 0 ? Math.max(...totalScores) : 0;
                const fails = scores.filter(sc => (parseFloat(sc.total) || 0) < 40).length;

                const avgEl = document.getElementById('stat-class-avg');
                const peakEl = document.getElementById('stat-peak-perf');
                const failEl = document.getElementById('stat-fail-count');
                
                if (avgEl) avgEl.textContent = avg + '%';
                if (peakEl) peakEl.textContent = peak;
                if (failEl) failEl.textContent = fails;
            };

            if (!cls || !subId) {
                gradeBody.innerHTML = `<tr><td colspan="10" style="text-align:center; padding:3rem; color:var(--text-muted);">Please select a Stream and Course to begin grading</td></tr>`;
                return;
            }

            const activeSub = subjects.find(s => String(s.id) === String(subId));
            if (activeSub) {
                document.getElementById('active-subject-name').textContent = activeSub.name + ' in ' + cls;
            }

            // 1. Resilient student filtering (case-insensitive, trimmed)
            const targetStudents = students.filter(s => 
                s.class_name && String(s.class_name).trim().toLowerCase() === String(cls).trim().toLowerCase() &&
                s.is_active !== false
            );

            if (targetStudents.length === 0) {
                gradeBody.innerHTML = `<tr><td colspan="10" style="text-align:center; padding:3rem; color:var(--text-muted);">No students found in <strong>${cls}</strong>. Please check the Students module.</td></tr>`;
                return;
            }
            
            // 2. Broad Score Retrieval
            let rawScores = await db.scores.toArray();
            
            // 3. Resilient Multi-Level Filtering
            const filteredScores = rawScores.filter(sc => {
                const dbSubId = String(sc.subject_id || '').toLowerCase().trim();
                const filterSubId = String(subId).toLowerCase().trim();
                const subName = activeSub ? activeSub.name.toLowerCase().trim() : '';

                // Subject Match (ID or Name)
                const sMatch = dbSubId === filterSubId || dbSubId === subName;
                if (!sMatch) return false;

                // Session Match (Resilient partial)
                const dbSession = String(sc.session || '').toLowerCase().trim();
                const filterSession = String(session).toLowerCase().trim();
                const sesMatch = dbSession === filterSession || dbSession.includes(filterSession) || filterSession.includes(dbSession);
                if (!sesMatch) return false;

                // Term Match (Resilient partial)
                const dbTerm = String(sc.term || '').toLowerCase().trim();
                const filterTerm = String(term).toLowerCase().trim();
                
                // Normalizing 1st -> first, removing spaces
                const normalize = (t) => String(t || '').toLowerCase().replace(/\s+/g, '').replace('1st', 'first').replace('2nd', 'second').replace('3rd', 'third');
                const termMatch = normalize(dbTerm) === normalize(filterTerm) || normalize(dbTerm).includes(normalize(filterTerm)) || normalize(filterTerm).includes(normalize(dbTerm));
                
                return termMatch;
            });

            // 3.5 Visual Warning for mismatched data
            const mismatchWarning = document.getElementById('gradebook-mismatch-warning');
            if (mismatchWarning) {
                const subjectOnlyMatch = rawScores.filter(sc => 
                    String(sc.subject_id || '').toLowerCase().trim() === String(subId).toLowerCase().trim() ||
                    String(sc.subject_id || '').toLowerCase().trim() === (activeSub ? activeSub.name.toLowerCase().trim() : '')
                );
                
                if (filteredScores.length === 0 && subjectOnlyMatch.length > 0) {
                    const firstScore = subjectOnlyMatch[0];
                    mismatchWarning.innerHTML = `
                        <div style="background:#fff7ed; border:1px solid #ffedd5; color:#9a3412; padding:0.75rem; border-radius:8px; margin-bottom:1rem; display:flex; align-items:center; gap:0.5rem; font-size:0.85rem;">
                            <i data-lucide="alert-triangle" style="width:16px;"></i>
                            <span><strong>Note:</strong> Found ${subjectOnlyMatch.length} scores for this subject, but they match <strong>${firstScore.session || 'Unknown Session'}</strong> / <strong>${firstScore.term || 'Unknown Term'}</strong>. Please adjust your filters.</span>
                        </div>
                    `;
                    if (typeof lucide !== 'undefined') lucide.createIcons();
                    mismatchWarning.style.display = 'block';
                } else {
                    mismatchWarning.style.display = 'none';
                }
            }

            // 4. Sort by updated_at Descending (Most recent first)
            filteredScores.sort((a, b) => new Date(b.updated_at || 0) - new Date(a.updated_at || 0));

            // Update Statistics
            updateStatsUI(filteredScores);

            // Update Desktop Table
            gradeBody.innerHTML = targetStudents.map(s => {
                const score = filteredScores.find(sc => {
                    const scId = String(sc.student_id || '').trim().toLowerCase();
                    const sId = String(s.student_id || '').trim().toLowerCase();
                    return scId === sId || scId.includes(sId) || sId.includes(scId);
                });
                
                // Helper to check if a value is effectively null/empty
                const isN = (v) => v === null || v === undefined || v === '';
                
                const assignment = isN(score?.assignment) ? null : parseFloat(score.assignment);
                const test1 = isN(score?.test1) ? null : parseFloat(score.test1);
                const test2 = isN(score?.test2) ? null : parseFloat(score.test2);
                const project = isN(score?.project) ? null : parseFloat(score.project);
                const exam = isN(score?.exam) ? null : parseFloat(score.exam);

                const hasAny = ![assignment, test1, test2, project, exam].every(v => v === null);
                const ca = hasAny ? ((assignment || 0) + (test1 || 0) + (test2 || 0) + (project || 0)) : null;
                const total = hasAny ? ((ca || 0) + (exam || 0)) : null;
                
                return `
                    <tr data-student-id="${s.student_id}" data-student-row-id="${s.student_id}">
                        <td style="font-weight:600; padding:1rem;">${s.name}</td>
                        <td style="text-align:center;"><input type="number" class="score-input" data-field="assignment" value="${isN(score?.assignment) ? '' : score.assignment}" style="width:40px; text-align:center; border:1px solid #e2e8f0; border-radius:4px; padding:2px;"></td>
                        <td style="text-align:center;"><input type="number" class="score-input" data-field="test1" value="${isN(score?.test1) ? '' : score.test1}" style="width:40px; text-align:center; border:1px solid #e2e8f0; border-radius:4px; padding:2px;"></td>
                        <td style="text-align:center;"><input type="number" class="score-input" data-field="test2" value="${isN(score?.test2) ? '' : score.test2}" style="width:40px; text-align:center; border:1px solid #e2e8f0; border-radius:4px; padding:2px;"></td>
                        <td style="text-align:center;"><input type="number" class="score-input" data-field="project" value="${isN(score?.project) ? '' : score.project}" style="width:40px; text-align:center; border:1px solid #e2e8f0; border-radius:4px; padding:2px;"></td>
                        <td class="ca-cell" style="text-align:center; font-weight:700; color:#2563eb;">${isN(ca) ? '-' : ca}</td>
                        <td style="text-align:center;"><input type="number" class="score-input" data-field="exam" value="${isN(score?.exam) ? '' : score.exam}" style="width:50px; text-align:center; border:1px solid #e2e8f0; border-radius:4px; padding:2px; font-weight:700;"></td>
                        <td class="total-cell" style="text-align:center; font-weight:800; color:#15803d; background:#f0fdf4;">${isN(total) ? '-' : total}</td>
                        <td class="grade-cell" style="text-align:center; font-weight:700;">${isN(total) ? '-' : ScoringEngine.getGrade(total)}</td>
                        <td class="rnk-cell" style="text-align:center; font-weight:700; color:var(--text-muted);">${score?.rank || '-'}</td>
                    </tr>
                `;
            }).join('');

            // Update Mobile Cards
            const mobileContainer = document.getElementById('mobile-score-entry');
            if (mobileContainer) {
                mobileContainer.innerHTML = targetStudents.map(s => {
                    const score = filteredScores.find(sc => String(sc.student_id) === String(s.student_id));
                    
                    const isN = (v) => v === null || v === undefined || v === '';
                    const assignment = isN(score?.assignment) ? null : parseFloat(score.assignment);
                    const test1 = isN(score?.test1) ? null : parseFloat(score.test1);
                    const test2 = isN(score?.test2) ? null : parseFloat(score.test2);
                    const project = isN(score?.project) ? null : parseFloat(score.project);
                    const exam = isN(score?.exam) ? null : parseFloat(score.exam);

                    const hasAny = ![assignment, test1, test2, project, exam].every(v => v === null);
                    const ca = hasAny ? ((assignment || 0) + (test1 || 0) + (test2 || 0) + (project || 0)) : null;
                    const total = hasAny ? ((ca || 0) + (exam || 0)) : null;
                    
                    return `
                        <div class="score-card collapsed" data-student-row-id="${s.student_id}">
                            <div class="score-card-header" onclick="this.parentElement.classList.toggle('collapsed')">
                                <div class="score-card-title">${s.name}</div>
                                <div style="display:flex; align-items:center; gap:0.5rem;">
                                    <span class="badge" style="background:#f0fdf4; color:#15803d; font-weight:800; border-radius:6px; padding:2px 8px;">${isN(total) ? '-' : total}</span>
                                    <i data-lucide="chevron-down" style="width:16px;"></i>
                                </div>
                            </div>
                            <div class="score-card-content">
                                <div class="score-field"><label>Assignment</label><input type="number" class="score-input" data-field="assignment" value="${isN(score?.assignment) ? '' : score.assignment}"></div>
                                <div class="score-field"><label>Test 1</label><input type="number" class="score-input" data-field="test1" value="${isN(score?.test1) ? '' : score.test1}"></div>
                                <div class="score-field"><label>Test 2</label><input type="number" class="score-input" data-field="test2" value="${isN(score?.test2) ? '' : score.test2}"></div>
                                <div class="score-field"><label>Project</label><input type="number" class="score-input" data-field="project" value="${isN(score?.project) ? '' : score.project}"></div>
                                <div class="score-field"><label>Exam (60)</label><input type="number" class="score-input" data-field="exam" value="${isN(score?.exam) ? '' : score.exam}" style="border-color:#2563eb; background:#eff6ff;"></div>
                                <div class="score-field"><label>CA Score</label><div class="ca-cell" style="font-weight:700; color:#2563eb; padding:0.6rem;">${isN(ca) ? '-' : ca}</div></div>
                                <div class="score-field"><label>Grand Total</label><div class="total-cell" style="font-weight:800; color:#15803d; background:#f0fdf4; padding:0.6rem; border-radius:8px;">${isN(total) ? '-' : total}</div></div>
                                <div class="score-field"><label>Letter Grade</label><div class="grade-cell" style="font-weight:700; padding:0.6rem;">${isN(total) ? '-' : ScoringEngine.getGrade(total)}</div></div>
                                <div class="score-field"><label>Class Rank</label><div class="rnk-cell" style="font-weight:700; color:#64748b; padding:0.6rem;">${score?.rank || '-'}</div></div>
                            </div>
                        </div>
                    `;
                }).join('');
            }

            if (typeof lucide !== 'undefined') lucide.createIcons();

            // Inject Stats into Top Bar
            const topBarExtra = document.getElementById('top-bar-extra');
            const statsInject = document.getElementById('top-bar-stats-inject');
            if (topBarExtra && statsInject) {
                topBarExtra.innerHTML = statsInject.innerHTML;
            }

            // Global Real-time Listener (Attached ONCE to contentArea)
            this.contentArea.oninput = (e) => {
                if (!e.target.classList.contains('score-input')) return;
                
                const container = e.target.closest('[data-student-row-id]');
                if (!container) return;
                
                const studentId = container.dataset.studentRowId;
                if (!studentId) return;

                // 1. Force Limit Correction
                let rawVal = e.target.value.trim();
                let numVal = parseFloat(rawVal) || 0;
                const field = e.target.dataset.field;
                const limit = (field === 'exam') ? 60 : 10;

                if (numVal > limit) {
                    e.target.value = limit;
                    numVal = limit;
                }
                if (numVal < 0) {
                    e.target.value = 0;
                    numVal = 0;
                }

                // 2. Recalculate Totals
                const getVal = (c, f) => {
                    const v = c.querySelector(`[data-field="${f}"]`)?.value.trim();
                    return (v === '' || v === undefined) ? null : parseFloat(v);
                };

                const ass = getVal(container, 'assignment');
                const t1 = getVal(container, 'test1');
                const t2 = getVal(container, 'test2');
                const prj = getVal(container, 'project');
                const ex = getVal(container, 'exam');

                const hasAny = ![ass, t1, t2, prj, ex].every(v => v === null);
                const ca = hasAny ? ((ass || 0) + (t1 || 0) + (t2 || 0) + (prj || 0)) : null;
                const total = hasAny ? ((ca || 0) + (ex || 0)) : null;
                const grade = hasAny ? ScoringEngine.getGrade(total) : '-';

                // 3. Sync All Views
                const nodes = document.querySelectorAll(`[data-student-row-id="${studentId}"]`);
                nodes.forEach(node => {
                    const caCell = node.querySelector('.ca-cell');
                    const totalCell = node.querySelector('.total-cell');
                    const gradeCell = node.querySelector('.grade-cell');
                    const badge = node.querySelector('.score-card-header .badge');
                    
                    if (caCell) caCell.textContent = (ca === null) ? '-' : ca;
                    if (totalCell) totalCell.textContent = (total === null) ? '-' : total;
                    if (gradeCell) gradeCell.textContent = grade;
                    if (badge) badge.textContent = (total === null) ? '-' : total;
                    
                    const fieldInput = node.querySelector(`[data-field="${field}"]`);
                    if (fieldInput && fieldInput !== e.target) fieldInput.value = e.target.value;
                });

                // 4. Update Header Stats
                const allTotals = Array.from(document.querySelectorAll('.desktop-only .total-cell'))
                    .map(el => el.textContent.trim())
                    .filter(v => v !== '-')
                    .map(v => parseFloat(v) || 0);
                
                updateStatsUI(allTotals.map(t => ({ total: t })));
            };

            // Refresh initial stats
            updateStatsUI(filteredScores);
        };

        classFilter.addEventListener('change', async (e) => {
            const cls = e.target.value;
            if (!cls) {
                subjectFilter.innerHTML = '<option value="">Select Stream First</option>';
                gradeBody.innerHTML = `<tr><td colspan="10" style="text-align:center; padding:3rem; color:var(--text-muted);">Please select a Stream and Course to begin grading</td></tr>`;
                return;
            }
            
            // Dynamically load subjects assigned to this specific class
            let assignments = await db.subject_assignments.where('class_name').equals(cls).toArray();
            if (isTeacher) {
                assignments = assignments.filter(a => a.teacher_id === teacherId);
            }
            const assignedIds = new Set(assignments.map(a => a.subject_id));
            const availableSubjects = subjects.filter(s => assignedIds.has(s.id));
            
            if (availableSubjects.length > 0) {
                subjectFilter.innerHTML = availableSubjects.map(s => `<option value="${s.id}">${s.name}</option>`).join('');
                loadAcademicLedger(); // Auto-load first subject
            } else {
                subjectFilter.innerHTML = '<option value="">No Courses Assigned</option>';
                gradeBody.innerHTML = `<tr><td colspan="10" style="text-align:center; padding:3rem; color:var(--text-muted);">No courses have been assigned to ${cls} yet</td></tr>`;
            }
        });

        [subjectFilter, termFilter, sessionFilter].forEach(f => f.addEventListener('change', loadAcademicLedger));

        // Action Listeners
        const btnSync = document.getElementById('btn-sync-ledger');
        if (btnSync) {
            btnSync.addEventListener('click', async () => {
                const icon = btnSync.querySelector('i');
                if (icon) icon.classList.add('spinning');
                Notifications.show('Deep syncing scores...', 'info');
                try {
                    await syncFromCloud(true);
                    await loadAcademicLedger();
                    Notifications.show('Scores refreshed!', 'success');
                } catch (e) {
                    Notifications.show(`Sync failed: ${e.message || e}`, 'error');
                } finally {
                    if (icon) icon.classList.remove('spinning');
                }
            });
        }

        // Mobile Action Mappings
        const mobileSync = document.getElementById('mobile-btn-sync');
        if (mobileSync) mobileSync.addEventListener('click', () => btnSync.click());

        const mobilePrint = document.getElementById('mobile-btn-print');
        if (mobilePrint) mobilePrint.addEventListener('click', () => document.getElementById('btn-print-empty').click());

        const mobileCommit = document.getElementById('mobile-btn-commit');
        if (mobileCommit) mobileCommit.addEventListener('click', () => document.getElementById('btn-commit-grades').click());

        // Initial Load Trigger
        if (classFilter.value) {
            classFilter.dispatchEvent(new Event('change'));
        } else {
            loadAcademicLedger();
        }

        document.getElementById('btn-commit-grades').addEventListener('click', async () => {
            const rows = document.querySelectorAll('#grade-entry-body tr[data-student-id]');
            const subId = subjectFilter.value;
            const term = termFilter.value;
            const session = sessionFilter.value;

            if (!subId) return Notifications.show('Select a course first', 'error');

            Notifications.show('Committing grades to ledger...', 'info');

            // Collect all data first to calculate final rankings
            const entries = [];
            for (const row of rows) {
                const studentId = row.dataset.studentId;
                const getVal = (f) => {
                    const v = row.querySelector(`[data-field="${f}"]`).value.trim();
                    return v === '' ? null : parseFloat(v);
                };

                const assignment = getVal('assignment');
                const test1 = getVal('test1');
                const test2 = getVal('test2');
                const project = getVal('project');
                const exam = getVal('exam');

                // A student has a record only if at least one field is not null
                const hasScore = [assignment, test1, test2, project, exam].some(v => v !== null);
                
                if (hasScore) {
                    const ca = (assignment || 0) + (test1 || 0) + (test2 || 0) + (project || 0);
                    const total = ca + (exam || 0);
                    entries.push({
                        studentId, assignment, test1, test2, project, ca, exam, total, hasScore: true
                    });
                }
            }

            // Calculate Rankings (Only for students with scores)
            entries.sort((a, b) => b.total - a.total);
            let currentRank = 1;
            for (let i = 0; i < entries.length; i++) {
                if (i > 0 && entries[i].total < entries[i - 1].total) currentRank = i + 1;
                entries[i].rankValue = ScoringEngine.getOrdinal(currentRank);
            }

            for (const entry of entries) {
                await db.scores.put(prepareForSync({
                    id: `${entry.studentId}_${subId}_${term}_${session}`,
                    student_id: entry.studentId,
                    subject_id: subId,
                    term, session,
                    assignment: entry.assignment, 
                    test1: entry.test1, 
                    test2: entry.test2, 
                    project: entry.project, 
                    ca: entry.ca, 
                    exam: entry.exam, 
                    total: entry.total,
                    rank: entry.rankValue,
                    grade: ScoringEngine.getGrade(entry.total),
                    updated_at: new Date().toISOString()
                }));
            }

            syncToCloud();
            Notifications.show('Ledger committed and syncing!', 'success');
            loadAcademicLedger(); // Refresh to show ranks
        });

        // Professional Print Empty Sheet Module
        document.getElementById('btn-print-empty').addEventListener('click', async () => {
            const cls = classFilter.value;
            const subId = subjectFilter.value;
            const term = termFilter.value;
            const session = sessionFilter.value;

            if (!cls || !subId) return Notifications.show('Select Stream and Course first', 'warning');

            const activeSub = subjects.find(s => String(s.id) === String(subId));
            const targetStudents = students.filter(s => s.class_name && s.class_name.trim().toLowerCase() === cls.trim().toLowerCase());
            const schoolName = "TAMADU HIGH SCHOOL"; 
            const generatedDate = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }).format(new Date());

            let printHTML = `
                <html>
                <head>
                    <title>CA Score Sheet - ${cls}</title>
                    <style>
                        @page { size: portrait; margin: 12mm; }
                        body { margin: 0; padding: 0; font-family: 'Inter', sans-serif; color: #000 !important; background: #fff !important; line-height: 1.2; }
                        .print-container { width: 100%; }
                        .header-row { text-align: center; padding: 10px 0; }
                        .school-name { font-size: 1.5rem; font-weight: 800; text-transform: uppercase; margin-bottom: 2px; }
                        .doc-title { font-size: 1.1rem; font-weight: 700; border-bottom: 2px solid #000; display: inline-block; padding-bottom: 2px; margin-bottom: 10px; }
                        
                        .metadata-table { width: 100%; border: 1px solid #000; margin-bottom: 10px; font-size: 0.9rem; border-collapse: collapse; }
                        .metadata-table td { border: 1px solid #000; padding: 6px 10px; }
                        .meta-label { font-weight: 600; color: #444; width: 15%; }
                        .meta-val { font-weight: 800; }
                        
                        table.main-data { width: 100%; border-collapse: collapse; font-size: 0.85rem; }
                        table.main-data th, table.main-data td { border: 1px solid #000; padding: 7px 10px; text-align: left; }
                        table.main-data th { background: #f1f5f9 !important; -webkit-print-color-adjust: exact; font-weight: 800; text-transform: uppercase; font-size: 0.75rem; }
                        
                        tr { page-break-inside: avoid; }
                        thead { display: table-header-group; }
                        tfoot { display: table-footer-group; }
                        
                        .footer-info { display: flex; justify-content: space-between; font-size: 0.7rem; padding-top: 10px; margin-top: 10px; border-top: 1px dotted #000; }
                        .col-sn { width: 40px; text-align: center !important; }
                        .col-score { width: 60px; text-align: center !important; }
                    </style>
                </head>
                <body>
                    <div class="print-container">
                        <table class="main-data">
                            <thead>
                                <tr>
                                    <th colspan="7" style="background:white !important; border:none; padding:0;">
                                        <div class="header-row">
                                            <div class="school-name">${schoolName}</div>
                                            <div class="doc-title">CONTINUOUS ASSESSMENT SCORE SHEET</div>
                                        </div>
                                        <table class="metadata-table">
                                            <tr>
                                                <td class="meta-label">STREAM:</td><td class="meta-val">${cls}</td>
                                                <td class="meta-label">COURSE:</td><td class="meta-val">${activeSub.name}</td>
                                                <td class="meta-label">SESSION:</td><td class="meta-val">${session}</td>
                                            </tr>
                                            <tr>
                                                <td class="meta-label">TERM:</td><td class="meta-val">${term}</td>
                                                <td class="meta-label">TEACHER:</td><td class="meta-val" colspan="3">________________________________________</td>
                                            </tr>
                                        </table>
                                    </th>
                                </tr>
                                <tr>
                                    <th class="col-sn">S/N</th>
                                    <th>STUDENT NAME</th>
                                    <th class="col-score">ASS (10)</th>
                                    <th class="col-score">TEST 1 (10)</th>
                                    <th class="col-score">TEST 2 (10)</th>
                                    <th class="col-score">PRJ (10)</th>
                                    <th class="col-score">EXAM (60)</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${targetStudents.map((s, idx) => `
                                    <tr>
                                        <td class="col-sn">${idx + 1}</td>
                                        <td style="font-weight:600;">${s.name}</td>
                                        <td></td><td></td><td></td><td></td><td></td>
                                    </tr>
                                `).join('')}
                                ${Array(10).fill(0).map((_, idx) => `
                                    <tr>
                                        <td class="col-sn">${targetStudents.length + idx + 1}</td>
                                        <td></td><td></td><td></td><td></td><td></td><td></td>
                                    </tr>
                                `).join('')}
                            </tbody>
                            <tfoot>
                                <tr>
                                    <td colspan="7" style="border:none; padding:0;">
                                        <div class="footer-info">
                                            <div>Course: ${activeSub.name} | Printed from Graviton LMS</div>
                                            <div>Date Generated: ${generatedDate}</div>
                                        </div>
                                    </td>
                                </tr>
                            </tfoot>
                        </table>
                    </div>
                </body>
                </html>
            `;


            printHTML += `</body></html>`;
            const win = window.open('', '_blank');
            win.document.write(printHTML);
            win.document.close();
            win.onload = () => { setTimeout(() => { win.print(); }, 500); };
        });
    },

    async renderAcademic() {
        const classes = (await db.classes.toArray()).sort((a,b) => (a.name || '').localeCompare(b.name || ''));
        const subjects = (await db.subjects.toArray()).sort((a,b) => (a.name || '').localeCompare(b.name || ''));
        const assignments = await db.subject_assignments.toArray();
        const profiles = await db.profiles.toArray();
        
        this.contentArea.innerHTML = `
            <div class="view-container" style="padding: 0.75rem;">
                <div class="page-banner" style="background: linear-gradient(135deg, #1e293b 0%, #0f172a 100%); padding: 1rem; min-height: auto; margin-bottom: 0.75rem; display: flex; flex-direction: column; gap: 0.75rem;">
                    <div class="banner-content">
                        <h1 class="banner-title" style="font-size: 1.15rem; margin-bottom: 0.25rem;"><i data-lucide="settings-2"></i> Academic Setup</h1>
                        <p class="banner-subtitle" style="font-size: 0.75rem; opacity: 0.8;">Configure classes and subject curriculum.</p>
                    </div>
                    <div class="banner-actions" style="display: flex; gap: 0.5rem; flex-wrap: wrap;">
                        <button id="add-class-btn" class="btn btn-primary" style="background: white; color: #1e293b; border: none; border-radius: 8px; padding: 0.5rem 1rem; font-weight: 700; font-size: 0.75rem; display: flex; align-items: center; gap: 0.4rem;">
                            <i data-lucide="plus-circle" style="width: 14px;"></i> New Stream
                        </button>
                        <button id="add-subject-btn" class="btn btn-secondary" style="background: rgba(255,255,255,0.1); color: white; border: 1px solid rgba(255,255,255,0.2); border-radius: 8px; padding: 0.5rem 1rem; font-weight: 700; font-size: 0.75rem; display: flex; align-items: center; gap: 0.4rem;">
                            <i data-lucide="book-plus" style="width: 14px;"></i> Register Course
                        </button>
                    </div>
                </div>
                
                <div class="tabs mb-1" style="display: flex; gap: 0.5rem; overflow-x: auto; padding-bottom: 4px;">
                    <button class="tab-btn active" data-tab="classes" style="padding: 0.4rem 0.75rem; font-size: 0.8rem; border-radius: 8px;">Classes</button>
                    <button class="tab-btn" data-tab="subjects" style="padding: 0.4rem 0.75rem; font-size: 0.8rem; border-radius: 8px;">Subjects</button>
                    <button class="tab-btn" data-tab="assignments" style="padding: 0.4rem 0.75rem; font-size: 0.8rem; border-radius: 8px;">Assignments</button>
                </div>
                
                <div id="tab-content" class="card" style="border-radius: 12px; padding: 1rem; flex: 1; overflow-y: auto;">
                    <!-- Stats Injector (Hidden but used by JS) -->
            <div id="top-bar-stats-inject" style="display:none;">
                <div style="display:flex; align-items:center; gap:2rem; background:rgba(37,99,235,0.05); padding:0.5rem 1.5rem; border-radius:100px; border:1px solid rgba(37,99,235,0.1);">
                    <div style="display:flex; align-items:center; gap:0.5rem;">
                        <span style="font-size:0.75rem; font-weight:700; color:#64748b; text-transform:uppercase;">Class Average</span>
                        <span id="stat-class-avg" style="font-size:1.1rem; font-weight:800; color:#2563eb;">0%</span>
                    </div>
                    <div style="width:1px; height:20px; background:#e2e8f0;"></div>
                    <div style="display:flex; align-items:center; gap:0.5rem;">
                        <span style="font-size:0.75rem; font-weight:700; color:#64748b; text-transform:uppercase;">Peak Perf.</span>
                        <span id="stat-peak-perf" style="font-size:1.1rem; font-weight:800; color:#15803d;">0</span>
                    </div>
                    <div style="width:1px; height:20px; background:#e2e8f0;"></div>
                    <div style="display:flex; align-items:center; gap:0.5rem;">
                        <span style="font-size:0.75rem; font-weight:700; color:#64748b; text-transform:uppercase;">Below 40%</span>
                        <span id="stat-fail-count" style="font-size:1.1rem; font-weight:800; color:#ef4444;">0</span>
                    </div>
                </div>
            </div>
<!-- Tab content will be rendered here -->
                </div>
            </div>
        `;

        const renderTab = async (tab) => {
            const container = document.getElementById('tab-content');
            if (!container) return;
            
            document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
            const activeBtn = document.querySelector(`.tab-btn[data-tab="${tab}"]`);
            if (activeBtn) activeBtn.classList.add('active');

            if (tab === 'classes') {
                container.innerHTML = `
                    <table class="data-table">
                        <thead><tr><th>Stream Name</th><th>Level</th><th>Action</th></tr></thead>
                        <tbody>${classes.map(c => `<tr>
                            <td style="font-weight:700; color:var(--text-primary);">${c.name}</td>
                            <td>${c.level}</td>
                            <td>
                                <div style="display:flex; gap:1rem;">
                                    <i data-lucide="edit-2" class="edit-class" data-id="${c.id}" style="color:var(--accent-primary); cursor:pointer; width:18px;"></i>
                                    <i data-lucide="trash-2" class="delete-class" data-id="${c.id}" style="color:var(--accent-danger); cursor:pointer; width:18px;"></i>
                                </div>
                            </td>
                        </tr>`).join('')}</tbody>
                    </table>
                `;
            } else if (tab === 'subjects') {
                container.innerHTML = `
                    <table class="data-table">
                        <thead><tr><th>Course Name</th><th>Type</th><th>Credits</th><th>Action</th></tr></thead>
                        <tbody>${subjects.map(s => `<tr>
                            <td style="font-weight:700; color:var(--text-primary); font-size:1rem;">${s.name}</td>
                            <td style="color:var(--text-secondary);">${s.type}</td>
                            <td>${s.credits}</td>
                            <td>
                                <div style="display:flex; gap:1rem;">
                                    <i data-lucide="edit-2" class="edit-subject" data-id="${s.id}" style="color:var(--accent-primary); cursor:pointer; width:18px;"></i>
                                    <i data-lucide="trash-2" class="delete-sub" data-id="${s.id}" style="color:var(--accent-danger); cursor:pointer; width:18px;"></i>
                                </div>
                            </td>
                        </tr>`).join('')}</tbody>
                    </table>
                `;
            } else if (tab === 'assignments') {
                const sortedAssignments = [...assignments].sort((a,b) => (a.class_name || '').localeCompare(b.class_name || ''));
                container.innerHTML = `
                    <table class="data-table">
                        <thead><tr><th>Stream</th><th>Course</th><th>Teacher</th><th>Action</th></tr></thead>
                        <tbody>${sortedAssignments.map(a => {
                            const sub = subjects.find(s => s.id === a.subject_id);
                            const teacher = profiles.find(p => p.id === a.teacher_id);
                            return `<tr>
                                <td style="font-weight:700;">${a.class_name}</td>
                                <td>${sub ? sub.name : 'Unknown'}</td>
                                <td>${teacher ? teacher.full_name : 'Unassigned'}</td>
                                <td><i data-lucide="trash-2" class="delete-assignment" data-id="${a.id}" style="color:var(--accent-danger); cursor:pointer; width:18px;"></i></td>
                            </tr>`;
                        }).join('')}</tbody>
                    </table>
                `;
            }
            
            // Add FAB for Mobile
            const fab = document.createElement('div');
            fab.className = 'fab-container';
            fab.innerHTML = `
                <button class="fab" onclick="document.getElementById('add-class-btn').click()"><i data-lucide="plus"></i></button>
                <button class="fab" style="background:#4338ca;" onclick="document.getElementById('add-subject-btn').click()"><i data-lucide="book"></i></button>
            `;
            container.appendChild(fab);
            
            if (typeof lucide !== 'undefined') lucide.createIcons();
            this.attachAcademicListeners();
        };

        // Re-attach Banner Button Listeners
        const addClassBtn = document.getElementById('add-class-btn');
        if (addClassBtn) {
            addClassBtn.onclick = () => {
                const modalHtml = `
                    <div style="display: flex; flex-direction: column; gap: 1rem;">
                        <div>
                            <label>Stream Name (e.g. JSS 1A)</label>
                            <input type="text" id="cls-name" class="input" style="width: 100%;">
                        </div>
                        <div>
                            <label>Level/Category</label>
                            <input type="text" id="cls-level" class="input" style="width: 100%;" placeholder="e.g. Junior Secondary">
                        </div>
                    </div>
                `;
                this.showModal('Add New Stream', modalHtml, async () => {
                    const name = document.getElementById('cls-name').value.trim();
                    const level = document.getElementById('cls-level').value.trim();
                    if (!name) return;
                    await db.classes.add(prepareForSync({ id: `CLS${Math.random().toString(36).substr(2,6).toUpperCase()}`, name, level }));
                    syncToCloud();
                    this.renderAcademic();
                }, 'Add Stream');
            };
        }

        const addSubBtn = document.getElementById('add-subject-btn');
        if (addSubBtn) {
            addSubBtn.onclick = () => {
                const modalHtml = `
                    <div style="display: flex; flex-direction: column; gap: 1rem;">
                        <div>
                            <label>Course Title</label>
                            <input type="text" id="sub-name" class="input" style="width: 100%;">
                        </div>
                        <div>
                            <label>Course Type</label>
                            <select id="sub-type" class="input" style="width: 100%;">
                                <option value="Core">Core</option>
                                <option value="Elective">Elective</option>
                            </select>
                        </div>
                    </div>
                `;
                this.showModal('Register Course', modalHtml, async () => {
                    const name = document.getElementById('sub-name').value.trim();
                    const type = document.getElementById('sub-type').value;
                    if (!name) return;
                    await db.subjects.add(prepareForSync({ id: `SUB${Math.random().toString(36).substr(2,6).toUpperCase()}`, name, type, credits: 1 }));
                    syncToCloud();
                    this.renderAcademic();
                }, 'Register Course');
            };
        }

        document.querySelectorAll('.tab-btn').forEach(btn => btn.onclick = () => renderTab(btn.dataset.tab));
        renderTab('classes');
    },

    attachAcademicListeners() {
        document.querySelectorAll('.edit-subject').forEach(icon => {
            icon.onclick = async (e) => {
                const id = e.target.closest('i').dataset.id;
                const sub = await db.subjects.get(id);
                if (!sub) return;

                const modalHtml = `
                    <div style="display: flex; flex-direction: column; gap: 1rem;">
                        <div>
                            <label style="font-weight:700; color:var(--text-primary);">Course Title</label>
                            <input type="text" id="edit-sub-name" class="input" style="width: 100%;" value="${sub.name}">
                        </div>
                        <div>
                            <label style="font-weight:700; color:var(--text-primary);">Course Type</label>
                            <select id="edit-sub-type" class="input" style="width: 100%;">
                                <option value="Core" ${sub.type === 'Core' ? 'selected' : ''}>Core</option>
                                <option value="Elective" ${sub.type === 'Elective' ? 'selected' : ''}>Elective</option>
                            </select>
                        </div>
                    </div>
                `;
                this.showModal('Modify Course', modalHtml, async () => {
                    const name = document.getElementById('edit-sub-name').value.trim();
                    const type = document.getElementById('edit-sub-type').value;
                    if (!name) return;
                    await db.subjects.update(id, prepareForSync({ name, type }));
                    syncToCloud();
                    this.renderAcademic();
                }, 'Update Course');
            };
        });

        document.querySelectorAll('.edit-class').forEach(icon => {
            icon.onclick = async (e) => {
                const id = e.target.closest('i').dataset.id;
                const cls = await db.classes.get(id);
                if (!cls) return;

                const modalHtml = `
                    <div style="display: flex; flex-direction: column; gap: 1rem;">
                        <div>
                            <label style="font-weight:700; color:var(--text-primary);">Stream Name</label>
                            <input type="text" id="edit-cls-name" class="input" style="width: 100%;" value="${cls.name}">
                        </div>
                        <div>
                            <label style="font-weight:700; color:var(--text-primary);">Level/Category</label>
                            <input type="text" id="edit-cls-level" class="input" style="width: 100%;" value="${cls.level}">
                        </div>
                    </div>
                `;
                this.showModal('Modify Stream', modalHtml, async () => {
                    const name = document.getElementById('edit-cls-name').value.trim();
                    const level = document.getElementById('edit-cls-level').value.trim();
                    if (!name) return;
                    await db.classes.update(id, prepareForSync({ name, level }));
                    syncToCloud();
                    this.renderAcademic();
                }, 'Update Stream');
            };
        });
    },

    async renderAttendance() {
        const isTeacher = (this.currentUser.role || '').toLowerCase() === 'teacher';
        const teacherId = this.currentUser.id;
        
        let students = (await db.students.toArray()).sort((a,b) => (a.name || '').localeCompare(b.name || ''));
        let classes = (await db.classes.toArray()).sort((a,b) => (a.name || '').localeCompare(b.name || ''));
        let subjects = (await db.subjects.toArray()).sort((a,b) => (a.name || '').localeCompare(b.name || ''));
        
        if (isTeacher) {
            const assignments = await db.subject_assignments.where('teacher_id').equals(teacherId).toArray();
            const assignedClassNames = [...new Set(assignments.map(a => a.class_name))];
            classes = classes.filter(c => assignedClassNames.includes(c.name));
            
            const assignedSubjectIds = [...new Set(assignments.map(a => a.subject_id))];
            subjects = subjects.filter(s => assignedSubjectIds.includes(s.id));
        }
        
        this.contentArea.innerHTML = `
            <div class="view-container">
                <div class="page-banner" style="background: linear-gradient(135deg, #0f172a 0%, #1e293b 100%);">
                    <div class="banner-content">
                        <h1 class="banner-title"><i data-lucide="check-circle"></i> Daily Attendance</h1>
                        <p class="banner-subtitle">Track and manage daily presence across all academic levels.</p>
                    </div>
                </div>

                <div class="card" style="border-radius: 12px; padding: 1rem;">
                    <div class="actions-bar mb-1" style="display: flex; gap: 1rem; flex-wrap: wrap;">
                        <select id="attendance-class-filter" class="input" style="height: 40px;">
                            <option value="">Select Stream</option>
                            ${classes.map(c => `<option value="${c.name}">${c.name}</option>`).join('')}
                        </select>
                        <select id="attendance-subject-filter" class="input" style="height: 40px;">
                            <option value="">Select Course</option>
                        </select>
                        <input type="date" id="attendance-date" class="input" value="${new Date().toISOString().split('T')[0]}" style="height: 40px;">
                        <button id="btn-save-attendance" class="btn btn-primary" style="height: 40px; border-radius: 10px;">Save Attendance</button>
                    </div>
                    
                    <div class="table-container" style="max-height: calc(100vh - 350px); overflow-y: auto;">
                        <table class="data-table">
                            <thead><tr><th>ID</th><th>Student Name</th><th>Status</th></tr></thead>
                            <tbody id="attendance-list-body">
                                <tr><td colspan="3" class="text-center p-4">Select a class and course to start tracking</td></tr>
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        `;
        
        if (typeof lucide !== 'undefined') lucide.createIcons();

        const classFilter = document.getElementById('attendance-class-filter');
        const subFilter = document.getElementById('attendance-subject-filter');
        const listBody = document.getElementById('attendance-list-body');

        classFilter.onchange = async () => {
            const cls = classFilter.value;
            if (!cls) {
                subFilter.innerHTML = '<option value="">Select Course</option>';
                return;
            }
            
            let assignments = await db.subject_assignments.where('class_name').equals(cls).toArray();
            if (isTeacher) assignments = assignments.filter(a => a.teacher_id === teacherId);
            
            const assignedIds = new Set(assignments.map(a => a.subject_id));
            const availableSubs = subjects.filter(s => assignedIds.has(s.id));
            
            subFilter.innerHTML = '<option value="">Select Course</option>' + 
                availableSubs.map(s => `<option value="${s.id}">${s.name}</option>`).join('');
            
            if (availableSubs.length > 0) {
                subFilter.value = availableSubs[0].id;
                subFilter.dispatchEvent(new Event('change'));
            }
        };

        subFilter.onchange = async () => {
            const cls = classFilter.value;
            if (!cls) return;
            
            const targetStudents = students.filter(s => s.class_name === cls && s.is_active !== false);
            listBody.innerHTML = targetStudents.map(s => `
                <tr>
                    <td>${s.student_id}</td>
                    <td>${s.name}</td>
                    <td>
                        <select class="input attendance-status" data-student-id="${s.student_id}">
                            <option value="Present">Present</option>
                            <option value="Absent">Absent</option>
                            <option value="Late">Late</option>
                        </select>
                    </td>
                </tr>
            `).join('');
        };
        
        document.getElementById('btn-save-attendance').onclick = async () => {
            const cls = classFilter.value;
            const subId = subFilter.value;
            const date = document.getElementById('attendance-date').value;
            
            if (!cls || !subId || !date) {
                Notifications.show('Please select class, course and date', 'warning');
                return;
            }
            
            const statuses = document.querySelectorAll('.attendance-status');
            const attendanceRecords = Array.from(statuses).map(sel => ({
    async renderAttendance() {
        const students = await db.students.filter(s => s.is_active !== false).toArray();
        const classes = await db.classes.toArray();
        const subjects = await db.subjects.toArray();
        const role = (this.currentUser.role || '').toLowerCase();
        const isTeacher = role === 'teacher';
        
        // Initial State
        const today = new Date().toISOString().split('T')[0];
        
        this.contentArea.innerHTML = `
            <div class="view-container animate-fade-in">
                <!-- Premium Header Section -->
                <header class="view-header" style="margin-bottom: 1.5rem; display: flex; justify-content: space-between; align-items: flex-end;">
                    <div>
                        <h1 class="text-3xl font-extrabold tracking-tight" style="font-family: 'Outfit', sans-serif;">Attendance Intelligence</h1>
                        <p class="text-secondary">Monitor school-wide turnout and track subject-specific participation.</p>
                    </div>
                    <div style="display: flex; gap: 0.75rem;">
                        <button id="btn-sync-attendance" class="btn btn-secondary" style="border-radius: 12px; height: 48px;">
                            <i data-lucide="refresh-cw"></i> Sync Data
                        </button>
                    </div>
                </header>

                <!-- Analytics Bar -->
                <div class="stats-grid mb-2" style="grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));">
                    <div class="stat-card-premium" style="background: linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%); color: white; border: none;">
                        <span style="font-size: 0.7rem; font-weight: 800; opacity: 0.8; text-transform: uppercase; letter-spacing: 0.05em;">Today's Turnout</span>
                        <div style="font-size: 2rem; font-weight: 900; margin-top: 0.5rem;" id="stat-turnout">0%</div>
                        <div class="progress-mini" style="background: rgba(255,255,255,0.2); height: 4px; border-radius: 2px; margin-top: 0.75rem;">
                            <div id="stat-turnout-bar" style="width: 0%; height: 100%; background: white; border-radius: 2px; transition: width 1s ease;"></div>
                        </div>
                    </div>
                    <div class="stat-card-premium">
                        <span style="font-size: 0.7rem; font-weight: 800; color: #64748b; text-transform: uppercase;">Present Now</span>
                        <div style="font-size: 2rem; font-weight: 900; margin-top: 0.5rem; color: #1e293b;" id="stat-present">0</div>
                        <i data-lucide="user-check" style="position: absolute; right: 1.5rem; bottom: 1.5rem; color: #e2e8f0; width: 40px; height: 40px;"></i>
                    </div>
                    <div class="stat-card-premium">
                        <span style="font-size: 0.7rem; font-weight: 800; color: #64748b; text-transform: uppercase;">Late Arrivals</span>
                        <div style="font-size: 2rem; font-weight: 900; margin-top: 0.5rem; color: #f59e0b;" id="stat-late">0</div>
                        <i data-lucide="clock" style="position: absolute; right: 1.5rem; bottom: 1.5rem; color: #fef3c7; width: 40px; height: 40px;"></i>
                    </div>
                </div>

                <!-- Main Control Panel -->
                <div class="card" style="border-radius: 24px; padding: 0; overflow: hidden; border: 1px solid #f1f5f9; box-shadow: var(--shadow-lg);">
                    <div class="card-tabs" style="display: flex; background: #f8fafc; border-bottom: 1px solid #f1f5f9;">
                        <button class="att-tab-btn active" data-tab="school" style="flex: 1; padding: 1.25rem; border: none; background: none; font-weight: 700; cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 0.75rem; transition: all 0.2s;">
                            <i data-lucide="building-2"></i> School Arrival
                        </button>
                        <button class="att-tab-btn" data-tab="subject" style="flex: 1; padding: 1.25rem; border: none; background: none; font-weight: 700; cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 0.75rem; transition: all 0.2s; color: #94a3b8;">
                            <i data-lucide="book-marked"></i> Subject Periods
                        </button>
                    </div>

                    <div style="padding: 1.5rem;">
                        <!-- Filters -->
                        <div style="display: flex; gap: 1rem; margin-bottom: 1.5rem; flex-wrap: wrap;">
                            <div style="flex: 1; min-width: 200px;">
                                <label style="font-size: 0.65rem; font-weight: 800; color: #94a3b8; text-transform: uppercase; margin-bottom: 0.5rem; display: block;">Select Stream</label>
                                <select id="att-class-filter" class="input" style="width: 100%; height: 48px; border-radius: 12px; background: #f8fafc;">
                                    <option value="">All Classes</option>
                                    ${classes.map(c => `<option value="${c.name}">${c.name}</option>`).join('')}
                                </select>
                            </div>
                            <div id="subject-filter-container" style="flex: 1; min-width: 200px; display: none;">
                                <label style="font-size: 0.65rem; font-weight: 800; color: #94a3b8; text-transform: uppercase; margin-bottom: 0.5rem; display: block;">Target Subject</label>
                                <select id="att-subject-filter" class="input" style="width: 100%; height: 48px; border-radius: 12px; background: #f8fafc;">
                                    <option value="">Select Subject...</option>
                                    ${subjects.map(s => `<option value="${s.name}">${s.name}</option>`).join('')}
                                </select>
                            </div>
                            <div style="width: 180px;">
                                <label style="font-size: 0.65rem; font-weight: 800; color: #94a3b8; text-transform: uppercase; margin-bottom: 0.5rem; display: block;">Date</label>
                                <input type="date" id="att-date" class="input" value="${today}" style="width: 100%; height: 48px; border-radius: 12px; background: #f8fafc;">
                            </div>
                        </div>

                        <!-- Search and Actions -->
                        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem;">
                            <div style="position: relative; width: 300px;">
                                <i data-lucide="search" style="position: absolute; left: 1rem; top: 50%; transform: translateY(-50%); color: #94a3b8; width: 18px;"></i>
                                <input type="text" id="att-search" placeholder="Search student name..." class="input" style="padding-left: 2.75rem; width: 100%; height: 44px; border-radius: 10px; font-size: 0.85rem;">
                            </div>
                            <div id="subject-actions" style="display: none;">
                                <button id="btn-save-subject-att" class="btn btn-primary" style="background: #10b981; border-radius: 10px; height: 44px; padding: 0 1.5rem;">
                                    <i data-lucide="save"></i> Commit Subject Attendance
                                </button>
                            </div>
                        </div>

                        <!-- Data Table -->
                        <div class="table-container" style="border: 1px solid #f1f5f9; border-radius: 16px;">
                            <table class="data-table">
                                <thead style="background: #f8fafc;">
                                    <tr>
                                        <th style="width: 60px;">ID</th>
                                        <th>Student Name</th>
                                        <th>Class</th>
                                        <th style="text-align: center;">Status</th>
                                        <th id="th-time" style="text-align: right;">Time Log</th>
                                    </tr>
                                </thead>
                                <tbody id="attendance-list-body">
                                    <!-- Dynamic rows -->
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            </div>
        `;

        if (typeof lucide !== 'undefined') lucide.createIcons();

        // Register Internal Event Listeners
        this.initAttendanceLogic(students);

        // Sync Data Button
        const btnSyncAtt = document.getElementById('btn-sync-attendance');
        if (btnSyncAtt) {
            btnSyncAtt.onclick = async () => {
                const icon = btnSyncAtt.querySelector('i');
                if (icon) icon.classList.add('spinning');
                Notifications.show('Pulling latest attendance from cloud...', 'info');
                try {
                    await syncFromCloud(true);
                    await this.renderAttendance(); // Refresh UI
                    Notifications.show('Attendance data refreshed!', 'success');
                } catch (e) {
                    Notifications.show(`Sync failed: ${e.message || e}`, 'error');
                } finally {
                    if (icon) icon.classList.remove('spinning');
                }
            };
        }
    },

    initAttendanceLogic(students) {
        const tabBtns = document.querySelectorAll('.att-tab-btn');
        const classFilter = document.getElementById('att-class-filter');
        const subjectFilter = document.getElementById('att-subject-filter');
        const subjectContainer = document.getElementById('subject-filter-container');
        const dateInput = document.getElementById('att-date');
        const searchInput = document.getElementById('att-search');
        const listBody = document.getElementById('attendance-list-body');
        const subjectActions = document.getElementById('subject-actions');
        const thTime = document.getElementById('th-time');

        let currentTab = 'school';

        const refreshList = async () => {
            const date = dateInput.value;
            const cls = classFilter.value;
            const search = searchInput.value.toLowerCase();
            const subjectName = subjectFilter.value;

            // Load records
            const records = await db.attendance_records
                .where('date').equals(date)
                .toArray();

            let filteredStudents = students;
            
            // 1. Basic Class Filter
            if (cls) filteredStudents = filteredStudents.filter(s => s.class_name === cls);
            
            // 2. SMART FILTER: Specialization for SSS 2 & 3
            if (currentTab === 'subject' && subjectName && (cls === 'SSS 2' || cls === 'SSS 3')) {
                // Find the specialization for this subject assignment
                const assignments = await db.subject_assignments.where('class_name').equals(cls).toArray();
                const subjects = await db.subjects.toArray();
                const targetSubject = subjects.find(s => s.name === subjectName);
                
                if (targetSubject) {
                    const assignment = assignments.find(a => String(a.subject_id) === String(targetSubject.id));
                    const subSpecialization = assignment ? assignment.specialization : 'Common Subject';
                    
                    // Only show students who match this specialization (or show everyone if it's a 'Common Subject')
                    if (subSpecialization && subSpecialization !== 'Common Subject') {
                        filteredStudents = filteredStudents.filter(s => 
                            (s.sub_class || '').toLowerCase() === subSpecialization.toLowerCase()
                        );
                    }
                }
            }

            // 3. Search Filter
            if (search) filteredStudents = filteredStudents.filter(s => s.name.toLowerCase().includes(search));

            // Stats Calculation
            const schoolRecords = records.filter(r => !r.is_subject_based);
            const presentCount = schoolRecords.filter(r => r.status === 'Present').length;
            const turnout = students.length > 0 ? Math.round((presentCount / students.length) * 100) : 0;
            
            document.getElementById('stat-present').textContent = presentCount;
            document.getElementById('stat-turnout').textContent = `${turnout}%`;
            document.getElementById('stat-turnout-bar').style.width = `${turnout}%`;

            // Render Rows
            listBody.innerHTML = filteredStudents.map(s => {
                let record;
                if (currentTab === 'school') {
                    record = schoolRecords.find(r => r.student_id === s.student_id);
                } else {
                    record = records.find(r => r.student_id === s.student_id && r.is_subject_based && r.subject_name === subjectName);
                }

                const status = record ? record.status : 'Absent';
                const statusColor = status === 'Present' ? '#10b981' : (status === 'Late' ? '#f59e0b' : '#ef4444');
                const timeStr = record && record.check_in ? new Date(record.check_in).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}) : '--:--';

                return `
                    <tr style="transition: all 0.2s hover;">
                        <td style="font-size: 0.7rem; color: #94a3b8; font-weight: 700;">${s.attendance_code || 'N/A'}</td>
                        <td>
                            <div style="font-weight: 700; color: #1e293b;">${s.name}</div>
                            <div style="font-size: 0.65rem; color: #94a3b8;">${s.student_id}</div>
                        </td>
                        <td><span class="badge" style="background: #f1f5f9; color: #475569;">${s.class_name}</span></td>
                        <td style="text-align: center;">
                            ${currentTab === 'school' ? `
                                <span style="display: inline-flex; align-items: center; gap: 0.5rem; color: ${statusColor}; font-weight: 800; font-size: 0.8rem; background: ${statusColor}15; padding: 4px 12px; border-radius: 99px;">
                                    <span style="width: 6px; height: 6px; background: ${statusColor}; border-radius: 50%;"></span>
                                    ${status}
                                </span>
                            ` : `
                                <select class="input subject-status-select" data-student-id="${s.student_id}" style="width: 120px; height: 32px; border-radius: 8px; font-size: 0.75rem; font-weight: 700; background: ${status === 'Present' ? '#f0fdf4' : '#fff1f2'}; border: none;">
                                    <option value="Absent" ${status === 'Absent' ? 'selected' : ''}>Absent</option>
                                    <option value="Present" ${status === 'Present' ? 'selected' : ''}>Present</option>
                                </select>
                            `}
                        </td>
                        <td style="text-align: right; font-weight: 600; color: #64748b; font-family: 'JetBrains Mono', monospace;">
                            ${currentTab === 'school' ? timeStr : `<i data-lucide="edit-2" style="width: 14px; opacity: 0.5;"></i>`}
                        </td>
                    </tr>
                `;
            }).join('');
            
            if (typeof lucide !== 'undefined') lucide.createIcons();
        };

        // Tab Switching
        tabBtns.forEach(btn => {
            btn.addEventListener('click', () => {
                tabBtns.forEach(b => {
                    b.classList.remove('active');
                    b.style.color = '#94a3b8';
                    b.style.borderBottom = 'none';
                });
                btn.classList.add('active');
                btn.style.color = '#2563eb';
                btn.style.borderBottom = '3px solid #2563eb';

                currentTab = btn.dataset.tab;
                if (currentTab === 'subject') {
                    subjectContainer.style.display = 'block';
                    subjectActions.style.display = 'block';
                    thTime.textContent = 'Action';
                } else {
                    subjectContainer.style.display = 'none';
                    subjectActions.style.display = 'none';
                    thTime.textContent = 'Time Log';
                }
                refreshList();
            });
        });

        [classFilter, subjectFilter, dateInput, searchInput].forEach(el => el.addEventListener('change', refreshList));
        searchInput.addEventListener('input', refreshList);

        // Save Subject Attendance
        document.getElementById('btn-save-subject-att').onclick = async () => {
            const subject = subjectFilter.value;
            if (!subject) return Notifications.show('Please select a subject first', 'warning');

            const selects = document.querySelectorAll('.subject-status-select');
            const date = dateInput.value;
            
            Notifications.show('Saving subject participation...', 'info');

            for (const sel of selects) {
                const studentId = sel.dataset.studentId;
                const status = sel.value;

                await db.attendance_records.put(prepareForSync({
                    id: `SUB_${studentId}_${subject}_${date}`,
                    student_id: studentId,
                    date: date,
                    status: status,
                    subject_name: subject,
                    is_subject_based: true
                }));
            }

            Notifications.show('Attendance committed successfully', 'success');
            syncToCloud();
            refreshList();
        };

        // Initial Load
        refreshList();
    },



    async renderReports() {
        const students = await db.students.toArray();
        const classes = await db.classes.toArray();
        
        this.contentArea.innerHTML = `
            <div class="view-container">
                <header class="view-header">
                    <h1 class="text-2xl font-bold">Reports Intelligence</h1>
                    <p class="text-secondary">Generate academic report cards and master results sheets.</p>
                </header>

                <div class="tabs mb-2">
                    <button class="tab-btn active" data-report-tab="individual">Individual Reports</button>
                    <button class="tab-btn" data-report-tab="mastersheet">Master Sheets</button>
                </div>

                <div id="report-tab-content">
                    <!-- Individual Reports -->
                    <div id="individual-reports" class="report-section">
                        <div class="actions-bar mb-2">
                            <input type="text" id="report-search" placeholder="Search student for report..." class="input" style="width: 100%; max-width: 400px;">
                        </div>
                        
                        <div class="grid" id="report-list">
                            ${students.filter(s => s.is_active !== false).map(s => `
                                <div class="card student-report-card" data-student-name="${s.name.toLowerCase()}">
                                    <div style="display: flex; align-items: center; gap: 1rem; margin-bottom: 1rem;">
                                        <div class="user-avatar-small" style="background: #eff6ff; color: #2563eb;">${s.name.charAt(0)}</div>
                                        <div>
                                            <h3 style="font-size: 1rem; margin: 0;">${s.name}</h3>
                                            <p class="text-secondary" style="font-size: 0.8rem; margin: 0;">${s.student_id} | ${s.class_name}</p>
                                        </div>
                                    </div>
                                    <button class="btn btn-primary w-full generate-pdf" data-id="${s.student_id}">
                                        <i data-lucide="file-down"></i> Generate Report
                                    </button>
                                </div>
                            `).join('')}
                        </div>
                    </div>

                    <!-- Master Sheets -->
                    <div id="mastersheet-reports" class="report-section" style="display: none;">
                        <div class="card" style="max-width: 600px; margin: 0 auto;">
                            <h3 class="mb-1">Generate Master Result Sheet</h3>
                            <p class="text-secondary mb-2">Generate a comprehensive results matrix for an entire class.</p>
                            
                            <div class="form-group mb-1">
                                <label>Select Stream</label>
                                <select id="master-class-filter" class="input w-100">
                                    <option value="">Choose a class...</option>
                                    ${classes.map(c => `<option value="${c.name}">${c.name}</option>`).join('')}
                                </select>
                            </div>
                            
                            <div class="grid grid-cols-2 gap-1 mb-2">
                                <div>
                                    <label>Term</label>
                                    <select id="master-term-filter" class="input w-100">
                                        <option value="1st Term">1st Term</option>
                                        <option value="2nd Term">2nd Term</option>
                                        <option value="3rd Term">3rd Term</option>
                                    </select>
                                </div>
                                <div>
                                    <label>Session</label>
                                    <select id="master-session-filter" class="input w-100">
                                        <option value="2025/2026">2025/2026</option>
                                        <option value="2024/2025">2024/2025</option>
                                    </select>
                                </div>
                            </div>
                            
                            <button id="btn-generate-mastersheet" class="btn btn-primary w-full py-1">
                                <i data-lucide="layout-grid"></i> Generate Mastersheet Matrix
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        `;

        // Search logic
        const searchInput = document.getElementById('report-search');
        if (searchInput) {
            searchInput.addEventListener('input', (e) => {
                const term = e.target.value.toLowerCase();
                document.querySelectorAll('.student-report-card').forEach(card => {
                    const name = card.dataset.studentName;
                    card.style.display = name.includes(term) ? 'block' : 'none';
                });
            });
        }

        // Tab logic
        document.querySelectorAll('[data-report-tab]').forEach(btn => {
            btn.addEventListener('click', () => {
                document.querySelectorAll('[data-report-tab]').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                
                const tab = btn.dataset.reportTab;
                document.getElementById('individual-reports').style.display = tab === 'individual' ? 'block' : 'none';
                document.getElementById('mastersheet-reports').style.display = tab === 'mastersheet' ? 'block' : 'none';
            });
        });

        // Individual PDF Generation
        document.querySelectorAll('.generate-pdf').forEach(btn => {
            btn.addEventListener('click', async () => {
                const id = btn.dataset.id;
                const student = await db.students.get(id);
                const scores = await db.scores.where('student_id').equals(id).toArray();
                
                for (const score of scores) {
                    const sub = await db.subjects.get(score.subject_id);
                    score.subject_name = sub ? sub.name : 'Unknown Subject';
                }

                Notifications.show(`Generating report for ${student.name}...`, 'info');
                await generateReportCard(student, scores, { name: 'GRAVITON ACADEMY', address: 'Academic Excellence Through Logic' });
            });
        });

        // Mastersheet Generation
        const btnMaster = document.getElementById('btn-generate-mastersheet');
        if (btnMaster) {
            btnMaster.addEventListener('click', async () => {
                const className = document.getElementById('master-class-filter').value;
                const term = document.getElementById('master-term-filter').value;
                const session = document.getElementById('master-session-filter').value;
                
                if (!className) return Notifications.show('Please select a class', 'warning');
                
                Notifications.show('Compiling mastersheet data...', 'info');
                
                const classStudents = await db.students.where('class_name').equals(className).filter(s => s.is_active !== false).toArray();
                const classScores = await db.scores.where('class_name').equals(className).toArray();
                const termScores = classScores.filter(s => s.term === term && s.session === session);
                
                // Get unique subjects for this class
                const subjectIds = [...new Set(termScores.map(s => s.subject_id))];
                const classSubjects = [];
                for (const sid of subjectIds) {
                    const sub = await db.subjects.get(sid);
                    if (sub) classSubjects.push(sub);
                }
                
                if (classStudents.length === 0) return Notifications.show('No students found in this class', 'error');
                
                await generateMastersheet(className, classStudents, classSubjects, termScores, term, session);
                Notifications.show('Mastersheet generated!', 'success');
            });
        }

        if (typeof lucide !== 'undefined') lucide.createIcons();
    },

    async renderStaff() {
        const profiles = await db.profiles.toArray();
        const teachers = profiles.filter(p => p.role === 'Teacher' || p.role === 'Admin');
        
        this.contentArea.innerHTML = `
            <div class="view-container animate-fade-in-up">
                <header class="view-header" style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 2rem;">
                    <div>
                        <h1 class="text-2xl font-bold" style="display: flex; align-items: center; gap: 0.75rem;"><i data-lucide="user-circle"></i> Faculty Directory</h1>
                        <p class="text-secondary">Manage school staff and instructional assignments.</p>
                    </div>
                    <button id="btn-add-staff" class="btn btn-primary" style="border-radius: 14px; padding: 0.8rem 1.5rem; display: flex; align-items: center; gap: 0.5rem; background: #2563eb;">
                        <i data-lucide="user-plus"></i> Add Staff Member
                    </button>
                </header>

                <div class="faculty-grid">
                    ${teachers.length === 0 ? '<div class="text-center p-4 w-100">No staff members found.</div>' : 
                        teachers.map(t => `
                        <div class="faculty-card" onclick="UI.renderStaffDetail('${t.id}')" style="cursor: pointer;">
                            <div class="faculty-avatar">
                                <img src="https://api.dicebear.com/7.x/avataaars/svg?seed=${t.full_name || t.username}" alt="${t.full_name}">
                            </div>
                            <div class="faculty-details">
                                <h3 style="font-weight: 700; color: #1e293b;">${t.full_name || t.username}</h3>
                                <span class="badge" style="background: #eff6ff; color: #2563eb; font-weight: 700; border-radius: 8px; font-size: 0.7rem; padding: 2px 8px; display: inline-block; margin: 4px 0;">${t.role}</span>
                                <div class="faculty-meta">
                                    <div class="meta-item">
                                        <i data-lucide="mail" style="width: 14px; color: #94a3b8;"></i>
                                        <span class="meta-value">${t.username}@school.com</span>
                                    </div>
                                    <div class="meta-item">
                                        <i data-lucide="fingerprint" style="width: 14px; color: #94a3b8;"></i>
                                        <span class="meta-value">${t.assigned_id || t.id.substring(0, 8)}</span>
                                    </div>
                                </div>
                                <div class="faculty-actions" style="margin-top: 1rem; display: flex; gap: 0.5rem;">
                                    <button class="btn btn-secondary btn-sm" style="flex: 1; border-radius: 8px; font-size: 0.75rem;"><i data-lucide="mail" style="width: 14px;"></i> Message</button>
                                    <button class="btn btn-primary btn-sm" style="flex: 1; border-radius: 8px; font-size: 0.75rem; background: #2563eb;" onclick="event.stopPropagation(); UI.renderStaffDetail('${t.id}')"><i data-lucide="user-cog" style="width: 14px;"></i> Profile</button>
                                </div>
                            </div>
                        </div>
                    `).join('')}
                </div>
            </div>
        `;

        if (typeof lucide !== 'undefined') lucide.createIcons();
        
        document.getElementById('btn-add-staff').onclick = async () => {
            const modalHtml = `
                <div style="display: flex; flex-direction: column; gap: 1rem; max-height: 70vh; overflow-y: auto; padding-right: 0.5rem;">
                    <div class="form-group">
                        <label style="font-size: 0.7rem; font-weight: 800; color: #94a3b8; letter-spacing: 0.05em;">FULL LEGAL NAME</label>
                        <input type="text" id="staff-name" class="input" placeholder="e.g. Dr. John Doe" style="width: 100%; height: 50px; background: rgba(255,255,255,0.05); border-color: rgba(255,255,255,0.1); color: white;">
                    </div>
                    <div style="display: grid; grid-template-columns: 1.5fr 1fr; gap: 1rem;">
                        <div class="form-group">
                            <label style="font-size: 0.7rem; font-weight: 800; color: #94a3b8; letter-spacing: 0.05em;">CONTACT EMAIL</label>
                            <input type="email" id="staff-email" class="input" placeholder="john.doe@school.edu" style="width: 100%; background: rgba(255,255,255,0.05); border-color: rgba(255,255,255,0.1); color: white;">
                        </div>
                        <div class="form-group">
                            <label style="font-size: 0.7rem; font-weight: 800; color: #94a3b8; letter-spacing: 0.05em;">EMPLOYMENT TYPE</label>
                            <select id="staff-type" class="input" style="width: 100%; background: rgba(255,255,255,0.05); border-color: rgba(255,255,255,0.1); color: white;">
                                <option value="Full-Time">Full-Time</option>
                                <option value="Part-Time">Part-Time</option>
                                <option value="Contract">Contract</option>
                            </select>
                        </div>
                    </div>
                    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 1rem;">
                        <div class="form-group">
                            <label style="font-size: 0.7rem; font-weight: 800; color: #94a3b8; letter-spacing: 0.05em;">DATE OF BIRTH</label>
                            <input type="date" id="staff-dob" class="input" style="width: 100%; background: rgba(255,255,255,0.05); border-color: rgba(255,255,255,0.1); color: white;">
                        </div>
                        <div class="form-group">
                            <label style="font-size: 0.7rem; font-weight: 800; color: #94a3b8; letter-spacing: 0.05em;">PHONE NUMBER</label>
                            <input type="text" id="staff-phone" class="input" placeholder="080XXXXXXXX" style="width: 100%; background: rgba(255,255,255,0.05); border-color: rgba(255,255,255,0.1); color: white;">
                        </div>
                    </div>
                    <div class="form-group">
                        <label style="font-size: 0.7rem; font-weight: 800; color: #94a3b8; letter-spacing: 0.05em;">ACADEMIC DEPARTMENT</label>
                        <input type="text" id="staff-dept" class="input" placeholder="e.g. Sciences, Arts, Languages" style="width: 100%; background: rgba(255,255,255,0.05); border-color: rgba(255,255,255,0.1); color: white;">
                    </div>
                    <div class="form-group">
                        <label style="font-size: 0.7rem; font-weight: 800; color: #94a3b8; letter-spacing: 0.05em;">PROFESSIONAL QUALIFICATIONS</label>
                        <textarea id="staff-quals" class="input" placeholder="Degrees, certifications, etc." style="width: 100%; height: 60px; resize: none; background: rgba(255,255,255,0.05); border-color: rgba(255,255,255,0.1); color: white;"></textarea>
                    </div>
                    <div class="form-group">
                        <label style="font-size: 0.7rem; font-weight: 800; color: #94a3b8; letter-spacing: 0.05em;">RESIDENTIAL ADDRESS</label>
                        <textarea id="staff-address" class="input" placeholder="Current home address" style="width: 100%; height: 60px; resize: none; background: rgba(255,255,255,0.05); border-color: rgba(255,255,255,0.1); color: white;"></textarea>
                    </div>
                </div>
            `;
            
            this.showModal('Register Faculty Member', modalHtml, async () => {
                const name = document.getElementById('staff-name').value;
                const email = document.getElementById('staff-email').value;
                
                if (!name || !email) return Notifications.show('Name and Email are required', 'error');

                const newStaff = prepareForSync({
                    id: `STF${Math.random().toString(36).substr(2, 7).toUpperCase()}`,
                    username: email.split('@')[0],
                    full_name: name,
                    role: 'Teacher',
                    assigned_id: `SCH/STF/${Math.floor(Math.random()*9000)+1000}`
                });

                await db.profiles.add(newStaff);
                Notifications.show('Faculty member registered!', 'success');
                this.renderStaff();
                syncToCloud();
            }, 'Finalize Registration', 'user-plus');
        };
    },

    async renderStaffDetail(staffId) {
        const staff = await db.profiles.get(staffId);
        if (!staff) return Notifications.show('Staff member not found', 'error');

        const assignments = await db.subject_assignments.where('teacher_id').equals(staffId).toArray();
        const subjects = await db.subjects.toArray();
        
        const staffAssignments = assignments.map(a => {
            const s = subjects.find(sub => sub.id === a.subject_id);
            return {
                subject_name: s ? s.name : 'Unknown Subject',
                class_name: a.class_name
            };
        });

        this.contentArea.innerHTML = `
            <div class="view-container animate-fade-in-up">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 2rem;">
                    <button class="btn btn-secondary" onclick="UI.renderStaff()"><i data-lucide="arrow-left"></i> Back to Directory</button>
                    <div style="display: flex; gap: 1rem;">
                        <button class="btn btn-secondary" style="color: #ef4444; background: #fef2f2; border: none;"><i data-lucide="trash-2"></i> Terminate Contract</button>
                        <button class="btn btn-primary" style="background: #2563eb;"><i data-lucide="edit"></i> Update Records</button>
                    </div>
                </div>

                <div style="display: grid; grid-template-columns: 350px 1fr; gap: 2rem;">
                    <!-- Left: Bio-Data -->
                    <div class="card" style="border-radius: 20px; padding: 2rem; text-align: center;">
                        <div style="width: 150px; height: 150px; margin: 0 auto 1.5rem; border-radius: 40px; overflow: hidden; background: #f1f5f9; border: 4px solid white; box-shadow: 0 10px 25px -5px rgba(0,0,0,0.1);">
                            <img src="https://api.dicebear.com/7.x/avataaars/svg?seed=${staff.full_name || staff.username}" style="width: 100%; height: 100%; object-fit: cover;">
                        </div>
                        <h2 style="font-size: 1.75rem; font-weight: 800; color: #1e293b;">${staff.full_name || staff.username}</h2>
                        <span class="badge" style="background: #eff6ff; color: #2563eb; font-weight: 800; border-radius: 12px; padding: 0.5rem 1rem; margin-top: 0.5rem; display: inline-block;">${staff.role.toUpperCase()}</span>
                        
                        <div style="margin-top: 2rem; text-align: left; display: flex; flex-direction: column; gap: 1.25rem;">
                            <div style="display: flex; align-items: center; gap: 1rem;">
                                <div style="width: 40px; height: 40px; background: #f8fafc; border-radius: 12px; display: flex; align-items: center; justify-content: center; color: #94a3b8;">
                                    <i data-lucide="mail" style="width: 18px;"></i>
                                </div>
                                <div>
                                    <div style="font-size: 0.75rem; color: #94a3b8; font-weight: 700;">EMAIL ADDRESS</div>
                                    <div style="font-weight: 600; color: #475569;">${staff.username}@school.com</div>
                                </div>
                            </div>
                        </div>
                    </div>

                    <!-- Right: Assignments -->
                    <div style="display: flex; flex-direction: column; gap: 2rem;">
                        <div class="card" style="border-radius: 20px; padding: 2rem;">
                            <h3 style="display: flex; align-items: center; gap: 0.75rem; margin-bottom: 1.5rem;"><i data-lucide="book-open" style="color: #2563eb;"></i> Academic Load</h3>
                            <div class="table-container">
                                <table class="data-table">
                                    <thead>
                                        <tr><th>Subject Name</th><th>Assigned Class</th></tr>
                                    </thead>
                                    <tbody>
                                        ${staffAssignments.length === 0 ? '<tr><td colspan="2" class="text-center p-4">No subjects assigned yet.</td></tr>' : 
                                            staffAssignments.map(a => `
                                            <tr>
                                                <td style="font-weight: 700;">${a.subject_name}</td>
                                                <td><span class="badge" style="background: #f1f5f9; color: #475569;">${a.class_name}</span></td>
                                            </tr>
                                        `).join('')}
                                    </tbody>
                                </table>
                            </div>
                            <button id="btn-staff-assign-sub" class="btn btn-secondary w-100 mt-1" style="border-radius: 12px; border: 2px dashed #e2e8f0; background: #f8fafc; color: #94a3b8; font-weight: 700; padding: 1rem;">
                                <i data-lucide="plus"></i> Assign New Subject
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        `;

        if (typeof lucide !== 'undefined') lucide.createIcons();

        // Update Records Button
        const btnUpdate = this.contentArea.querySelector('button[style*="background: #2563eb;"]');
        if (btnUpdate) {
            btnUpdate.onclick = () => {
                const modalHtml = `
                    <div style="display: flex; flex-direction: column; gap: 1.25rem;">
                        <div class="form-group">
                            <label>Full Name</label>
                            <input type="text" id="edit-staff-name" class="input" value="${staff.full_name || ''}" style="width: 100%;">
                        </div>
                        <div class="form-group">
                            <label>Role</label>
                            <select id="edit-staff-role" class="input" style="width: 100%;">
                                <option value="Teacher" ${staff.role === 'Teacher' ? 'selected' : ''}>Teacher</option>
                                <option value="Admin" ${staff.role === 'Admin' ? 'selected' : ''}>Administrator</option>
                            </select>
                        </div>
                    </div>
                `;
                this.showModal('Update Staff Records', modalHtml, async () => {
                    const name = document.getElementById('edit-staff-name').value;
                    const role = document.getElementById('edit-staff-role').value;
                    await db.profiles.update(staffId, { full_name: name, role, updated_at: new Date().toISOString() });
                    Notifications.show('Staff records updated', 'success');
                    this.renderStaffDetail(staffId);
                    syncToCloud();
                }, 'Save Updates');
            };
        }

        // Terminate Contract Button
        const btnTerminate = this.contentArea.querySelector('button[style*="color: #ef4444;"]');
        if (btnTerminate) {
            btnTerminate.onclick = async () => {
                if (confirm(`Are you sure you want to terminate the contract for ${staff.full_name}? This will revoke system access.`)) {
                    await db.profiles.update(staffId, { role: 'Former Staff', status: 'Terminated', updated_at: new Date().toISOString() });
                    Notifications.show('Contract terminated and access revoked.', 'warning');
                    this.renderStaff();
                    syncToCloud();
                }
            };
        }

        document.getElementById('btn-staff-assign-sub').onclick = async () => {
            const allClasses = await db.classes.toArray();
            const allSubjects = await db.subjects.toArray();

            const modalHtml = `
                <div style="display: flex; flex-direction: column; gap: 1rem;">
                    <div id="staff-assign-list" style="display: flex; flex-direction: column; gap: 0.75rem;">
                        <div class="staff-assign-row" style="display: flex; gap: 0.5rem; align-items: center; background: rgba(255,255,255,0.05); padding: 0.5rem; border-radius: 8px;">
                            <select class="input assign-sub" style="flex: 1.5; font-size: 0.85rem;">
                                ${allSubjects.map(s => `<option value="${s.id}">${s.name}</option>`).join('')}
                            </select>
                            <select class="input assign-cls" style="flex: 1; font-size: 0.85rem;">
                                ${allClasses.map(c => `<option value="${c.name}">${c.name}</option>`).join('')}
                            </select>
                            <button class="btn btn-sm" onclick="this.parentElement.remove()" style="color: #ef4444;"><i data-lucide="trash"></i></button>
                        </div>
                    </div>
                    <button class="btn btn-secondary btn-sm w-100" id="btn-add-assign-row" style="border: 2px dashed rgba(255,255,255,0.1);">
                        <i data-lucide="plus"></i> Add More Assignments
                    </button>
                </div>
            `;

            this.showModal('Assign Subjects to Teacher', modalHtml, async () => {
                const rows = document.querySelectorAll('.staff-assign-row');
                for (const row of rows) {
                    const subId = row.querySelector('.assign-sub').value;
                    const className = row.querySelector('.assign-cls').value;

                    await db.subject_assignments.add(prepareForSync({
                        id: `ASN${Math.random().toString(36).substr(2, 7).toUpperCase()}`,
                        teacher_id: staffId,
                        subject_id: subId,
                        class_name: className
                    }));
                }

                Notifications.show('Subjects assigned successfully', 'success');
                this.renderStaffDetail(staffId);
                syncToCloud();
            }, 'Finalize Assignments', 'save');

            document.getElementById('btn-add-assign-row').onclick = () => {
                const row = document.createElement('div');
                row.className = 'staff-assign-row';
                row.style = "display: flex; gap: 0.5rem; align-items: center; background: rgba(255,255,255,0.05); padding: 0.5rem; border-radius: 8px;";
                row.innerHTML = `
                    <select class="input assign-sub" style="flex: 1.5; font-size: 0.85rem;">
                        ${allSubjects.map(s => `<option value="${s.id}">${s.name}</option>`).join('')}
                    </select>
                    <select class="input assign-cls" style="flex: 1; font-size: 0.85rem;">
                        ${allClasses.map(c => `<option value="${c.name}">${c.name}</option>`).join('')}
                    </select>
                    <button class="btn btn-sm" onclick="this.parentElement.remove()" style="color: #ef4444;"><i data-lucide="trash"></i></button>
                `;
                document.getElementById('staff-assign-list').appendChild(row);
                if (typeof lucide !== 'undefined') lucide.createIcons();
            };
        };
    },

    async renderPromotionEngine() {
        const classes = await db.classes.toArray();
        
        this.contentArea.innerHTML = `
            <div class="card" style="max-width: 600px;">
                <h3>Promotion Engine</h3>
                <p class="text-secondary mb-2">Promote all students from one class to another.</p>
                
                <div class="form-group mb-2">
                    <label>From Class</label>
                    <select id="promo-from" class="input w-100">
                        ${classes.map(c => `<option value="${c.name}">${c.name}</option>`).join('')}
                    </select>
                </div>
                
                <div class="form-group mb-2">
                    <label>To Class</label>
                    <select id="promo-to" class="input w-100">
                        ${classes.map(c => `<option value="${c.name}">${c.name}</option>`).join('')}
                        <option value="Graduated">Graduated</option>
                    </select>
                </div>
                
                <button id="run-promotion" class="btn btn-warning">Run Batch Promotion</button>
            </div>
        `;

        document.getElementById('run-promotion').addEventListener('click', async () => {
            const from = document.getElementById('promo-from').value;
            const to = document.getElementById('promo-to').value;
            
            if (from === to) {
                Notifications.show('Source and destination classes must be different', 'error');
                return;
            }

            const students = await db.students.where('class_name').equals(from).toArray();
            
            if (students.length === 0) {
                Notifications.show(`No students found in ${from}`, 'error');
                return;
            }

            if (confirm(`Are you sure you want to promote ${students.length} students from ${from} to ${to}?`)) {
                for (const s of students) {
                    await db.students.update(s.student_id, {
                        class_name: to,
                        is_synced: 0,
                        updated_at: new Date().toISOString()
                    });
                }
                Notifications.show(`Successfully promoted ${students.length} students`, 'success');
                this.renderPromotionEngine();
            }
        });
    },

    async renderSettings() {
        const url = localStorage.getItem('sb_url') || '';
        const key = localStorage.getItem('sb_key') || '';

        this.contentArea.innerHTML = `
            <div class="card" style="max-width: 600px;">
                <h3>Supabase Configuration</h3>
                <p class="text-secondary mb-2">Configure your Supabase project to enable cloud synchronization.</p>
                
                <div class="form-group mb-2">
                    <label>Supabase URL</label>
                    <input type="text" id="sb-url" class="input w-100" value="${url}" placeholder="https://your-project.supabase.co">
                </div>
                
                <div class="form-group mb-2">
                    <label>Anon Key</label>
                    <input type="password" id="sb-key" class="input w-100" value="${key}" placeholder="your-anon-key">
                </div>
                
                <button id="save-settings" class="btn btn-primary">Save Configuration</button>
            </div>
        `;

        document.getElementById('save-settings').addEventListener('click', () => {
            const newUrl = document.getElementById('sb-url').value;
            const newKey = document.getElementById('sb-key').value;
            
            localStorage.setItem('sb_url', newUrl);
            localStorage.setItem('sb_key', newKey);
            
            Notifications.show('Settings saved. Please refresh the page to apply.', 'success');
        });
    },

    cbtQuestions: [],

    async renderCBT() {
        const role = (this.currentUser.role || '').toLowerCase();
        const isTeacher = role === 'teacher';
        const isStudent = role === 'student';
        const teacherId = this.currentUser.id;
        
        let subjects = (await db.subjects.toArray());
        let exams = await db.cbt_exams.toArray();

        if (isTeacher) {
            exams = exams.filter(e => e.teacher_id === teacherId);
        } else if (isStudent) {
            const now = new Date();
            const student = await db.students.get(this.currentUser.assigned_id || this.currentUser.id);
            const sClass = student ? student.class_name : '';
            
            exams = exams.filter(e => {
                const isMyClass = e.class_name === sClass;
                const isActive = e.status === 'Active';
                const hasStarted = !e.start_time || new Date(e.start_time) <= now;
                const hasNotEnded = !e.end_time || new Date(e.end_time) >= now;
                return isMyClass && isActive && hasStarted && hasNotEnded;
            });
        }

        const subMap = subjects.reduce((acc, s) => ({...acc, [s.id]: s.name}), {});

        this.contentArea.innerHTML = `
            <div class="view-container animate-fade-in-up">
                <div class="page-banner" style="background: linear-gradient(135deg, #4338ca 0%, #312e81 100%);">
                    <div class="banner-content">
                        <h1 class="banner-title"><i data-lucide="monitor"></i> CBT Exam Hub</h1>
                        <p class="banner-subtitle">${isStudent ? 'Take your computer-based tests here.' : 'Create, manage, and monitor computer-based tests.'}</p>
                    </div>
                    ${!isStudent ? `
                    <button id="btn-create-exam" class="btn btn-primary" style="background: white; color: #4338ca; border: none; font-weight: 800; box-shadow: var(--shadow-md);">
                        <i data-lucide="plus-square"></i> New Exam
                    </button>
                    ` : ''}
                </div>

                <div class="cbt-list-container" style="display: flex; flex-direction: column; gap: 1rem; margin-top: 1.5rem;">
                    ${exams.length === 0 ? '<div class="card text-center p-4">No exams found.</div>' : 
                        exams.map(e => `
                        <div class="cbt-exam-card" style="background: white; border: 1px solid #e2e8f0; border-radius: 16px; overflow: hidden; transition: all 0.3s ease; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.05);">
                            <div class="cbt-exam-trigger" style="padding: 1.25rem; display: flex; justify-content: space-between; align-items: center; cursor: pointer; background: white;" onclick="const content = this.nextElementSibling; const isExpanded = content.style.maxHeight !== '0px' && content.style.maxHeight !== ''; content.style.maxHeight = isExpanded ? '0px' : '500px'; this.querySelector('.chevron-icon').style.transform = isExpanded ? 'rotate(0deg)' : 'rotate(180deg)';">
                                <div style="display: flex; align-items: center; gap: 1rem;">
                                    <div style="width: 45px; height: 45px; background: #eef2ff; border-radius: 12px; display: flex; align-items: center; justify-content: center; color: #4338ca;">
                                        <i data-lucide="file-text"></i>
                                    </div>
                                    <div>
                                        <div style="font-weight: 800; color: #1e293b; font-size: 1.05rem;">${e.title}</div>
                                        <div style="font-size: 0.75rem; color: #64748b; font-weight: 600;">${subMap[e.subject_id] || 'General Subject'} | ${e.class_name}</div>
                                    </div>
                                </div>
                                <div style="display: flex; align-items: center; gap: 1rem;">
                                    <span class="badge badge-${e.status === 'Active' ? 'success' : 'warning'}" style="padding: 6px 12px; border-radius: 8px;">${e.status}</span>
                                    <i data-lucide="chevron-down" class="chevron-icon" style="width: 20px; color: #94a3b8; transition: transform 0.3s ease;"></i>
                                </div>
                            </div>
                            <div class="cbt-exam-content" style="max-height: 0; overflow: hidden; transition: max-height 0.4s ease-out; background: #f8fafc; border-top: 1px solid #f1f5f9;">
                                <div style="padding: 1.5rem; display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 1.5rem;">
                                    <div>
                                        <div style="font-size: 0.7rem; font-weight: 800; color: #94a3b8; margin-bottom: 0.25rem;">EXAM MODE</div>
                                        <div style="font-weight: 700; color: #334155;">${e.mode || 'Standard Exam'}</div>
                                    </div>
                                    <div>
                                        <div style="font-size: 0.7rem; font-weight: 800; color: #94a3b8; margin-bottom: 0.25rem;">DURATION</div>
                                        <div style="font-weight: 700; color: #334155;">${e.duration || 30} Minutes</div>
                                    </div>
                                    <div>
                                        <div style="font-size: 0.7rem; font-weight: 800; color: #94a3b8; margin-bottom: 0.25rem;">TERM / SESSION</div>
                                        <div style="font-weight: 700; color: #334155;">${e.term} | ${e.session}</div>
                                    </div>
                                    <div style="display: flex; gap: 0.75rem; align-items: center; justify-content: flex-end;">
                                        ${isStudent ? `
                                            <button class="btn btn-primary btn-sm" onclick="UI.startCBTExam('${e.id}')" style="height: 40px; padding: 0 1.5rem; border-radius: 10px; background: #4338ca;">
                                                <i data-lucide="play" style="width: 16px;"></i> Start Exam
                                            </button>
                                        ` : `
                                            <button class="btn btn-secondary btn-sm" onclick="UI.renderCBTEditor('${e.id}')" style="height: 40px; padding: 0 1.25rem; border-radius: 10px;">
                                                <i data-lucide="edit-3" style="width: 16px;"></i> Edit
                                            </button>
                                            <button class="btn btn-danger btn-sm" onclick="UI.deleteExam('${e.id}')" style="height: 40px; width: 40px; padding: 0; border-radius: 10px; display: flex; align-items: center; justify-content: center;">
                                                <i data-lucide="trash-2" style="width: 16px;"></i>
                                            </button>
                                        `}
                                    </div>
                                </div>
                            </div>
                        </div>
                    `).join('')}
                </div>
            </div>
        `;

        if (typeof lucide !== 'undefined') lucide.createIcons();
        document.getElementById('btn-create-exam').onclick = () => this.renderCBTEditor();
    },

    async deleteExam(id) {
        if (confirm('Are you sure you want to delete this exam and all its questions?')) {
            await db.cbt_exams.delete(id);
            await db.cbt_questions.where('exam_id').equals(id).delete();
            Notifications.show('Exam deleted successfully', 'success');
            this.renderCBT();
            syncToCloud();
        }
    },

    async renderCBTEditor(examId = null) {
        const isEdit = !!examId;
        const teacherId = this.currentUser.id;
        
        let exam = isEdit ? await db.cbt_exams.get(examId) : {
            title: '', subject_id: '', class_name: '', duration: 30, mode: 'Official Exam', term: '3rd Term', session: '2025/2026', score_field: 'test1', status: 'Draft',
            start_time: '', end_time: ''
        };

        this.cbtQuestions = isEdit ? await db.cbt_questions.where('exam_id').equals(examId).toArray() : [];

        let subjects = (await db.subjects.toArray()).sort((a, b) => a.name.localeCompare(b.name));
        let classes = (await db.classes.toArray());

        // Custom serial sort for classes (JSS -> SSS)
        const classOrder = { 'JSS': 1, 'JS': 1, 'SSS': 2, 'SS': 2, 'PRY': 3, 'BASIC': 4 };
        classes.sort((a, b) => {
            const getParts = (name) => {
                const match = name.match(/^([A-Z]+)\s*(\d+)/i);
                if (!match) return [name.toUpperCase(), 0];
                return [match[1].toUpperCase(), parseInt(match[2])];
            };
            const [pA, nA] = getParts(a.name);
            const [pB, nB] = getParts(b.name);
            const rA = classOrder[pA] || 99;
            const rB = classOrder[pB] || 99;
            if (rA !== rB) return rA - rB;
            if (nA !== nB) return nA - nB;
            return a.name.localeCompare(b.name);
        });
        
        if ((this.currentUser.role || '').toLowerCase() === 'teacher') {
            const assignments = await db.subject_assignments.where('teacher_id').equals(teacherId).toArray();
            const assignedSubIds = new Set(assignments.map(a => a.subject_id));
            subjects = subjects.filter(s => assignedSubIds.has(s.id));
            const assignedClasses = new Set(assignments.map(a => a.class_name));
            classes = classes.filter(c => assignedClasses.has(c.name));
        }

        this.contentArea.innerHTML = `
            <div class="view-container animate-fade-in-up">
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:1.5rem;">
                    <div>
                        <h2 style="display:flex; align-items:center; gap:0.75rem;"><i data-lucide="monitor"></i> Computer Based Testing (CBT)</h2>
                        <p class="text-secondary">Manage exams and view results</p>
                    </div>
                    <button class="btn btn-secondary" onclick="UI.renderCBT()"><i data-lucide="arrow-left"></i> Back to List</button>
                </div>

                <div class="cbt-container">
                    <!-- Left Column: Questions -->
                    <div class="cbt-main-card">
                        <div class="card" style="border-radius:20px; padding:1.5rem;">
                            <h3 style="display:flex; align-items:center; gap:0.5rem; margin-bottom:1.5rem;"><i data-lucide="file-text"></i> Add Questions</h3>
                            
                            <div style="display:grid; grid-template-columns: 1fr 1fr; gap:1rem; margin-bottom:1rem;">
                                <div class="cbt-form-group">
                                    <label>Question Type</label>
                                    <select id="q-type" class="cbt-input">
                                        <option value="mcq">Multiple Choice</option>
                                        <option value="fill">Fill in the Gaps</option>
                                    </select>
                                </div>
                                <div class="cbt-form-group">
                                    <label>Attachment (Image)</label>
                                    <input type="file" id="q-file" class="cbt-input">
                                </div>
                            </div>

                            <div class="cbt-form-group">
                                <label>Question Text</label>
                                <textarea id="q-text" class="cbt-input" style="height:100px; resize:none;" placeholder="Type Question Here... (e.g. Solve the equation in the image)"></textarea>
                            </div>

                            <div style="display:grid; grid-template-columns: 1fr 1fr 1fr; gap:1rem; margin-bottom:1rem;">
                                <div class="cbt-form-group"><label>Option A</label><input type="text" id="opt-a" class="cbt-input"></div>
                                <div class="cbt-form-group"><label>Option B</label><input type="text" id="opt-b" class="cbt-input"></div>
                                <div class="cbt-form-group"><label>Option C</label><input type="text" id="opt-c" class="cbt-input"></div>
                            </div>
                            <div style="display:grid; grid-template-columns: 1fr 1fr; gap:1rem; margin-bottom:1rem;">
                                <div class="cbt-form-group"><label>Option D</label><input type="text" id="opt-d" class="cbt-input"></div>
                                <div class="cbt-form-group"><label>Option E (Optional)</label><input type="text" id="opt-e" class="cbt-input"></div>
                            </div>

                            <div class="cbt-form-group">
                                <label>Correct Answer:</label>
                                <select id="q-correct" class="cbt-input">
                                    <option value="A">Option A</option>
                                    <option value="B">Option B</option>
                                    <option value="C">Option C</option>
                                    <option value="D">Option D</option>
                                    <option value="E">Option E</option>
                                </select>
                            </div>

                            <div style="display:flex; justify-content:flex-end; gap:1rem; margin-top:2rem;">
                                <button class="btn btn-secondary" onclick="UI.bulkImportQuestions()"><i data-lucide="file-up"></i> Bulk Import</button>
                                <button class="btn btn-primary" onclick="UI.addTempQuestion()"><i data-lucide="plus"></i> Add Question</button>
                            </div>

                            <div class="question-preview-list" id="q-preview-area">
                                <!-- Question previews go here -->
                            </div>
                        </div>
                    </div>

                    <!-- Right Column: Exam Details -->
                    <div class="cbt-side-card">
                        <div class="card" style="border-radius:20px; padding:1.5rem;">
                            <h3 style="display:flex; align-items:center; gap:0.5rem; margin-bottom:1.5rem;"><i data-lucide="settings"></i> Exam Details</h3>
                            
                            <div class="cbt-form-group">
                                <label>Exam Type</label>
                                <select id="exam-title" class="cbt-input">
                                    <option value="Test 1" ${exam.title === 'Test 1' ? 'selected' : ''}>Test 1</option>
                                    <option value="Test 2" ${exam.title === 'Test 2' ? 'selected' : ''}>Test 2</option>
                                    <option value="Exam" ${exam.title === 'Exam' ? 'selected' : ''}>Final Exam</option>
                                </select>
                            </div>

                            <div class="cbt-form-group">
                                <label>Class</label>
                                <select id="exam-class" class="cbt-input">
                                    <option value="">Select Class</option>
                                    ${classes.map(c => `<option value="${c.name}" ${exam.class_name === c.name ? 'selected' : ''}>${c.name}</option>`).join('')}
                                </select>
                            </div>

                            <div class="cbt-form-group">
                                <label>Subject</label>
                                <select id="exam-subject" class="cbt-input">
                                    <option value="">Select Subject</option>
                                    ${subjects.map(s => `<option value="${s.id}" ${exam.subject_id === s.id ? 'selected' : ''}>${s.name}</option>`).join('')}
                                </select>
                            </div>

                            <div style="display:grid; grid-template-columns: 1fr 1fr; gap:1rem; margin-bottom:1rem;">
                                <div class="cbt-form-group">
                                    <label>Start Date/Time</label>
                                    <input type="datetime-local" id="exam-start" class="cbt-input" value="${exam.start_time || ''}">
                                </div>
                                <div class="cbt-form-group">
                                    <label>End Date/Time</label>
                                    <input type="datetime-local" id="exam-end" class="cbt-input" value="${exam.end_time || ''}">
                                </div>
                            </div>

                            <div class="cbt-form-group">
                                <label>Duration (Minutes)</label>
                                <input type="number" id="exam-duration" class="cbt-input" value="${exam.duration}">
                            </div>

                            <div class="cbt-form-group">
                                <label>Exam Mode</label>
                                <select id="exam-mode" class="cbt-input">
                                    <option value="Official Exam" ${exam.mode === 'Official Exam' ? 'selected' : ''}>Official Exam (Update Records)</option>
                                    <option value="Practice" ${exam.mode === 'Practice' ? 'selected' : ''}>Practice Mode (Mock Only)</option>
                                </select>
                            </div>

                            <div style="display:grid; grid-template-columns: 1fr 1fr; gap:1rem;">
                                <div class="cbt-form-group">
                                    <label>Target Term</label>
                                    <select id="exam-term" class="cbt-input">
                                        <option value="1st Term" ${exam.term === '1st Term' ? 'selected' : ''}>1st Term</option>
                                        <option value="2nd Term" ${exam.term === '2nd Term' ? 'selected' : ''}>2nd Term</option>
                                        <option value="3rd Term" ${exam.term === '3rd Term' ? 'selected' : ''}>3rd Term</option>
                                    </select>
                                </div>
                                <div class="cbt-form-group">
                                    <label>Target Session</label>
                                    <select id="exam-session" class="cbt-input">
                                        <option value="2024/2025" ${exam.session === '2024/2025' ? 'selected' : ''}>2024/2025</option>
                                        <option value="2025/2026" ${exam.session === '2025/2026' ? 'selected' : ''}>2025/2026</option>
                                    </select>
                                </div>
                            </div>

                            <div class="cbt-form-group">
                                <label>Push Score To:</label>
                                <select id="exam-score-field" class="cbt-input">
                                    <option value="test1" ${exam.score_field === 'test1' ? 'selected' : ''}>Test 1</option>
                                    <option value="test2" ${exam.score_field === 'test2' ? 'selected' : ''}>Test 2</option>
                                    <option value="exam" ${exam.score_field === 'exam' ? 'selected' : ''}>Final Exam</option>
                                </select>
                            </div>

                            <div class="cbt-form-group">
                                <label>Visibility Status</label>
                                <select id="exam-status" class="cbt-input">
                                    <option value="Draft" ${exam.status === 'Draft' ? 'selected' : ''}>Draft (Hidden)</option>
                                    <option value="Active" ${exam.status === 'Active' ? 'selected' : ''}>Active (Open for Students)</option>
                                </select>
                            </div>

                            <button class="btn btn-primary w-100" style="padding:1rem; border-radius:12px; background:#000080;" onclick="UI.saveExam('${examId || ''}')">
                                <i data-lucide="save"></i> Save Exam
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        `;

        if (typeof lucide !== 'undefined') lucide.createIcons();

        // Dynamic Filtering Logic
        const classSelect = document.getElementById('exam-class');
        const subjectSelect = document.getElementById('exam-subject');

        classSelect.onchange = async () => {
            const selectedClass = classSelect.value;
            subjectSelect.innerHTML = '<option value="">Select Subject</option>';
            
            if (!selectedClass) return;

            const assignments = await db.subject_assignments.where('class_name').equals(selectedClass).toArray();
            const teacherId = this.currentUser.id;
            const isTeacher = (this.currentUser.role || '').toLowerCase() === 'teacher';

            let filteredAssignments = assignments;
            if (isTeacher) {
                filteredAssignments = assignments.filter(a => a.teacher_id === teacherId);
            }

            const subIds = [...new Set(filteredAssignments.map(a => a.subject_id))];
            const classSubjects = (await Promise.all(subIds.map(id => db.subjects.get(id))))
                .filter(Boolean)
                .sort((a, b) => a.name.localeCompare(b.name));
            
            classSubjects.forEach(s => {
                const opt = document.createElement('option');
                opt.value = s.id;
                opt.textContent = s.name;
                subjectSelect.appendChild(opt);
            });
        };

        this.refreshQuestionPreview();
    },

    addTempQuestion() {
        const text = document.getElementById('q-text').value;
        if (!text) return Notifications.show('Please enter question text', 'error');

        const q = {
            id: `Q${Math.random().toString(36).substr(2,7).toUpperCase()}`,
            question_text: text,
            option_a: document.getElementById('opt-a').value,
            option_b: document.getElementById('opt-b').value,
            option_c: document.getElementById('opt-c').value,
            option_d: document.getElementById('opt-d').value,
            option_e: document.getElementById('opt-e').value,
            correct_option: document.getElementById('q-correct').value
        };

        this.cbtQuestions.push(q);
        
        // Reset inputs
        document.getElementById('q-text').value = '';
        document.getElementById('opt-a').value = '';
        document.getElementById('opt-b').value = '';
        document.getElementById('opt-c').value = '';
        document.getElementById('opt-d').value = '';
        document.getElementById('opt-e').value = '';
        
        this.refreshQuestionPreview();
        Notifications.show('Question added to list', 'success');
    },

    refreshQuestionPreview() {
        const area = document.getElementById('q-preview-area');
        if (!area) return;

        if (this.cbtQuestions.length === 0) {
            area.innerHTML = `<p class="text-secondary text-center p-4">No questions added yet.</p>`;
            return;
        }

        area.innerHTML = `<h4>Questions Preview (${this.cbtQuestions.length})</h4>` + this.cbtQuestions.map((q, idx) => `
            <div class="question-preview-item">
                <span class="q-num">#${idx + 1}</span>
                <p style="font-weight:600; margin-bottom:0.5rem;">${q.question_text}</p>
                <div style="font-size:0.85rem; display:grid; grid-template-columns: 1fr 1fr; gap:0.5rem; color:var(--text-secondary);">
                    <div>A: ${q.option_a}</div>
                    <div>B: ${q.option_b}</div>
                    <div>C: ${q.option_c}</div>
                    <div>D: ${q.option_d}</div>
                </div>
                <div style="margin-top:0.5rem; font-size:0.85rem; color:var(--accent-success); font-weight:700;">
                    Correct: ${q.correct_option}
                </div>
                <button class="btn btn-sm btn-danger" style="position:absolute; top:10px; right:10px; padding:2px 5px;" onclick="UI.removeTempQuestion('${q.id}')">
                    <i data-lucide="x" style="width:14px; height:14px;"></i>
                </button>
            </div>
        `).join('');
        
        if (typeof lucide !== 'undefined') lucide.createIcons();
    },

    removeTempQuestion(id) {
        this.cbtQuestions = this.cbtQuestions.filter(q => q.id !== id);
        this.refreshQuestionPreview();
    },

    async saveExam(existingId) {
        const title = document.getElementById('exam-title').value;
        const subId = document.getElementById('exam-subject').value;
        const cls = document.getElementById('exam-class').value;

        if (!title || !subId || !cls) {
            return Notifications.show('Please fill in required fields (Title, Subject, Class)', 'error');
        }

        const examId = existingId || `EXM${Math.random().toString(36).substr(2,9).toUpperCase()}`;
        
        const examData = prepareForSync({
            id: examId,
            title,
            subject_id: subId,
            class_name: cls,
            teacher_id: this.currentUser.id,
            duration: parseInt(document.getElementById('exam-duration').value) || 30,
            mode: document.getElementById('exam-mode').value,
            term: document.getElementById('exam-term').value,
            session: document.getElementById('exam-session').value,
            score_field: document.getElementById('exam-score-field').value,
            status: document.getElementById('exam-status').value,
            start_time: document.getElementById('exam-start').value,
            end_time: document.getElementById('exam-end').value,
            date: new Date().toISOString().split('T')[0]
        });

        if (existingId) {
            await db.cbt_exams.update(existingId, examData);
            // Re-save questions
            await db.cbt_questions.where('exam_id').equals(existingId).delete();
        } else {
            await db.cbt_exams.add(examData);
        }

        // Save all current questions
        for (const q of this.cbtQuestions) {
            await db.cbt_questions.add(prepareForSync({
                ...q,
                exam_id: examId
            }));
        }

        Notifications.show('Exam saved successfully', 'success');
        this.renderCBT();
        syncToCloud();
    },

    async startCBTExam(examId) {
        const exam = await db.cbt_exams.get(examId);
        if (!exam) return;

        let questions = await db.cbt_questions.where('exam_id').equals(examId).toArray();
        if (questions.length === 0) {
            return Notifications.show('This exam has no questions yet.', 'error');
        }

        // 1. Shuffle Questions
        questions = this.shuffleArray([...questions]);

        // 2. Shuffle Options for each question
        questions = questions.map(q => {
            const options = [
                { key: 'a', text: q.option_a },
                { key: 'b', text: q.option_b },
                { key: 'c', text: q.option_c },
                { key: 'd', text: q.option_d },
                { key: 'e', text: q.option_e }
            ].filter(o => o.text);

            const shuffledOptions = this.shuffleArray([...options]);
            
            // The system knows the correct option by its text
            const correctText = q[`option_${q.correct_option.toLowerCase()}`];
            
            return {
                ...q,
                shuffledOptions,
                correctText
            };
        });

        // Store session state
        this.currentExam = exam;
        this.currentQuestions = questions;
        this.currentQuestionIndex = 0;
        this.userAnswers = {};
        this.examDurationSeconds = (exam.duration || 30) * 60;
        this.examTimeLeft = this.examDurationSeconds;

        this.renderCBTExamInterface();
        this.startExamTimer();
    },

    shuffleArray(array) {
        for (let i = array.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [array[i], array[j]] = [array[j], array[i]];
        }
        return array;
    },

    startExamTimer() {
        if (this.examTimerInterval) clearInterval(this.examTimerInterval);
        this.examTimerInterval = setInterval(() => {
            this.examTimeLeft--;
            const timerEl = document.getElementById('exam-timer');
            if (timerEl) {
                const mins = Math.floor(this.examTimeLeft / 60);
                const secs = this.examTimeLeft % 60;
                timerEl.textContent = `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
                if (this.examTimeLeft <= 300) timerEl.style.color = '#ef4444';
            }
            if (this.examTimeLeft <= 0) {
                clearInterval(this.examTimerInterval);
                this.submitExam();
            }
        }, 1000);
    },

    renderCBTExamInterface() {
        const q = this.currentQuestions[this.currentQuestionIndex];
        const progress = ((this.currentQuestionIndex + 1) / this.currentQuestions.length) * 100;

        this.contentArea.innerHTML = `
            <div class="view-container animate-fade-in" style="max-width: 900px; margin: 0 auto; padding-top: 2rem;">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 2rem;">
                    <div>
                        <h2 style="font-weight: 800; color: #1e293b; margin: 0;">${this.currentExam.title}</h2>
                        <p style="color: #64748b; font-size: 0.85rem; font-weight: 600;">Question ${this.currentQuestionIndex + 1} of ${this.currentQuestions.length}</p>
                    </div>
                    <div id="exam-timer" style="font-size: 2rem; font-weight: 900; font-family: 'JetBrains Mono', monospace; color: #4338ca; background: #eef2ff; padding: 0.5rem 1.5rem; border-radius: 16px; min-width: 120px; text-align: center; box-shadow: inset 0 2px 4px rgba(0,0,0,0.05);">
                        00:00
                    </div>
                </div>

                <div style="width: 100%; height: 8px; background: #e2e8f0; border-radius: 4px; margin-bottom: 2.5rem; overflow: hidden;">
                    <div style="width: ${progress}%; height: 100%; background: #4338ca; transition: width 0.4s ease;"></div>
                </div>

                <div class="card" style="padding: 2.5rem; border-radius: 24px; box-shadow: 0 20px 25px -5px rgba(0,0,0,0.1); border: 1px solid #f1f5f9; margin-bottom: 2rem;">
                    <div style="font-size: 1.25rem; font-weight: 700; color: #1e293b; line-height: 1.6; margin-bottom: 2.5rem;">
                        ${q.question_text}
                    </div>

                    <div style="display: flex; flex-direction: column; gap: 1rem;">
                        ${q.shuffledOptions.map((opt, idx) => `
                            <label style="display: flex; align-items: center; gap: 1rem; padding: 1.25rem; border: 2px solid ${this.userAnswers[q.id] === opt.text ? '#4338ca' : '#f1f5f9'}; border-radius: 16px; cursor: pointer; transition: all 0.2s; background: ${this.userAnswers[q.id] === opt.text ? '#f5f7ff' : 'white'};" class="option-label">
                                <input type="radio" name="exam-option" value="${opt.text}" ${this.userAnswers[q.id] === opt.text ? 'checked' : ''} style="width: 20px; height: 20px; accent-color: #4338ca;" onchange="UI.saveExamProgress('${q.id}', this.value)">
                                <div style="display: flex; align-items: center; gap: 1rem; width: 100%;">
                                    <span style="font-weight: 800; color: ${this.userAnswers[q.id] === opt.text ? '#4338ca' : '#94a3b8'}; background: ${this.userAnswers[q.id] === opt.text ? '#eef2ff' : '#f8fafc'}; width: 32px; height: 32px; border-radius: 8px; display: flex; align-items: center; justify-content: center; font-size: 0.85rem;">
                                        ${String.fromCharCode(65 + idx)}
                                    </span>
                                    <span style="font-weight: 600; color: #334155;">${opt.text}</span>
                                </div>
                            </label>
                        `).join('')}
                    </div>
                </div>

                <div style="display: flex; justify-content: space-between; align-items: center;">
                    <button class="btn btn-secondary" style="border-radius: 12px; height: 52px; padding: 0 1.5rem;" onclick="UI.prevQuestion()" ${this.currentQuestionIndex === 0 ? 'disabled' : ''}>
                        <i data-lucide="arrow-left"></i> Previous
                    </button>
                    
                    <div style="display: flex; gap: 1rem;">
                        <button class="btn btn-danger" style="border-radius: 12px; height: 52px; padding: 0 1.5rem; background: #fff1f2; color: #e11d48; border: 1px solid #fecdd3;" onclick="UI.confirmSubmitExam()">
                            Submit Exam
                        </button>
                        
                        ${this.currentQuestionIndex === this.currentQuestions.length - 1 ? `
                            <button class="btn btn-primary" style="border-radius: 12px; height: 52px; padding: 0 2rem; background: #059669;" onclick="UI.confirmSubmitExam()">
                                Finalize & Submit <i data-lucide="check-circle" style="margin-left: 0.5rem;"></i>
                            </button>
                        ` : `
                            <button class="btn btn-primary" style="border-radius: 12px; height: 52px; padding: 0 2rem; background: #4338ca;" onclick="UI.nextQuestion()">
                                Next Question <i data-lucide="arrow-right" style="margin-left: 0.5rem;"></i>
                            </button>
                        `}
                    </div>
                </div>
            </div>
        `;

        if (typeof lucide !== 'undefined') lucide.createIcons();
    },

    saveExamProgress(questionId, value) {
        this.userAnswers[questionId] = value;
        // Visual feedback
        this.renderCBTExamInterface();
    },

    nextQuestion() {
        if (this.currentQuestionIndex < this.currentQuestions.length - 1) {
            this.currentQuestionIndex++;
            this.renderCBTExamInterface();
        }
    },

    prevQuestion() {
        if (this.currentQuestionIndex > 0) {
            this.currentQuestionIndex--;
            this.renderCBTExamInterface();
        }
    },

    confirmSubmitExam() {
        const unanswered = this.currentQuestions.length - Object.keys(this.userAnswers).length;
        const msg = unanswered > 0 
            ? `You have ${unanswered} unanswered questions. Are you sure you want to submit?`
            : `Are you sure you want to submit your exam now?`;
            
        if (confirm(msg)) {
            this.submitExam();
        }
    },

    async submitExam() {
        if (this.examTimerInterval) clearInterval(this.examTimerInterval);
        
        let score = 0;
        this.currentQuestions.forEach(q => {
            if (this.userAnswers[q.id] === q.correctText) {
                score++;
            }
        });

        const result = prepareForSync({
            id: `RES${Math.random().toString(36).substr(2,9).toUpperCase()}`,
            exam_id: this.currentExam.id,
            student_id: this.currentUser.assigned_id || this.currentUser.id,
            score,
            total_questions: this.currentQuestions.length,
            answers: this.userAnswers,
            updated_at: new Date().toISOString()
        });

        await db.cbt_results.add(result);
        
        // Auto-post to scoresheet if configured
        if (this.currentExam.score_field) {
            await this.postCBTToScoresheet(result);
        }

        this.contentArea.innerHTML = `
            <div class="view-container text-center animate-fade-in" style="padding-top: 5rem;">
                <div style="width: 100px; height: 100px; background: #ecfdf5; color: #10b981; border-radius: 50%; display: flex; align-items: center; justify-content: center; margin: 0 auto 2rem;">
                    <i data-lucide="check-circle" style="width: 60px; height: 60px;"></i>
                </div>
                <h1 style="font-weight: 900; color: #1e293b; margin-bottom: 1rem;">Exam Submitted!</h1>
                <p style="color: #64748b; font-size: 1.1rem; margin-bottom: 3rem;">Your responses have been securely recorded. Your final score is being processed.</p>
                
                <div class="card" style="max-width: 400px; margin: 0 auto 3rem; padding: 2rem; border-radius: 20px;">
                    <div style="font-size: 0.85rem; font-weight: 800; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.1em; margin-bottom: 0.5rem;">FINAL SCORE</div>
                    <div style="font-size: 4rem; font-weight: 900; color: #4338ca;">${score} <span style="font-size: 1.5rem; color: #94a3b8;">/ ${this.currentQuestions.length}</span></div>
                </div>

                <button class="btn btn-primary" onclick="UI.renderCBT()" style="padding: 1rem 3rem; border-radius: 12px; font-weight: 800;">Return to Hub</button>
            </div>
        `;
        
        if (typeof lucide !== 'undefined') lucide.createIcons();
        syncToCloud();
    },

    async postCBTToScoresheet(result) {
        try {
            const exam = await db.cbt_exams.get(result.exam_id);
            const student = await db.students.get(result.student_id);
            if (!exam || !student) return;

            const existingScore = await db.scores
                .where('[student_id+subject_id+term+session]')
                .equals([result.student_id, exam.subject_id, exam.term, exam.session])
                .first();

            const scoreValue = Math.round((result.score / result.total_questions) * 60);

            if (existingScore) {
                const updateData = { [exam.score_field]: scoreValue };
                await db.scores.update(existingScore.id, prepareForSync(updateData));
            } else {
                const newScore = prepareForSync({
                    id: `SCR${Math.random().toString(36).substr(2,9).toUpperCase()}`,
                    student_id: result.student_id,
                    subject_id: exam.subject_id,
                    term: exam.term,
                    session: exam.session,
                    [exam.score_field]: scoreValue
                });
                await db.scores.add(newScore);
            }
        } catch (e) {
            console.error('Error posting CBT score:', e);
        }
    },

    bulkImportQuestions() {
        const modalHtml = `
            <div class="form-group">
                <label>Paste questions below in this format:</label>
                <div style="font-size:0.75rem; color:var(--text-secondary); margin-bottom:0.5rem; background:#f1f5f9; padding:0.5rem; border-radius:8px;">
                    Question text? (A) Option 1 (B) Option 2 (C) Option 3 (D) Option 4 [Ans: A]
                </div>
                <textarea id="bulk-q-text" class="cbt-input" style="height:250px; font-family:monospace; font-size:0.8rem;" placeholder="Question 1... [Ans: B]\nQuestion 2... [Ans: C]"></textarea>
            </div>
        `;

        this.showModal('Bulk Import Questions', modalHtml, () => {
            const text = document.getElementById('bulk-q-text').value;
            if (!text) return;

            const lines = text.split('\n').filter(l => l.trim() !== '');
            let count = 0;

            lines.forEach(line => {
                try {
                    // Basic Regex for: Question (A) Opt (B) Opt (C) Opt (D) Opt [Ans: X]
                    const qMatch = line.match(/(.*?)\s*\(A\)\s*(.*?)\s*\(B\)\s*(.*?)\s*\(C\)\s*(.*?)\s*\(D\)\s*(.*?)\s*\[Ans:\s*([A-E])\]/i);
                    
                    if (qMatch) {
                        this.cbtQuestions.push({
                            id: `Q${Math.random().toString(36).substr(2,7).toUpperCase()}`,
                            question_text: qMatch[1].trim(),
                            option_a: qMatch[2].trim(),
                            option_b: qMatch[3].trim(),
                            option_c: qMatch[4].trim(),
                            option_d: qMatch[5].trim(),
                            option_e: '',
                            correct_option: qMatch[6].toUpperCase()
                        });
                        count++;
                    }
                } catch (e) { console.error('Failed to parse line:', line); }
            });

            this.refreshQuestionPreview();
            Notifications.show(`Successfully imported ${count} questions`, 'success');
        }, 'Import Now');
    },

    async renderLessons() {
        const teachers = await db.profiles.where('role').equals('Teacher').toArray();
        const classes = await db.classes.toArray();
        const subjects = await db.subjects.toArray();
        const assignments = await db.subject_assignments.toArray();
        const profiles = await db.profiles.toArray();

        // Sort classes serially
        const classOrder = { 'JSS': 1, 'JS': 1, 'SSS': 2, 'SS': 2, 'PRY': 3, 'BASIC': 4 };
        classes.sort((a, b) => {
            const getParts = (name) => {
                const match = name.match(/^([A-Z]+)\s*(\d+)/i);
                if (!match) return [name.toUpperCase(), 0];
                return [match[1].toUpperCase(), parseInt(match[2])];
            };
            const [pA, nA] = getParts(a.name);
            const [pB, nB] = getParts(b.name);
            const rA = classOrder[pA] || 99;
            const rB = classOrder[pB] || 99;
            if (rA !== rB) return rA - rB;
            if (nA !== nB) return nA - nB;
            return a.name.localeCompare(b.name);
        });

        subjects.sort((a,b) => a.name.localeCompare(b.name));

        this.contentArea.innerHTML = `
            <div class="view-container animate-fade-in-up">
                <header class="view-header" style="margin-bottom: 2rem;">
                    <h1 class="text-3xl font-extrabold tracking-tight" style="color: #1e293b;">Administrative Control</h1>
                    <p class="text-secondary">Manage school infrastructure, staff, and system records.</p>
                </header>

                <div class="card" style="border-radius: 24px; padding: 2rem; border: 1px solid #f1f5f9; box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.1); margin-bottom: 2rem; background: rgba(255, 255, 255, 0.8); backdrop-filter: blur(10px);">
                    <div style="display: flex; align-items: flex-start; gap: 1rem; margin-bottom: 2rem;">
                        <div style="width: 48px; height: 48px; background: #eef2ff; border-radius: 12px; display: flex; align-items: center; justify-content: center; color: #4338ca;">
                            <i data-lucide="clipboard-list"></i>
                        </div>
                        <div>
                            <h3 style="font-weight: 800; color: #1e293b; font-size: 1.25rem;">Bulk Faculty Workload</h3>
                            <p style="color: #64748b; font-size: 0.85rem;">Select a teacher, multiple classes, and multiple subjects for high-speed deployment.</p>
                        </div>
                    </div>

                    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 2rem; margin-bottom: 2rem;">
                        <div class="form-group">
                            <label style="font-size: 0.75rem; font-weight: 700; color: #64748b; margin-bottom: 1rem; display: block;">1. TARGET STAFF MEMBERS (<span id="count-teachers">0</span>)</label>
                            <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 16px; max-height: 200px; overflow-y: auto; padding: 0.5rem;">
                                ${teachers.map(t => `
                                    <label style="display: flex; align-items: center; gap: 1rem; padding: 0.6rem 1rem; cursor: pointer; transition: background 0.2s; border-radius: 8px;" class="hover-bg">
                                        <input type="checkbox" name="bulk-teachers" value="${t.id}" onchange="document.getElementById('count-teachers').textContent = document.querySelectorAll('input[name=bulk-teachers]:checked').length">
                                        <div style="display: flex; flex-direction: column;">
                                            <span style="font-size: 0.9rem; font-weight: 700; color: #1e293b;">${t.full_name}</span>
                                            <span style="font-size: 0.7rem; color: #94a3b8;">${t.id}</span>
                                        </div>
                                    </label>
                                `).join('')}
                            </div>
                        </div>
                        <div class="form-group">
                            <label style="font-size: 0.75rem; font-weight: 700; color: #64748b; margin-bottom: 0.5rem; display: block;">TARGET SPECIALIZATION</label>
                            <div style="position: relative;">
                                <i data-lucide="activity" style="position: absolute; left: 1rem; top: 50%; transform: translateY(-50%); color: #10b981; width: 18px;"></i>
                                <select id="bulk-specialization" class="input" style="padding-left: 2.75rem; width: 100%; border-radius: 12px; height: 52px; background: #f8fafc; border: 1px solid #e2e8f0;">
                                    <option value="Common Subject">Common Subject</option>
                                    <option value="Specialized">Specialized</option>
                                    <option value="Elective">Elective</option>
                                </select>
                            </div>
                            <div style="margin-top: 1.5rem; padding: 1.25rem; background: #f0fdf4; border-radius: 16px; border: 1px solid #dcfce7;">
                                <h4 style="font-size: 0.75rem; color: #166534; font-weight: 800; margin-bottom: 0.5rem;">PRO TIP</h4>
                                <p style="font-size: 0.7rem; color: #166534; line-height: 1.5;">Selecting multiple teachers, classes, and subjects will create a combined workload matrix instantly.</p>
                            </div>
                        </div>
                    </div>

                    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 2rem; margin-bottom: 2rem;">
                        <div>
                            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem;">
                                <label style="font-size: 0.75rem; font-weight: 700; color: #64748b; display: block; margin: 0;">2. SELECT DEPLOYMENT CLASSES (<span id="count-classes">0</span>)</label>
                                <div style="display: flex; gap: 0.5rem;">
                                    <button class="btn-xs" onclick="UI.bulkSelectClasses('all')">ALL</button>
                                    <button class="btn-xs" onclick="UI.bulkSelectClasses('jss')">JSS</button>
                                    <button class="btn-xs" onclick="UI.bulkSelectClasses('sss')">SSS</button>
                                </div>
                            </div>
                            <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 16px; max-height: 250px; overflow-y: auto; padding: 0.5rem;">
                                ${classes.map(c => `
                                    <label style="display: flex; align-items: center; gap: 1rem; padding: 0.75rem 1rem; cursor: pointer; transition: background 0.2s; border-radius: 8px;" class="hover-bg" data-class-name="${c.name}">
                                        <input type="checkbox" name="bulk-classes" value="${c.name}" onchange="document.getElementById('count-classes').textContent = document.querySelectorAll('input[name=bulk-classes]:checked').length">
                                        <span style="font-size: 0.9rem; font-weight: 600; color: #334155;">${c.name}</span>
                                    </label>
                                `).join('')}
                            </div>
                        </div>
                        <div>
                            <label style="font-size: 0.75rem; font-weight: 700; color: #64748b; margin-bottom: 1rem; display: block;">3. SELECT SUBJECT TITLES (<span id="count-subjects">0</span>)</label>
                            <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 16px; max-height: 250px; overflow-y: auto; padding: 0.5rem;">
                                ${subjects.map(s => `
                                    <label style="display: flex; align-items: center; gap: 1rem; padding: 0.75rem 1rem; cursor: pointer; transition: background 0.2s; border-radius: 8px;" class="hover-bg">
                                        <input type="checkbox" name="bulk-subjects" value="${s.id}" onchange="document.getElementById('count-subjects').textContent = document.querySelectorAll('input[name=bulk-subjects]:checked').length">
                                        <span style="font-size: 0.9rem; font-weight: 600; color: #334155;">${s.name}</span>
                                    </label>
                                `).join('')}
                            </div>
                        </div>
                    </div>

                    <div style="display: flex; justify-content: flex-end;">
                        <button id="btn-deploy-workload" class="btn btn-primary" style="padding: 1rem 2rem; border-radius: 12px; font-weight: 800; background: linear-gradient(to right, #4338ca, #312e81); border: none; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);">
                            Secure Deployment Plan <i data-lucide="shield-check" style="margin-left: 0.5rem; width: 18px;"></i>
                        </button>
                    </div>
                </div>

                <div class="card" style="border-radius: 24px; padding: 1.5rem; border: 1px solid #f1f5f9; background: white;">
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1.5rem; padding: 0 0.5rem;">
                        <h3 style="font-weight: 800; color: #1e293b; display: flex; align-items: center; gap: 0.5rem;">
                            <div style="width: 4px; height: 16px; background: #4338ca; border-radius: 2px;"></div>
                            Active Deployment Registry
                        </h3>
                        <span class="badge" style="background: #f1f5f9; color: #64748b; font-weight: 700; padding: 0.5rem 1rem;">${assignments.length} TOTAL</span>
                    </div>

                    <div class="table-container">
                        <table class="data-table mobile-stack-table">
                            <thead>
                                <tr style="background: #f8fafc;">
                                    <th style="font-size: 0.7rem; color: #94a3b8; font-weight: 800; text-transform: uppercase;">Faculty Member</th>
                                    <th style="font-size: 0.7rem; color: #94a3b8; font-weight: 800; text-transform: uppercase;">Class</th>
                                    <th style="font-size: 0.7rem; color: #94a3b8; font-weight: 800; text-transform: uppercase;">Subject</th>
                                    <th style="font-size: 0.7rem; color: #94a3b8; font-weight: 800; text-transform: uppercase;">Specialization</th>
                                    <th style="font-size: 0.7rem; color: #94a3b8; font-weight: 800; text-transform: uppercase;">Control</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${assignments.length === 0 ? '<tr><td colspan="5" class="text-center p-4">Waiting for faculty deployments...</td></tr>' : 
                                    assignments.map(a => {
                                        const teacher = profiles.find(p => p.id === a.teacher_id);
                                        const subject = subjects.find(s => s.id === a.subject_id);
                                        return `
                                            <tr>
                                                <td data-label="Faculty Member">
                                                    <div style="display: flex; align-items: center; gap: 0.75rem;">
                                                        <div style="width: 32px; height: 32px; background: #f1f5f9; border-radius: 8px; display: flex; align-items: center; justify-content: center; font-weight: 700; color: #4338ca; font-size: 0.75rem;">
                                                            ${teacher ? teacher.full_name.charAt(0) : '?'}
                                                        </div>
                                                        <span style="font-weight: 600;">${teacher ? teacher.full_name : 'Unknown'}</span>
                                                    </div>
                                                </td>
                                                <td data-label="Class"><span class="badge" style="background: #eef2ff; color: #4338ca;">${a.class_name}</span></td>
                                                <td data-label="Subject"><span style="font-weight: 600; color: #334155;">${subject ? subject.name : 'N/A'}</span></td>
                                                <td data-label="Specialization"><span class="badge" style="background: #f0fdf4; color: #16a34a; font-size: 0.7rem;">${a.specialization || 'Common'}</span></td>
                                                <td data-label="Control">
                                                    <button class="btn btn-sm" style="color: #ef4444; background: #fef2f2; border-radius: 8px; width: 32px; height: 32px; padding: 0; display: flex; align-items: center; justify-content: center;" onclick="UI.deleteAssignment('${a.id}')">
                                                        <i data-lucide="trash-2" style="width: 16px;"></i>
                                                    </button>
                                                </td>
                                            </tr>
                                        `;
                                    }).join('')}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        `;

        if (typeof lucide !== 'undefined') lucide.createIcons();

        document.getElementById('btn-deploy-workload').onclick = () => this.deployWorkload();
    },

    bulkSelectClasses(type) {
        const checkboxes = document.querySelectorAll('input[name=bulk-classes]');
        checkboxes.forEach(cb => {
            const label = cb.closest('label');
            const name = label.getAttribute('data-class-name').toLowerCase();
            if (type === 'all') cb.checked = true;
            else if (type === 'jss' && (name.includes('jss') || name.includes('js'))) cb.checked = true;
            else if (type === 'sss' && (name.includes('sss') || name.includes('ss'))) cb.checked = true;
            else cb.checked = false;
        });
        document.getElementById('count-classes').textContent = document.querySelectorAll('input[name=bulk-classes]:checked').length;
    },

    async deployWorkload() {
        const checkedTeachers = Array.from(document.querySelectorAll('input[name=bulk-teachers]:checked')).map(i => i.value);
        const specialization = document.getElementById('bulk-specialization').value;
        const checkedClasses = Array.from(document.querySelectorAll('input[name=bulk-classes]:checked')).map(i => i.value);
        const checkedSubjects = Array.from(document.querySelectorAll('input[name=bulk-subjects]:checked')).map(i => i.value);

        if (checkedTeachers.length === 0 || checkedClasses.length === 0 || checkedSubjects.length === 0) {
            return Notifications.show('Please select at least one teacher, class, and subject.', 'error');
        }

        const btn = document.getElementById('btn-deploy-workload');
        btn.disabled = true;
        btn.innerHTML = 'Deploying...';

        try {
            const allAssignments = await db.subject_assignments.toArray();
            let addedCount = 0;

            for (const teacherId of checkedTeachers) {
                for (const className of checkedClasses) {
                    for (const subId of checkedSubjects) {
                        const existing = allAssignments.find(a => 
                            a.teacher_id === teacherId && 
                            a.subject_id === subId && 
                            a.class_name === className
                        );
                        
                        if (!existing) {
                            await db.subject_assignments.add(prepareForSync({
                                id: `ASG${Math.random().toString(36).substr(2,9).toUpperCase()}`,
                                teacher_id: teacherId,
                                subject_id: subId,
                                class_name: className,
                                specialization: specialization
                            }));
                            addedCount++;
                        }
                    }
                }
            }
            Notifications.show(`Workload deployed! ${addedCount} new assignments created.`, 'success');
            this.renderLessons();
            syncToCloud();
        } catch (e) {
            console.error(e);
            Notifications.show('Deployment failed.', 'error');
        } finally {
            btn.disabled = false;
            btn.innerHTML = 'Secure Deployment Plan <i data-lucide="shield-check" style="margin-left: 0.5rem; width: 18px;"></i>';
            if (typeof lucide !== 'undefined') lucide.createIcons();
        }
    },

    async deleteAssignment(id) {
        if (confirm('Are you sure you want to delete this assignment?')) {
            await db.subject_assignments.delete(id);
            Notifications.show('Assignment removed', 'success');
            this.renderLessons();
            syncToCloud();
        }
    },

    isAnswerCloseEnough(studentAns, correctAns) {
        if (!studentAns || !correctAns) return false;
        const s = studentAns.toLowerCase().trim().replace(/\s+/g, ' ');
        const c = correctAns.toLowerCase().trim().replace(/\s+/g, ' ');
        return s === c;
    }
};
