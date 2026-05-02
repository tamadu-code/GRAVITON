/**
 * Graviton CMS - UI Renderer
 * Manages view transitions and dynamic content
 */
console.log('UI Module Loading...');

import db, { prepareForSync, generateStudentId } from './db.js';
import { ScoringEngine, Notifications, parseExcel, generateReportCard, generateCredentialsPDF, generateMastersheet } from './utils.js';
import { syncToCloud, syncFromCloud, registerUser, updateUserPassword } from './supabase-client.js';

export const UI = {
    get contentArea() { return document.getElementById('content-area'); },
    get viewTitle() { return document.getElementById('view-title'); },
    currentUser: {
        role: localStorage.getItem('user_role') || 'Admin',
        name: 'Admin User'
    },
    
    async updateInstitutionalBranding() {
        const allSettings = await db.settings.toArray();
        const settings = {};
        allSettings.forEach(s => settings[s.key] = s.value);
        
        const schoolName = settings.schoolName || 'NEW KINGS AND QUEENS MONTESSORI';
        const schoolLogo = settings.schoolLogo;
        const themeColor = settings.themeColor || '#060495';
        
        // Apply theme color as CSS variable for desktop header
        document.documentElement.style.setProperty('--school-theme-color', themeColor);
        
        const sidebarName = document.getElementById('sidebar-school-name');
        const sidebarLogo = document.getElementById('sidebar-school-logo');
        const desktopName = document.getElementById('desktop-school-name');
        
        if (sidebarName) sidebarName.textContent = schoolName.toUpperCase();
        if (desktopName) desktopName.textContent = schoolName.toUpperCase();
        
        if (sidebarLogo) {
            sidebarLogo.textContent = schoolName.charAt(0).toUpperCase();
            sidebarLogo.style.color = themeColor;
            if (schoolLogo) {
                sidebarLogo.innerHTML = `<img src="${schoolLogo}" style="width: 100%; height: 100%; border-radius: 12px; object-fit: cover;">`;
            }
        }
    },

    async renderView(viewName) {
        try {
            if (!this.contentArea) {
                console.error('Content area not found');
                return;
            }

            this.showLoader();
            await this.updateInstitutionalBranding();
            
            // Update Title
            if (this.viewTitle) {
                this.viewTitle.textContent = viewName.charAt(0).toUpperCase() + viewName.slice(1);
            }
            
            // Clear dynamic header content
            try {
                const extraHeader = document.getElementById('top-bar-extra');
                if (extraHeader) extraHeader.innerHTML = '';
            } catch (e) { console.warn('Failed to clear extra header:', e); }

            // Role-Based Access Control
            const role = (this.currentUser.role || '').toLowerCase();
            const isTeacher = role === 'teacher';
            const isStudent = role === 'student';
            const isParent = role === 'parent';

            const restrictedForTeachers = ['academic', 'bulkimport', 'staff', 'promotion', 'config', 'reports'];
            const allowedForStudents = ['dashboard', 'attendance', 'gradebook', 'cbt', 'noticeboard'];
            const allowedForParents = ['dashboard', 'attendance', 'gradebook', 'cbt', 'noticeboard'];
            
            let isRestricted = false;
            if (isTeacher && restrictedForTeachers.includes(viewName)) isRestricted = true;
            if (isStudent && !allowedForStudents.includes(viewName)) isRestricted = true;
            if (isParent && !allowedForParents.includes(viewName)) isRestricted = true;

            if (isRestricted) {
                this.contentArea.innerHTML = `
                    <div class="view-container animate-fade-in" style="display: flex; align-items: center; justify-content: center; height: 70vh;">
                        <div class="text-center" style="max-width: 400px; padding: 2rem; background: white; border-radius: 24px; box-shadow: var(--shadow-lg);">
                            <div style="background: #fee2e2; color: #ef4444; width: 80px; height: 80px; border-radius: 20px; display: flex; align-items: center; justify-content: center; margin: 0 auto 1.5rem; transform: rotate(-10deg);">
                                <i data-lucide="shield-alert" style="width: 40px; height: 40px;"></i>
                            </div>
                            <h2 style="font-weight: 900; font-size: 1.5rem; color: #1e293b; margin-bottom: 0.5rem;">Access Restricted</h2>
                            <p style="color: #64748b; font-size: 0.9rem; line-height: 1.6;">You are not authorized to access the <strong>${viewName}</strong> module. Please contact the administrator if you believe this is an error.</p>
                            <button class="btn btn-primary" onclick="UI.renderView('dashboard')" style="margin-top: 2rem; border-radius: 12px; height: 48px; padding: 0 2rem; font-weight: 700;">Back to Universe</button>
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
                case 'timetables': await this.renderTimetable(); break;
                case 'promotion': await this.renderPromotionEngine(); break;
                case 'keys': await this.renderKeys(); break;
                case 'parents': await this.renderParents(); break;
                case 'roster': await this.renderRoster(); break;
                case 'curriculum': await this.renderCurriculum(); break;
                case 'finances': await this.renderFinances(); break;
                case 'security': await this.renderSecurityLog(); break;
                case 'pins': await this.renderPins(); break;
                case 'config': await this.renderSettings(); break;
                case 'insights': await this.renderInsights(); break;
                case 'noticeboard': await this.renderNoticeBoard(); break;
                case 'profile': await this.renderProfile(); break;
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
        // Requested Teacher Nav: dashboard, active students, classes, subjects, attendance, gradebook, cbt hub, notice board
        const teacherAllowedViews = ['dashboard', 'students', 'classes', 'subjects', 'attendance', 'gradebook', 'cbt', 'noticeboard'];
        
        navItems.forEach(item => {
            const view = item.dataset.view;
            if (role !== 'admin' && !teacherAllowedViews.includes(view)) {
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
            </div>
        `;
    },

    async renderTeacherDashboard() {
        const teacherId = this.currentUser.id;
        const isTeacher = (this.currentUser.role || '').toLowerCase() === 'teacher';
        
        // ── Data Acquisition ──────────────────────────────────────────────
        const assignments = await db.subject_assignments.where('teacher_id').equals(teacherId).toArray();
        const assignedClasses = [...new Set(assignments.map(a => a.class_name))];
        const assignedSubjects = [...new Set(assignments.map(a => a.subject_id))];
        
        const allStudents = await db.students.filter(s => s.is_active !== false).toArray();
        // Filter students that the teacher actually teaches
        const myStudents = allStudents.filter(s => assignedClasses.includes(s.class_name));
        
        const session = (await db.settings.get('currentSession'))?.value || (await db.settings.get('current_session'))?.value || '2025/2026';
        const term = (await db.settings.get('currentTerm'))?.value || (await db.settings.get('current_term'))?.value || '1st Term';
        
        // Active Learners: Students with at least one score this term
        const termScores = await db.scores.where('term').equals(term).and(s => s.session === session).toArray();
        const activeLearnerIds = new Set(termScores.map(s => s.student_id));
        const activeLearners = myStudents.filter(s => activeLearnerIds.has(s.student_id)).length;

        // Attendance Stats
        const today = new Date().toISOString().split('T')[0];
        const todayAtt = await db.attendance_records.where('date').equals(today).toArray();
        const myTodayAtt = todayAtt.filter(a => myStudents.some(s => s.student_id === a.student_id));
        const presentToday = myTodayAtt.filter(a => a.status === 'Present').length;
        const attendancePct = myTodayAtt.length > 0 ? Math.round((presentToday / myTodayAtt.length) * 100) : 0;

        // Weekly Trend (Mock logic for last 5 days if real data is sparse)
        const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'];
        const weeklyTrends = days.map(d => ({ day: d, val: Math.floor(Math.random() * 40) + 60 }));

        // Form Master Check
        const formMasterAssignment = await db.form_teachers.where('teacher_id').equals(teacherId).first();
        
        // Notices
        const notices = await db.notices.where('is_active').equals(1).toArray().catch(() => []);
        const noticeHTML = notices.length > 0 
            ? notices.map(n => `<span style="margin-right: 3rem;">🔔 <strong>${n.title}</strong>: ${n.content || ''}</span>`).join('')
            : '<span style="margin-right: 3rem;">Welcome to the Academic Command Center. All systems operational.</span>';

        this.contentArea.innerHTML = `
            <div class="view-container animate-fade-in" style="padding: 1.5rem; background: #f8fafc;">
                <!-- Header & Ticker -->
                <header style="margin-bottom: 2rem;">
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1.5rem;">
                        <div>
                            <h1 style="font-size: 2.25rem; font-weight: 900; color: #1e293b; letter-spacing: -0.02em; font-family: 'Outfit', sans-serif;">Academic Command Center</h1>
                            <p style="color: #64748b; font-weight: 500;">Hello, <span style="color: #2563eb; font-weight: 700;">${this.currentUser.name}</span>. Reviewing your ${term} status.</p>
                        </div>
                        <div style="text-align: right; background: white; padding: 0.75rem 1.25rem; border-radius: 16px; border: 1px solid #e2e8f0; box-shadow: var(--shadow-sm); display: flex; align-items: center; gap: 1rem;">
                            <button id="teacher-sync-btn" class="btn btn-primary" style="height: 40px; border-radius: 10px; font-weight: 700; display: flex; align-items: center; gap: 0.5rem; background: #2563eb; color: white; border: none; padding: 0 1rem; cursor: pointer;">
                                <i data-lucide="refresh-cw" style="width: 14px;"></i> Sync Data
                            </button>
                            <div style="height: 30px; width: 1px; background: #e2e8f0;"></div>
                            <div>
                                <div style="font-size: 0.65rem; color: #94a3b8; font-weight: 800; text-transform: uppercase;">Current Session</div>
                                <div style="font-weight: 800; color: #1e293b;">${session} • ${term}</div>
                            </div>
                        </div>
                    </div>

                    <div class="live-notices" style="background: #2563eb; color: white; border-radius: 14px; overflow: hidden; display: flex; align-items: center; box-shadow: 0 10px 15px -3px rgba(37, 99, 235, 0.2);">
                        <div style="background: rgba(0,0,0,0.2); padding: 0.75rem 1.25rem; font-weight: 900; font-size: 0.7rem; letter-spacing: 0.1em; text-transform: uppercase; white-space: nowrap;">
                            <i data-lucide="radio" style="width: 14px; vertical-align: middle; margin-right: 6px;"></i> Live Updates
                        </div>
                        <div style="flex: 1; overflow: hidden;">
                            <marquee behavior="scroll" direction="left" scrollamount="5" style="padding: 0.75rem 0; font-weight: 600; font-size: 0.9rem;">
                                ${noticeHTML}
                            </marquee>
                        </div>
                    </div>
                </header>

                <!-- Analytics Grid -->
                <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 1.5rem; margin-bottom: 2.5rem;">
                    <div class="glass-card" style="background: white; padding: 1.5rem; border-radius: 24px; border: 1px solid #e2e8f0; position: relative; overflow: hidden;">
                        <div style="font-size: 0.7rem; font-weight: 800; color: #64748b; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 0.5rem;">Total Students</div>
                        <div style="font-size: 2rem; font-weight: 900; color: #1e293b;">${myStudents.length}</div>
                        <div style="font-size: 0.75rem; color: #10b981; font-weight: 700; margin-top: 0.25rem;"><i data-lucide="trending-up" style="width: 12px;"></i> Verified Pool</div>
                        <div style="position: absolute; right: -10px; bottom: -10px; opacity: 0.05; transform: rotate(-15deg);"><i data-lucide="users" style="width: 80px; height: 80px;"></i></div>
                    </div>
                    <div class="glass-card" style="background: white; padding: 1.5rem; border-radius: 24px; border: 1px solid #e2e8f0; position: relative; overflow: hidden;">
                        <div style="font-size: 0.7rem; font-weight: 800; color: #64748b; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 0.5rem;">Active Learners</div>
                        <div style="font-size: 2rem; font-weight: 900; color: #1e293b;">${activeLearners}</div>
                        <div style="font-size: 0.75rem; color: #6366f1; font-weight: 700; margin-top: 0.25rem;">${Math.round((activeLearners / (myStudents.length || 1)) * 100)}% Participation</div>
                        <div style="position: absolute; right: -10px; bottom: -10px; opacity: 0.05; transform: rotate(-15deg);"><i data-lucide="zap" style="width: 80px; height: 80px;"></i></div>
                    </div>
                    <div class="glass-card" style="background: white; padding: 1.5rem; border-radius: 24px; border: 1px solid #e2e8f0; position: relative; overflow: hidden;">
                        <div style="font-size: 0.7rem; font-weight: 800; color: #64748b; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 0.5rem;">Class Load</div>
                        <div style="font-size: 2rem; font-weight: 900; color: #1e293b;">${assignedClasses.length}</div>
                        <div style="font-size: 0.75rem; color: #f59e0b; font-weight: 700; margin-top: 0.25rem;">Across ${assignedSubjects.length} Subjects</div>
                        <div style="position: absolute; right: -10px; bottom: -10px; opacity: 0.05; transform: rotate(-15deg);"><i data-lucide="book-open" style="width: 80px; height: 80px;"></i></div>
                    </div>
                    <div class="glass-card" style="background: #1e293b; color: white; padding: 1.5rem; border-radius: 24px; border: 1px solid #334155; position: relative; overflow: hidden;">
                        <div style="font-size: 0.7rem; font-weight: 800; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 0.5rem;">Turnout Gauge</div>
                        <div style="font-size: 2rem; font-weight: 900;">${attendancePct}%</div>
                        <div style="font-size: 0.75rem; color: #38bdf8; font-weight: 700; margin-top: 0.25rem;">Daily Performance</div>
                        <div style="position: absolute; right: -10px; bottom: -10px; opacity: 0.1; transform: rotate(-15deg);"><i data-lucide="activity" style="width: 80px; height: 80px;"></i></div>
                    </div>
                </div>

                <div style="display: grid; grid-template-columns: 2fr 1fr; gap: 1.5rem;">
                    <!-- Participation Intelligence -->
                    <div style="display: flex; flex-direction: column; gap: 1.5rem;">
                        <div class="glass-card" style="background: white; padding: 2rem; border-radius: 32px; border: 1px solid #e2e8f0;">
                            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 2rem;">
                                <div>
                                    <h3 style="font-size: 1.25rem; font-weight: 800; color: #1e293b; margin: 0;">Weekly Participation Trend</h3>
                                    <p style="font-size: 0.8rem; color: #64748b;">Turnout analysis for the last 5 school days</p>
                                </div>
                                <i data-lucide="bar-chart-3" style="color: #cbd5e1; width: 32px; height: 32px;"></i>
                            </div>
                            
                            <div style="display: flex; align-items: flex-end; justify-content: space-between; height: 200px; padding: 0 1rem; border-bottom: 2px solid #f1f5f9;">
                                ${weeklyTrends.map(t => `
                                    <div style="flex: 1; display: flex; flex-direction: column; align-items: center; gap: 0.75rem;">
                                        <div style="width: 32px; height: ${t.val}%; background: linear-gradient(to top, #2563eb, #60a5fa); border-radius: 8px 8px 4px 4px; transition: all 0.6s ease; cursor: pointer;" title="${t.val}% turnout"></div>
                                        <span style="font-size: 0.75rem; font-weight: 800; color: #94a3b8; text-transform: uppercase;">${t.day}</span>
                                    </div>
                                `).join('')}
                            </div>
                        </div>

                        <div class="glass-card" style="background: white; padding: 2rem; border-radius: 32px; border: 1px solid #e2e8f0;">
                            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 2rem;">
                                <h3 style="font-size: 1.25rem; font-weight: 800; color: #1e293b; margin: 0;"><i data-lucide="calendar" style="width: 20px; vertical-align: middle; margin-right: 8px; color: #2563eb;"></i> Personal Schedule</h3>
                                <button class="btn btn-secondary" onclick="UI.renderView('timetables')" style="font-size: 0.75rem; padding: 0.5rem 1rem; border-radius: 10px;">Full Map</button>
                            </div>
                            
                            <div style="display: flex; flex-direction: column; gap: 0.75rem;">
                                <!-- Mock Schedule Items - Real implementation would fetch from db.timetable -->
                                <div style="display: flex; align-items: center; gap: 1.5rem; padding: 1rem; background: #f8fafc; border-radius: 16px; border: 1px solid #f1f5f9;">
                                    <div style="width: 80px; font-weight: 800; color: #64748b; font-size: 0.75rem;">08:30 AM</div>
                                    <div style="flex: 1;">
                                        <div style="font-weight: 800; color: #1e293b;">Mathematics</div>
                                        <div style="font-size: 0.7rem; color: #94a3b8; font-weight: 600;">JSS 3 Blue • Period 1</div>
                                    </div>
                                    <span style="background: #ecfdf5; color: #10b981; font-size: 0.6rem; font-weight: 800; padding: 4px 8px; border-radius: 6px;">COMPLETED</span>
                                </div>
                                <div style="display: flex; align-items: center; gap: 1.5rem; padding: 1rem; background: #eff6ff; border-radius: 16px; border: 1px solid #bfdbfe;">
                                    <div style="width: 80px; font-weight: 800; color: #2563eb; font-size: 0.75rem;">11:15 AM</div>
                                    <div style="flex: 1;">
                                        <div style="font-weight: 800; color: #1e293b;">Further Mathematics</div>
                                        <div style="font-size: 0.7rem; color: #94a3b8; font-weight: 600;">SSS 2 Science • Period 4</div>
                                    </div>
                                    <span style="background: #2563eb; color: white; font-size: 0.6rem; font-weight: 800; padding: 4px 8px; border-radius: 6px;">NEXT UP</span>
                                </div>
                                <div style="display: flex; align-items: center; gap: 1.5rem; padding: 1rem; background: #f8fafc; border-radius: 16px; border: 1px solid #f1f5f9; opacity: 0.6;">
                                    <div style="width: 80px; font-weight: 800; color: #64748b; font-size: 0.75rem;">01:45 PM</div>
                                    <div style="flex: 1;">
                                        <div style="font-weight: 800; color: #1e293b;">Data Processing</div>
                                        <div style="font-size: 0.7rem; color: #94a3b8; font-weight: 600;">SSS 1 Comm • Period 7</div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>

                    <!-- Right Column: Portals & Actions -->
                    <div style="display: flex; flex-direction: column; gap: 1.5rem;">
                        <!-- Announcement Portal -->
                        <div class="glass-card" style="background: white; padding: 1.75rem; border-radius: 28px; border: 1px solid #e2e8f0; box-shadow: var(--shadow-md);">
                            <h3 style="font-size: 1.1rem; font-weight: 800; color: #1e293b; margin-bottom: 1.25rem;"><i data-lucide="megaphone" style="width: 18px; color: #ef4444; vertical-align: middle; margin-right: 8px;"></i> Student Broadcast</h3>
                            <textarea id="broadcast-content" placeholder="Send a message to your students..." style="width: 100%; height: 100px; border-radius: 14px; border: 1px solid #e2e8f0; padding: 1rem; font-family: inherit; font-size: 0.9rem; margin-bottom: 1rem; outline: none; transition: border-color 0.2s; resize: none;"></textarea>
                            <button id="btn-send-broadcast" class="btn btn-primary" style="width: 100%; height: 48px; border-radius: 12px; font-weight: 700; display: flex; align-items: center; justify-content: center; gap: 0.75rem;">
                                <i data-lucide="send" style="width: 16px;"></i> Post Announcement
                            </button>
                        </div>

                        <!-- Form Master Hub -->
                        ${formMasterAssignment ? `
                        <div class="glass-card" style="background: linear-gradient(135deg, #4f46e5 0%, #3730a3 100%); color: white; padding: 1.75rem; border-radius: 28px; box-shadow: 0 15px 30px -10px rgba(79, 70, 229, 0.4);">
                            <div style="display: flex; align-items: center; gap: 1rem; margin-bottom: 1.25rem;">
                                <div style="width: 44px; height: 44px; background: rgba(255,255,255,0.2); border-radius: 12px; display: flex; align-items: center; justify-content: center;">
                                    <i data-lucide="crown" style="width: 22px;"></i>
                                </div>
                                <div>
                                    <h3 style="font-size: 1.1rem; font-weight: 800; margin: 0;">Form Master Hub</h3>
                                    <p style="font-size: 0.75rem; color: rgba(255,255,255,0.7); font-weight: 600;">Managing: ${formMasterAssignment.class_name}</p>
                                </div>
                            </div>
                            <div style="display: flex; flex-direction: column; gap: 0.75rem;">
                                <button class="btn" onclick="UI.renderView('timetables')" style="background: white; color: #4338ca; width: 100%; height: 44px; border-radius: 10px; font-weight: 700; border: none;">Edit Master Schedule</button>
                                <button class="btn" onclick="UI.renderView('attendance')" style="background: rgba(255,255,255,0.1); color: white; width: 100%; height: 44px; border-radius: 10px; font-weight: 700; border: 1px solid rgba(255,255,255,0.2);">Form Attendance</button>
                            </div>
                        </div>
                        ` : ''}

                        <!-- Quick Shortcuts -->
                        <div class="glass-card" style="background: white; padding: 1.75rem; border-radius: 28px; border: 1px solid #e2e8f0;">
                            <h3 style="font-size: 1.1rem; font-weight: 800; color: #1e293b; margin-bottom: 1.25rem;">Quick Ledger</h3>
                            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 1rem;">
                                <button class="shortcut-btn" onclick="UI.renderView('gradebook')" style="display: flex; flex-direction: column; align-items: center; gap: 0.5rem; padding: 1rem; background: #f8fafc; border-radius: 16px; border: 1px solid #f1f5f9; color: #475569; font-weight: 700; cursor: pointer;">
                                    <i data-lucide="award" style="width: 20px; color: #f59e0b;"></i>
                                    <span style="font-size: 0.75rem;">Gradebook</span>
                                </button>
                                <button class="shortcut-btn" onclick="UI.renderView('attendance')" style="display: flex; flex-direction: column; align-items: center; gap: 0.5rem; padding: 1rem; background: #f8fafc; border-radius: 16px; border: 1px solid #f1f5f9; color: #475569; font-weight: 700; cursor: pointer;">
                                    <i data-lucide="check-square" style="width: 20px; color: #10b981;"></i>
                                    <span style="font-size: 0.75rem;">Attendance</span>
                                </button>
                                <button class="shortcut-btn" onclick="UI.renderView('students')" style="display: flex; flex-direction: column; align-items: center; gap: 0.5rem; padding: 1rem; background: #f8fafc; border-radius: 16px; border: 1px solid #f1f5f9; color: #475569; font-weight: 700; cursor: pointer;">
                                    <i data-lucide="users" style="width: 20px; color: #2563eb;"></i>
                                    <span style="font-size: 0.75rem;">Directory</span>
                                </button>
                                <button class="shortcut-btn" onclick="UI.renderView('cbt')" style="display: flex; flex-direction: column; align-items: center; gap: 0.5rem; padding: 1rem; background: #f8fafc; border-radius: 16px; border: 1px solid #f1f5f9; color: #475569; font-weight: 700; cursor: pointer;">
                                    <i data-lucide="laptop" style="width: 20px; color: #7c3aed;"></i>
                                    <span style="font-size: 0.75rem;">CBT Hub</span>
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `;

        // Broadcast Logic
        const btnBroadcast = document.getElementById('btn-send-broadcast');
        if (btnBroadcast) {
            btnBroadcast.addEventListener('click', async () => {
                const content = document.getElementById('broadcast-content').value.trim();
                if (!content) return Notifications.show('Please enter announcement content', 'warning');
                
                try {
                    await db.notices.add(prepareForSync({
                        id: `N${Date.now()}`,
                        title: `Broadcast from ${this.currentUser.name}`,
                        content: content,
                        category: 'News',
                        target: 'Students',
                        author: this.currentUser.name,
                        is_active: 1
                    }));
                    syncToCloud();
                    document.getElementById('broadcast-content').value = '';
                    Notifications.show('Announcement broadcasted successfully!', 'success');
                    this.renderTeacherDashboard(); // Refresh
                } catch (e) {
                    console.error('Broadcast Error:', e);
                }
            });
        }

        const syncBtn = document.getElementById('teacher-sync-btn');
        if (syncBtn) {
            syncBtn.addEventListener('click', async () => {
                const icon = syncBtn.querySelector('i');
                if (icon) icon.classList.add('spinning');
                
                try {
                    Notifications.show('Syncing with cloud...', 'info');
                    await syncFromCloud(true);
                    await syncToCloud();
                    Notifications.show('Cloud Synchronization Complete!', 'success');
                    this.renderTeacherDashboard(); // Refresh
                } catch (err) {
                    Notifications.show('Sync failed. Check connection.', 'error');
                } finally {
                    if (icon) icon.classList.remove('spinning');
                }
            });
        }

        if (typeof lucide !== 'undefined') lucide.createIcons();
    },

    async renderStudentDashboard() {
        const studentId = this.currentUser.assigned_id || '';
        const student = await db.students.get(studentId);
        
        // ─── Data Gathering ───
        const analytics = await db.student_analytics.get(studentId) || {
            average: 0, rank: 'N/A', fee_balance: 0, attendance_rate: 0
        };
        const allNotices = await db.notices.toArray();
        const activeNotices = allNotices.filter(n => n.is_active !== 0 && (n.target === 'All' || n.target === 'Students' || n.target === student?.class_name));
        const liveTickerMsg = activeNotices.length > 0 ? activeNotices.map(n => `[ ${n.category.toUpperCase()} ] ${n.title}: ${n.content}`).join(' ••• ') : "Welcome to the Graviton Student Universe. Stay focused on your goals.";
        
        const results = await db.cbt_results ? await db.cbt_results.where('student_id').equals(studentId).toArray() : [];
        const attendance = await db.attendance_records ? await db.attendance_records.where('student_id').equals(studentId).toArray() : [];
        
        const hasFeeBalance = analytics.fee_balance > 0;
        const displayAvg = hasFeeBalance ? '???' : (analytics.average || 0).toFixed(1) + '%';
        const displayRank = hasFeeBalance ? '???' : analytics.rank || 'N/A';

        this.contentArea.innerHTML = `
            <div class="view-container animate-fade-in student-universe-bg" style="padding: 1.5rem; min-height: 100vh;">
                <!-- ─── Live Announcement Ticker ─── -->
                <div class="live-ticker-container">
                    <div class="ticker-content">${liveTickerMsg}</div>
                </div>

                <!-- ─── Sophisticated Header ─── -->
                <header class="glass-header" style="margin-bottom: 2.5rem; padding: 2rem; border-radius: 24px; display: flex; justify-content: space-between; align-items: center; box-shadow: var(--shadow-lg);">
                    <div>
                        <h1 style="font-size: 2.5rem; font-weight: 900; color: #1e293b; letter-spacing: -1.5px; margin: 0;">Student Universe</h1>
                        <p style="color: #64748b; font-size: 1.1rem; font-weight: 500; margin-top: 0.5rem;">Academic & Financial Command Center</p>
                    </div>
                    <div style="text-align: right;">
                        <div class="badge" style="background: rgba(79, 70, 229, 0.1); color: #4f46e5; font-weight: 900; font-size: 1rem; padding: 0.8rem 1.5rem; border-radius: 16px; border: 1px solid rgba(79, 70, 229, 0.2);">
                            ${student?.class_name || 'Unassigned'}
                        </div>
                    </div>
                </header>

                <!-- ─── KPI Visualization ─── -->
                <div class="kpi-grid">
                    <div class="kpi-card" style="border-left: 6px solid #4f46e5;">
                        <div class="kpi-icon-wrapper" style="background: rgba(79, 70, 229, 0.1); color: #4f46e5;">
                            <i data-lucide="award"></i>
                        </div>
                        <div class="kpi-info">
                            <div class="kpi-value">${displayAvg}</div>
                            <div class="kpi-label">Average Score</div>
                        </div>
                        ${hasFeeBalance ? `<div class="locked-overlay"><i data-lucide="lock" class="lock-icon"></i><span style="font-size:0.6rem; font-weight:900; color:#ef4444;">CLEAR FEES TO VIEW</span></div>` : ''}
                    </div>

                    <div class="kpi-card" style="border-left: 6px solid #8b5cf6;">
                        <div class="kpi-icon-wrapper" style="background: rgba(139, 92, 246, 0.1); color: #8b5cf6;">
                            <i data-lucide="trending-up"></i>
                        </div>
                        <div class="kpi-info">
                            <div class="kpi-value">${displayRank}</div>
                            <div class="kpi-label">Class Position</div>
                        </div>
                        ${hasFeeBalance ? `<div class="locked-overlay"><i data-lucide="lock" class="lock-icon"></i><span style="font-size:0.6rem; font-weight:900; color:#ef4444;">LOCKED</span></div>` : ''}
                    </div>

                    <div class="kpi-card" style="border-left: 6px solid #10b981;">
                        <div class="kpi-icon-wrapper" style="background: rgba(16, 185, 129, 0.1); color: #10b981;">
                            <i data-lucide="calendar-check"></i>
                        </div>
                        <div class="kpi-info">
                            <div class="kpi-value">${analytics.attendance_rate || 0}%</div>
                            <div class="kpi-label">Attendance</div>
                        </div>
                    </div>

                    <div class="kpi-card" style="border-left: 6px solid ${hasFeeBalance ? '#ef4444' : '#10b981'};">
                        <div class="kpi-icon-wrapper" style="background: ${hasFeeBalance ? 'rgba(239, 68, 68, 0.1)' : 'rgba(16, 185, 129, 0.1)'}; color: ${hasFeeBalance ? '#ef4444' : '#10b981'};">
                            <i data-lucide="credit-card"></i>
                        </div>
                        <div class="kpi-info">
                            <div class="kpi-value">₦${(analytics.fee_balance || 0).toLocaleString()}</div>
                            <div class="kpi-label">Fee Balance</div>
                        </div>
                    </div>
                </div>

                <div style="display: grid; grid-template-columns: 2fr 1fr; gap: 2rem;">
                    <!-- ─── Main Content Column ─── -->
                    <div style="display: flex; flex-direction: column; gap: 2rem;">
                        <!-- Financial Management -->
                        <div class="card" style="border-radius: 24px; padding: 2rem;">
                            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1.5rem;">
                                <h3 style="font-weight: 900; color: #1e293b; display: flex; align-items: center; gap: 0.75rem;">
                                    <i data-lucide="wallet" style="color: #4f46e5;"></i> Financial Management
                                </h3>
                                ${hasFeeBalance ? `<button class="btn btn-primary" onclick="UI.handlePaystackPayment()" style="background: #10b981; border: none; border-radius: 12px; height: 44px; padding: 0 1.5rem; font-weight: 800;">Pay Balance Online</button>` : `<span class="badge success">CLEARANCE GRANTED</span>`}
                            </div>
                            
                            <div class="table-container" style="border: 1px solid #f1f5f9; border-radius: 16px; background: #f8fafc;">
                                <table class="data-table">
                                    <thead>
                                        <tr>
                                            <th>Reference</th>
                                            <th>Date</th>
                                            <th>Amount</th>
                                            <th>Status</th>
                                            <th style="text-align: right;">Action</th>
                                        </tr>
                                    </thead>
                                    <tbody id="payment-history-body">
                                        <!-- Will be populated via JS -->
                                    </tbody>
                                </table>
                            </div>
                        </div>

                        <!-- Academic Life: Timetable -->
                        <div class="card" style="border-radius: 24px; padding: 2rem;">
                            <h3 style="font-weight: 900; color: #1e293b; margin-bottom: 1.5rem; display: flex; align-items: center; gap: 0.75rem;">
                                <i data-lucide="calendar" style="color: #8b5cf6;"></i> Academic Life & Scheduling
                            </h3>
                            <div id="timetable-visualizer-container" style="background: #f8fafc; border-radius: 16px; padding: 1.5rem; border: 1px solid #f1f5f9; min-height: 200px; display: flex; align-items: center; justify-content: center;">
                                <div style="text-align: center; opacity: 0.5;">
                                    <i data-lucide="loader-2" class="spin-animation" style="width: 32px; height: 32px; margin-bottom: 1rem;"></i>
                                    <p>Assembling Timetable...</p>
                                </div>
                            </div>
                        </div>
                    </div>

                    <!-- ─── Side Bar Column ─── -->
                    <div style="display: flex; flex-direction: column; gap: 2rem;">
                        <!-- CBT Hub Quick Access -->
                        <div class="card" style="border-radius: 24px; padding: 1.5rem; background: linear-gradient(135deg, #4f46e5 0%, #3730a3 100%); color: white; border: none; box-shadow: var(--shadow-lg);">
                            <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 1.5rem;">
                                <div>
                                    <h4 style="font-weight: 800; margin: 0; font-size: 1rem; display: flex; align-items: center; gap: 0.5rem;">
                                        <i data-lucide="monitor"></i> CBT Exam Center
                                    </h4>
                                    <p style="font-size: 0.7rem; opacity: 0.8; margin-top: 0.25rem; font-weight: 600;">Available & Upcoming Tests</p>
                                </div>
                                <div style="background: rgba(255,255,255,0.2); width: 40px; height: 40px; border-radius: 12px; display: flex; align-items: center; justify-content: center;">
                                    <i data-lucide="zap" style="width: 20px;"></i>
                                </div>
                            </div>
                            
                            <div style="display: flex; flex-direction: column; gap: 0.75rem;">
                                ${results.length > 0 ? `
                                    <div style="background: rgba(255,255,255,0.1); padding: 1rem; border-radius: 16px; border: 1px solid rgba(255,255,255,0.1);">
                                        <div style="font-size: 0.65rem; font-weight: 800; text-transform: uppercase; opacity: 0.7;">Last Result</div>
                                        <div style="font-size: 1.25rem; font-weight: 900; margin-top: 2px;">${results[results.length - 1].score} / ${results[results.length - 1].total_questions}</div>
                                    </div>
                                ` : ''}
                                
                                <button class="btn btn-primary" onclick="UI.renderView('cbt')" style="width: 100%; border-radius: 12px; height: 48px; background: white; color: #4338ca; border: none; font-weight: 800; margin-top: 0.5rem;">
                                    Enter CBT Hub <i data-lucide="chevron-right" style="margin-left: 0.5rem;"></i>
                                </button>
                            </div>
                        </div>

                        <!-- Bio-Data Profile -->
                        <div class="card" style="border-radius: 24px; padding: 2rem; text-align: center; position: relative; overflow: hidden;">
                             <div style="position: absolute; top: 0; left: 0; width: 100%; height: 6px; background: linear-gradient(to right, #4f46e5, #8b5cf6);"></div>
                             <div style="width: 120px; height: 120px; border-radius: 50%; border: 4px solid #f1f5f9; overflow: hidden; margin: 0 auto 1.5rem; box-shadow: var(--shadow-md);">
                                <img src="https://api.dicebear.com/7.x/avataaars/svg?seed=${student?.student_id || student?.name}" style="width: 100%; height: 100%; object-fit: cover;">
                             </div>
                             <h3 style="font-weight: 900; color: #1e293b; margin: 0;">${student?.name || this.currentUser.name}</h3>
                             <p style="color: #94a3b8; font-weight: 800; font-size: 0.75rem; margin-top: 0.25rem;">SERIAL: ${student?.student_id || 'PENDING'}</p>
                             
                             <div style="text-align: left; margin-top: 2rem; display: flex; flex-direction: column; gap: 1rem;">
                                <div style="display: flex; justify-content: space-between; align-items: center;">
                                    <span style="font-size: 0.7rem; font-weight: 800; color: #94a3b8; text-transform: uppercase;">Admission Date</span>
                                    <span style="font-size: 0.8rem; font-weight: 700; color: #1e293b;">${student?.admission_year || 'N/A'}</span>
                                </div>
                                <div style="display: flex; justify-content: space-between; align-items: center;">
                                    <span style="font-size: 0.7rem; font-weight: 800; color: #94a3b8; text-transform: uppercase;">Account Status</span>
                                    <span class="badge success" style="font-size: 0.6rem;">ACTIVE</span>
                                </div>
                             </div>

                             <button class="btn btn-primary w-100" onclick="UI.openResultPinModal()" style="margin-top: 2rem; border-radius: 12px; height: 48px; font-weight: 900; background: #1e293b; border: none; box-shadow: 0 10px 20px -5px rgba(30, 41, 59, 0.4);" ${hasFeeBalance ? 'disabled' : ''}>
                                ${hasFeeBalance ? '<i data-lucide="lock" style="width:16px;"></i> Clear Fees First' : 'View Full Report Card'}
                             </button>
                        </div>

                        <!-- Result Checkout Policy -->
                        <div class="card" style="background: #1e293b; color: white; border-radius: 24px; padding: 1.5rem; border: none;">
                            <h4 style="font-weight: 800; margin-bottom: 1rem; display: flex; align-items: center; gap: 0.5rem; font-size: 0.9rem;">
                                <i data-lucide="shield-check" style="color: #10b981;"></i> Gatekeeping Policy
                            </h4>
                            <p style="font-size: 0.75rem; color: #94a3b8; line-height: 1.6; margin: 0;">
                                Access to full academic reports is strictly regulated. Ensure all financial obligations are met to enable result checking via Scratch Card PINs.
                            </p>
                        </div>
                    </div>
                </div>
            </div>
        `;

        // ─── Post-Render Logic ───
        if (typeof lucide !== 'undefined') lucide.createIcons();
        this.renderPaymentHistory(studentId);
        this.renderTimetableVisualizer(student?.class_name);
    },

    async renderPaymentHistory(studentId) {
        const historyBody = document.getElementById('payment-history-body');
        if (!historyBody) return;

        const payments = await db.payments.where('student_id').equals(studentId).toArray();
        if (payments.length === 0) {
            historyBody.innerHTML = '<tr><td colspan="5" style="text-align: center; padding: 2rem; opacity: 0.5;">No transaction history found.</td></tr>';
            return;
        }

        historyBody.innerHTML = payments.map(p => `
            <tr>
                <td style="font-family: monospace; font-weight: 700; color: #4f46e5;">#${p.reference || p.id}</td>
                <td style="color: #64748b; font-size: 0.8rem;">${new Date(p.date || p.updated_at).toLocaleDateString()}</td>
                <td style="font-weight: 800; color: #1e293b;">₦${(p.amount || 0).toLocaleString()}</td>
                <td><span class="badge ${p.status === 'Success' ? 'success' : 'warning'}">${p.status}</span></td>
                <td style="text-align: right;">
                    <button class="btn btn-xs" onclick="UI.printReceipt('${p.id}')">
                        <i data-lucide="printer" style="width: 12px;"></i>
                    </button>
                </td>
            </tr>
        `).join('');
        if (typeof lucide !== 'undefined') lucide.createIcons();
    },

    async renderTimetableVisualizer(className) {
        const container = document.getElementById('timetable-visualizer-container');
        if (!container) return;

        if (!className) {
            container.innerHTML = '<div style="text-align: center; opacity: 0.5;">Select a class to view timetable.</div>';
            return;
        }

        const entries = await db.timetable.where('class_name').equals(className).toArray();
        if (entries.length === 0) {
            container.innerHTML = `
                <div style="text-align: center; opacity: 0.5;">
                    <i data-lucide="calendar-off" style="width: 32px; height: 32px; margin-bottom: 1rem;"></i>
                    <p>No timetable published for ${className} yet.</p>
                </div>
            `;
            if (typeof lucide !== 'undefined') lucide.createIcons();
            return;
        }

        // Simple Visualizer
        const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];
        container.innerHTML = `
            <div style="width: 100%; overflow-x: auto;">
                <div style="display: grid; grid-template-columns: repeat(5, 1fr); gap: 1rem; min-width: 600px;">
                    ${days.map(day => `
                        <div style="display: flex; flex-direction: column; gap: 0.5rem;">
                            <div style="font-weight: 800; color: #1e293b; font-size: 0.7rem; text-transform: uppercase; margin-bottom: 0.5rem; text-align: center; border-bottom: 2px solid #eef2ff; padding-bottom: 4px;">${day}</div>
                            ${entries.filter(e => e.day_of_week === day).sort((a,b) => a.period_number - b.period_number).map(e => `
                                <div style="background: white; padding: 0.75rem; border-radius: 12px; border: 1px solid #f1f5f9; box-shadow: var(--shadow-sm); text-align: center;">
                                    <div style="font-weight: 800; color: #4f46e5; font-size: 0.75rem;">${e.subject_id}</div>
                                    <div style="font-size: 0.6rem; color: #94a3b8; font-weight: 700; margin-top: 2px;">Period ${e.period_number}</div>
                                </div>
                            `).join('')}
                        </div>
                    `).join('')}
                </div>
            </div>
        `;
        if (typeof lucide !== 'undefined') lucide.createIcons();
    },

    async openResultPinModal() {
        const modalHtml = `
            <div style="display: flex; flex-direction: column; gap: 1.5rem; text-align: center;">
                <div style="width: 64px; height: 64px; background: #eef2ff; color: #4f46e5; border-radius: 50%; display: flex; align-items: center; justify-content: center; margin: 0 auto;">
                    <i data-lucide="key" style="width: 32px; height: 32px;"></i>
                </div>
                <div>
                    <h3 style="font-weight: 900; color: #1e293b;">Result Verification</h3>
                    <p style="color: #64748b; font-size: 0.85rem;">Enter your scratch card PIN to unlock this term's report card.</p>
                </div>
                <div>
                    <label style="text-align: left; display: block; font-weight: 800; color: #1e293b; font-size: 0.7rem; text-transform: uppercase; margin-bottom: 0.5rem;">Card PIN Code</label>
                    <input type="text" id="result-pin-input" class="input" placeholder="e.g. 1234-5678-9012" style="width: 100%; text-align: center; font-size: 1.25rem; font-weight: 900; letter-spacing: 2px; height: 56px; border-radius: 16px;">
                </div>
                <div style="background: #fff8eb; border: 1px solid #fee2e2; padding: 1rem; border-radius: 12px; display: flex; gap: 0.75rem; align-items: center; text-align: left;">
                    <i data-lucide="alert-circle" style="color: #f59e0b; flex-shrink: 0;"></i>
                    <p style="font-size: 0.7rem; color: #92400e; margin: 0; line-height: 1.4;">
                        Cards have a usage limit. Ensure you are viewing the correct Term/Session before activating.
                    </p>
                </div>
            </div>
        `;

        this.showModal('Security Clearance', modalHtml, async () => {
            const pinCode = document.getElementById('result-pin-input').value.trim();
            if (!pinCode) throw new Error('Please enter a PIN');
            
            await this.verifyResultPin(pinCode);
        }, 'Unlock Report Card', 'key');
    },

    async verifyResultPin(pinCode) {
        Notifications.show('Verifying clearance...', 'info');
        
        try {
            const pinRecord = await db.pins.where('pin_code').equals(pinCode).first();
            if (!pinRecord) {
                Notifications.show('Invalid PIN code. Please check your card.', 'error');
                return;
            }

            if (pinRecord.status !== 'Active') {
                Notifications.show('This card has already been exhausted or deactivated.', 'error');
                return;
            }

            if (pinRecord.used_count >= pinRecord.usage_limit) {
                Notifications.show('Usage limit exceeded for this card.', 'error');
                return;
            }

            // Success: Open Report Card
            Notifications.show('Security clearance granted!', 'success');
            
            // Update PIN usage
            await db.pins.update(pinRecord.id, {
                used_count: (pinRecord.used_count || 0) + 1,
                student_id: this.currentUser.assigned_id,
                updated_at: new Date().toISOString(),
                is_synced: 0
            });
            syncToCloud();

            // Generate and show report
            await generateReportCard(this.currentUser.assigned_id, 'First', '2023/2024'); // Example hardcoded
        } catch (err) {
            console.error('PIN Verification Error:', err);
            Notifications.show('Verification failed. Try again later.', 'error');
        }
    },

    handlePaystackPayment() {
        const studentId = this.currentUser.assigned_id;
        const email = this.currentUser.email || 'student@school.com';
        
        // Mocking balance for Paystack
        const amount = 5000 * 100; // N5000 in kobo

        const handler = PaystackPop.setup({
            key: 'pk_test_xxxxxxxxxxxxxxxxxxxxxxxx', // Replace with real key
            email: email,
            amount: amount,
            currency: 'NGN',
            ref: 'PAY-' + Math.floor((Math.random() * 1000000000) + 1),
            metadata: {
                student_id: studentId,
                custom_fields: [
                    { display_name: "Student ID", variable_name: "student_id", value: studentId }
                ]
            },
            callback: async (response) => {
                Notifications.show('Payment confirmed! Finalizing receipt...', 'success');
                await this.processOnlinePayment(response);
            },
            onClose: () => {
                Notifications.show('Payment cancelled.', 'warning');
            }
        });

        handler.openIframe();
    },

    async processOnlinePayment(response) {
        try {
            const newPayment = prepareForSync({
                id: response.reference,
                student_id: this.currentUser.assigned_id,
                amount: 5000, // Hardcoded for demo
                category: 'Tuition Fee',
                term: 'First',
                session: '2023/2024',
                reference: response.reference,
                status: 'Success',
                date: new Date().toISOString()
            });

            await db.payments.add(newPayment);
            
            // Update analytics balance (simplified)
            const analytics = await db.student_analytics.get(this.currentUser.assigned_id);
            if (analytics) {
                await db.student_analytics.update(this.currentUser.assigned_id, {
                    fee_balance: Math.max(0, analytics.fee_balance - 5000),
                    updated_at: new Date().toISOString(),
                    is_synced: 0
                });
            }

            syncToCloud();
            Notifications.show('Receipt generated. Refreshing dashboard...', 'success');
            setTimeout(() => this.renderStudentDashboard(), 2000);
        } catch (err) {
            console.error('Payment Processing Error:', err);
        }
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
        // Alphabetical sort (Natural sort)
        streams.sort((a, b) => (a.name || '').localeCompare(b.name || '', undefined, { numeric: true, sensitivity: 'base' }));
        
        const activeStudents = await db.students.filter(s => s.is_active !== false).toArray();
        const formTeachers = await db.form_teachers.toArray().catch(() => []);
        const profiles = await db.profiles.toArray().catch(() => []);

        if (isTeacher) {
            const assignments = await db.subject_assignments.where('teacher_id').equals(teacherId).toArray();
            const assignedClasses = new Set(assignments.map(a => a.class_name));
            // Also include classes where they are form teachers
            formTeachers.filter(f => f.teacher_id === teacherId).forEach(f => assignedClasses.add(f.class_name));
            streams = streams.filter(s => assignedClasses.has(s.name));
        }
        
        const getEnrollment = (className) => activeStudents.filter(s => s.class_name === className).length;
        
        const getFormMasterName = (className) => {
            const ft = formTeachers.find(f => f.class_name === className);
            if (!ft) return 'Unassigned';
            const profile = profiles.find(p => p.id === ft.teacher_id || p.full_name === ft.teacher_id);
            return profile ? profile.full_name : ft.teacher_id;
        };

        this.contentArea.innerHTML = `
            <div class="view-container" style="padding: 1.5rem; background: #f1f5f9;">
                <div class="page-banner" style="margin-bottom: 2rem;">
                    <div class="banner-content">
                        <h1 class="banner-title"><i data-lucide="layers"></i> Academic Streams</h1>
                        <p class="banner-subtitle">Organize classes, monitor population density, and assign form masters.</p>
                    </div>
                    <div class="banner-stats">
                        <div class="banner-stat-item">
                            <span class="stat-value">${streams.length}</span>
                            <span class="stat-label">Streams</span>
                        </div>
                        <div class="banner-stat-item">
                            <span class="stat-value">${activeStudents.length}</span>
                            <span class="stat-label">Active Students</span>
                        </div>
                    </div>
                    ${!isTeacher ? `
                    <button id="btn-add-stream" class="btn btn-primary" style="background: white; color: #2563eb; font-weight: 700; border-radius: 12px; padding: 0.75rem 1.5rem; display: flex; align-items: center; gap: 0.5rem; box-shadow: var(--shadow-md);">
                        <i data-lucide="plus-circle" style="width:18px;"></i> Add New
                    </button>
                    ` : ''}
                </div>

                <div id="streams-display-container">
                    ${window.innerWidth >= 1024 ? `
                        <!-- Desktop Grid Layout -->
                        <div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(400px, 1fr)); gap: 1.5rem;">
                            ${streams.map((s, index) => {
                                const enrollment = getEnrollment(s.name);
                                const capacity = 40;
                                const pct = Math.min(100, (enrollment / capacity) * 100);
                                const statusColor = enrollment >= capacity ? '#ef4444' : '#2563eb';
                                
                                return `
                                <div class="glass-card" style="background: white; border: 1px solid #e2e8f0; border-radius: 24px; padding: 1.75rem; transition: all 0.3s ease; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.05);">
                                    <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 1.5rem;">
                                        <div style="display: flex; align-items: center; gap: 1rem;">
                                            <div style="width: 52px; height: 52px; background: #eff6ff; color: #2563eb; border-radius: 16px; display: flex; align-items: center; justify-content: center;">
                                                <i data-lucide="graduation-cap" style="width:26px; height:26px;"></i>
                                            </div>
                                            <div>
                                                <h3 style="font-weight: 800; color: #1e293b; margin: 0; font-size: 1.25rem;">${s.name}</h3>
                                                <div style="display:flex; align-items:center; gap:0.5rem; margin-top:0.35rem;">
                                                    <span style="font-size: 0.65rem; color: #64748b; font-weight: 800; text-transform: uppercase; background:#f1f5f9; padding:3px 8px; border-radius:6px; letter-spacing: 0.05em;">STRM ${index + 1}</span>
                                                    <span style="font-size: 0.65rem; color: #059669; font-weight: 800; text-transform: uppercase; background:#ecfdf5; padding:3px 8px; border-radius:6px; letter-spacing: 0.05em;">${s.level || 'Unspecified'}</span>
                                                </div>
                                            </div>
                                        </div>
                                        <div style="text-align: right;">
                                            <div style="font-size: 1.5rem; font-weight: 900; color: #1e293b;">${enrollment}</div>
                                            <div style="font-size: 0.6rem; color: #94a3b8; font-weight: 800; text-transform: uppercase; letter-spacing: 0.05em;">STUDENTS</div>
                                        </div>
                                    </div>

                                    <div style="margin-bottom: 2rem;">
                                        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.65rem;">
                                            <span style="font-weight: 700; color: #64748b; font-size: 0.8rem;">Utilization</span>
                                            <span style="font-weight: 800; color: ${statusColor}; font-size: 0.8rem;">${Math.round(pct)}% Capacity</span>
                                        </div>
                                        <div style="width: 100%; background: #f1f5f9; height: 8px; border-radius: 4px; overflow: hidden;">
                                            <div style="height: 100%; width: ${pct}%; background: ${statusColor}; transition: width 1s cubic-bezier(0.4, 0, 0.2, 1);"></div>
                                        </div>
                                    </div>

                                    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; margin-bottom: 1.5rem;">
                                        <div style="background: #f8fafc; padding: 1rem; border-radius: 16px; border: 1px solid #f1f5f9;">
                                            <label style="display:block; color:#94a3b8; font-size:0.6rem; font-weight:800; text-transform:uppercase; margin-bottom:0.5rem;">Form Master</label>
                                            <div class="form-master-field" data-class-name="${s.name}" style="font-weight: 800; color: #2563eb; cursor: pointer; text-decoration: underline; text-decoration-style: dotted; font-size: 0.9rem;">${getFormMasterName(s.name)}</div>
                                        </div>
                                        <div style="background: #f8fafc; padding: 1rem; border-radius: 16px; border: 1px solid #f1f5f9;">
                                            <label style="display:block; color:#94a3b8; font-size:0.6rem; font-weight:800; text-transform:uppercase; margin-bottom:0.5rem;">Stream Health</label>
                                            <div style="display: flex; align-items: center; gap: 0.5rem; color: #10b981; font-weight: 800; font-size: 0.9rem;">
                                                <span style="width: 8px; height: 8px; background: #10b981; border-radius: 50%;"></span> ACTIVE
                                            </div>
                                        </div>
                                    </div>

                                    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 0.75rem;">
                                        ${!isTeacher ? `
                                        <button class="btn btn-secondary rename-class-btn" data-id="${s.id}" data-name="${s.name}" data-level="${s.level || ''}" style="height: 44px; border-radius: 12px; font-weight: 700; background: white; border: 1px solid #e2e8f0; color:#475569; font-size: 0.8rem;">
                                            <i data-lucide="settings" style="width:14px;"></i> Configure
                                        </button>
                                        <button class="btn btn-secondary delete-class-btn" data-id="${s.id}" data-name="${s.name}" data-count="${enrollment}" style="height: 44px; border-radius: 12px; color: #ef4444; background: #fef2f2; border: 1px solid #fee2e2; font-weight: 700; font-size: 0.8rem;">
                                            <i data-lucide="trash-2" style="width:14px;"></i> Remove
                                        </button>
                                        ` : `
                                        <button class="btn btn-primary" onclick="UI.renderView('attendance')" style="grid-column: 1 / -1; height: 44px; border-radius: 12px; font-weight: 700; background: #2563eb; color: white; border: none;">
                                            <i data-lucide="check-square" style="width:16px;"></i> Take Attendance
                                        </button>
                                        `}
                                    </div>
                                </div>
                                `;
                            }).join('')}
                        </div>
                    ` : `
                        <!-- Mobile Accordion Layout -->
                        <div class="stream-list" style="display: flex; flex-direction: column; gap: 1rem;">
                            ${streams.map((s, index) => {
                                const enrollment = getEnrollment(s.name);
                                const capacity = 40;
                                const pct = Math.min(100, (enrollment / capacity) * 100);
                                const statusColor = enrollment >= capacity ? '#ef4444' : '#2563eb';
                                
                                return `
                                <div class="glass-collapse-card" style="margin: 0; border: 1px solid #e2e8f0; background: white;">
                                    <input type="checkbox" id="toggle-stream-${index}" class="glass-collapse-checkbox">
                                    <label for="toggle-stream-${index}" class="glass-collapse-header" style="padding: 1.25rem 1.5rem;">
                                        <div style="display: flex; align-items: center; gap: 1.25rem;">
                                            <div style="width: 44px; height: 44px; background: #eff6ff; color: #2563eb; border-radius: 12px; display: flex; align-items: center; justify-content: center;">
                                                <i data-lucide="graduation-cap" style="width:22px; height:22px;"></i>
                                            </div>
                                            <div>
                                                <h3 style="font-weight: 800; color: #1e293b; margin: 0; font-size: 1.1rem;">${s.name}</h3>
                                                <div style="display:flex; align-items:center; gap:0.4rem; margin-top:0.15rem;">
                                                    <span style="font-size: 0.6rem; color: #059669; font-weight: 800; text-transform: uppercase; background:#ecfdf5; padding:2px 6px; border-radius:4px;">${s.level || 'N/A'}</span>
                                                </div>
                                            </div>
                                        </div>
                                        <div style="display: flex; align-items: center; gap: 1.5rem;">
                                            <div style="text-align: right;">
                                                <div style="font-size: 1.1rem; font-weight: 800; color: #1e293b;">${enrollment}</div>
                                            </div>
                                            <span class="glass-collapse-chevron"><i data-lucide="chevron-down"></i></span>
                                        </div>
                                    </label>
                                    <div class="glass-collapse-content" style="padding: 1.5rem; background: #f8fafc; border-top: 1px solid #f1f5f9;">
                                        <div style="margin-bottom: 1.5rem;">
                                            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.5rem;">
                                                <span style="font-weight: 700; color: #475569; font-size: 0.8rem;">Students</span>
                                                <span style="font-weight: 800; color: ${statusColor}; font-size: 0.8rem;">${enrollment} / ${capacity}</span>
                                            </div>
                                            <div style="width: 100%; background: #e2e8f0; height: 8px; border-radius: 4px; overflow: hidden;">
                                                <div style="height: 100%; width: ${pct}%; background: ${statusColor};"></div>
                                            </div>
                                        </div>
                                        
                                        <div style="background: white; padding: 1rem; border-radius: 12px; border: 1px solid #e2e8f0; margin-bottom: 1rem;">
                                            <div style="color:#64748b; font-size:0.65rem; font-weight:800; text-transform:uppercase; margin-bottom:0.5rem;">Form Master</div>
                                            <div class="form-master-field" data-class-name="${s.name}" style="font-weight: 800; color: #2563eb; cursor: pointer; text-decoration: underline; font-size: 0.9rem;">${getFormMasterName(s.name)}</div>
                                        </div>

                                        <div style="display: flex; gap: 0.5rem;">
                                            ${!isTeacher ? `
                                            <button class="btn btn-secondary rename-class-btn" data-id="${s.id}" data-name="${s.name}" data-level="${s.level || ''}" style="flex: 1; height: 44px; border-radius: 10px; font-weight: 700;">
                                                <i data-lucide="settings" style="width:16px;"></i>
                                            </button>
                                            <button class="btn btn-secondary delete-class-btn" data-id="${s.id}" data-name="${s.name}" data-count="${enrollment}" style="flex: 1; height: 44px; border-radius: 10px; color: #ef4444; background: #fff1f2; border: none;">
                                                <i data-lucide="trash-2" style="width:16px;"></i>
                                            </button>
                                            ` : `
                                            <button class="btn btn-primary" onclick="UI.renderView('attendance')" style="flex: 1; height: 44px; border-radius: 10px; font-weight: 700;">Take Attendance</button>
                                            `}
                                        </div>
                                    </div>
                                </div>
                                `;
                            }).join('')}
                        </div>
                    `}
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

        // Form Master Selection Logic
        document.querySelectorAll('.form-master-field').forEach(field => {
            field.addEventListener('click', async () => {
                if (isTeacher) return; // Teachers cannot reassign themselves
                
                const className = field.dataset.className;
                const profiles = await db.profiles.toArray();
                const teachers = profiles.filter(p => (p.role || '').toLowerCase() === 'teacher' || (p.role || '').toLowerCase() === 'admin');
                
                const currentFT = await db.form_teachers.where('class_name').equals(className).first();
                
                const modalHtml = `
                    <div style="margin-bottom: 1.5rem;">
                        <label style="display: block; font-size: 0.75rem; font-weight: 800; color: #64748b; text-transform: uppercase; margin-bottom: 0.5rem;">Select Form Master for ${className}</label>
                        <select id="select-form-master" class="input" style="width: 100%; height: 48px; border-radius: 12px; background: white; color: #1e293b; border: 1px solid #cbd5e1; font-weight: 600;">
                            <option value="">-- Unassigned --</option>
                            ${teachers.map(t => `<option value="${t.id}" ${currentFT && currentFT.teacher_id === t.id ? 'selected' : ''}>${t.full_name}</option>`).join('')}
                        </select>
                        <p style="font-size: 0.75rem; color: #94a3b8; margin-top: 0.5rem;">Choose a faculty member to manage academic records and attendance for this stream.</p>
                    </div>
                `;
                
                this.showModal('Form Master Assignment', modalHtml, async () => {
                    const newTeacherId = document.getElementById('select-form-master').value;
                    await this.updateFormMaster(className, newTeacherId);
                    this.renderClasses();
                }, 'Assign Master', 'user-check');
            });
        });

        // Rename/Configure Class Logic
        document.querySelectorAll('.rename-class-btn').forEach(btn => {
            btn.addEventListener('click', async () => {
                const oldName = btn.dataset.name;
                const oldLevel = btn.dataset.level;
                const id = btn.dataset.id;
                
                const modalHtml = `
                    <div style="display: flex; flex-direction: column; gap: 1rem;">
                        <div>
                            <label>Stream Name</label>
                            <input type="text" id="edit-stream-name" class="input" value="${oldName}" style="width: 100%;">
                        </div>
                        <div>
                            <label>Academic Level</label>
                            <select id="edit-stream-level" class="input" style="width: 100%;">
                                <option value="Nursery" ${oldLevel === 'Nursery' ? 'selected' : ''}>Nursery Section</option>
                                <option value="Primary" ${oldLevel === 'Primary' ? 'selected' : ''}>Primary Section</option>
                                <option value="Junior Secondary" ${oldLevel === 'Junior Secondary' || oldLevel === 'Junior' ? 'selected' : ''}>Junior Secondary</option>
                                <option value="Senior Secondary" ${oldLevel === 'Senior Secondary' || oldLevel === 'Senior' ? 'selected' : ''}>Senior Secondary</option>
                                <option value="Vocational" ${oldLevel === 'Vocational' ? 'selected' : ''}>Vocational Training</option>
                            </select>
                        </div>
                    </div>
                `;

                this.showModal('Stream Configuration', modalHtml, async () => {
                    const newName = document.getElementById('edit-stream-name').value.trim();
                    const newLevel = document.getElementById('edit-stream-level').value;
                    
                    if (!newName) {
                        Notifications.show('Name is required', 'error');
                        throw new Error('Validation failed');
                    }

                    await db.classes.update(id, prepareForSync({ name: newName, level: newLevel }));
                    await syncToCloud(); // Immediate push for class configuration
                    
                    if (newName !== oldName) {
                        const students = await db.students.where('class_name').equals(oldName).toArray();
                        for (const std of students) {
                            await db.students.update(std.student_id, { class_name: newName });
                        }
                        Notifications.show(`Stream updated. ${students.length} students reassigned to "${newName}".`, 'success');
                    } else {
                        Notifications.show(`Stream configuration saved.`, 'success');
                    }
                    this.renderClasses();
                }, 'Save Changes', 'save');
            });
        });

        // Add Stream Modal
        const btnAddStream = document.getElementById('btn-add-stream');
        if (btnAddStream) {
            btnAddStream.addEventListener('click', () => {
                const modalHtml = `
                    <div style="display: flex; flex-direction: column; gap: 1rem;">
                        <div>
                            <label>Stream Designation</label>
                            <div style="position: relative;">
                                <i data-lucide="layout" style="position: absolute; left: 1rem; top: 50%; transform: translateY(-50%); color: #64748b; width: 16px;"></i>
                                <input type="text" id="stream-name-input" class="input" placeholder="e.g. SSS 2 Science" style="padding-left: 2.5rem; width: 100%; box-sizing: border-box;">
                            </div>
                        </div>
                        <div>
                            <label>Academic Level</label>
                            <select id="stream-level-input" class="input" style="width: 100%;">
                                <option value="Nursery">Nursery Section</option>
                                <option value="Primary">Primary Section</option>
                                <option value="Junior Secondary">Junior Secondary</option>
                                <option value="Senior Secondary">Senior Secondary</option>
                                <option value="Vocational">Vocational Training</option>
                            </select>
                        </div>
                    </div>
                `;
                this.showModal('New Stream Entry', modalHtml, async () => {
                    const nameInput = document.getElementById('stream-name-input').value.trim();
                    const levelInput = document.getElementById('stream-level-input').value;

                    if (!nameInput) {
                        Notifications.show('Stream designation is required', 'error');
                        throw new Error('Validation failed');
                    }
                    
                    const existing = await db.classes.where('name').equalsIgnoreCase(nameInput).first();
                    if (existing) {
                        Notifications.show('A stream with this designation already exists', 'warning');
                        throw new Error('Duplicate');
                    }
                    
                    await db.classes.add({
                        id: `C${Math.random().toString(36).substr(2, 6).toUpperCase()}`,
                        name: nameInput,
                        level: levelInput,
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
        const teacherId = this.currentUser.id;
        
        let students = (await db.students.toArray()).sort((a,b) => (a.name || '').localeCompare(b.name || ''));
        const classes = (await db.classes.toArray()).sort((a,b) => (a.name || '').localeCompare(b.name || '', undefined, { numeric: true, sensitivity: 'base' }));
        
        // --- Teacher Specific Filtering ---
        if (isTeacher) {
            const assignments = await db.subject_assignments.where('teacher_id').equals(teacherId).toArray();
            const assignedClasses = [...new Set(assignments.map(a => a.class_name))];
            
            // Also include form teacher classes
            const formAssignments = await db.form_teachers.where('teacher_id').equals(teacherId).toArray();
            formAssignments.forEach(fa => assignedClasses.push(fa.class_name));
            
            const teacherClasses = [...new Set(assignedClasses)];
            students = students.filter(s => teacherClasses.includes(s.class_name));
        }

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
                        <button id="btn-bulk-repair-students" class="btn btn-secondary" style="border-radius: 8px; padding: 0.5rem 1rem; display: flex; align-items: center; gap: 0.4rem; background: #fef9c3; color: #854d0e; border: 1px solid #fef08a; font-size: 0.75rem; font-weight: 700;">
                            <i data-lucide="shield-alert" style="width: 14px;"></i> Bulk Repair Auth
                        </button>
                    </div>
                </div>

                <div class="directory-container">
                    <div class="directory-sidebar" style="border-radius: 16px; background: white; border: 1px solid #e2e8f0;">
                        <div class="glass-collapse-card" style="margin: 0; background: transparent; backdrop-filter: none; -webkit-backdrop-filter: none; box-shadow: none; border: none; border-bottom: 2px solid #f1f5f9; border-radius: 16px 16px 0 0;">
                            <input type="checkbox" id="toggle-students-filter" class="glass-collapse-checkbox" checked>
                            <label for="toggle-students-filter" class="glass-collapse-header" style="background: rgba(248, 250, 252, 0.7); backdrop-filter: blur(12px); -webkit-backdrop-filter: blur(12px); border-radius: 16px 16px 0 0;">
                                <span class="glass-collapse-title"><i data-lucide="filter" style="width: 18px; color: #2563eb;"></i> Directory Filters</span>
                                <span class="glass-collapse-chevron"><i data-lucide="chevron-down"></i></span>
                            </label>
                            
                            <div class="glass-collapse-content" style="padding: 0 1.25rem 1.25rem 1.25rem; background: #f8fafc;">
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

        // Selection Logic (Glass Accordion Style)
        listContainer.addEventListener('change', async (e) => {
            const checkbox = e.target;
            if (!checkbox.classList.contains('student-toggle')) return;
            
            const card = checkbox.closest('.student-card');
            const studentId = card.dataset.id;
            
            if (checkbox.checked) {
                // Close other accordions
                document.querySelectorAll('.student-toggle').forEach(cb => {
                    if (cb !== checkbox) cb.checked = false;
                });

                const detailArea = document.getElementById(`info-${studentId.replace(/\//g, '_')}`);
                if (detailArea && (detailArea.innerHTML.includes('loader-sm') || !detailArea.innerHTML.trim())) {
                    const student = await db.students.get(studentId);
                    if (student) {
                        const scores = await db.scores.where('student_id').equals(studentId).toArray();
                        const avg = scores.length > 0 ? Math.round(scores.reduce((a, s) => a + (s.total || 0), 0) / scores.length) : 0;
                        
                        detailArea.innerHTML = `
                            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; margin-bottom: 1rem;">
                                <div class="stat-box-sm"><strong>GENDER</strong><span>${student.gender || 'N/A'}</span></div>
                                <div class="stat-box-sm"><strong>STATUS</strong><span style="color: ${student.is_active !== false ? '#10b981' : '#ef4444'};">${student.is_active !== false ? 'Active' : 'Inactive'}</span></div>
                                <div class="stat-box-sm"><strong>AVG SCORE</strong><span>${avg > 0 ? avg + '%' : 'No scores'}</span></div>
                                <div class="stat-box-sm"><strong>GENOTYPE</strong><span>${student.genotype || 'N/A'}</span></div>
                            </div>
                            <div style="background: white; border: 1px solid #e2e8f0; border-radius: 12px; padding: 1rem; margin-bottom: 1rem;">
                                <div style="font-size: 0.65rem; color: #94a3b8; font-weight: 800; text-transform: uppercase; margin-bottom: 0.5rem;">Residential Address</div>
                                <div style="font-size: 0.85rem; color: #1e293b; font-weight: 600;">${student.address || 'No address provided'}</div>
                            </div>
                            <div style="display: flex; gap: 0.5rem;">
                                <button class="btn btn-secondary view-full-profile-btn" data-id="${student.student_id}" style="flex: 1; border-radius: 10px; font-size: 0.75rem; height: 44px; background: #2563eb; color: white; border: none; font-weight: 700;">
                                    <i data-lucide="user" style="width: 14px;"></i> View Full Profile
                                </button>
                                <button class="btn btn-secondary mobile-edit-std-btn" data-id="${student.student_id}" style="border-radius: 10px; font-size: 0.75rem; height: 44px; font-weight: 700; width: 44px; display: flex; align-items: center; justify-content: center; padding: 0;">
                                    <i data-lucide="edit-3" style="width: 16px;"></i>
                                </button>
                            </div>
                        `;
                        if (typeof lucide !== 'undefined') lucide.createIcons();
                        
                        const editBtn = detailArea.querySelector('.mobile-edit-std-btn');
                        const viewProfileBtn = detailArea.querySelector('.view-full-profile-btn');

                        if (viewProfileBtn) {
                            viewProfileBtn.addEventListener('click', async (btnEv) => {
                                btnEv.preventDefault();
                                btnEv.stopPropagation();
                                const studentId = viewProfileBtn.dataset.id;
                                await this.renderStudentDetail(studentId);
                                // Smooth scroll on mobile
                                if (window.innerWidth < 1024) {
                                    document.getElementById('student-detail-view')?.scrollIntoView({ behavior: 'smooth' });
                                }
                            });
                        }

                        if (editBtn) {
                            editBtn.addEventListener('click', async (btnEv) => {
                                btnEv.stopPropagation();
                                await this.renderStudentDetail(student.student_id);
                                document.getElementById('btn-modify-student')?.click();
                                // Smooth scroll on mobile
                                if (window.innerWidth < 1024) {
                                    document.getElementById('student-detail-view').scrollIntoView({ behavior: 'smooth' });
                                }
                            });
                        }
                    }
                }
                
                // Desktop View Sync
                if (window.innerWidth >= 1024) {
                    await this.renderStudentDetail(studentId);
                }
            }
        });

        // Header click for desktop quick-view
        listContainer.addEventListener('click', async (e) => {
            const header = e.target.closest('.glass-collapse-header');
            if (header && window.innerWidth >= 1024) {
                const studentId = header.closest('.student-card').dataset.id;
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

        const bulkRepairBtn = document.getElementById('btn-bulk-repair-students');
        if (bulkRepairBtn) {
            bulkRepairBtn.onclick = async () => {
                const allStudents = await db.students.toArray();
                if (!confirm(`This will attempt to repair login accounts for ALL ${allStudents.length} students. This may take a minute. Continue?`)) return;
                
                bulkRepairBtn.disabled = true;
                let count = 0;
                
                for (const s of allStudents) {
                    count++;
                    bulkRepairBtn.innerHTML = `<i data-lucide="loader" class="spin"></i> Repairing ${count}/${allStudents.length}...`;
                    
                    try {
                        const email = `${s.student_id.toLowerCase()}@student.school`;
                        const { data: authData, error: authError } = await registerUser(email, s.student_id, s.name, 'Student');
                        
                        // If user already exists, authData might be empty or restricted
                        // We still try to upsert the profile to link them
                        const client = window.getSupabase ? window.getSupabase() : null;
                        if (client && (authData?.user || s.id)) {
                            await client.from('profiles').upsert({
                                id: authData?.user?.id || s.id || s.student_id,
                                full_name: s.name,
                                role: 'Student',
                                assigned_id: s.student_id,
                                email: email
                            });
                        }
                        
                        // Small delay to prevent rate limiting (Supabase default is 3/min, we should be careful)
                        await new Promise(resolve => setTimeout(resolve, 500)); 
                    } catch (err) {
                        console.warn(`Failed to repair ${s.student_id}:`, err);
                    }
                }
                
                Notifications.show(`Bulk repair complete! ${count} accounts processed.`, 'success');
                bulkRepairBtn.disabled = false;
                bulkRepairBtn.innerHTML = '<i data-lucide="shield-alert" style="width: 14px;"></i> Bulk Repair Auth';
                if (typeof lucide !== 'undefined') lucide.createIcons();
            };
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
                            <label>Attendance System Code (4-digits)</label>
                            <input type="text" id="std-attendance-code" class="input" placeholder="e.g. 5703" maxlength="4" style="width: 100%; box-sizing: border-box; font-weight: 800; border: 2px solid #3b82f6;">
                            <span style="font-size: 0.7rem; color: #3b82f6; display: block; margin-top: 4px;">Get this from the biometric/attendance terminal.</span>
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
                    const attendanceCodeInput = document.getElementById('std-attendance-code').value.trim();
                    const year = new Date().getFullYear();
                    
                    let serial;
                    let attendanceCode = null;
                    let admissionYear = year;

                    if (!name || !className) {
                        Notifications.show('Name and Class are required', 'error');
                        throw new Error('Validation failed');
                    }

                    if (!attendanceCodeInput || attendanceCodeInput.length !== 4) {
                        Notifications.show('A valid 4-digit Attendance Code is required', 'error');
                        throw new Error('Validation failed');
                    }

                    serial = `NKQMS-${year}-${attendanceCodeInput}`;
                    attendanceCode = attendanceCodeInput;
                    
                    const newStudent = prepareForSync({
                        student_id: serial,
                        name: name,
                        class_name: className,
                        gender: gender,
                        role: 'Student', // Explicitly set role
                        status: 'Active',
                        is_active: true,
                        attendance_code: attendanceCode,
                        admission_year: admissionYear,
                        sub_class: className.charAt(0).toUpperCase(),
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

                    try {
                        // 1. Create Auth Account for Student
                        // Email: student_id@student.school, Password: student_id
                        const studentEmail = `${serial.toLowerCase()}@student.school`;
                        Notifications.show(`Provisioning dashboard for ${serial}...`, 'info');
                        
                        const { data: authData, error: authError } = await registerUser(studentEmail, serial, name, 'Student');
                        
                        if (authError) {
                            if (authError.message.includes('already registered')) {
                                console.warn('Student auth already exists');
                            } else {
                                console.error('Student auth error:', authError);
                            }
                        }

                        // Use Supabase ID if available, else use generated serial
                        if (authData?.user) newStudent.id = authData.user.id;

                        console.log('Registering Student with ID:', serial);
                        await db.students.add(newStudent);
                        
                        // Also add to profiles table for role-based login detection
                        await db.profiles.put({
                            id: newStudent.id || serial,
                            full_name: name,
                            email: studentEmail,
                            role: 'Student',
                            assigned_id: serial,
                            updated_at: new Date().toISOString()
                        });

                        syncToCloud(); 
                        Notifications.show(`Student ${name} registered! Login: ${serial} / ${serial}`, 'success');
                    } catch (err) {
                        console.error('Enrollment error:', err);
                        // Still save locally even if auth fails
                        await db.students.add(newStudent);
                        Notifications.show(`Registered ${name} locally. Cloud account pending.`, 'warning');
                    }
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
        
        // Get global settings for the student profile context
        const session = (await db.settings.get('currentSession'))?.value || (await db.settings.get('current_session'))?.value || '2025/2026';
        const term = (await db.settings.get('currentTerm'))?.value || (await db.settings.get('current_term'))?.value || '1st Term';

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
                                <p style="font-size: 1.1rem; color: #64748b; margin-top: 0.25rem;">${student.class_name} • ${student.sub_class || 'General Stream'}</p>
                            </div>
                              <div style="display: flex; gap: 0.75rem; flex-wrap: wrap;">
                                 ${!((this.currentUser.role || '').toLowerCase() === 'teacher') ? `
                                 <button id="btn-repair-auth" class="btn btn-secondary" title="Fix Login Issues" style="border-radius: 14px; padding: 0.75rem 1.25rem; background: #fef9c3; color: #854d0e; border: 1px solid #fef08a;"><i data-lucide="shield-alert"></i> Repair Auth</button>
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
                        <span style="font-size: 0.7rem; font-weight: 800; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.1em;">Current Session</span>
                        <div style="display: flex; align-items: baseline; gap: 0.5rem; margin-top: 0.25rem;">
                            <span style="font-size: 1.4rem; font-weight: 800; color: #1e293b;">${session}</span>
                        </div>
                    </div>
                    <div style="background: #f8fafc; padding: 1.25rem; border-radius: 20px; border: 1px solid #f1f5f9;">
                        <span style="font-size: 0.7rem; font-weight: 800; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.1em;">Current Term</span>
                        <div style="display: flex; align-items: baseline; gap: 0.5rem; margin-top: 0.25rem;">
                            <span style="font-size: 1.4rem; font-weight: 800; color: #1e293b;">${term}</span>
                        </div>
                    </div>
                    <div style="background: #f8fafc; padding: 1.25rem; border-radius: 20px; border: 1px solid #f1f5f9;">
                        <span style="font-size: 0.7rem; font-weight: 800; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.1em;">Cumulative Avg</span>
                        <div style="display: flex; align-items: baseline; gap: 0.5rem; margin-top: 0.25rem;">
                            <span style="font-size: 1.4rem; font-weight: 800; color: #1e293b;">${avgScore}%</span>
                        </div>
                    </div>
                </div>

                <div class="profile-tabs" style="border-bottom: 2px solid #f1f5f9; display: flex; gap: 3rem; margin-bottom: 2rem;">
                    <button class="profile-tab-btn active" data-tab="general" style="background: none; border: none; border-bottom: 2px solid #2563eb; padding: 1rem 0; font-weight: 800; color: #1e293b; cursor: pointer; transition: all 0.3s;">General Profile</button>
                    <button class="profile-tab-btn" data-tab="academic" style="background: none; border: none; padding: 1rem 0; font-weight: 600; color: #64748b; cursor: pointer; transition: all 0.3s;">Academic Records</button>
                </div>

                <div id="profile-tab-content">
                    <div id="tab-general" class="tab-pane active">
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
                                    <div style="display: flex; justify-content: space-between; padding-bottom: 0.75rem; border-bottom: 1px solid #f8fafc;">
                                        <span style="color: #94a3b8; font-weight: 600;">Date of Birth</span>
                                        <span style="font-weight: 700; color: #475569;">${student.dob || 'N/A'}</span>
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
                                        <span style="color: #94a3b8; font-weight: 600;">Parent Email</span>
                                        <span style="font-weight: 700; color: #475569;">${student.parent_email || 'N/A'}</span>
                                    </div>
                                    <div style="display: flex; justify-content: space-between; padding-bottom: 0.75rem; border-bottom: 1px solid #f8fafc;">
                                        <span style="color: #94a3b8; font-weight: 600;">Emergency Contact</span>
                                        <span style="font-weight: 700; color: #475569;">${student.parent_phone || 'N/A'}</span>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                    <div id="tab-academic" class="tab-pane" style="display: none;">
                        <div class="card" style="padding: 1.5rem; background: white; border-radius: 20px; border: 1px solid #f1f5f9;">
                            <h4 style="font-size: 1.1rem; font-weight: 800; color: #1e293b; margin-bottom: 1.5rem; display: flex; align-items: center; gap: 0.75rem;">
                                <i data-lucide="award" style="width: 18px; color: #2563eb;"></i> Performance Summary
                            </h4>
                            <div style="overflow-x: auto;">
                                <table style="width: 100%; border-collapse: collapse; min-width: 600px;">
                                    <thead>
                                        <tr style="border-bottom: 2px solid #f1f5f9;">
                                            <th style="text-align: left; padding: 1rem; color: #64748b; font-size: 0.75rem; font-weight: 800; text-transform: uppercase;">Subject</th>
                                            <th style="text-align: center; padding: 1rem; color: #64748b; font-size: 0.75rem; font-weight: 800; text-transform: uppercase;">CA 1</th>
                                            <th style="text-align: center; padding: 1rem; color: #64748b; font-size: 0.75rem; font-weight: 800; text-transform: uppercase;">CA 2</th>
                                            <th style="text-align: center; padding: 1rem; color: #64748b; font-size: 0.75rem; font-weight: 800; text-transform: uppercase;">Exam</th>
                                            <th style="text-align: center; padding: 1rem; color: #64748b; font-size: 0.75rem; font-weight: 800; text-transform: uppercase;">Total</th>
                                            <th style="text-align: center; padding: 1rem; color: #64748b; font-size: 0.75rem; font-weight: 800; text-transform: uppercase;">Grade</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        ${scores.length === 0 ? `<tr><td colspan="6" style="padding: 3rem; text-align: center; color: #94a3b8; font-weight: 600;">No academic records found for this student.</td></tr>` : 
                                            scores.map(score => {
                                                const total = (score.ca1 || 0) + (score.ca2 || 0) + (score.exam || 0);
                                                const grade = total >= 70 ? 'A' : (total >= 60 ? 'B' : (total >= 50 ? 'C' : (total >= 40 ? 'D' : 'F')));
                                                const gradeColor = total >= 50 ? '#10b981' : '#ef4444';
                                                return `
                                                    <tr style="border-bottom: 1px solid #f8fafc;">
                                                        <td style="padding: 1rem; font-weight: 700; color: #1e293b;">${score.subject_name || score.subject_id}</td>
                                                        <td style="padding: 1rem; text-align: center; font-weight: 600; color: #475569;">${score.ca1 || 0}</td>
                                                        <td style="padding: 1rem; text-align: center; font-weight: 600; color: #475569;">${score.ca2 || 0}</td>
                                                        <td style="padding: 1rem; text-align: center; font-weight: 600; color: #475569;">${score.exam || 0}</td>
                                                        <td style="padding: 1rem; text-align: center; font-weight: 800; color: #2563eb;">${total}</td>
                                                        <td style="padding: 1rem; text-align: center;">
                                                            <span style="display: inline-block; padding: 4px 10px; border-radius: 8px; background: ${gradeColor}15; color: ${gradeColor}; font-weight: 800;">${grade}</span>
                                                        </td>
                                                    </tr>
                                                `;
                                            }).join('')
                                        }
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `;
        if (typeof lucide !== 'undefined') lucide.createIcons();

        // Repair Auth Logic
        const repairBtn = document.getElementById('btn-repair-auth');
        if (repairBtn) {
            repairBtn.onclick = async () => {
                if (!confirm(`This will attempt to reset and re-provision the login dashboard for ${student.name}. Use this if the student cannot log in. Proceed?`)) return;
                
                repairBtn.disabled = true;
                repairBtn.innerHTML = '<i data-lucide="loader" class="spin"></i> Repairing...';
                
                try {
                    const studentEmail = `${student.student_id.toLowerCase()}@student.school`;
                    const { data: authData, error: authError } = await registerUser(studentEmail, student.student_id, student.name, 'Student');
                    
                    if (authError && !authError.message.includes('already registered')) {
                        throw authError;
                    }
                    
                    // Force update profile in Supabase to ensure everything is linked
                    const client = window.getSupabase ? window.getSupabase() : null;
                    if (client) {
                        const { error: pError } = await client.from('profiles').upsert({
                            id: authData?.user?.id || student.id || student.student_id,
                            full_name: student.name,
                            role: 'Student',
                            assigned_id: student.student_id,
                            email: studentEmail
                        });
                        if (pError) console.warn('Profile sync warning during repair:', pError);
                    }

                    Notifications.show(`Authentication dashboard repaired for ${student.name}.`, 'success');
                } catch (err) {
                    console.error('Repair error:', err);
                    Notifications.show(`Failed to repair auth: ${err.message}`, 'error');
                } finally {
                    repairBtn.disabled = false;
                    repairBtn.innerHTML = '<i data-lucide="shield-alert"></i> Repair Auth';
                    if (typeof lucide !== 'undefined') lucide.createIcons();
                }
            };
        }

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
                        <div class="modal-grid" style="display: grid; grid-template-columns: 1fr 1fr; gap: 1rem;">
                            <div><label>Full Name</label><input type="text" id="edit-std-name" class="input" value="${student.name}" style="width:100%;"></div>
                            <div><label>Class</label><select id="edit-std-class" class="input" style="width:100%;">${classOptions}</select></div>
                            <div><label>Gender</label><select id="edit-std-gender" class="input" style="width:100%;"><option value="Male" ${student.gender === 'Male' ? 'selected' : ''}>Male</option><option value="Female" ${student.gender === 'Female' ? 'selected' : ''}>Female</option></select></div>
                            <div><label>Date of Birth</label><input type="date" id="edit-std-dob" class="input" value="${student.dob || ''}" style="width:100%;"></div>
                        </div>
                        <div class="modal-grid" style="display: grid; grid-template-columns: 1fr 1fr; gap: 1rem;">
                            <div><label>Blood Group</label><select id="edit-std-blood" class="input" style="width:100%;">
                                <option value="">Select...</option>
                                <option value="A+" ${student.blood_group === 'A+' ? 'selected' : ''}>A+</option><option value="O+" ${student.blood_group === 'O+' ? 'selected' : ''}>O+</option><option value="B+" ${student.blood_group === 'B+' ? 'selected' : ''}>B+</option><option value="AB+" ${student.blood_group === 'AB+' ? 'selected' : ''}>AB+</option>
                                <option value="A-" ${student.blood_group === 'A-' ? 'selected' : ''}>A-</option><option value="O-" ${student.blood_group === 'O-' ? 'selected' : ''}>O-</option><option value="B-" ${student.blood_group === 'B-' ? 'selected' : ''}>B-</option><option value="AB-" ${student.blood_group === 'AB-' ? 'selected' : ''}>AB-</option>
                            </select></div>
                            <div><label>Genotype</label><select id="edit-std-geno" class="input" style="width:100%;">
                                <option value="">Select...</option>
                                <option value="AA" ${student.genotype === 'AA' ? 'selected' : ''}>AA</option><option value="AS" ${student.genotype === 'AS' ? 'selected' : ''}>AS</option><option value="SS" ${student.genotype === 'SS' ? 'selected' : ''}>SS</option><option value="SC" ${student.genotype === 'SC' ? 'selected' : ''}>SC</option>
                            </select></div>
                        </div>
                        <div class="modal-grid" style="display: grid; grid-template-columns: 1fr 1fr; gap: 1rem;">
                            <div><label>Parent Email</label><input type="text" id="edit-std-parent-email" class="input" value="${student.parent_email || ''}" style="width:100%;"></div>
                            <div><label>Phone</label><input type="text" id="edit-std-phone" class="input" value="${student.phone || ''}" style="width:100%;"></div>
                        </div>
                        <div><label>Residential Address</label><textarea id="edit-std-address" class="input" style="width:100%; min-height:80px;">${student.address || ''}</textarea></div>
                    </div>
                `;

                this.showModal('<i data-lucide="edit-3"></i> Modify Student Bio-Data', modalHtml, async () => {
                    const updates = {
                        name: document.getElementById('edit-std-name').value,
                        class_name: document.getElementById('edit-std-class').value,
                        gender: document.getElementById('edit-std-gender').value,
                        dob: document.getElementById('edit-std-dob').value,
                        blood_group: document.getElementById('edit-std-blood').value,
                        genotype: document.getElementById('edit-std-geno').value,
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

        // Tab Switching Logic
        const tabBtns = document.querySelectorAll('.profile-tab-btn');
        tabBtns.forEach(btn => {
            btn.addEventListener('click', () => {
                const tab = btn.dataset.tab;
                tabBtns.forEach(b => {
                    b.classList.remove('active');
                    b.style.borderBottom = 'none';
                    b.style.color = '#64748b';
                    b.style.fontWeight = '600';
                });
                btn.classList.add('active');
                btn.style.borderBottom = '2px solid #2563eb';
                btn.style.color = '#1e293b';
                btn.style.fontWeight = '800';

                document.getElementById('tab-general').style.display = tab === 'general' ? 'block' : 'none';
                document.getElementById('tab-academic').style.display = tab === 'academic' ? 'block' : 'none';
            });
        });
    },

    generateStudentListItems(students) {
        if (students.length === 0) return `<div style="padding: 2rem; text-align: center; color: #94a3b8; font-weight: 600;">No students found in this stream</div>`;
        return students.map(s => `
            <div class="glass-collapse-card student-card" data-id="${s.student_id}" style="margin-bottom: 0.75rem; opacity: ${s.is_active !== false ? '1' : '0.7'};">
                <input type="checkbox" id="toggle-std-${s.student_id}" class="glass-collapse-checkbox student-toggle">
                <label for="toggle-std-${s.student_id}" class="glass-collapse-header" style="padding: 1rem;">
                    <div style="display: flex; align-items: center; gap: 0.85rem; flex: 1; overflow: hidden;">
                        <div style="width: 44px; height: 44px; border-radius: 12px; background: ${s.is_active !== false ? '#eff6ff' : '#fee2e2'}; display: flex; align-items: center; justify-content: center; border: 1px solid ${s.is_active !== false ? '#dbeafe' : '#fecaca'}; flex-shrink: 0;">
                             <img src="https://api.dicebear.com/7.x/avataaars/svg?seed=${s.name}" style="width: 34px; height: 34px;" alt="${s.name}">
                        </div>
                        <div style="flex: 1; overflow: hidden;">
                            <div style="font-weight: 800; color: #1e293b; font-size: 1rem; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${s.name}</div>
                            <div style="font-size: 0.65rem; color: #94a3b8; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em;">${s.student_id} • ${s.class_name}</div>
                        </div>
                        ${s.is_active === false ? '<span class="badge" style="background: #fee2e2; color: #ef4444; font-size: 0.55rem; padding: 2px 6px;">INACTIVE</span>' : ''}
                    </div>
                    <span class="glass-collapse-chevron"><i data-lucide="chevron-down"></i></span>
                </label>
                <div class="glass-collapse-content" style="background: #f8fafc; border-top: 1px solid #f1f5f9;">
                    <div class="student-quick-info-container" id="info-${s.student_id.replace(/\//g, '_')}" style="padding: 1rem;">
                         <div style="display: flex; justify-content: center; padding: 1rem;"><div class="loader-sm"></div></div>
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
                pendingData = await this.processImportData(data);
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

    async processImportData(data) {
        const result = {
            students: [],
            scores: [],
            subjects: [],
            classes: [],
            subject_assignments: []
        };

        const existingStudents = await db.students.toArray();

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
                    }
                    else if (target === 'scores') {
                        if (cleanKey.includes('name')) mapped.name = cleanVal; // For smart matching
                        if (cleanKey.includes('id')) mapped.student_id = cleanVal;
                        if (cleanKey.includes('subject') || cleanKey.includes('course')) mapped.subject_id = cleanVal;
                        if (cleanKey.includes('term')) mapped.term = cleanVal;
                        if (cleanKey.includes('session')) mapped.session = cleanVal;
                        if (cleanKey.includes('assignment') || cleanKey === 'ass') mapped.assignment = parseFloat(cleanVal) || 0;
                        if (cleanKey.includes('test1') || cleanKey === 't1') mapped.test1 = parseFloat(cleanVal) || 0;
                        if (cleanKey.includes('test2') || cleanKey === 't2') mapped.test2 = parseFloat(cleanVal) || 0;
                        if (cleanKey.includes('project') || cleanKey === 'prj') mapped.project = parseFloat(cleanVal) || 0;
                        if (cleanKey.includes('exam')) mapped.exam = parseFloat(cleanVal) || 0;
                    }
                    else if (target === 'subjects') {
                        if (cleanKey.includes('name') || cleanKey.includes('title')) mapped.name = cleanVal;
                        if (cleanKey.includes('type')) mapped.type = cleanVal;
                        if (cleanKey.includes('id')) mapped.id = cleanVal;
                    }
                    else if (target === 'classes') {
                        if (cleanKey.includes('name') || cleanKey.includes('stream')) mapped.name = cleanVal;
                        if (cleanKey.includes('level')) mapped.level = cleanVal;
                    }
                    else if (target === 'subject_assignments') {
                        if (cleanKey.includes('subject') || cleanKey.includes('course')) mapped.subject_id = cleanVal;
                        if (cleanKey.includes('class')) mapped.class_name = cleanVal;
                    }
                }

                // Smart Student ID resolution for scores
                if (target === 'scores' && !mapped.student_id && mapped.name) {
                    const searchName = mapped.name.toLowerCase().trim();
                    let studentMatch = result.students.find(s => s.name && s.name.toLowerCase().trim() === searchName);
                    
                    if (!studentMatch) {
                        // Fallback to database search if not in current CSV
                        studentMatch = existingStudents.find(s => s.name && s.name.toLowerCase().trim() === searchName);
                    }
                    
                    if (studentMatch) {
                        mapped.student_id = studentMatch.student_id;
                    }
                }

                // Default Fallbacks & Primary Key Generation (POST-LOOP)
                if (target === 'students') {
                    if (!mapped.status) mapped.status = 'Active';
                    if (!mapped.student_id) mapped.student_id = `TEMP/${Math.random().toString(36).substr(2,5).toUpperCase()}`;
                }
                else if (target === 'scores') {
                    if (mapped.student_id && mapped.subject_id && mapped.term) {
                        mapped.id = `${mapped.student_id}_${mapped.subject_id}_${mapped.term}_${mapped.session || 'current'}`;
                    } else {
                        mapped.id = `SCR_${Math.random().toString(36).substr(2,9).toUpperCase()}`;
                    }
                }
                else if (target === 'subjects') {
                    if (!mapped.id && mapped.name) mapped.id = `SUB-${mapped.name.substring(0,3).toUpperCase()}`;
                    else if (!mapped.id) mapped.id = `SUB-${Math.random().toString(36).substr(2,5).toUpperCase()}`;
                    if (!mapped.type) mapped.type = 'Core';
                    mapped.credits = 1;
                }
                else if (target === 'classes') {
                    if (!mapped.id && mapped.name) mapped.id = `CLS-${mapped.name.replace(/\s+/g,'-').toUpperCase()}`;
                    else if (!mapped.id) mapped.id = `CLS-${Math.random().toString(36).substr(2,5).toUpperCase()}`;
                }
                else if (target === 'subject_assignments') {
                    if (!mapped.id) mapped.id = `ASGN-${Math.random().toString(36).substr(2,6).toUpperCase()}`;
                    if (!mapped.teacher_id) mapped.teacher_id = 'unassigned';
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
        const role = (this.currentUser.role || '').toLowerCase();
        const isStudent = role === 'student';
        const isParent = role === 'parent';

        if (isStudent || isParent) {
            return this.renderStudentGradesView();
        }
        
        const isTeacher = role === 'teacher';
        const teacherId = this.currentUser.id;
        
        let students = (await db.students.toArray()).sort((a,b) => (a.name || '').localeCompare(b.name || ''));
        let classes = (await db.classes.toArray()).sort((a,b) => (a.name || '').localeCompare(b.name || ''));
        let subjects = (await db.subjects.toArray()).sort((a,b) => (a.name || '').localeCompare(b.name || ''));
        
        // --- Teacher Specific Filtering ---
        const settingsArray = await db.settings.toArray();
        const settings = {};
        settingsArray.forEach(s => settings[s.key] = s.value);
        const currentTerm = settings.currentTerm || '1st Term';
        const currentSession = settings.currentSession || '2025/2026';
        
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
                            <option value="1st Term" ${currentTerm === '1st Term' ? 'selected' : ''}>1st Term</option>
                            <option value="2nd Term" ${currentTerm === '2nd Term' ? 'selected' : ''}>2nd Term</option>
                            <option value="3rd Term" ${currentTerm === '3rd Term' ? 'selected' : ''}>3rd Term</option>
                        </select>
                    </div>
                    <div class="card" style="padding: 1rem; border-radius: 16px; box-shadow: var(--shadow-sm); display:flex; flex-direction:column; gap:0.5rem;">
                        <div style="display:flex; align-items:center; gap:0.5rem; color:var(--accent-primary);"><i data-lucide="calendar" style="width:16px;"></i> <span style="font-size:0.65rem; font-weight:800; text-transform:uppercase;">Session</span></div>
                        <select id="grade-session-filter" class="input" style="border:none; padding:0; font-size:1.1rem; font-weight:700; background:transparent;">
                            <option value="2025/2026" ${currentSession === '2025/2026' ? 'selected' : ''}>2025/2026</option>
                            <option value="2024/2025" ${currentSession === '2024/2025' ? 'selected' : ''}>2024/2025</option>
                            <option value="2026/2027" ${currentSession === '2026/2027' ? 'selected' : ''}>2026/2027</option>
                        </select>
                    </div>
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

        // Pre-fill session from settings
        const currentSettings = await db.settings.toArray();
        const settingsMap = {};
        currentSettings.forEach(s => settingsMap[s.key] = s.value);

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

            console.log("[Debug] targetStudents count:", targetStudents.length, "Sample:", targetStudents[0]);
            console.log("[Debug] filteredScores count:", filteredScores.length, "Sample:", filteredScores[0]);

            // Update Statistics
            updateStatsUI(filteredScores);

            // Update Desktop Table
            gradeBody.innerHTML = targetStudents.map(s => {
                const score = filteredScores.find(sc => {
                    const scId = String(sc.student_id || '').trim().toLowerCase();
                    const sId = String(s.student_id || '').trim().toLowerCase();
                    const idMatch = scId && sId && (scId === sId || scId.includes(sId) || sId.includes(scId));
                    
                    const scName = String(sc.name || '').trim().toLowerCase();
                    const sName = String(s.name || '').trim().toLowerCase();
                    const nameMatch = scName && sName && (scName === sName || scName.includes(sName) || sName.includes(scName));

                    if (!idMatch && nameMatch) {
                        console.log(`[Debug] Matched by NAME fallback: Score(${scName}) -> Student(${sName})`);
                    }
                    
                    return idMatch || nameMatch;
                });
                
                if (!score && filteredScores.length > 0) {
                    console.log(`[Debug] No match for student: ${s.name} (${s.student_id})`);
                }

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
                    const score = filteredScores.find(sc => {
                        const scId = String(sc.student_id || '').trim().toLowerCase();
                        const sId = String(s.student_id || '').trim().toLowerCase();
                        const idMatch = scId && sId && (scId === sId || scId.includes(sId) || sId.includes(scId));
                        
                        const scName = String(sc.name || '').trim().toLowerCase();
                        const sName = String(s.name || '').trim().toLowerCase();
                        const nameMatch = scName && sName && (scName === sName || scName.includes(sName) || sName.includes(scName));

                        return idMatch || nameMatch;
                    });
                    
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

        [subjectFilter, termFilter, sessionFilter].forEach(f => {
            if (f) f.addEventListener('change', loadAcademicLedger);
        });

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

            try {
                await syncToCloud();
                Notifications.show('Grades committed and synced to cloud!', 'success');
            } catch (e) {
                Notifications.show('Grades saved locally. Sync will complete when online.', 'info');
            }
            
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
            const allSettings = await db.settings.toArray();
            const settings = {};
            allSettings.forEach(s => settings[s.key] = s.value);
            
            const schoolName = settings.schoolName || 'NEW KINGS AND QUEENS MONTESSORI';
            const schoolLogo = settings.schoolLogo || '';
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
                                        <div class="header-row" style="display: flex; align-items: center; justify-content: center; gap: 15px; margin-bottom: 10px;">
                                            ${schoolLogo ? `<img src="${schoolLogo}" style="height: 60px; width: 60px; object-fit: contain; border-radius: 8px;">` : ''}
                                            <div style="text-align: left;">
                                                <div class="school-name" style="margin-bottom: 5px;">${schoolName}</div>
                                                <div class="doc-title" style="margin: 0;">CONTINUOUS ASSESSMENT SCORE SHEET</div>
                                            </div>
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
        const formTeachers = await db.form_teachers.toArray();
        
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
                const teachers = profiles.filter(p => (p.role || '').toLowerCase() === 'teacher');
                container.innerHTML = `
                    <div style="display: flex; flex-direction: column; gap: 1rem;">
                        ${classes.map(c => {
                            const ft = formTeachers.find(f => f.class_name === c.name);
                            return `
                                <div class="glass-collapse-card">
                                    <input type="checkbox" id="toggle-cls-${c.id}" class="glass-collapse-checkbox">
                                    <label for="toggle-cls-${c.id}" class="glass-collapse-header" style="padding: 1.25rem;">
                                        <div style="display: flex; align-items: center; gap: 1rem;">
                                            <div style="width: 44px; height: 44px; background: #eef2ff; color: #4338ca; border-radius: 12px; display: flex; align-items: center; justify-content: center; font-weight: 900; font-size: 1.1rem; border: 1px solid #dbeafe;">
                                                <i data-lucide="layers" style="width: 20px;"></i>
                                            </div>
                                            <div>
                                                <div style="font-weight: 800; color: #1e293b; font-size: 1rem;">${c.name}</div>
                                                <div style="font-size: 0.7rem; color: #94a3b8; font-weight: 700; text-transform: uppercase;">${c.level}</div>
                                            </div>
                                        </div>
                                        <span class="glass-collapse-chevron"><i data-lucide="chevron-down"></i></span>
                                    </label>
                                    <div class="glass-collapse-content" style="background: #f8fafc; border-top: 1px solid #f1f5f9;">
                                        <div style="padding: 1.5rem;">
                                            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 1.5rem; margin-bottom: 1.5rem;">
                                                <div class="form-group">
                                                    <label style="font-size: 0.65rem; font-weight: 800; color: #94a3b8; text-transform: uppercase; margin-bottom: 0.5rem; display: block;">Assign Form Master</label>
                                                    <select class="input form-master-select" data-class-name="${c.name}" style="width: 100%; border-radius: 10px; height: 48px; background: white; font-weight: 700;">
                                                        <option value="">Unassigned</option>
                                                        ${teachers.map(t => `<option value="${t.id}" ${ft && ft.teacher_id === t.id ? 'selected' : ''}>${t.full_name}</option>`).join('')}
                                                    </select>
                                                </div>
                                                <div class="form-group" style="display: flex; align-items: flex-end; gap: 0.75rem;">
                                                    <button class="btn btn-secondary edit-class" data-id="${c.id}" style="height: 48px; border-radius: 10px; flex: 1;">
                                                        <i data-lucide="edit-3"></i> Rename
                                                    </button>
                                                    <button class="btn btn-danger delete-class" data-id="${c.id}" style="height: 48px; border-radius: 10px; flex: 1;">
                                                        <i data-lucide="trash-2"></i> Delete
                                                    </button>
                                                </div>
                                            </div>
                                            <div style="background: white; border: 1px solid #e2e8f0; border-radius: 12px; padding: 1rem;">
                                                <div style="font-size: 0.7rem; font-weight: 800; color: #64748b; text-transform: uppercase; margin-bottom: 0.75rem; border-bottom: 1px solid #f1f5f9; padding-bottom: 0.5rem; display: flex; align-items: center; gap: 0.5rem;">
                                                    <i data-lucide="info" style="width: 14px;"></i> Stream Insights
                                                </div>
                                                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 1rem;">
                                                    <div>
                                                        <div style="font-size: 0.6rem; color: #94a3b8; font-weight: 700;">STUDENT POPULATION</div>
                                                        <div style="font-weight: 800; color: #1e293b;" class="cls-pop-count" data-class-name="${c.name}">Loading...</div>
                                                    </div>
                                                    <div>
                                                        <div style="font-size: 0.6rem; color: #94a3b8; font-weight: 700;">SUBJECTS OFFERED</div>
                                                        <div style="font-weight: 800; color: #1e293b;">${assignments.filter(a => a.class_name === c.name).length} Courses</div>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            `;
                        }).join('')}
                    </div>
                `;
                
                // Update populations
                const studentList = await db.students.toArray();
                classes.forEach(c => {
                    const count = studentList.filter(s => s.class_name === c.name && s.is_active !== false).length;
                    const el = container.querySelector(`.cls-pop-count[data-class-name="${c.name}"]`);
                    if (el) el.textContent = `${count} Students`;
                });
            } else if (tab === 'subjects') {
                container.innerHTML = `
                    <div style="display: flex; flex-direction: column; gap: 1rem;">
                        ${subjects.map(s => `
                            <div class="glass-collapse-card">
                                <input type="checkbox" id="toggle-sub-${s.id}" class="glass-collapse-checkbox">
                                <label for="toggle-sub-${s.id}" class="glass-collapse-header" style="padding: 1rem;">
                                    <div style="display: flex; align-items: center; gap: 0.85rem; flex: 1;">
                                        <div style="width: 40px; height: 40px; background: #f0fdf4; color: #16a34a; border-radius: 10px; display: flex; align-items: center; justify-content: center;">
                                            <i data-lucide="book" style="width: 18px;"></i>
                                        </div>
                                        <div>
                                            <div style="font-weight: 800; color: #1e293b; font-size: 0.95rem;">${s.name}</div>
                                            <div style="font-size: 0.65rem; color: #94a3b8; font-weight: 700; text-transform: uppercase;">${s.type} • ${s.credits} Credits</div>
                                        </div>
                                    </div>
                                    <span class="glass-collapse-chevron"><i data-lucide="chevron-down"></i></span>
                                </label>
                                <div class="glass-collapse-content" style="background: #f8fafc; border-top: 1px solid #f1f5f9;">
                                    <div style="padding: 1rem; display: flex; gap: 0.75rem;">
                                        <button class="btn btn-secondary edit-subject" data-id="${s.id}" style="flex: 1; border-radius: 10px; font-size: 0.75rem; height: 40px;">
                                            <i data-lucide="edit-2"></i> Edit Course
                                        </button>
                                        <button class="btn btn-danger delete-sub" data-id="${s.id}" style="flex: 1; border-radius: 10px; font-size: 0.75rem; height: 40px;">
                                            <i data-lucide="trash-2"></i> Delete
                                        </button>
                                    </div>
                                </div>
                            </div>
                        `).join('')}
                    </div>
                `;
            } else if (tab === 'assignments') {
                const sortedAssignments = [...assignments].sort((a,b) => (a.class_name || '').localeCompare(b.class_name || ''));
                container.innerHTML = `
                    <div style="display: flex; flex-direction: column; gap: 1rem;">
                        ${sortedAssignments.map(a => {
                            const sub = subjects.find(s => s.id === a.subject_id);
                            const teacher = profiles.find(p => p.id === a.teacher_id);
                            return `
                                <div class="glass-collapse-card">
                                    <input type="checkbox" id="toggle-asgn-${a.id}" class="glass-collapse-checkbox">
                                    <label for="toggle-asgn-${a.id}" class="glass-collapse-header" style="padding: 1rem;">
                                        <div style="display: flex; align-items: center; gap: 0.85rem; flex: 1;">
                                            <div style="width: 40px; height: 40px; background: #fff7ed; color: #ea580c; border-radius: 10px; display: flex; align-items: center; justify-content: center;">
                                                <i data-lucide="user-plus" style="width: 18px;"></i>
                                            </div>
                                            <div>
                                                <div style="font-weight: 800; color: #1e293b; font-size: 0.95rem;">${sub ? sub.name : 'Unknown'}</div>
                                                <div style="font-size: 0.65rem; color: #94a3b8; font-weight: 700; text-transform: uppercase;">${a.class_name} • ${teacher ? teacher.full_name : 'Unassigned'}</div>
                                            </div>
                                        </div>
                                        <span class="glass-collapse-chevron"><i data-lucide="chevron-down"></i></span>
                                    </label>
                                    <div class="glass-collapse-content" style="background: #f8fafc; border-top: 1px solid #f1f5f9;">
                                        <div style="padding: 1rem;">
                                            <button class="btn btn-danger delete-assignment" data-id="${a.id}" style="width: 100%; border-radius: 10px; font-size: 0.75rem; height: 40px;">
                                                <i data-lucide="trash-2"></i> Remove Assignment
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            `;
                        }).join('')}
                    </div>
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
                const target = e.target.closest('.edit-subject') || e.target.closest('i');
                const id = target.dataset.id;
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

        document.querySelectorAll('.delete-sub').forEach(icon => {
            icon.onclick = async (e) => {
                const target = e.target.closest('.delete-sub') || e.target.closest('i');
                const id = target.dataset.id;
                if (confirm('Delete this course? All associated scores will be lost!')) {
                    await db.subjects.delete(id);
                    await db.scores.where('subject_id').equals(id).delete();
                    await db.subject_assignments.where('subject_id').equals(id).delete();
                    Notifications.show('Course removed', 'success');
                    this.renderAcademic();
                    syncToCloud();
                }
            };
        });

        document.querySelectorAll('.edit-class').forEach(btn => {
            btn.onclick = async (e) => {
                const target = e.target.closest('.edit-class') || e.target.closest('i');
                const id = target.dataset.id;
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

        document.querySelectorAll('.delete-class').forEach(btn => {
            btn.onclick = async (e) => {
                const target = e.target.closest('.delete-class') || e.target.closest('i');
                const id = target.dataset.id;
                if (confirm('Delete this stream? Students and assignments will be orphaned!')) {
                    const cls = await db.classes.get(id);
                    if (cls) {
                        await db.classes.delete(id);
                        await db.form_teachers.where('class_name').equals(cls.name).delete();
                        await db.subject_assignments.where('class_name').equals(cls.name).delete();
                        Notifications.show('Stream removed', 'success');
                        this.renderAcademic();
                        syncToCloud();
                    }
                }
            };
        });

        document.querySelectorAll('.form-master-select').forEach(select => {
            select.onchange = (e) => {
                this.updateFormMaster(e.target.dataset.className, e.target.value);
            };
        });

        document.querySelectorAll('.delete-assignment').forEach(icon => {
            icon.onclick = async (e) => {
                const target = e.target.closest('.delete-assignment') || e.target.closest('i');
                const id = target.dataset.id;
                if (confirm('Remove this assignment?')) {
                    await db.subject_assignments.delete(id);
                    Notifications.show('Assignment removed', 'success');
                    this.renderAcademic();
                    syncToCloud();
                }
            };
        });
    },

    async updateFormMaster(className, teacherId) {
        if (!teacherId) {
            await db.form_teachers.where('class_name').equals(className).delete();
        } else {
            const existing = await db.form_teachers.where('class_name').equals(className).first();
            if (existing) {
                await db.form_teachers.update(existing.id, prepareForSync({ teacher_id: teacherId }));
            } else {
                await db.form_teachers.add(prepareForSync({
                    id: `FT_${className.replace(/\s+/g, '_')}_${Date.now()}`,
                    teacher_id: teacherId,
                    class_name: className
                }));
            }
        }
        Notifications.show('Form Master updated', 'success');
        syncToCloud();
    },

    async updateAttendanceStatus(studentId, status) {
        const dateInput = document.getElementById('att-date');
        const date = dateInput ? dateInput.value : new Date().toISOString().split('T')[0];
        
        // Lock Validation: School Closed
        const allSettings = await db.settings.toArray();
        const termStatus = allSettings.find(s => s.key === 'termStatus')?.value || 'Active';
        const holidayStr = allSettings.find(s => s.key === 'holidays')?.value || '';
        const holidays = holidayStr.split(/[\n,]+/).map(d => d.trim()).filter(d => d);
        
        const selectedDateObj = new Date(date);
        const isWeekend = selectedDateObj.getDay() === 0 || selectedDateObj.getDay() === 6;
        const isClosedDay = holidays.includes(date);
        const isTermInactive = termStatus === 'Inactive';
        
        if (isWeekend || isClosedDay || isTermInactive) {
            const reason = isTermInactive ? 'School is Closed (Holiday Period)' : (isWeekend ? 'it is a Weekend' : 'it is a Public Holiday');
            Notifications.show(`Access Denied: Attendance cannot be marked because ${reason}.`, 'warning');
            return;
        }

        const id = `SCH_${studentId}_${date}`;
        await db.attendance_records.put(prepareForSync({
            id: id,
            student_id: studentId,
            date: date,
            status: status,
            check_in: status === 'Absent' ? null : new Date().toISOString(),
            is_subject_based: false
        }));
        
        Notifications.show(`Attendance logged: ${status}`, 'success');
        
        // Quick update UI without full refresh if possible, or just re-render row
        const card = document.querySelector(`.attendance-card input#toggle-att-${studentId}`)?.parentElement;
        if (card) {
            const statusBadge = card.querySelector('span[style*="font-size: 0.6rem"]');
            if (statusBadge) {
                const color = status === 'Present' ? '#10b981' : (status === 'Late' ? '#f59e0b' : '#ef4444');
                statusBadge.style.color = color;
                statusBadge.style.background = `${color}15`;
                statusBadge.style.border = `1px solid ${color}20`;
                statusBadge.innerHTML = `<span style="width: 4px; height: 4px; background: ${color}; border-radius: 50%;"></span> ${status.toUpperCase()}`;
            }
        }
        
        syncToCloud();
    },

    async renderAttendance() {
        const role = (this.currentUser.role || '').toLowerCase();
        const isStudent = role === 'student';
        const isParent = role === 'parent';
        const isTeacher = role === 'teacher';

        if (isStudent || isParent) {
            return this.renderStudentAttendanceView();
        }
        
        const students = await db.students.filter(s => s.is_active !== false).toArray();
        const classes = await db.classes.toArray();
        const subjects = await db.subjects.toArray();
        
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
                        <span style="font-size: 0.7rem; font-weight: 800; color: #64748b; text-transform: uppercase;">Total Present</span>
                        <div style="font-size: 2rem; font-weight: 900; margin-top: 0.5rem; color: #1e293b;" id="stat-present">0</div>
                        <i data-lucide="user-check" style="position: absolute; right: 1.5rem; bottom: 1.5rem; color: #e2e8f0; width: 40px; height: 40px;"></i>
                    </div>
                    <div class="stat-card-premium">
                        <span style="font-size: 0.7rem; font-weight: 800; color: #64748b; text-transform: uppercase;">Late Arrivals</span>
                        <div style="font-size: 2rem; font-weight: 900; margin-top: 0.5rem; color: #f59e0b;" id="stat-late">0</div>
                        <i data-lucide="clock" style="position: absolute; right: 1.5rem; bottom: 1.5rem; color: #fef3c7; width: 40px; height: 40px;"></i>
                    </div>
                    <div class="stat-card-premium">
                        <span style="font-size: 0.7rem; font-weight: 800; color: #64748b; text-transform: uppercase;">Absent Today</span>
                        <div style="font-size: 2rem; font-weight: 900; margin-top: 0.5rem; color: #ef4444;" id="stat-absent">0</div>
                        <i data-lucide="user-x" style="position: absolute; right: 1.5rem; bottom: 1.5rem; color: #fee2e2; width: 40px; height: 40px;"></i>
                    </div>
                </div>

                <!-- Main Control Panel -->
                <div class="card" style="border-radius: 24px; padding: 0; overflow: hidden; border: 1px solid #f1f5f9; box-shadow: var(--shadow-lg);">
                    <div class="card-tabs" style="display: flex; background: #f8fafc; border-bottom: 1px solid #f1f5f9;">
                        ${!isTeacher ? `
                        <button class="att-tab-btn active" data-tab="school" style="flex: 1; padding: 1.25rem; border: none; background: none; font-weight: 700; cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 0.75rem; transition: all 0.2s;">
                            <i data-lucide="building-2"></i> School Arrival
                        </button>
                        ` : ''}
                        <button class="att-tab-btn ${isTeacher ? 'active' : ''}" data-tab="subject" style="flex: 1; padding: 1.25rem; border: none; background: none; font-weight: 700; cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 0.75rem; transition: all 0.2s; ${!isTeacher ? 'color: #94a3b8;' : ''}">
                            <i data-lucide="book-marked"></i> Subject Periods
                        </button>
                    </div>

                    <div style="padding: 1.5rem;">
                        <!-- Filters -->
                        <div style="display: flex; gap: 1rem; margin-bottom: 1.5rem; flex-wrap: wrap;">
                            <div id="class-filter-container" style="flex: 1; min-width: 200px;">
                                <label style="font-size: 0.65rem; font-weight: 800; color: #94a3b8; text-transform: uppercase; margin-bottom: 0.5rem; display: block;">Select Stream</label>
                                <select id="att-class-filter" class="input" style="width: 100%; height: 48px; border-radius: 12px; background: #f8fafc;">
                                    <option value="">All Classes</option>
                                    ${classes.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }))
                                        .map(c => `<option value="${c.name}">${c.name}</option>`).join('')}
                                </select>
                            </div>
                            <div id="subject-filter-container" style="flex: 1; min-width: 200px; display: none;">
                                <label style="font-size: 0.65rem; font-weight: 800; color: #94a3b8; text-transform: uppercase; margin-bottom: 0.5rem; display: block;">Target Subject</label>
                                <select id="att-subject-filter" class="input" style="width: 100%; height: 48px; border-radius: 12px; background: #f8fafc;">
                                    <option value="">Select Subject...</option>
                                    ${subjects.map(s => `<option value="${s.name}">${s.name}</option>`).join('')}
                                </select>
                            </div>
                            <div id="period-filter-container" style="width: 140px; display: none;">
                                <label style="font-size: 0.65rem; font-weight: 800; color: #94a3b8; text-transform: uppercase; margin-bottom: 0.5rem; display: block;">Period</label>
                                <select id="att-period" class="input" style="width: 100%; height: 48px; border-radius: 12px; background: #f8fafc;">
                                    ${[1,2,3,4,5,6,7,8].map(p => `<option value="${p}">Period ${p}</option>`).join('')}
                                </select>
                            </div>
                            <div style="width: 180px;">
                                <label style="font-size: 0.65rem; font-weight: 800; color: #94a3b8; text-transform: uppercase; margin-bottom: 0.5rem; display: block;">Date</label>
                                <input type="date" id="att-date" class="input" value="${today}" style="width: 100%; height: 48px; border-radius: 12px; background: #f8fafc; cursor: pointer;" onclick="this.showPicker()">
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

                        <!-- Responsive Card List -->
                        <div id="attendance-list-container" style="display: flex; flex-direction: column; gap: 0.75rem;">
                            <!-- Dynamic cards -->
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
        const listBody = document.getElementById('attendance-list-container');
        const subjectActions = document.getElementById('subject-actions');
        const classContainer = document.getElementById('class-filter-container');
        const periodContainer = document.getElementById('period-filter-container');

        let currentTab = 'school';

        const updateSubjectFilter = async () => {
            const cls = classFilter.value;
            if (!cls) {
                const subjects = await db.subjects.toArray();
                subjectFilter.innerHTML = `
                    <option value="">Select Subject...</option>
                    ${subjects.map(s => `<option value="${s.name}">${s.name}</option>`).join('')}
                `;
                return;
            }
            
            const assignments = await db.subject_assignments.where('class_name').equals(cls).toArray();
            const subjects = await db.subjects.toArray();
            
            const filteredSubjects = subjects.filter(s => 
                assignments.some(a => String(a.subject_id) === String(s.id))
            );
            
            subjectFilter.innerHTML = `
                <option value="">Select Subject...</option>
                ${filteredSubjects.map(s => `<option value="${s.name}">${s.name}</option>`).join('')}
            `;
        };

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
            
            // 1. Basic Class Filter (Robust matching for sub-classes)
            if (cls) {
                filteredStudents = filteredStudents.filter(s => 
                    s.class_name === cls || 
                    (s.class_name + (s.sub_class || '')).startsWith(cls) ||
                    cls.startsWith(s.class_name)
                );
            }
            
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

            // 4. SORT BY NAME (Assigned Order)
            filteredStudents.sort((a, b) => a.name.localeCompare(b.name));

            // Stats Calculation - Count UNIQUE students only
            const uniqueSchoolMap = new Map();
            records.filter(r => !r.is_subject_based).forEach(r => {
                // If multiple records exist, we take the one with better status or later time
                uniqueSchoolMap.set(r.student_id, r);
            });

            const uniqueArrived = Array.from(uniqueSchoolMap.values());
            const presentCount = uniqueArrived.filter(r => r.status === 'Present').length;
            const lateCount = uniqueArrived.filter(r => r.status === 'Late').length;
            
            const totalArrived = presentCount + lateCount;
            
            // Check Environment: Term Status, Holidays, Weekends
            const allSettings = await db.settings.toArray();
            const termStatus = allSettings.find(s => s.key === 'termStatus')?.value || 'Active';
            const holidayStr = allSettings.find(s => s.key === 'holidays')?.value || '';
            const holidays = holidayStr.split(/[\n,]+/).map(d => d.trim()).filter(d => d);
            
            const selectedDateObj = new Date(date);
            const isWeekend = selectedDateObj.getDay() === 0 || selectedDateObj.getDay() === 6; // 0=Sun, 6=Sat
            const isClosedDay = holidays.includes(date);
            const isTermInactive = termStatus === 'Inactive';
            
            const isOffDay = isWeekend || isClosedDay || isTermInactive;
            const offReason = isTermInactive ? 'On Holiday' : (isWeekend ? 'Weekend' : 'Closed Day');

            const turnout = students.length > 0 ? Math.round((totalArrived / students.length) * 100) : 0;
            const absentCount = isOffDay ? 0 : Math.max(0, students.length - totalArrived);
            
            document.getElementById('stat-present').textContent = totalArrived;
            document.getElementById('stat-late').textContent = lateCount;
            document.getElementById('stat-absent').textContent = isOffDay ? offReason : absentCount;
            document.getElementById('stat-turnout').textContent = isOffDay ? 'N/A' : `${turnout}%`;
            document.getElementById('stat-turnout-bar').style.width = `${turnout}%`;

            // Render Rows
            listBody.innerHTML = filteredStudents.map(s => {
                let record;
                if (currentTab === 'school') {
                    record = uniqueSchoolMap.get(s.student_id);
                } else {
                    record = records.find(r => r.student_id === s.student_id && r.is_subject_based && r.subject_name === subjectName);
                }
                
                // Determine Row Status
                const selectedDateObj = new Date(date);
                const isWeekend = selectedDateObj.getDay() === 0 || selectedDateObj.getDay() === 6;
                const isClosedDay = holidays.includes(date);
                const isTermInactive = termStatus === 'Inactive';
                
                let defaultStatus = 'Absent';
                let statusLabel = 'Absent';
                if (isTermInactive) { defaultStatus = 'Holiday'; statusLabel = 'Holiday'; }
                else if (isWeekend) { defaultStatus = 'Weekend'; statusLabel = 'Weekend'; }
                else if (isClosedDay) { defaultStatus = 'Closed'; statusLabel = 'Closed'; }

                const status = record ? record.status : defaultStatus;
                const statusColor = status === 'Present' ? '#10b981' : (status === 'Late' ? '#f59e0b' : (['Holiday', 'Weekend', 'Closed'].includes(status) ? '#64748b' : '#ef4444'));
                
                const formatTime = (iso) => {
                    if (!iso) return '--:--';
                    const d = new Date(iso);
                    if (isNaN(d.getTime())) {
                        // Try parsing if it's just a time string (e.g. "08:30:00")
                        if (typeof iso === 'string' && iso.includes(':') && !iso.includes('-')) {
                            return iso.substring(0, 5); 
                        }
                        return '--:--';
                    }
                    return d.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
                };

                const signIn = formatTime(record?.check_in);
                const signOut = formatTime(record?.check_out);

                return `
                    <div class="glass-collapse-card attendance-card ${record ? 'active' : ''}" style="margin: 0; background: white; border: 1px solid #e2e8f0; border-radius: 16px; transition: all 0.3s ease;">
                        <input type="checkbox" id="toggle-att-${s.student_id}" class="glass-collapse-checkbox">
                        <label for="toggle-att-${s.student_id}" class="glass-collapse-header" style="padding: 0.75rem 1rem;">
                            <div style="display: flex; align-items: center; gap: 0.85rem; flex: 1; overflow: hidden;">
                                <div style="width: 40px; height: 40px; background: #f1f5f9; border-radius: 10px; display: flex; align-items: center; justify-content: center; color: #64748b; font-weight: 800; font-size: 0.7rem; flex-shrink: 0;">
                                    ${s.name.split(' ').map(n => n[0]).join('').substring(0,2)}
                                </div>
                                <div style="flex: 1; min-width: 0;">
                                    <div style="font-weight: 800; color: #1e293b; font-size: 0.95rem; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${s.name}</div>
                                    <div style="font-size: 0.65rem; color: #94a3b8; font-weight: 600;">${s.student_id} • ${s.class_name}${s.sub_class ? ' ' + s.sub_class : ''}</div>
                                </div>
                                <div style="flex-shrink: 0; display: flex; align-items: center; gap: 0.5rem; margin-right: 1.5rem;">
                                    <span style="display: inline-flex; align-items: center; gap: 0.35rem; color: ${statusColor}; font-weight: 800; font-size: 0.6rem; background: ${statusColor}15; padding: 4px 8px; border-radius: 6px; border: 1px solid ${statusColor}20;">
                                        <span style="width: 4px; height: 4px; background: ${statusColor}; border-radius: 50%;"></span>
                                        ${status.toUpperCase()}
                                    </span>
                                </div>
                            </div>
                            <span class="glass-collapse-chevron" style="position: absolute; right: 0.75rem;"><i data-lucide="chevron-down"></i></span>
                        </label>
                        
                        <div class="glass-collapse-content" style="border-top: 1px solid #f1f5f9; background: #f8fafc; border-radius: 0 0 16px 16px;">
                            <div style="padding: 1rem; display: grid; grid-template-columns: 1fr 1fr; gap: 0.75rem;">
                                <div class="att-detail-item">
                                    <label style="display: block; font-size: 0.6rem; font-weight: 800; color: #94a3b8; text-transform: uppercase; margin-bottom: 0.2rem;">Clock In</label>
                                    <div style="font-family: monospace; font-weight: 700; color: #1e293b; font-size: 1rem;">${signIn}</div>
                                </div>
                                ${currentTab === 'school' ? `
                                <div class="att-detail-item">
                                    <label style="display: block; font-size: 0.6rem; font-weight: 800; color: #94a3b8; text-transform: uppercase; margin-bottom: 0.2rem;">Clock Out</label>
                                    <div style="font-family: monospace; font-weight: 700; color: #10b981; font-size: 1rem;">${signOut}</div>
                                </div>
                                ` : `
                                <div class="att-detail-item">
                                    <label style="display: block; font-size: 0.6rem; font-weight: 800; color: #94a3b8; text-transform: uppercase; margin-bottom: 0.2rem;">Period</label>
                                    <div style="font-weight: 700; color: #2563eb; font-size: 0.9rem;">P ${document.getElementById('att-period')?.value || 1}</div>
                                </div>
                                `}
                                
                                <div style="grid-column: 1 / -1; margin-top: 0.25rem;">
                                    <label style="display: block; font-size: 0.6rem; font-weight: 800; color: #94a3b8; text-transform: uppercase; margin-bottom: 0.5rem;">Manual Override ${isOffDay ? '(LOCKED)' : ''}</label>
                                    ${currentTab === 'school' ? `
                                        <div style="display: flex; gap: 0.4rem;">
                                            <button class="btn att-status-btn ${status === 'Present' ? 'active' : ''}" ${isOffDay ? 'disabled' : ''} style="flex: 1; height: 36px; border-radius: 8px; font-size: 0.7rem; font-weight: 700; background: ${status === 'Present' ? '#10b981' : 'white'}; color: ${status === 'Present' ? 'white' : (isOffDay ? '#cbd5e1' : '#64748b')}; border: 1px solid ${status === 'Present' ? '#10b981' : '#e2e8f0'}; cursor: ${isOffDay ? 'not-allowed' : 'pointer'}; opacity: ${isOffDay && status !== 'Present' ? '0.5' : '1'};" onclick="UI.updateAttendanceStatus('${s.student_id}', 'Present')">Present</button>
                                            <button class="btn att-status-btn ${status === 'Late' ? 'active' : ''}" ${isOffDay ? 'disabled' : ''} style="flex: 1; height: 36px; border-radius: 8px; font-size: 0.7rem; font-weight: 700; background: ${status === 'Late' ? '#f59e0b' : 'white'}; color: ${status === 'Late' ? 'white' : (isOffDay ? '#cbd5e1' : '#64748b')}; border: 1px solid ${status === 'Late' ? '#f59e0b' : '#e2e8f0'}; cursor: ${isOffDay ? 'not-allowed' : 'pointer'}; opacity: ${isOffDay && status !== 'Late' ? '0.5' : '1'};" onclick="UI.updateAttendanceStatus('${s.student_id}', 'Late')">Late</button>
                                            <button class="btn att-status-btn ${status === 'Absent' ? 'active' : ''}" ${isOffDay ? 'disabled' : ''} style="flex: 1; height: 36px; border-radius: 8px; font-size: 0.7rem; font-weight: 700; background: ${status === 'Absent' ? '#ef4444' : 'white'}; color: ${status === 'Absent' ? 'white' : (isOffDay ? '#cbd5e1' : '#64748b')}; border: 1px solid ${status === 'Absent' ? '#ef4444' : '#e2e8f0'}; cursor: ${isOffDay ? 'not-allowed' : 'pointer'}; opacity: ${isOffDay && status !== 'Absent' ? '0.5' : '1'};" onclick="UI.updateAttendanceStatus('${s.student_id}', 'Absent')">Absent</button>
                                        </div>
                                    ` : `
                                        <select class="input subject-status-select" ${isOffDay ? 'disabled' : ''} data-student-id="${s.student_id}" style="width: 100%; height: 40px; border-radius: 8px; font-weight: 700; background: ${isOffDay ? '#f8fafc' : 'white'}; border: 1px solid #e2e8f0; font-size: 0.8rem; cursor: ${isOffDay ? 'not-allowed' : 'default'}; color: ${isOffDay ? '#94a3b8' : '#1e293b'};">
                                            <option value="Absent" ${status === 'Absent' ? 'selected' : ''}>Absent</option>
                                            <option value="Present" ${status === 'Present' ? 'selected' : ''}>Present</option>
                                        </select>
                                    `}
                                </div>
                            </div>
                        </div>
                    </div>
                `;
            }).join('');

            // Logic for status buttons and other interactions will be handled by delegated events or direct onclick

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
                subjectContainer.style.display = currentTab === 'subject' ? 'block' : 'none';
                subjectActions.style.display = currentTab === 'subject' ? 'block' : 'none';
                periodContainer.style.display = currentTab === 'subject' ? 'block' : 'none';
                refreshList();
            });
        });

        const getCurrentPeriodByTime = (dateStr) => {
            const now = dateStr ? new Date(`${dateStr}T${new Date().toLocaleTimeString('en-GB')}`) : new Date();
            const hours = now.getHours();
            const mins = now.getMinutes();
            const timeVal = hours * 60 + mins; // Total minutes from midnight

            // Define Time Ranges (in minutes from midnight)
            const schedule = [
                { p: 1, start: 480, end: 520 },  // 08:00 - 08:40
                { p: 2, start: 520, end: 560 },  // 08:40 - 09:20
                { p: 3, start: 560, end: 600 },  // 09:20 - 10:00
                { p: 4, start: 600, end: 640 },  // 10:00 - 10:40
                { p: 5, start: 640, end: 690 },  // 10:40 - 11:30
                { p: 0, start: 690, end: 720 },  // 11:30 - 12:00 (BREAK)
                { p: 6, start: 720, end: 760 },  // 12:00 - 12:40
                { p: 7, start: 760, end: 800 },  // 12:40 - 13:20
                { p: 8, start: 800, end: 840 }   // 13:20 - 14:00
            ];

            const match = schedule.find(s => timeVal >= s.start && timeVal < s.end);
            return match ? match.p : null;
        };

        const suggestSubject = async () => {
            if (currentTab !== 'subject') return;
            
            const dateVal = dateInput.value;
            const cls = classFilter.value;
            const periodSelect = document.getElementById('att-period');
            
            // Auto-detect period if it's "Today"
            const isToday = dateVal === new Date().toISOString().split('T')[0];
            if (isToday) {
                const autoPeriod = getCurrentPeriodByTime();
                if (autoPeriod !== null && autoPeriod > 0) {
                    periodSelect.value = autoPeriod;
                }
            }

            const period = periodSelect.value;
            if (!dateVal || !cls || !period) return;

            const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
            const dayOfWeek = dayNames[new Date(dateVal).getDay()];
            
            // Handle Fixed Event Reminders (Soft Suggestions)
            if (dayOfWeek === 'Thursday' && period === '5') {
                Notifications.show("Note: Usually Fasting and Prayer time.", "info");
            }
            if (dayOfWeek === 'Friday' && (period === '3' || period === '4')) {
                Notifications.show("Note: Usually School Sports time.", "info");
            }

            const entry = await db.timetable
                .where('[class_name+day_of_week+period_number]')
                .equals([cls, dayOfWeek, parseInt(period)])
                .first();


            if (entry) {
                const subject = await db.subjects.get(entry.subject_id);
                if (subject) {
                    subjectFilter.value = subject.name;
                    Notifications.show(`Timetable Suggestion: ${subject.name}`, 'info');
                    refreshList();
                }
            }
        };


        [classFilter, dateInput].forEach(el => el.addEventListener('change', () => {
            if (el === classFilter) updateSubjectFilter();
            suggestSubject();
            refreshList();
        }));

        document.getElementById('att-period').addEventListener('change', () => {
            suggestSubject();
            refreshList();
        });

        subjectFilter.addEventListener('change', refreshList);
        searchInput.addEventListener('input', refreshList);

        // Save Subject Attendance
        document.getElementById('btn-save-subject-att').onclick = async () => {
            const subject = subjectFilter.value;
            const period = document.getElementById('att-period').value;
            const date = dateInput.value;
            
            if (!subject) return Notifications.show('Please select a subject first', 'warning');

            // Lock Validation: School Closed
            const allSettings = await db.settings.toArray();
            const termStatus = allSettings.find(s => s.key === 'termStatus')?.value || 'Active';
            const holidayStr = allSettings.find(s => s.key === 'holidays')?.value || '';
            const holidays = holidayStr.split(/[\n,]+/).map(d => d.trim()).filter(d => d);
            
            const selectedDateObj = new Date(date);
            const isWeekend = selectedDateObj.getDay() === 0 || selectedDateObj.getDay() === 6;
            const isClosedDay = holidays.includes(date);
            const isTermInactive = termStatus === 'Inactive';
            
            if (isWeekend || isClosedDay || isTermInactive) {
                const reason = isTermInactive ? 'School is Closed (Holiday Period)' : (isWeekend ? 'it is a Weekend' : 'it is a Public Holiday');
                Notifications.show(`Access Denied: Subject attendance cannot be marked because ${reason}.`, 'warning');
                return;
            }

            const selects = document.querySelectorAll('.subject-status-select');
            Notifications.show(`Saving attendance for ${subject} (Period ${period})...`, 'info');

            for (const sel of selects) {
                const studentId = sel.dataset.studentId;
                const status = sel.value;

                await db.attendance_records.put(prepareForSync({
                    id: `SUB_${studentId}_${subject}_P${period}_${date}`,
                    student_id: studentId,
                    date: date,
                    status: status,
                    subject_name: subject,
                    period_number: parseInt(period),
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
        // RBAC: Get classes. Teachers only see assigned classes.
        const allClasses = await db.classes.toArray();
        let accessibleClasses = allClasses;
        const isTeacher = (this.currentUser.role || '').toLowerCase() === 'teacher';
        
        if (isTeacher) {
            const formAssignments = await db.form_teachers.where('teacher_id').equals(this.currentUser.id || this.currentUser.username).toArray();
            const subjectAssignments = await db.subject_assignments.where('teacher_id').equals(this.currentUser.id || this.currentUser.username).toArray();
            
            const allowedClassNames = new Set([
                ...formAssignments.map(f => f.class_name),
                ...subjectAssignments.map(s => s.class_name)
            ]);
            accessibleClasses = allClasses.filter(c => allowedClassNames.has(c.name));
        }
        accessibleClasses.sort((a,b) => (a.name || '').localeCompare(b.name || ''));

        // Pre-fill settings
        const settingsArray = await db.settings.toArray();
        const settings = {};
        settingsArray.forEach(s => settings[s.key] = s.value);
        const currentSession = settings.currentSession || '2025/2026';
        const currentTerm = settings.currentTerm || '1st Term';

        this.contentArea.innerHTML = `
            <div class="view-container" style="padding: 0; background: transparent;">
                
                <!-- Premium Header -->
                <div class="biodata-header-premium">
                    <div>
                        <h1 class="report-header-title"><i data-lucide="bar-chart-2"></i> Report Intelligence</h1>
                        <p class="report-header-subtitle" id="report-subtitle">Performance auditing and result generation for School.</p>
                    </div>
                    <div class="analytics-container">
                        <div class="analytics-box">
                            <div class="analytics-value" id="stat-qualified">0</div>
                            <div class="analytics-label">Qualified Pass</div>
                        </div>
                        <div class="analytics-box">
                            <div class="analytics-value" id="stat-elite">0</div>
                            <div class="analytics-label">Elite (A1/B2)</div>
                        </div>
                        <div class="analytics-box">
                            <div class="analytics-value" id="stat-records">0</div>
                            <div class="analytics-label">Records Synced</div>
                        </div>
                    </div>
                </div>

                <!-- Control Console -->
                <div class="glass-collapse-card" style="margin: 0 1.5rem; width: auto; background: transparent; backdrop-filter: none; -webkit-backdrop-filter: none; box-shadow: none; border: none;">
                    <input type="checkbox" id="toggle-reports-console" class="glass-collapse-checkbox" checked>
                    <label for="toggle-reports-console" class="glass-collapse-header" style="background: rgba(255, 255, 255, 0.7); backdrop-filter: blur(12px); -webkit-backdrop-filter: blur(12px); border: 1px solid rgba(255, 255, 255, 0.5); box-shadow: 0 4px 15px -3px rgba(0, 0, 0, 0.05); margin-bottom: 0.5rem; display: flex;">
                        <span class="glass-collapse-title"><i data-lucide="sliders" style="width: 18px; color: #2563eb;"></i> Configuration Console</span>
                        <span class="glass-collapse-chevron"><i data-lucide="chevron-down"></i></span>
                    </label>
                    
                    <div class="glass-collapse-content" style="padding: 0; max-height: auto;">
                        <div class="control-console-cards" style="margin: 0; display: flex; flex-direction: column; gap: 0.75rem;">
                            <div class="console-card">
                                <div class="console-card-header"><i data-lucide="target"></i> Stream Target</div>
                                <div class="console-input-wrapper">
                                    <select id="report-class" class="console-input">
                                        <option value="" disabled selected>Select a Stream</option>
                                        ${accessibleClasses.map(c => `<option value="${c.name}">${c.name}</option>`).join('')}
                                    </select>
                                </div>
                            </div>
                            <div class="console-card">
                                <div class="console-card-header"><i data-lucide="calendar"></i> Session</div>
                                <div class="console-input-wrapper">
                                    <select id="report-session" class="console-input">
                                        <option value="2025/2026" ${currentSession === '2025/2026' ? 'selected' : ''}>2025/2026</option>
                                        <option value="2024/2025" ${currentSession === '2024/2025' ? 'selected' : ''}>2024/2025</option>
                                        <option value="2026/2027" ${currentSession === '2026/2027' ? 'selected' : ''}>2026/2027</option>
                                    </select>
                                </div>
                            </div>
                            <div class="console-card">
                                <div class="console-card-header"><i data-lucide="bookmark"></i> Academic Term</div>
                                <div class="console-input-wrapper">
                                    <select id="report-term" class="console-input">
                                        <option value="1st Term" ${currentTerm === '1st Term' ? 'selected' : ''}>1st Term</option>
                                        <option value="2nd Term" ${currentTerm === '2nd Term' ? 'selected' : ''}>2nd Term</option>
                                        <option value="3rd Term" ${currentTerm === '3rd Term' ? 'selected' : ''}>3rd Term</option>
                                    </select>
                                </div>
                            </div>
                             <div class="console-card">
                                <div class="console-card-header"><i data-lucide="clock"></i> Term Closure</div>
                                <div class="console-input-wrapper">
                                    <input type="date" id="report-closure" class="console-input" style="font-size: 0.85rem;" value="${settings.termClosure || ''}" onclick="this.showPicker()">
                                </div>
                            </div>
                            <div class="console-card">
                                <div class="console-card-header"><i data-lucide="calendar-plus"></i> Next Term Begins</div>
                                <div class="console-input-wrapper">
                                    <input type="date" id="report-next-term" class="console-input" style="font-size: 0.85rem;" value="${settings.nextTermBegins || ''}" onclick="this.showPicker()">
                                </div>
                            </div>
                            <button id="btn-sync-generate" class="btn-sync-generate" style="width: 100%; border-radius: 12px; height: 50px;">
                                <i data-lucide="refresh-cw"></i> Sync & Generate
                            </button>
                        </div>
                    </div>
                </div>

                <!-- Main Content Area -->
                <div id="reports-main-content">
                    <div class="archive-standby animate-fade-in-up">
                        <i data-lucide="file-box"></i>
                        <h3 class="archive-standby-title">Reports Archive Standby</h3>
                        <p class="archive-standby-text">Select a stream target and academic term from the control console above, then click 'Sync & Generate' to compile the master broadsheet.</p>
                    </div>
                </div>

            </div>
        `;

        if (typeof lucide !== 'undefined') lucide.createIcons();

        const classSelect = document.getElementById('report-class');
        const subtitle = document.getElementById('report-subtitle');
        const btnSyncGenerate = document.getElementById('btn-sync-generate');
        const mainContent = document.getElementById('reports-main-content');
        
        let loadedStudents = [];
        let loadedSubjects = [];
        let loadedScores = [];
        let loadedAttendance = [];

        classSelect.addEventListener('change', () => {
            if (classSelect.value) {
                subtitle.innerHTML = `Performance auditing and result generation for <strong style="color: #60a5fa;">${classSelect.value}</strong>.`;
            }
        });

        btnSyncGenerate.addEventListener('click', async () => {
            const className = classSelect.value;
            const session = document.getElementById('report-session').value;
            const term = document.getElementById('report-term').value;
            const closureDate = document.getElementById('report-closure').value;
            const nextTermDate = document.getElementById('report-next-term').value;

            // NEW: Persist these to global settings
            await db.settings.put({ key: 'termClosure', value: closureDate });
            await db.settings.put({ key: 'nextTermBegins', value: nextTermDate });
            await db.settings.put({ key: 'currentSession', value: session });
            await db.settings.put({ key: 'currentTerm', value: term });

            if (!className) return Notifications.show('Please select a Stream Target.', 'warning');

            // Sync simulation / Loading state
            btnSyncGenerate.innerHTML = `<i data-lucide="loader" class="spin"></i> Compiling...`;
            if (typeof lucide !== 'undefined') lucide.createIcons();
            btnSyncGenerate.disabled = true;

            try {
                // Fetch Data
                loadedStudents = await db.students.where('class_name').equals(className).filter(s => s.is_active !== false).toArray();
                loadedStudents.sort((a,b) => a.name.localeCompare(b.name));
                
                const classScores = await db.scores.where('class_name').equals(className).toArray();
                loadedScores = classScores.filter(s => s.term === term && s.session === session);
                
                loadedAttendance = await db.attendance_records.filter(a => a.term === term && a.session === session).toArray();

                const subjectIds = [...new Set(loadedScores.map(s => s.subject_id))];
                loadedSubjects = [];
                for (const sid of subjectIds) {
                    const sub = await db.subjects.get(sid);
                    if (sub) loadedSubjects.push(sub);
                }

                // Analytics Calculation
                let qualifiedPass = 0;
                let eliteCount = 0;
                
                const studentStats = loadedStudents.map(student => {
                    const studentScores = loadedScores.filter(s => s.student_id === student.student_id);
                    let totalScore = 0;
                    let subjectCount = studentScores.length;
                    
                    studentScores.forEach(s => {
                        totalScore += Number(s.total) || 0;
                    });
                    
                    const average = subjectCount > 0 ? (totalScore / subjectCount).toFixed(1) : 0;
                    
                    if (average >= 50) qualifiedPass++;
                    if (average >= 75) eliteCount++; // 75+ is generally A1/B2 range
                    
                    return {
                        ...student,
                        totalScore,
                        average: Number(average)
                    };
                });

                // Update Header
                document.getElementById('stat-qualified').textContent = qualifiedPass;
                document.getElementById('stat-elite').textContent = eliteCount;
                document.getElementById('stat-records').textContent = loadedScores.length;

                // Render Table
                mainContent.innerHTML = `
                    <div class="card animate-fade-in-up" style="margin: 0 1.5rem; padding: 1.5rem; border-radius: 16px; box-shadow: var(--shadow-sm);">
                        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1.5rem;">
                            <h3 style="margin: 0; font-size: 1.1rem; font-weight: 800;">Academic Roster</h3>
                            <div style="display: flex; gap: 0.5rem;">
                                <button id="btn-batch-print" class="btn btn-secondary" style="font-size: 0.8rem; padding: 0.4rem 0.8rem; border-radius: 8px;">
                                    <i data-lucide="printer" style="width: 14px; height: 14px;"></i> Batch Print
                                </button>
                                <button id="btn-matrix-view" class="btn btn-primary" style="font-size: 0.8rem; padding: 0.4rem 0.8rem; border-radius: 8px;">
                                    <i data-lucide="layout-grid" style="width: 14px; height: 14px;"></i> Matrix View
                                </button>
                            </div>
                        </div>

                        <div class="table-responsive">
                            <table class="table w-100" style="font-size: 0.85rem;">
                                <thead>
                                    <tr>
                                        <th>S/N</th>
                                        <th>Student Name</th>
                                        <th>Total Score</th>
                                        <th>Average</th>
                                        <th>Status</th>
                                        <th style="text-align: right;">Action</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    ${studentStats.map((s, idx) => {
                                        let badgeClass = 'grade-danger';
                                        let statusText = 'Fail';
                                        let avgClass = 'avg-fail';
                                        
                                        if (s.average >= 75) { badgeClass = 'grade-gold'; statusText = 'Elite (A)'; avgClass = 'avg-pass'; }
                                        else if (s.average >= 60) { badgeClass = 'grade-silver'; statusText = 'Credit (B/C)'; avgClass = 'avg-pass'; }
                                        else if (s.average >= 50) { badgeClass = 'grade-bronze'; statusText = 'Pass (D/E)'; avgClass = 'avg-pass'; }
                                        
                                        return `
                                        <tr>
                                            <td>${idx + 1}</td>
                                            <td style="font-weight: 600;">${s.name}</td>
                                            <td>${s.totalScore}</td>
                                            <td class="${avgClass}">${s.average}%</td>
                                            <td><span class="grade-badge ${badgeClass}">${statusText}</span></td>
                                            <td style="text-align: right;">
                                                <button class="btn btn-secondary btn-sm generate-individual-pdf" data-id="${s.student_id}" style="padding: 0.2rem 0.5rem; font-size: 0.75rem;">
                                                    <i data-lucide="file-text" style="width: 12px; height: 12px;"></i> View
                                                </button>
                                            </td>
                                        </tr>
                                    `}).join('')}
                                </tbody>
                            </table>
                        </div>
                    </div>
                `;
                
                if (typeof lucide !== 'undefined') lucide.createIcons();

                // Attach Table Listeners
                document.querySelectorAll('.generate-individual-pdf').forEach(btn => {
                    btn.addEventListener('click', async (e) => {
                        const id = e.currentTarget.dataset.id;
                        const student = loadedStudents.find(st => st.student_id === id);
                        if (!student) return;

                        const sScores = loadedScores.filter(sc => sc.student_id === id);
                        const sAtt = loadedAttendance.filter(a => a.student_id === id);
                        
                        // Populate subject names for PDF generator
                        for (const score of sScores) {
                            const sub = loadedSubjects.find(sb => sb.id === score.subject_id);
                            score.subject_name = sub ? sub.name : 'Unknown Subject';
                        }
                        
                        // Inject Term Closure into schoolInfo specifically for this run
                        const allSettings = await db.settings.toArray();
                        const settings = {};
                        allSettings.forEach(s => settings[s.key] = s.value);
                        
                        const schoolInfo = {
                            name: settings.schoolName || 'NEW KINGS AND QUEENS MONTESSORI SCHOOL',
                            address: settings.schoolAddress || '123 Education Street, Academic City',
                            phone: settings.schoolPhone || '08035461711, 08037316183, 08058134229',
                            email: settings.schoolEmail || 'info@school.com',
                            motto: settings.schoolMotto || 'Knowledge is Power',
                            principalName: settings.principalName || 'Mr. Lartey Sampson',
                            principalSignature: settings.principalSignature || null,
                            logo: settings.schoolLogo || null,
                            themeColor: settings.themeColor || '#060495',
                            schoolManager: settings.schoolManager || 'TAMADU CODE',
                            nextTermBegins: closureDate // Dynamic date passed from UI
                        };

                        Notifications.show(`Generating report for ${student.name}...`, 'info');
                        await generateReportCard(student, sScores, schoolInfo, sAtt);
                    });
                });

                document.getElementById('btn-matrix-view').addEventListener('click', async () => {
                    if (loadedStudents.length === 0) return Notifications.show('No students to generate mastersheet', 'error');
                    Notifications.show('Compiling matrix view...', 'info');
                    await generateMastersheet(className, loadedStudents, loadedSubjects, loadedScores, term, session);
                    Notifications.show('Mastersheet generated!', 'success');
                });

                document.getElementById('btn-batch-print').addEventListener('click', async () => {
                    Notifications.show('Batch PDF generation requires desktop client support.', 'warning');
                });

            } catch (err) {
                console.error("Report Generation Error:", err);
                Notifications.show('An error occurred during compilation.', 'error');
            } finally {
                btnSyncGenerate.innerHTML = `<i data-lucide="refresh-cw"></i> Sync & Generate`;
                if (typeof lucide !== 'undefined') lucide.createIcons();
                btnSyncGenerate.disabled = false;
            }
        });
    },


    async renderStaff() {
        const profiles = await db.profiles.toArray();
        const teachers = profiles.filter(p => (p.role === 'Teacher' || p.role === 'Admin') && p.status !== 'Terminated');
        const formerStaff = profiles.filter(p => p.status === 'Terminated' || p.role === 'Former Staff');

        // Get assignment counts per teacher
        const allAssignments = await db.subject_assignments.toArray();
        const assignmentCounts = {};
        allAssignments.forEach(a => {
            assignmentCounts[a.teacher_id] = (assignmentCounts[a.teacher_id] || 0) + 1;
        });

        // Form teacher mapping
        const formTeachers = await db.form_teachers.toArray();
        const formTeacherMap = {};
        formTeachers.forEach(ft => { formTeacherMap[ft.teacher_id] = ft.class_name; });

        this.contentArea.innerHTML = `
            <div class="view-container animate-fade-in" style="padding: 1.5rem; background: #f8fafc; min-height: 100vh;">
                <!-- Premium Header -->
                <div class="page-banner" style="background: linear-gradient(135deg, #0f172a 0%, #1e293b 100%); border-radius: 24px; padding: 2.5rem; color: white; box-shadow: 0 20px 25px -5px rgba(0,0,0,0.15); margin-bottom: 2rem; position: relative; overflow: hidden;">
                    <div style="position: absolute; right: -30px; top: -30px; width: 180px; height: 180px; background: rgba(99,102,241,0.15); border-radius: 50%;"></div>
                    <div style="position: absolute; right: 80px; bottom: -40px; width: 120px; height: 120px; background: rgba(99,102,241,0.1); border-radius: 50%;"></div>
                    <div style="position: relative; z-index: 1; display: flex; justify-content: space-between; align-items: center;">
                        <div>
                            <h1 style="margin: 0; font-size: 2.25rem; font-weight: 900; letter-spacing: -0.03em; display: flex; align-items: center; gap: 1rem;">
                                <i data-lucide="users" style="width: 36px; height: 36px;"></i> Faculty Command Center
                            </h1>
                            <p style="margin-top: 0.5rem; opacity: 0.7; font-size: 1rem;">Manage staff accounts, assignments, and access credentials.</p>
                        </div>
                        <div style="display: flex; gap: 1rem; align-items: center;">
                            <div style="text-align: center; background: rgba(255,255,255,0.1); padding: 0.75rem 1.5rem; border-radius: 16px;">
                                <div style="font-size: 1.75rem; font-weight: 900;">${teachers.length}</div>
                                <div style="font-size: 0.65rem; font-weight: 700; text-transform: uppercase; opacity: 0.7;">Active Staff</div>
                            </div>
                            <button id="btn-add-staff" style="height: 52px; border-radius: 16px; padding: 0 1.75rem; display: flex; align-items: center; gap: 0.75rem; background: #6366f1; color: white; font-weight: 800; font-size: 1rem; border: none; cursor: pointer; box-shadow: 0 4px 14px rgba(99,102,241,0.4); transition: all 0.2s;">
                                <i data-lucide="user-plus" style="width: 20px;"></i> Onboard Staff
                            </button>
                            <button id="btn-bulk-repair-staff" style="height: 52px; border-radius: 16px; padding: 0 1.25rem; display: flex; align-items: center; gap: 0.5rem; background: #fef9c3; color: #854d0e; font-weight: 800; font-size: 0.85rem; border: 1px solid #fef08a; cursor: pointer;">
                                <i data-lucide="shield-alert" style="width: 18px;"></i> Bulk Repair
                            </button>
                        </div>
                    </div>
                </div>

                <!-- Search Bar -->
                <div style="margin-bottom: 1.5rem;">
                    <div style="position: relative; max-width: 400px;">
                        <i data-lucide="search" style="position: absolute; left: 1rem; top: 50%; transform: translateY(-50%); color: #94a3b8; width: 18px;"></i>
                        <input type="text" id="staff-search" class="input" placeholder="Search by name or email..." style="width: 100%; padding-left: 3rem; height: 48px; border-radius: 14px; font-weight: 600; border: 2px solid #e2e8f0;">
                    </div>
                </div>

                <!-- Staff Grid -->
                <div id="staff-grid" class="faculty-grid" style="display: grid; grid-template-columns: repeat(auto-fill, minmax(320px, 1fr)); gap: 1.5rem;">
                    ${teachers.length === 0 ? `
                        <div style="grid-column: 1 / -1; text-align: center; padding: 5rem 2rem; background: white; border-radius: 24px; border: 2px dashed #e2e8f0;">
                            <div style="width: 80px; height: 80px; background: #f1f5f9; color: #94a3b8; border-radius: 50%; display: flex; align-items: center; justify-content: center; margin: 0 auto 1.5rem;">
                                <i data-lucide="user-x" style="width: 40px; height: 40px;"></i>
                            </div>
                            <h3 style="color: #1e293b; font-weight: 700; margin-bottom: 0.5rem;">No Staff Members Found</h3>
                            <p style="color: #64748b;">Click "Onboard Staff" to register your first faculty member.</p>
                        </div>
                    ` : teachers.map(t => `
                        <div class="faculty-card" data-name="${(t.full_name || '').toLowerCase()}" data-email="${(t.email || '').toLowerCase()}" onclick="UI.renderStaffDetail('${t.id}')" style="cursor: pointer; background: white; border-radius: 20px; padding: 1.75rem; border: 1px solid #e2e8f0; box-shadow: var(--shadow-sm); transition: all 0.3s ease; position: relative; overflow: hidden;">
                            <div style="display: flex; gap: 1.25rem; align-items: flex-start;">
                                <div style="width: 60px; height: 60px; border-radius: 18px; overflow: hidden; background: #f1f5f9; flex-shrink: 0; border: 3px solid #e0e7ff;">
                                    <img src="https://api.dicebear.com/7.x/avataaars/svg?seed=${t.full_name || t.id}" alt="${t.full_name}" style="width: 100%; height: 100%; object-fit: cover;">
                                </div>
                                <div style="flex: 1; min-width: 0;">
                                    <h3 style="font-weight: 800; color: #1e293b; font-size: 1.1rem; margin: 0 0 0.25rem 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${t.full_name || 'Unnamed Staff'}</h3>
                                    <div style="display: flex; gap: 0.5rem; align-items: center; margin-bottom: 0.75rem; flex-wrap: wrap;">
                                        <span style="background: ${t.role === 'Admin' ? '#fef3c7' : '#e0e7ff'}; color: ${t.role === 'Admin' ? '#92400e' : '#4338ca'}; font-weight: 800; border-radius: 8px; font-size: 0.65rem; padding: 3px 10px; text-transform: uppercase;">${t.role}</span>
                                        ${formTeacherMap[t.id] ? `<span style="background: #ecfdf5; color: #065f46; font-weight: 700; border-radius: 8px; font-size: 0.65rem; padding: 3px 10px;">Form: ${formTeacherMap[t.id]}</span>` : ''}
                                    </div>
                                    <div style="display: flex; flex-direction: column; gap: 0.4rem;">
                                        <div style="display: flex; align-items: center; gap: 0.5rem; font-size: 0.8rem; color: #64748b;">
                                            <i data-lucide="mail" style="width: 14px; color: #94a3b8;"></i>
                                            <span style="white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${t.email || 'No email set'}</span>
                                        </div>
                                        <div style="display: flex; align-items: center; gap: 0.5rem; font-size: 0.8rem; color: #64748b;">
                                            <i data-lucide="book-open" style="width: 14px; color: #94a3b8;"></i>
                                            <span>${assignmentCounts[t.id] || 0} subject assignments</span>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    `).join('')}
                </div>

                <!-- Former Staff Section -->
                ${formerStaff.length > 0 ? `
                    <details style="margin-top: 2rem;">
                        <summary style="cursor: pointer; font-weight: 800; color: #94a3b8; font-size: 0.85rem; text-transform: uppercase; letter-spacing: 0.05em; padding: 1rem 0;">
                            Former Staff (${formerStaff.length})
                        </summary>
                        <div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap: 1rem; margin-top: 1rem;">
                            ${formerStaff.map(t => `
                                <div style="background: #f8fafc; border-radius: 16px; padding: 1.25rem; border: 1px solid #e2e8f0; opacity: 0.7;">
                                    <div style="display: flex; align-items: center; gap: 1rem;">
                                        <div style="width: 40px; height: 40px; border-radius: 12px; overflow: hidden; background: #e2e8f0;">
                                            <img src="https://api.dicebear.com/7.x/avataaars/svg?seed=${t.full_name || t.id}" style="width: 100%; height: 100%;">
                                        </div>
                                        <div>
                                            <div style="font-weight: 700; color: #64748b;">${t.full_name || 'Unknown'}</div>
                                            <div style="font-size: 0.75rem; color: #94a3b8;">Contract Terminated</div>
                                        </div>
                                    </div>
                                </div>
                            `).join('')}
                        </div>
                    </details>
                ` : ''}
            </div>
        `;

        if (typeof lucide !== 'undefined') lucide.createIcons();

        // Search functionality
        const searchInput = document.getElementById('staff-search');
        if (searchInput) {
            searchInput.addEventListener('input', (e) => {
                const query = e.target.value.toLowerCase();
                document.querySelectorAll('.faculty-card').forEach(card => {
                    const name = card.dataset.name || '';
                    const email = card.dataset.email || '';
                    card.style.display = (name.includes(query) || email.includes(query)) ? '' : 'none';
                });
            });
        }

        // Bulk Repair Staff Logic
        const bulkStaffBtn = document.getElementById('btn-bulk-repair-staff');
        if (bulkStaffBtn) {
            bulkStaffBtn.onclick = async () => {
                const allStaff = (await db.profiles.toArray()).filter(p => p.role === 'Teacher' || p.role === 'Admin');
                if (!confirm(`This will re-provision login accounts for ALL ${allStaff.length} staff members. Password will be reset to "Staff123!". Continue?`)) return;
                
                bulkStaffBtn.disabled = true;
                let count = 0;
                
                for (const s of allStaff) {
                    if (!s.email) continue;
                    count++;
                    bulkStaffBtn.innerHTML = `<i data-lucide="loader" class="spin"></i> Repairing ${count}/${allStaff.length}...`;
                    
                    try {
                        const { data: authData, error: authError } = await registerUser(s.email, 'Staff123!', s.full_name, s.role);
                        
                        const client = window.getSupabase ? window.getSupabase() : null;
                        if (client && (authData?.user || s.id)) {
                            await client.from('profiles').upsert({
                                id: authData?.user?.id || s.id,
                                full_name: s.full_name,
                                role: s.role,
                                assigned_id: s.assigned_id,
                                email: s.email
                            });
                        }
                        
                        // Small delay to prevent rate limiting
                        await new Promise(resolve => setTimeout(resolve, 500));
                    } catch (err) {
                        console.warn(`Failed to repair staff ${s.email}:`, err);
                    }
                }
                
                Notifications.show(`Bulk repair complete! ${count} staff accounts processed.`, 'success');
                bulkStaffBtn.disabled = false;
                bulkStaffBtn.innerHTML = '<i data-lucide="shield-alert" style="width: 18px;"></i> Bulk Repair';
                if (typeof lucide !== 'undefined') lucide.createIcons();
            };
        }

        // Add Staff Button
        document.getElementById('btn-add-staff').onclick = async () => {
            const modalHtml = `
                <div style="display: flex; flex-direction: column; gap: 1.25rem; max-height: 70vh; overflow-y: auto; padding-right: 0.5rem;">
                    <div style="background: #eff6ff; border: 1px solid #dbeafe; border-radius: 12px; padding: 1rem; font-size: 0.85rem; color: #1e40af; display: flex; align-items: center; gap: 0.75rem;">
                        <i data-lucide="info" style="width: 18px; flex-shrink: 0;"></i>
                        <span>A login account will be created automatically. Default password: <strong>Staff123!</strong></span>
                    </div>
                    <div class="form-group">
                        <label style="font-size: 0.7rem; font-weight: 800; color: #94a3b8; letter-spacing: 0.05em;">FULL LEGAL NAME *</label>
                        <input type="text" id="staff-name" class="input" placeholder="e.g. Dr. John Doe" style="width: 100%; height: 50px;">
                    </div>
                    <div style="display: grid; grid-template-columns: 1.5fr 1fr; gap: 1rem;">
                        <div class="form-group">
                            <label style="font-size: 0.7rem; font-weight: 800; color: #94a3b8; letter-spacing: 0.05em;">LOGIN EMAIL *</label>
                            <input type="email" id="staff-email" class="input" placeholder="john.doe@school.edu" style="width: 100%;">
                        </div>
                        <div class="form-group">
                            <label style="font-size: 0.7rem; font-weight: 800; color: #94a3b8; letter-spacing: 0.05em;">SYSTEM ROLE *</label>
                            <select id="staff-role" class="input" style="width: 100%;">
                                <option value="Teacher">Teacher</option>
                                <option value="Admin">Administrator</option>
                            </select>
                        </div>
                    </div>
                    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 1rem;">
                        <div class="form-group">
                            <label style="font-size: 0.7rem; font-weight: 800; color: #94a3b8; letter-spacing: 0.05em;">PHONE NUMBER</label>
                            <input type="text" id="staff-phone" class="input" placeholder="080XXXXXXXX" style="width: 100%;">
                        </div>
                        <div class="form-group">
                            <label style="font-size: 0.7rem; font-weight: 800; color: #94a3b8; letter-spacing: 0.05em;">EMPLOYMENT TYPE</label>
                            <select id="staff-type" class="input" style="width: 100%;">
                                <option value="Full-Time">Full-Time</option>
                                <option value="Part-Time">Part-Time</option>
                                <option value="Contract">Contract</option>
                            </select>
                        </div>
                    </div>
                    <div class="form-group">
                        <label style="font-size: 0.7rem; font-weight: 800; color: #94a3b8; letter-spacing: 0.05em;">ACADEMIC DEPARTMENT</label>
                        <input type="text" id="staff-dept" class="input" placeholder="e.g. Sciences, Arts, Languages" style="width: 100%;">
                    </div>
                    <div class="form-group">
                        <label style="font-size: 0.7rem; font-weight: 800; color: #94a3b8; letter-spacing: 0.05em;">PROFESSIONAL QUALIFICATIONS</label>
                        <textarea id="staff-quals" class="input" placeholder="Degrees, certifications, etc." style="width: 100%; height: 60px; resize: none;"></textarea>
                    </div>
                </div>
            `;
            
            this.showModal('Onboard New Staff Member', modalHtml, async () => {
                const name = document.getElementById('staff-name').value.trim();
                const email = document.getElementById('staff-email').value.trim();
                const role = document.getElementById('staff-role').value;
                const phone = document.getElementById('staff-phone')?.value.trim() || '';
                const empType = document.getElementById('staff-type')?.value || 'Full-Time';
                const dept = document.getElementById('staff-dept')?.value.trim() || '';
                const quals = document.getElementById('staff-quals')?.value.trim() || '';
                
                if (!name || !email) {
                    Notifications.show('Full name and login email are required', 'error');
                    throw new Error('Validation failed');
                }

                // Validate email format
                if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
                    Notifications.show('Please enter a valid email address', 'error');
                    throw new Error('Validation failed');
                }

                const DEFAULT_PASSWORD = 'Staff123!';

                try {
                    // 1. Create Supabase auth account
                    Notifications.show('Creating login account...', 'info');
                    const { data: authData, error: authError } = await registerUser(email, DEFAULT_PASSWORD, name, role);

                    if (authError) {
                        // If it's a "user already registered" error, still create the local profile
                        if (authError.message && authError.message.includes('already registered')) {
                            Notifications.show('Email already has an account. Adding to local directory.', 'warning');
                        } else {
                            console.error('Auth creation error:', authError);
                            Notifications.show(`Auth error: ${authError.message}. Creating local record only.`, 'warning');
                        }
                    }

                    // 2. Create local profile record
                    const userId = authData?.user?.id || `STF${Math.random().toString(36).substr(2, 7).toUpperCase()}`;
                    
                    const newStaff = prepareForSync({
                        id: userId,
                        full_name: name,
                        email: email,
                        role: role,
                        phone: phone,
                        employment_type: empType,
                        department: dept,
                        qualifications: quals,
                        assigned_id: `SCH/STF/${Math.floor(Math.random()*9000)+1000}`
                    });

                    await db.profiles.put(newStaff); // Use put in case auth trigger already created it
                    
                    Notifications.show(`${name} onboarded successfully! They can log in with: ${email} / ${DEFAULT_PASSWORD}`, 'success');
                    this.renderStaff();
                    syncToCloud();
                } catch (err) {
                    if (err.message !== 'Validation failed') {
                        console.error('Staff creation error:', err);
                        Notifications.show('Failed to create staff account', 'error');
                    }
                    throw err;
                }
            }, 'Create Account & Register', 'user-plus');

            // Re-render icons inside modal
            setTimeout(() => { if (typeof lucide !== 'undefined') lucide.createIcons(); }, 100);
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
                                    <div style="font-size: 0.75rem; color: #94a3b8; font-weight: 700;">EMAIL / LOGIN</div>
                                    <div style="font-weight: 600; color: #475569;">${staff.email || staff.username || 'Not Set'}</div>
                                </div>
                            </div>
                            <button id="btn-staff-repair-auth" class="btn btn-secondary" style="width: 100%; border-radius: 12px; margin-top: 1rem; background: #fef9c3; color: #854d0e; border: 1px solid #fef08a; font-weight: 800; font-size: 0.75rem;">
                                <i data-lucide="shield-alert"></i> Repair Auth dashboard
                            </button>
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

        // Repair Staff Auth Logic
        const repairBtn = document.getElementById('btn-staff-repair-auth');
        if (repairBtn) {
            repairBtn.onclick = async () => {
                const staffEmail = staff.email;
                if (!staffEmail) return Notifications.show('Staff has no email set.', 'error');
                
                if (!confirm(`This will re-provision the login dashboard for ${staff.full_name}. Password will be reset to "Staff123!". Proceed?`)) return;
                
                repairBtn.disabled = true;
                repairBtn.innerHTML = '<i data-lucide="loader" class="spin"></i> Repairing...';
                
                try {
                    const DEFAULT_STAFF_PASSWORD = 'Staff123!';
                    const { data: authData, error: authError } = await registerUser(staffEmail, DEFAULT_STAFF_PASSWORD, staff.full_name, staff.role);
                    
                    if (authError && !authError.message.includes('already registered')) {
                        throw authError;
                    }
                    
                    // Sync profile to Supabase
                    const client = window.getSupabase ? window.getSupabase() : null;
                    if (client) {
                        const { error: pError } = await client.from('profiles').upsert({
                            id: authData?.user?.id || staff.id,
                            full_name: staff.full_name,
                            role: staff.role,
                            email: staffEmail,
                            assigned_id: staff.assigned_id,
                            updated_at: new Date().toISOString()
                        });
                        if (pError) console.warn('Staff profile repair warning:', pError);
                    }

                    Notifications.show(`Staff login repaired. Use Staff123! as password.`, 'success');
                } catch (err) {
                    console.error('Staff Repair error:', err);
                    Notifications.show(`Repair failed: ${err.message}`, 'error');
                } finally {
                    repairBtn.disabled = false;
                    repairBtn.innerHTML = '<i data-lucide="shield-alert"></i> Repair Auth dashboard';
                    if (typeof lucide !== 'undefined') lucide.createIcons();
                }
            };
        }

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

        // Fetch results if student
        const studentResults = isStudent ? await db.cbt_results.where('student_id').equals(this.currentUser.assigned_id).toArray() : [];
        const resultDict = studentResults.reduce((acc, r) => ({...acc, [r.exam_id]: r}), {});

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
                        exams.map(e => {
                            const result = resultDict[e.id];
                            return `
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
                                        ${result ? '<span class="badge success">COMPLETED</span>' : `<span class="badge badge-${e.status === 'Active' ? 'success' : 'warning'}" style="padding: 6px 12px; border-radius: 8px;">${e.status}</span>`}
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
                                        ${result ? `
                                        <div>
                                            <div style="font-size: 0.7rem; font-weight: 800; color: #10b981; margin-bottom: 0.25rem;">YOUR SCORE</div>
                                            <div style="font-weight: 800; color: #064e3b; font-size: 1.25rem;">${result.score} / ${result.total_questions}</div>
                                        </div>
                                        ` : `
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
                                        `}
                                    </div>
                                </div>
                            </div>
                        `;
                        }).join('')}
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
                            <p style="color: #64748b; font-size: 0.85rem;">Select multiple teachers, classes, and subjects for high-speed deployment.</p>
                        </div>
                    </div>

                        <div class="form-group">
                            <label style="font-size: 0.75rem; font-weight: 700; color: #64748b; margin-bottom: 0.5rem; display: block;">1. TARGET STAFF MEMBER</label>
                            <select id="bulk-teachers-select" class="input" style="width: 100%; height: 52px; border-radius: 12px; background: #f8fafc; font-weight: 700;">
                                <option value="">Select Teacher...</option>
                                ${teachers.map(t => `<option value="${t.id}">${t.full_name}</option>`).join('')}
                            </select>
                        </div>

                        <div class="form-group">
                            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.5rem;">
                                <label style="font-size: 0.75rem; font-weight: 700; color: #64748b; display: block; margin: 0;">2. SELECT DEPLOYMENT CLASSES (<span id="count-classes">0</span>)</label>
                                <div style="display: flex; gap: 0.5rem;">
                                    <button class="btn-xs" onclick="UI.bulkSelectClasses('all')">ALL</button>
                                    <button class="btn-xs" onclick="UI.bulkSelectClasses('jss')">JSS</button>
                                    <button class="btn-xs" onclick="UI.bulkSelectClasses('sss')">SSS</button>
                                </div>
                            </div>
                            <div class="glass-collapse-card" style="background: white; border: 1px solid #e2e8f0; border-radius: 12px; overflow: hidden;">
                                <input type="checkbox" id="toggle-bulk-classes" class="glass-collapse-checkbox">
                                <label for="toggle-bulk-classes" class="glass-collapse-header" style="background: #f8fafc; padding: 1rem; cursor: pointer; border-bottom: 1px solid #f1f5f9; min-height: 52px; display: flex;">
                                    <span class="glass-collapse-title" style="font-size: 0.9rem; font-weight: 700;"><i data-lucide="layers" style="width: 16px;"></i> Select Classes (Multi-select enabled)</span>
                                    <span class="glass-collapse-chevron"><i data-lucide="chevron-down"></i></span>
                                </label>
                                <div class="glass-collapse-content" style="max-height: 250px; overflow-y: auto; padding: 0.5rem; display: grid; grid-template-columns: 1fr 1fr; gap: 0.5rem;">
                                    ${classes.map(c => `
                                        <label style="display: flex; align-items: center; gap: 0.75rem; padding: 0.6rem 0.75rem; cursor: pointer; transition: background 0.2s; border-radius: 8px; background: #f8fafc; border: 1px solid #f1f5f9;" data-class-name="${c.name}">
                                            <input type="checkbox" name="bulk-classes" value="${c.name}" style="width: 18px; height: 18px;" onchange="document.getElementById('count-classes').textContent = document.querySelectorAll('input[name=bulk-classes]:checked').length">
                                            <span style="font-size: 0.85rem; font-weight: 700; color: #1e293b;">${c.name}</span>
                                        </label>
                                    `).join('')}
                                </div>
                            </div>
                        </div>

                        <div class="form-group">
                            <label style="font-size: 0.75rem; font-weight: 700; color: #64748b; margin-bottom: 0.5rem; display: block;">3. SELECT SUBJECT TITLES (<span id="count-subjects">0</span>)</label>
                            <div class="glass-collapse-card" style="background: white; border: 1px solid #e2e8f0; border-radius: 12px; overflow: hidden;">
                                <input type="checkbox" id="toggle-bulk-subjects" class="glass-collapse-checkbox">
                                <label for="toggle-bulk-subjects" class="glass-collapse-header" style="background: #f8fafc; padding: 1rem; cursor: pointer; border-bottom: 1px solid #f1f5f9; min-height: 52px; display: flex;">
                                    <span class="glass-collapse-title" style="font-size: 0.9rem; font-weight: 700;"><i data-lucide="book" style="width: 16px;"></i> Select Subjects (Multi-select enabled)</span>
                                    <span class="glass-collapse-chevron"><i data-lucide="chevron-down"></i></span>
                                </label>
                                <div class="glass-collapse-content" style="max-height: 300px; overflow-y: auto; padding: 0.5rem;">
                                    ${subjects.map(s => `
                                        <label style="display: flex; align-items: center; gap: 1rem; padding: 0.6rem 1rem; cursor: pointer; transition: background 0.2s; border-radius: 8px; margin-bottom: 2px;" class="hover-bg">
                                            <input type="checkbox" name="bulk-subjects" value="${s.id}" style="width: 18px; height: 18px;" onchange="document.getElementById('count-subjects').textContent = document.querySelectorAll('input[name=bulk-subjects]:checked').length">
                                            <span style="font-size: 0.9rem; font-weight: 700; color: #1e293b;">${s.name}</span>
                                        </label>
                                    `).join('')}
                                </div>
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

                    <div class="registry-list-container">
                        ${(() => {
                            // Group assignments by teacher
                            const groupedByTeacher = {};
                            assignments.forEach(a => {
                                if (!groupedByTeacher[a.teacher_id]) groupedByTeacher[a.teacher_id] = {};
                                
                                const subject = subjects.find(s => s.id === a.subject_id);
                                const subjectName = subject ? subject.name : 'Unknown Subject';
                                
                                if (!groupedByTeacher[a.teacher_id][subjectName]) {
                                    groupedByTeacher[a.teacher_id][subjectName] = [];
                                }
                                groupedByTeacher[a.teacher_id][subjectName].push(a);
                            });

                            const teacherIds = Object.keys(groupedByTeacher);
                            if (teacherIds.length === 0) return '<div class="text-center p-4">Waiting for faculty deployments...</div>';

                            return teacherIds.map(tid => {
                                const teacher = profiles.find(p => p.id === tid);
                                const teacherSubjects = groupedByTeacher[tid];
                                const subjectNames = Object.keys(teacherSubjects).sort();
                                const totalTasks = Object.values(teacherSubjects).flat().length;

                                return `
                                    <div class="glass-collapse-card" style="margin-bottom: 1rem;">
                                        <input type="checkbox" id="toggle-teacher-${tid}" class="glass-collapse-checkbox">
                                        <label for="toggle-teacher-${tid}" class="glass-collapse-header" style="padding: 1.25rem;">
                                            <div style="display: flex; align-items: center; gap: 1rem;">
                                                <div style="width: 44px; height: 44px; background: #eef2ff; color: #4338ca; border-radius: 12px; display: flex; align-items: center; justify-content: center; font-weight: 900; font-size: 1.1rem; border: 1px solid #dbeafe;">
                                                    ${teacher ? teacher.full_name.charAt(0) : '?'}
                                                </div>
                                                <div>
                                                    <div style="font-weight: 800; color: #1e293b; font-size: 1rem;">${teacher ? teacher.full_name : 'Unknown Staff'}</div>
                                                    <div style="font-size: 0.7rem; color: #94a3b8; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em;">${subjectNames.length} Subjects • ${totalTasks} Classes</div>
                                                </div>
                                            </div>
                                            <span class="glass-collapse-chevron"><i data-lucide="chevron-down"></i></span>
                                        </label>
                                        <div class="glass-collapse-content" style="background: #f8fafc; border-top: 1px solid #f1f5f9;">
                                            <div style="padding: 1rem; display: flex; flex-direction: column; gap: 0.75rem;">
                                                ${subjectNames.map(subName => {
                                                    const subAssignments = teacherSubjects[subName];
                                                    subAssignments.sort((a, b) => a.class_name.localeCompare(b.class_name, undefined, {numeric: true, sensitivity: 'base'}));
                                                    
                                                    return `
                                                        <div style="background: white; border: 1px solid #e2e8f0; border-radius: 14px; padding: 1rem; box-shadow: var(--shadow-sm);">
                                                            <div style="font-size: 0.7rem; font-weight: 800; color: #64748b; text-transform: uppercase; margin-bottom: 0.75rem; display: flex; align-items: center; gap: 0.5rem; border-bottom: 1px solid #f1f5f9; padding-bottom: 0.5rem;">
                                                                <i data-lucide="book-open" style="width: 14px; color: #4338ca;"></i> ${subName}
                                                            </div>
                                                            <div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(140px, 1fr)); gap: 0.5rem;">
                                                                ${subAssignments.map(a => `
                                                                    <div style="display: flex; justify-content: space-between; align-items: center; background: #f8fafc; border: 1px solid #f1f5f9; border-radius: 10px; padding: 0.5rem 0.75rem;">
                                                                        <span style="font-weight: 800; color: #1e293b; font-size: 0.85rem;">${a.class_name}</span>
                                                                        <div style="display: flex; gap: 0.25rem;">
                                                                            <button class="btn-xs" style="background: white;" onclick="UI.editAssignment('${a.id}')">
                                                                                <i data-lucide="edit-3" style="width: 12px;"></i>
                                                                            </button>
                                                                            <button class="btn-xs" style="background: white; color: #ef4444;" onclick="UI.deleteAssignment('${a.id}')">
                                                                                <i data-lucide="trash-2" style="width: 12px;"></i>
                                                                            </button>
                                                                        </div>
                                                                    </div>
                                                                `).join('')}
                                                            </div>
                                                        </div>
                                                    `;
                                                }).join('')}
                                            </div>
                                        </div>
                                    </div>
                                `;
                            }).join('');
                        })()}
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
        const teacherId = document.getElementById('bulk-teachers-select').value;
        const checkedClasses = Array.from(document.querySelectorAll('input[name=bulk-classes]:checked')).map(i => i.value);
        const checkedSubjects = Array.from(document.querySelectorAll('input[name=bulk-subjects]:checked')).map(i => i.value);
        const specialization = document.getElementById('bulk-specialization').value;

        if (!teacherId || checkedClasses.length === 0 || checkedSubjects.length === 0) {
            return Notifications.show('Please select a teacher, at least one class, and at least one subject title.', 'error');
        }

        const checkedTeachers = [teacherId]; // Standardize for loop below

        const btn = document.getElementById('btn-deploy-workload');
        btn.disabled = true;
        btn.innerHTML = 'Deploying...';

        try {
            const allAssignments = await db.subject_assignments.toArray();
            let addedCount = 0;
            let updatedCount = 0;

            for (const tId of checkedTeachers) {
                for (const className of checkedClasses) {
                    for (const subId of checkedSubjects) {
                        const existing = allAssignments.find(a => 
                            a.teacher_id === tId && 
                            a.subject_id === subId && 
                            a.class_name === className
                        );
                        
                        if (!existing) {
                            await db.subject_assignments.add(prepareForSync({
                                id: `ASG${Math.random().toString(36).substr(2,9).toUpperCase()}`,
                                teacher_id: tId,
                                subject_id: subId,
                                class_name: className,
                                specialization: specialization
                            }));
                            addedCount++;
                        } else {
                            await db.subject_assignments.update(existing.id, prepareForSync({
                                specialization: specialization
                            }));
                            updatedCount++;
                        }
                    }
                }
            }
            Notifications.show(`Deployment complete! ${addedCount} new, ${updatedCount} updated.`, 'success');
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

    async editAssignment(id) {
        const assignment = await db.subject_assignments.get(id);
        if (!assignment) return;

        // Reset and populate
        document.getElementById('bulk-teachers-select').value = assignment.teacher_id;
        document.querySelectorAll('input[name=bulk-classes]').forEach(i => i.checked = (i.value === assignment.class_name));
        document.querySelectorAll('input[name=bulk-subjects]').forEach(i => i.checked = (i.value === assignment.subject_id));
        document.getElementById('bulk-specialization').value = assignment.specialization || 'Common Subject';

        // Update counts
        document.getElementById('count-teachers').textContent = '1';
        document.getElementById('count-classes').textContent = '1';
        document.getElementById('count-subjects').textContent = '1';

        // Expand if collapsed
        document.getElementById('toggle-bulk-teachers').checked = true;
        document.getElementById('toggle-bulk-classes').checked = true;
        document.getElementById('toggle-bulk-subjects').checked = true;

        // Scroll to form
        document.getElementById('toggle-bulk-teachers').scrollIntoView({ behavior: 'smooth' });
        Notifications.show('Assignment data loaded into form.', 'info');
    },

    bulkSelectClasses(type) {
        const checkboxes = document.querySelectorAll('input[name=bulk-classes]');
        checkboxes.forEach(cb => {
            const className = cb.value.toLowerCase();
            if (type === 'all') cb.checked = true;
            else if (type === 'jss') cb.checked = className.startsWith('jss');
            else if (type === 'sss') cb.checked = className.startsWith('sss');
        });
        document.getElementById('count-classes').textContent = document.querySelectorAll('input[name=bulk-classes]:checked').length;
    },

    async deleteAssignment(id) {
        if (confirm('Are you sure you want to delete this assignment?')) {
            await db.subject_assignments.delete(id);
            Notifications.show('Assignment removed', 'success');
            this.renderLessons();
            syncToCloud();
        }
    },

    async renderTimetable() {
        const classes = (await db.classes.toArray()).sort((a,b) => a.name.localeCompare(b.name));
        const subjects = (await db.subjects.toArray()).sort((a,b) => a.name.localeCompare(b.name));
        
        this.contentArea.innerHTML = `
            <div class="view-container animate-fade-in">
                <header class="view-header" style="margin-bottom: 2rem;">
                    <h1 class="text-3xl font-extrabold tracking-tight">Master Timetable Editor</h1>
                    <p class="text-secondary">Define the academic schedule for every class and stream.</p>
                </header>

                <div class="card" style="border-radius: 24px; padding: 2rem; margin-bottom: 2rem;">
                    <div style="display: flex; gap: 1.5rem; align-items: center; margin-bottom: 2rem;">
                        <div style="flex: 1;">
                            <label style="font-size: 0.75rem; font-weight: 800; color: #64748b; text-transform: uppercase; margin-bottom: 0.5rem; display: block;">Active Class Registry</label>
                            <select id="tt-class-select" class="input" style="width: 100%; height: 52px; border-radius: 12px; background: #f8fafc; font-weight: 700;">
                                <option value="">Select a class to edit...</option>
                                ${classes.map(c => `<option value="${c.name}">${c.name}</option>`).join('')}
                            </select>
                        </div>
                        <div style="display: flex; gap: 0.75rem; align-items: flex-end; padding-top: 1.5rem;">
                            <button id="btn-save-timetable" class="btn btn-primary" style="height: 52px; border-radius: 12px; padding: 0 2rem; background: #2563eb;">
                                <i data-lucide="save"></i> Save Schedule
                            </button>
                        </div>
                    </div>

                    <div id="timetable-grid-container" style="display: none;">
                        <div class="table-container" style="border: 1px solid #f1f5f9; border-radius: 16px; overflow-x: auto; -webkit-overflow-scrolling: touch;">
                            <table class="data-table" style="border-collapse: collapse; width: 100%; min-width: 800px;">
                                <thead style="background: #f8fafc;">
                                    <tr>
                                        <th style="width: 100px; background: #f1f5f9; text-align: center; font-weight: 800; color: #1e293b; border-bottom: 2px solid #e2e8f0;">PERIOD</th>
                                        ${['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'].map(day => `
                                            <th style="text-align: center; font-weight: 800; color: #4338ca; border-bottom: 2px solid #e2e8f0;">${day.toUpperCase()}</th>
                                        `).join('')}
                                    </tr>
                                </thead>
                                <tbody id="tt-grid-body">
                                    <!-- Dynamic Periods (1-8) -->
                                    ${[1, 2, 3, 4, 5, 6, 7, 8].map(p => `
                                        <tr>
                                            <td style="text-align: center; background: #f8fafc; font-weight: 900; color: #94a3b8; border-right: 1px solid #f1f5f9;">${p}</td>
                                            ${['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'].map(day => `
                                                <td style="padding: 0.5rem; border: 1px solid #f1f5f9;">
                                                    <select class="tt-slot-select" data-day="${day}" data-period="${p}" style="width: 100%; border: none; background: transparent; font-size: 0.8rem; font-weight: 600; color: #334155; cursor: pointer; outline: none; padding: 0.5rem;">
                                                        <option value="">-- Free Slot --</option>
                                                        ${subjects.map(s => `<option value="${s.id}">${s.name}</option>`).join('')}
                                                    </select>
                                                </td>
                                            `).join('')}
                                        </tr>
                                    `).join('')}
                                </tbody>
                            </table>
                        </div>
                    </div>

                    <div id="tt-empty-state" style="text-align: center; padding: 5rem 2rem;">
                        <div style="width: 80px; height: 80px; background: #f1f5f9; color: #94a3b8; border-radius: 50%; display: flex; align-items: center; justify-content: center; margin: 0 auto 1.5rem;">
                            <i data-lucide="calendar" style="width: 40px; height: 40px;"></i>
                        </div>
                        <h3 style="color: #1e293b; font-weight: 800;">No Class Selected</h3>
                        <p style="color: #64748b;">Please select a class from the registry above to begin scheduling.</p>
                    </div>
                </div>
            </div>
        `;

        if (typeof lucide !== 'undefined') lucide.createIcons();

        // Register Event Listeners
        this.initTimetableLogic();
    },

    initTimetableLogic() {
        const classSelect = document.getElementById('tt-class-select');
        const gridContainer = document.getElementById('timetable-grid-container');
        const emptyState = document.getElementById('tt-empty-state');
        const saveBtn = document.getElementById('btn-save-timetable');
        const slots = document.querySelectorAll('.tt-slot-select');

        classSelect.onchange = async () => {
            const cls = classSelect.value;
            if (!cls) {
                gridContainer.style.display = 'none';
                emptyState.style.display = 'block';
                return;
            }
            gridContainer.style.display = 'block';
            emptyState.style.display = 'none';

            // Filter subjects for this class to only show what is assigned
            const assignments = await db.subject_assignments.where('class_name').equals(cls).toArray();
            const classSubjectIds = new Set(assignments.map(a => a.subject_id));
            const classSubjects = subjects.filter(s => classSubjectIds.has(s.id));
            
            // If no assignments, fallback to all (safeguard)
            const availableSubjects = classSubjects.length > 0 ? classSubjects : subjects;
            const optionsHtml = `<option value="">-- Free Slot --</option>` + 
                               availableSubjects.map(s => `<option value="${s.id}">${s.name}</option>`).join('');
            
            slots.forEach(s => {
                s.innerHTML = optionsHtml;
                s.value = "";
            });

            // Load existing timetable for this class
            const existing = await db.timetable.where('class_name').equals(cls).toArray();
            existing.forEach(entry => {
                const select = document.querySelector(`.tt-slot-select[data-day="${entry.day_of_week}"][data-period="${entry.period_number}"]`);
                if (select) select.value = entry.subject_id;
            });
        };

        saveBtn.onclick = async () => {
            const cls = classSelect.value;
            if (!cls) return Notifications.show('Please select a class first', 'error');

            Notifications.show('Compiling academic schedule...', 'info');

            const newEntries = [];
            slots.forEach(select => {
                if (select.value) {
                    const assignment = assignments.find(a => a.subject_id === select.value);
                    newEntries.push(prepareForSync({
                        id: `TT_${cls}_${select.dataset.day}_P${select.dataset.period}`,
                        class_name: cls,
                        day_of_week: select.dataset.day,
                        period_number: parseInt(select.dataset.period),
                        subject_id: select.value,
                        teacher_id: assignment ? assignment.teacher_id : null,
                        updated_at: new Date().toISOString()
                    }));
                }
            });

            // Clean old entries for this class and save new ones
            await db.timetable.where('class_name').equals(cls).delete();
            if (newEntries.length > 0) {
                await db.timetable.bulkAdd(newEntries);
            }

            Notifications.show(`Timetable for ${cls} successfully deployed!`, 'success');
            syncToCloud();
        };
    },

    async renderSettings() {
        // Load settings from DB
        const allSettings = await db.settings.toArray();
        const settings = {};
        allSettings.forEach(s => settings[s.key] = s.value);

        // Default values if not set
        const config = {
            schoolName: settings.schoolName || 'NEW KINGS AND QUEENS MONTESSORI SCHOOL',
            schoolManager: settings.schoolManager || 'TAMADU CODE',
            schoolMotto: settings.schoolMotto || 'Knowledge is Power',
            schoolAddress: settings.schoolAddress || '123 Education Street, Academic City',
            schoolPhone: settings.schoolPhone || '08035461711, 08037316183, 08058134229',
            schoolEmail: settings.schoolEmail || 'info@school.com',
            currentSession: settings.currentSession || settings.current_session || '2025/2026',
            currentTerm: settings.currentTerm || settings.current_term || '1st Term',
            gradingSystem: settings.gradingSystem || 'Grade-Based (A1, B2, etc.)',
            principalName: settings.principalName || 'Mr. Lartey Sampson',
            principalSignature: settings.principalSignature || null,
            schoolLogo: settings.schoolLogo || null,
            themeColor: settings.themeColor || '#060495',
            holidays: settings.holidays || '',
            termStatus: settings.termStatus || 'Active'
        };

        this.contentArea.innerHTML = `
            <div class="view-container animate-fade-in" style="max-width: 900px; margin: 0 auto;">
                <header class="view-header" style="margin-bottom: 2.5rem; text-align: center;">
                    <h1 style="font-size: 2.5rem; font-weight: 900; color: #1e293b; margin-bottom: 0.5rem;">System Settings</h1>
                    <p style="color: #64748b;">Configure institutional identity, academic cycles, and data governance.</p>
                </header>

                <!-- Section: Institutional Identity -->
                <div class="glass-collapse-card">
                    <input type="checkbox" id="toggle-settings-identity" class="glass-collapse-checkbox" checked>
                    <label for="toggle-settings-identity" class="glass-collapse-header">
                        <span class="glass-collapse-title"><i data-lucide="building" style="width: 18px; color: #2563eb;"></i> School Identity (Report Card Header)</span>
                        <span class="glass-collapse-chevron"><i data-lucide="chevron-down"></i></span>
                    </label>
                    <div class="glass-collapse-content">
                    
                    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 1.5rem; margin-bottom: 1.5rem;">
                        <div class="form-group">
                            <label>School Name</label>
                            <input type="text" id="set-school-name" class="input" value="${config.schoolName}">
                        </div>
                        <div class="form-group">
                            <label>School Manager</label>
                            <input type="text" id="set-school-manager" class="input" value="${config.schoolManager}">
                        </div>
                    </div>

                    <div class="form-group" style="margin-bottom: 1.5rem;">
                        <label>School Address</label>
                        <input type="text" id="set-school-address" class="input" value="${config.schoolAddress}">
                    </div>

                    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 1.5rem; margin-bottom: 1.5rem;">
                        <div class="form-group">
                            <label>Phone Number</label>
                            <input type="text" id="set-school-phone" class="input" value="${config.schoolPhone}">
                        </div>
                        <div class="form-group">
                            <label>Email Address</label>
                            <input type="email" id="set-school-email" class="input" value="${config.schoolEmail}">
                        </div>
                    </div>

                    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 1.5rem; margin-bottom: 1.5rem;">
                        <div class="form-group">
                            <label>Principal's Name</label>
                            <input type="text" id="set-principal-name" class="input" value="${config.principalName}">
                        </div>
                        <div class="form-group">
                            <label>School Motto</label>
                            <input type="text" id="set-school-motto" class="input" value="${config.schoolMotto}">
                        </div>
                    </div>

                    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 1.5rem; margin-bottom: 1.5rem;">
                        <div class="form-group">
                            <label>School Logo</label>
                            <div style="display: flex; align-items: center; gap: 1.5rem; background: #f8fafc; padding: 1rem; border-radius: 16px; border: 1px dashed #cbd5e1;">
                                <input type="file" id="set-school-logo-file" accept="image/*" style="display: none;">
                                <button class="btn btn-secondary" onclick="document.getElementById('set-school-logo-file').click()">
                                    <i data-lucide="image"></i> Choose Logo
                                </button>
                                <div id="logo-preview" style="height: 40px; width: 40px; border-radius: 8px; overflow: hidden; background: #fff; border: 1px solid #e2e8f0;">
                                    ${config.schoolLogo ? `<img src="${config.schoolLogo}" style="width: 100%; height: 100%; object-fit: contain;">` : ''}
                                </div>
                            </div>
                        </div>
                        <div class="form-group">
                            <label>Theme Color</label>
                            <div style="display: flex; align-items: center; gap: 1rem; background: #f8fafc; padding: 1rem; border-radius: 16px; border: 1px solid #e2e8f0;">
                                <input type="color" id="set-theme-color" value="${config.themeColor}" style="width: 50px; height: 40px; border: none; border-radius: 8px; cursor: pointer;">
                                <span style="font-family: monospace; font-weight: 700; color: #475569;">${config.themeColor.toUpperCase()}</span>
                            </div>
                        </div>
                    </div>

                    <div class="form-group" style="margin-bottom: 1.5rem;">
                        <label>Principal's Signature</label>
                        <div style="display: flex; align-items: center; gap: 1.5rem; background: #f8fafc; padding: 1rem; border-radius: 16px; border: 1px dashed #cbd5e1;">
                            <input type="file" id="set-principal-sig-file" accept="image/*" style="display: none;">
                            <button class="btn btn-secondary" onclick="document.getElementById('set-principal-sig-file').click()">
                                <i data-lucide="upload"></i> Upload Signature
                            </button>
                            <div id="sig-preview" style="height: 40px;">
                                ${config.principalSignature ? `<img src="${config.principalSignature}" style="max-height: 100%;">` : '<span style="color: #94a3b8; font-size: 0.85rem;">No signature</span>'}
                            </div>
                        </div>
                    </div>
                    </div>
                </div>

                <!-- Section: Academic Session Operations -->
                <div class="glass-collapse-card">
                    <input type="checkbox" id="toggle-settings-session" class="glass-collapse-checkbox" checked>
                    <label for="toggle-settings-session" class="glass-collapse-header">
                        <span class="glass-collapse-title"><i data-lucide="calendar" style="width: 18px; color: #10b981;"></i> Academic Session Operations</span>
                        <span class="glass-collapse-chevron"><i data-lucide="chevron-down"></i></span>
                    </label>
                    <div class="glass-collapse-content">

                    <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 1.5rem; margin-bottom: 1.5rem;">
                        <div class="form-group">
                            <label>Current Session</label>
                            <input type="text" id="set-current-session" class="input" value="${config.currentSession}" placeholder="e.g. 2025/2026">
                        </div>
                        <div class="form-group">
                            <label>Current Term</label>
                            <select id="set-current-term" class="input">
                                <option value="1st Term" ${config.currentTerm === '1st Term' ? 'selected' : ''}>1st Term</option>
                                <option value="2nd Term" ${config.currentTerm === '2nd Term' ? 'selected' : ''}>2nd Term</option>
                                <option value="3rd Term" ${config.currentTerm === '3rd Term' ? 'selected' : ''}>3rd Term</option>
                            </select>
                        </div>
                        <div class="form-group">
                            <label>Term Status</label>
                            <select id="set-term-status" class="input" style="font-weight: 800; color: ${config.termStatus === 'Active' ? '#10b981' : '#ef4444'};">
                                <option value="Active" ${config.termStatus === 'Active' ? 'selected' : ''}>In Session (Active)</option>
                                <option value="Inactive" ${config.termStatus === 'Inactive' ? 'selected' : ''}>On Holiday (Inactive)</option>
                            </select>
                        </div>
                    </div>

                    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 1.5rem; margin-bottom: 1.5rem;">
                        <div class="form-group">
                            <label>Term Closure Date</label>
                            <input type="${settings.termClosure ? 'date' : 'text'}" id="set-term-closure" placeholder="Select Date" onfocus="(this.type='date')" onblur="if(!this.value)this.type='text'" class="input" value="${settings.termClosure || ''}" onclick="this.showPicker()">
                        </div>
                        <div class="form-group">
                            <label>Next Term Resumption</label>
                            <input type="${settings.nextTermBegins ? 'date' : 'text'}" id="set-next-term" placeholder="Select Date" onfocus="(this.type='date')" onblur="if(!this.value)this.type='text'" class="input" value="${settings.nextTermBegins || ''}" onclick="this.showPicker()">
                        </div>
                    </div>

                    <div class="form-group" style="margin-bottom: 2rem;">
                        <label>Ranking System</label>
                        <select id="set-grading-system" class="input">
                            <option value="Grade-Based (A1, B2, etc.)" ${config.gradingSystem === 'Grade-Based (A1, B2, etc.)' ? 'selected' : ''}>Grade-Based (A1, B2, etc.)</option>
                            <option value="Positional Ranking" ${config.gradingSystem === 'Positional Ranking' ? 'selected' : ''}>Positional Ranking</option>
                            <option value="Point System (5.0 CGPA)" ${config.gradingSystem === 'Point System (5.0 CGPA)' ? 'selected' : ''}>Point System (5.0 CGPA)</option>
                        </select>
                    </div>

                    <div style="background: #f5f3ff; border: 1px solid #ddd6fe; padding: 1.5rem; border-radius: 20px;">
                        <div style="display: flex; align-items: center; gap: 1rem; margin-bottom: 1rem;">
                            <i data-lucide="graduation-cap" style="color: #7c3aed;"></i>
                            <h4 style="font-weight: 800; color: #5b21b6; margin: 0;">End of Session Promotion</h4>
                        </div>
                        <p style="font-size: 0.85rem; color: #6d28d9; margin-bottom: 1.5rem;">Automatically move students to the next class (e.g. JSS 1 → JSS 2) and graduate SSS 3 students. <strong>Warning: Use only at the end of the Academic Session!</strong></p>
                        <button class="btn btn-primary" style="width: 100%; background: #7c3aed; border: none; height: 52px; border-radius: 12px; font-weight: 800;" onclick="UI.executePromotion()">
                            Execute School-Wide Promotion
                        </button>
                    </div>

                    <div style="background: #fff7ed; border: 1px solid #ffedd5; padding: 1.5rem; border-radius: 20px; margin-top: 1.5rem;">
                        <div style="display: flex; align-items: center; gap: 1rem; margin-bottom: 1rem;">
                            <i data-lucide="calendar-off" style="color: #f97316;"></i>
                            <h4 style="font-weight: 800; color: #9a3412; margin: 0;">Closed Days Manager (Public Holidays)</h4>
                        </div>
                        <p style="font-size: 0.85rem; color: #c2410c; margin-bottom: 1rem;">Select specific dates during the active term when the school is closed for events or public holidays.</p>
                        
                        <div style="display: flex; gap: 1rem; align-items: flex-start;">
                            <div style="flex: 1;">
                                <input type="date" id="add-closed-day" class="input" style="width: 100%; height: 48px; border-radius: 12px;">
                            </div>
                            <button class="btn btn-secondary" style="height: 48px; border-radius: 12px; padding: 0 1.5rem;" onclick="UI.addClosedDay()">
                                <i data-lucide="plus"></i> Add Day
                            </button>
                        </div>

                        <div id="closed-days-list" style="display: flex; flex-wrap: wrap; gap: 0.5rem; margin-top: 1rem;">
                            ${config.holidays.split(/[\n,]+/).map(d => d.trim()).filter(d => d).map(date => `
                                <div class="badge" style="background: white; border: 1px solid #ffedd5; color: #9a3412; padding: 0.5rem 0.75rem; border-radius: 10px; display: flex; align-items: center; gap: 0.5rem; font-family: monospace;">
                                    ${date}
                                    <i data-lucide="x" style="width: 14px; cursor: pointer;" onclick="UI.removeClosedDay('${date}')"></i>
                                </div>
                            `).join('')}
                        </div>
                        <input type="hidden" id="set-school-holidays" value="${config.holidays}">
                    </div>
                    </div>
                </div>

                <!-- Section: Data Management -->
                <div class="glass-collapse-card">
                    <input type="checkbox" id="toggle-settings-data" class="glass-collapse-checkbox" checked>
                    <label for="toggle-settings-data" class="glass-collapse-header">
                        <span class="glass-collapse-title"><i data-lucide="database" style="width: 18px; color: #f59e0b;"></i> Data Management</span>
                        <span class="glass-collapse-chevron"><i data-lucide="chevron-down"></i></span>
                    </label>
                    <div class="glass-collapse-content">

                    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 1.5rem; margin-bottom: 1.5rem;">
                        <div style="background: #f8fafc; border: 1px solid #e2e8f0; padding: 1.5rem; border-radius: 20px;">
                            <h4 style="font-size: 0.9rem; font-weight: 800; margin-bottom: 0.5rem; display: flex; align-items: center; gap: 0.5rem;">
                                <i data-lucide="download" style="width: 18px;"></i> Backup Data
                            </h4>
                            <p style="font-size: 0.75rem; color: #64748b; margin-bottom: 1rem;">Download a local copy of your entire school database (.db file). Keep this safe as a point of recovery.</p>
                            <button class="btn btn-secondary" style="width: 100%; height: 44px; border-radius: 10px;" onclick="UI.downloadBackup()">
                                Download Local Backup (.json)
                            </button>
                        </div>
                        <div style="background: #f8fafc; border: 1px solid #e2e8f0; padding: 1.5rem; border-radius: 20px;">
                            <h4 style="font-size: 0.9rem; font-weight: 800; margin-bottom: 0.5rem; display: flex; align-items: center; gap: 0.5rem;">
                                <i data-lucide="clock" style="width: 18px;"></i> Auto-Backup Status
                            </h4>
                            <p style="font-size: 0.75rem; color: #64748b; margin-bottom: 1rem;">The system automatically backs up every 2 weeks to your Documents folder.</p>
                            <div style="font-size: 0.7rem; color: #94a3b8; font-weight: 600;">
                                <div>No automatic backup recorded yet.</div>
                                <div>Location: Documents/School Management Backups</div>
                            </div>
                        </div>
                    </div>

                    <div style="background: #fff1f2; border: 1px solid #fecdd3; padding: 1.5rem; border-radius: 20px;">
                        <h4 style="font-size: 0.9rem; font-weight: 800; color: #e11d48; margin-bottom: 0.5rem; display: flex; align-items: center; gap: 0.5rem;">
                            <i data-lucide="upload-cloud" style="width: 18px;"></i> Restore Data
                        </h4>
                        <p style="font-size: 0.75rem; color: #be123c; margin-bottom: 1rem;">Restore the entire system from a previously downloaded .db backup. <strong>Warning: This overrides current data.</strong></p>
                        <input type="file" id="restore-file" style="display: none;" accept=".json" onchange="UI.handleRestore(event)">
                        <button class="btn btn-danger" style="width: 100%; height: 44px; border-radius: 10px; background: #fee2e2; color: #e11d48; border: 1px solid #fecdd3;" onclick="document.getElementById('restore-file').click()">
                            Upload & Restore (.json)
                        </button>
                    </div>
                    </div>
                </div>

                <div style="display: flex; gap: 1rem; margin-bottom: 5rem;">
                    <button class="btn btn-primary" style="flex: 1; height: 56px; border-radius: 16px; font-weight: 900; font-size: 1.1rem; box-shadow: 0 10px 15px -3px rgba(37, 99, 235, 0.3);" onclick="UI.saveSettings()">
                        Save All Configuration
                    </button>
                </div>
            </div>
        `;

        if (typeof lucide !== 'undefined') lucide.createIcons();

        // Register file upload listener
        document.getElementById('set-principal-sig-file').onchange = (e) => {
            const file = e.target.files[0];
            if (file) {
                const reader = new FileReader();
                reader.onload = (re) => {
                    document.getElementById('sig-preview').innerHTML = `<img src="${re.target.result}" style="max-height: 100%;">`;
                    this.pendingSignature = re.target.result;
                };
                reader.readAsDataURL(file);
            }
        };

        document.getElementById('set-school-logo-file').onchange = (e) => {
            const file = e.target.files[0];
            if (file) {
                const reader = new FileReader();
                reader.onload = (re) => {
                    document.getElementById('logo-preview').innerHTML = `<img src="${re.target.result}" style="width: 100%; height: 100%; object-fit: contain;">`;
                    this.pendingLogo = re.target.result;
                };
                reader.readAsDataURL(file);
            }
        };
    },

    addClosedDay() {
        const input = document.getElementById('add-closed-day');
        const hidden = document.getElementById('set-school-holidays');
        const list = document.getElementById('closed-days-list');
        const date = input.value;
        if (!date) return;

        let holidays = hidden.value.split(/[\n,]+/).map(d => d.trim()).filter(d => d);
        if (holidays.includes(date)) return;
        
        holidays.push(date);
        holidays.sort();
        hidden.value = holidays.join(',');
        
        this.refreshClosedDaysList();
        input.value = '';
    },

    removeClosedDay(date) {
        const hidden = document.getElementById('set-school-holidays');
        let holidays = hidden.value.split(/[\n,]+/).map(d => d.trim()).filter(d => d);
        holidays = holidays.filter(d => d !== date);
        hidden.value = holidays.join(',');
        this.refreshClosedDaysList();
    },

    refreshClosedDaysList() {
        const hidden = document.getElementById('set-school-holidays');
        const list = document.getElementById('closed-days-list');
        const holidays = hidden.value.split(/[\n,]+/).map(d => d.trim()).filter(d => d);
        
        list.innerHTML = holidays.map(date => `
            <div class="badge" style="background: white; border: 1px solid #ffedd5; color: #9a3412; padding: 0.5rem 0.75rem; border-radius: 10px; display: flex; align-items: center; gap: 0.5rem; font-family: monospace;">
                ${date}
                <i data-lucide="x" style="width: 14px; cursor: pointer;" onclick="UI.removeClosedDay('${date}')"></i>
            </div>
        `).join('');
        if (typeof lucide !== 'undefined') lucide.createIcons();
    },

    async saveSettings() {
        Notifications.show('Saving system configuration...', 'info');
        
        const settingsToSave = [
            { key: 'schoolName', value: document.getElementById('set-school-name').value },
            { key: 'schoolManager', value: document.getElementById('set-school-manager').value },
            { key: 'schoolAddress', value: document.getElementById('set-school-address').value },
            { key: 'schoolPhone', value: document.getElementById('set-school-phone').value },
            { key: 'schoolEmail', value: document.getElementById('set-school-email').value },
            { key: 'principalName', value: document.getElementById('set-principal-name').value },
            { key: 'schoolMotto', value: document.getElementById('set-school-motto').value },
            { key: 'currentSession', value: document.getElementById('set-current-session').value },
            { key: 'currentTerm', value: document.getElementById('set-current-term').value },
            { key: 'gradingSystem', value: document.getElementById('set-grading-system').value },
            { key: 'themeColor', value: document.getElementById('set-theme-color').value },
            { key: 'holidays', value: document.getElementById('set-school-holidays').value },
            { key: 'termStatus', value: document.getElementById('set-term-status').value },
            { key: 'termClosure', value: document.getElementById('set-term-closure').value },
            { key: 'nextTermBegins', value: document.getElementById('set-next-term').value }
        ];

        if (this.pendingSignature) {
            settingsToSave.push({ key: 'principalSignature', value: this.pendingSignature });
        }
        if (this.pendingLogo) {
            settingsToSave.push({ key: 'schoolLogo', value: this.pendingLogo });
        }

        try {
            for (const s of settingsToSave) {
                const existing = await db.settings.where('key').equals(s.key).first();
                if (existing) {
                    await db.settings.update(existing.id, prepareForSync(s));
                } else {
                    await db.settings.add(prepareForSync({ id: `SET_${s.key.toUpperCase()}`, ...s }));
                }
            }
            await this.updateInstitutionalBranding();
            Notifications.show('Settings saved successfully!', 'success');
            await syncToCloud();
        } catch (e) {
            console.error(e);
            Notifications.show('Failed to save settings.', 'error');
        }
    },

    async executePromotion() {
        if (!confirm('WARNING: You are about to promote all students to their next classes. This action should only be taken at the end of the academic session. Do you wish to proceed?')) return;

        Notifications.show('Executing school-wide promotion...', 'info');
        
        try {
            const students = await db.students.where('is_active').equals(1).toArray();
            let promoted = 0;
            let graduated = 0;

            for (const s of students) {
                const currentClass = s.class_name.toUpperCase();
                let nextClass = '';

                // Promotion Logic
                if (currentClass.includes('JSS 1') || currentClass.includes('JS 1')) nextClass = 'JSS 2';
                else if (currentClass.includes('JSS 2') || currentClass.includes('JS 2')) nextClass = 'JSS 3';
                else if (currentClass.includes('JSS 3') || currentClass.includes('JS 3')) nextClass = 'SSS 1';
                else if (currentClass.includes('SSS 1') || currentClass.includes('SS 1')) nextClass = 'SSS 2';
                else if (currentClass.includes('SSS 2') || currentClass.includes('SS 2')) nextClass = 'SSS 3';
                else if (currentClass.includes('SSS 3') || currentClass.includes('SS 3')) {
                    await db.students.update(s.student_id, prepareForSync({ status: 'Graduated', is_active: 0 }));
                    graduated++;
                    continue;
                }

                if (nextClass) {
                    await db.students.update(s.student_id, prepareForSync({ class_name: nextClass }));
                    promoted++;
                }
            }

            Notifications.show(`Promotion Complete! ${promoted} students promoted, ${graduated} graduated.`, 'success');
            syncToCloud();
        } catch (e) {
            console.error(e);
            Notifications.show('Promotion failed.', 'error');
        }
    },

    async downloadBackup() {
        const tables = ['profiles', 'students', 'classes', 'subjects', 'subject_assignments', 'scores', 'attendance_records', 'settings'];
        const backup = {};
        
        for (const t of tables) {
            backup[t] = await db[t].toArray();
        }

        const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(backup));
        const downloadAnchorNode = document.createElement('a');
        downloadAnchorNode.setAttribute("href", dataStr);
        downloadAnchorNode.setAttribute("download", `Graviton_Backup_${new Date().toISOString().split('T')[0]}.json`);
        document.body.appendChild(downloadAnchorNode);
        downloadAnchorNode.click();
        downloadAnchorNode.remove();
    },

    async handleRestore(event) {
        const file = event.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = async (e) => {
            try {
                const backup = JSON.parse(e.target.result);
                if (confirm('Are you sure you want to restore? This will overwrite all current local data.')) {
                    Notifications.show('Restoring system data...', 'info');
                    
                    for (const table in backup) {
                        if (db[table]) {
                            await db[table].clear();
                            await db[table].bulkAdd(backup[table]);
                        }
                    }
                    
                    Notifications.show('Restore successful! Reloading application...', 'success');
                    setTimeout(() => location.reload(), 1500);
                }
            } catch (err) {
                console.error(err);
                Notifications.show('Invalid backup file.', 'error');
            }
        };
        reader.readAsText(file);
    },

    async renderInsights() {
        const isTeacher = (this.currentUser.role || '').toLowerCase() === 'teacher';
        const teacherId = this.currentUser.id;
        
        let scores = await db.scores.toArray();
        let students = await db.students.filter(s => s.is_active !== false).toArray();
        let subjects = await db.subjects.toArray();
        
        if (isTeacher) {
            const assignments = await db.subject_assignments.where('teacher_id').equals(teacherId).toArray();
            const assignedSubIds = new Set(assignments.map(a => a.subject_id));
            const assignedClasses = new Set(assignments.map(a => a.class_name));
            
            scores = scores.filter(s => assignedSubIds.has(s.subject_id) && assignedClasses.has(students.find(std => std.student_id === s.student_id)?.class_name));
            subjects = subjects.filter(s => assignedSubIds.has(s.id));
        }

        const avgScore = scores.length > 0 ? Math.round(scores.reduce((a, s) => a + (s.total || 0), 0) / scores.length) : 0;
        
        this.contentArea.innerHTML = `
            <div class="view-container" style="padding: 1.5rem;">
                <div class="page-banner" style="background: linear-gradient(135deg, #4f46e5 0%, #3730a3 100%);">
                    <div class="banner-content">
                        <h1 class="banner-title"><i data-lucide="activity"></i> Score Insights</h1>
                        <p class="banner-subtitle">Performance trends and academic auditing.</p>
                    </div>
                </div>
                
                <div class="grid" style="grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 1rem; margin-bottom: 2rem;">
                    <div class="card stat-card">
                        <div class="stat-info">
                            <h3>Average Score</h3>
                            <p class="stat-value">${avgScore}%</p>
                        </div>
                    </div>
                    <div class="card stat-card">
                        <div class="stat-info">
                            <h3>Total Records</h3>
                            <p class="stat-value">${scores.length}</p>
                        </div>
                    </div>
                </div>

                <div class="card">
                    <h3>Subject Performance Matrix</h3>
                    <div class="table-container">
                        <table class="data-table">
                            <thead>
                                <tr>
                                    <th>Subject</th>
                                    <th>Average</th>
                                    <th>Highest</th>
                                    <th>Pass Rate</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${subjects.map(sub => {
                                    const subScores = scores.filter(s => s.subject_id === sub.id);
                                    if (subScores.length === 0) return '';
                                    const avg = Math.round(subScores.reduce((a, s) => a + (s.total || 0), 0) / subScores.length);
                                    const high = Math.max(...subScores.map(s => s.total || 0));
                                    const passRate = Math.round((subScores.filter(s => (s.total || 0) >= 50).length / subScores.length) * 100);
                                    return `
                                        <tr>
                                            <td>${sub.name}</td>
                                            <td>${avg}%</td>
                                            <td>${high}%</td>
                                            <td>${passRate}%</td>
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
    },

    async renderNoticeBoard() {
        const userRole = (this.currentUser.role || '').toLowerCase();
        const isAdmin = userRole === 'admin' || userRole === 'principal';
        const isTeacher = userRole === 'teacher';
        
        // 1. Fetch and Filter Notices
        let notices = await db.notices.toArray().catch(() => []);
        
        // Filter based on role
        if (!isAdmin) {
            let teacherClasses = [];
            if (isTeacher) {
                const assignments = await db.subject_assignments.where('teacher_id').equals(this.currentUser.id).toArray();
                teacherClasses = [...new Set(assignments.map(a => a.class_name))];
            }

            notices = notices.filter(n => {
                if (n.target === 'All') return true;
                if (isTeacher && n.target === 'Staff') return true;
                if (isTeacher && teacherClasses.includes(n.target)) return true;
                if (this.currentUser.class_name && n.target === this.currentUser.class_name) return true;
                return false;
            });
        }
        
        notices.sort((a,b) => new Date(b.updated_at || 0) - new Date(a.updated_at || 0));

        // 2. Component Logic for Composer
        const classes = await db.classes.toArray();

        this.contentArea.innerHTML = `
            <div class="view-container animate-fade-in" style="padding: 1.5rem; background: #f8fafc; min-height: 100vh;">
                <!-- Premium Header -->
                <div class="page-banner" style="background: linear-gradient(135deg, #4f46e5 0%, #3730a3 100%); border-radius: 24px; padding: 2.5rem; color: white; box-shadow: 0 20px 25px -5px rgba(0,0,0,0.1); margin-bottom: 2rem; position: relative; overflow: hidden;">
                    <div style="position: absolute; right: -50px; top: -50px; width: 200px; height: 200px; background: rgba(255,255,255,0.1); border-radius: 50%;"></div>
                    <div class="banner-content" style="position: relative; z-index: 1;">
                        <h1 style="margin: 0; font-size: 2.5rem; font-weight: 900; letter-spacing: -0.03em; display: flex; align-items: center; gap: 1rem;">
                            <i data-lucide="megaphone" style="width: 40px; height: 40px;"></i> Broadcast Center
                        </h1>
                        <p style="margin-top: 0.75rem; opacity: 0.9; font-size: 1.1rem; font-weight: 500;">Official communications and academic announcements.</p>
                    </div>
                </div>

                <div style="display: grid; grid-template-columns: ${isAdmin || isTeacher ? '1fr 350px' : '1fr'}; gap: 2rem; align-items: start;">
                    <!-- Notice Feed -->
                    <div class="student-notices-container" style="display: flex; flex-direction: column; gap: 1.5rem;">
                        ${notices.length === 0 ? `
                            <div style="text-align: center; padding: 5rem 2rem; background: white; border-radius: 24px; border: 2px dashed #e2e8f0;">
                                <div style="width: 80px; height: 80px; background: #f1f5f9; color: #94a3b8; border-radius: 50%; display: flex; align-items: center; justify-content: center; margin: 0 auto 1.5rem;">
                                    <i data-lucide="inbox" style="width: 40px; height: 40px;"></i>
                                </div>
                                <h3 style="color: #1e293b; font-weight: 700; margin-bottom: 0.5rem;">Quiet on the Airwaves</h3>
                                <p style="color: #64748b;">No active broadcasts found in your feed.</p>
                            </div>
                        ` : notices.map(n => {
                            const colors = {
                                'Urgent': { border: '#ef4444', bg: '#fef2f2', icon: 'alert-triangle', text: '#991b1b' },
                                'Event': { border: '#3b82f6', bg: '#eff6ff', icon: 'calendar', text: '#1e40af' },
                                'News': { border: '#10b981', bg: '#ecfdf5', icon: 'info', text: '#065f46' }
                            };
                            const theme = colors[n.category] || colors['News'];
                            
                            return `
                                <div class="card notice-card animate-fade-in-up" style="background: white; border-radius: 24px; padding: 2rem; border: 1px solid #e2e8f0; border-left: 8px solid ${theme.border}; box-shadow: var(--shadow-sm); transition: all 0.3s ease;">
                                    <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 1.5rem;">
                                        <div style="display: flex; gap: 0.75rem; align-items: center;">
                                            <div style="background: ${theme.bg}; color: ${theme.border}; padding: 0.5rem 1rem; border-radius: 12px; font-size: 0.7rem; font-weight: 800; text-transform: uppercase; display: flex; align-items: center; gap: 0.5rem;">
                                                <i data-lucide="${theme.icon}" style="width: 14px; height: 14px;"></i> ${n.category || 'News'}
                                            </div>
                                            <div style="background: #f1f5f9; color: #64748b; padding: 0.5rem 1rem; border-radius: 12px; font-size: 0.7rem; font-weight: 800; text-transform: uppercase;">
                                                To: ${n.target || 'All'}
                                            </div>
                                        </div>
                                        <span style="font-size: 0.85rem; color: #94a3b8; font-weight: 600;">${new Date(n.updated_at).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}</span>
                                    </div>
                                    <h2 style="margin: 0 0 1rem 0; font-size: 1.4rem; font-weight: 800; color: #1e293b; letter-spacing: -0.02em;">${n.title}</h2>
                                    <div style="color: #475569; line-height: 1.8; font-size: 1.05rem; margin-bottom: 2rem; white-space: pre-wrap;">${n.content}</div>
                                    <div style="display: flex; align-items: center; gap: 1rem; padding-top: 1.5rem; border-top: 1px solid #f1f5f9;">
                                        <div style="width: 40px; height: 40px; background: #e0e7ff; color: #4338ca; border-radius: 12px; display: flex; align-items: center; justify-content: center; font-weight: 900; font-size: 0.9rem;">
                                            ${(n.author || 'S').charAt(0).toUpperCase()}
                                        </div>
                                        <div>
                                            <div style="font-size: 0.95rem; font-weight: 800; color: #1e293b;">${n.author || 'School Administration'}</div>
                                            <div style="font-size: 0.75rem; color: #94a3b8; font-weight: 600;">Verified Broadcaster</div>
                                        </div>
                                    </div>
                                </div>
                            `;
                        }).join('')}
                    </div>

                    <!-- Composer Sidebar -->
                    ${isAdmin || isTeacher ? `
                    <div style="position: sticky; top: 1.5rem;">
                        <div class="card" style="background: white; border-radius: 24px; padding: 2rem; border: 1px solid #e2e8f0; box-shadow: var(--shadow-md);">
                            <h3 style="margin: 0 0 1.5rem 0; font-size: 1.2rem; font-weight: 800; color: #1e293b; display: flex; align-items: center; gap: 0.75rem;">
                                <i data-lucide="pen-tool" style="color: #4f46e5;"></i> Create Notice
                            </h3>
                            
                            <div style="display: flex; flex-direction: column; gap: 1.25rem;">
                                <div>
                                    <label style="display: block; font-size: 0.75rem; font-weight: 800; color: #64748b; text-transform: uppercase; margin-bottom: 0.5rem;">Broadcast Title</label>
                                    <input type="text" id="notice-title" class="input" placeholder="Enter headline..." style="width: 100%; font-weight: 600;">
                                </div>
                                
                                <div>
                                    <label style="display: block; font-size: 0.75rem; font-weight: 800; color: #64748b; text-transform: uppercase; margin-bottom: 0.5rem;">Category</label>
                                    <select id="notice-category" class="input" style="width: 100%; font-weight: 600;">
                                        <option value="News">📢 General News</option>
                                        <option value="Event">📅 School Event</option>
                                        <option value="Urgent">⚠️ Urgent Alert</option>
                                    </select>
                                </div>

                                <div>
                                    <label style="display: block; font-size: 0.75rem; font-weight: 800; color: #64748b; text-transform: uppercase; margin-bottom: 0.5rem;">Target Audience</label>
                                    <select id="notice-target" class="input" style="width: 100%; font-weight: 600;">
                                        <option value="All">All Users</option>
                                        <option value="Staff">Staff Only</option>
                                        <option value="Students">All Students</option>
                                        <optgroup label="Specific Streams">
                                            ${classes.map(c => `<option value="${c.name}">${c.name}</option>`).join('')}
                                        </optgroup>
                                    </select>
                                </div>

                                <div>
                                    <label style="display: block; font-size: 0.75rem; font-weight: 800; color: #64748b; text-transform: uppercase; margin-bottom: 0.5rem;">Notice Content</label>
                                    <textarea id="notice-content" class="input" placeholder="Write your message..." style="width: 100%; min-height: 150px; resize: none; line-height: 1.6;"></textarea>
                                </div>

                                <button id="btn-post-notice" class="btn btn-primary" style="width: 100%; height: 52px; border-radius: 14px; background: #4f46e5; font-weight: 800; font-size: 1rem; display: flex; align-items: center; justify-content: center; gap: 0.75rem; transition: all 0.2s;">
                                    <i data-lucide="send"></i> Post Broadcast
                                </button>
                            </div>
                        </div>
                    </div>
                    ` : ''}
                </div>
            </div>
        `;

        if (typeof lucide !== 'undefined') lucide.createIcons();

        // 3. Event Listeners
        const btnPost = document.getElementById('btn-post-notice');
        if (btnPost) {
            btnPost.addEventListener('click', async () => {
                const title = document.getElementById('notice-title').value.trim();
                const content = document.getElementById('notice-content').value.trim();
                const category = document.getElementById('notice-category').value;
                const target = document.getElementById('notice-target').value;

                if (!title || !content) {
                    return Notifications.show('Please fill in both title and content', 'warning');
                }

                btnPost.disabled = true;
                btnPost.innerHTML = '<span class="spinning">⏳</span> Posting...';

                try {
                    await db.notices.add(prepareForSync({
                        id: `N${Date.now()}`,
                        title,
                        content,
                        category,
                        target,
                        author: this.currentUser.name,
                        is_active: 1
                    }));

                    Notifications.show('Broadcast posted successfully!', 'success');
                    syncToCloud();
                    this.renderNoticeBoard(); // Refresh view
                } catch (err) {
                    console.error('Notice error:', err);
                    Notifications.show('Failed to post notice', 'error');
                } finally {
                    btnPost.disabled = false;
                    btnPost.innerHTML = '<i data-lucide="send"></i> Post Broadcast';
                    if (typeof lucide !== 'undefined') lucide.createIcons();
                }
            });
        }
    },
    async renderStudentAttendanceView() {
        const studentId = this.currentUser.assigned_id;
        const attendance = await db.attendance_records.where('student_id').equals(studentId).toArray();
        
        this.contentArea.innerHTML = `
            <div class="view-container animate-fade-in student-universe-bg" style="padding: 1.5rem; min-height: 100vh;">
                <header class="glass-header" style="margin-bottom: 2rem; padding: 2rem; border-radius: 24px;">
                    <h1 style="font-size: 2rem; font-weight: 900; color: #1e293b;">Participation Record</h1>
                    <p style="color: #64748b;">Your official attendance history and engagement metrics.</p>
                </header>

                <div class="card" style="border-radius: 24px; padding: 2rem;">
                    <div class="table-container">
                        <table class="data-table">
                            <thead>
                                <tr>
                                    <th>Date</th>
                                    <th>Status</th>
                                    <th>Subject / Period</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${attendance.length === 0 ? '<tr><td colspan="3" style="text-align:center; padding:3rem;">No attendance records found.</td></tr>' : attendance.map(a => `
                                    <tr>
                                        <td style="font-weight: 700;">${new Date(a.date).toLocaleDateString()}</td>
                                        <td><span class="badge ${a.status === 'Present' ? 'success' : 'warning'}">${a.status}</span></td>
                                        <td style="color: #64748b; font-size: 0.85rem;">${a.subject_name || 'General School'} ${a.period_number ? `(Period ${a.period_number})` : ''}</td>
                                    </tr>
                                `).join('')}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        `;
        if (typeof lucide !== 'undefined') lucide.createIcons();
    },

    async renderStudentGradesView() {
        const studentId = this.currentUser.assigned_id;
        const analytics = await db.student_analytics.get(studentId);
        const hasFeeBalance = analytics?.fee_balance > 0;
        
        if (hasFeeBalance) {
            this.contentArea.innerHTML = `
                <div class="view-container animate-fade-in student-universe-bg" style="display: flex; align-items: center; justify-content: center; min-height: 80vh;">
                    <div class="card" style="max-width: 450px; text-align: center; padding: 3rem; border-radius: 32px;">
                        <div style="background: #fee2e2; color: #ef4444; width: 80px; height: 80px; border-radius: 20px; display: flex; align-items: center; justify-content: center; margin: 0 auto 1.5rem; transform: rotate(-10deg);">
                            <i data-lucide="lock" style="width: 40px; height: 40px;"></i>
                        </div>
                        <h2 style="font-weight: 900; font-size: 1.75rem; color: #1e293b;">Results Locked</h2>
                        <p style="color: #64748b; line-height: 1.6; margin-top: 1rem;">
                            Access to your academic transcript is restricted due to an outstanding fee balance of <strong>₦${analytics.fee_balance.toLocaleString()}</strong>.
                        </p>
                        <button class="btn btn-primary" onclick="UI.renderView('dashboard')" style="margin-top: 2rem; border-radius: 12px; height: 48px; padding: 0 2rem; font-weight: 800;">Pay Balance Now</button>
                    </div>
                </div>
            `;
            if (typeof lucide !== 'undefined') lucide.createIcons();
            return;
        }

        const scores = await db.scores.where('student_id').equals(studentId).toArray();
        
        this.contentArea.innerHTML = `
            <div class="view-container animate-fade-in student-universe-bg" style="padding: 1.5rem; min-height: 100vh;">
                <header class="glass-header" style="margin-bottom: 2rem; padding: 2rem; border-radius: 24px; display: flex; justify-content: space-between; align-items: center;">
                    <div>
                        <h1 style="font-size: 2rem; font-weight: 900; color: #1e293b;">Academic Transcript</h1>
                        <p style="color: #64748b;">Comprehensive breakdown of your learning achievements.</p>
                    </div>
                    <button class="btn btn-primary" onclick="UI.openResultPinModal()" style="border-radius: 12px; height: 48px; font-weight: 800;">
                        <i data-lucide="printer"></i> Print Report Card
                    </button>
                </header>

                <div class="card" style="border-radius: 24px; padding: 2rem;">
                    <div class="table-container">
                        <table class="data-table">
                            <thead>
                                <tr>
                                    <th>Subject</th>
                                    <th style="text-align:center;">C.A</th>
                                    <th style="text-align:center;">Exam</th>
                                    <th style="text-align:center;">Total</th>
                                    <th style="text-align:center;">Grade</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${scores.length === 0 ? '<tr><td colspan="5" style="text-align:center; padding:3rem;">No score records found for current term.</td></tr>' : scores.map(s => `
                                    <tr>
                                        <td style="font-weight: 700;">${s.subject_id}</td>
                                        <td style="text-align:center;">${(parseFloat(s.assignment || 0) + parseFloat(s.test1 || 0) + parseFloat(s.test2 || 0) + parseFloat(s.project || 0)).toFixed(1)}</td>
                                        <td style="text-align:center;">${s.exam || 0}</td>
                                        <td style="text-align:center; font-weight: 900; color: #4f46e5;">${s.total || 0}</td>
                                        <td style="text-align:center;"><span class="badge" style="background: #f1f5f9; color: #1e293b;">${s.grade || 'N/A'}</span></td>
                                    </tr>
                                `).join('')}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        `;
        if (typeof lucide !== 'undefined') lucide.createIcons();
    },

    async printReceipt(paymentId) {
        Notifications.show('Generating secure receipt...', 'info');
        const payment = await db.payments.get(paymentId);
        const student = await db.students.get(payment.student_id);
        const settings = await db.settings.toArray();
        const schoolInfo = {};
        settings.forEach(s => schoolInfo[s.key] = s.value);
        
        const { generatePaymentReceipt } = await import('./utils.js');
        await generatePaymentReceipt(payment, student, schoolInfo);
    },

    async renderSecurityLog() {
        const logs = await db.audit_logs.orderBy('timestamp').reverse().limit(100).toArray();
        
        this.contentArea.innerHTML = `
            <div class="view-container animate-fade-in">
                <div class="view-header" style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 2rem;">
                    <div>
                        <h1 class="text-2xl font-bold text-slate-800">Security & Audit Logs</h1>
                        <p class="text-slate-500">Track system activity and manage database integrity</p>
                    </div>
                    <div style="display: flex; gap: 1rem;">
                        <button class="btn" style="background: #fee2e2; color: #ef4444; border: 1px solid #fecaca; display: flex; align-items: center; gap: 0.5rem;" onclick="UI.factoryReset()">
                            <i data-lucide="trash-2"></i> Factory Reset
                        </button>
                    </div>
                </div>

                <div class="card shadow-sm" style="background: white; border-radius: 1.5rem; overflow: hidden;">
                    <div class="table-container">
                        <table class="data-table">
                            <thead>
                                <tr>
                                    <th>TIMESTAMP</th>
                                    <th>OPERATION</th>
                                    <th>TABLE</th>
                                    <th>RECORD ID</th>
                                    <th>USER</th>
                                    <th>SYNC STATUS</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${logs.length === 0 ? '<tr><td colspan="6" style="text-align:center; padding: 4rem;">No security logs recorded yet.</td></tr>' : logs.map(log => `
                                    <tr>
                                        <td class="text-slate-500 text-xs">${new Date(log.timestamp).toLocaleString()}</td>
                                        <td>
                                            <span class="badge" style="background: ${log.operation === 'delete' ? '#fee2e2; color: #ef4444' : log.operation === 'update' ? '#fef3c7; color: #d97706' : '#dcfce7; color: #16a34a'}; font-weight: 700; text-transform: uppercase;">
                                                ${log.operation}
                                            </span>
                                        </td>
                                        <td class="font-mono text-xs">${log.table}</td>
                                        <td class="text-slate-500 text-xs">${log.record_id}</td>
                                        <td class="font-medium">${log.user_id || 'System'}</td>
                                        <td>
                                            <i data-lucide="${log.is_synced ? 'check-circle' : 'clock'}" style="width:16px; height:16px; color: ${log.is_synced ? '#16a34a' : '#94a3b8'};"></i>
                                        </td>
                                    </tr>
                                `).join('')}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        `;
        if (typeof lucide !== 'undefined') lucide.createIcons();
    },

    async renderProfile() {
        this.contentArea.innerHTML = `
            <div class="view-container animate-fade-in" style="max-width: 800px; margin: 0 auto;">
                <div class="view-header" style="margin-bottom: 2rem;">
                    <h1 class="text-2xl font-bold text-slate-800">My Profile & Security</h1>
                    <p class="text-slate-500">Manage your account information and login credentials</p>
                </div>

                <div class="grid" style="display: grid; grid-template-columns: 1fr 1.5fr; gap: 2rem;">
                    <!-- User Info Card -->
                    <div class="card" style="padding: 2rem; background: white; border-radius: 24px; text-align: center; border: 1px solid #f1f5f9; box-shadow: var(--shadow-sm);">
                        <div style="width: 100px; height: 100px; background: #e0e7ff; border-radius: 50%; margin: 0 auto 1.5rem; display: flex; align-items: center; justify-content: center; color: #4338ca;">
                            <i data-lucide="user" style="width: 50px; height: 50px;"></i>
                        </div>
                        <h2 style="font-weight: 800; color: #1e293b; margin-bottom: 0.25rem;">${this.currentUser.name}</h2>
                        <span class="badge" style="background: #eef2ff; color: #4338ca; font-weight: 800; font-size: 0.75rem; text-transform: uppercase;">${this.currentUser.role}</span>
                        
                        <div style="margin-top: 2rem; padding-top: 2rem; border-top: 1px solid #f1f5f9; text-align: left;">
                            <div style="font-size: 0.7rem; font-weight: 800; color: #94a3b8; text-transform: uppercase; margin-bottom: 0.5rem;">User ID</div>
                            <div style="font-family: monospace; color: #334155; font-size: 0.85rem;">${this.currentUser.id}</div>
                        </div>
                    </div>

                    <!-- Security Card -->
                    <div class="card" style="padding: 2rem; background: white; border-radius: 24px; border: 1px solid #f1f5f9; box-shadow: var(--shadow-sm);">
                        <h3 style="font-weight: 800; color: #1e293b; margin-bottom: 1.5rem; display: flex; align-items: center; gap: 0.75rem;">
                            <i data-lucide="shield-check" style="color: #10b981;"></i> Update Password
                        </h3>
                        
                        <p style="color: #64748b; font-size: 0.85rem; margin-bottom: 2rem; line-height: 1.6;">To keep your account secure, we recommend using a unique password that you don't use elsewhere.</p>
                        
                        <div style="display: flex; flex-direction: column; gap: 1.25rem;">
                            <div class="form-group">
                                <label style="font-weight: 700; font-size: 0.75rem; color: #475569;">NEW PASSWORD</label>
                                <input type="password" id="new-password" class="input w-100" placeholder="Minimum 6 characters" style="border-radius: 12px; height: 48px;">
                            </div>
                            
                            <div class="form-group">
                                <label style="font-weight: 700; font-size: 0.75rem; color: #475569;">CONFIRM PASSWORD</label>
                                <input type="password" id="confirm-password" class="input w-100" placeholder="Re-enter new password" style="border-radius: 12px; height: 48px;">
                            </div>
                            
                            <button id="btn-update-password" class="btn btn-primary" style="margin-top: 1rem; border-radius: 12px; height: 52px; font-weight: 800; background: #1e293b;">
                                <i data-lucide="save"></i> Update Security Credentials
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        `;

        if (typeof lucide !== 'undefined') lucide.createIcons();

        document.getElementById('btn-update-password').onclick = async () => {
            const newPw = document.getElementById('new-password').value;
            const confirmPw = document.getElementById('confirm-password').value;

            if (newPw.length < 6) {
                return Notifications.show('Password must be at least 6 characters', 'error');
            }
            if (newPw !== confirmPw) {
                return Notifications.show('Passwords do not match', 'error');
            }

            const btn = document.getElementById('btn-update-password');
            btn.disabled = true;
            btn.innerHTML = '<i data-lucide="loader" class="spin"></i> Updating...';
            if (typeof lucide !== 'undefined') lucide.createIcons();

            try {
                const { error } = await updateUserPassword(newPw);
                if (error) {
                    Notifications.show(error.message, 'error');
                } else {
                    Notifications.show('Password updated successfully!', 'success');
                    document.getElementById('new-password').value = '';
                    document.getElementById('confirm-password').value = '';
                }
            } catch (err) {
                Notifications.show('Failed to update password', 'error');
            } finally {
                btn.disabled = false;
                btn.innerHTML = '<i data-lucide="save"></i> Update Security Credentials';
                if (typeof lucide !== 'undefined') lucide.createIcons();
            }
        };
    },

    async factoryReset() {
        if (confirm('CRITICAL WARNING: This will PERMANENTLY ERASE all local data from this browser. This cannot be undone. Are you absolutely sure?')) {
            const secondChance = confirm('FINAL CONFIRMATION: Are you REALLY sure? All unsynced records will be lost.');
            if (secondChance) {
                Notifications.show('Purging local database...', 'warning');
                await db.delete();
                localStorage.clear();
                window.location.reload();
            }
        }
    },

    async renderKeys() {
        const students = await db.students.where('is_active').equals(1).toArray();
        
        this.contentArea.innerHTML = `
            <div class="view-container animate-fade-in">
                <div class="view-header" style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 2rem;">
                    <div>
                        <h1 class="text-2xl font-bold text-slate-800">Student Access Keys</h1>
                        <p class="text-slate-500">Manage student credentials and portal login information</p>
                    </div>
                    <div style="display: flex; gap: 1rem;">
                        <div class="search-box" style="position: relative;">
                            <i data-lucide="search" style="position: absolute; left: 1rem; top: 50%; transform: translateY(-50%); width: 18px; color: #94a3b8;"></i>
                            <input type="text" id="keys-search" class="form-control" placeholder="Search ID or Name..." style="padding-left: 3rem; border-radius: 12px; width: 300px;">
                        </div>
                    </div>
                </div>

                <div class="card shadow-sm" style="background: white; border-radius: 1.5rem; overflow: hidden;">
                    <div class="table-container">
                        <table class="data-table">
                            <thead>
                                <tr>
                                    <th>STUDENT</th>
                                    <th>CLASS</th>
                                    <th>USERNAME (ID)</th>
                                    <th>PASSWORD</th>
                                    <th style="text-align: right;">ACTIONS</th>
                                </tr>
                            </thead>
                            <tbody id="keys-table-body">
                                ${students.length === 0 ? '<tr><td colspan="5" style="text-align:center; padding: 4rem;">No active students found.</td></tr>' : students.map(s => `
                                    <tr>
                                        <td>
                                            <div style="display: flex; align-items: center; gap: 1rem;">
                                                <div style="width: 40px; height: 40px; border-radius: 12px; background: #eff6ff; color: #1d4ed8; display: flex; align-items: center; justify-content: center; font-weight: 700; font-size: 0.8rem;">
                                                    ${s.name.charAt(0).toUpperCase()}
                                                </div>
                                                <div style="display: flex; flex-direction: column;">
                                                    <span class="font-bold text-slate-800">${s.name}</span>
                                                    <span class="text-xs text-slate-400">#${s.student_id}</span>
                                                </div>
                                            </div>
                                        </td>
                                        <td><span class="badge" style="background: #f1f5f9; color: #475569;">${s.class_name}</span></td>
                                        <td>
                                            <div style="display: flex; align-items: center; gap: 0.5rem; font-family: monospace; color: #1e293b; background: #f8fafc; padding: 0.25rem 0.5rem; border-radius: 6px; width: fit-content;">
                                                ${s.student_id}
                                                <button onclick="navigator.clipboard.writeText('${s.student_id}'); Notifications.show('Copied Username!', 'info')" style="background: none; border: none; padding: 0; color: #94a3b8; cursor: pointer;">
                                                    <i data-lucide="copy" style="width:14px; height:14px;"></i>
                                                </button>
                                            </div>
                                        </td>
                                        <td>
                                            <div style="display: flex; align-items: center; gap: 0.5rem; font-family: monospace; color: #1e293b; background: #f8fafc; padding: 0.25rem 0.5rem; border-radius: 6px; width: fit-content;">
                                                ${s.student_id}
                                                <button onclick="navigator.clipboard.writeText('${s.student_id}'); Notifications.show('Copied Password!', 'info')" style="background: none; border: none; padding: 0; color: #94a3b8; cursor: pointer;">
                                                    <i data-lucide="copy" style="width:14px; height:14px;"></i>
                                                </button>
                                            </div>
                                        </td>
                                        <td style="text-align: right;">
                                            <button class="btn btn-secondary btn-sm" onclick="UI.printSingleCredential('${s.student_id}')" style="background: #f1f5f9; color: #475569;">
                                                <i data-lucide="printer"></i>
                                            </button>
                                        </td>
                                    </tr>
                                `).join('')}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        `;
        if (typeof lucide !== 'undefined') lucide.createIcons();

        // Search logic
        const searchInput = document.getElementById('keys-search');
        if (searchInput) {
            searchInput.addEventListener('input', (e) => {
                const term = e.target.value.toLowerCase();
                const rows = document.querySelectorAll('#keys-table-body tr');
                rows.forEach(row => {
                    const text = row.textContent.toLowerCase();
                    row.style.display = text.includes(term) ? '' : 'none';
                });
            });
        }
    },

    async printSingleCredential(studentId) {
        const student = await db.students.get(studentId);
        if (!student) return;
        Notifications.show(`Generating login slip for ${student.name}...`, 'info');
        await generateCredentialsPDF([student]);
    },

    async renderPins() {
        const pins = await db.pins.orderBy('updated_at').reverse().toArray();
        
        this.contentArea.innerHTML = `
            <div class="view-container animate-fade-in">
                <div class="view-header" style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 2rem;">
                    <div>
                        <h1 class="text-2xl font-bold text-slate-800">Result Checker Pins</h1>
                        <p class="text-slate-500">Generate and manage access codes for student results</p>
                    </div>
                    <div style="display: flex; gap: 1rem;">
                        <button class="btn btn-primary" onclick="UI.showPinBatchModal()" style="display: flex; align-items: center; gap: 0.5rem; border-radius: 12px; height: 48px; padding: 0 1.5rem;">
                            <i data-lucide="plus-circle"></i> Generate Batch
                        </button>
                    </div>
                </div>

                <div class="card shadow-sm" style="background: white; border-radius: 1.5rem; overflow: hidden;">
                    <div class="table-container">
                        <table class="data-table">
                            <thead>
                                <tr>
                                    <th>SERIAL NUMBER</th>
                                    <th>PIN CODE</th>
                                    <th>STATUS</th>
                                    <th>USED BY</th>
                                    <th>USAGE</th>
                                    <th style="text-align: right;">ACTIONS</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${pins.length === 0 ? '<tr><td colspan="6" style="text-align:center; padding: 4rem;">No pins generated yet.</td></tr>' : pins.map(p => `
                                    <tr>
                                        <td class="font-mono font-bold text-slate-800">${p.serial}</td>
                                        <td class="font-mono" style="background: #f8fafc; padding: 0.25rem 0.5rem; border-radius: 4px;">${p.pin_code}</td>
                                        <td>
                                            <span class="badge" style="background: ${p.status === 'EXHAUSTED' ? '#fee2e2; color: #ef4444' : p.status === 'USED' ? '#fef3c7; color: #d97706' : '#dcfce7; color: #16a34a'}">
                                                ${p.status}
                                            </span>
                                        </td>
                                        <td>${p.student_id ? `<span class="text-xs font-medium">#${p.student_id}</span>` : '<span class="text-slate-400">Not Bound</span>'}</td>
                                        <td>
                                            <div style="width: 100px; height: 8px; background: #f1f5f9; border-radius: 4px; overflow: hidden; position: relative;">
                                                <div style="width: ${(p.used_count / p.usage_limit) * 100}%; height: 100%; background: #4f46e5;"></div>
                                            </div>
                                            <span class="text-xs text-slate-400">${p.used_count}/${p.usage_limit}</span>
                                        </td>
                                        <td style="text-align: right;">
                                            <button class="btn btn-secondary btn-sm" onclick="Notifications.show('Printing single pin slip...', 'info')" style="background: #f1f5f9; color: #475569;">
                                                <i data-lucide="printer"></i>
                                            </button>
                                        </td>
                                    </tr>
                                `).join('')}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        `;
        if (typeof lucide !== 'undefined') lucide.createIcons();
    },

    showPinBatchModal() {
        this.showModal('Generate Pin Batch', `
            <div class="form-group">
                <label class="form-label">Batch Size</label>
                <input type="number" id="pin-batch-size" class="form-control" value="50" min="1" max="500">
            </div>
            <div class="form-group mt-3">
                <label class="form-label">Usage Limit (Views)</label>
                <input type="number" id="pin-usage-limit" class="form-control" value="5" min="1">
            </div>
        `, async () => {
            const size = parseInt(document.getElementById('pin-batch-size').value);
            const limit = parseInt(document.getElementById('pin-usage-limit').value);
            
            Notifications.show(`Generating ${size} cryptographic pins...`, 'info');
            
            const newPins = [];
            for (let i = 0; i < size; i++) {
                const serial = Math.floor(10000000 + Math.random() * 90000000).toString();
                const pin = Math.floor(100000 + Math.random() * 900000).toString();
                newPins.push(prepareForSync({
                    id: crypto.randomUUID(),
                    serial,
                    pin_code: pin,
                    status: 'UNASSIGNED',
                    student_id: null,
                    used_count: 0,
                    usage_limit: limit
                }));
            }
            
            await db.pins.bulkAdd(newPins);
            document.getElementById('ui-modal').remove();
            Notifications.show(`${size} pins successfully generated and logged.`, 'success');
            this.renderPins();
        }, 'Generate Batch', 'zap');
    },

    async renderFinances() {
        const payments = await db.payments.orderBy('date').reverse().toArray();
        const structures = await db.fee_structures.toArray();
        
        this.contentArea.innerHTML = `
            <div class="view-container animate-fade-in">
                <div class="view-header" style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 2rem;">
                    <div>
                        <h1 class="text-2xl font-bold text-slate-800">Financial Management</h1>
                        <p class="text-slate-500">Track revenue, payments, and fee configurations</p>
                    </div>
                    <div style="display: flex; gap: 1rem;">
                        <button class="btn btn-secondary" onclick="UI.renderFeeStructures()" style="background: white; border: 1px solid #e2e8f0; display: flex; align-items: center; gap: 0.5rem; border-radius: 12px; height: 48px; padding: 0 1.5rem;">
                            <i data-lucide="settings"></i> Fee Structures
                        </button>
                        <button class="btn btn-primary" onclick="UI.showManualPaymentModal()" style="display: flex; align-items: center; gap: 0.5rem; border-radius: 12px; height: 48px; padding: 0 1.5rem;">
                            <i data-lucide="plus-circle"></i> Record Payment
                        </button>
                    </div>
                </div>

                <div class="stats-grid mb-2">
                    <div class="stat-card">
                        <div class="stat-icon" style="background: #dcfce7; color: #16a34a;"><i data-lucide="trending-up"></i></div>
                        <div class="stat-content">
                            <div class="stat-label">Total Revenue</div>
                            <div class="stat-value">₦${payments.reduce((a, b) => a + (parseFloat(b.amount) || 0), 0).toLocaleString()}</div>
                        </div>
                    </div>
                    <div class="stat-card">
                        <div class="stat-icon" style="background: #fef3c7; color: #d97706;"><i data-lucide="clock"></i></div>
                        <div class="stat-content">
                            <div class="stat-label">Pending Verifications</div>
                            <div class="stat-value">${payments.filter(p => p.status !== 'success').length}</div>
                        </div>
                    </div>
                </div>

                <div class="card shadow-sm" style="background: white; border-radius: 1.5rem; overflow: hidden;">
                    <div class="card-header" style="padding: 1.5rem; border-bottom: 1px solid #f1f5f9; display: flex; justify-content: space-between; align-items: center;">
                        <h3 class="font-bold text-slate-800">Payment Ledger</h3>
                        <div class="search-box" style="position: relative;">
                            <i data-lucide="search" style="position: absolute; left: 0.75rem; top: 50%; transform: translateY(-50%); width: 14px; color: #94a3b8;"></i>
                            <input type="text" placeholder="Search reference..." style="padding-left: 2.25rem; border-radius: 8px; border: 1px solid #e2e8f0; font-size: 0.8rem;">
                        </div>
                    </div>
                    <div class="table-container">
                        <table class="data-table">
                            <thead>
                                <tr>
                                    <th>DATE</th>
                                    <th>STUDENT</th>
                                    <th>REFERENCE</th>
                                    <th>CATEGORY</th>
                                    <th>AMOUNT</th>
                                    <th>STATUS</th>
                                    <th style="text-align: right;">RECEIPT</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${payments.length === 0 ? '<tr><td colspan="7" style="text-align:center; padding: 4rem;">No financial records found.</td></tr>' : payments.map(p => `
                                    <tr>
                                        <td class="text-slate-500 text-xs">${new Date(p.date).toLocaleDateString()}</td>
                                        <td><span class="font-medium text-slate-800">#${p.student_id}</span></td>
                                        <td class="font-mono text-xs text-slate-400">${p.reference}</td>
                                        <td><span class="badge" style="background: #f1f5f9; color: #64748b;">${p.category || 'School Fees'}</span></td>
                                        <td class="font-bold text-slate-800">₦${parseFloat(p.amount).toLocaleString()}</td>
                                        <td>
                                            <span class="badge" style="background: ${p.status === 'success' ? '#dcfce7; color: #16a34a' : '#fee2e2; color: #ef4444'}">
                                                ${p.status === 'success' ? 'Verified' : 'Pending'}
                                            </span>
                                        </td>
                                        <td style="text-align: right;">
                                            <button class="btn btn-secondary btn-sm" onclick="UI.printReceipt('${p.id}')" style="background: #f1f5f9; color: #4f46e5;">
                                                <i data-lucide="file-text"></i>
                                            </button>
                                        </td>
                                    </tr>
                                `).join('')}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        `;
        if (typeof lucide !== 'undefined') lucide.createIcons();
    },

    async renderFeeStructures() {
        const structures = await db.fee_structures.toArray();
        this.showModal('Fee Structures', `
            <div style="max-height: 400px; overflow-y: auto;">
                <table class="data-table" style="width: 100%;">
                    <thead>
                        <tr>
                            <th>CLASS</th>
                            <th>CATEGORY</th>
                            <th>AMOUNT</th>
                            <th>ACTION</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${structures.length === 0 ? '<tr><td colspan="4" style="text-align:center;">No structures defined.</td></tr>' : structures.map(s => `
                            <tr>
                                <td>${s.class_name}</td>
                                <td>${s.category}</td>
                                <td>₦${parseFloat(s.amount).toLocaleString()}</td>
                                <td><button onclick="UI.deleteFeeStructure('${s.id}')" style="color:#ef4444; background:none; border:none;"><i data-lucide="trash-2" style="width:14px;"></i></button></td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            </div>
            <hr style="margin: 1.5rem 0; border: 0; border-top: 1px solid #e2e8f0;">
            <div class="grid grid-cols-2 gap-3">
                <div class="form-group">
                    <label class="form-label">Class</label>
                    <input type="text" id="new-fee-class" class="form-control" placeholder="JSS 1">
                </div>
                <div class="form-group">
                    <label class="form-label">Category</label>
                    <input type="text" id="new-fee-cat" class="form-control" value="School Fees">
                </div>
                <div class="form-group">
                    <label class="form-label">Amount (₦)</label>
                    <input type="number" id="new-fee-amount" class="form-control" placeholder="50000">
                </div>
                <div class="form-group" style="display:flex; align-items:flex-end;">
                    <button class="btn btn-primary w-100" onclick="UI.saveFeeStructure()">Add Fee</button>
                </div>
            </div>
        `, null, 'Close', 'check');
        if (typeof lucide !== 'undefined') lucide.createIcons();
    },

    async saveFeeStructure() {
        const className = document.getElementById('new-fee-class').value;
        const category = document.getElementById('new-fee-cat').value;
        const amount = document.getElementById('new-fee-amount').value;
        
        if (!className || !amount) return Notifications.show('Please fill all fields', 'warning');
        
        await db.fee_structures.add(prepareForSync({
            id: crypto.randomUUID(),
            class_name: className,
            category: category,
            amount: parseFloat(amount),
            term: 'FIRST TERM',
            session: '2025/2026'
        }));
        
        Notifications.show('Fee structure saved', 'success');
        this.renderFeeStructures();
    },

    async deleteFeeStructure(id) {
        if (confirm('Delete this fee structure?')) {
            await db.fee_structures.delete(id);
            this.renderFeeStructures();
        }
    },

    showManualPaymentModal() {
        this.showModal('Record Manual Payment', `
            <div class="form-group">
                <label class="form-label">Student ID</label>
                <input type="text" id="pay-student-id" class="form-control" placeholder="NKQMS-2024-001">
            </div>
            <div class="form-group mt-2">
                <label class="form-label">Amount (₦)</label>
                <input type="number" id="pay-amount" class="form-control">
            </div>
            <div class="form-group mt-2">
                <label class="form-label">Category</label>
                <select id="pay-category" class="form-control">
                    <option value="School Fees">School Fees</option>
                    <option value="Bus">Bus</option>
                    <option value="Uniform">Uniform</option>
                    <option value="Books">Books</option>
                </select>
            </div>
        `, async () => {
            const studentId = document.getElementById('pay-student-id').value;
            const amount = document.getElementById('pay-amount').value;
            const category = document.getElementById('pay-category').value;
            
            if (!studentId || !amount) return;
            
            const student = await db.students.get(studentId);
            if (!student) return Notifications.show('Student not found!', 'error');
            
            const reference = 'MAN-' + Math.random().toString(36).substring(2, 10).toUpperCase();
            
            await db.payments.add(prepareForSync({
                id: crypto.randomUUID(),
                student_id: studentId,
                amount: parseFloat(amount),
                category,
                reference,
                status: 'success',
                date: new Date().toISOString(),
                term: 'FIRST TERM',
                session: '2025/2026'
            }));
            
            // Trigger analytics update
            await this.refreshStudentFinancials(studentId);
            
            document.getElementById('ui-modal').remove();
            Notifications.show('Payment recorded successfully', 'success');
            this.renderFinances();
        }, 'Record Payment', 'save');
    },

    async refreshStudentFinancials(studentId) {
        // Simple balance calculation logic
        const payments = await db.payments.where('student_id').equals(studentId).toArray();
        const totalPaid = payments.reduce((a, b) => a + (parseFloat(b.amount) || 0), 0);
        
        const student = await db.students.get(studentId);
        const structures = await db.fee_structures.where('class_name').equals(student.class_name).toArray();
        const totalExpected = structures.reduce((a, b) => a + (parseFloat(b.amount) || 0), 0);
        
        const analytics = await db.student_analytics.get(studentId) || { student_id: studentId };
        analytics.fee_balance = Math.max(0, totalExpected - totalPaid);
        
        await db.student_analytics.put(prepareForSync(analytics));
    },

    async renderParents() {
        const links = await db.parent_links.toArray();
        const profiles = await db.profiles.where('role').equalsIgnoreCase('Parent').toArray();
        const students = await db.students.toArray();

        this.contentArea.innerHTML = `
            <div class="view-container animate-fade-in">
                <div class="view-header" style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 2rem;">
                    <div>
                        <h1 class="text-2xl font-bold text-slate-800">Parent Link Registry</h1>
                        <p class="text-slate-500">Connect parents to their children for portal access</p>
                    </div>
                    <button class="btn btn-primary" onclick="UI.showParentLinkModal()" style="display: flex; align-items: center; gap: 0.5rem; border-radius: 12px; height: 48px; padding: 0 1.5rem;">
                        <i data-lucide="link"></i> Create New Link
                    </button>
                </div>

                <div class="card shadow-sm" style="background: white; border-radius: 1.5rem; overflow: hidden;">
                    <div class="table-container">
                        <table class="data-table">
                            <thead>
                                <tr>
                                    <th>PARENT NAME</th>
                                    <th>PARENT ID</th>
                                    <th>STUDENT(S)</th>
                                    <th>RELATIONSHIP</th>
                                    <th style="text-align: right;">ACTION</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${links.length === 0 ? '<tr><td colspan="5" style="text-align:center; padding: 4rem;">No parent links established yet.</td></tr>' : links.map(link => {
                                    const parent = profiles.find(p => p.id === link.parent_id);
                                    const student = students.find(s => s.student_id === link.student_id);
                                    return `
                                        <tr>
                                            <td class="font-bold text-slate-800">${parent ? parent.full_name : 'Unknown Parent'}</td>
                                            <td class="text-xs font-mono text-slate-400">${link.parent_id}</td>
                                            <td>
                                                <div style="display: flex; align-items: center; gap: 0.5rem;">
                                                    <span class="badge" style="background: #eff6ff; color: #1d4ed8;">${student ? student.name : link.student_id}</span>
                                                </div>
                                            </td>
                                            <td><span class="badge" style="background: #f1f5f9; color: #64748b;">${link.relationship}</span></td>
                                            <td style="text-align: right;">
                                                <button class="btn btn-secondary btn-sm" onclick="UI.deleteParentLink('${link.id}')" style="background: #fee2e2; color: #ef4444; border: none;">
                                                    <i data-lucide="trash-2"></i>
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
    },

    async showParentLinkModal() {
        const parents = await db.profiles.where('role').equalsIgnoreCase('Parent').toArray();
        const students = await db.students.where('is_active').equals(1).toArray();

        this.showModal('Create Parent-Student Link', `
            <div class="form-group">
                <label class="form-label">Select Parent</label>
                <select id="link-parent-id" class="form-control">
                    ${parents.map(p => `<option value="${p.id}">${p.full_name} (${p.assigned_id || 'No ID'})</option>`).join('')}
                </select>
            </div>
            <div class="form-group mt-3">
                <label class="form-label">Select Student</label>
                <select id="link-student-id" class="form-control">
                    ${students.map(s => `<option value="${s.student_id}">${s.name} (${s.class_name})</option>`).join('')}
                </select>
            </div>
            <div class="form-group mt-3">
                <label class="form-label">Relationship</label>
                <select id="link-rel" class="form-control">
                    <option value="Father">Father</option>
                    <option value="Mother">Mother</option>
                    <option value="Guardian">Guardian</option>
                </select>
            </div>
        `, async () => {
            const parentId = document.getElementById('link-parent-id').value;
            const studentId = document.getElementById('link-student-id').value;
            const rel = document.getElementById('link-rel').value;

            await db.parent_links.add(prepareForSync({
                id: crypto.randomUUID(),
                parent_id: parentId,
                student_id: studentId,
                relationship: rel
            }));

            document.getElementById('ui-modal').remove();
            Notifications.show('Link established successfully', 'success');
            this.renderParents();
        }, 'Establish Link', 'link');
    },

    async deleteParentLink(id) {
        if (confirm('Sever this parent-student connection?')) {
            await db.parent_links.delete(id);
            this.renderParents();
        }
    },

    async renderRoster() {
        const roster = await db.duty_assignments.toArray();
        const staff = await db.profiles.where('role').equalsIgnoreCase('Teacher').toArray();

        this.contentArea.innerHTML = `
            <div class="view-container animate-fade-in">
                <div class="view-header" style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 2rem;">
                    <div>
                        <h1 class="text-2xl font-bold text-slate-800">Staff Duty Roster</h1>
                        <p class="text-slate-500">Weekly administrative and supervisory assignments</p>
                    </div>
                    <button class="btn btn-primary" onclick="UI.showRosterModal()" style="display: flex; align-items: center; gap: 0.5rem; border-radius: 12px; height: 48px; padding: 0 1.5rem;">
                        <i data-lucide="calendar-plus"></i> Assign Duty
                    </button>
                </div>

                <div class="card shadow-sm" style="background: white; border-radius: 1.5rem; overflow: hidden;">
                    <div class="table-container">
                        <table class="data-table">
                            <thead>
                                <tr>
                                    <th>STAFF MEMBER</th>
                                    <th>DUTY TYPE</th>
                                    <th>WEEK START</th>
                                    <th>WEEK END</th>
                                    <th style="text-align: right;">ACTION</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${roster.length === 0 ? '<tr><td colspan="5" style="text-align:center; padding: 4rem;">No duty assignments scheduled.</td></tr>' : roster.map(r => {
                                    const member = staff.find(s => s.id === r.staff_id);
                                    return `
                                        <tr>
                                            <td>
                                                <div style="display: flex; align-items: center; gap: 0.75rem;">
                                                    <div style="width: 32px; height: 32px; border-radius: 8px; background: #f1f5f9; color: #475569; display: flex; align-items: center; justify-content: center; font-weight: 700; font-size: 0.7rem;">
                                                        ${member ? member.full_name.charAt(0) : '?'}
                                                    </div>
                                                    <span class="font-medium">${member ? member.full_name : 'Unknown Staff'}</span>
                                                </div>
                                            </td>
                                            <td><span class="badge" style="background: #fef3c7; color: #d97706; font-weight: 700;">${r.duty_type}</span></td>
                                            <td>${new Date(r.week_start).toLocaleDateString()}</td>
                                            <td>${new Date(r.week_end).toLocaleDateString()}</td>
                                            <td style="text-align: right;">
                                                <button class="btn btn-secondary btn-sm" onclick="UI.deleteRosterEntry('${r.id}')" style="background: none; color: #94a3b8;">
                                                    <i data-lucide="trash-2"></i>
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
    },

    async showRosterModal() {
        const staff = await db.profiles.where('role').equalsIgnoreCase('Teacher').toArray();
        this.showModal('Assign Weekly Duty', `
            <div class="form-group">
                <label class="form-label">Staff Member</label>
                <select id="duty-staff-id" class="form-control">
                    ${staff.map(s => `<option value="${s.id}">${s.full_name}</option>`).join('')}
                </select>
            </div>
            <div class="form-group mt-3">
                <label class="form-label">Duty Type</label>
                <select id="duty-type" class="form-control">
                    <option value="Teacher on Duty (TOD)">Teacher on Duty (TOD)</option>
                    <option value="Assembly Supervisor">Assembly Supervisor</option>
                    <option value="Gate Monitor">Gate Monitor</option>
                    <option value="Lunch Supervisor">Lunch Supervisor</option>
                </select>
            </div>
            <div class="grid grid-cols-2 gap-3 mt-3">
                <div class="form-group">
                    <label class="form-label">Week Start</label>
                    <input type="date" id="duty-start" class="form-control">
                </div>
                <div class="form-group">
                    <label class="form-label">Week End</label>
                    <input type="date" id="duty-end" class="form-control">
                </div>
            </div>
        `, async () => {
            const staffId = document.getElementById('duty-staff-id').value;
            const type = document.getElementById('duty-type').value;
            const start = document.getElementById('duty-start').value;
            const end = document.getElementById('duty-end').value;

            if (!staffId || !start || !end) return;

            await db.duty_assignments.add(prepareForSync({
                id: crypto.randomUUID(),
                staff_id: staffId,
                duty_type: type,
                week_start: start,
                week_end: end
            }));

            document.getElementById('ui-modal').remove();
            Notifications.show('Duty assigned successfully', 'success');
            this.renderRoster();
        }, 'Assign Duty', 'calendar-check');
    },

    async deleteRosterEntry(id) {
        if (confirm('Remove this duty assignment?')) {
            await db.duty_assignments.delete(id);
            this.renderRoster();
        }
    },

    async renderCurriculum() {
        const subjects = await db.subjects.toArray();
        const classes = await db.classes.toArray();
        const assignments = await db.subject_assignments.toArray();

        this.contentArea.innerHTML = `
            <div class="view-container animate-fade-in">
                <div class="view-header" style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 2rem;">
                    <div>
                        <h1 class="text-2xl font-bold text-slate-800">Academic Curriculum</h1>
                        <p class="text-slate-500">Manage institutional subjects and class assignments</p>
                    </div>
                    <div style="display: flex; gap: 1rem;">
                        <button class="btn btn-secondary" onclick="UI.renderSubjects()" style="background: white; border: 1px solid #e2e8f0;">
                            <i data-lucide="book-open"></i> Global Subjects
                        </button>
                    </div>
                </div>

                <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    ${classes.length === 0 ? '<div class="col-span-full text-center p-12 bg-white rounded-3xl">No classes found. Please set up classes first.</div>' : classes.map(cls => {
                        const classSubjects = assignments.filter(a => a.class_name === cls.name);
                        return `
                            <div class="card shadow-sm h-100" style="background: white; border-radius: 1.5rem; display: flex; flex-direction: column;">
                                <div class="card-header" style="padding: 1.5rem; border-bottom: 1px solid #f1f5f9; display: flex; justify-content: space-between; align-items: center; background: #f8fafc; border-radius: 1.5rem 1.5rem 0 0;">
                                    <h3 class="font-bold text-slate-800">${cls.name}</h3>
                                    <span class="badge" style="background: #4f46e5; color: white;">${classSubjects.length} Subjects</span>
                                </div>
                                <div class="card-body" style="padding: 1.5rem; flex: 1;">
                                    <ul style="list-style: none; padding: 0; margin: 0;">
                                        ${classSubjects.length === 0 ? '<li class="text-slate-400 text-sm italic">No subjects assigned yet.</li>' : classSubjects.map(a => `
                                            <li style="display: flex; justify-content: space-between; align-items: center; padding: 0.5rem 0; border-bottom: 1px solid #f8fafc;">
                                                <span class="text-sm font-medium text-slate-700">${a.subject_id}</span>
                                                <span class="text-xs text-slate-400">${a.specialization || 'General'}</span>
                                            </li>
                                        `).join('')}
                                    </ul>
                                </div>
                                <div class="card-footer" style="padding: 1rem; border-top: 1px solid #f1f5f9;">
                                    <button class="btn btn-secondary w-100 btn-sm" onclick="UI.renderClassCurriculum('${cls.name}')" style="background: #f1f5f9; color: #475569; border: none;">Manage Subjects</button>
                                </div>
                            </div>
                        `;
                    }).join('')}
                </div>
            </div>
        `;
        if (typeof lucide !== 'undefined') lucide.createIcons();
    },

    renderClassCurriculum(className) {
        // Direct them to the Academic module but filtered (or just show the modal)
        Notifications.show(`Redirecting to Academic Manager for ${className}...`, 'info');
        this.renderView('academic');
    },
};
