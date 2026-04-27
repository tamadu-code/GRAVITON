/**
 * Graviton CMS - UI Renderer
 * Manages view transitions and dynamic content
 */

import db, { prepareForSync } from './db.js';
import { ScoringEngine, Notifications, parseExcel, generateReportCard, generateCredentialsPDF } from './utils.js';
import { syncToCloud } from './supabase-client.js';

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
            
            // Render specific view
            switch(viewName) {
                case 'dashboard': await this.renderDashboard(); break;
                case 'students': await this.renderStudents(); break;
                case 'classes': await this.renderClasses(); break;
                case 'subjects': await this.renderSubjects(); break;
                case 'academic': await this.renderAcademic(); break;
                case 'bulkimport': await this.renderBulkImport(); break;
                case 'grades': await this.renderGrades(); break;
                case 'attendance': await this.renderAttendance(); break;
                case 'reports': await this.renderReports(); break;
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
                    btn.disabled = false;
                    btn.innerHTML = `<i data-lucide="${confirmIcon}"></i> ${confirmText}`;
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
        } else if (role === 'parent' || role === 'student') {
            await this.renderParentDashboard();
        } else {
            // Admin, Pending, or any unrecognised role → Admin dashboard
            await this.renderAdminDashboard();
        }
    },


    async renderAdminDashboard() {
        // ── Core counts ──────────────────────────────────────────────────
        const studentCount = await db.students.count();
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
        if (typeof lucide !== 'undefined') lucide.createIcons();
    },

    async renderTeacherDashboard() {
        this.contentArea.innerHTML = `
            <div class="dashboard-grid">
                <div class="stats-grid mb-2">
                    <div class="card stat-card secondary-gradient" style="grid-column: span 2;">
                        <div class="stat-icon"><i data-lucide="user"></i></div>
                        <div class="stat-info">
                            <h3>Welcome Back,</h3>
                            <p class="stat-value" style="font-size: 1.4rem;">${this.currentUser.name}</p>
                        </div>
                    </div>
                    <div class="card stat-card accent-gradient" style="grid-column: span 2;">
                        <div class="stat-icon"><i data-lucide="calendar"></i></div>
                        <div class="stat-info">
                            <h3>Today is</h3>
                            <p class="stat-value" style="font-size: 1.2rem;">${new Date().toLocaleDateString()}</p>
                        </div>
                    </div>
                </div>

                <div class="dashboard-grid main-dashboard-row">
                    <div class="card quick-actions">
                        <h3><i data-lucide="zap"></i> Teacher Actions</h3>
                        <div class="action-grid mt-2">
                            <button class="action-btn" onclick="document.querySelector('.nav-item[data-view=\\'attendance\\']').click()">
                                <div class="icon-wrapper bg-warning-light"><i data-lucide="check-square" class="text-warning"></i></div>
                                <span>Mark Attendance</span>
                            </button>
                            <button class="action-btn" onclick="document.querySelector('.nav-item[data-view=\\'grades\\']').click()">
                                <div class="icon-wrapper bg-primary-light"><i data-lucide="award" class="text-primary"></i></div>
                                <span>Enter Grades</span>
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        `;
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
                            <button class="action-btn" onclick="document.querySelector('.nav-item[data-view=\\'grades\\']').click()">
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
    async renderBulkImport() {
        this.contentArea.innerHTML = `
            <div class="view-container">
                <div class="page-header mb-2">
                    <h1 class="text-3xl font-bold" style="font-family: 'Outfit', sans-serif;">Bulk Data Utility</h1>
                    <p class="text-secondary text-lg">Import Students, Subjects, and Scores from an Excel Workbook (.xlsx)</p>
                </div>

                <div class="import-grid">
                    <div class="upload-card">
                        <h3 class="mb-1 font-bold text-xl">1. Prepare Workbook</h3>
                        <p class="text-secondary mb-3">Ensure your Excel sheets are named exactly as "Students", "Subjects", or "Scores".</p>
                        
                        <div id="dropzone" class="dropzone">
                            <div class="icon-circle mb-2" style="width: 80px; height: 80px; background: #eff6ff; border-radius: 50%; display: flex; align-items: center; justify-content: center; margin: 0 auto;">
                                <i data-lucide="file-spreadsheet" style="width: 40px; height: 40px; color: #2563eb;"></i>
                            </div>
                            <p class="font-semibold text-lg">Drag & drop your Excel file here</p>
                            <p class="text-secondary text-sm">or click the button below to browse</p>
                            <input type="file" id="bulk-file-input" accept=".xlsx, .xls" style="display: none;">
                            <button class="btn btn-primary mt-2 px-3 py-1" onclick="document.getElementById('bulk-file-input').click()" style="border-radius: 12px;">Browse Files</button>
                        </div>

                        <button id="run-import-btn" class="btn btn-primary w-full mt-2 py-1-5 text-lg font-bold" disabled style="background: #1e3a8a; border-radius: 16px;">
                            Initialize Import Engine
                        </button>

                        <div class="mt-4 p-2 bg-slate-50 rounded-2xl border border-slate-100">
                            <h4 class="font-bold text-sm mb-1 uppercase tracking-wider text-slate-500">Supported Headers</h4>
                            <div class="grid grid-cols-2 gap-2">
                                <div class="text-xs">
                                    <strong class="text-slate-700">STUDENTS:</strong><br>
                                    NAMES, CLASS, SERIAL NO, SEX
                                </div>
                                <div class="text-xs">
                                    <strong class="text-slate-700">SUBJECTS:</strong><br>
                                    TITLE, CLASS
                                </div>
                                <div class="text-xs" style="grid-column: span 2; margin-top: 0.5rem;">
                                    <strong class="text-slate-700">SCORES:</strong><br>
                                    NAMES, SUBJECTS, CLASS, TERM, SESSION, ASSIGNMENT, TEST 1, TEST 2, PROJECT, EXAM
                                </div>
                            </div>
                        </div>
                    </div>

                    <div class="log-card">
                        <div class="log-header" style="background: #f8fafc; padding: 1.25rem 1.5rem;">
                            <span class="font-bold text-slate-700">Import Runtime Console</span>
                            <button class="btn btn-secondary btn-sm" id="clear-logs" style="border-radius: 8px;">Flush Logs</button>
                        </div>
                        <div id="import-log-content" class="log-content" style="background: #ffffff;">
                            <div class="text-slate-400 italic">Console idling. Waiting for file...</div>
                        </div>
                    </div>
                </div>
            </div>
        `;

        const logContent = document.getElementById('import-log-content');
        const fileInput = document.getElementById('bulk-file-input');
        const runBtn = document.getElementById('run-import-btn');
        let selectedFile = null;

        const addLog = (msg, type = 'info') => {
            if (logContent.querySelector('.italic')) logContent.innerHTML = '';
            const entry = document.createElement('div');
            entry.className = `log-entry ${type}`;
            entry.innerHTML = `[${new Date().toLocaleTimeString()}] ${msg}`;
            logContent.appendChild(entry);
            logContent.scrollTop = logContent.scrollHeight;
        };

        fileInput.addEventListener('change', (e) => {
            selectedFile = e.target.files[0];
            if (selectedFile) {
                addLog(`File selected: ${selectedFile.name}`, 'info');
                runBtn.disabled = false;
            }
        });

        runBtn.addEventListener('click', async () => {
            if (!selectedFile) return;
            runBtn.disabled = true;
            runBtn.textContent = 'Processing...';
            addLog('Starting import process...', 'info');

            try {
                // Use the shared parseExcel utility
                const workbook = await parseExcel(selectedFile);
                
                // Process Students
                if (workbook.Students) {
                    addLog(`Processing ${workbook.Students.length} student records...`, 'info');
                    const students = [];
                    const classesToCreate = new Set();
                    
                    for (const s of workbook.Students) {
                        const getVal = (keys) => {
                            const foundKey = Object.keys(s).find(k => keys.includes(k.toUpperCase().replace(/\s/g, '')));
                            return foundKey ? s[foundKey] : null;
                        };

                        // Specific matches for the user's requested format: NAMES, CLASS, SERIAL NO, SEX
                        const name = getVal(['NAMES', 'NAME', 'FULLNAME', 'STUDENTNAME']);
                        if (!name) continue;

                        const className = getVal(['CLASS', 'STREAM', 'LEVEL', 'STREAMS']) || 'Unassigned';
                        classesToCreate.add(className);
                        
                        students.push({
                            student_id: getVal(['SERIALNO', 'SERIAL', 'ID', 'ADMISSIONNO', 'SN']) || `S${Math.random().toString(36).substr(2, 6).toUpperCase()}`,
                            name: name,
                            class_name: className,
                            gender: getVal(['SEX', 'GENDER', 'GENDERIDENTITY']) || 'Not Specified',
                            status: 'Active',
                            is_synced: 0,
                            updated_at: new Date().toISOString()
                        });
                    }
                    
                    // Smart Class Creation
                    const existingClasses = await db.classes.toArray();
                    const existingClassNames = new Set(existingClasses.map(c => c.name));
                    const newClasses = [];
                    for (const c of classesToCreate) {
                        if (!existingClassNames.has(c)) {
                            newClasses.push({
                                id: `C${Math.random().toString(36).substr(2, 6).toUpperCase()}`,
                                name: c,
                                level: 'Unspecified',
                                is_synced: 0,
                                updated_at: new Date().toISOString()
                            });
                        }
                    }
                    
                    if (newClasses.length > 0) {
                        await db.classes.bulkPut(newClasses);
                        addLog(`Smart Creation: Generated ${newClasses.length} missing classes automatically.`, 'success');
                    }
                    
                    // Upsert handles both inserts and updates natively in Dexie
                    await db.students.bulkPut(students);
                    addLog(`Successfully upserted ${students.length} students.`, 'success');
                } else {
                    addLog('No "Students" sheet found.', 'warning');
                }

                // Process Subjects (Deduplicated)
                if (workbook.Subjects) {
                    addLog(`Processing ${workbook.Subjects.length} subject records...`, 'info');
                    
                    const uniqueSubjects = new Map();
                    const assignments = [];
                    
                    for (const s of workbook.Subjects) {
                        const getVal = (keys) => {
                            const foundKey = Object.keys(s).find(k => keys.includes(k.toUpperCase().replace(/\s/g, '')));
                            return foundKey ? s[foundKey] : null;
                        };
                        
                        const name = getVal(['TITLE', 'NAME', 'SUBJECT', 'COURSETITLE']);
                        if (!name) continue;
                        
                        const className = getVal(['CLASS', 'STREAM', 'LEVEL', 'STREAMS']) || 'All';
                        
                        let subjectId;
                        const lowerName = name.toLowerCase();
                        
                        if (uniqueSubjects.has(lowerName)) {
                            subjectId = uniqueSubjects.get(lowerName).id;
                        } else {
                            const existing = await db.subjects.where('name').equalsIgnoreCase(name).first();
                            if (existing) {
                                subjectId = existing.id;
                            } else {
                                subjectId = `SUB${Math.random().toString(36).substr(2, 6).toUpperCase()}`;
                                uniqueSubjects.set(lowerName, {
                                    id: subjectId,
                                    name: name,
                                    type: getVal(['TYPE', 'CATEGORY', 'MODULETYPE']) || 'Core',
                                    credits: getVal(['UNITS', 'CREDITS', 'LOAD', 'CREDITLOAD']) || 1,
                                    is_synced: 0,
                                    updated_at: new Date().toISOString()
                                });
                            }
                        }
                        
                        assignments.push({
                            id: `ASG_${subjectId}_${className.replace(/\s/g, '')}`,
                            subject_id: subjectId,
                            class_name: className,
                            is_synced: 0,
                            updated_at: new Date().toISOString()
                        });
                    }
                    
                    if (uniqueSubjects.size > 0) {
                        await db.subjects.bulkPut(Array.from(uniqueSubjects.values()));
                    }
                    if (assignments.length > 0) {
                        await db.subject_assignments.bulkPut(assignments);
                    }
                    
                    addLog(`Smart Deduplication: Processed ${uniqueSubjects.size} unique school subjects across ${assignments.length} class assignments.`, 'success');
                }

                // Process Scores
                if (workbook.Scores) {
                    addLog(`Processing ${workbook.Scores.length} score records...`, 'info');
                    const allStudents = await db.students.toArray();
                    const allSubjects = await db.subjects.toArray();
                    let matched = 0, skipped = 0;

                    for (const row of workbook.Scores) {
                        const studentName = (row['NAMES'] || '').trim();
                        const subjectName = (row['SUBJECTS'] || '').trim();
                        const className = (row['CLASS'] || '').trim();

                        if (!studentName || !subjectName) { skipped++; continue; }

                        // Try to match the student
                        const student = allStudents.find(s => 
                            s.name.toLowerCase() === studentName.toLowerCase() && 
                            (!className || s.class_name === className)
                        );
                        const subject = allSubjects.find(s => 
                            s.name.toLowerCase() === subjectName.toLowerCase()
                        );

                        if (!student) { 
                            addLog(`Skipped score: Student "${studentName}" not found.`, 'warning'); 
                            skipped++; continue; 
                        }

                        const assignment = parseFloat(row['ASSIGNMENT']) || 0;
                        const test1 = parseFloat(row['TEST 1']) || 0;
                        const test2 = parseFloat(row['TEST 2']) || 0;
                        const project = parseFloat(row['PROJECT']) || 0;
                        const exam = parseFloat(row['EXAM']) || 0;
                        const ca = assignment + test1 + test2 + project;
                        const total = ca + exam;

                        await db.scores.put({
                            id: `SCR_${student.student_id}_${(subject ? subject.id : subjectName.replace(/\s/g, ''))}_${(row['TERM'] || '1st').replace(/\s/g, '')}`,
                            student_id: student.student_id,
                            subject_id: subject ? subject.id : subjectName,
                            class_name: className || student.class_name,
                            term: row['TERM'] || '1st',
                            session: row['SESSION'] || '',
                            assignment: assignment,
                            test1: test1,
                            test2: test2,
                            project: project,
                            exam: exam,
                            ca: ca,
                            total: total,
                            is_synced: 0,
                            updated_at: new Date().toISOString()
                        });
                        matched++;
                    }

                    addLog(`Scores processed: ${matched} matched, ${skipped} skipped.`, matched > 0 ? 'success' : 'warning');
                }

                Notifications.show('Bulk import completed successfully. Synchronizing...', 'info');
                await syncToCloud();
                Notifications.show('Cloud synchronization complete.', 'success');
            } catch (err) {
                addLog(`Import Error: ${err.message}`, 'error');
                Notifications.show('Import failed: ' + err.message, 'error');
            } finally {
                runBtn.disabled = false;
                runBtn.textContent = 'Run Import Now';
            }
        });

        document.getElementById('clear-logs').onclick = () => {
            logContent.innerHTML = '<div class="text-slate-400 italic">Waiting for action...</div>';
        };

        if (typeof lucide !== 'undefined') lucide.createIcons();
    },



    async renderClasses() {
        const streams = await db.classes.toArray();
        const studentCounts = await db.students.toArray();
        const formTeachers = await db.form_teachers.toArray().catch(() => []);
        const profiles = await db.profiles.toArray().catch(() => []);
        
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
                    <button id="btn-add-stream" class="btn" style="background: white; color: #2563eb; font-weight: 700; border-radius: 16px; padding: 1rem 2rem; display: flex; align-items: center; gap: 0.75rem; box-shadow: 0 10px 15px -3px rgba(0,0,0,0.1);">
                        <i data-lucide="plus-circle"></i> Add New Stream
                    </button>
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
                                 <div style="display: flex; gap: 1rem;">
                                     <button class="btn btn-secondary w-full rename-class-btn" data-id="${s.id}" data-name="${s.name}" style="height: 48px; border-radius: 12px; font-weight: 600; background: #f8fafc;"><i data-lucide="edit-3"></i> Rename</button>
                                     <button class="btn btn-secondary delete-class-btn" data-id="${s.id}" data-name="${s.name}" data-count="${getEnrollment(s.name)}" style="height: 48px; border-radius: 12px; color: #ef4444; background: #fef2f2; border: none;"><i data-lucide="trash-2"></i></button>
                                 </div>
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
        const subjects = await db.subjects.toArray();
        const assignments = await db.subject_assignments.toArray().catch(() => []);
        const profiles = await db.profiles.toArray().catch(() => []);
        
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
                    <div style="display: flex; gap: 0.75rem;">
                        <button id="btn-register-course" class="btn btn-primary" style="background: white; color: #0f172a; border: none; border-radius: 10px; padding: 0.6rem 1.25rem; font-weight: 700; font-size: 0.85rem;">
                            <i data-lucide="plus-circle" style="width: 16px;"></i> Register Course
                        </button>
                    </div>
                </div>

                <div class="card" style="border-radius: 12px; padding: 1rem;">
                    <div class="actions-bar mb-1" style="display: flex; gap: 1rem; flex-wrap: wrap;">
                        <div style="position: relative; flex: 1;">
                            <i data-lucide="search" style="position: absolute; left: 0.75rem; top: 50%; transform: translateY(-50%); color: #94a3b8; width: 14px;"></i>
                            <input type="text" placeholder="Search courses..." class="input" style="padding-left: 2.25rem; border-radius: 10px; height: 40px;">
                        </div>
                    </div>

                    <div class="table-container" style="max-height: calc(100vh - 350px); overflow-y: auto;">
                        <table class="data-table">
                            <thead>
                                <tr>
                                    <th>COURSE TITLE</th>
                                    <th>STREAMS</th>
                                    <th>FACULTY</th>
                                    <th>UNITS</th>
                                    <th style="text-align: right;">ACTIONS</th>
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
                                        <td style="text-align: right;">
                                            <div style="display: flex; gap: 0.5rem; justify-content: flex-end;">
                                                <button class="btn btn-secondary btn-sm delete-subject-btn" data-ids="${s.ids.join(',')}" data-name="${s.name}" style="color: #ef4444;"><i data-lucide="trash-2" style="width: 14px;"></i></button>
                                            </div>
                                        </td>
                                    </tr>
                                `;}).join('')}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        `;

        // Register Course Modal
        const btnRegCourse = document.getElementById('btn-register-course');
        if (btnRegCourse) {
            btnRegCourse.addEventListener('click', async () => {
                const allClasses = await db.classes.toArray();
                const classCheckboxes = allClasses.map(c => `
                    <label style="display: flex; align-items: center; gap: 0.5rem; font-size: 0.85rem; color: #334155; cursor: pointer;">
                        <input type="checkbox" class="stream-checkbox" value="${c.name}" style="accent-color: #2563eb;"> ${c.name}
                    </label>
                `).join('');

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
    },

    async renderStudents() {
        const students = (await db.students.toArray()).sort((a,b) => a.name.localeCompare(b.name));
        const classes = (await db.classes.toArray()).sort((a,b) => a.name.localeCompare(b.name));
        
        this.contentArea.innerHTML = `
            <div class="view-container" style="padding: 0.75rem;">
                <div class="page-banner" style="background: linear-gradient(135deg, #1e40af 0%, #1e3a8a 100%); padding: 1rem; min-height: auto; gap: 0.75rem;">
                    <div class="banner-content">
                        <h1 class="banner-title" style="font-size: 1.15rem; margin-bottom: 0.25rem;"><i data-lucide="graduation-cap"></i> Student Directory</h1>
                        <p class="banner-subtitle" style="font-size: 0.75rem; opacity: 0.8; line-height: 1.2;">Manage learners, biometric profiles, and performance metrics.</p>
                    </div>
                    <div class="banner-stats" style="margin: 0.5rem 0;">
                        <div class="banner-stat-item">
                            <span class="stat-value" style="font-size: 1.1rem;">${students.length}</span>
                            <span class="stat-label" style="font-size: 0.65rem;">Total</span>
                        </div>
                        <div class="banner-stat-item">
                            <span class="stat-value" style="font-size: 1.1rem;">${classes.length}</span>
                            <span class="stat-label" style="font-size: 0.65rem;">Classes</span>
                        </div>
                    </div>
                    <div class="banner-actions" style="display: flex; gap: 0.5rem; flex-wrap: wrap;">
                        <button id="btn-add-student" class="btn btn-primary" style="background: white; color: #1e3a8a; border: none; border-radius: 8px; padding: 0.5rem 1rem; display: flex; align-items: center; gap: 0.4rem; font-weight: 700; font-size: 0.75rem;">
                            <i data-lucide="user-plus" style="width: 14px;"></i> New Enrolment
                        </button>
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
                            <select id="class-filter" class="input" style="border-radius: 10px; height: 44px; border: 1px solid #e2e8f0; background: white; font-weight: 600; color: #475569;">
                                <option value="">All Academic Streams</option>
                                ${classes.map(c => `<option value="${c.name}">${c.name}</option>`).join('')}
                            </select>
                        </div>
                        <div class="sidebar-list" id="student-sidebar-list" style="padding: 1rem;">
                            ${this.generateStudentListItems(students)}
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
        const listContainer = document.getElementById('student-sidebar-list');

        const updateList = () => {
            const term = searchInput.value.toLowerCase();
            const filterClass = classFilter.value;
            const filtered = students.filter(s => 
                (s.name.toLowerCase().includes(term) || s.student_id.toLowerCase().includes(term)) &&
                (!filterClass || s.class_name === filterClass)
            );
            listContainer.innerHTML = this.generateStudentListItems(filtered);
            if (typeof lucide !== 'undefined') lucide.createIcons();
        };

        searchInput.addEventListener('input', updateList);
        classFilter.addEventListener('change', updateList);

        // Selection Logic
        listContainer.addEventListener('click', async (e) => {
            const item = e.target.closest('.student-item');
            if (!item) return;

            document.querySelectorAll('.student-item').forEach(i => i.classList.remove('active'));
            item.classList.add('active');

            const id = item.dataset.id;
            await this.renderStudentDetail(id);
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
                            <input type="text" id="std-serial" class="input" placeholder="Auto-generated if left blank" style="width: 100%; box-sizing: border-box;">
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
                    const serial = document.getElementById('std-serial').value.trim() || `S${Math.random().toString(36).substr(2, 6).toUpperCase()}`;
                    
                    if (!name || !className) {
                        Notifications.show('Name and Class are required', 'error');
                        throw new Error('Validation failed');
                    }

                    const newStudent = prepareForSync({
                        student_id: serial,
                        name: name,
                        class_name: className,
                        gender: gender,
                        status: 'Active',
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

                    await db.students.add(newStudent);
                    syncToCloud(); // Fire and forget sync
                    Notifications.show(`Student ${name} registered successfully.`, 'success');
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
                                 <button id="btn-modify-student" class="btn btn-secondary" style="border-radius: 14px; padding: 0.75rem 1.25rem;"><i data-lucide="edit"></i> Modify</button>
                                 <button id="btn-delete-student" class="btn btn-secondary" style="border-radius: 14px; padding: 0.75rem 1.25rem; color: #ef4444; background: #fef2f2; border: none;"><i data-lucide="trash-2"></i></button>
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
                                <span class="badge" style="background: #ecfdf5; color: #10b981; font-weight: 700; border-radius: 8px; padding: 2px 8px;">${student.status || 'Active'}</span>
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

        // CRUD: Delete Student
        const deleteBtn = document.getElementById('btn-delete-student');
        if (deleteBtn) {
            deleteBtn.onclick = async () => {
                if (confirm(`Are you sure you want to delete ${student.name}'s entire profile? This action is irreversible.`)) {
                    await db.students.delete(studentId);
                    Notifications.show(`${student.name} has been removed from the directory.`, 'success');
                    this.renderStudents();
                }
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
            <div class="student-item" data-id="${s.student_id}">
                <div class="student-item-info">
                    <span class="student-item-name">${s.name}</span>
                    <span class="student-item-meta">${s.student_id} • ${s.class_name}</span>
                </div>
                <div style="display: flex; gap: 0.5rem; opacity: 0.6;">
                    <i data-lucide="edit-3" style="width: 14px; cursor: pointer;"></i>
                    <i data-lucide="trash-2" style="width: 14px; cursor: pointer; color: #ef4444;"></i>
                    <i data-lucide="chevron-right" style="width: 14px;"></i>
                </div>
            </div>
        `).join('');
    },

    async renderGrades() {
        const students = await db.students.toArray();
        const subjects = await db.subjects.toArray();
        
        this.contentArea.innerHTML = `
            <div class="view-container">
                <div class="page-banner" style="background: linear-gradient(135deg, #4338ca 0%, #3730a3 100%);">
                    <div class="banner-content">
                        <h1 class="banner-title"><i data-lucide="bar-chart"></i> Academic Gradebook</h1>
                        <p class="banner-subtitle">Manage assessment scores and performance analytics.</p>
                    </div>
                    <div style="display: flex; gap: 0.75rem;">
                        <button id="btn-print-report-cards" class="btn btn-secondary" style="border-radius: 10px; padding: 0.5rem 1rem; font-size: 0.85rem; color: white;">
                            <i data-lucide="printer" style="width: 14px;"></i> Report Cards
                        </button>
                    </div>
                </div>

                <div class="card" style="border-radius: 12px; padding: 1rem;">
                    <div class="actions-bar mb-1" style="display: flex; gap: 1rem; flex-wrap: wrap;">
                        <select id="class-filter" class="input" style="height: 40px; min-width: 150px;">
                            <option value="">All Classes</option>
                            ${[...new Set(students.map(s => s.class_name))].sort().map(c => `<option value="${c}">${c}</option>`).join('')}
                        </select>
                        <select id="subject-filter" class="input" style="height: 40px; min-width: 150px;">
                            <option value="">Select Subject</option>
                            ${subjects.sort((a,b) => a.name.localeCompare(b.name)).map(s => `<option value="${s.id}">${s.name}</option>`).join('')}
                        </select>
                        <select id="term-filter" class="input" style="height: 40px;">
                            <option value="1st Term">1st Term</option>
                            <option value="2nd Term">2nd Term</option>
                            <option value="3rd Term">3rd Term</option>
                        </select>
                    </div>
                    
                    <div class="table-container" style="max-height: calc(100vh - 350px); overflow-y: auto;">
                        <table class="data-table">
                            <thead>
                                <tr>
                                    <th>ID</th>
                                    <th>Student</th>
                                    <th>CA (40)</th>
                                    <th>Exam (60)</th>
                                    <th>Total</th>
                                    <th>Grade</th>
                                    <th>Action</th>
                                </tr>
                            </thead>
                            <tbody id="score-entry-body">
                                ${students.map(s => `
                                    <tr data-student-id="${s.student_id}">
                                        <td>${s.student_id}</td>
                                        <td>${s.name}</td>
                                        <td><input type="number" class="input score-input" data-field="ca" max="40" style="width: 60px; height: 32px; padding: 0 4px;"></td>
                                        <td><input type="number" class="input score-input" data-field="exam" max="60" style="width: 60px; height: 32px; padding: 0 4px;"></td>
                                        <td class="total-cell">-</td>
                                        <td class="grade-cell">-</td>
                                        <td><button class="btn btn-primary btn-sm save-score">Save</button></td>
                                    </tr>
                                `).join('')}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        `;

        // Load existing scores when filters change
        const loadScores = async () => {
            const subjectId = document.getElementById('subject-filter').value;
            const classFilter = document.getElementById('class-filter').value;
            
            // Clear or Filter rows
            document.querySelectorAll('#score-entry-body tr').forEach(row => {
                const sId = row.dataset.studentId;
                const student = students.find(s => s.student_id === sId);
                
                if (classFilter && student.class_name !== classFilter) {
                    row.style.display = 'none';
                } else {
                    row.style.display = '';
                }
            });

            if (!subjectId) return;

            const scores = await db.scores.where('subject_id').equals(subjectId).toArray();
            document.querySelectorAll('#score-entry-body tr').forEach(row => {
                const sId = row.dataset.studentId;
                const score = scores.find(s => s.student_id === sId);
                if (score && row.style.display !== 'none') {
                    row.querySelector('[data-field="ca"]').value = score.ca;
                    row.querySelector('[data-field="exam"]').value = score.exam;
                    const total = score.ca + score.exam;
                    row.querySelector('.total-cell').textContent = total;
                    row.querySelector('.grade-cell').textContent = ScoringEngine.getGrade(total);
                } else if (row.style.display !== 'none') {
                    row.querySelector('[data-field="ca"]').value = '';
                    row.querySelector('[data-field="exam"]').value = '';
                    row.querySelector('.total-cell').textContent = '-';
                    row.querySelector('.grade-cell').textContent = '-';
                }
            });
        };

        document.getElementById('subject-filter').addEventListener('change', loadScores);
        document.getElementById('class-filter').addEventListener('change', loadScores);

        // Logic for calculations and saving...
        document.querySelectorAll('.score-input').forEach(input => {
            input.addEventListener('input', (e) => {
                const row = e.target.closest('tr');
                const ca = parseFloat(row.querySelector('[data-field="ca"]').value) || 0;
                const exam = parseFloat(row.querySelector('[data-field="exam"]').value) || 0;
                const total = ca + exam;
                row.querySelector('.total-cell').textContent = total;
                row.querySelector('.grade-cell').textContent = ScoringEngine.getGrade(total);
            });
        });

        document.querySelectorAll('.save-score').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                const row = e.target.closest('tr');
                const studentId = row.dataset.studentId;
                const subjectId = document.getElementById('subject-filter').value;
                if (!subjectId) return Notifications.show('Select subject', 'error');

                const ca = parseFloat(row.querySelector('[data-field="ca"]').value) || 0;
                const exam = parseFloat(row.querySelector('[data-field="exam"]').value) || 0;
                
                await db.scores.put(prepareForSync({
                    id: `${studentId}_${subjectId}`,
                    student_id: studentId,
                    subject_id: subjectId,
                    ca, exam, total: ca + exam,
                    updated_at: new Date().toISOString()
                }));
                syncToCloud(); 
                Notifications.show('Score saved and syncing...', 'success');
            });
        });
    },

    async renderAcademic() {
        const classes = (await db.classes.toArray()).sort((a,b) => a.name.localeCompare(b.name));
        const subjects = (await db.subjects.toArray()).sort((a,b) => a.name.localeCompare(b.name));
        
        this.contentArea.innerHTML = `
            <div class="view-container" style="padding: 0.75rem;">
                <div class="page-banner" style="background: linear-gradient(135deg, #1e293b 0%, #0f172a 100%); padding: 1rem; min-height: auto; margin-bottom: 0.75rem;">
                    <div class="banner-content">
                        <h1 class="banner-title" style="font-size: 1.15rem; margin-bottom: 0.25rem;"><i data-lucide="settings-2"></i> Academic Setup</h1>
                        <p class="banner-subtitle" style="font-size: 0.75rem; opacity: 0.8;">Configure classes and subject curriculum.</p>
                    </div>
                </div>
                
                <div class="tabs mb-1" style="display: flex; gap: 0.5rem; overflow-x: auto; padding-bottom: 4px;">
                    <button class="tab-btn active" data-tab="classes" style="padding: 0.4rem 0.75rem; font-size: 0.8rem; border-radius: 8px;">Classes</button>
                    <button class="tab-btn" data-tab="subjects" style="padding: 0.4rem 0.75rem; font-size: 0.8rem; border-radius: 8px;">Subjects</button>
                    <button class="tab-btn" data-tab="assignments" style="padding: 0.4rem 0.75rem; font-size: 0.8rem; border-radius: 8px;">Assignments</button>
                </div>
                
                <div id="tab-content" class="card" style="border-radius: 12px; padding: 1rem; flex: 1; overflow-y: auto;">
                    <!-- Tab content will be rendered here -->
                </div>
            </div>
        `;

        const renderTab = async (tab) => {
            const container = document.getElementById('tab-content');
            document.querySelectorAll('.tab-btn').forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
            
            if (tab === 'classes') {
                container.innerHTML = `
                    <div class="actions-bar mb-1"><button id="add-class-btn" class="btn btn-primary btn-sm" style="padding: 0.5rem 1rem; font-weight: 700;">Add New Stream</button></div>
                    <table class="data-table">
                        <thead><tr><th>Name</th><th>Level</th><th>Action</th></tr></thead>
                        <tbody>${classes.map(c => `<tr><td>${c.name}</td><td>${c.level}</td><td><i data-lucide="trash-2" class="delete-class" data-id="${c.id}" style="color:#ef4444; cursor:pointer; width:16px;"></i></td></tr>`).join('')}</tbody>
                    </table>
                `;
            } else if (tab === 'subjects') {
                container.innerHTML = `
                    <div class="actions-bar mb-1"><button id="add-subject-btn" class="btn btn-primary btn-sm" style="padding: 0.5rem 1rem; font-weight: 700;">Register Course</button></div>
                    <table class="data-table">
                        <thead><tr><th>Name</th><th>Type</th><th>Credits</th><th>Action</th></tr></thead>
                        <tbody>${subjects.map(s => `<tr><td>${s.name}</td><td>${s.type}</td><td>${s.credits}</td><td><i data-lucide="trash-2" class="delete-sub" data-id="${s.id}" style="color:#ef4444; cursor:pointer; width:16px;"></i></td></tr>`).join('')}</tbody>
                    </table>
                `;
            }
            if (typeof lucide !== 'undefined') lucide.createIcons();
        };

        document.querySelectorAll('.tab-btn').forEach(btn => btn.onclick = () => renderTab(btn.dataset.tab));
        renderTab('classes');
    },

    async renderAttendance() {
        const students = (await db.students.toArray()).sort((a,b) => a.name.localeCompare(b.name));
        const classes = (await db.classes.toArray()).sort((a,b) => a.name.localeCompare(b.name));
        
        this.contentArea.innerHTML = `
            <div class="view-container">
                <div class="page-banner" style="background: linear-gradient(135deg, #0f172a 0%, #1e293b 100%);">
                    <div class="banner-content">
                        <h1 class="banner-title"><i data-lucide="check-circle"></i> Daily Attendance</h1>
                        <p class="banner-subtitle">Track and manage daily presence across all academic levels.</p>
                    </div>
                    <div style="display: flex; gap: 0.75rem;">
                        <button id="btn-export-attendance" class="btn btn-secondary" style="border-radius: 10px; padding: 0.5rem 1rem; font-size: 0.85rem; color: white;">
                            <i data-lucide="download" style="width: 14px;"></i> Export
                        </button>
                    </div>
                </div>

                <div class="card" style="border-radius: 12px; padding: 1rem;">
                    <div class="actions-bar mb-1" style="display: flex; gap: 1rem; flex-wrap: wrap;">
                        <select id="attendance-class-filter" class="input" style="height: 40px;">
                            <option value="">Select Class</option>
                            ${classes.map(c => `<option value="${c.name}">${c.name}</option>`).join('')}
                        </select>
                        <input type="date" id="attendance-date" class="input" value="${new Date().toISOString().split('T')[0]}" style="height: 40px;">
                        <button id="btn-save-attendance" class="btn btn-primary" style="height: 40px; border-radius: 10px;">Save Attendance</button>
                    </div>
                    
                    <div class="table-container" style="max-height: calc(100vh - 350px); overflow-y: auto;">
                        <table class="data-table">
                            <thead><tr><th>ID</th><th>Student Name</th><th>Status</th></tr></thead>
                            <tbody id="attendance-list-body">
                                <tr><td colspan="3" class="text-center p-4">Select a class to start tracking</td></tr>
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        `;
    },



    async renderReports() {
        const students = await db.students.toArray();
        
        this.contentArea.innerHTML = `
            <div class="actions-bar mb-2">
                <input type="text" id="report-search" placeholder="Search student for report..." class="input">
            </div>
            
            <div class="grid" id="report-list">
                ${students.map(s => `
                    <div class="card student-report-card">
                        <h3>${s.name}</h3>
                        <p class="text-secondary">${s.student_id} | ${s.class_name}</p>
                        <button class="btn btn-primary mt-2 generate-pdf" data-id="${s.student_id}">
                            <i data-lucide="file-down"></i> Generate Report Card
                        </button>
                    </div>
                `).join('')}
            </div>
        `;

        document.querySelectorAll('.generate-pdf').forEach(btn => {
            btn.addEventListener('click', async () => {
                const id = btn.dataset.id;
                const student = await db.students.get(id);
                const scores = await db.scores.where('student_id').equals(id).toArray();
                
                // Fetch subject names for scores
                for (const score of scores) {
                    const sub = await db.subjects.get(score.subject_id);
                    score.subject_name = sub ? sub.name : 'Unknown Subject';
                }

                Notifications.show(`Generating report for ${student.name}...`, 'info');
                await generateReportCard(student, scores, { name: 'GRAVITON ACADEMY', address: 'Academic Excellence Through Logic' });
            });
        });
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
    }
};
