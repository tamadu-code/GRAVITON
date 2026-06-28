import db from './db.js';

/**
 * Graviton CMS - Utility Module
 * Logic for Scoring, PDF Reports, and Excel Imports
 */

const getBaseClassName = (name) => {
    if (!name) return '';
    let base = name.split(' (')[0];
    return base.replace(/([0-9])\s*[A-Z]$/i, '$1').trim();
};

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

        // Robust check for daily school attendance vs subject-based attendance
        const isSchoolRecord = (a) => {
            const isSubj = a.is_subject_based;
            if (isSubj === true || isSubj === 1 || String(isSubj).trim().toLowerCase() === 'true' || String(isSubj).trim() === '1') {
                return false;
            }
            return true;
        };

        const schoolAtt = attendance.filter(a => isSchoolRecord(a));
        const subjectAtt = attendance.filter(a => !isSchoolRecord(a));

        // Case-insensitive status mapper
        const getStatus = (a) => (a.status || '').trim().toLowerCase();

        // 1. Punctuality: % of On-Time arrivals
        const totalSchool = schoolAtt.length;
        const onTime = schoolAtt.filter(a => getStatus(a) === 'present').length;
        const late = schoolAtt.filter(a => getStatus(a) === 'late').length;
        const punctPct = totalSchool > 0 ? (onTime / totalSchool) * 100 : 60;

        // Overall Attendance Rate: % of days present or late
        const attPct = totalSchool > 0 ? ((onTime + late) / totalSchool) * 100 : 75;
        
        // 2. Participation & Compliance
        let participationPct;
        let compliancePct;

        if (subjectAtt.length > 0) {
            // If they have subject-based attendance, use the ratio of Subject Attendance to School Attendance
            const schoolDays = new Set(schoolAtt.map(a => a.date)).size || 1;
            const subjectsPerDay = subjectAtt.length / schoolDays;
            participationPct = Math.min(100, (subjectsPerDay / 6) * 100); // Assuming 6 subjects a day average
            compliancePct = Math.min(100, participationPct + 20);
        } else {
            // Fallback: If no subject-based attendance is recorded, derive from daily attendance
            participationPct = attPct;
            compliancePct = (attPct * 0.6) + (punctPct * 0.4);
        }

        // Mapping function 0-100 to 1-5
        const mapTo5 = (pct) => {
            if (pct >= 90) return 5;
            if (pct >= 80) return 4;
            if (pct >= 60) return 3;
            if (pct >= 40) return 2;
            return 1;
        };

        // Stable Seeded Qualitative traits (to maintain individual uniqueness baseline)
        const getSeedRating = (str, offset = 0) => {
            let hash = 0;
            for (let i = 0; i < str.length; i++) hash = str.charCodeAt(i) + ((hash << 5) - hash);
            return 3 + (Math.abs(hash + offset) % 3); // Returns 3, 4, or 5
        };

        const baseNeatness = getSeedRating(student.name, 20);
        const baseCreativity = getSeedRating(student.name, 10);
        const baseCourage = getSeedRating(student.name, 30);
        const baseSelfControl = getSeedRating(student.name, 40);
        const baseHonesty = getSeedRating(student.name, 50);

        // Blending dynamic attendance metrics with seeded baseline (70% attendance metric, 30% seed)
        const blendScore = (metricPct, baseSeed) => {
            const metricScore = mapTo5(metricPct);
            return Math.max(1, Math.min(5, Math.round((metricScore * 0.7) + (baseSeed * 0.3))));
        };

        return {
            punctuality: mapTo5(punctPct),
            participation: mapTo5(participationPct),
            compliance: mapTo5(compliancePct),
            self_control: blendScore((punctPct * 0.6) + (attPct * 0.4), baseSelfControl),
            honesty: blendScore(compliancePct > 80 ? 100 : 60, baseHonesty),
            creativity: blendScore((participationPct * 0.7) + (attPct * 0.3), baseCreativity),
            neatness: blendScore((punctPct * 0.6) + (attPct * 0.4), baseNeatness),
            courage: blendScore((participationPct * 0.8) + (punctPct * 0.2), baseCourage)
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
    
    // Format Term Dates (e.g. 2026-08-19 -> 19th August, 2026)
    const formatTermDate = (dateStr) => {
        if (!dateStr) return '';
        if (!dateStr.includes('-')) return dateStr;
        const parts = dateStr.split('-');
        if (parts.length !== 3) return dateStr;
        const year = parseInt(parts[0], 10);
        const monthIdx = parseInt(parts[1], 10) - 1;
        const day = parseInt(parts[2], 10);
        if (isNaN(year) || isNaN(monthIdx) || isNaN(day)) return dateStr;
        if (monthIdx < 0 || monthIdx > 11 || day < 1 || day > 31) return dateStr;
        const months = [
            "January", "February", "March", "April", "May", "June",
            "July", "August", "September", "October", "November", "December"
        ];
        const month = months[monthIdx];
        let suffix = 'th';
        const lastDigit = day % 10;
        const lastTwoDigits = day % 100;
        if (lastTwoDigits >= 11 && lastTwoDigits <= 13) {
            suffix = 'th';
        } else if (lastDigit === 1) {
            suffix = 'st';
        } else if (lastDigit === 2) {
            suffix = 'nd';
        } else if (lastDigit === 3) {
            suffix = 'rd';
        }
        return `${day}${suffix} ${month}, ${year}`;
    };

    if (schoolInfo) {
        if (schoolInfo.termEnd) schoolInfo.termEnd = formatTermDate(schoolInfo.termEnd);
        if (schoolInfo.termStart) schoolInfo.termStart = formatTermDate(schoolInfo.termStart);
    }
    
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
        if (sc.total === null || sc.total === undefined || sc.total === '') continue;
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
    
    const scoredEntries = scores.filter(s => s.total !== null && s.total !== undefined && s.total !== '');
    const avg = scoredEntries.length > 0 ? (scoredEntries.reduce((a, b) => a + (parseFloat(b.total) || 0), 0) / scoredEntries.length).toFixed(2) : 0;
    
    // Row 1
    doc.setTextColor(0, 0, 0);
    const nameStr = `NAME: ${student.name.toUpperCase()}`;
    doc.text(nameStr, leftX, y);
    const nameWidth = doc.getTextWidth(nameStr);
    doc.line(23, y + 1, leftX + nameWidth, y + 1); // Underline name
    
    // Dynamic SEX position: push it past the name with a minimum gap
    const sexX = Math.max(midX, leftX + nameWidth + 5);
    doc.text(`SEX: ${student.gender || 'N/A'}`, sexX, y);
    doc.text(`TOTAL MARKS: ${scoredEntries.reduce((a, b) => a + (parseFloat(b.total) || 0), 0)}`, rightX, y);
    
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
        doc.text(`POSITION: ${schoolInfo.position || 'N/A'}`, rightX, y);
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
    const isThirdTerm = (schoolInfo.term || '').toLowerCase().includes('third');
    if (isThirdTerm) {
        const decision = parseFloat(avg) >= 40 ? 'PROMOTED' : 'REPEAT';
        const decisionColor = parseFloat(avg) >= 40 ? [0, 128, 0] : [200, 0, 0];
        doc.setTextColor(...decisionColor);
        doc.setFont('helvetica', 'bold');
        doc.text(`DECISION: ${decision}`, midX, y);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(0, 0, 0);
    } else {
        doc.text(`PASS/FAIL: ${parseFloat(avg) >= 40 ? 'PASS' : 'FAIL'}`, midX, y);
    }
    doc.text(`NEXT BEGINS: ${schoolInfo.termStart || '13th April, 2026'}`, rightX, y);
    
    // --- Subjects Table ---
    const sortedScores = [...scores].sort((a, b) => (a.subject_name || '').localeCompare(b.subject_name || ''));
    
    const tableHead = [['SUBJECTS', 'ASS', 'T1', 'T2', 'PROJ', 'CA', 'EXAM', 'TOTAL', 'GRADE', 'REMARK']];
    // Helper: treat null/undefined/'' as "no score entered" -> display blank
    const _scVal = (v) => (v !== null && v !== undefined && v !== '' && v !== 0) ? v : (v === 0 ? 0 : '');
    const _scNum = (v) => (v !== null && v !== undefined && v !== '') ? (parseFloat(v) || 0) : null;

    const tableBody = sortedScores.map(s => {
        const assRaw = s.assignment ?? s.ass ?? '';
        const t1Raw = s.test1 ?? s.t1 ?? '';
        const t2Raw = s.test2 ?? s.t2 ?? '';
        const projRaw = s.project ?? s.proj ?? '';
        const examRaw = s.exam ?? '';

        const ass = _scVal(assRaw);
        const t1 = _scVal(t1Raw);
        const t2 = _scVal(t2Raw);
        const proj = _scVal(projRaw);
        const exam = _scVal(examRaw);

        // CA: sum only entered components; blank if none entered
        const caComponents = [assRaw, t1Raw, t2Raw, projRaw].map(_scNum).filter(v => v !== null);
        const ca = caComponents.length > 0 ? caComponents.reduce((a, b) => a + b, 0) : '';

        // Total, grade, remark: use the stored total if it exists, else blank
        const hasTotal = s.total !== null && s.total !== undefined && s.total !== '';
        const total = hasTotal ? s.total : '';
        const grade = hasTotal ? (s.grade || ScoringEngine.getGrade(s.total)) : '';
        const remark = hasTotal ? (s.remark || ScoringEngine.getRemark(s.total)) : '';

        return [
            s.subject_name,
            ass,
            t1,
            t2,
            proj,
            ca,
            exam,
            total,
            grade,
            remark
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
    doc.text("Honesty/Self-Control: Behavioural compliance record | Neatness/Creativity/Courage: Attendance & engagement-derived indicators", pageWidth / 2, currentY, { align: 'center' });
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
    doc.text(`Name: ${schoolInfo.principalName || ''}`, 12, currentY + 18);
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
        gpaCgpaDetails = `POSITION: ${schoolInfo.position || 'N/A'}`;
    } else if (gSystem === 'Point System (5.0 CGPA)') {
        gpaCgpaDetails = `GPA: ${termGpa} / 5.00\nCGPA: ${cgpa} / 5.00`;
    } else {
        gpaCgpaDetails = `OVERALL GRADE: ${ScoringEngine.getGrade(parseFloat(avg))}`;
    }

    const qrLines = [
        `NAME: ${student.name.toUpperCase()} SEX: ${student.gender || 'N/A'} TOTAL MARKS: ${scoredEntries.reduce((a, b) => a + (parseFloat(b.total) || 0), 0)}`,
        `CLASS: ${displayClass} SESSION: ${scores[0]?.session || '2025/2026'} ${gpaCgpaDetails.split('\n')[0]}`,
    ];
    
    if (gSystem === 'Point System (5.0 CGPA)') {
        qrLines.push(gpaCgpaDetails.split('\n')[1]);
    }
    
    qrLines.push(`TERM: ${scores[0]?.term || 'N/A'} AVERAGE: ${avg}%`);
    const isThirdTermQR = (schoolInfo.term || '').toLowerCase().includes('third');
    const passFailOrDecision = isThirdTermQR
        ? `DECISION: ${parseFloat(avg) >= 40 ? 'PROMOTED' : 'REPEAT'}`
        : `PASS/FAIL: ${parseFloat(avg) >= 40 ? 'PASS' : 'FAIL'}`;
    qrLines.push(`TERM ENDS: ${schoolInfo.termEnd || '31st March, 2026'} ${passFailOrDecision} NEXT BEGINS: ${schoolInfo.termStart || '13th April, 2026'}`);

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
    doc.text(schoolInfo.schoolName || schoolInfo.name || '', 105, 20, { align: 'center' });
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
    
    return doc;
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
    
    const sName = getVal('schoolName', localStorage.getItem('tenant_school_name') || '');
    const sAddress = getVal('schoolAddress', '');
    const sPhone = getVal('schoolPhone', '');
    const sMotto = getVal('schoolMotto', '');
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
    
    // Fix Numerical Ranking Sort (Descending by Average)
    bodyData.sort((a, b) => parseFloat(b.avg) - parseFloat(a.avg));
    
    let currentRank = 1;
    const body = bodyData.map((row, index) => {
        if (index > 0 && parseFloat(bodyData[index - 1].avg) > parseFloat(row.avg)) {
            currentRank++; // Dense ranking: no gaps after ties
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
    doc.text((schoolInfo.schoolName || schoolInfo.name || '').toUpperCase(), 50, y, { align: 'center' });
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
            doc.text(`NGN ${item.amount.toLocaleString()}`, 88, y, { align: 'right' });
            configuredTotal += item.amount;
            y += 5.5;
        });

        doc.setDrawColor(226, 232, 240);
        doc.line(12, y, 88, y);
        y += 5;

        doc.setFont('helvetica', 'bold');
        doc.text("Total Configured Fee:", 12, y);
        doc.text(`NGN ${configuredTotal.toLocaleString()}`, 88, y, { align: 'right' });
        y += 3.5;
    }

    y += 5;
    doc.setFillColor(rgb.r, rgb.g, rgb.b);
    doc.rect(10, y, 80, 10, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(10.5);
    doc.setFont('helvetica', 'bold');
    doc.text(`AMOUNT PAID: NGN ${payment.amount.toLocaleString()}`, 50, y + 6.5, { align: 'center' });

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
            const schoolName = schoolInfo.schoolName || '';
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
export async function generateTimetablePDF(className, classes, subjects, schoolInfo, currentUser, entriesOverride = null) {
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
        ? classes.filter(c => getBaseClassName(c.name).toLowerCase() === getBaseClassName(className).toLowerCase())
        : classes;

    const allDbEntries = entriesOverride ? null : await db.timetable.toArray();
    let isFirstPage = true;

    for (const c of classesToPrint) {
        const entries = entriesOverride
            ? entriesOverride.filter(e => getBaseClassName(e.class_name).toLowerCase() === getBaseClassName(c.name).toLowerCase())
            : allDbEntries.filter(e => getBaseClassName(e.class_name).toLowerCase() === getBaseClassName(c.name).toLowerCase());
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
        doc.text((schoolInfo.schoolName || schoolInfo.name || '').toUpperCase(), logoX, 16);
        
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
                const isThursday = day.toLowerCase() === 'thursday';
                const isFriday = day.toLowerCase() === 'friday';
                const baseClassLower = getBaseClassName(c.name).toLowerCase();
                
                let isSpecial = false;
                let specialText = '';
                let specialBg = [255, 255, 255];
                let specialFg = [15, 23, 42];
                
                if (isThursday && p === 5) {
                    isSpecial = true;
                    specialText = 'FASTING & PRAYER';
                    specialBg = [237, 233, 254]; // #ede9fe
                    specialFg = [91, 33, 182]; // #5b21b6
                } else if (isFriday && (p === 3 || p === 4)) {
                    isSpecial = true;
                    specialText = 'SPORTS';
                    specialBg = [224, 242, 254]; // #e0f2fe
                    specialFg = [3, 105, 161]; // #0369a1
                } else if (isThursday && baseClassLower === 'jss 1' && p === 6) {
                    isSpecial = true;
                    specialText = 'COMP. PRACT.';
                    specialBg = [224, 242, 254]; // Light blue
                    specialFg = [3, 105, 161];
                } else if (isThursday && baseClassLower === 'jss 2' && p === 7) {
                    isSpecial = true;
                    specialText = 'COMP. PRACT.';
                    specialBg = [224, 242, 254];
                    specialFg = [3, 105, 161];
                } else if (isThursday && baseClassLower === 'jss 3' && p === 8) {
                    isSpecial = true;
                    specialText = 'COMP. PRACT.';
                    specialBg = [224, 242, 254];
                    specialFg = [3, 105, 161];
                } else if (isFriday && baseClassLower === 'sss 1' && p === 6) {
                    isSpecial = true;
                    specialText = 'COMP. PRACT.';
                    specialBg = [224, 242, 254];
                    specialFg = [3, 105, 161];
                } else if (isFriday && baseClassLower === 'sss 2' && p === 7) {
                    isSpecial = true;
                    specialText = 'COMP. PRACT.';
                    specialBg = [224, 242, 254];
                    specialFg = [3, 105, 161];
                } else if (isFriday && baseClassLower === 'sss 3' && p === 8) {
                    isSpecial = true;
                    specialText = 'COMP. PRACT.';
                    specialBg = [224, 242, 254];
                    specialFg = [3, 105, 161];
                }
                
                if (isSpecial) {
                    doc.setFillColor(specialBg[0], specialBg[1], specialBg[2]);
                    doc.rect(x, currentY, periodColWidth, 22, 'F');
                    doc.rect(x, currentY, periodColWidth, 22);
                    
                    doc.setFont('helvetica', 'bold');
                    doc.setFontSize(8);
                    doc.setTextColor(specialFg[0], specialFg[1], specialFg[2]);
                    
                    const splitText = doc.splitTextToSize(specialText, periodColWidth - 4);
                    let textY = currentY + 11 - ((splitText.length - 1) * 2.2);
                    splitText.forEach(line => {
                        doc.text(line, x + periodColWidth/2, textY, { align: 'center' });
                        textY += 4;
                    });
                } else {
                    const entry = entries.find(e => (e.day_of_week || '').toLowerCase() === day.toLowerCase() && e.period_number === p);
                    
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

    const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) || window.innerWidth <= 768;
    if (isMobile) {
        doc.save(`Timetable_Report_${className || 'General'}.pdf`);
        Notifications.show('Timetable downloaded successfully!', 'success');
        return;
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

/**
 * Generate Result Checking PIN Slip (Receipt-style PDF)
 * Allows parents/students to print out their PIN for offline reference
 */
export async function generatePinSlipPDF(pinData, schoolInfo = {}) {
    const { jsPDF } = window.jspdf;
    
    const themeColor = schoolInfo.themeColor || '#060495';
    const hexToRgb = (hex) => {
        const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
        return result ? { r: parseInt(result[1], 16), g: parseInt(result[2], 16), b: parseInt(result[3], 16) } : { r: 6, g: 4, b: 149 };
    };
    const rgb = hexToRgb(themeColor);
    
    const pageHeight = 165;
    const doc = new jsPDF('p', 'mm', [100, pageHeight]);
    
    // Border
    doc.setDrawColor(rgb.r, rgb.g, rgb.b);
    doc.setLineWidth(1);
    doc.rect(2, 2, 96, pageHeight - 4);
    
    // Inner decorative line
    doc.setLineWidth(0.3);
    doc.rect(4, 4, 92, pageHeight - 8);
    
    let y = 14;
    
    // Logo
    if (schoolInfo.schoolLogo) {
        try {
            doc.addImage(schoolInfo.schoolLogo, 'PNG', 42.5, y, 15, 15);
            y += 18;
        } catch (e) {
            console.error("Failed to render school logo in PIN slip:", e);
        }
    }
    
    // School Name
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.setTextColor(rgb.r, rgb.g, rgb.b);
    doc.text((schoolInfo.schoolName || schoolInfo.name || '').toUpperCase(), 50, y, { align: 'center' });
    y += 4;
    
    // Motto
    if (schoolInfo.schoolMotto) {
        doc.setFont('helvetica', 'italic');
        doc.setFontSize(7);
        doc.setTextColor(100, 116, 139);
        doc.text(`"${schoolInfo.schoolMotto}"`, 50, y, { align: 'center' });
        y += 3.5;
    }
    
    // Address
    if (schoolInfo.schoolAddress) {
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(6.5);
        doc.setTextColor(100, 116, 139);
        doc.text(schoolInfo.schoolAddress, 50, y, { align: 'center' });
        y += 3.5;
    }
    
    // Phone
    if (schoolInfo.schoolPhone) {
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(6.5);
        doc.text(`Tel: ${schoolInfo.schoolPhone}`, 50, y, { align: 'center' });
        y += 4;
    }
    
    // Title
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.setTextColor(rgb.r, rgb.g, rgb.b);
    doc.text("RESULT CHECKING PIN", 50, y, { align: 'center' });
    y += 2;
    
    // Decorative line
    doc.setDrawColor(rgb.r, rgb.g, rgb.b);
    doc.setLineWidth(0.5);
    doc.line(15, y, 85, y);
    y += 6;
    
    // Student details
    doc.setFontSize(8);
    doc.setTextColor(15, 23, 42);
    
    const row = (label, value) => {
        doc.setFont('helvetica', 'bold');
        doc.text(label, 12, y);
        doc.setFont('helvetica', 'normal');
        doc.text(String(value || 'N/A'), 88, y, { align: 'right' });
        y += 5.5;
    };
    
    row("Student Name:", pinData.studentName || 'N/A');
    row("Student ID:", pinData.studentId || 'N/A');
    row("Class:", pinData.className || 'N/A');
    row("Date Issued:", new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }));
    
    y += 2;
    
    // PIN Code box
    doc.setFillColor(248, 250, 252);
    doc.setDrawColor(rgb.r, rgb.g, rgb.b);
    doc.setLineWidth(1);
    doc.roundedRect(10, y, 80, 28, 3, 3, 'FD');
    
    doc.setFontSize(7);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(rgb.r, rgb.g, rgb.b);
    doc.text("PIN CODE", 50, y + 6, { align: 'center' });
    
    doc.setFontSize(16);
    doc.setFont('courier', 'bold');
    doc.setTextColor(15, 23, 42);
    doc.text(pinData.pinCode || '0000000000', 50, y + 16, { align: 'center' });
    
    doc.setFontSize(7);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(100, 116, 139);
    doc.text(`Serial: ${pinData.serial || 'N/A'}`, 50, y + 23, { align: 'center' });
    
    y += 33;
    
    // Usage info
    doc.setFontSize(7);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(100, 116, 139);
    doc.text(`Usage Limit: ${pinData.usageLimit || 5} times`, 50, y, { align: 'center' });
    y += 4;
    doc.text(`Status: ${pinData.status || 'Active'}`, 50, y, { align: 'center' });
    
    y += 8;
    
    // Footer
    doc.setDrawColor(226, 232, 240);
    doc.line(15, y, 85, y);
    y += 5;
    
    doc.setFont('helvetica', 'italic');
    doc.setFontSize(6.5);
    doc.setTextColor(148, 163, 184);
    doc.text("Keep this slip safe. Use the PIN code above", 50, y, { align: 'center' });
    y += 3;
    doc.text("to check your result on the school portal.", 50, y, { align: 'center' });
    y += 5;
    
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(6);
    doc.setTextColor(rgb.r, rgb.g, rgb.b);
    doc.text("POWERED BY GRAVITON CMS", 50, y, { align: 'center' });
    
    return doc;
}

/**
 * Generate General School Timetable (Single-page Landscape A4 PDF)
 * Groups all classes by day with BREAK, FASTING AND PRAYERS, and SPORTS columns.
 */
export async function generateGeneralSchoolTimetablePDF(classes, subjects, schoolInfo = {}, currentUser = {}, entriesOverride = null) {
    const { jsPDF } = window.jspdf;
    
    // Set up Landscape A4 document
    const doc = new jsPDF('l', 'mm', 'a4');
    const pageWidth = doc.internal.pageSize.width; // 297mm
    const pageHeight = doc.internal.pageSize.height; // 210mm
    
    const themeColor = schoolInfo.themeColor || '#060495';
    const hexToRgb = (hex) => {
        const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
        return result ? { r: parseInt(result[1], 16), g: parseInt(result[2], 16), b: parseInt(result[3], 16) } : { r: 6, g: 4, b: 149 };
    };
    const rgb = hexToRgb(themeColor);
    
    // Draw outer boundary and top background block
    doc.setFillColor(255, 255, 255);
    doc.rect(0, 0, pageWidth, pageHeight, 'F');
    
    // Top banner
    doc.setFillColor(rgb.r, rgb.g, rgb.b);
    doc.rect(5, 5, pageWidth - 10, 22, 'F');
    
    // Title text
    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(14);
    doc.text((schoolInfo.schoolName || schoolInfo.name || '').toUpperCase(), pageWidth / 2, 12, { align: 'center' });
    
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9.5);
    doc.setTextColor(226, 232, 240);
    doc.text(`TIME TABLE FOR ${schoolInfo.currentSession || '2025/2026'} ACADEMIC SESSION`, pageWidth / 2, 18, { align: 'center' });
    
    // Fetch all timetable records from DB
    const allEntries = entriesOverride || await db.timetable.toArray();
    const subjectMap = subjects.reduce((m, s) => { m[s.id] = s.name; return m; }, {});
    
    // Target classes configuration
    const targetRows = [
        { name: 'JSS 1', stream: null, label: 'JSS1' },
        { name: 'JSS 2', stream: null, label: 'JSS2' },
        { name: 'JSS 3', stream: null, label: 'JSS3' },
        { name: 'SSS 1', stream: null, label: 'SSS1' },
        { name: 'SSS 2', stream: 'Arts', label: 'SSS2 (A)' },
        { name: 'SSS 2', stream: 'Science', label: 'SSS2 (S)' },
        { name: 'SSS 3', stream: 'Arts', label: 'SSS3 (A)' },
        { name: 'SSS 3', stream: 'Science', label: 'SSS3 (S)' }
    ];
    
    const getDbClassName = (targetName, dbClasses) => {
        const targetNormalized = getBaseClassName(targetName).toLowerCase();
        const match = dbClasses.find(c => getBaseClassName(c.name).toLowerCase() === targetNormalized);
        return match ? match.name : targetName;
    };
    
    const rowsConfig = targetRows.map(tr => ({
        dbName: getDbClassName(tr.name, classes),
        stream: tr.stream,
        label: tr.label
    }));
    
    const getShortSubjectName = (subjectId, subMap) => {
        const fullName = subMap[subjectId] || subjectId || '';
        if (!fullName) return '';
        
        const lower = fullName.toLowerCase().trim();
        if (lower.includes('christian religious knowledge') || lower === 'crk' || lower === 'c.r.k') return 'C.R.K';
        if (lower.includes('business studies') || lower.includes('bus std')) return 'BUS. STD';
        if (lower.includes('literature in english') || lower.includes('lit in eng')) return 'LIT-IN-ENG';
        if (lower.includes('english language') || lower.includes('english')) return 'ENGLISH';
        if (lower.includes('mathematics') || lower.includes('maths')) return 'MATHS';
        if (lower.includes('basic science')) return 'BASIC SCI';
        if (lower.includes('agricultural science') || lower === 'agricultural sci' || lower === 'agric') return 'AGRIC. SCI';
        if (lower.includes('creative and cultural art') || lower.includes('cca')) return 'C.C.A';
        if (lower.includes('physical and health') || lower === 'phe' || lower === 'p.h.e') return 'P.H.E';
        if (lower.includes('social studies')) return 'SOC. STD';
        if (lower.includes('civic education') || lower === 'civic') return 'CIVIC';
        if (lower.includes('home economics') || lower === 'home ec') return 'HOME ECON';
        if (lower.includes('digital technology') || lower.includes('dig tech')) return 'DIG. TECH';
        if (lower.includes('financial accounting') || lower === 'accounting' || lower === 'account') return 'ACCOUNT';
        if (lower.includes('history')) return 'HISTORY';
        if (lower.includes('geography')) return 'GEOGRAPHY';
        if (lower.includes('biology')) return 'BIOLOGY';
        if (lower.includes('chemistry')) return 'CHEMISTRY';
        if (lower.includes('physics')) return 'PHYSICS';
        if (lower.includes('economics') || lower === 'econs') return 'ECONS';
        if (lower.includes('commerce')) return 'COMMERCE';
        if (lower.includes('government') || lower === 'govt') return 'GOVT';
        if (lower.includes('marketing') || lower === 'mkt') return 'MARKETING';
        if (lower.includes('science practical')) return 'SCI. PRACT';
        if (lower.includes('fine art') || lower.includes('fine arts')) return 'FINE ART';
        if (lower.includes('shs') || lower.includes('s.h.s')) return 'S.H.S';
        if (lower.includes('chs') || lower.includes('c.h.s')) return 'C.H.S';
        
        if (fullName.length > 12) {
            const words = fullName.split(/\s+/);
            if (words.length > 1) {
                return words.map(w => w[0].toUpperCase()).join('.');
            }
            return fullName.substring(0, 10) + '.';
        }
        return fullName;
    };
    
    const matchEntry = (entries, day, className, stream, periodNum) => {
        return entries.find(e => {
            const entryDay = (e.day_of_week || '').toLowerCase();
            const entryClass = getBaseClassName(e.class_name).toLowerCase();
            const targetClass = getBaseClassName(className).toLowerCase();
            const entryStream = (e.sub_class || '').toLowerCase();
            const targetStream = (stream || '').toLowerCase();
            
            return entryDay === day.toLowerCase() &&
                   entryClass === targetClass &&
                   (entryStream === targetStream || (!entryStream && !targetStream)) &&
                   e.period_number === periodNum;
        });
    };
    
    const toVerticalText = (str) => {
        return str.split('').map(c => c === ' ' ? '\n' : c).join('\n');
    };
    
    // Build Table Body
    const body = [];
    const daysList = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];
    
    for (const day of daysList) {
        const isThursday = day.toLowerCase() === 'thursday';
        const isFriday = day.toLowerCase() === 'friday';
        const dayEntries = allEntries.filter(e => (e.day_of_week || '').toLowerCase() === day.toLowerCase());
        
        // Initialize 8 rows x 11 columns grid for this day
        const grid = Array.from({ length: 8 }, () => Array.from({ length: 11 }, () => null));
        
        // 1. DAYS Column (Column 0, spans all 8 class rows)
        grid[0][0] = {
            content: day.toUpperCase(),
            isDayCell: true,
            rowSpan: 8,
            colSpan: 1
        };
        
        // 2. CLASS Column (Column 1)
        for (let r = 0; r < 8; r++) {
            grid[r][1] = {
                content: rowsConfig[r].label,
                isClassCell: true,
                rowSpan: 1,
                colSpan: 1
            };
        }
        
        // 3. BREAK Column (Column 7, spans all 8 class rows, 11:30 - 12:00)
        grid[0][7] = {
            content: toVerticalText('BREAK'),
            isBreakCell: true,
            rowSpan: 8,
            colSpan: 1
        };
        
        // 4. Special Column: Thursday FASTING AND PRAYERS (Column 6, spans all 8 rows, replaces Period 5)
        if (isThursday) {
            grid[0][6] = {
                content: 'FASTING & PRAYER',
                isFastingCell: true,
                rowSpan: 8,
                colSpan: 1
            };
        }
        
        // 5. Special Column: Friday SPORTS ACTIVITIES (Column 4, spans all 8 rows, spans Columns 4 and 5 (Period 3 & 4))
        if (isFriday) {
            grid[0][4] = {
                content: 'SPORTS ACTIVITIES',
                isSportsCell: true,
                rowSpan: 8,
                colSpan: 2
            };
        }
        
        // Define which periods map to which columns for this day
        const periodsToQuery = [];
        if (isThursday) {
            periodsToQuery.push(
                { p: 1, col: 2 },
                { p: 2, col: 3 },
                { p: 3, col: 4 },
                { p: 4, col: 5 },
                // Period 5 is FASTING AND PRAYERS (Col 6)
                { p: 6, col: 8 },
                { p: 7, col: 9 },
                { p: 8, col: 10 }
            );
        } else if (isFriday) {
            periodsToQuery.push(
                { p: 1, col: 2 },
                { p: 2, col: 3 },
                // Period 3 & 4 are SPORTS ACTIVITIES (Col 4 & 5)
                { p: 5, col: 6 },
                { p: 6, col: 8 },
                { p: 7, col: 9 },
                { p: 8, col: 10 }
            );
        } else {
            periodsToQuery.push(
                { p: 1, col: 2 },
                { p: 2, col: 3 },
                { p: 3, col: 4 },
                { p: 4, col: 5 },
                { p: 5, col: 6 },
                { p: 6, col: 8 },
                { p: 7, col: 9 },
                { p: 8, col: 10 }
            );
        }
        
        // Populate period cells in grid
        for (let r = 0; r < 8; r++) {
            const rc = rowsConfig[r];
            const baseClassLower = getBaseClassName(rc.dbName).toLowerCase();
            for (const pf of periodsToQuery) {
                const isCompPract = 
                    (isThursday && baseClassLower === 'jss 1' && pf.p === 6) ||
                    (isThursday && baseClassLower === 'jss 2' && pf.p === 7) ||
                    (isThursday && baseClassLower === 'jss 3' && pf.p === 8) ||
                    (isFriday && baseClassLower === 'sss 1' && pf.p === 6) ||
                    (isFriday && baseClassLower === 'sss 2' && pf.p === 7) ||
                    (isFriday && baseClassLower === 'sss 3' && pf.p === 8);
                
                if (isCompPract) {
                    grid[r][pf.col] = {
                        content: 'COMP. PRACT.',
                        isCompPractCell: true,
                        rowSpan: 1,
                        colSpan: 1
                    };
                } else {
                    const entry = matchEntry(dayEntries, day, rc.dbName, rc.stream, pf.p);
                    const text = entry ? getShortSubjectName(entry.subject_id, subjectMap) : '';
                    grid[r][pf.col] = {
                        content: text,
                        isLessonCell: true,
                        rowSpan: 1,
                        colSpan: 1
                    };
                }
            }
        }
        
        // Merge general subjects for SSS 2 & SSS 3 (Arts & Science rows)
        // SSS 2 Arts is row 4, Science is row 5
        // SSS 3 Arts is row 6, Science is row 7
        const sssPairs = [[4, 5], [6, 7]];
        for (const [rArts, rSci] of sssPairs) {
            for (const pf of periodsToQuery) {
                const col = pf.col;
                const cellArts = grid[rArts][col];
                const cellSci = grid[rSci][col];
                if (cellArts && cellSci && cellArts.content && cellArts.content === cellSci.content) {
                    cellArts.rowSpan = 2;
                    grid[rSci][col] = null; // Omit Science cell since it is vertically merged
                }
            }
        }
        
        // Push non-null cells to table body
        for (let r = 0; r < 8; r++) {
            const rowData = [];
            for (let c = 0; c < 11; c++) {
                if (grid[r][c] !== null) {
                    rowData.push(grid[r][c]);
                }
            }
            body.push(rowData);
        }
    }
    
    // Column Header Definitions
    const head = [[
        'DAYS', 'CLASS', 
        '8:00 - 8:40', '8:40 - 9:20', '9:20 - 10:00', 
        '10:00 - 10:40', '10:40 - 11:30', '11:30 - 12:00', 
        '12:00 - 12:40', '12:40 - 1:20', '1:20 - 2:00'
    ]];
    
    // Render AutoTable on the document
    doc.autoTable({
        startY: 30,
        head: head,
        body: body,
        theme: 'grid',
        styles: { 
            fontSize: 7.5, 
            cellPadding: 0.8, 
            minCellHeight: 3.5, 
            lineColor: [148, 163, 184], 
            lineWidth: 0.1,
            halign: 'center',
            valign: 'middle'
        },
        headStyles: { 
            fillColor: [rgb.r, rgb.g, rgb.b], 
            textColor: [255, 255, 255], 
            halign: 'center', 
            valign: 'middle', 
            fontSize: 8, 
            fontStyle: 'bold' 
        },
        columnStyles: {
            0: { cellWidth: 16 }, // DAYS
            1: { cellWidth: 18 }, // CLASS
            2: { cellWidth: 28.5 },
            3: { cellWidth: 28.5 },
            4: { cellWidth: 28.5 },
            5: { cellWidth: 28.5 },
            6: { cellWidth: 28.5 },
            7: { cellWidth: 15 },  // BREAK/FASTING
            8: { cellWidth: 28.5 },
            9: { cellWidth: 28.5 },
            10: { cellWidth: 28.5 }
        },
        margin: { left: 5, right: 5 },
        willDrawCell: function(data) {
            if (data.section === 'body') {
                const raw = data.cell.raw;
                if (raw && (raw.isDayCell || raw.isFastingCell || raw.isSportsCell)) {
                    data.cell.text = []; // Clear text so autoTable doesn't draw it
                }
            }
        },
        didDrawCell: function(data) {
            if (data.section === 'body') {
                const raw = data.cell.raw;
                if (raw) {
                    const centerX = data.cell.x + data.cell.width / 2;
                    const centerY = data.cell.y + data.cell.height / 2;
                    
                    if (raw.isDayCell) {
                        doc.saveGraphicsState();
                        doc.setFontSize(10.5);
                        doc.setFont('helvetica', 'bold');
                        doc.setTextColor(30, 41, 59);
                        doc.text(raw.content, centerX, centerY, { angle: 270, align: 'center', baseline: 'middle' });
                        doc.restoreGraphicsState();
                    } else if (raw.isFastingCell) {
                        doc.saveGraphicsState();
                        doc.setFontSize(6.5);
                        doc.setFont('helvetica', 'bold');
                        doc.setTextColor(220, 38, 38);
                        const lines = ["FASTING &", "PRAYER"];
                        doc.text(lines, centerX, centerY, { angle: -60, align: 'center', baseline: 'middle' });
                        doc.restoreGraphicsState();
                    } else if (raw.isSportsCell) {
                        doc.saveGraphicsState();
                        doc.setFontSize(7);
                        doc.setFont('helvetica', 'bold');
                        doc.setTextColor(37, 99, 235);
                        const lines = ["SPORTS", "ACTIVITIES"];
                        doc.text(lines, centerX, centerY, { angle: -60, align: 'center', baseline: 'middle' });
                        doc.restoreGraphicsState();
                    }
                }
            }
        },
        didParseCell: function(data) {
            if (data.section === 'body') {
                const raw = data.cell.raw;
                if (raw) {
                    if (raw.isDayCell) {
                        data.cell.styles.fillColor = [248, 250, 252];
                    } else if (raw.isClassCell) {
                        data.cell.styles.fillColor = [241, 245, 249];
                        data.cell.styles.textColor = [30, 41, 59];
                        data.cell.styles.fontStyle = 'bold';
                    } else if (raw.isBreakCell) {
                        data.cell.styles.fillColor = [254, 252, 232];
                        data.cell.styles.textColor = [161, 98, 7];
                        data.cell.styles.fontStyle = 'bold';
                        data.cell.styles.fontSize = 8;
                    } else if (raw.isFastingCell) {
                        data.cell.styles.fillColor = [254, 242, 242];
                    } else if (raw.isSportsCell) {
                        data.cell.styles.fillColor = [239, 246, 255];
                    } else if (raw.isCompPractCell) {
                        data.cell.styles.fillColor = [224, 242, 254];
                        data.cell.styles.textColor = [3, 105, 161];
                        data.cell.styles.fontStyle = 'bold';
                    } else if (raw.isLessonCell) {
                        if (raw.content) {
                            data.cell.styles.fontStyle = 'bold';
                            data.cell.styles.textColor = [15, 23, 42];
                        } else {
                            data.cell.styles.textColor = [148, 163, 184];
                        }
                    }
                }
            }
        }
    });
    
    // Footer Warning message
    const footerY = pageHeight - 12;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.setTextColor(239, 68, 68); // Red color warning
    doc.text("THIS TIME TABLE SHOULD NOT BE ALTERED BY ANYONE FOR ANY REASON", pageWidth / 2, footerY, { align: 'center' });
    
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.5);
    doc.setTextColor(30, 41, 59);
    doc.text("SIGN: MANAGEMENT", pageWidth - 15, footerY + 4, { align: 'right' });
    
    // Audit log trail and branding
    const auditId = crypto.randomUUID().substring(0, 8).toUpperCase();
    const timestamp = new Date().toISOString();
    const userName = currentUser.name || "Administrator";
    const userId = currentUser.id || "Admin";
    
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(6.5);
    doc.setTextColor(148, 163, 184);
    doc.text(`AUDIT ID: NKQMS-${auditId} | GENERATED BY: ${userName} (${userId}) | DATE: ${new Date(timestamp).toLocaleString()} | SYSTEM: GRAVITON CORE`, 10, pageHeight - 5);
    
    // Write Audit Log
    try {
        await db.audit_logs.add({
            id: crypto.randomUUID(),
            operation: 'print',
            table: 'timetable',
            record_id: 'general_school_timetable',
            timestamp: timestamp,
            user_id: userId,
            is_synced: 0
        });
    } catch (e) {
        console.error("Failed to write general timetable print audit log:", e);
    }
    
    // Open in preview tab or download
    const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) || window.innerWidth <= 768;
    if (isMobile) {
        doc.save(`General_School_Timetable_${schoolInfo.currentSession || '2025_2026'}.pdf`);
        Notifications.show('General Timetable downloaded successfully!', 'success');
        return;
    }

    const pdfBlob = doc.output('blob');
    const pdfUrl = URL.createObjectURL(pdfBlob);
    
    const printWindow = window.open(pdfUrl, '_blank');
    if (!printWindow) {
        doc.save(`General_School_Timetable_${schoolInfo.currentSession || '2025_2026'}.pdf`);
        Notifications.show('Timetable printed! Check downloads.', 'success');
    } else {
        Notifications.show('Print Preview opened in a new tab!', 'success');
    }
}

export function getClassNameRank(name) {
    const n = (name || '').trim().toLowerCase();
    
    // Define ordering groups
    if (n.includes('pre-nursery') || n.includes('prenursery') || n.includes('playgroup') || n.includes('creche')) return 10;
    if (n.includes('nursery 1') || n.includes('nursery1')) return 20;
    if (n.includes('nursery 2') || n.includes('nursery2')) return 30;
    if (n.includes('nursery 3') || n.includes('nursery3')) return 40;
    if (n.includes('nursery') && !n.match(/\d/)) return 15; // default nursery
    
    // Primary 1 to 6
    const primMatch = n.match(/primary\s*(\d)/) || n.match(/pri\s*(\d)/);
    if (primMatch) {
        return 100 + parseInt(primMatch[1]) * 10;
    }
    if (n.includes('primary') || n.includes('pri')) return 105; // default primary
    
    // JSS 1 to 3
    const jssMatch = n.match(/jss\s*(\d)/) || n.match(/js\s*(\d)/);
    if (jssMatch) {
        return 1000 + parseInt(jssMatch[1]) * 10;
    }
    if (n.includes('jss') || n.includes('junior secondary')) return 1005; // default jss
    
    // SSS 1 to 3
    const sssMatch = n.match(/sss\s*(\d)/) || n.match(/ss\s*(\d)/);
    if (sssMatch) {
        return 2000 + parseInt(sssMatch[1]) * 10;
    }
    if (n.includes('sss') || n.includes('senior secondary')) return 2005; // default sss
    
    // Fallback: alphabetical
    return 10000;
}

export function compareClasses(a, b) {
    const nameA = a?.name || '';
    const nameB = b?.name || '';
    const rankA = getClassNameRank(nameA);
    const rankB = getClassNameRank(nameB);
    
    if (rankA !== rankB) {
        return rankA - rankB;
    }
    
    return nameA.localeCompare(nameB, undefined, { numeric: true, sensitivity: 'base' });
}

export async function generateRegistrationFormPDF(student, schoolInfo = {}) {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF('p', 'mm', 'a4');
    
    const themeColor = schoolInfo.themeColor || '#4338ca';
    const hexToRgb = (hex) => {
        const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
        return result ? { r: parseInt(result[1], 16), g: parseInt(result[2], 16), b: parseInt(result[3], 16) } : { r: 67, g: 56, b: 202 };
    };
    const rgb = hexToRgb(themeColor);
    
    // Top border stripe
    doc.setFillColor(rgb.r, rgb.g, rgb.b);
    doc.rect(0, 0, 210, 8, 'F');
    
    let y = 20;
    
    // Logo
    if (schoolInfo.logo) {
        try {
            doc.addImage(schoolInfo.logo, 'PNG', 15, y, 22, 22);
        } catch (e) {
            console.error("Failed to render school logo in registration form:", e);
        }
    }
    
    // School Details
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(16);
    doc.setTextColor(rgb.r, rgb.g, rgb.b);
    doc.text(schoolInfo.schoolName || 'GRAVITON ACADEMY', 42, y + 4);
    
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    doc.setTextColor(71, 85, 105);
    let addressLine = schoolInfo.address || '';
    if (addressLine) {
        doc.text(addressLine, 42, y + 9);
    }
    
    let contactInfo = [];
    if (schoolInfo.phone) contactInfo.push(`Tel: ${schoolInfo.phone}`);
    if (schoolInfo.email) contactInfo.push(`Email: ${schoolInfo.email}`);
    if (contactInfo.length > 0) {
        doc.text(contactInfo.join('  |  '), 42, y + 14);
    }
    
    y += 26;
    
    // Document Title
    doc.setFillColor(241, 245, 249);
    doc.rect(15, y, 180, 10, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.setTextColor(15, 23, 42);
    doc.text("OFFICIAL STUDENT ADMISSION & REGISTRATION RECORD", 18, y + 6.5);
    
    // Student Passport
    const passportX = 160;
    const passportY = y + 18;
    const passportW = 32;
    const passportH = 36;
    
    let passportDrawn = false;
    if (student.passport_url || student.passport) {
        try {
            doc.addImage(student.passport_url || student.passport, 'JPEG', passportX, passportY, passportW, passportH);
            passportDrawn = true;
        } catch (e) {
            console.warn("Failed to render student passport:", e);
        }
    }
    
    if (!passportDrawn) {
        // Draw elegant placeholder box
        doc.setDrawColor(203, 213, 225);
        doc.setLineWidth(0.5);
        doc.setFillColor(248, 250, 252);
        doc.rect(passportX, passportY, passportW, passportH, 'FD');
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(7.5);
        doc.setTextColor(148, 163, 184);
        doc.text("PASSPORT PHOTO", passportX + (passportW / 2), passportY + (passportH / 2) + 2, { align: 'center' });
    }
    
    y += 18;
    
    // Helper function to draw sections
    const drawSectionHeader = (title, startY) => {
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(9.5);
        doc.setTextColor(rgb.r, rgb.g, rgb.b);
        doc.text(title.toUpperCase(), 15, startY);
        // Underline
        doc.setDrawColor(rgb.r, rgb.g, rgb.b);
        doc.setLineWidth(0.35);
        doc.line(15, startY + 2, 145, startY + 2);
        return startY + 8;
    };
    
    const drawField = (label, value, fieldX, fieldY, fieldW = 60) => {
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(8.5);
        doc.setTextColor(100, 116, 139);
        doc.text(label, fieldX, fieldY);
        
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(9);
        doc.setTextColor(15, 23, 42);
        doc.text(String(value || 'N/A'), fieldX, fieldY + 4.5);
        
        // Underline field for neatness
        doc.setDrawColor(226, 232, 240);
        doc.setLineWidth(0.2);
        doc.line(fieldX, fieldY + 7, fieldX + fieldW, fieldY + 7);
    };

    // SECTION 1: PERSONAL DETAILS
    let currentY = drawSectionHeader("1. Academic & Personal Details", y);
    
    drawField("Student ID / Serial", student.student_id, 15, currentY, 55);
    drawField("Full Name", student.name, 75, currentY, 70);
    currentY += 12;
    
    drawField("Gender", student.gender, 15, currentY, 55);
    drawField("Date of Birth", student.dob, 75, currentY, 70);
    currentY += 12;
    
    drawField("Admission Year", student.admission_year, 15, currentY, 55);
    drawField("Attendance Code", student.attendance_code, 75, currentY, 70);
    currentY += 16;
    
    // SECTION 2: CLASS PLACEMENT
    currentY = drawSectionHeader("2. Class Assignment", currentY);
    drawField("Assigned Class", student.class_name, 15, currentY, 55);
    drawField("Class Arm / Specialization", student.sub_class || 'None / General', 75, currentY, 70);
    currentY += 20;
    
    // SECTION 3: CONTACT & MEDICAL DETAILS
    currentY = drawSectionHeader("3. Contact & Medical Details", currentY);
    doc.line(15, currentY - 6, 195, currentY - 6);
    
    drawField("Phone Number", student.phone, 15, currentY, 80);
    drawField("Blood Group", student.blood_group, 105, currentY, 40);
    drawField("Genotype", student.genotype, 155, currentY, 40);
    currentY += 12;
    
    drawField("Residential Address", student.address, 15, currentY, 180);
    currentY += 20;
    
    // SECTION 4: PARENT / GUARDIAN DETAILS
    currentY = drawSectionHeader("4. Parent / Guardian Information", currentY);
    doc.line(15, currentY - 6, 195, currentY - 6);
    
    drawField("Parent/Guardian Name", student.parent_name, 15, currentY, 80);
    drawField("Parent Phone", student.parent_phone, 105, currentY, 90);
    currentY += 12;
    
    drawField("Parent Email / Username", student.parent_email, 15, currentY, 180);
    currentY += 30;
    
    // SECTION 5: DECLARATIONS & SIGNATURES
    currentY = drawSectionHeader("5. Attestation & Signatures", currentY);
    doc.line(15, currentY - 6, 195, currentY - 6);
    
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(71, 85, 105);
    doc.text("I hereby certify that the information provided above is correct and complete to the best of my knowledge.", 15, currentY);
    currentY += 24;
    
    // Signature lines
    doc.setDrawColor(71, 85, 105);
    doc.setLineWidth(0.35);
    
    // Parent
    doc.line(15, currentY, 65, currentY);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.text("Parent/Guardian Signature", 15, currentY + 4);
    
    // Registrar
    doc.line(105, currentY, 145, currentY);
    doc.text("Registrar Signature", 105, currentY + 4);
    
    // Date
    doc.line(165, currentY, 195, currentY);
    doc.text("Date", 165, currentY + 4);
    
    // Footer page info
    doc.setFont('helvetica', 'italic');
    doc.setFontSize(7);
    doc.setTextColor(148, 163, 184);
    doc.text("Generated by Graviton CMS on " + new Date().toLocaleDateString(), 15, 287);
    doc.text("Page 1 of 1", 195, 287, { align: 'right' });
    
    return doc;
}

