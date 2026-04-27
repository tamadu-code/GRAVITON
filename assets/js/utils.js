/**
 * Graviton CMS - Utility Module
 * Logic for Scoring, PDF Reports, and Excel Imports
 */

/**
 * Scoring Engine
 */
export const ScoringEngine = {
    getGrade(total) {
        if (total >= 95) return 'A+';
        if (total >= 90) return 'A';
        if (total >= 85) return 'A-';
        if (total >= 80) return 'B+';
        if (total >= 75) return 'B';
        if (total >= 70) return 'B-';
        if (total >= 65) return 'C+';
        if (total >= 60) return 'C';
        if (total >= 55) return 'C-';
        if (total >= 50) return 'D+';
        if (total >= 45) return 'D';
        if (total >= 40) return 'D-';
        return 'F';
    },

    getRemark(total) {
        if (total >= 80) return 'Outstanding';
        if (total >= 70) return 'Very Good';
        if (total >= 60) return 'Good';
        if (total >= 50) return 'Credit';
        if (total >= 40) return 'Pass';
        return 'Needs Improvement';
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
    }
};

/**
 * PDF Reporting System (Report Cards)
 */
export async function generateReportCard(student, scores, schoolInfo) {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();
    
    // Header
    doc.setFontSize(22);
    doc.text(schoolInfo.name || 'GRAVITON ACADEMY', 105, 20, { align: 'center' });
    doc.setFontSize(10);
    doc.text(schoolInfo.address || 'Academic Excellence Through Logic', 105, 28, { align: 'center' });
    
    doc.setDrawColor(88, 166, 255);
    doc.line(20, 35, 190, 35);
    
    // Student Info
    doc.setFontSize(12);
    doc.text(`Student: ${student.name}`, 20, 45);
    doc.text(`ID: ${student.student_id}`, 20, 52);
    doc.text(`Class: ${student.class_name}`, 140, 45);
    doc.text(`Term: ${scores[0]?.term || 'N/A'}`, 140, 52);
    
    // Scores Table
    const tableData = scores.map(s => [
        s.subject_name,
        s.ca1,
        s.ca2,
        s.exam,
        s.total,
        s.grade
    ]);
    
    doc.autoTable({
        startY: 65,
        head: [['Subject', 'CA1 (20)', 'CA2 (20)', 'Exam (60)', 'Total (100)', 'Grade']],
        body: tableData,
        theme: 'striped',
        headStyles: { fillStyle: [31, 111, 235] }
    });
    
    // Footer
    const finalY = doc.lastAutoTable.finalY + 20;
    doc.text('Form Teacher Remark: ________________________________', 20, finalY);
    doc.text('Principal Signature: ________________________________', 20, finalY + 15);
    
    doc.save(`${student.name}_Report_Card.pdf`);
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
