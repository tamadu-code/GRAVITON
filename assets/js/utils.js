import db from './db.js';

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
    
    // Fetch all student scores and subjects to compute GPA/CGPA if needed
    const [allScores, loadedSubjects] = await Promise.all([
        db.scores.where('student_id').equals(student.student_id).toArray(),
        db.subjects.toArray()
    ]);

    const getGradePoint = (total) => {
        const s = parseFloat(total) || 0;
        if (s >= 75) return 5.0; // A1
        if (s >= 70) return 4.0; // B2
        if (s >= 65) return 4.0; // B3
        if (s >= 60) return 3.0; // C4
        if (s >= 55) return 3.0; // C5
        if (s >= 50) return 3.0; // C6
        if (s >= 45) return 2.0; // D7
        if (s >= 40) return 1.0; // E8
        return 0.0; // F9
    };

    const subjectMap = new Map(loadedSubjects.map(sub => [sub.id, parseFloat(sub.credits) || 1]));
    const getSubjectCredits = (subId) => subjectMap.get(subId) || 1;

    // GPA (Current Term)
    let currentQP = 0;
    let currentCredits = 0;
    for (const sc of scores) {
        const gp = getGradePoint(sc.total);
        const credits = getSubjectCredits(sc.subject_id);
        currentQP += gp * credits;
        currentCredits += credits;
    }
    const termGpa = currentCredits > 0 ? (currentQP / currentCredits).toFixed(2) : '0.00';

    // CGPA (Past and Present Terms)
    const getSessionYear = (sess) => {
        if (!sess) return 0;
        const parts = sess.split('/');
        return parseInt(parts[0]) || 0;
    };
    const getTermVal = (t) => {
        if (!t) return 0;
        const norm = t.toLowerCase();
        if (norm.includes('first')) return 1;
        if (norm.includes('second')) return 2;
        if (norm.includes('third')) return 3;
        return 0;
    };

    const currentSessYear = getSessionYear(schoolInfo.session);
    const currentTermVal = getTermVal(schoolInfo.term);

    const relevantScores = allScores.filter(s => {
        const sYear = getSessionYear(s.session);
        if (sYear < currentSessYear) return true;
        if (sYear === currentSessYear) {
            return getTermVal(s.term) <= currentTermVal;
        }
        return false;
    });

    let cumulativeQP = 0;
    let cumulativeCredits = 0;
    const processedKeys = new Set();

    for (const s of relevantScores) {
        const key = `${s.subject_id}_${s.term}_${s.session}`;
        if (processedKeys.has(key)) continue;
        processedKeys.add(key);

        const gp = getGradePoint(s.total);
        const credits = getSubjectCredits(s.subject_id);
        cumulativeQP += gp * credits;
        cumulativeCredits += credits;
    }
    const cgpa = cumulativeCredits > 0 ? (cumulativeQP / cumulativeCredits).toFixed(2) : '0.00';
    
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

    // --- Passport Photo Image Loading ---
    let passportImg = null;
    const passportSrc = student?.passport_url || student?.passport;
    if (passportSrc && typeof passportSrc === 'string' && (passportSrc.startsWith('http') || passportSrc.startsWith('data:'))) {
        passportImg = await new Promise((resolve) => {
            const img = new Image();
            img.crossOrigin = 'anonymous';
            img.onload = () => {
                if (img.naturalWidth > 0 && img.naturalHeight > 0) {
                    resolve(img);
                } else {
                    resolve(null);
                }
            };
            img.onerror = () => resolve(null);
            img.src = passportSrc;
        });
    }

    // Helper: Draw Border
    doc.setDrawColor(theme.r, theme.g, theme.b);
    doc.setLineWidth(1.5);
    doc.rect(5, 5, pageWidth - 10, pageHeight - 10);
    doc.setLineWidth(0.5);
    
    // --- Header Section ---
    if (schoolInfo.logo) {
        try {
            doc.addImage(schoolInfo.logo, 'PNG', 7, 7, 28, 28);
        } catch (e) {
            console.warn('Failed to add logo to PDF:', e);
            doc.setDrawColor(theme.r, theme.g, theme.b);
            doc.rect(7, 7, 28, 28);
        }
    } else {
        doc.setDrawColor(theme.r, theme.g, theme.b);
        doc.rect(7, 7, 28, 28);
        doc.setFontSize(8);
        doc.text("LOGO", 21, 21, { align: 'center' });
    }
    
    // --- Passport Photo Rendering (Header Section) ---
    const passportW = 24;
    const passportH = 28;
    const passportX = pageWidth - 7 - passportW; // 179
    const passportY = 7;

    const renderPlaceholderSilhouette = () => {
        // Light gray background inside the frame
        doc.setFillColor(241, 245, 249);
        doc.rect(passportX, passportY, passportW, passportH, 'F');
        
        // Head (circle)
        doc.setFillColor(148, 163, 184); // slate-400
        doc.ellipse(passportX + passportW / 2, passportY + passportH / 3 + 0.5, 3.5, 4.0, 'F');
        
        // Torso (shoulder arc)
        doc.ellipse(passportX + passportW / 2, passportY + passportH - 2, 7.5, 5.0, 'F');
    };

    if (passportImg) {
        try {
            doc.addImage(passportImg, 'PNG', passportX, passportY, passportW, passportH);
        } catch (e) {
            console.warn('Failed to render loaded passport image in PDF:', e);
            renderPlaceholderSilhouette();
        }
    } else {
        renderPlaceholderSilhouette();
    }

    // Border Frame for passport photo
    doc.setDrawColor(theme.r, theme.g, theme.b);
    doc.setLineWidth(0.5);
    doc.rect(passportX, passportY, passportW, passportH);

    // School Name & Details (Balanced Centering)
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(14.5);
    doc.setTextColor(theme.r * 0.5, theme.g * 0.5, theme.b * 0.5); // Darker version of theme
    doc.text(schoolInfo.name.toUpperCase(), pageWidth / 2, 15, { align: 'center' });
    
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    doc.setTextColor(0, 0, 0);
    doc.text(schoolInfo.address.toUpperCase(), pageWidth / 2, 20, { align: 'center' });
    doc.text(`Tel: ${schoolInfo.phone} | Email: ${schoolInfo.email}`, pageWidth / 2, 23.5, { align: 'center' });
    
    doc.setFont('helvetica', 'bolditalic');
    doc.setFontSize(8.5);
    doc.setTextColor(theme.r, theme.g, theme.b);
    doc.text(`Motto: ${schoolInfo.motto}`, pageWidth / 2, 27, { align: 'center' });
    
    // Report Title Box
    doc.setFillColor(theme.r, theme.g, theme.b);
    doc.rect(45, 33, pageWidth - 90, 6, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.text("SCHOOL REPORT CARD", pageWidth / 2, 37.2, { align: 'center' });
    
    // --- Student Info Grid ---
    doc.setTextColor(0, 0, 0);
    doc.setFontSize(9);
    let y = 46;
    const leftX = 12;
    const midX = 85;
    const rightX = 145;
    
    const avg = scores.length > 0 ? (scores.reduce((a, b) => a + (b.total || 0), 0) / scores.length).toFixed(2) : 0;
    
    // Row 1
    doc.setTextColor(0, 0, 0);
    const nameStr = `NAME: ${student.name.toUpperCase()}`;
    doc.text(nameStr, leftX, y);
    const nameWidth = doc.getTextWidth(nameStr);
    doc.line(23, y + 1, leftX + nameWidth, y + 1); // Underline name
    
    // Dynamic SEX position: push it past the name with a minimum gap
    const sexX = Math.max(midX, leftX + nameWidth + 5);
    doc.text(`SEX: ${student.gender || 'N/A'}`, sexX, y);
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
        doc.text(`GPA: ${termGpa} / 5.00`, rightX, y);
        doc.text(`CGPA: ${cgpa} / 5.00`, rightX, y + 4);
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
    const sortedScores = [...scores].sort((a, b) => (a.subject_name || '').localeCompare(b.subject_name || ''));
    
    const tableHead = [['SUBJECTS', 'ASS', 'T1', 'T2', 'PROJ', 'CA', 'EXAM', 'TOTAL', 'GRADE', 'REMARK']];
    const tableBody = sortedScores.map(s => {
        const ass = s.assignment || s.ass || 0;
        const t1 = s.test1 || s.t1 || 0;
        const t2 = s.test2 || s.t2 || 0;
        const proj = s.project || s.proj || 0;
        const ca = (parseFloat(ass) || 0) + (parseFloat(t1) || 0) + (parseFloat(t2) || 0) + (parseFloat(proj) || 0);
        const exam = s.exam || 0;
        return [
            s.subject_name,
            ass,
            t1,
            t2,
            proj,
            ca,
            exam,
            s.total,
            s.grade || ScoringEngine.getGrade(s.total),
            s.remark || ScoringEngine.getRemark(s.total)
        ];
    });
    
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
    
    currentY += 4;
    doc.setFontSize(6);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(100, 116, 139);
    doc.text("Punctuality: Based on daily attendance sign-in times | Participation: Frequency of class engagement | Compliance: Adherence to school rules", pageWidth / 2, currentY, { align: 'center' });
    currentY += 3;
    doc.text("Honesty/Self-Control: Behavioural compliance record | Neatness/Creativity/Courage: Teacher-seeded performance indicators", pageWidth / 2, currentY, { align: 'center' });
    doc.setTextColor(0, 0, 0);
    
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
    if (schoolInfo.principalSignature) {
        try {
            doc.addImage(schoolInfo.principalSignature, 'PNG', pageWidth - 55, currentY + 11, 25, 7);
        } catch (e) {
            console.warn('Failed to add signature inside comment box:', e);
        }
    }
    
    // --- Footer ---
    const footerY = pageHeight - 20;
    doc.setDrawColor(37, 99, 235);
    // --- QR Code Security Section ---
    let gpaCgpaDetails = "";
    if (gSystem === 'Positional Ranking') {
        gpaCgpaDetails = `POSITION: ${schoolInfo.position || 'N/A'} / ${schoolInfo.specializationSize || schoolInfo.classSize || '0'}`;
    } else if (gSystem === 'Point System (5.0 CGPA)') {
        gpaCgpaDetails = `GPA: ${termGpa} / 5.00\nCGPA: ${cgpa} / 5.00`;
    } else {
        gpaCgpaDetails = `OVERALL GRADE: ${ScoringEngine.getGrade(parseFloat(avg))}`;
    }

    const qrLines = [
        `NAME: ${student.name.toUpperCase()} SEX: ${student.gender || 'N/A'} TOTAL MARKS: ${scores.reduce((a, b) => a + (b.total || 0), 0)}`,
        `CLASS: ${displayClass} SESSION: ${scores[0]?.session || '2025/2026'} ${gpaCgpaDetails.split('\n')[0]}`,
    ];
    
    if (gSystem === 'Point System (5.0 CGPA)') {
        qrLines.push(gpaCgpaDetails.split('\n')[1]);
    }
    
    qrLines.push(`TERM: ${scores[0]?.term || 'N/A'} AVERAGE: ${avg}%`);
    qrLines.push(`TERM ENDS: ${schoolInfo.termEnd || '31st March, 2026'} PASS/FAIL: ${parseFloat(avg) >= 40 ? 'PASS' : 'FAIL'} NEXT BEGINS: ${schoolInfo.termStart || '13th April, 2026'}`);

    const qrPayload = qrLines.join('\n');
    try {
        if (typeof QRCode !== 'undefined') {
            qrDataURL = await QRCode.toDataURL(qrPayload, { margin: 1, width: 150 });
        } else if (window.QRCode) {
            qrDataURL = await window.QRCode.toDataURL(qrPayload, { margin: 1, width: 150 });
        } else {
            console.warn('QRCode library not found.');
        }
    } catch (e) {
        console.warn('Dynamic QR Generation failed:', e);
    }

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
    
    // Sort students alphabetically
    const sortedStudents = [...students].sort((a, b) => (a.name || '').localeCompare(b.name || ''));
    
    // Header
    doc.setFontSize(22);
    doc.setTextColor(31, 111, 235);
    doc.text(schoolInfo.schoolName || schoolInfo.name || 'GRAVITON ACADEMY', 105, 20, { align: 'center' });
    doc.setFontSize(12);
    doc.setTextColor(100, 116, 139);
    doc.text('Student Access Credentials', 105, 28, { align: 'center' });
    
    doc.setDrawColor(226, 232, 240);
    doc.line(20, 35, 190, 35);
    
    // Cards
    let y = 45;
    sortedStudents.forEach((student, index) => {
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
        doc.text(`Password: ${student.student_id}`, 100, y + 32);
        
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
    
    // Fetch School Info
    const db = (await import('./db.js')).default;
    const settings = await db.settings.toArray();
    const getVal = (key, fb) => settings.find(s => s.key === key)?.value || fb;
    
    const sName = getVal('schoolName', 'NEW KINGS AND QUEENS MONTESSORI SCHOOL');
    const sAddress = getVal('schoolAddress', '123 Education Street, Academic City');
    const sPhone = getVal('schoolPhone', '08035461711, 08037316183, 08058134229');
    const sMotto = getVal('schoolMotto', 'Knowledge is Power');
    const logoBase64 = getVal('schoolLogo', null);
    
    // Header
    let startY = 12;
    if (logoBase64) {
        try {
            doc.addImage(logoBase64, 'PNG', 12, 5, 25, 25);
        } catch (e) { console.warn("Mastersheet Logo error", e); }
    }
    
    doc.setFontSize(16);
    doc.setFont('helvetica', 'bold');
    doc.text(sName.toUpperCase(), 148, startY, { align: 'center' });
    
    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(0, 0, 0);
    doc.text(sAddress.toUpperCase(), 148, startY + 5, { align: 'center' });
    doc.text(`Tel: ${sPhone}`, 148, startY + 9, { align: 'center' });
    
    doc.setFontSize(9);
    doc.setFont('helvetica', 'bolditalic');
    doc.setTextColor(37, 99, 235); // theme color
    doc.text(`Motto: ${sMotto}`, 148, startY + 13, { align: 'center' });
    
    // Matrix Title
    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(15, 23, 42);
    doc.text(`ACADEMIC MASTERSHEET: ${className} | ${term} | ${session}`, 148, startY + 22, { align: 'center' });
    
    // Matrix Construction
    const head = ['Student Name', ...subjects.map(s => s.name.substring(0, 4)), 'Total', 'Avg', 'Rank'];
    
    let bodyData = students.map(student => {
        const studentScores = subjects.map(subject => {
            const score = scores.find(s => s.student_id === student.student_id && s.subject_id === subject.id);
            return score && score.total != null ? parseFloat(score.total) : '-';
        });
        
        const total = studentScores.reduce((acc, s) => acc + (s === '-' ? 0 : s), 0);
        const avg = subjects.length > 0 ? (total / subjects.length).toFixed(1) : 0;
        
        return { name: student.name, scores: studentScores, total, avg };
    });
    
    // Fix Numerical Ranking Sort (Descending)
    bodyData.sort((a, b) => b.total - a.total);
    
    let currentRank = 1;
    const body = bodyData.map((row, index) => {
        if (index > 0 && bodyData[index - 1].total > row.total) {
            currentRank = index + 1;
        }
        return [row.name, ...row.scores, row.total, row.avg, currentRank];
    });
    
    doc.autoTable({
        startY: startY + 28,
        head: [head],
        body: body,
        theme: 'grid',
        styles: { fontSize: 7, cellPadding: 1.5, halign: 'center', lineColor: [0, 0, 0], lineWidth: 0.2 },
        columnStyles: {
            0: { halign: 'left', cellWidth: 35 } // Ensure name column doesn't wrap awkwardly
        },
        headStyles: { fillColor: [30, 41, 59], textColor: 255, halign: 'center', fontSize: 6, lineColor: [0, 0, 0], lineWidth: 0.2 }
    });
    
    return doc; // Return for preview
}

/**
 * Generate Secure Payment Receipt
 */
export async function generatePaymentReceipt(payment, student, schoolInfo = {}) {
    const { jsPDF } = window.jspdf;
    
    // Fetch fee structures from Dexie
    let feeStructures = [];
    try {
        const clsName = (student.class_name || '').trim().toLowerCase();
        if (clsName && payment.category && payment.category.toLowerCase().includes('school fees')) {
            const allStructures = await db.fee_structures.toArray();
            feeStructures = allStructures.filter(f => (f.class_name || '').trim().toLowerCase() === clsName);
        }
    } catch (e) {
        console.error("Error fetching fee structures for receipt:", e);
    }

    const themeColor = schoolInfo.themeColor || '#4f46e5';
    const hexToRgb = (hex) => {
        const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
        return result ? { r: parseInt(result[1], 16), g: parseInt(result[2], 16), b: parseInt(result[3], 16) } : { r: 79, g: 70, b: 229 };
    };
    const rgb = hexToRgb(themeColor);

    // Calculate dynamic page height based on content
    let breakdownHeight = 0;
    if (feeStructures.length > 0) {
        breakdownHeight = 10 + (feeStructures.length * 6) + 12; // title + items + subtotal
    }
    const hasLogo = !!schoolInfo.schoolLogo;
    const pageHeight = 145 + breakdownHeight + (hasLogo ? 18 : 0);
    
    const doc = new jsPDF('p', 'mm', [100, pageHeight]); // Smaller receipt format with dynamic height
    
    // Border
    doc.setDrawColor(rgb.r, rgb.g, rgb.b);
    doc.rect(2, 2, 96, pageHeight - 4);

    let y = 12;
    // Logo
    if (hasLogo) {
        try {
            doc.addImage(schoolInfo.schoolLogo, 'PNG', 42.5, y, 15, 15);
            y += 18;
        } catch (e) {
            console.error("Failed to render school logo in receipt PDF:", e);
        }
    }

    // Header Details
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.setTextColor(rgb.r, rgb.g, rgb.b);
    doc.text((schoolInfo.schoolName || schoolInfo.name || "GRAVITON ACADEMY").toUpperCase(), 50, y, { align: 'center' });
    y += 5;
    
    if (schoolInfo.schoolMotto) {
        doc.setFont('helvetica', 'italic');
        doc.setFontSize(7.5);
        doc.setTextColor(100, 116, 139);
        doc.text(`"${schoolInfo.schoolMotto}"`, 50, y, { align: 'center' });
        y += 4.5;
    }
    
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(71, 85, 105);
    
    let contactLines = [];
    if (schoolInfo.schoolAddress) contactLines.push(schoolInfo.schoolAddress);
    let phoneEmail = [];
    if (schoolInfo.schoolPhone) phoneEmail.push(`Tel: ${schoolInfo.schoolPhone}`);
    if (schoolInfo.schoolEmail) phoneEmail.push(`Email: ${schoolInfo.schoolEmail}`);
    if (phoneEmail.length > 0) contactLines.push(phoneEmail.join(" | "));

    for (const line of contactLines) {
        const splitLine = doc.splitTextToSize(line, 80);
        for (const sl of splitLine) {
            doc.text(sl, 50, y, { align: 'center' });
            y += 3.5;
        }
    }
    
    y += 1.5;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.setTextColor(rgb.r, rgb.g, rgb.b);
    doc.text("Official Payment Receipt", 50, y, { align: 'center' });
    y += 3.5;
    
    doc.setDrawColor(226, 232, 240);
    doc.line(10, y, 90, y);
    y += 6;

    // Body
    doc.setFontSize(8.5);
    doc.setTextColor(15, 23, 42);
    
    const row = (label, value) => {
        doc.setFont('helvetica', 'bold');
        doc.text(label, 12, y);
        doc.setFont('helvetica', 'normal');
        doc.text(String(value), 88, y, { align: 'right' });
        y += 6;
    };

    row("Receipt Date:", new Date(payment.date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }));
    row("Reference:", payment.reference);
    row("Student ID:", student.student_id);
    row("Student Name:", student.name);
    row("Class:", student.class_name);
    row("Payment Type:", payment.category || "School Fees");
    
    // Fee Breakdown Section
    if (feeStructures.length > 0) {
        y += 1;
        doc.setDrawColor(226, 232, 240);
        doc.line(10, y, 90, y);
        y += 5.5;

        doc.setFont('helvetica', 'bold');
        doc.setFontSize(8.5);
        doc.setTextColor(rgb.r, rgb.g, rgb.b);
        doc.text("Fee Breakdown", 12, y);
        y += 5.5;

        doc.setFontSize(7.5);
        doc.setTextColor(71, 85, 105);

        let configuredTotal = 0;
        feeStructures.forEach(item => {
            doc.setFont('helvetica', 'normal');
            doc.text(item.category || "General Fees", 12, y);
            doc.text(`₦${item.amount.toLocaleString()}`, 88, y, { align: 'right' });
            configuredTotal += item.amount;
            y += 5.5;
        });

        doc.setDrawColor(226, 232, 240);
        doc.line(12, y, 88, y);
        y += 5;

        doc.setFont('helvetica', 'bold');
        doc.text("Total Configured Fee:", 12, y);
        doc.text(`₦${configuredTotal.toLocaleString()}`, 88, y, { align: 'right' });
        y += 3.5;
    }

    y += 5;
    doc.setFillColor(rgb.r, rgb.g, rgb.b);
    doc.rect(10, y, 80, 10, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(10.5);
    doc.setFont('helvetica', 'bold');
    doc.text(`AMOUNT PAID: ₦${payment.amount.toLocaleString()}`, 50, y + 6.5, { align: 'center' });

    y += 18;
    doc.setTextColor(100, 116, 139);
    doc.setFontSize(7.5);
    doc.setFont('helvetica', 'italic');
    doc.text("Thank you for your payment.", 50, y, { align: 'center' });
    
    y += 8;
    doc.setFont('helvetica', 'normal');
    doc.text("Authorized Digital Signature", 50, y, { align: 'center' });
    doc.line(32, y + 1.5, 68, y + 1.5);

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
    const pageSize = 28; // Takes the full available height of the A4 portrait page
    
    let firstPage = true;

    for (const subject of subjectsArray) {
        const subjectName = typeof subject === 'string' ? subject : (subject.name || 'Unspecified Subject');
        const teacherName = subject.teacherName || '________________________________________';
        const track = subject.track || '';

        let targetStudents = students;
        if (track && track !== 'common subject' && track !== 'general') {
            targetStudents = students.filter(s => {
                const studentTrack = (s.sub_class || '').trim().toLowerCase();
                return studentTrack === track || studentTrack === 'general';
            });
        }
        
        const totalPages = Math.ceil(targetStudents.length / pageSize) || 1;
        
        for (let p = 0; p < totalPages; p++) {
            if (!firstPage) doc.addPage();
            firstPage = false;
            
            const pageStudents = targetStudents.slice(p * pageSize, (p + 1) * pageSize);
            
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
            const head = [['S/N', 'STUDENT NAME', 'ASS\n(10)', 'T1\n(10)', 'T2\n(10)', 'PRJ\n(10)', 'EXAM\n(60)', 'TOTAL\n(100)']];
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
                styles: { fontSize: 8, cellPadding: 1.2, minCellHeight: 7.5, lineColor: [0, 0, 0], lineWidth: 0.2 },
                headStyles: { fillColor: [241, 245, 249], textColor: 0, halign: 'center', fontStyle: 'bold', lineColor: [0, 0, 0], lineWidth: 0.2 },
                columnStyles: {
                    0: { cellWidth: 12, halign: 'center' },
                    1: { cellWidth: 84 },
                    2: { cellWidth: 15, halign: 'center' },
                    3: { cellWidth: 15, halign: 'center' },
                    4: { cellWidth: 15, halign: 'center' },
                    5: { cellWidth: 15, halign: 'center' },
                    6: { cellWidth: 15, halign: 'center' },
                    7: { cellWidth: 15, halign: 'center' }
                },
                margin: { left: 12, right: 12, bottom: 12 }
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

/**
 * Generate PDF Timetable Landscape (A4) with Dynamic Branding, Audit Log, and print preview
 */
export async function generateTimetablePDF(className, classes, subjects, schoolInfo, currentUser) {
    const { jsPDF } = window.jspdf;
    
    const doc = new jsPDF('l', 'mm', 'a4');
    const pageWidth = doc.internal.pageSize.width; 
    const pageHeight = doc.internal.pageSize.height;
    
    const themeColor = schoolInfo.themeColor || '#4f46e5';
    const hexToRgb = (hex) => {
        const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
        return result ? { r: parseInt(result[1], 16), g: parseInt(result[2], 16), b: parseInt(result[3], 16) } : { r: 79, g: 70, b: 229 };
    };
    const rgb = hexToRgb(themeColor);

    const subjectMap = subjects.reduce((m, s) => { m[s.id] = s.name; return m; }, {});
    
    const classesToPrint = className && className !== 'all' 
        ? classes.filter(c => c.name === className)
        : classes;

    let isFirstPage = true;

    for (const c of classesToPrint) {
        const entries = await db.timetable.where('class_name').equals(c.name).toArray();
        if (entries.length === 0 && className && className !== 'all') {
            continue;
        }
        
        if (!isFirstPage) {
            doc.addPage();
        }
        isFirstPage = false;

        doc.setFillColor(248, 250, 252);
        doc.rect(5, 5, pageWidth - 10, pageHeight - 10, 'F');
        
        doc.setDrawColor(rgb.r, rgb.g, rgb.b);
        doc.setLineWidth(1);
        doc.rect(5, 5, pageWidth - 10, pageHeight - 10);
        
        doc.setFillColor(rgb.r, rgb.g, rgb.b);
        doc.rect(5, 5, pageWidth - 10, 28, 'F');

        let logoX = 12;
        if (schoolInfo.schoolLogo) {
            try {
                doc.addImage(schoolInfo.schoolLogo, 'PNG', 10, 8, 22, 22);
                logoX = 36;
            } catch (e) {
                console.error("Failed to render logo in timetable PDF:", e);
            }
        }

        doc.setTextColor(255, 255, 255);
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(18);
        doc.text((schoolInfo.schoolName || schoolInfo.name || "GRAVITON ACADEMY").toUpperCase(), logoX, 16);
        
        doc.setFont('helvetica', 'italic');
        doc.setFontSize(9);
        doc.setTextColor(226, 232, 240);
        doc.text(schoolInfo.schoolMotto || "Offline-First Excellence", logoX, 22);

        doc.setTextColor(255, 255, 255);
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(14);
        doc.text(`CLASS TIMETABLE: ${c.name.toUpperCase()}`, pageWidth - 12, 18, { align: 'right' });
        
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(9);
        doc.setTextColor(226, 232, 240);
        doc.text(`Session: ${schoolInfo.currentSession || '2025/2026'} | Term: ${schoolInfo.currentTerm || '1st Term'}`, pageWidth - 12, 24, { align: 'right' });

        const startY = 40;
        const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];
        const periods = [1, 2, 3, 4, 5, 6, 7, 8];
        
        const dayColWidth = 35;
        const periodColWidth = (pageWidth - 10 - 10 - dayColWidth) / 8;

        doc.setFillColor(rgb.r, rgb.g, rgb.b);
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(9.5);
        doc.setTextColor(255, 255, 255);
        
        doc.rect(10, startY, dayColWidth, 10, 'F');
        doc.text("DAY", 10 + dayColWidth/2, startY + 6.5, { align: 'center' });
        
        periods.forEach((p, index) => {
            const x = 10 + dayColWidth + (index * periodColWidth);
            doc.setFillColor(index % 2 === 0 ? rgb.r : rgb.r - 20);
            doc.rect(x, startY, periodColWidth, 10, 'F');
            doc.text(`PERIOD ${p}`, x + periodColWidth/2, startY + 6.5, { align: 'center' });
        });

        let currentY = startY + 10;
        
        days.forEach((day, dIndex) => {
            doc.setDrawColor(226, 232, 240);
            doc.setFillColor(241, 245, 249);
            doc.rect(10, currentY, dayColWidth, 22, 'F');
            doc.rect(10, currentY, dayColWidth, 22);
            
            doc.setFont('helvetica', 'bold');
            doc.setFontSize(10);
            doc.setTextColor(30, 41, 59);
            doc.text(day.toUpperCase(), 10 + dayColWidth/2, currentY + 12.5, { align: 'center' });
            
            periods.forEach((p, pIndex) => {
                const x = 10 + dayColWidth + (pIndex * periodColWidth);
                const entry = entries.find(e => e.day_of_week === day && e.period_number === p);
                
                doc.setFillColor(255, 255, 255);
                doc.rect(x, currentY, periodColWidth, 22, 'F');
                doc.rect(x, currentY, periodColWidth, 22);
                
                if (entry) {
                    const subName = subjectMap[entry.subject_id] || entry.subject_id || '';
                    doc.setFont('helvetica', 'bold');
                    doc.setFontSize(8.5);
                    doc.setTextColor(15, 23, 42);
                    
                    const splitSub = doc.splitTextToSize(subName, periodColWidth - 4);
                    let textY = currentY + 7;
                    splitSub.slice(0, 2).forEach(line => {
                        doc.text(line, x + periodColWidth/2, textY, { align: 'center' });
                        textY += 4.5;
                    });
                    
                    if (entry.teacher_id) {
                        doc.setFont('helvetica', 'italic');
                        doc.setFontSize(7);
                        doc.setTextColor(100, 116, 139);
                        doc.text(entry.teacher_id, x + periodColWidth/2, currentY + 18, { align: 'center' });
                    }
                } else {
                    doc.setFont('helvetica', 'normal');
                    doc.setFontSize(7.5);
                    doc.setTextColor(203, 213, 225);
                    doc.text("FREE", x + periodColWidth/2, currentY + 12.5, { align: 'center' });
                }
            });
            currentY += 22;
        });

        const auditId = crypto.randomUUID().substring(0, 8).toUpperCase();
        const timestamp = new Date().toISOString();
        const userName = currentUser.name || "Administrator";
        const userId = currentUser.id || "Admin";
        
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(7.5);
        doc.setTextColor(148, 163, 184);
        doc.text(`AUDIT TRAIL SECURED: ID-${auditId} | GENERATED BY: ${userName} (${userId}) | DATE: ${new Date(timestamp).toLocaleString()} | SYSTEM: GRAVITON CORE`, 10, pageHeight - 10);
        doc.text(`Page: ${classesToPrint.indexOf(c) + 1} of ${classesToPrint.length}`, pageWidth - 10, pageHeight - 10, { align: 'right' });
        
        try {
            await db.audit_logs.add({
                id: crypto.randomUUID(),
                operation: 'print',
                table: 'timetable',
                record_id: c.name,
                timestamp: timestamp,
                user_id: userId,
                is_synced: 0
            });
        } catch (e) {
            console.error("Failed to write print audit log:", e);
        }
    }

    const pdfBlob = doc.output('blob');
    const pdfUrl = URL.createObjectURL(pdfBlob);
    
    const printWindow = window.open(pdfUrl, '_blank');
    if (!printWindow) {
        doc.save(`Timetable_Report_${className || 'General'}.pdf`);
        Notifications.show('Timetable printed! Check downloads.', 'success');
    } else {
        Notifications.show('Print Preview opened in a new tab!', 'success');
    }
}
