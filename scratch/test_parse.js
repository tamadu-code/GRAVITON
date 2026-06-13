const text = `Read the story below and answer the following questions.

Mia lived in a busy city. Her neighborhood had a lot of tall buildings, concrete sidewalks, and loud cars, but not many trees. There was an empty dirt lot near her apartment building. It was filled with old boxes, broken glass, and trash. Mia had an idea. She wanted to turn the ugly lot into a beautiful community garden.

First, Mia asked her neighbors for help. On Saturday morning, ten people came to the empty lot. They brought trash bags, heavy gloves, and brooms. They worked very hard, and it took them three hours to clean up all the garbage.

Next, they needed soil and seeds. Mr. Jones, a kind old man who lived next door, gave them several bags of good planting soil, some tomato seeds, and sunflower bulbs. The neighbors worked together every weekend. They carefully planted the seeds, watered the soil, and pulled out the bad weeds.

After two months, the garden was full of life. There were bright red tomatoes, crisp green peppers, and tall yellow sunflowers. Birds and butterflies began to visit the flowers. The empty lot was no longer ugly and dirty. It was a happy, peaceful place where neighbors could sit together, talk, and share fresh food.

What is this story mostly about?
(A) A girl who moves to a new city
(B) How to cook fresh vegetables
(C) Neighbors working together to build a garden
(D) A man who sells flowers
[Ans: C]

Where does Mia live?
(A) On a large farm
(B) In a busy city
(C) In a quiet forest
(D) In a small village
[Ans: B]

What did the empty lot look like at the beginning of the story?
(A) It was full of tall trees.
(B) It was covered in green grass.
(C) It was filled with trash and old boxes.
(D) It already had a small garden.
[Ans: C]

What was the first thing Mia did to start the garden?
(A) She asked her neighbors for help.
(B) She bought seeds from the store.
(C) She pulled out the weeds.
(D) She planted a sunflower.
[Ans: A]

How long did it take the neighbors to clean up the trash?
(A) One hour
(B) Three hours
(C) Two days
(D) One week
[Ans: B]

Who gave the neighborhood the tomato seeds?
(A) Mia's teacher
(B) A local farmer
(C) The city mayor
(D) Mr. Jones
[Ans: D]

Which of these tasks did the neighbors do every weekend?
(A) Build new fences
(B) Pull out weeds and water the soil
(C) Pick up trash from the street
(D) Paint the apartment buildings
[Ans: B]

How long did it take for the garden to become "full of life"?
(A) Two weeks
(B) One month
(C) Two months
(D) One year
[Ans: C]

Which of the following grew in the garden?
(A) Apples and oranges
(B) Potatoes and carrots
(C) Corn and green beans
(D) Tomatoes, peppers, and sunflowers
[Ans: D]

How did the garden change the neighborhood at the end?
(A) It made the city much louder and busier.
(B) It created a happy place for neighbors to sit and share food.
(C) It brought more birds but chased away the butterflies.
(D) It made the tall buildings look smaller.
[Ans: B]

[END PASSAGE]

The process by which green plants manufacture their food using sunlight is known as _____. [Type: Fill] [Ans: Photosynthesis]

Which of the following farming tools is primarily used for turning over soil?
(A) Cutlass
(B) Rake
(C) Spade
(D) Trowel
[Ans: C]

Study the diagram of the hardware component below and answer the following questions.
[IMG:https://example.com/cpu_architecture.png]

The hardware component shown in the diagram is responsible for processing system instructions. What is it commonly called?
(A) Monitor
(B) Random Access Memory
(C) Central Processing Unit
(D) Hard Drive
[Ans: C]

The acronym ROM in computer hardware stands for Read _____ Memory. [Type: Fill] [Ans: Only]

[END PASSAGE]`;

function parseBulkQuestions(text) {
    if (!text) return [];

    // Standardize newlines
    text = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

    // Regex to find answer markers (e.g. [Ans: C], [Answer: Photosynthesis], Correct Option: C, etc.)
    const ansRegex = /(?:\[\s*(?:Ans|Answer)\s*:\s*([\s\S]*?)\s*\]|\(\s*(?:Ans|Answer)\s*:\s*([\s\S]*?)\s*\)|(?:Correct|Correct\s+Option|Answer)\s*:\s*([^\n\r]*))/gi;
    
    let matches = [];
    let match;
    while ((match = ansRegex.exec(text)) !== null) {
        matches.push({
            index: match.index,
            length: match[0].length,
            fullMatch: match[0],
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
                // If there is any accumulated passage parts, they should be cleared as well
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

const res = parseBulkQuestions(text);
console.log("Parsed Questions Count:", res.length);
if (res.length > 0) {
    console.log("Sample Parsed:", JSON.stringify(res, null, 2));
}
