function parseBulkQuestions(text) {
    if (!text) return [];

    // Normalize line endings
    text = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

    // New, safer Regex to find answer markers (requiring start of line or newline prefix)
    const ansRegex = /(?:\[\s*(?:Ans|Answer)\s*:\s*([\s\S]*?)\s*\]|\(\s*(?:Ans|Answer)\s*:\s*([\s\S]*?)\s*\)|(?:^|[\r\n])\s*(?:Correct\s+Option|Correct\s+Answer|Correct|Answer|Ans)\s*:\s*([^\n\r]*))/gi;
    
    let matches = [];
    let match;
    while ((match = ansRegex.exec(text)) !== null) {
        // Because of the (?:^|[\r\n]) prefix, the matched string might include the preceding newline character.
        // We need to adjust index and length to NOT include that preceding character if it matched ^|[\r\n]
        let matchStr = match[0];
        let matchIndex = match.index;
        
        // If the match starts with a newline, strip it from the match details
        const prefixMatch = matchStr.match(/^(?:^|[\r\n])\s*/);
        if (prefixMatch) {
            const prefixLen = prefixMatch[0].length;
            matchStr = matchStr.substring(prefixLen);
            matchIndex += prefixLen;
        }

        matches.push({
            index: matchIndex,
            length: matchStr.length,
            fullMatch: matchStr,
            // Group 1, 2, or 3 depending on which branch matched
            answer: (match[1] || match[2] || match[3] || '').trim()
        });
    }

    if (matches.length === 0) {
        return [];
    }

    const parsedQuestions = [];
    let currentPassageText = null;
    let lastIndex = 0;

    for (let i = 0; i < matches.length; i++) {
        const currentMatch = matches[i];
        
        // Extract the segment of text before this answer marker
        const segment = text.substring(lastIndex, currentMatch.index);
        lastIndex = currentMatch.index + currentMatch.length;

        // Split the segment into paragraphs
        let paragraphs = segment.split(/\n\s*\n/).map(p => p.trim()).filter(Boolean);

        // Process any commands or clear/passage markers in the segment paragraphs
        let passageParts = [];
        let questionParagraphs = [];

        // We determine which paragraphs belong to the question.
        // By default, the last paragraph is the question paragraph.
        // But if the last paragraph starts with option A, the question text is in the second to last.
        let questionStartIndex = paragraphs.length - 1;
        if (paragraphs.length >= 2) {
            const lastPara = paragraphs[paragraphs.length - 1];
            const startsWithOptionA = /^\s*[\(\[]?A[\)\]\.]/i.test(lastPara);
            if (startsWithOptionA) {
                questionStartIndex = paragraphs.length - 2;
            }
        }

        for (let j = 0; j < paragraphs.length; j++) {
            const para = paragraphs[j];
            if (/^(?:NONE|CLEAR|NO PASSAGE|END PASSAGE|\[NO PASSAGE\]|\[END PASSAGE\])$/i.test(para)) {
                currentPassageText = null;
                passageParts = [];
            } else if (j >= questionStartIndex) {
                questionParagraphs.push(para);
            } else {
                passageParts.push(para);
            }
        }

        // If there was a new passage defined in this segment, update currentPassageText
        if (passageParts.length > 0) {
            currentPassageText = passageParts.join('\n\n');
        }

        const questionBlock = questionParagraphs.join('\n\n');
        if (!questionBlock) continue;

        // Parse type (explicit fitb vs mcq)
        let block = questionBlock;
        let explicitType = null;
        const typeMatch = /\[Type\s*:\s*(MCQ|Fill|FITB|Fill-in-the-blank)\]/i.exec(block);
        if (typeMatch) {
            const typeStr = typeMatch[1].toLowerCase();
            explicitType = (typeStr === 'mcq') ? 'mcq' : 'fill';
            block = block.replace(typeMatch[0], '').trim();
        }

        // Detect options
        const optAReg = /(?:^|[\s\n])[\(\[]?A[\)\]\.]/im;
        const optBReg = /(?:^|[\s\n])[\(\[]?B[\)\]\.]/im;
        const optCReg = /(?:^|[\s\n])[\(\[]?C[\)\]\.]/im;
        const optDReg = /(?:^|[\s\n])[\(\[]?D[\)\]\.]/im;
        const optEReg = /(?:^|[\s\n])[\(\[]?E[\)\]\.]/im;

        const hasA = optAReg.test(block);
        const hasB = optBReg.test(block);

        let type = 'fill';
        if (explicitType) {
            type = explicitType;
        } else if (hasA && hasB) {
            type = 'mcq';
        }

        if (type === 'mcq') {
            const markers = [
                { label: 'A', regex: optAReg },
                { label: 'B', regex: optBReg },
                { label: 'C', regex: optCReg },
                { label: 'D', regex: optDReg },
                { label: 'E', regex: optEReg }
            ];

            const foundOptions = [];
            for (const mk of markers) {
                const match = mk.regex.exec(block);
                if (match) {
                    foundOptions.push({
                        label: mk.label,
                        index: match.index,
                        length: match[0].length
                    });
                }
            }

            foundOptions.sort((x, y) => x.index - y.index);

            let questionText = block;
            let optA = '', optB = '', optC = '', optD = '', optE = '';

            if (foundOptions.length > 0) {
                questionText = block.substring(0, foundOptions[0].index).trim();
                
                for (let j = 0; j < foundOptions.length; j++) {
                    const start = foundOptions[j].index + foundOptions[j].length;
                    const optValEnd = (j + 1 < foundOptions.length) ? foundOptions[j + 1].index : block.length;
                    const optVal = block.substring(start, optValEnd).trim();
                    
                    switch (foundOptions[j].label) {
                        case 'A': optA = optVal; break;
                        case 'B': optB = optVal; break;
                        case 'C': optC = optVal; break;
                        case 'D': optD = optVal; break;
                        case 'E': optE = optVal; break;
                    }
                }
            }

            let correctOpt = 'A';
            if (currentMatch.answer) {
                const letter = currentMatch.answer.toUpperCase().trim().charAt(0);
                if (['A','B','C','D','E'].includes(letter)) {
                    correctOpt = letter;
                }
            }

            // Clean up any leading question number if present in questionText
            questionText = questionText.replace(/^\s*(?:(?:Question|Q)\s*)?\d+\s*[.)\-:]\s*/i, '').trim();

            parsedQuestions.push({
                type: 'mcq',
                question_text: questionText,
                passage_text: currentPassageText,
                option_a: optA,
                option_b: optB,
                option_c: optC,
                option_d: optD,
                option_e: optE,
                correct_option: correctOpt,
                fill_answer: '',
                marks: 1
            });
        } else {
            let fillAnswer = currentMatch.answer || '';
            // Clean up leading question number from block
            let questionText = block.replace(/^\s*(?:(?:Question|Q)\s*)?\d+\s*[.)\-:]\s*/i, '').trim();

            parsedQuestions.push({
                type: 'fill',
                question_text: questionText,
                passage_text: currentPassageText,
                option_a: '',
                option_b: '',
                option_c: '',
                option_d: '',
                option_e: '',
                correct_option: fillAnswer,
                fill_answer: fillAnswer,
                marks: 1
            });
        }
    }

    return parsedQuestions;
}

// Let's test with a typical input
const sample1 = `
Which of the following is correct:
A. 1
B. 2
Answer: B

What is the capital of Nigeria?
A. Lagos
B. Abuja
C. Kaduna
Answer: B
`;

console.log('Sample 1 Result:', JSON.stringify(parseBulkQuestions(sample1), null, 2));
