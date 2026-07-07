/**
 * ─────────────────────────────────────────────────────
 *  GRAVITON AI CONTENT DETECTOR — Heuristic Analyzer
 * ─────────────────────────────────────────────────────
 *  Pure client-side text analysis engine.
 *  Produces a 0–100 "AI Probability" score using 6 linguistic signals.
 *  No API key, no internet, no cost. Works fully offline.
 */

const AI_PHRASES = [
    // Common ChatGPT / LLM filler phrases
    "it's important to note", "it is important to note",
    "it's worth noting", "it is worth noting",
    "in today's world", "in today's society",
    "in conclusion", "to summarize",
    "furthermore", "moreover", "additionally",
    "delve", "delves", "delving",
    "landscape", "tapestry", "multifaceted",
    "comprehensive overview", "holistic approach",
    "plays a crucial role", "plays a vital role", "plays a pivotal role",
    "it should be noted", "it must be noted",
    "in the realm of", "in the context of",
    "serves as a", "stands as a",
    "a testament to", "a cornerstone of",
    "navigate the complexities", "navigating the complexities",
    "shed light on", "sheds light on",
    "foster a sense of", "fostering a sense of",
    "leverage", "leveraging", "leveraged",
    "facilitate", "facilitating", "facilitated",
    "utilize", "utilizing", "utilized",
    "paramount", "indispensable", "underscores",
    "embark on", "embarking on",
    "ever-evolving", "ever-changing",
    "not only...but also", "not only but also",
    "a myriad of", "a plethora of",
    "in light of", "with that being said",
    "in essence", "in summary",
    "this ensures that", "this highlights",
    "it can be argued", "one could argue",
    "as we navigate", "as we delve",
    "the importance of", "the significance of",
    "remains to be seen", "time will tell"
];

const MIN_WORD_COUNT = 50;

/**
 * Tokenize text into sentences (handles ., !, ? and newlines).
 */
function splitSentences(text) {
    return text
        .replace(/\n{2,}/g, '. ')
        .split(/(?<=[.!?])\s+/)
        .map(s => s.trim())
        .filter(s => s.length > 5);
}

/**
 * Tokenize text into words (lowercased, alpha-only).
 */
function splitWords(text) {
    return text.toLowerCase().match(/[a-z']+/g) || [];
}

/**
 * Split text into paragraphs.
 */
function splitParagraphs(text) {
    return text.split(/\n\s*\n/).map(p => p.trim()).filter(p => p.length > 20);
}

/**
 * Calculate standard deviation of an array of numbers.
 */
function stdDev(arr) {
    if (arr.length < 2) return 0;
    const mean = arr.reduce((a, b) => a + b, 0) / arr.length;
    const sq = arr.map(x => (x - mean) ** 2);
    return Math.sqrt(sq.reduce((a, b) => a + b, 0) / arr.length);
}

/**
 * Signal 1: Sentence Length Uniformity (0–100)
 * AI text has low standard deviation in sentence word-counts.
 * Lower stddev → higher score (more AI-like).
 */
function scoreSentenceUniformity(sentences) {
    if (sentences.length < 3) return { score: 0, verdict: 'Too few sentences' };
    const lengths = sentences.map(s => splitWords(s).length);
    const sd = stdDev(lengths);
    const mean = lengths.reduce((a, b) => a + b, 0) / lengths.length;
    const cv = mean > 0 ? (sd / mean) : 0; // coefficient of variation

    // Humans typically have CV > 0.45, AI tends to be 0.15–0.35
    let score;
    if (cv <= 0.15) score = 95;
    else if (cv <= 0.25) score = 80;
    else if (cv <= 0.35) score = 60;
    else if (cv <= 0.45) score = 35;
    else if (cv <= 0.60) score = 15;
    else score = 5;

    const verdict = score >= 70 ? 'Very uniform (AI-like)' :
                    score >= 40 ? 'Moderately uniform' :
                    'Natural variation (human-like)';
    return { score, verdict, detail: `CV: ${cv.toFixed(3)}, StdDev: ${sd.toFixed(1)}` };
}

/**
 * Signal 2: Vocabulary Diversity / Type-Token Ratio (0–100)
 * AI text often has a lower unique-word ratio for longer texts.
 */
function scoreVocabularyDiversity(words) {
    if (words.length < 30) return { score: 0, verdict: 'Too few words' };
    const unique = new Set(words);
    const ttr = unique.size / words.length;

    // Adjusted for text length (longer texts naturally have lower TTR)
    const lengthFactor = Math.min(1, words.length / 200);
    const adjustedTTR = ttr + (1 - lengthFactor) * 0.1;

    // AI typically has TTR in 0.35–0.50 range for medium texts
    let score;
    if (adjustedTTR <= 0.30) score = 90;
    else if (adjustedTTR <= 0.40) score = 70;
    else if (adjustedTTR <= 0.50) score = 50;
    else if (adjustedTTR <= 0.60) score = 30;
    else score = 10;

    const verdict = score >= 60 ? 'Low diversity (AI-like)' :
                    score >= 40 ? 'Moderate diversity' :
                    'Rich vocabulary (human-like)';
    return { score, verdict, detail: `TTR: ${ttr.toFixed(3)}, Unique: ${unique.size}/${words.length}` };
}

/**
 * Signal 3: Burstiness Score (0–100)
 * Human writing has high variance in complexity between sentences.
 * AI text is monotonously smooth.
 */
function scoreBurstiness(sentences) {
    if (sentences.length < 4) return { score: 0, verdict: 'Too few sentences' };

    // Measure average word length per sentence as a proxy for complexity
    const complexities = sentences.map(s => {
        const w = splitWords(s);
        return w.length > 0 ? w.reduce((sum, word) => sum + word.length, 0) / w.length : 0;
    });

    const sd = stdDev(complexities);

    // Higher stddev = more bursty = more human
    let score;
    if (sd <= 0.3) score = 90;
    else if (sd <= 0.5) score = 70;
    else if (sd <= 0.7) score = 50;
    else if (sd <= 1.0) score = 30;
    else score = 10;

    const verdict = score >= 60 ? 'Flat rhythm (AI-like)' :
                    score >= 40 ? 'Moderate variation' :
                    'Bursty rhythm (human-like)';
    return { score, verdict, detail: `Complexity StdDev: ${sd.toFixed(3)}` };
}

/**
 * Signal 4: AI Phrase Detection (0–100)
 * Counts occurrences of known AI-typical phrases.
 */
function scoreAIPhrases(text) {
    const lower = text.toLowerCase();
    const words = splitWords(text);
    const wordCount = words.length;
    if (wordCount < 30) return { score: 0, verdict: 'Too few words', found: [] };

    const found = [];
    let totalHits = 0;

    for (const phrase of AI_PHRASES) {
        const regex = new RegExp(phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
        const matches = lower.match(regex);
        if (matches) {
            totalHits += matches.length;
            found.push({ phrase, count: matches.length });
        }
    }

    // Normalize: hits per 100 words
    const hitsPer100 = (totalHits / wordCount) * 100;

    let score;
    if (hitsPer100 >= 5) score = 95;
    else if (hitsPer100 >= 3) score = 80;
    else if (hitsPer100 >= 2) score = 65;
    else if (hitsPer100 >= 1) score = 45;
    else if (hitsPer100 >= 0.5) score = 25;
    else score = 5;

    const verdict = score >= 60 ? `${totalHits} AI phrases flagged` :
                    score >= 30 ? `${totalHits} minor AI phrases` :
                    'Few or no AI phrases';
    return { score, verdict, found, detail: `${totalHits} hits (${hitsPer100.toFixed(1)}/100 words)` };
}

/**
 * Signal 5: Paragraph Symmetry (0–100)
 * AI creates suspiciously balanced paragraph lengths.
 */
function scoreParagraphSymmetry(paragraphs) {
    if (paragraphs.length < 3) return { score: 0, verdict: 'Too few paragraphs' };

    const lengths = paragraphs.map(p => splitWords(p).length);
    const sd = stdDev(lengths);
    const mean = lengths.reduce((a, b) => a + b, 0) / lengths.length;
    const cv = mean > 0 ? (sd / mean) : 0;

    // AI typically has CV < 0.3 for paragraph lengths
    let score;
    if (cv <= 0.15) score = 90;
    else if (cv <= 0.25) score = 70;
    else if (cv <= 0.40) score = 45;
    else if (cv <= 0.60) score = 25;
    else score = 10;

    const verdict = score >= 60 ? 'Very balanced (AI-like)' :
                    score >= 35 ? 'Somewhat balanced' :
                    'Natural variation (human-like)';
    return { score, verdict, detail: `CV: ${cv.toFixed(3)}, Paragraphs: ${paragraphs.length}` };
}

/**
 * Signal 6: Average Word Length (0–100)
 * AI text trends toward 4.5–5.5 characters per word.
 */
function scoreAvgWordLength(words) {
    if (words.length < 30) return { score: 0, verdict: 'Too few words' };
    const avg = words.reduce((sum, w) => sum + w.length, 0) / words.length;

    // AI tends to land in 4.5–5.5 range very consistently
    const distFromCenter = Math.abs(avg - 5.0);

    let score;
    if (distFromCenter <= 0.3) score = 80;
    else if (distFromCenter <= 0.6) score = 60;
    else if (distFromCenter <= 1.0) score = 35;
    else score = 10;

    const verdict = score >= 60 ? 'In AI-typical band' :
                    score >= 30 ? 'Near AI band' :
                    'Outside AI band (human-like)';
    return { score, verdict, detail: `Avg: ${avg.toFixed(2)} chars/word` };
}

/**
 * Main analysis function.
 * @param {string} text — The submission text to analyze.
 * @returns {{ score: number, label: string, color: string, signals: object, wordCount: number, scanned_at: string }}
 */
export function analyzeText(text) {
    if (!text || typeof text !== 'string') {
        return {
            score: 0,
            label: 'No Text',
            color: '#94a3b8',
            insufficient: true,
            wordCount: 0,
            signals: {},
            scanned_at: new Date().toISOString()
        };
    }

    const words = splitWords(text);
    const wordCount = words.length;

    if (wordCount < MIN_WORD_COUNT) {
        return {
            score: 0,
            label: 'Insufficient Text',
            color: '#94a3b8',
            insufficient: true,
            wordCount,
            signals: {},
            scanned_at: new Date().toISOString()
        };
    }

    const sentences = splitSentences(text);
    const paragraphs = splitParagraphs(text);

    // Run all 6 signals
    const signals = {
        sentenceUniformity: scoreSentenceUniformity(sentences),
        vocabularyDiversity: scoreVocabularyDiversity(words),
        burstiness: scoreBurstiness(sentences),
        aiPhrases: scoreAIPhrases(text),
        paragraphSymmetry: scoreParagraphSymmetry(paragraphs),
        avgWordLength: scoreAvgWordLength(words)
    };

    // Weighted composite score
    const weights = {
        sentenceUniformity: 0.20,
        vocabularyDiversity: 0.15,
        burstiness: 0.20,
        aiPhrases: 0.25,
        paragraphSymmetry: 0.10,
        avgWordLength: 0.10
    };

    let totalWeight = 0;
    let weightedSum = 0;

    for (const [key, weight] of Object.entries(weights)) {
        const sig = signals[key];
        if (sig && sig.score > 0) {
            weightedSum += sig.score * weight;
            totalWeight += weight;
        }
    }

    const compositeScore = totalWeight > 0 ? Math.round(weightedSum / totalWeight) : 0;

    // Classification
    let label, color;
    if (compositeScore <= 30) {
        label = 'Likely Human';
        color = '#059669'; // green
    } else if (compositeScore <= 60) {
        label = 'Uncertain / Mixed';
        color = '#d97706'; // amber
    } else {
        label = 'Likely AI-Generated';
        color = '#ef4444'; // red
    }

    return {
        score: compositeScore,
        label,
        color,
        insufficient: false,
        wordCount,
        signals,
        scanned_at: new Date().toISOString()
    };
}
