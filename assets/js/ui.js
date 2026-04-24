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
                case 'academic': await this.renderAcademic(); break;
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
        
        lucide.createIcons();
    },

    showLoader() {
        this.contentArea.innerHTML = `
            <div class="loader-container">
                <div class="loader"></div>
            </div>
        `;
    },

    async renderDashboard() {
        const studentCount = await db.students.count();
        const classCount = await db.classes.count();
        const subjectCount = await db.subjects.count();
        const unsyncedCount = await db.students.where('is_synced').equals(0).count();

        this.contentArea.innerHTML = `
            <div class="dashboard-grid">
                <!-- Stats Row -->
                <div class="grid mb-2">
                    <div class="card stat-card primary-gradient">
                        <div class="stat-icon"><i data-lucide="users"></i></div>
                        <div class="stat-info">
                            <h3>Total Students</h3>
                            <p class="stat-value">${studentCount}</p>
                        </div>
                    </div>
                    <div class="card stat-card secondary-gradient">
                        <div class="stat-icon"><i data-lucide="book-open"></i></div>
                        <div class="stat-info">
                            <h3>Active Classes</h3>
                            <p class="stat-value">${classCount}</p>
                        </div>
                    </div>
                    <div class="card stat-card accent-gradient">
                        <div class="stat-icon"><i data-lucide="library"></i></div>
                        <div class="stat-info">
                            <h3>Subjects</h3>
                            <p class="stat-value">${subjectCount}</p>
                        </div>
                    </div>
                    <div class="card stat-card warning-gradient">
                        <div class="stat-icon"><i data-lucide="refresh-cw"></i></div>
                        <div class="stat-info">
                            <h3>Pending Syncs</h3>
                            <p class="stat-value">${unsyncedCount}</p>
                        </div>
                    </div>
                </div>

                <!-- Main Content Row -->
                <div class="grid main-dashboard-row">
                    <!-- Quick Actions -->
                    <div class="card quick-actions">
                        <h3><i data-lucide="zap"></i> Quick Actions</h3>
                        <div class="action-grid mt-2">
                            <button class="action-btn" onclick="document.querySelector('.nav-item[data-view=\\'students\\']').click()">
                                <div class="icon-wrapper bg-success-light"><i data-lucide="user-plus" class="text-success"></i></div>
                                <span>Manage Students</span>
                            </button>
                            <button class="action-btn" onclick="document.querySelector('.nav-item[data-view=\\'attendance\\']').click()">
                                <div class="icon-wrapper bg-warning-light"><i data-lucide="check-square" class="text-warning"></i></div>
                                <span>Daily Attendance</span>
                            </button>
                            <button class="action-btn" onclick="document.querySelector('.nav-item[data-view=\\'grades\\']').click()">
                                <div class="icon-wrapper bg-primary-light"><i data-lucide="award" class="text-primary"></i></div>
                                <span>Enter Grades</span>
                            </button>
                            <button class="action-btn" onclick="document.querySelector('.nav-item[data-view=\\'reports\\']').click()">
                                <div class="icon-wrapper bg-accent-light"><i data-lucide="file-text" class="text-accent"></i></div>
                                <span>Report Cards</span>
                            </button>
                        </div>
                    </div>

                    <!-- System Overview / Notifications -->
                    <div class="card recent-activity">
                        <div class="card-header flex-between mb-2">
                            <h3><i data-lucide="activity"></i> System Overview</h3>
                            <button id="manual-sync" class="btn btn-sm btn-primary"><i data-lucide="cloud-sync"></i> Force Sync</button>
                        </div>
                        <div class="activity-feed">
                            <div class="feed-item">
                                <div class="feed-icon"><i data-lucide="info"></i></div>
                                <div class="feed-content">
                                    <p><strong>System Ready</strong></p>
                                    <span class="text-secondary text-sm">Graviton CMS initialized successfully in offline-first mode.</span>
                                </div>
                            </div>
                            <div class="feed-item">
                                <div class="feed-icon"><i data-lucide="database"></i></div>
                                <div class="feed-content">
                                    <p><strong>Data Persisted</strong></p>
                                    <span class="text-secondary text-sm">Local database synchronized. ${unsyncedCount} items pending cloud push.</span>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `;
        
        // Add manual sync listener if needed
        const manualSyncBtn = document.getElementById('manual-sync');
        if(manualSyncBtn) {
            manualSyncBtn.addEventListener('click', () => {
                if (window.Notifications) window.Notifications.show('Manual sync triggered', 'info');
                // Assuming startSyncLoop can be triggered manually or we just let it run
            });
        }
    },


    async renderStudents() {
        let students = await db.students.toArray();
        
        // Filter students if Teacher? (Maybe see all for now as Admin/Teacher)
        
        this.contentArea.innerHTML = `
            <div class="actions-bar mb-2">
                <button id="add-student-btn" class="btn btn-success">Add Student</button>
                <label for="import-excel" class="btn btn-secondary">
                    Import Excel
                    <input type="file" id="import-excel" accept=".xlsx, .xls" style="display:none">
                </label>
                <input type="text" id="search-students" placeholder="Search students..." class="input">
            </div>
            
            <div class="table-container card">
                <table class="data-table">
                    <thead>
                        <tr>
                            <th>ID</th>
                            <th>Name</th>
                            <th>Class</th>
                            <th>Gender</th>
                            <th>Status</th>
                        </tr>
                    </thead>
                    <tbody id="student-list-body">
                        ${students.map(s => `
                            <tr>
                                <td>${s.student_id}</td>
                                <td>${s.name}</td>
                                <td>${s.class_name}</td>
                                <td>${s.gender}</td>
                                <td><span class="badge ${s.status === 'Active' ? 'success' : 'warning'}">${s.status}</span></td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            </div>
        `;

        // Add Listeners
        // Search Logic
        document.getElementById('search-students').addEventListener('input', (e) => {
            const term = e.target.value.toLowerCase();
            const filtered = students.filter(s => 
                s.name.toLowerCase().includes(term) || 
                s.student_id.toLowerCase().includes(term) ||
                s.class_name.toLowerCase().includes(term)
            );
            
            document.getElementById('student-list-body').innerHTML = filtered.map(s => `
                <tr>
                    <td>${s.student_id}</td>
                    <td>${s.name}</td>
                    <td>${s.class_name}</td>
                    <td>${s.gender}</td>
                    <td><span class="badge ${s.status === 'Active' ? 'success' : 'warning'}">${s.status}</span></td>
                </tr>
            `).join('');
        });

        document.getElementById('import-excel').addEventListener('change', async (e) => {
            const file = e.target.files[0];
            if (file) {
                const data = await parseExcel(file);
                // Simple bulk put
                const studentsWithSync = data.map(s => ({
                    ...s,
                    is_synced: 0,
                    updated_at: new Date().toISOString()
                }));
                await db.students.bulkPut(studentsWithSync);
                Notifications.show(`Imported ${data.length} students`, 'success');
                this.renderStudents();
            }
        });
    }

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
            lucide.createIcons();
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
