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

    getTeacherRemark(avg) {
        const score = parseFloat(avg);
        if (score >= 85) return "An exceptionally brilliant performance! You have shown a high level of academic maturity and consistency. Keep it up.";
        if (score >= 75) return "A very impressive result. Your dedication to your studies is evident in your performance. Maintain this momentum.";
        if (score >= 65) return "A good performance overall. You have a solid grasp of the subjects, but there is still room for more effort to reach the top.";
        if (score >= 55) return "A fair performance. You have potential, but you need to be more serious with your studies to achieve better grades.";
        if (score >= 45) return "Your performance is below average. You need to put in significantly more effort and focus on your weak areas.";
        return "A very poor result. You are advised to be more studious and seek help in subjects where you are struggling.";
    },

    getPrincipalRemark(avg) {
        const score = parseFloat(avg);
        if (score >= 80) return "Excellent result! You are a credit to this institution. Continue to strive for excellence.";
        if (score >= 70) return "A very good performance. I am pleased with your progress. Keep up the hard work.";
        if (score >= 60) return "Good performance. With more consistency and focus, you can achieve even greater heights.";
        if (score >= 50) return "Average performance. You can do much better if you devote more time to your studies.";
        if (score >= 40) return "A weak performance. You need to double your efforts to avoid falling behind.";
        return "Very poor performance. You must improve your attitude towards your studies to avoid failure.";
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
export async function generateReportCard(student, scores, schoolInfo, attendance = [], existingDoc = null) {
    const { jsPDF } = window.jspdf;
    const doc = existingDoc || new jsPDF('p', 'mm', 'a4');
    const pageWidth = doc.internal.pageSize.width;
    const pageHeight = doc.internal.pageSize.height;
    
    // Helper: Hex to RGB
    const hexToRgb = (hex) => {
        const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
        return result ? {
            r: parseInt(result[1], 16),
            g: parseInt(result[2], 16),
            b: parseInt(result[3], 16)
        } : { r: 37, g: 99, b: 235 };
    };
    const theme = hexToRgb(schoolInfo.themeColor || '#060495');

    // --- QR Code Generation ---
    let qrDataURL = null;
    try {
        const qrData = JSON.stringify({
            id: student.student_id,
            s: schoolInfo.session,
            t: schoolInfo.term,
            v: 'G-V24'
        });
        qrDataURL = await QRCode.toDataURL(qrData, { margin: 1, width: 100 });
    } catch (e) {
        console.warn('QR Generation failed:', e);
    }

    // Helper: Draw Border
    doc.setDrawColor(theme.r, theme.g, theme.b);
    doc.setLineWidth(1.5);
    doc.rect(5, 5, pageWidth - 10, pageHeight - 10);
    doc.setLineWidth(0.5);
    
    // --- Header Section ---
    if (schoolInfo.logo) {
        try {
            doc.addImage(schoolInfo.logo, 'PNG', 10, 10, 25, 25);
        } catch (e) {
            console.warn('Failed to add logo to PDF:', e);
            doc.setDrawColor(theme.r, theme.g, theme.b);
            doc.rect(10, 10, 25, 25);
        }
    } else {
        doc.setDrawColor(theme.r, theme.g, theme.b);
        doc.rect(10, 10, 25, 25);
        doc.setFontSize(8);
        doc.text("LOGO", 22.5, 23, { align: 'center' });
    }
    
    // School Name & Details
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(16);
    doc.setTextColor(theme.r * 0.5, theme.g * 0.5, theme.b * 0.5); // Darker version of theme
    doc.text(schoolInfo.name.toUpperCase(), pageWidth / 2 + 10, 15, { align: 'center' });
    
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(0, 0, 0);
    doc.text(schoolInfo.address.toUpperCase(), pageWidth / 2 + 10, 20, { align: 'center' });
    doc.text(`Tel: ${schoolInfo.phone} | Email: ${schoolInfo.email}`, pageWidth / 2 + 10, 23.5, { align: 'center' });
    
    doc.setFont('helvetica', 'bolditalic');
    doc.setTextColor(theme.r, theme.g, theme.b);
    doc.text(`Motto: ${schoolInfo.motto}`, pageWidth / 2 + 10, 27, { align: 'center' });
    
    // Report Title Box
    doc.setFillColor(theme.r, theme.g, theme.b);
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
    
    const avg = scores.length > 0 ? (scores.reduce((a, b) => a + (b.total || 0), 0) / scores.length).toFixed(2) : 0;
    
    // Row 1
    doc.text(`NAME: ${student.name.toUpperCase()}`, leftX, y);
    doc.line(23, y + 1, 80, y + 1); // Underline name
    doc.text(`SEX: ${student.gender || 'N/A'}`, midX, y);
    doc.text(`TOTAL MARKS: ${scores.reduce((a, b) => a + (b.total || 0), 0)}`, rightX, y);
    
    y += 7;
    // Row 2
    let displayClass = student.class_name;
    if (student.sub_class && (student.class_name.includes('SSS') || student.class_name.includes('SS '))) {
        displayClass += ` (${student.sub_class})`;
    }
    doc.text(`CLASS: ${displayClass}`, leftX, y);
    doc.text(`SESSION: ${scores[0]?.session || '2025/2026'}`, midX, y);
    
    // Conditional Ranking Display
    const gSystem = schoolInfo.gradingSystem || 'Positional Ranking';
    if (gSystem === 'Positional Ranking') {
        doc.text(`POSITION: ${schoolInfo.position || 'N/A'} / ${schoolInfo.specializationSize || schoolInfo.classSize || '0'}`, rightX, y);
    } else if (gSystem === 'Point System (5.0 CGPA)') {
        const gpa = (parseFloat(avg) / 20).toFixed(2); // Simple conversion for demo
        doc.text(`GPA: ${gpa} / 5.00`, rightX, y);
    } else {
        doc.text(`OVERALL GRADE: ${ScoringEngine.getGrade(parseFloat(avg))}`, rightX, y);
    }
    
    y += 7;
    // Row 3
    doc.text(`TERM: ${scores[0]?.term || 'N/A'}`, leftX, y);
    doc.text(`AVERAGE: ${avg}%`, midX, y);
    // Blank right side to respect the "one or the other" rule
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
                doc.text(String(item), x, currentY);
                x += 25;
            } else {
                doc.text(String(item), x, currentY);
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
    doc.text(schoolInfo.teacherComment || ScoringEngine.getTeacherRemark(avg), 12, currentY + 10, { maxWidth: pageWidth - 25 });
    doc.text(`Name: ${schoolInfo.teacherName || 'Form Teacher'}`, 12, currentY + 18);
    doc.text(`Sign: ____________________`, pageWidth - 60, currentY + 18);
    
    currentY += 25;
    
    // --- Principal's Comment ---
    doc.rect(10, currentY, pageWidth - 20, 20);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(37, 99, 235);
    doc.text("PRINCIPAL'S COMMENT:", 12, currentY + 5);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(0, 0, 0);
    doc.text(schoolInfo.principalComment || ScoringEngine.getPrincipalRemark(avg), 12, currentY + 10, { maxWidth: pageWidth - 25 });
    doc.text(`Name: ${schoolInfo.principalName || 'Mr. Lartey Sampson'}`, 12, currentY + 18);
    doc.text(`Sign: ____________________`, pageWidth - 60, currentY + 18);
    
    // --- Footer ---
    const footerY = pageHeight - 20;
    doc.setDrawColor(37, 99, 235);
    // --- QR Code Security Section ---
    doc.setDrawColor(theme.r, theme.g, theme.b);
    doc.rect(12, footerY - 5, 18, 18); // QR Box
    
    if (qrDataURL) {
        try {
            doc.addImage(qrDataURL, 'PNG', 13, footerY - 4, 16, 16);
        } catch (e) {
            console.warn('Failed to add QR image:', e);
        }
    }
    
    doc.setFontSize(5);
    doc.setTextColor(theme.r, theme.g, theme.b);
    doc.text("OFFICIAL VERIFICATION", 32, footerY - 1);
    doc.setTextColor(100, 116, 139);
    doc.text("Scan this code to verify the", 32, footerY + 2);
    doc.text("authenticity of this record", 32, footerY + 5);
    doc.text("against our central ledger.", 32, footerY + 8);
    
    // --- Footer Section (Signatures) ---
    // Reuse footerY from above or adjust
    
    // Principal's Signature Area
    doc.setFontSize(10);
    doc.setTextColor(0, 0, 0);
    doc.text("__________________________", 75, footerY - 5);
    doc.setFont('helvetica', 'bold');
    doc.text(schoolInfo.principalName.toUpperCase(), 75, footerY);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.text("School Principal", 75, footerY + 4);
    
    if (schoolInfo.principalSignature) {
        try {
            doc.addImage(schoolInfo.principalSignature, 'PNG', 75, footerY - 18, 30, 12);
        } catch (e) {
            console.warn('Failed to add signature to PDF:', e);
        }
    }

    doc.setFontSize(8);
    const dateStr = new Date().toLocaleDateString('en-GB', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
    doc.setTextColor(100, 116, 139);
    doc.text(`Report Generated On: ${dateStr}`, pageWidth - 15, footerY, { align: 'right' });
    
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(theme.r, theme.g, theme.b);
    doc.text("VALID ONLY WITH ORIGINAL SCHOOL EMBOSSED STAMP", pageWidth - 15, footerY + 6, { align: 'right' });
    
    if (!existingDoc) {
        return doc;
    }
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
        headStyles: { fillColor: [30, 41, 59], textColor: 255 }
    });
    
    return doc; // Return for preview
}

/**
 * Generate Secure Payment Receipt
 */
export async function generatePaymentReceipt(payment, student, schoolInfo = {}) {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF('p', 'mm', [100, 150]); // Smaller receipt format
    
    const themeColor = schoolInfo.themeColor || '#4f46e5';
    const hexToRgb = (hex) => {
        const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
        return result ? { r: parseInt(result[1], 16), g: parseInt(result[2], 16), b: parseInt(result[3], 16) } : { r: 79, g: 70, b: 229 };
    };
    const rgb = hexToRgb(themeColor);

    // Border
    doc.setDrawColor(rgb.r, rgb.g, rgb.b);
    doc.rect(2, 2, 96, 146);

    // Header
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12);
    doc.setTextColor(rgb.r, rgb.g, rgb.b);
    doc.text(schoolInfo.name || "GRAVITON ACADEMY", 50, 15, { align: 'center' });
    
    doc.setFontSize(8);
    doc.setTextColor(100, 116, 139);
    doc.text("Official Payment Receipt", 50, 20, { align: 'center' });
    
    doc.line(10, 25, 90, 25);

    // Body
    doc.setFontSize(9);
    doc.setTextColor(15, 23, 42);
    let y = 35;
    const row = (label, value) => {
        doc.setFont('helvetica', 'bold');
        doc.text(label, 12, y);
        doc.setFont('helvetica', 'normal');
        doc.text(String(value), 90, y, { align: 'right' });
        y += 8;
    };

    row("Receipt Date:", new Date(payment.date).toLocaleDateString());
    row("Reference:", payment.reference);
    row("Student ID:", student.student_id);
    row("Student Name:", student.name);
    row("Class:", student.class_name);
    row("Payment Type:", payment.type || "School Fees");
    
    y += 5;
    doc.setFillColor(rgb.r, rgb.g, rgb.b);
    doc.rect(10, y, 80, 10, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.text(`AMOUNT: ₦${payment.amount.toLocaleString()}`, 50, y + 6.5, { align: 'center' });

    y += 20;
    doc.setTextColor(15, 23, 42);
    doc.setFontSize(8);
    doc.setFont('helvetica', 'italic');
    doc.text("Thank you for your payment.", 50, y, { align: 'center' });
    
    y += 10;
    doc.setFont('helvetica', 'normal');
    doc.text("Authorized Digital Signature", 50, y, { align: 'center' });
    doc.line(35, y + 2, 65, y + 2);

    doc.save(`Receipt_${payment.reference}.pdf`);
}

/**
 * Generate Blank Score Sheet (Empty broadsheet for manual entry)
 * Supports multiple subjects for a single class (Bulk generation)
 * Refined Portrait Layout with Dynamic Teacher Names
 */
export async function generateBlankScoreSheet(className, students, subjects, term, session, schoolInfo = {}) {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF('p', 'mm', 'a4');
    const pageWidth = doc.internal.pageSize.width;
    const pageHeight = doc.internal.pageSize.height;
    
    const subjectsArray = Array.isArray(subjects) ? subjects : [subjects];
    const pageSize = 30; // More rows in Portrait
    
    let firstPage = true;

    for (const subject of subjectsArray) {
        const subjectName = typeof subject === 'string' ? subject : (subject.name || 'Unspecified Subject');
        const teacherName = subject.teacherName || '________________________________________';
        const totalPages = Math.ceil(students.length / pageSize);
        
        for (let p = 0; p < totalPages; p++) {
            if (!firstPage) doc.addPage();
            firstPage = false;
            
            const pageStudents = students.slice(p * pageSize, (p + 1) * pageSize);
            
            // --- Header Section (Optical Centering) ---
            if (schoolInfo.logo) {
                try {
                    doc.addImage(schoolInfo.logo, 'PNG', 12, 10, 18, 18);
                } catch (e) {}
            }
            
            doc.setFontSize(14);
            doc.setFont('helvetica', 'bold');
            const schoolName = schoolInfo.schoolName || 'NEW KINGS AND QUEENS MONTESSORI SCHOOL';
            doc.text(schoolName.toUpperCase(), pageWidth / 2, 18, { align: 'center' });
            
            doc.setFontSize(11);
            doc.text('CONTINUOUS ASSESSMENT SCORE SHEET', pageWidth / 2, 24, { align: 'center' });
            
            const titleWidth = doc.getTextWidth('CONTINUOUS ASSESSMENT SCORE SHEET');
            doc.line((pageWidth / 2) - (titleWidth / 2), 25, (pageWidth / 2) + (titleWidth / 2), 25); // Centered Underline
            
            // --- Metadata Grid (Overlap Fix) ---
            doc.setFontSize(8);
            const metaY = 35;
            
            doc.setDrawColor(0);
            doc.setLineWidth(0.2);
            doc.rect(12, metaY, pageWidth - 24, 12); // Outer box
            doc.line(12, metaY + 6, pageWidth - 12, metaY + 6); // Horizontal divider
            
            // Re-calculated Vertical Dividers for optimal spacing
            doc.line(55, metaY, 55, metaY + 12); // Moved from 45 to 55 for CLASS space
            doc.line(145, metaY, 145, metaY + 6); // Moved from 135 to 145 for SUBJECT space
            
            const drawMeta = (label, val, x, y, valOffset = 15) => {
                doc.setFont('helvetica', 'normal');
                doc.text(label, x + 2, y + 4);
                doc.setFont('helvetica', 'bold');
                doc.text(String(val).toUpperCase(), x + valOffset, y + 4);
            };
            
            drawMeta('CLASS:', className, 12, metaY, 12);
            drawMeta('SUBJECT:', subjectName, 55, metaY, 16);
            drawMeta('SESSION:', session, 145, metaY, 15);
            
            drawMeta('TERM:', term, 12, metaY + 6, 12);
            
            doc.setFont('helvetica', 'normal');
            doc.text('TEACHER:', 57, metaY + 10);
            doc.setFont('helvetica', 'bold');
            doc.text(teacherName.toUpperCase(), 75, metaY + 10);
            
            // --- Main Score Table ---
            const head = [['S/N', 'STUDENT NAME', 'ASS', 'T1', 'T2', 'PRJ', 'EXAM', 'TOTAL']];
            const body = pageStudents.map((s, idx) => [
                (p * pageSize) + idx + 1,
                s.name.toUpperCase(),
                '', '', '', '', '', ''
            ]);
            
            // Extra blank rows (NO UNDERSCORES)
            if (p === totalPages - 1 && body.length < pageSize) {
                const extra = pageSize - body.length;
                for (let i = 0; i < extra; i++) {
                    body.push([(p * pageSize) + pageStudents.length + i + 1, '', '', '', '', '', '', '']);
                }
            }
            
            doc.autoTable({
                startY: metaY + 15,
                head: head,
                body: body,
                theme: 'grid',
                styles: { fontSize: 8, cellPadding: 1.5, minCellHeight: 7 },
                headStyles: { fillColor: [241, 245, 249], textColor: 0, halign: 'center', fontStyle: 'bold', lineWidth: 0.1 },
                columnStyles: {
                    0: { cellWidth: 10, halign: 'center' },
                    1: { cellWidth: 75 },
                    2: { cellWidth: 18, halign: 'center' },
                    3: { cellWidth: 18, halign: 'center' },
                    4: { cellWidth: 18, halign: 'center' },
                    5: { cellWidth: 18, halign: 'center' },
                    6: { cellWidth: 18, halign: 'center' },
                    7: { cellWidth: 18, halign: 'center' }
                }
            });
            
            // Footer
            const footerY = pageHeight - 10;
            doc.setFontSize(7);
            doc.setFont('helvetica', 'normal');
            doc.setTextColor(100);
            doc.text(`Generated for ${className} | Subject: ${subjectName} | Page ${p+1} of ${totalPages}`, 12, footerY);
            doc.text(`Date: ${new Date().toLocaleDateString()}`, pageWidth - 40, footerY);
        }
    }
    
    return doc;
}
