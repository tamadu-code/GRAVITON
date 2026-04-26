/**
 * Graviton CMS - UI Renderer
 * Manages view transitions and dynamic content
 */

import db from './db.js';
import { ScoringEngine, Notifications, parseExcel, generateReportCard } from './utils.js';

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
                case 'settings': await this.renderSettings(); break;
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
        const subjectCount = await db.subjects.count();
        let teacherCount   = 0;
        try { if (db.staff) teacherCount = await db.staff.where('role').equals('Teacher').count(); } catch(e){}

        try {
            const { getSupabase } = await import('./supabase-client.js');
            const sb = getSupabase();
            if (sb) {
                const { count } = await sb.from('profiles').select('*', { count: 'exact', head: true }).eq('role', 'Teacher');
                if (count !== null) teacherCount = count;
            }
        } catch(e) {}

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

        this.contentArea.innerHTML = `
            <div class="view-container">
                <header class="dashboard-header mb-2">
                    <h1 class="text-4xl font-extrabold tracking-tight" style="font-family: 'Outfit', sans-serif;">Dashboard Overview</h1>
                    <p class="text-secondary text-lg">Welcome back, <span class="font-bold text-primary">${this.currentUser.name}</span>. Here is what's happening today.</p>
                </header>

                <div class="stats-grid mb-2">
                    <div class="stat-card-premium" style="border-radius: 24px; padding: 2rem;">
                        <span class="stat-label" style="font-weight: 800; letter-spacing: 0.1em; color: #64748b;">ACTIVE STUDENTS</span>
                        <div class="stat-body" style="margin-top: 1rem; display: flex; align-items: baseline; gap: 1rem;">
                            <span class="stat-number" style="font-size: 3rem; font-weight: 800; font-family: 'Outfit', sans-serif;">${studentCount}</span>
                            <span class="stat-trend trend-up" style="background: #ecfdf5; color: #10b981; padding: 4px 10px; border-radius: 99px; font-size: 0.8rem; font-weight: 700;">+12% <i data-lucide="trending-up" style="width:14px;"></i></span>
                        </div>
                        <div class="stat-icon-bg" style="position: absolute; right: 2rem; top: 2rem; width: 64px; height: 64px; background: #eff6ff; border-radius: 20px; display: flex; align-items: center; justify-content: center; color: #2563eb;">
                            <i data-lucide="users" style="width: 32px; height: 32px;"></i>
                        </div>
                    </div>

                    <div class="stat-card-premium" style="border-radius: 24px; padding: 2rem;">
                        <span class="stat-label" style="font-weight: 800; letter-spacing: 0.1em; color: #64748b;">FACULTY STAFF</span>
                        <div class="stat-body" style="margin-top: 1rem; display: flex; align-items: baseline; gap: 1rem;">
                            <span class="stat-number" style="font-size: 3rem; font-weight: 800; font-family: 'Outfit', sans-serif;">${teacherCount}</span>
                            <span class="stat-trend" style="background: #f8fafc; color: #64748b; padding: 4px 10px; border-radius: 99px; font-size: 0.8rem; font-weight: 700;">Stable</span>
                        </div>
                        <div class="stat-icon-bg" style="position: absolute; right: 2rem; top: 2rem; width: 64px; height: 64px; background: #f0fdf4; border-radius: 20px; display: flex; align-items: center; justify-content: center; color: #16a34a;">
                            <i data-lucide="user-check" style="width: 32px; height: 32px;"></i>
                        </div>
                    </div>

                    <div class="stat-card-premium" style="border-radius: 24px; padding: 2rem;">
                        <span class="stat-label" style="font-weight: 800; letter-spacing: 0.1em; color: #64748b;">TOTAL STREAMS</span>
                        <div class="stat-body" style="margin-top: 1rem; display: flex; align-items: baseline; gap: 1rem;">
                            <span class="stat-number" style="font-size: 3rem; font-weight: 800; font-family: 'Outfit', sans-serif;">${classCount}</span>
                            <span class="stat-trend trend-up" style="background: #fff7ed; color: #ea580c; padding: 4px 10px; border-radius: 99px; font-size: 0.8rem; font-weight: 700;">+2 <i data-lucide="trending-up" style="width:14px;"></i></span>
                        </div>
                        <div class="stat-icon-bg" style="position: absolute; right: 2rem; top: 2rem; width: 64px; height: 64px; background: #fff7ed; border-radius: 20px; display: flex; align-items: center; justify-content: center; color: #f97316;">
                            <i data-lucide="layers" style="width: 32px; height: 32px;"></i>
                        </div>
                    </div>

                    <div class="stat-card-premium" style="border-radius: 24px; padding: 2rem;">
                        <span class="stat-label" style="font-weight: 800; letter-spacing: 0.1em; color: #64748b;">OFFERED COURSES</span>
                        <div class="stat-body" style="margin-top: 1rem; display: flex; align-items: baseline; gap: 1rem;">
                            <span class="stat-number" style="font-size: 3rem; font-weight: 800; font-family: 'Outfit', sans-serif;">${subjectCount}</span>
                            <span class="stat-trend" style="background: #f5f3ff; color: #7c3aed; padding: 4px 10px; border-radius: 99px; font-size: 0.8rem; font-weight: 700;">Active</span>
                        </div>
                        <div class="stat-icon-bg" style="position: absolute; right: 2rem; top: 2rem; width: 64px; height: 64px; background: #f5f3ff; border-radius: 20px; display: flex; align-items: center; justify-content: center; color: #8b5cf6;">
                            <i data-lucide="book-open" style="width: 32px; height: 32px;"></i>
                        </div>
                    </div>
                </div>

                <div class="dashboard-main-grid" style="display: grid; grid-template-columns: 2fr 1fr; gap: 2rem;">
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
                <div class="grid mb-2">
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

                <div class="grid main-dashboard-row">
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
                                    NAMES, CLASS, SEX, SERIAL NO
                                </div>
                                <div class="text-xs">
                                    <strong class="text-slate-700">SUBJECTS:</strong><br>
                                    TITLE, CLASS
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
                const workbook = await this.readExcel(selectedFile);
                
                // Process Students
                if (workbook.Students) {
                    addLog(`Processing ${workbook.Students.length} student records...`, 'info');
                    const students = workbook.Students.map(s => ({
                        student_id: s['SERIAL NO'] || `S${Math.random().toString(36).substr(2, 6)}`,
                        name: s['NAMES'],
                        class_name: s['CLASS'],
                        gender: s['SEX'],
                        status: 'Active',
                        is_synced: 0,
                        updated_at: new Date().toISOString()
                    }));
                    await db.students.bulkPut(students);
                    addLog(`Successfully imported ${students.length} students.`, 'success');
                }

                // Process Subjects
                if (workbook.Subjects) {
                    addLog(`Processing ${workbook.Subjects.length} subject records...`, 'info');
                    const subjects = workbook.Subjects.map(s => ({
                        name: s['TITLE'],
                        class_name: s['CLASS'],
                        type: 'Core',
                        credits: 1,
                        is_synced: 0,
                        updated_at: new Date().toISOString()
                    }));
                    await db.subjects.bulkPut(subjects);
                    addLog(`Successfully imported ${subjects.length} subjects.`, 'success');
                }

                Notifications.show('Bulk import completed successfully', 'success');
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

    readExcel(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (e) => {
                try {
                    const data = new Uint8Array(e.target.result);
                    const workbook = XLSX.read(data, { type: 'array' });
                    const result = {};
                    workbook.SheetNames.forEach(sheetName => {
                        result[sheetName] = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName]);
                    });
                    resolve(result);
                } catch (err) { reject(err); }
            };
            reader.onerror = reject;
            reader.readAsArrayBuffer(file);
        });
    },

    async renderClasses() {
        const streams = await db.classes.toArray();
        const studentCounts = await db.students.toArray();
        
        const getEnrollment = (className) => studentCounts.filter(s => s.class_name === className).length;

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
                    <button class="btn" style="background: white; color: #2563eb; font-weight: 700; border-radius: 16px; padding: 1rem 2rem; display: flex; align-items: center; gap: 0.75rem; box-shadow: 0 10px 15px -3px rgba(0,0,0,0.1);">
                        <i data-lucide="plus-circle"></i> Add New Stream
                    </button>
                </div>

                <div class="actions-bar" style="background: white; padding: 1.25rem; border-radius: 20px; border: 1px solid #e2e8f0; display: flex; align-items: center; justify-content: space-between;">
                    <div style="position: relative; width: 450px;">
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
                                <div class="enrollment-stat">
                                    <div class="enroll-icon" style="width: 64px; height: 64px; background: #eff6ff; color: #2563eb; border-radius: 18px;">
                                        <i data-lucide="users" style="width: 32px; height: 32px;"></i>
                                    </div>
                                    <div class="enroll-info">
                                        <span class="count" style="font-size: 2rem;">${getEnrollment(s.name)}</span>
                                        <span class="label">Current Population</span>
                                    </div>
                                </div>
                                <div class="stream-meta" style="margin-bottom: 2rem;">
                                    <span class="level-tag" style="background: #ecfdf5; color: #059669; padding: 6px 12px; border-radius: 10px; font-weight: 600;">
                                        <i data-lucide="shield-check" style="width: 16px;"></i> ${s.level} Level
                                    </span>
                                    <span class="status-tag" style="display: flex; align-items: center; gap: 0.5rem; color: #10b981; font-weight: 700;">
                                        <span style="width: 8px; height: 8px; background: #10b981; border-radius: 50%;"></span> ONLINE
                                    </span>
                                </div>
                                <div style="display: flex; gap: 1rem;">
                                    <button class="btn btn-secondary w-full" style="height: 48px; border-radius: 12px; font-weight: 600; background: #f8fafc;"><i data-lucide="edit-3"></i> Configure</button>
                                    <button class="btn btn-secondary" style="height: 48px; border-radius: 12px; color: #ef4444; background: #fef2f2; border: none;"><i data-lucide="trash-2"></i></button>
                                </div>
                            </div>
                        </div>
                    `).join('')}
                </div>
            </div>
        `;
        if (typeof lucide !== 'undefined') lucide.createIcons();
    },

    async renderSubjects() {
        const subjects = await db.subjects.toArray();
        
        this.contentArea.innerHTML = `
            <div class="view-container">
                <div class="page-banner" style="background: linear-gradient(135deg, #0f172a 0%, #1e293b 100%);">
                    <div class="banner-content">
                        <h1 class="banner-title"><i data-lucide="book-open"></i> Subject Registry</h1>
                        <p class="banner-subtitle">Manage courses, credit units, and instructional assignments across all school levels.</p>
                    </div>
                    <div class="banner-stats">
                        <div class="banner-stat-item">
                            <span class="stat-value">${subjects.length}</span>
                            <span class="stat-label">Total Courses</span>
                        </div>
                        <div class="banner-stat-item">
                            <span class="stat-value">${subjects.filter(s => s.type === 'Core').length}</span>
                            <span class="stat-label">Core Modules</span>
                        </div>
                    </div>
                    <div style="display: flex; gap: 1rem;">
                        <button class="btn btn-secondary" style="border-radius: 16px; padding: 1rem 2rem; display: flex; align-items: center; gap: 0.75rem; background: rgba(255,255,255,0.05); color: white; border-color: rgba(255,255,255,0.1);">
                            <i data-lucide="database"></i> Consolidate
                        </button>
                        <button class="btn" style="background: white; color: #0f172a; border: none; border-radius: 16px; padding: 1rem 2rem; display: flex; align-items: center; gap: 0.75rem; font-weight: 700;">
                            <i data-lucide="plus-circle"></i> Register Course
                        </button>
                    </div>
                </div>

                <div class="actions-bar" style="background: white; padding: 1.25rem; border-radius: 20px; border: 1px solid #e2e8f0; display: flex; align-items: center; justify-content: space-between;">
                    <div style="position: relative; width: 500px;">
                        <i data-lucide="search" style="position: absolute; left: 1.5rem; top: 50%; transform: translateY(-50%); color: #94a3b8; width: 22px;"></i>
                        <input type="text" placeholder="Search courses, faculty, or stream codes..." class="input" style="padding-left: 4rem; border-radius: 16px; border: 1px solid #f1f5f9; background: #f8fafc; height: 56px; font-size: 1.05rem;">
                    </div>
                </div>

                <div class="table-container card" style="padding: 0; border-radius: 24px; overflow: hidden; border: 1px solid #e2e8f0; box-shadow: 0 10px 15px -3px rgba(0,0,0,0.05);">
                    <table class="data-table">
                        <thead style="background: #f8fafc; border-bottom: 2px solid #f1f5f9;">
                            <tr>
                                <th style="padding: 1.5rem 2rem; color: #64748b; font-weight: 800; text-transform: uppercase; letter-spacing: 0.05em; font-size: 0.75rem;">COURSE TITLE</th>
                                <th style="color: #64748b; font-weight: 800; text-transform: uppercase; letter-spacing: 0.05em; font-size: 0.75rem;">LEVELS & STREAMS</th>
                                <th style="color: #64748b; font-weight: 800; text-transform: uppercase; letter-spacing: 0.05em; font-size: 0.75rem;">FACULTY ASSIGNED</th>
                                <th style="color: #64748b; font-weight: 800; text-transform: uppercase; letter-spacing: 0.05em; font-size: 0.75rem;">UNITS</th>
                                <th style="color: #64748b; font-weight: 800; text-transform: uppercase; letter-spacing: 0.05em; font-size: 0.75rem;">CATEGORY</th>
                                <th style="color: #64748b; font-weight: 800; text-transform: uppercase; letter-spacing: 0.05em; font-size: 0.75rem; text-align: right; padding-right: 2rem;">ACTIONS</th>
                            </tr>
                        </thead>
                        <tbody style="background: white;">
                            ${subjects.length === 0 ? `<tr><td colspan="6" class="text-center p-4 text-slate-400">No courses registered yet.</td></tr>` : subjects.map(s => `
                                <tr style="border-bottom: 1px solid #f1f5f9; transition: background 0.2s;">
                                    <td style="padding: 1.5rem 2rem; font-weight: 700; color: #1e293b;">
                                        <div style="display: flex; align-items: center; gap: 1.25rem;">
                                            <div style="width: 44px; height: 44px; background: #fff7ed; border-radius: 12px; display: flex; align-items: center; justify-content: center; color: #f97316;">
                                                <i data-lucide="book-marked" style="width: 22px;"></i>
                                            </div>
                                            <div style="display: flex; flex-direction: column;">
                                                <span>${s.name}</span>
                                                <span style="font-size: 0.75rem; color: #94a3b8; font-weight: 400;">MOD-SUB-0${Math.floor(Math.random()*900)+100}</span>
                                            </div>
                                        </div>
                                    </td>
                                    <td><span class="badge warning" style="background: #fef2f2; color: #ef4444; border: 1px solid #fee2e2; border-radius: 20px; font-size: 0.75rem; padding: 0.4rem 1rem; font-weight: 600;">Unlinked</span></td>
                                    <td>
                                        <div style="display: flex; align-items: center; gap: 0.5rem; color: #64748b; font-size: 0.9rem;">
                                            <span style="width: 10px; height: 10px; background: #cbd5e1; border-radius: 50%;"></span>
                                            Not Assigned
                                        </div>
                                    </td>
                                    <td style="font-weight: 800; color: #1e40af; font-size: 1.1rem;">${s.credits}</td>
                                    <td><span class="badge" style="background: #ffedd5; color: #9a3412; border: 1px solid #fed7aa; border-radius: 10px; font-weight: 700; font-size: 0.75rem; padding: 0.4rem 0.8rem;">Core</span></td>
                                    <td style="text-align: right; padding-right: 2rem;">
                                        <div style="display: flex; gap: 0.5rem; justify-content: flex-end;">
                                            <button class="btn btn-secondary btn-sm" style="width: 38px; height: 38px; border-radius: 10px; display: flex; align-items: center; justify-content: center; padding: 0;"><i data-lucide="edit-3" style="width: 18px;"></i></button>
                                            <button class="btn btn-secondary btn-sm" style="width: 38px; height: 38px; border-radius: 10px; display: flex; align-items: center; justify-content: center; padding: 0; color: #ef4444; background: #fef2f2; border: none;"><i data-lucide="trash-2" style="width: 18px;"></i></button>
                                        </div>
                                    </td>
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                </div>
            </div>
        `;
        if (typeof lucide !== 'undefined') lucide.createIcons();
    },

    async renderStudents() {
        const students = await db.students.toArray();
        const classes = await db.classes.toArray();
        
        this.contentArea.innerHTML = `
            <div class="view-container">
                <div class="page-banner" style="background: linear-gradient(135deg, #1e40af 0%, #1e3a8a 100%);">
                    <div class="banner-content">
                        <h1 class="banner-title"><i data-lucide="graduation-cap"></i> Student Directory</h1>
                        <p class="banner-subtitle">Comprehensive database of all registered learners, biometric profiles, and performance metrics.</p>
                    </div>
                    <div class="banner-stats">
                        <div class="banner-stat-item">
                            <span class="stat-value">${students.length}</span>
                            <span class="stat-label">Total Body</span>
                        </div>
                        <div class="banner-stat-item">
                            <span class="stat-value">${classes.length}</span>
                            <span class="stat-label">Active Classes</span>
                        </div>
                    </div>
                    <div style="display: flex; gap: 1rem;">
                        <button class="btn btn-secondary" style="border-radius: 16px; padding: 1rem 2rem; display: flex; align-items: center; gap: 0.75rem; background: rgba(255,255,255,0.1); color: white; border: none;">
                            <i data-lucide="printer"></i> Credentials
                        </button>
                        <button class="btn btn-primary" style="background: white; color: #1e3a8a; border: none; border-radius: 16px; padding: 1rem 2rem; display: flex; align-items: center; gap: 0.75rem; font-weight: 700;">
                            <i data-lucide="user-plus"></i> New Enrollment
                        </button>
                    </div>
                </div>

                <div class="directory-container" style="height: calc(100vh - 420px);">
                    <div class="directory-sidebar" style="border-radius: 28px; background: white;">
                        <div class="sidebar-search-wrap" style="padding: 2rem; background: #f8fafc; border-bottom: 2px solid #f1f5f9;">
                            <div style="position: relative; margin-bottom: 1.5rem;">
                                <i data-lucide="search" style="position: absolute; left: 1.25rem; top: 50%; transform: translateY(-50%); color: #94a3b8; width: 20px;"></i>
                                <input type="text" id="directory-search" placeholder="Search by name or serial..." class="input" style="padding-left: 3.5rem; border-radius: 14px; border: 1px solid #e2e8f0; height: 52px; background: white;">
                            </div>
                            <select id="class-filter" class="input" style="border-radius: 14px; height: 52px; border: 1px solid #e2e8f0; background: white; font-weight: 600; color: #475569;">
                                <option value="">All Academic Streams</option>
                                ${classes.map(c => `<option value="${c.name}">${c.name}</option>`).join('')}
                            </select>
                        </div>
                        <div class="sidebar-list" id="student-sidebar-list" style="padding: 1rem;">
                            ${this.generateStudentListItems(students)}
                        </div>
                    </div>

                    <div class="directory-main" id="student-detail-view" style="border-radius: 28px; background: white; border: 1px solid #e2e8f0; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.05);">
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

        if (typeof lucide !== 'undefined') lucide.createIcons();
    },

    async renderStudentDetail(studentId) {
        const student = await db.students.get(studentId);
        const detailView = document.getElementById('student-detail-view');
        if (!student || !detailView) return;

        const scores = await db.scores.where('student_id').equals(studentId).toArray();
        const avgScore = scores.length > 0 ? Math.round(scores.reduce((acc, s) => acc + (s.total || 0), 0) / scores.length) : 0;

        detailView.innerHTML = `
            <div style="padding: 3rem;">
                <div class="profile-header" style="display: flex; gap: 3rem; align-items: flex-start; margin-bottom: 3rem;">
                    <div class="profile-avatar-big" style="width: 160px; height: 160px; background: #f8fafc; border: 4px solid white; box-shadow: 0 10px 25px -5px rgba(0,0,0,0.1); border-radius: 40px; display: flex; align-items: center; justify-content: center; position: relative;">
                        <img src="https://api.dicebear.com/7.x/avataaars/svg?seed=${student.name}" style="width: 120px; height: 120px;" alt="${student.name}">
                        <div style="position: absolute; bottom: -10px; right: -10px; width: 44px; height: 44px; background: #2563eb; color: white; border-radius: 14px; display: flex; align-items: center; justify-content: center; border: 4px solid white;">
                            <i data-lucide="camera" style="width: 18px;"></i>
                        </div>
                    </div>
                    <div class="profile-title-info" style="flex: 1;">
                        <div style="display: flex; justify-content: space-between; align-items: flex-start;">
                            <div>
                                <span class="badge" style="background: #eff6ff; color: #2563eb; font-weight: 800; border-radius: 12px; padding: 0.5rem 1rem; margin-bottom: 1rem; display: inline-block;">ACADEMIC ID: ${student.student_id}</span>
                                <h1 style="font-size: 3rem; font-weight: 800; color: #1e293b; letter-spacing: -0.02em; line-height: 1.1;">${student.name}</h1>
                                <p style="font-size: 1.25rem; color: #64748b; margin-top: 0.5rem;">${student.class_name} • Junior Secondary Stream</p>
                            </div>
                            <div style="display: flex; gap: 1rem;">
                                <button class="btn btn-secondary" style="border-radius: 14px; padding: 0.75rem 1.25rem;"><i data-lucide="edit"></i> Modify</button>
                                <button class="btn btn-secondary" style="border-radius: 14px; padding: 0.75rem 1.25rem; color: #ef4444; background: #fef2f2; border: none;"><i data-lucide="trash-2"></i></button>
                            </div>
                        </div>
                    </div>
                </div>

                <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 2rem; margin-bottom: 3rem;">
                    <div style="background: #f8fafc; padding: 2rem; border-radius: 24px; border: 1px solid #f1f5f9;">
                        <span style="font-size: 0.75rem; font-weight: 800; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.1em;">Cumulative Avg</span>
                        <div style="display: flex; align-items: baseline; gap: 0.75rem; margin-top: 0.5rem;">
                            <span style="font-size: 2.5rem; font-weight: 800; color: #1e293b;">${avgScore}%</span>
                            <span style="color: #10b981; font-weight: 700; font-size: 0.9rem;">+2.4%</span>
                        </div>
                    </div>
                    <div style="background: #f8fafc; padding: 2rem; border-radius: 24px; border: 1px solid #f1f5f9;">
                        <span style="font-size: 0.75rem; font-weight: 800; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.1em;">Attendance Rate</span>
                        <div style="display: flex; align-items: baseline; gap: 0.75rem; margin-top: 0.5rem;">
                            <span style="font-size: 2.5rem; font-weight: 800; color: #1e293b;">94%</span>
                            <span style="color: #ef4444; font-weight: 700; font-size: 0.9rem;">-0.5%</span>
                        </div>
                    </div>
                    <div style="background: #f8fafc; padding: 2rem; border-radius: 24px; border: 1px solid #f1f5f9;">
                        <span style="font-size: 0.75rem; font-weight: 800; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.1em;">Active Subjects</span>
                        <div style="display: flex; align-items: baseline; gap: 0.75rem; margin-top: 0.5rem;">
                            <span style="font-size: 2.5rem; font-weight: 800; color: #1e293b;">${scores.length}</span>
                            <span style="color: #64748b; font-weight: 700; font-size: 0.9rem;">Assigned</span>
                        </div>
                    </div>
                </div>

                <div class="profile-tabs" style="border-bottom: 2px solid #f1f5f9; display: flex; gap: 3rem; margin-bottom: 2rem;">
                    <button style="background: none; border: none; border-bottom: 2px solid #2563eb; padding: 1rem 0; font-weight: 800; color: #1e293b; cursor: pointer;">General Profile</button>
                    <button style="background: none; border: none; padding: 1rem 0; font-weight: 600; color: #64748b; cursor: pointer;">Academic Records</button>
                    <button style="background: none; border: none; padding: 1rem 0; font-weight: 600; color: #64748b; cursor: pointer;">Attendance Logs</button>
                </div>

                <div class="info-grid" style="display: grid; grid-template-columns: 1fr 1fr; gap: 3rem;">
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
                                <span style="color: #94a3b8; font-weight: 600;">Serial No</span>
                                <span style="font-weight: 700; color: #475569;">${student.serial_no || 'N/A'}</span>
                            </div>
                            <div style="display: flex; justify-content: space-between; padding-bottom: 0.75rem; border-bottom: 1px solid #f8fafc;">
                                <span style="color: #94a3b8; font-weight: 600;">Admission Date</span>
                                <span style="font-weight: 700; color: #475569;">Sept 12, 2023</span>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `;
        if (typeof lucide !== 'undefined') lucide.createIcons();
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

    async renderAcademic() {
        const classes = await db.classes.toArray();
        const subjects = await db.subjects.toArray();
        const assignments = await db.subject_assignments.toArray();
        
        this.contentArea.innerHTML = `
            <div class="tabs mb-2">
                <button class="tab-btn active" data-tab="classes">Classes</button>
                <button class="tab-btn" data-tab="subjects">Subjects</button>
                <button class="tab-btn" data-tab="assignments">Assignments</button>
            </div>
            
            <div id="tab-content">
                <!-- Tab content will be rendered here -->
            </div>
        `;

        const renderTab = async (tab) => {
            const container = document.getElementById('tab-content');
            document.querySelectorAll('.tab-btn').forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
            
            if (tab === 'classes') {
                const list = await db.classes.toArray();
                container.innerHTML = `
                    <div class="actions-bar mb-2">
                        <button id="add-class-btn" class="btn btn-primary">Add Class</button>
                    </div>
                    <div class="table-container card">
                        <table class="data-table">
                            <thead><tr><th>Name</th><th>Level</th><th>Action</th></tr></thead>
                            <tbody>
                                ${list.map(c => `<tr><td>${c.name}</td><td>${c.level}</td><td><button class="btn btn-secondary btn-sm delete-class" data-id="${c.id}">Delete</button></td></tr>`).join('')}
                            </tbody>
                        </table>
                    </div>
                `;
            } else if (tab === 'subjects') {
                const list = await db.subjects.toArray();
                container.innerHTML = `
                    <div class="actions-bar mb-2">
                        <button id="add-subject-btn" class="btn btn-primary">Add Subject</button>
                    </div>
                    <div class="table-container card">
                        <table class="data-table">
                            <thead><tr><th>Name</th><th>Type</th><th>Credits</th></tr></thead>
                            <tbody>
                                ${list.map(s => `<tr><td>${s.name}</td><td>${s.type}</td><td>${s.credits}</td></tr>`).join('')}
                            </tbody>
                        </table>
                    </div>
                `;
            } else if (tab === 'assignments') {
                container.innerHTML = `
                    <div class="actions-bar mb-2">
                        <button id="add-assignment-btn" class="btn btn-primary">Assign Teacher</button>
                    </div>
                    <div class="table-container card">
                        <table class="data-table">
                            <thead><tr><th>Teacher</th><th>Subject</th><th>Class</th></tr></thead>
                            <tbody id="assignments-list">
                                <!-- Assignments listed here -->
                            </tbody>
                        </table>
                    </div>
                `;
            }
            if (typeof lucide !== 'undefined') {
                lucide.createIcons();
            }
        };

        document.querySelectorAll('.tab-btn').forEach(btn => {
            btn.addEventListener('click', () => renderTab(btn.dataset.tab));
        });

        renderTab('classes');
    },

    async renderGrades() {
        const role = this.currentUser.role;
        let students = await db.students.toArray();
        let subjects = await db.subjects.toArray();
        
        // Filter based on "Subject Teacher Rights"
        if (role === 'Teacher') {
            const assignments = await db.subject_assignments.toArray(); // In reality, filter by teacher_id
            // For demo: restrict to first subject found if any
            if (assignments.length > 0) {
                subjects = subjects.filter(s => assignments.some(a => a.subject_id === s.id));
            }
        }

        this.contentArea.innerHTML = `
            <div class="actions-bar mb-2">
                <select id="subject-filter" class="input">
                    <option value="">Select Subject</option>
                    ${subjects.map(s => `<option value="${s.id}">${s.name}</option>`).join('')}
                </select>
                <select id="term-filter" class="input">
                    <option value="First Term">First Term</option>
                    <option value="Second Term">Second Term</option>
                    <option value="Third Term">Third Term</option>
                </select>
            </div>
            
            <div class="table-container card">
                <table class="data-table">
                    <thead>
                        <tr>
                            <th>Student ID</th>
                            <th>Name</th>
                            <th>CA1 (20)</th>
                            <th>CA2 (20)</th>
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
                                <td><input type="number" class="input score-input" data-field="ca1" max="20" min="0"></td>
                                <td><input type="number" class="input score-input" data-field="ca2" max="20" min="0"></td>
                                <td><input type="number" class="input score-input" data-field="exam" max="60" min="0"></td>
                                <td class="total-cell">0</td>
                                <td class="grade-cell">-</td>
                                <td><button class="btn btn-primary save-score">Save</button></td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            </div>
        `;

        // Real-time calculation listeners
        const inputs = document.querySelectorAll('.score-input');
        inputs.forEach(input => {
            input.addEventListener('input', (e) => {
                const row = e.target.closest('tr');
                const ca1 = row.querySelector('[data-field="ca1"]').value;
                const ca2 = row.querySelector('[data-field="ca2"]').value;
                const exam = row.querySelector('[data-field="exam"]').value;
                
                const result = ScoringEngine.processScore(ca1, ca2, exam);
                row.querySelector('.total-cell').textContent = result.total;
                row.querySelector('.grade-cell').textContent = result.grade;
            });
        });

        // Save individual score
        const saveBtns = document.querySelectorAll('.save-score');
        saveBtns.forEach(btn => {
            btn.addEventListener('click', async (e) => {
                const row = e.target.closest('tr');
                const studentId = row.getAttribute('data-student-id');
                const subjectId = document.getElementById('subject-filter').value;
                
                if (!subjectId) {
                    Notifications.show('Please select a subject first', 'error');
                    return;
                }

                const ca1 = row.querySelector('[data-field="ca1"]').value;
                const ca2 = row.querySelector('[data-field="ca2"]').value;
                const exam = row.querySelector('[data-field="exam"]').value;
                
                const scoreData = {
                    id: `${studentId}_${subjectId}_${new Date().getFullYear()}`,
                    student_id: studentId,
                    subject_id: subjectId,
                    ca1: parseFloat(ca1) || 0,
                    ca2: parseFloat(ca2) || 0,
                    exam: parseFloat(exam) || 0,
                    ...ScoringEngine.processScore(ca1, ca2, exam),
                    term: document.getElementById('term-filter').value,
                    session: new Date().getFullYear().toString(),
                    is_synced: 0,
                    updated_at: new Date().toISOString()
                };

                await db.scores.put(scoreData);
                Notifications.show(`Score saved for ${studentId}`, 'success');
            });
        });
    },

    async renderAttendance() {
        const role = this.currentUser.role;
        let students = await db.students.toArray();
        const today = new Date().toISOString().split('T')[0];

        // Filter based on "Form Master Rights"
        if (role === 'Teacher') {
            const formClasses = await db.form_teachers.toArray(); // In reality, filter by teacher_id
            if (formClasses.length > 0) {
                students = students.filter(s => formClasses.some(f => f.class_name === s.class_name));
            }
        }
        
        this.contentArea.innerHTML = `
            <div class="actions-bar mb-2">
                <input type="date" id="attendance-date" class="input" value="${today}">
                <button id="save-attendance" class="btn btn-success">Save All</button>
            </div>
            
            <div class="table-container card">
                <table class="data-table">
                    <thead>
                        <tr>
                            <th>Student ID</th>
                            <th>Name</th>
                            <th>Class</th>
                            <th>Status</th>
                        </tr>
                    </thead>
                    <tbody id="attendance-body">
                        ${students.map(s => `
                            <tr data-student-id="${s.student_id}">
                                <td>${s.student_id}</td>
                                <td>${s.name}</td>
                                <td>${s.class_name}</td>
                                <td>
                                    <div class="attendance-options">
                                        <label class="radio-label">
                                            <input type="radio" name="status-${s.student_id}" value="Present" checked> Present
                                        </label>
                                        <label class="radio-label">
                                            <input type="radio" name="status-${s.student_id}" value="Absent"> Absent
                                        </label>
                                        <label class="radio-label">
                                            <input type="radio" name="status-${s.student_id}" value="Late"> Late
                                        </label>
                                    </div>
                                </td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            </div>
        `;

        document.getElementById('save-attendance').addEventListener('click', async () => {
            const date = document.getElementById('attendance-date').value;
            const rows = document.querySelectorAll('#attendance-body tr');
            
            for (const row of rows) {
                const studentId = row.getAttribute('data-student-id');
                const status = row.querySelector(`input[name="status-${studentId}"]:checked`).value;
                
                const attendanceData = {
                    id: `${studentId}_${date}`,
                    student_id: studentId,
                    date: date,
                    status: status,
                    is_synced: 0,
                    updated_at: new Date().toISOString()
                };
                
                await db.attendance.put(attendanceData);
            }
            
            Notifications.show(`Attendance saved for ${date}`, 'success');
        });
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
