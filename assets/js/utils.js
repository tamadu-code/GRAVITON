/**
 * Graviton CMS - Utility Module
 * Logic for Scoring, PDF Reports, and Excel Imports
 */

/**
 * Scoring Engine
 */
export const ScoringEngine = {
    getGrade(total) {
        if (total >= 75) return 'A1';
        if (total >= 70) return 'B2';
        if (total >= 65) return 'B3';
        if (total >= 60) return 'C4';
        if (total >= 55) return 'C5';
        if (total >= 50) return 'C6';
        if (total >= 45) return 'D7';
        if (total >= 40) return 'E8';
        return 'F9';
    },

    getRemark(total) {
        if (total >= 75) return 'Excellent';
        if (total >= 70) return 'Very Good';
        if (total >= 65) return 'Good';
        if (total >= 50) return 'Credit';
        if (total >= 40) return 'Pass';
        return 'Fail';
    },

    getOrdinal(n) {
        const s = ["th", "st", "nd", "rd"];
        const v = n % 100;
        return n + (s[(v - 20) % 10] || s[v] || s[0]);
    },

    validateScore(field, value) {
        const val = parseFloat(value) || 0;
        if (field === 'exam') return val <= 60;
        return val <= 10; // CA components are 10 each
    },

    calculatePsychomotorScores(attendance, student) {
        if (!attendance || attendance.length === 0) {
            // Stable baseline for new students
            return {
                punctuality: 3, participation: 3, compliance: 3, 
                self_control: 3, honesty: 4, creativity: 4, neatness: 3, courage: 4
            };
        }

        const schoolAtt = attendance.filter(a => !a.is_subject_based);
        const subjectAtt = attendance.filter(a => a.is_subject_based);

        // 1. Punctuality: % of On-Time arrivals
        const totalSchool = schoolAtt.length;
        const onTime = schoolAtt.filter(a => a.status === 'Present').length;
        const punctPct = totalSchool > 0 ? (onTime / totalSchool) * 100 : 60;
        
        // 2. Participation: Ratio of Subject Attendance to School Attendance
        // If they attend subjects whenever they are in school, Participation is high.
        const schoolDays = new Set(schoolAtt.map(a => a.date)).size || 1;
        const subjectsPerDay = subjectAtt.length / schoolDays;
        const participationPct = (subjectsPerDay / 6) * 100; // Assuming 6 subjects a day average

        // 3. Compliance: Are they skipping subjects while in school?
        // Discrepancy between school presence and subject presence
        const compliancePct = Math.min(100, participationPct + 20); 

        // Mapping function 0-100 to 1-5
        const mapTo5 = (pct) => {
            if (pct >= 90) return 5;
            if (pct >= 80) return 4;
            if (pct >= 60) return 3;
            if (pct >= 40) return 2;
            return 1;
        };

        // Stable Seeded Qualitative traits (to avoid pure randomness)
        const getSeedRating = (str, offset = 0) => {
            let hash = 0;
            for (let i = 0; i < str.length; i++) hash = str.charCodeAt(i) + ((hash << 5) - hash);
            return 3 + (Math.abs(hash + offset) % 3); // Returns 3, 4, or 5
        };

        return {
            punctuality: mapTo5(punctPct),
            participation: mapTo5(participationPct),
            compliance: mapTo5(compliancePct),
            self_control: mapTo5(punctPct),
            honesty: mapTo5(compliancePct > 80 ? 100 : 60), 
            creativity: getSeedRating(student.name, 10),
            neatness: getSeedRating(student.name, 20),
            courage: getSeedRating(student.name, 30)
        };
    }
};

/**
 * PDF Reporting System (Report Cards)
 */
export async function generateReportCard(student, scores, schoolInfo, attendance = []) {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF('p', 'mm', 'a4');
    const pageWidth = doc.internal.pageSize.width;
    const pageHeight = doc.internal.pageSize.height;
    
    // Helper: Draw Blue Border
    doc.setDrawColor(37, 99, 235); // Blue
    doc.setLineWidth(1.5);
    doc.rect(5, 5, pageWidth - 10, pageHeight - 10);
    doc.setLineWidth(0.5);
    
    // --- Header Section ---
    // Placeholder for Logo (Top Left)
    doc.setDrawColor(37, 99, 235);
    doc.rect(10, 10, 25, 25);
    doc.setFontSize(8);
    doc.text("LOGO", 22.5, 23, { align: 'center' });
    
    // School Name & Details
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(16);
    doc.setTextColor(30, 58, 138); // Dark Blue
    doc.text("NEW KINGS AND QUEENS MONTESSORI SCHOOL", pageWidth / 2 + 10, 15, { align: 'center' });
    
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(0, 0, 0);
    doc.text("OPPOSITE N.U.J. OPILI PLAZA, CHIEF ELLIOT DEKEBI STREET", pageWidth / 2 + 10, 20, { align: 'center' });
    doc.text("Tel: 08035461711, 08037316183, 08058134229", pageWidth / 2 + 10, 24, { align: 'center' });
    
    doc.setFont('helvetica', 'bolditalic');
    doc.setTextColor(37, 99, 235);
    doc.text("Motto: Knowledge is Power", pageWidth / 2 + 10, 28, { align: 'center' });
    
    // Report Title Box
    doc.setFillColor(37, 99, 235);
    doc.rect(40, 32, pageWidth - 80, 7, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.text("SCHOOL REPORT CARD", pageWidth / 2, 37, { align: 'center' });
    
    // --- Student Info Grid ---
    doc.setTextColor(0, 0, 0);
    doc.setFontSize(9);
    let y = 48;
    const leftX = 12;
    const midX = 85;
    const rightX = 145;
    
    // Row 1
    doc.text(`NAME: ${student.name.toUpperCase()}`, leftX, y);
    doc.line(23, y + 1, 80, y + 1); // Underline name
    doc.text(`SEX: ${student.gender || 'N/A'}`, midX, y);
    doc.text(`TOTAL MARKS: ${scores.reduce((a, b) => a + (b.total || 0), 0)}`, rightX, y);
    
    y += 7;
    // Row 2
    doc.text(`CLASS: ${student.class_name}`, leftX, y);
    doc.text(`SESSION: ${scores[0]?.session || '2025/2026'}`, midX, y);
    doc.text(`NO. IN CLASS: ${schoolInfo.classSize || '27'}`, rightX, y);
    
    y += 7;
    // Row 3
    doc.text(`TERM: ${scores[0]?.term || 'N/A'}`, leftX, y);
    const avg = scores.length > 0 ? (scores.reduce((a, b) => a + (b.total || 0), 0) / scores.length).toFixed(2) : 0;
    doc.text(`AVERAGE: ${avg}%`, midX, y);
    doc.text(`OVERALL GRADE: ${ScoringEngine.getGrade(parseFloat(avg))}`, rightX, y);
    
    y += 7;
    // Row 4
    doc.text(`TERM ENDS: ${schoolInfo.termEnd || '31st March, 2026'}`, leftX, y);
    doc.text(`PASS/FAIL: ${parseFloat(avg) >= 40 ? 'PASS' : 'FAIL'}`, midX, y);
    doc.text(`NEXT BEGINS: ${schoolInfo.termStart || '13th April, 2026'}`, rightX, y);
    
    // --- Subjects Table ---
    const tableHead = [['SUBJECTS', 'ASS', 'T1', 'T2', 'PROJ', 'CA', 'EXAM', 'TOTAL', 'GRADE', 'REMARK']];
    const tableBody = scores.map(s => [
        s.subject_name,
        s.ass || 0,
        s.t1 || 0,
        s.t2 || 0,
        s.proj || 0,
        (s.ass || 0) + (s.t1 || 0) + (s.t2 || 0) + (s.proj || 0),
        s.exam || 0,
        s.total,
        s.grade,
        s.remark || ScoringEngine.getRemark(s.total)
    ]);
    
    doc.autoTable({
        startY: y + 5,
        head: tableHead,
        body: tableBody,
        theme: 'grid',
        headStyles: { fillStyle: [37, 99, 235], textColor: 255, fontSize: 8, fontStyle: 'bold' },
        styles: { fontSize: 8, textColor: 0, cellPadding: 2 },
        columnStyles: {
            0: { fontStyle: 'bold', halign: 'left', cellWidth: 50 },
            9: { cellWidth: 25 }
        },
        margin: { left: 10, right: 10 }
    });
    
    let currentY = doc.lastAutoTable.finalY + 5;
    
    // --- Affective & Psychomotor Domain ---
    doc.setFillColor(230, 242, 255);
    doc.rect(10, currentY, pageWidth - 20, 6, 'F');
    doc.setTextColor(37, 99, 235);
    doc.setFontSize(9);
    doc.text("AFFECTIVE & PSYCHOMOTOR DOMAIN", pageWidth / 2, currentY + 4.5, { align: 'center' });
    
    currentY += 10;
    doc.setTextColor(0, 0, 0);
    
    // AUTOMATED SCORES
    const autoScores = ScoringEngine.calculatePsychomotorScores(attendance, student);
    
    const domainData = [
        ['Punctuality', autoScores.punctuality, 'Neatness', autoScores.neatness, 'Honesty', autoScores.honesty, 'Self Control', autoScores.self_control],
        ['Courage', autoScores.courage, 'Creativity', autoScores.creativity, 'Participation', autoScores.participation, 'Compliance', autoScores.compliance]
    ];
    
    domainData.forEach(row => {
        let x = 12;
        row.forEach((item, idx) => {
            if (idx % 2 === 0) {
                doc.text(item, x, currentY);
                x += 25;
            } else {
                doc.text(item, x, currentY);
                doc.line(x - 2, currentY + 1, x + 5, currentY + 1);
                x += 20;
            }
        });
        currentY += 6;
    });
    
    doc.setFontSize(7);
    doc.setFont('helvetica', 'italic');
    doc.text("Rating Scale: 5-Excellent, 4-Very Good, 3-Good, 2-Fair, 1-Needs Imp.", pageWidth / 2, currentY, { align: 'center' });
    
    currentY += 10;
    
    // --- Teacher's Comment ---
    doc.setDrawColor(37, 99, 235);
    doc.rect(10, currentY, pageWidth - 20, 20);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(37, 99, 235);
    doc.text("TEACHER'S COMMENT:", 12, currentY + 5);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(0, 0, 0);
    doc.text(schoolInfo.teacherComment || "Exceptional brilliance! You have consistently shown deep understanding and mastery of all subjects.", 12, currentY + 10, { maxWidth: pageWidth - 25 });
    doc.text(`Name: ${schoolInfo.teacherName || 'Oyivwita Arwerosuaghene'}`, 12, currentY + 18);
    doc.text(`Sign: ____________________`, pageWidth - 60, currentY + 18);
    
    currentY += 25;
    
    // --- Principal's Comment ---
    doc.rect(10, currentY, pageWidth - 20, 20);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(37, 99, 235);
    doc.text("PRINCIPAL'S COMMENT:", 12, currentY + 5);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(0, 0, 0);
    doc.text(schoolInfo.principalComment || "A truly distinctive performance. You are the pride of the school. Keep reaching for the stars!", 12, currentY + 10, { maxWidth: pageWidth - 25 });
    doc.text(`Name: ${schoolInfo.principalName || 'Mr. Lartey Sampson'}`, 12, currentY + 18);
    doc.text(`Sign: ____________________`, pageWidth - 60, currentY + 18);
    
    // --- Footer ---
    const footerY = pageHeight - 20;
    doc.setDrawColor(37, 99, 235);
    doc.rect(12, footerY - 5, 15, 15); // QR Box
    doc.setFontSize(6);
    doc.text("OFFICIAL VERIFICATION", 30, footerY);
    doc.text("Scan to confirm student", 30, footerY + 3);
    doc.text("performance details.", 30, footerY + 6);
    
    doc.setFontSize(8);
    const dateStr = new Date().toLocaleDateString('en-GB', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
    doc.text(`Report Generated On: ${dateStr}`, pageWidth - 15, footerY, { align: 'right' });
    
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(37, 99, 235);
    doc.text("VALID ONLY WITH ORIGINAL SCHOOL EMBOSSED STAMP", pageWidth - 15, footerY + 6, { align: 'right' });
    
    doc.save(`${student.name.replace(/\s+/g, '_')}_Report_Card.pdf`);
}

/**
 * Excel Bulk Import
 */
export async function parseExcel(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (e) => {
            const data = new Uint8Array(e.target.result);
            const workbook = XLSX.read(data, { type: 'array' });
            const result = {};
            workbook.SheetNames.forEach(sheetName => {
                const worksheet = workbook.Sheets[sheetName];
                result[sheetName] = XLSX.utils.sheet_to_json(worksheet);
            });
            resolve(result);
        };
        reader.onerror = reject;
        reader.readAsArrayBuffer(file);
    });
}

/**
 * Generate Student Credentials PDF (Access Cards)
 */
export async function generateCredentialsPDF(students, schoolInfo = {}) {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();
    
    // Header
    doc.setFontSize(22);
    doc.setTextColor(31, 111, 235);
    doc.text(schoolInfo.name || 'GRAVITON ACADEMY', 105, 20, { align: 'center' });
    doc.setFontSize(12);
    doc.setTextColor(100, 116, 139);
    doc.text('Student Access Credentials', 105, 28, { align: 'center' });
    
    doc.setDrawColor(226, 232, 240);
    doc.line(20, 35, 190, 35);
    
    // Cards
    let y = 45;
    students.forEach((student, index) => {
        if (y > 250) {
            doc.addPage();
            y = 20;
        }
        
        // Draw Card Box
        doc.setDrawColor(226, 232, 240);
        doc.setFillColor(248, 250, 252);
        doc.roundedRect(20, y, 170, 45, 3, 3, 'FD');
        
        // Student Name
        doc.setFontSize(14);
        doc.setTextColor(15, 23, 42);
        doc.setFont('helvetica', 'bold');
        doc.text(student.name, 25, y + 12);
        
        // Class
        doc.setFontSize(10);
        doc.setTextColor(100, 116, 139);
        doc.setFont('helvetica', 'normal');
        doc.text(`Class: ${student.class_name}`, 25, y + 20);
        
        // Credentials
        doc.setFontSize(11);
        doc.setTextColor(15, 23, 42);
        doc.setFont('helvetica', 'bold');
        doc.text(`Portal ID: ${student.student_id}`, 25, y + 32);
        doc.text(`Password: Password123`, 100, y + 32);
        
        y += 55;
    });
    
    doc.save(`Student_Credentials_${new Date().toISOString().split('T')[0]}.pdf`);
}

/**
 * UI Helpers
 */
export const Notifications = {
    show(message, type = 'info') {
        const container = document.getElementById('notification-container');
        const notif = document.createElement('div');
        notif.className = `notification ${type}`;
        
        let icon = 'info';
        if (type === 'success') icon = 'check-circle';
        if (type === 'error') icon = 'alert-circle';
        
        notif.innerHTML = `
            <i data-lucide="${icon}"></i>
            <span>${message}</span>
        `;
        
        container.appendChild(notif);
        lucide.createIcons();
        
        setTimeout(() => {
            notif.style.opacity = '0';
            notif.style.transform = 'translateX(100%)';
            setTimeout(() => notif.remove(), 300);
        }, 4000);
    }
};

/**
 * Generate Mastersheet (Academic Matrix)
 */
export async function generateMastersheet(className, students, subjects, scores, term, session) {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF('landscape');
    
    // Header
    doc.setFontSize(18);
    doc.text('ACADEMIC MASTERSHEET', 148, 15, { align: 'center' });
    doc.setFontSize(10);
    doc.text(`${className} | ${term} | ${session}`, 148, 22, { align: 'center' });
    
    // Matrix Construction
    const head = ['Student Name', ...subjects.map(s => s.name.substring(0, 5)), 'Total', 'Avg', 'Rank'];
    const body = students.map(student => {
        const studentScores = subjects.map(subject => {
            const score = scores.find(s => s.student_id === student.student_id && s.subject_id === subject.id);
            return score ? score.total : '-';
        });
        
        const total = studentScores.reduce((acc, s) => acc + (s === '-' ? 0 : s), 0);
        const avg = subjects.length > 0 ? (total / subjects.length).toFixed(1) : 0;
        
        // Find rank for this student in this term/session (already calculated in scores)
        const firstScore = scores.find(s => s.student_id === student.student_id);
        const rank = firstScore ? firstScore.rank : '-';
        
        return [student.name, ...studentScores, total, avg, rank];
    });
    
    doc.autoTable({
        startY: 30,
        head: [head],
        body: body,
        theme: 'grid',
        styles: { fontSize: 7, cellPadding: 1 },
        headStyles: { fillStyle: [30, 41, 59], textColor: 255 }
    });
    
    doc.save(`Mastersheet_${className}_${term}_${session.replace(/\//g, '-')}.pdf`);
}

