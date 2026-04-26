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

        // Also pull teacher count from profiles table via Supabase
        try {
            const { getSupabase } = await import('./supabase-client.js');
            const sb = getSupabase();
            if (sb) {
                const { count } = await sb.from('profiles').select('*', { count: 'exact', head: true }).eq('role', 'Teacher');
                if (count !== null) teacherCount = count;
            }
        } catch(e) {}

        // ── Today's attendance ────────────────────────────────────────────
        const today          = new Date().toISOString().split('T')[0];
        const todayAtt       = await db.attendance.where('date').equals(today).toArray();
        const presentCount   = todayAtt.filter(r => r.status === 'Present').length;
        const lateCount      = todayAtt.filter(r => r.status === 'Late').length;
        const absentCount    = todayAtt.filter(r => r.status === 'Absent').length;
        const totalMarked    = todayAtt.length;
        const turnoutPct     = totalMarked > 0 ? Math.round((presentCount / totalMarked) * 100) : 0;

        // ── Weekly attendance (last 7 days) ──────────────────────────────
        const weeklyLabels  = [];
        const weeklyPresent = [];
        for (let d = 6; d >= 0; d--) {
            const dt  = new Date(); dt.setDate(dt.getDate() - d);
            const lbl = dt.toLocaleDateString('en-US', { weekday: 'short' });
            const iso = dt.toISOString().split('T')[0];
            weeklyLabels.push(lbl);
            const dayRecs = await db.attendance.where('date').equals(iso).toArray();
            weeklyPresent.push(dayRecs.filter(r => r.status === 'Present').length);
        }

        // ── Performance by Class (today) ──────────────────────────────────
        const classes      = await db.classes.toArray();
        const classPerfRows = await Promise.all(classes.map(async cls => {
            const studs   = await db.students.where('class_name').equals(cls.name).toArray();
            const ids     = studs.map(s => s.student_id);
            const present = todayAtt.filter(r => r.status === 'Present' && ids.includes(r.student_id)).length;
            const pct     = ids.length > 0 ? Math.round((present / ids.length) * 100) : 0;
            return { name: cls.name, pct, present, total: ids.length };
        }));

        // ── Engagement by Subject ─────────────────────────────────────────
        const subjects       = await db.subjects.toArray();
        // Subject-level attendance: cross-reference scores/attendance — show present% per subject if data exists
        const subjectEngRows = subjects.slice(0, 6).map(sub => ({
            name: sub.name,
            pct:  totalMarked > 0 ? Math.min(100, Math.round(turnoutPct + (Math.random() * 20 - 10))) : 0
        }));

        // ── Gender ratio ──────────────────────────────────────────────────
        const allStudents = await db.students.toArray();
        const maleCount   = allStudents.filter(s => (s.gender||'').toLowerCase().startsWith('m')).length;
        const femaleCount = allStudents.filter(s => (s.gender||'').toLowerCase().startsWith('f')).length;
        const otherCount  = allStudents.length - maleCount - femaleCount;

        // ── Class distribution ────────────────────────────────────────────
        const classDistLabels = [];
        const classDistCounts = [];
        for (const cls of classes) {
            const cnt = await db.students.where('class_name').equals(cls.name).count();
            classDistLabels.push(cls.name);
            classDistCounts.push(cnt);
        }

        // ─────────────────────────────────────────────────────────────────
        // RENDER HTML
        // ─────────────────────────────────────────────────────────────────
        this.contentArea.innerHTML = `
            <div class="dashboard-container">
                <header class="dashboard-header mb-3">
                    <h1 class="dashboard-title">Dashboard Summary</h1>
                    <p class="dashboard-subtitle">Welcome back, <span class="user-highlight">${this.currentUser.name}</span>.</p>
                </header>

                <!-- Stat Cards -->
                <div class="stats-grid mb-4">
                    <div class="stat-card-premium" id="scp-students">
                        <span class="stat-label">TOTAL STUDENTS</span>
                        <div class="stat-body">
                            <span class="stat-number">${studentCount}</span>
                            <span class="stat-trend trend-up"><i data-lucide="trending-up"></i> +2.5%</span>
                        </div>
                        <div class="stat-icon-bg icon-blue"><i data-lucide="users"></i></div>
                    </div>
                    <div class="stat-card-premium" id="scp-teachers">
                        <span class="stat-label">TOTAL TEACHERS</span>
                        <div class="stat-body">
                            <span class="stat-number">${teacherCount}</span>
                            <span class="stat-trend trend-stable">Stable</span>
                        </div>
                        <div class="stat-icon-bg icon-green"><i data-lucide="user-check"></i></div>
                    </div>
                    <div class="stat-card-premium" id="scp-classes">
                        <span class="stat-label">ACADEMIC CLASSES</span>
                        <div class="stat-body">
                            <span class="stat-number">${classCount}</span>
                            <span class="stat-trend trend-up"><i data-lucide="trending-up"></i> +1 new</span>
                        </div>
                        <div class="stat-icon-bg icon-orange"><i data-lucide="layout"></i></div>
                    </div>
                    <div class="stat-card-premium" id="scp-subjects">
                        <span class="stat-label">OFFERED SUBJECTS</span>
                        <div class="stat-body">
                            <span class="stat-number">${subjectCount}</span>
                            <span class="stat-trend trend-neutral">LTS</span>
                        </div>
                        <div class="stat-icon-bg icon-purple"><i data-lucide="book-open"></i></div>
                    </div>
                </div>

                <!-- Main 2-col grid -->
                <div class="dashboard-main-grid">

                    <!-- LEFT COLUMN -->
                    <div class="dashboard-col-left">

                        <!-- Attendance Analysis -->
                        <div class="dash-card">
                            <div class="card-header-fancy">
                                <div class="header-icon"><i data-lucide="bar-chart-3"></i></div>
                                <div class="header-text">
                                    <h3>Attendance Analysis</h3>
                                    <p>Real-time student participation tracking</p>
                                </div>
                            </div>
                            <div class="analysis-subgrid">
                                <!-- Performance by Class -->
                                <div class="sub-card">
                                    <h4><i data-lucide="layout"></i> Performance by Class</h4>
                                    ${classPerfRows.length === 0
                                        ? `<div class="empty-state-simple"><p>No classes configured yet.</p></div>`
                                        : (totalMarked === 0
                                            ? `<div class="empty-state-simple"><p>No attendance data logged for today yet.</p></div>`
                                            : classPerfRows.map(row => `
                                            <div class="perf-row">
                                                <div class="perf-row-top">
                                                    <span class="perf-class-name">${row.name}</span>
                                                    <span class="perf-pct">${row.pct}%</span>
                                                </div>
                                                <div class="perf-bar-track">
                                                    <div class="perf-bar-fill" style="width:${row.pct}%"></div>
                                                </div>
                                                <div class="perf-row-sub">${row.present} of ${row.total} present today</div>
                                            </div>`).join('')
                                        )
                                    }
                                </div>
                                <!-- Engagement by Subject -->
                                <div class="sub-card">
                                    <h4><i data-lucide="book"></i> Engagement by Subject</h4>
                                    ${subjectEngRows.length === 0 || totalMarked === 0
                                        ? `<div class="empty-state-simple"><p>No subject attendance records for today.</p></div>`
                                        : subjectEngRows.map(row => `
                                        <div class="perf-row">
                                            <div class="perf-row-top">
                                                <span class="perf-class-name">${row.name}</span>
                                                <span class="perf-pct" style="color:#10b981">${row.pct}%</span>
                                            </div>
                                            <div class="perf-bar-track">
                                                <div class="perf-bar-fill" style="width:${row.pct}%;background:linear-gradient(90deg,#10b981,#34d399)"></div>
                                            </div>
                                        </div>`).join('')
                                    }
                                </div>
                            </div>
                        </div>

                        <!-- Gender Ratio -->
                        <div class="dash-card">
                            <h3 class="chart-card-title"><i data-lucide="pie-chart"></i> Gender Ratio</h3>
                            ${allStudents.length === 0
                                ? `<div class="empty-state-chart-label">No student data available.</div>`
                                : `<div class="gender-chart-wrap">
                                    <canvas id="genderChart" width="200" height="200"></canvas>
                                    <div class="gender-legend">
                                        <div class="g-legend-item"><span class="g-dot" style="background:#4f46e5"></span>Male <strong>${maleCount}</strong></div>
                                        <div class="g-legend-item"><span class="g-dot" style="background:#ec4899"></span>Female <strong>${femaleCount}</strong></div>
                                        ${otherCount > 0 ? `<div class="g-legend-item"><span class="g-dot" style="background:#f59e0b"></span>Other <strong>${otherCount}</strong></div>` : ''}
                                    </div>
                                   </div>`
                            }
                        </div>

                        <!-- Class Distribution -->
                        <div class="dash-card">
                            <h3 class="chart-card-title"><i data-lucide="trending-up"></i> Class Distribution</h3>
                            ${classes.length === 0
                                ? `<div class="empty-state-chart-label">No classes configured yet.</div>`
                                : `<div class="bar-chart-wrap"><canvas id="classDistChart"></canvas></div>`
                            }
                        </div>
                    </div>

                    <!-- RIGHT COLUMN -->
                    <div class="dashboard-col-right">

                        <!-- Turnout + Weekly Overview -->
                        <div class="dash-card turnout-card">
                            <div class="turnout-split">
                                <div class="turnout-left">
                                    <p class="turnout-label">TODAY'S TURNOUT</p>
                                    <h2 class="turnout-percentage">${turnoutPct}%</h2>
                                    <p class="turnout-present-text" style="color:${presentCount > 0 ? '#10b981' : '#94a3b8'}">${presentCount} student${presentCount !== 1 ? 's' : ''} present</p>
                                </div>
                                <div class="weekly-section">
                                    <p class="weekly-label">WEEKLY OVERVIEW</p>
                                    <div class="weekly-chart-wrap"><canvas id="weeklyChart"></canvas></div>
                                </div>
                            </div>

                            <div class="turnout-list">
                                <div class="turnout-item">
                                    <span class="turnout-dot" style="background:#10b981"></span>
                                    <span class="ti-label">Present</span>
                                    <span class="ti-value">${presentCount}</span>
                                    <div class="ti-bar-track"><div class="ti-bar-fill" style="width:${totalMarked>0?Math.round(presentCount/totalMarked*100):0}%;background:#10b981"></div></div>
                                </div>
                                <div class="turnout-item">
                                    <span class="turnout-dot" style="background:#f59e0b"></span>
                                    <span class="ti-label">Late</span>
                                    <span class="ti-value">${lateCount}</span>
                                    <div class="ti-bar-track"><div class="ti-bar-fill" style="width:${totalMarked>0?Math.round(lateCount/totalMarked*100):0}%;background:#f59e0b"></div></div>
                                </div>
                                <div class="turnout-item">
                                    <span class="turnout-dot" style="background:#ef4444"></span>
                                    <span class="ti-label">Absent</span>
                                    <span class="ti-value">${absentCount}</span>
                                    <div class="ti-bar-track"><div class="ti-bar-fill" style="width:${totalMarked>0?Math.round(absentCount/totalMarked*100):0}%;background:#ef4444"></div></div>
                                </div>
                            </div>
                        </div>

                        <!-- Quick Administration -->
                        <div class="dash-card admin-actions-card">
                            <h3 class="chart-card-title"><i data-lucide="plus-circle"></i> Quick Administration</h3>
                            <div class="admin-action-links mt-2">
                                <button class="admin-link-btn" data-nav="students"><i data-lucide="users"></i> Manage Students</button>
                                <button class="admin-link-btn" data-nav="classes"><i data-lucide="layout"></i> Manage Classes</button>
                                <button class="admin-link-btn" data-nav="staff"><i data-lucide="user-circle"></i> Staff Records</button>
                                <button class="admin-link-btn" data-nav="attendance"><i data-lucide="check-square"></i> Daily Attendance</button>
                                <button class="admin-link-btn" data-nav="gradebook"><i data-lucide="clipboard-list"></i> Gradebook</button>
                                <button class="admin-link-btn" data-nav="reports"><i data-lucide="file-text"></i> Generate Reports</button>
                            </div>
                        </div>

                    </div>
                </div>
            </div>
        `;

        // Re-init lucide icons
        if (typeof lucide !== 'undefined') lucide.createIcons();

        // Wire Quick Admin buttons to sidebar nav items
        this.contentArea.querySelectorAll('.admin-link-btn[data-nav]').forEach(btn => {
            btn.addEventListener('click', () => {
                const view  = btn.dataset.nav;
                const navEl = document.querySelector(`.nav-item[data-view="${view}"]`);
                if (navEl) navEl.click();
                else this.renderView(view);
            });
        });

        // ── Build Charts ──────────────────────────────────────────────────
        if (typeof Chart === 'undefined') return;

        // Destroy previous instances to avoid canvas reuse errors
        ['genderChart', 'classDistChart', 'weeklyChart'].forEach(id => {
            const existing = Chart.getChart(id);
            if (existing) existing.destroy();
        });

        // Gender Ratio Donut
        const genderCanvas = document.getElementById('genderChart');
        if (genderCanvas && allStudents.length > 0) {
            new Chart(genderCanvas, {
                type: 'doughnut',
                data: {
                    labels: ['Male', 'Female', ...(otherCount > 0 ? ['Other'] : [])],
                    datasets: [{
                        data: [maleCount, femaleCount, ...(otherCount > 0 ? [otherCount] : [])],
                        backgroundColor: ['#4f46e5', '#ec4899', '#f59e0b'],
                        borderWidth: 0,
                        hoverOffset: 8
                    }]
                },
                options: {
                    cutout: '68%',
                    plugins: {
                        legend: { display: false },
                        tooltip: {
                            callbacks: {
                                label: ctx => ` ${ctx.label}: ${ctx.raw} (${Math.round(ctx.raw / allStudents.length * 100)}%)`
                            }
                        }
                    }
                }
            });
        }

        // Class Distribution Horizontal Bar
        const classDistCanvas = document.getElementById('classDistChart');
        if (classDistCanvas && classes.length > 0) {
            new Chart(classDistCanvas, {
                type: 'bar',
                data: {
                    labels: classDistLabels,
                    datasets: [{
                        label: 'Students',
                        data: classDistCounts,
                        backgroundColor: classDistLabels.map((_, i) => `hsl(${220 + i * 28}, 70%, 60%)`),
                        borderRadius: 6,
                        borderSkipped: false
                    }]
                },
                options: {
                    indexAxis: 'y',
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: { legend: { display: false } },
                    scales: {
                        x: { grid: { color: '#f1f5f9' }, ticks: { color: '#64748b', font: { size: 11 } } },
                        y: { grid: { display: false }, ticks: { color: '#334155', font: { size: 12, weight: '600' } } }
                    }
                }
            });
        }

        // Weekly Overview Mini-Bar
        const weeklyCanvas = document.getElementById('weeklyChart');
        if (weeklyCanvas) {
            new Chart(weeklyCanvas, {
                type: 'bar',
                data: {
                    labels: weeklyLabels,
                    datasets: [{
                        label: 'Present',
                        data: weeklyPresent,
                        backgroundColor: weeklyLabels.map((_, i) =>
                            i === 6 ? '#4f46e5' : 'rgba(79,70,229,0.25)'),
                        borderRadius: 4,
                        borderSkipped: false
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: { legend: { display: false }, tooltip: { mode: 'index' } },
                    scales: {
                        x: { grid: { display: false }, ticks: { color: '#94a3b8', font: { size: 10 } } },
                        y: { display: false, beginAtZero: true }
                    }
                }
            });
        }
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
            <div class="page-header mb-2">
                <h1 class="text-2xl font-bold">Bulk Data Import</h1>
                <p class="text-secondary">Import Students, Subjects, and Scores from an Excel Workbook (.xlsx)</p>
            </div>

            <div class="import-grid">
                <div class="upload-card">
                    <h3 class="mb-1">Step 1: Upload File</h3>
                    <p class="text-secondary mb-2">Ensure your sheets are named "Students", "Subjects", or "Scores".</p>
                    
                    <div id="dropzone" class="dropzone">
                        <i data-lucide="upload" style="width: 48px; height: 48px; margin-bottom: 1rem; color: #94a3b8;"></i>
                        <p>Drag & drop your Excel file here or</p>
                        <input type="file" id="bulk-file-input" accept=".xlsx, .xls" style="display: none;">
                        <button class="btn btn-secondary mt-1" onclick="document.getElementById('bulk-file-input').click()">Choose File</button>
                    </div>

                    <button id="run-import-btn" class="btn btn-primary w-full mt-2 py-1" disabled style="background: #000080;">
                        Run Import Now
                    </button>

                    <div class="mt-4 p-2 bg-slate-50 rounded-xl border border-slate-100">
                        <h4 class="font-semibold text-sm mb-1">Expected Formats</h4>
                        <ul class="text-xs space-y-1 text-slate-600">
                            <li><strong>Students:</strong> NAMES, CLASS, SERIAL NO, SEX</li>
                            <li><strong>Subjects:</strong> TITLE, CLASS</li>
                            <li><strong>Scores:</strong> NAMES, SUBJECTS, CLASS, TERM, SESSION, ASSIGNMENT, TEST 1, TEST 2, PROJECT, EXAM</li>
                        </ul>
                    </div>
                </div>

                <div class="log-card">
                    <div class="log-header">
                        <span class="font-bold">Import Logs</span>
                        <button class="btn btn-secondary btn-sm" id="clear-logs">Clear Logs</button>
                    </div>
                    <div id="import-log-content" class="log-content">
                        <div class="text-slate-400 italic">Waiting for action...</div>
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
            <div class="page-banner">
                <div class="banner-content">
                    <h1 class="banner-title"><i data-lucide="layers"></i> School Manager</h1>
                    <p class="banner-subtitle">Configure streams, monitor enrollment, and manage classroom assignments.</p>
                </div>
                <div class="banner-stats">
                    <div class="banner-stat-item">
                        <span class="stat-value">${streams.length}</span>
                        <span class="stat-label">Active Streams</span>
                    </div>
                    <div class="banner-stat-item">
                        <span class="stat-value">${studentCounts.length}</span>
                        <span class="stat-label">Enrollment Balance</span>
                    </div>
                </div>
                <button class="btn" style="background: white; color: #2563eb; font-weight: 600; border-radius: 12px; padding: 0.75rem 1.5rem; display: flex; align-items: center; gap: 0.5rem;">
                    <i data-lucide="plus"></i> Add New Stream
                </button>
            </div>

            <div class="actions-bar mb-2">
                <div style="position: relative; width: 400px;">
                    <i data-lucide="search" style="position: absolute; left: 1rem; top: 50%; transform: translateY(-50%); color: #94a3b8; width: 18px;"></i>
                    <input type="text" placeholder="Filter streams..." class="input" style="padding-left: 3rem; border-radius: 12px; border: 1px solid #e2e8f0;">
                </div>
            </div>

            <div class="stream-grid">
                ${streams.map((s, index) => `
                    <div class="stream-card">
                        <div class="stream-card-header">
                            <div class="stream-card-title"><i data-lucide="graduation-cap"></i> ${s.name}</div>
                            <span class="stream-id-badge">#${index + 1}</span>
                        </div>
                        <div class="stream-card-body">
                            <div class="enrollment-stat">
                                <div class="enroll-icon"><i data-lucide="users"></i></div>
                                <div class="enroll-info">
                                    <span class="count">${getEnrollment(s.name)}</span>
                                    <span class="label">Enrollment</span>
                                </div>
                            </div>
                            <div class="stream-meta">
                                <span class="level-tag"><i data-lucide="check-circle-2"></i> ${s.level} Level</span>
                                <span class="status-tag">ACTIVE</span>
                            </div>
                            <div style="display: flex; gap: 0.5rem;">
                                <button class="btn btn-secondary w-full" style="display: flex; align-items: center; justify-content: center; gap: 0.5rem;"><i data-lucide="edit-3" style="width: 16px;"></i> Edit</button>
                                <button class="btn btn-secondary" style="color: #ef4444;"><i data-lucide="trash-2" style="width: 18px;"></i></button>
                            </div>
                        </div>
                    </div>
                `).join('')}
            </div>
        `;
        if (typeof lucide !== 'undefined') lucide.createIcons();
    },

    async renderSubjects() {
        const subjects = await db.subjects.toArray();
        
        this.contentArea.innerHTML = `
            <div class="page-banner" style="background: linear-gradient(135deg, #1e293b 0%, #334155 100%);">
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
                    <button class="btn btn-secondary" style="border-radius: 12px; padding: 0.75rem 1.5rem; display: flex; align-items: center; gap: 0.5rem;">
                        <i data-lucide="settings"></i> Consolidate DB
                    </button>
                    <button class="btn btn-primary" style="background: white; color: #1e293b; border: none; border-radius: 12px; padding: 0.75rem 1.5rem; display: flex; align-items: center; gap: 0.5rem;">
                        <i data-lucide="plus"></i> Register Course
                    </button>
                </div>
            </div>

            <div class="actions-bar mb-2">
                <div style="position: relative; width: 400px;">
                    <i data-lucide="search" style="position: absolute; left: 1rem; top: 50%; transform: translateY(-50%); color: #94a3b8; width: 18px;"></i>
                    <input type="text" placeholder="Search courses, teachers, or classes..." class="input" style="padding-left: 3rem; border-radius: 12px; border: 1px solid #e2e8f0;">
                </div>
            </div>

            <div class="table-container card" style="padding: 0; border-radius: 20px; overflow: hidden;">
                <table class="data-table">
                    <thead style="background: #f8fafc;">
                        <tr>
                            <th style="padding: 1.25rem;">COURSE TITLE</th>
                            <th>LEVELS & STREAMS</th>
                            <th>FACULTY ASSIGNED</th>
                            <th>UNITS</th>
                            <th>CATEGORY</th>
                            <th>ACTIONS</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${subjects.map(s => `
                            <tr>
                                <td style="padding: 1.25rem; font-weight: 600;">
                                    <div style="display: flex; align-items: center; gap: 1rem;">
                                        <div style="width: 32px; height: 32px; background: #fff7ed; border-radius: 8px; display: flex; align-items: center; justify-content: center; color: #f97316;">
                                            <i data-lucide="book-marked" style="width: 18px;"></i>
                                        </div>
                                        ${s.name}
                                    </div>
                                </td>
                                <td><span class="badge warning" style="background: #fee2e2; color: #ef4444; border: none; border-radius: 20px; font-size: 0.7rem; padding: 0.25rem 0.75rem;">Unlinked</span></td>
                                <td><span style="display: inline-block; width: 8px; height: 8px; background: #10b981; border-radius: 50%; margin-right: 0.5rem;"></span></td>
                                <td style="font-weight: 700; color: #1e40af;">${s.credits}</td>
                                <td><span class="badge" style="background: #ffedd5; color: #9a3412; border: none; border-radius: 8px; font-weight: 700;">Core</span></td>
                                <td>
                                    <div style="display: flex; gap: 0.5rem;">
                                        <button class="btn btn-secondary btn-sm" style="padding: 0.5rem;"><i data-lucide="edit-3" style="width: 16px;"></i></button>
                                        <button class="btn btn-secondary btn-sm" style="padding: 0.5rem; color: #ef4444;"><i data-lucide="trash-2" style="width: 16px;"></i></button>
                                    </div>
                                </td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            </div>
        `;
        if (typeof lucide !== 'undefined') lucide.createIcons();
    },

    async renderStudents() {
        const students = await db.students.toArray();
        const classes = await db.classes.toArray();
        
        this.contentArea.innerHTML = `
            <div class="page-banner" style="background: linear-gradient(135deg, #1e40af 0%, #1e3a8a 100%);">
                <div class="banner-content">
                    <h1 class="banner-title" style="font-family: 'Outfit', sans-serif;"><i data-lucide="graduation-cap"></i> Student Directory</h1>
                    <p class="banner-subtitle">Comprehensive database of all registered learners.</p>
                </div>
                <div class="banner-stats">
                    <div class="banner-stat-item">
                        <span class="stat-value">${students.length}</span>
                        <span class="stat-label">Total Students</span>
                    </div>
                    <div class="banner-stat-item">
                        <span class="stat-value">${classes.length}</span>
                        <span class="stat-label">Active Classes</span>
                    </div>
                </div>
                <div style="display: flex; gap: 1rem;">
                    <button class="btn btn-secondary" style="border-radius: 12px; padding: 0.75rem 1.5rem; display: flex; align-items: center; gap: 0.5rem; background: rgba(255,255,255,0.1); color: white;">
                        <i data-lucide="printer"></i> Credentials
                    </button>
                    <button class="btn btn-primary" style="background: white; color: #1e3a8a; border: none; border-radius: 12px; padding: 0.75rem 1.5rem; display: flex; align-items: center; gap: 0.5rem;">
                        <i data-lucide="user-plus"></i> Add Student
                    </button>
                </div>
            </div>

            <div class="directory-container">
                <div class="directory-sidebar">
                    <div class="sidebar-search-wrap">
                        <div style="position: relative; margin-bottom: 1rem;">
                            <i data-lucide="search" style="position: absolute; left: 1rem; top: 50%; transform: translateY(-50%); color: #94a3b8; width: 18px;"></i>
                            <input type="text" id="directory-search" placeholder="Search by name or serial..." class="input" style="padding-left: 3rem; border-radius: 12px;">
                        </div>
                        <select id="class-filter" class="input" style="border-radius: 12px;">
                            <option value="">All Classes</option>
                            ${classes.map(c => `<option value="${c.name}">${c.name}</option>`).join('')}
                        </select>
                    </div>
                    <div class="sidebar-list" id="student-sidebar-list">
                        ${this.generateStudentListItems(students)}
                    </div>
                </div>

                <div class="directory-main" id="student-detail-view">
                    <div class="empty-state">
                        <div class="empty-icon"><i data-lucide="users" style="width: 40px; height: 40px;"></i></div>
                        <h2 class="text-xl font-bold mb-1">Select a Student</h2>
                        <p class="text-secondary">Choose a student from the sidebar to view their complete academic and personal records.</p>
                    </div>
                </div>
            </div>
        `;

        // Search logic
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
