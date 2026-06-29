// Let's test the original parseBulkQuestions (prior to our line-by-line change) on the user's exact paste.
const originalParser = (text) => {
    if (!text) return [];
    text = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

    // This was the regex in BUILD v357 after the first fix:
    const ansRegex = /(?:\[\s*(?:Ans|Answer)\s*:\s*([\s\S]*?)\s*\]|\(\s*(?:Ans|Answer)\s*:\s*([\s\S]*?)\s*\)|(?:^|[\r\n])\s*(?:Correct\s+Option|Correct\s+Answer|Correct|Answer|Ans)\s*:\s*([^\n\r]*))/gi;
    
    let matches = [];
    let match;
    while ((match = ansRegex.exec(text)) !== null) {
        let matchStr = match[0];
        let matchIndex = match.index;
        
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
            answer: (match[1] || match[2] || match[3] || '').trim()
        });
    }

    if (matches.length === 0) return [];

    const parsedQuestions = [];
    let currentPassageText = null;
    let lastIndex = 0;

    for (let i = 0; i < matches.length; i++) {
        const currentMatch = matches[i];
        const segment = text.substring(lastIndex, currentMatch.index);
        lastIndex = currentMatch.index + currentMatch.length;

        let paragraphs = segment.split(/\n\s*\n/).map(p => p.trim()).filter(Boolean);

        let passageParts = [];
        let questionParagraphs = [];

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
};

const userPaste = `
1. What is the chemical symbol for Sodium?
A. S
B. Na
C. So
D. N
[Ans: B]

2. The Earth's largest ocean is?
(A) Atlantic Ocean (B) Indian Ocean (C) Arctic Ocean (D) Pacific Ocean
[Answer: D]

3. In which year did World War II end?
A. 1943
B. 1944
C. 1945
D. 1946
Answer: C

4. What is the speed of light approximately in km/s?
A. 300,000
B. 150,000
C. 500,000
D. 100,000
[Ans: A]

5. The hardest natural substance on Earth is?
(A) Gold (B) Iron (C) Diamond (D) Platinum
Answer: C

6. Which planet is known as the Red Planet?
A. Venus
B. Mars
C. Jupiter
D. Mercury
[Answer: B]

7. What is the main component of the Sun?
(A) Oxygen (B) Nitrogen (C) Hydrogen (D) Carbon
Correct Option: C

8. The smallest country in the world is?
A. Monaco
B. Vatican City
C. San Marino
D. Liechtenstein
[Ans: B]

9. Which blood type is the universal donor?
(A) Type A (B) Type B (C) Type AB (D) Type O
[Answer: D]

10. The atomic number of Carbon is?
A. 4
B. 6
C. 8
D. 12
Ans: B

11. Which is the longest river in the world?
(A) Amazon (B) Nile (C) Yangtze (D) Mississippi
Answer: B
`;

console.log('Original Parser Results count:', originalParser(userPaste).length);
console.log('Original Parser Results:', JSON.stringify(originalParser(userPaste), null, 2));
