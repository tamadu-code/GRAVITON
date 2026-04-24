/**
 * Graviton CMS - Utility Module
 * Logic for Scoring, PDF Reports, and Excel Imports
 */

/**
 * Scoring Engine
 */
export const ScoringEngine = {
    calculateGrade(total) {
        if (total >= 70) return 'A';
        if (total >= 60) return 'B';
        if (total >= 50) return 'C';
        if (total >= 45) return 'D';
        if (total >= 40) return 'E';
        return 'F';
    },

    validateScore(ca1, ca2, exam) {
        const errors = [];
        if (ca1 > 20) errors.push('CA1 cannot exceed 20');
        if (ca2 > 20) errors.push('CA2 cannot exceed 20');
        if (exam > 60) errors.push('Exam cannot exceed 60');
        return {
            isValid: errors.length === 0,
            errors
        };
    },

    processScore(ca1, ca2, exam) {
        const c1 = parseFloat(ca1) || 0;
        const c2 = parseFloat(ca2) || 0;
        const ex = parseFloat(exam) || 0;
        const total = c1 + c2 + ex;
        return {
            total,
            grade: this.calculateGrade(total)
        };
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
            const firstSheetName = workbook.SheetNames[0];
            const worksheet = workbook.Sheets[firstSheetName];
            const json = XLSX.utils.sheet_to_json(worksheet);
            resolve(json);
        };
        reader.onerror = reject;
        reader.readAsArrayBuffer(file);
    });
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
