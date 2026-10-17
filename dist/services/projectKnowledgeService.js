"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getProjectFacts = getProjectFacts;
exports.parsePriceToLakhs = parsePriceToLakhs;
exports.detectLanguage = detectLanguage;
exports.findDirectFaqAnswer = findDirectFaqAnswer;
exports.findCrossSellProject = findCrossSellProject;
exports.getDynamicPortfolioCatalogue = getDynamicPortfolioCatalogue;
exports.isPropertyDetailsQuery = isPropertyDetailsQuery;
exports.formatSingleProjectDetails = formatSingleProjectDetails;
exports.formatMultiProjectList = formatMultiProjectList;
exports.matchProjectFromSelection = matchProjectFromSelection;
exports.buildIntelligentRealEstateResponse = buildIntelligentRealEstateResponse;
const project_model_1 = __importDefault(require("../models/project.model"));
async function getProjectFacts(projectId, userMessage) {
    const project = await project_model_1.default.findById(projectId).lean();
    if (!project) {
        return '';
    }
    const lines = [];
    // Core Fact Sheet
    lines.push(`PROJECT: ${project.name}`);
    if (project.developer)
        lines.push(`DEVELOPER: ${project.developer}`);
    if (project.location)
        lines.push(`LOCATION: ${project.location}`);
    if (project.priceRange)
        lines.push(`PRICE RANGE: ${project.priceRange}`);
    if (project.possession)
        lines.push(`POSSESSION: ${project.possession}`);
    if (project.reraNumber)
        lines.push(`RERA: ${project.reraNumber}`);
    if (project.paymentPlan)
        lines.push(`PAYMENT PLAN: ${project.paymentPlan}`);
    if (project.siteVisitInfo)
        lines.push(`SITE VISIT: ${project.siteVisitInfo}`);
    if (project.currentOffers)
        lines.push(`OFFERS: ${project.currentOffers}`);
    if (project.summary)
        lines.push(`SUMMARY: ${project.summary}`);
    // Unit Types & Space (Sizes)
    if (project.unitTypes && project.unitTypes.length > 0) {
        const units = project.unitTypes
            .map(u => `${u.type}${u.sizeSqft ? ` [Space: ${u.sizeSqft}]` : ''}${u.priceFrom ? ` [Rate: From ${u.priceFrom}]` : ''}`)
            .join('; ');
        lines.push(`UNITS & SPACES: ${units}`);
    }
    // Amenities
    if (project.amenities && project.amenities.length > 0) {
        lines.push(`AMENITIES: ${project.amenities.join(', ')}`);
    }
    // Strict restrictions (Do Not Say)
    if (project.doNotSay && project.doNotSay.length > 0) {
        lines.push(`DO NOT SAY: ${project.doNotSay.join('; ')}`);
    }
    // Top 3 relevant FAQs
    const faqs = project.faqs || [];
    let selectedFaqs = [];
    if (userMessage && userMessage.trim()) {
        const tokens = userMessage.toLowerCase().split(/\s+/).filter(t => t.length > 2);
        // Score FAQs based on token matches in question, answer, and keywords
        const scoredFaqs = faqs.map(faq => {
            let score = 0;
            const qLower = faq.question.toLowerCase();
            const aLower = faq.answer.toLowerCase();
            const kwLower = (faq.keywords || []).map(k => k.toLowerCase());
            for (const token of tokens) {
                if (qLower.includes(token))
                    score += 3;
                if (kwLower.some(k => k.includes(token)))
                    score += 4;
                if (aLower.includes(token))
                    score += 1;
            }
            return { faq, score };
        });
        scoredFaqs.sort((a, b) => b.score - a.score);
        selectedFaqs = scoredFaqs.slice(0, 10).map(s => s.faq);
    }
    else {
        selectedFaqs = faqs.slice(0, 10);
    }
    if (selectedFaqs.length > 0) {
        lines.push('FAQS:');
        for (const f of selectedFaqs) {
            lines.push(`Q: ${f.question} | A: ${f.answer}`);
        }
    }
    const rawFacts = lines.join('\n');
    // Cap at ~3500 characters
    if (rawFacts.length > 3500) {
        return rawFacts.slice(0, 3490) + '...';
    }
    return rawFacts;
}
/**
 * Parses price text (e.g. "50 Lakhs", "1.2 Cr", "75L") into numeric Lakhs
 */
function parsePriceToLakhs(str) {
    if (!str)
        return null;
    const matchCr = str.match(/(\d+(?:\.\d+)?)\s*(?:cr|crore|crores)/i);
    if (matchCr)
        return parseFloat(matchCr[1]) * 100;
    const matchLakh = str.match(/(\d+(?:\.\d+)?)\s*(?:lakh|lakhs|lac|lacs|l\b)/i);
    if (matchLakh)
        return parseFloat(matchLakh[1]);
    return null;
}
// Distinct Roman Hindi tokens that NEVER collide with valid English words
const DISTINCT_HINGLISH_TOKENS = new Set([
    'kya', 'hai', 'hain', 'h', 'hn', 'haan', 'ha', 'han', 'mein', 'main', 'kitna', 'kitne', 'kitni',
    'kahan', 'kaha', 'batao', 'batayein', 'bataiye', 'batado', 'bata', 'btao', 'bta', 'chahiye',
    'chahie', 'hoga', 'hogi', 'honge', 'karna', 'karein', 'kare', 'krna', 'kro', 'karo', 'kaise',
    'kese', 'accha', 'achha', 'theek', 'thik', 'sasta', 'saste', 'mehenga', 'mehenge', 'paas', 'pas',
    'bhi', 'kuch', 'kuj', 'bhejo', 'bhejiye', 'bhej', 'dekho', 'dekhna', 'dekh', 'dekhein', 'kr',
    'nhi', 'nahi', 'na', 'raha', 'rahi', 'rahe', 'rha', 'rhi', 'rhe', 'humein', 'hume', 'humara',
    'humari', 'humare', 'aapko', 'aapke', 'aapka', 'aapki', 'aap', 'mujhe', 'mujhko', 'mera', 'meri',
    'mere', 'kaun', 'konsa', 'konsi', 'kaunsa', 'kaunsi', 'kon', 'yaar', 'yr', 'dost', 'bolo', 'bol',
    'bole', 'bolna', 'karwa', 'karwana', 'subah', 'shaam', 'sham', 'dopahar', 'raat', 'chhat',
    'gaadi', 'gadi', 'bache', 'bachon', 'pata', 'dhanyawad', 'shukriya', 'namaste', 'pranam', 'apna',
    'apne', 'apni', 'isme', 'isse', 'ise', 'usse', 'unhe', 'unko', 'iska', 'iski', 'iske',
    'uska', 'uski', 'uske', 'inka', 'inki', 'inke', 'unka', 'unki', 'unke', 'ab', 'abhi', 'kab',
    'kbtak', 'kabtak', 'fir', 'phir', 'baad', 'pehle', 'pahle', 'thoda', 'thodi', 'bohot', 'bahut',
    'bhut', 'jyada', 'jada', 'kam', 'aur', 'par', 'pe', 'se', 'ko', 'ka', 'ki', 'ke', 'bas',
    'sirf', 'khali', 'le', 'lo', 'lena', 'lenge', 'lia', 'liya', 'di', 'diya', 'de', 'du',
    'dena', 'denge', 'chalega', 'chalegi', 'chalenge', 'hota', 'hoti', 'hote', 'tha', 'thi', 'thhe',
    'aa', 'aao', 'aana', 'aayenge', 'aate', 'ja', 'jao', 'jana', 'jayenge', 'jate', 'mil', 'milo',
    'milna', 'milega', 'milegi', 'samjh', 'samjha', 'samjho', 'pooch', 'poochho', 'poochna', 'puch',
    'puchho', 'puchna', 'baat', 'baatcheet', 'batcheet', 'kyu', 'kyun', 'kyunki', 'kyuki', 'kyuuki',
    'aisi', 'aisa', 'aise', 'waise', 'waisa', 'yahan', 'yahin', 'wahan', 'wahin', 'idhar', 'udhar',
    'kidhar', 'log', 'logon', 'bhai', 'bhaiya', 'bro', 'sirji', 'saheb', 'sab', 'sabhi', 'sabse',
    'aage', 'peeche', 'samne', 'saamne', 'beech', 'taraf', 'tarikh', 'tareekh', 'baje', 'ghante',
    'mahina', 'saal', 'zameen', 'jameen', 'makan', 'makaan', 'kothi', 'kiraya', 'khareed', 'khareedna',
    'bikau', 'khareeddar', 'naya', 'nayi', 'naye', 'purana', 'purani', 'purane', 'suvidha',
    'suvidhayein', 'rasta', 'raasta', 'raste', 'sadak', 'naksha', 'bijli', 'paani', 'pani', 'kabza',
    'registry', 'kist', 'kisht', 'byaj', 'byaaj', 'chhoot', 'daam', 'bhao', 'bhav', 'bdda', 'bada',
    'chota', 'chhota', 'krrha', 'bataye', 'gandu'
]);
// Common Hinglish compound phrases that immediately confirm Hinglish
const HINGLISH_PHRASES_REGEX = /\b(kya\s+hai|kitna\s+hai|kaha\s+hai|kahan\s+hai|batao\s+na|bhej\s+(do|du|de|na)|bhejo\s+na|send\s+(karo|kr\s*do|kardo|krna)|share\s+(karo|kr\s*do|kardo)|batado|bata\s+(do|du|de)|bta\s+(do|du|de)|bataiye|call\s+(karo|krna|karna)|baat\s+(karni|kr|krrha|kre|kare)|kab\s+tak|kab\s+milega|kaisa\s+hai|kya\s+rate|rate\s+kya|price\s+kya|kuch\s+discount|kitne\s+ka|details\s+(do|de\s*do|de)|brochure\s+(do|de\s*do|de)|location\s+(do|bhejo|send\s+karo)|visit\s+(karna|krna)|dekhna\s+hai|lena\s+hai|chahiye|kar\s+(do|du|de)|kr\s+(do|du|de)|ha\s+bhai|haan\s+bhai|kya\s+scene\s+hai|chalega\s+kya|milega\s+kya|kr\s+rha|krrha\s+h|hisab\s+se|hisaab\s+se|mat\s+karo|nhi\s+chahiye|nahi\s+chahiye|answer\s+kre|ans\s+kre|fix\s+kro)\b/i;
// Grammatical English phrases that confirm natural English phrasing
const DEFINITE_ENGLISH_PHRASES_REGEX = /\b(could\s+you|would\s+you|can\s+you|please\s+provide|i\s+would\s+like\s+to|i\s+want\s+to\s+know|what\s+is\s+the|where\s+is\s+the|how\s+much\s+is|when\s+will\s+it|is\s+there\s+any|are\s+there\s+any|do\s+you\s+have|does\s+this\s+project|looking\s+for|interested\s+in|let\s+me\s+know|kindly\s+share|schedule\s+a\s+visit|thank\s+you\s+for|i\s+am\s+looking|we\s+are\s+looking|my\s+budget\s+is|can\s+i\s+get|could\s+i\s+get|can\s+we\s+arrange|i\s+wish\s+to|please\s+share\s+the|please\s+send\s+the|could\s+you\s+share|give\s+me\s+more\s+details|tell\s+me\s+about|what\s+are\s+the|payment\s+plan|down\s+payment)\b/i;
// Genuine English syntactic markers (words that are not borrowed into casual Hinglish)
const DEFINITE_ENGLISH_WORDS = new Set([
    'the', 'which', 'whose', 'whom', 'their', 'there', 'theirs', 'myself', 'yourself', 'ourselves',
    'between', 'among', 'through', 'during', 'before', 'after', 'above', 'below',
    'because', 'although', 'however', 'therefore', 'furthermore', 'regarding', 'concerning',
    'according', 'specifications', 'assistance', 'appreciate', 'regards', 'kindly',
    'would', 'could', 'should', 'starting', 'apartments', 'payment'
]);
/**
 * Intelligent Language Detector with Conversation History Memory:
 * 1. Checks pure Hindi (Devanagari script)
 * 2. Checks explicit language requests (e.g. "talk in english", "hindi me batao")
 * 3. Checks definitive Hinglish words & phrases
 * 4. Checks definitive English sentence grammar
 * 5. For ambiguous/short/loan-word messages (e.g. "ok", "yes", "send location", "brochure", "site visit"):
 *    Retains the conversation's active preferredLanguage or inspects old chat history!
 */
function detectLanguage(text, context) {
    if (!text) {
        if (typeof context === 'string')
            return context;
        if (context && context.preferredLanguage)
            return context.preferredLanguage;
        return 'hinglish';
    }
    // 1. Pure Hindi Devanagari script (Unicode range 0900-097F)
    if (/[\u0900-\u097F]/.test(text)) {
        return 'hindi';
    }
    const rawLower = text.toLowerCase().trim();
    // 2. Explicit Language Directive from User (e.g. "talk in english", "hindi me batao")
    if (/^(please\s+)?(speak|talk|write|reply|converse)\s+in\s+english\b/i.test(rawLower) ||
        /^(please\s+)?(in\s+english|english\s+please|english\s+plz)\b/i.test(rawLower) ||
        /\b(english\s*(me|mein)\s*(batao|bolo|karo|bataiye|samjhao))\b/i.test(rawLower)) {
        return 'english';
    }
    if (/^(please\s+)?(speak|talk|write|reply|converse)\s+in\s+(hindi|hinglish)\b/i.test(rawLower) ||
        /^(please\s+)?(in\s+(hindi|hinglish)|(hindi|hinglish)\s+please|(hindi|hinglish)\s+plz)\b/i.test(rawLower) ||
        /\b((hindi|hinglish)\s*(me|mein)\s*(batao|bolo|karo|bataiye|samjhao))\b/i.test(rawLower)) {
        return 'hinglish';
    }
    // 3. Check for Definitive Hinglish Phrases & Tokens
    if (HINGLISH_PHRASES_REGEX.test(rawLower)) {
        return 'hinglish';
    }
    const words = rawLower.replace(/[^\w\s]/g, ' ').split(/\s+/).filter(Boolean);
    if (words.length === 0) {
        if (typeof context === 'string')
            return context;
        if (context && context.preferredLanguage)
            return context.preferredLanguage;
        return 'hinglish';
    }
    let hinglishCount = 0;
    let definiteEnglishCount = 0;
    for (const w of words) {
        if (DISTINCT_HINGLISH_TOKENS.has(w))
            hinglishCount++;
        if (DEFINITE_ENGLISH_WORDS.has(w))
            definiteEnglishCount++;
    }
    // If ANY distinct Hinglish token is present (e.g. "isme", "bhi", "batao", "hai", "kr")
    if (hinglishCount > 0 && hinglishCount >= definiteEnglishCount) {
        return 'hinglish';
    }
    // 4. Check for Definitive English Sentence Grammar
    const hasDefiniteEnglishPhrase = DEFINITE_ENGLISH_PHRASES_REGEX.test(rawLower);
    if (hasDefiniteEnglishPhrase || definiteEnglishCount >= 2) {
        return 'english';
    }
    // 5. Ambiguous / Short / Loan-Word Messages (e.g. "ok", "yes", "send location", "brochure", "site visit", "price")
    // RESOLVE FROM OLD CHAT / CONVERSATION HISTORY!
    const preferredLang = typeof context === 'string'
        ? context
        : (context && context.preferredLanguage) || null;
    if (preferredLang) {
        return preferredLang;
    }
    // Inspect chat history if provided
    const history = (context && typeof context === 'object' && Array.isArray(context.history)) ? context.history : [];
    if (history.length > 0) {
        // Scan previous user messages in reverse to find established language
        for (let i = history.length - 1; i >= 0; i--) {
            const msg = history[i];
            if (msg.role === 'user' && msg.content && msg.content.trim()) {
                const pastLower = msg.content.toLowerCase();
                if (/[\u0900-\u097F]/.test(pastLower))
                    return 'hindi';
                if (HINGLISH_PHRASES_REGEX.test(pastLower))
                    return 'hinglish';
                const pastWords = pastLower.replace(/[^\w\s]/g, ' ').split(/\s+/).filter(Boolean);
                if (pastWords.some(w => DISTINCT_HINGLISH_TOKENS.has(w)))
                    return 'hinglish';
                if (DEFINITE_ENGLISH_PHRASES_REGEX.test(pastLower))
                    return 'english';
            }
        }
    }
    // Default to Hinglish for Indian WhatsApp audience
    return 'hinglish';
}
/**
 * Matches user query against trained FAQs, keywords, and core project attributes
 * Returns exact verified answer if match confidence is high, or null.
 * Mirrors user language: English ➔ English, Hinglish ➔ Hinglish, Hindi ➔ Hindi.
 */
function findDirectFaqAnswer(project, userMessage) {
    if (!project || !userMessage || !userMessage.trim())
        return null;
    const rawLower = userMessage.toLowerCase().trim();
    const cleanMsg = rawLower.replace(/[^\w\s\u0900-\u097F]/gi, ' ');
    // ─────────────────────────────────────────────────────────────
    // Trained Project FAQs Matcher (Database FAQs Only)
    // Conversational chat & project synthesis are handled dynamically by Gemini AI!
    // ─────────────────────────────────────────────────────────────
    const STOP_WORDS = new Set([
        'who', 'are', 'you', 'how', 'is', 'am', 'was', 'were', 'the', 'in', 'to', 'for',
        'of', 'and', 'a', 'an', 'at', 'by', 'do', 'does', 'did', 'kya', 'hai', 'hain',
        'ho', 'h', 'ka', 'ki', 'ke', 'ko', 'se', 'me', 'mein', 'par', 'pe', 'bhi',
        'kuch', 'batao', 'bataiye', 'sir', 'ji', 'bhai', 'yaar', 'yr', 'please', 'tell',
        'this', 'that', 'these', 'those', 'project', 'property', 'details', 'detail',
        'info', 'information', 'send', 'give', 'show', 'bhejo', 'bhejiye', 'karo',
        'chahiye', 'chahie', 'humein', 'mujhe', 'aap', 'mera', 'meri', 'mere'
    ]);
    const meaningfulTokens = cleanMsg
        .split(/\s+/)
        .map(t => t.trim())
        .filter(t => t.length >= 3 && !STOP_WORDS.has(t));
    // If user query only had generic/stop words (e.g. "Details of this project"), do NOT match random FAQs!
    if (meaningfulTokens.length === 0) {
        return null;
    }
    const faqs = project.faqs || [];
    let bestFaq = null;
    let highestScore = 0;
    for (const faq of faqs) {
        let score = 0;
        const qLower = (faq.question || '').toLowerCase().trim();
        const aLower = (faq.answer || '').toLowerCase().trim();
        const keywords = (faq.keywords || []).map((k) => k.toLowerCase().trim()).filter(Boolean);
        // Exact question match
        if (qLower.length >= 5 && rawLower === qLower) {
            score += 20;
        }
        // Meaningful token matches
        for (const token of meaningfulTokens) {
            const tokenRegex = new RegExp(`\\b${token}\\b`, 'i');
            if (tokenRegex.test(qLower))
                score += 6;
            if (keywords.some(kw => tokenRegex.test(kw)))
                score += 8;
            if (tokenRegex.test(aLower))
                score += 2;
        }
        if (score > highestScore) {
            highestScore = score;
            bestFaq = faq;
        }
    }
    // Require strong confidence (score >= 12)
    if (bestFaq && highestScore >= 12 && bestFaq.answer && bestFaq.answer.trim()) {
        // 🛡️ Extra Guardrail: If answer contains "35acres" but user did not ask about area/acres, reject it!
        const is35AcresAnswer = /35\s*acres?|spread\s*over/i.test(bestFaq.answer);
        const askedAboutArea = /acre|acres|spread|total area|land area|master plan/i.test(rawLower);
        if (is35AcresAnswer && !askedAboutArea) {
            return null;
        }
        return bestFaq.answer.trim();
    }
    return null;
}
/**
 * Cross-Selling Budget Engine:
 * Finds another active project from the portfolio if the buyer's budget is lower than current project
 */
async function findCrossSellProject(currentProjectId, budgetStr) {
    try {
        const budgetLakhs = parsePriceToLakhs(budgetStr);
        if (!budgetLakhs)
            return null;
        const otherProjects = await project_model_1.default.find({
            _id: { $ne: currentProjectId },
            isActive: true,
        }).lean();
        for (const proj of otherProjects) {
            const projPriceLakhs = parsePriceToLakhs(proj.priceRange || '');
            if (projPriceLakhs && projPriceLakhs <= budgetLakhs * 1.2) {
                return proj;
            }
            if (proj.unitTypes && proj.unitTypes.length > 0) {
                for (const u of proj.unitTypes) {
                    const uPrice = parsePriceToLakhs(u.priceFrom || '');
                    if (uPrice && uPrice <= budgetLakhs * 1.2) {
                        return proj;
                    }
                }
            }
        }
    }
    catch (err) {
        console.error('Error finding cross-sell project:', err);
    }
    return null;
}
/**
 * Dynamically queries all active properties from MongoDB to provide a live portfolio catalogue
 * NO static / hardcoded data - everything loaded directly from database.
 */
async function getDynamicPortfolioCatalogue(excludeProjectId) {
    const query = { isActive: true };
    if (excludeProjectId) {
        query._id = { $ne: excludeProjectId };
    }
    let projects = await project_model_1.default.find(query)
        .select('name location priceRange unitTypes developer summary')
        .lean();
    if (!projects || projects.length === 0) {
        projects = await project_model_1.default.find(excludeProjectId ? { _id: { $ne: excludeProjectId } } : {})
            .select('name location priceRange unitTypes developer summary')
            .lean();
    }
    if (!projects || projects.length === 0) {
        return 'No other active properties currently available in the database.';
    }
    const lines = [];
    for (const p of projects) {
        const spaces = (p.unitTypes || [])
            .map(u => `${u.type}${u.sizeSqft ? ` (Space: ${u.sizeSqft})` : ''}${u.priceFrom ? ` (Rate: ${u.priceFrom})` : ''}`)
            .join(', ');
        lines.push(`• Project: "${p.name}"\n  📍 Location: ${p.location || 'Available on request'}\n  📐 Space/Units: ${spaces || 'Unit space details on request'}\n  💰 Rate/Price Range: ${p.priceRange || 'Available on request'}`);
    }
    return lines.join('\n\n');
}
/**
 * Checks if the user is asking for general property/project details or what properties/projects are available
 */
function isPropertyDetailsQuery(text) {
    if (!text)
        return false;
    const lower = text.toLowerCase().trim();
    // Negative check: user says "not interested in details"
    if (/(not\s+interested|don'?t\s+send|nhi\s+chahiye|mat\s+bhejo)/i.test(lower)) {
        return false;
    }
    // 1. Any mention of detail / details (e.g. "Details of this project", "Details of this property", "send details", "property details")
    if (/\b(details?|detail)\b/i.test(lower)) {
        return true;
    }
    // 2. Direct follow-up commands like "send me", "send it", "bhejo", "share", "send"
    if (/^(send\s+me|send\s+it|send|share|bhejo|bhejna|batao|share\s+karo|dikhao)$/i.test(lower)) {
        return true;
    }
    // 3. Information, overview, brochure requests
    if (/\b(info|information|overview|brochure|catalogue|features|specifications)\b/i.test(lower)) {
        return true;
    }
    // 4. Inquiring about what projects / options are available
    if (/(what\s+projects|which\s+projects|all\s+projects|options|kya\s+kya\s+project|konsa\s+project|kaun\s+se\s+project)/i.test(lower)) {
        return true;
    }
    // 5. Natural property exploration phrases
    if (/(tell\s+me\s+about|know\s+about|about\s+the|about\s+this|kya\s+hai|kya\s+h)\s+(the\s+|this\s+|our\s+)?(property|project|township|plots?|flats?)/i.test(lower)) {
        return true;
    }
    // 6. Hindi / Devanagari details queries
    if (/(डिटेल|जानकारी|प्रॉपर्टी|प्रोजेक्ट)/i.test(lower)) {
        return true;
    }
    return false;
}
/**
 * Formats comprehensive details for a single selected or active project
 */
function formatSingleProjectDetails(project, lang) {
    if (!project)
        return '';
    const units = (project.unitTypes || [])
        .map((u) => `• *${u.type}*${u.sizeSqft ? ` — Space: ${u.sizeSqft}` : ''}${u.priceFrom ? ` (From ${u.priceFrom})` : ''}`)
        .join('\n');
    const amenities = (project.amenities || []).slice(0, 6).join(', ');
    if (lang === 'english') {
        let reply = `Here are the complete details for *${project.name}*:\n\n`;
        if (project.location)
            reply += `📍 *Location:* ${project.location}\n`;
        if (project.priceRange)
            reply += `💰 *Pricing:* Starting @ ${project.priceRange}\n`;
        if (units)
            reply += `📐 *Available Units & Sizes:*\n${units}\n`;
        if (amenities)
            reply += `✨ *Key Amenities:* ${amenities}\n`;
        if (project.possession)
            reply += `📅 *Possession:* ${project.possession}\n`;
        if (project.reraNumber)
            reply += `🏛️ *RERA:* ${project.reraNumber}\n`;
        if (project.summary)
            reply += `\nℹ️ *Summary:* ${project.summary}\n`;
        reply += `\nWould you like to schedule a site visit this weekend to see the property in person? 🏡`;
        return reply;
    }
    if (lang === 'hindi') {
        let reply = `*${project.name}* की संपूर्ण जानकारी:\n\n`;
        if (project.location)
            reply += `📍 *लोकेशन:* ${project.location}\n`;
        if (project.priceRange)
            reply += `💰 *कीमत:* ${project.priceRange} से शुरू\n`;
        if (units)
            reply += `📐 *उपलब्ध साइज व यूनिट्स:*\n${units}\n`;
        if (amenities)
            reply += `✨ *सुविधाएं:* ${amenities}\n`;
        if (project.possession)
            reply += `📅 *पजेशन:* ${project.possession}\n`;
        if (project.reraNumber)
            reply += `🏛️ *रेरा (RERA):* ${project.reraNumber}\n`;
        reply += `\nक्या आप इस सप्ताहांत पर प्रॉपर्टी देखने के लिए साइट विजिट शेड्यूल करना चाहेंगे? 🏡`;
        return reply;
    }
    // Hinglish
    let reply = `Yeh rahi *${project.name}* ki complete property details:\n\n`;
    if (project.location)
        reply += `📍 *Location:* ${project.location}\n`;
    if (project.priceRange)
        reply += `💰 *Pricing:* Starting @ ${project.priceRange}\n`;
    if (units)
        reply += `📐 *Available Sizes & Units:*\n${units}\n`;
    if (amenities)
        reply += `✨ *Key Amenities:* ${amenities}\n`;
    if (project.possession)
        reply += `📅 *Possession:* ${project.possession}\n`;
    if (project.reraNumber)
        reply += `🏛️ *RERA Number:* ${project.reraNumber}\n`;
    reply += `\nKya hum is weekend par aapka ek sample flat site visit schedule karein taaki aap quality khud dekh sakein? 🏡`;
    return reply;
}
/**
 * Formats a numbered list of all active projects for the user to choose from
 */
function formatMultiProjectList(projects, lang) {
    if (!projects || projects.length === 0) {
        if (lang === 'english')
            return 'No active properties are currently listed in our database.';
        return 'Filhaal database mein koi active project available nahi hai.';
    }
    const items = projects
        .map((p, idx) => `${idx + 1}. *${p.name}*\n   📍 Location: ${p.location || 'Available on request'}\n   💰 Price: Starting @ ${p.priceRange || 'Available on request'}`)
        .join('\n\n');
    if (lang === 'english') {
        return `We currently have these prime projects available at *Bhole Baba Investments*:\n\n${items}\n\nWhich project would you like to explore details for? Please reply with the *Project Name* or *Number (1, 2...)* 🏡`;
    }
    if (lang === 'hindi') {
        return `*भोले बाबा इन्वेस्टमेंट्स* के पास वर्तमान में ये प्रमुख प्रोजेक्ट्स उपलब्ध हैं:\n\n${items}\n\nआप किस प्रोजेक्ट की पूरी जानकारी देखना चाहते हैं? कृपया प्रोजेक्ट का *नाम* या *नंबर (1, 2...)* लिखकर भेजें 🏡`;
    }
    return `Hamare paas *Bhole Baba Investments* ke ye prime projects available hain:\n\n${items}\n\nAap kaun se project ki details dekhna chahte hain? Bas project ka *Naam* ya *Number (1, 2...)* reply kar dein 🏡`;
}
/**
 * Checks if user message is selecting a project by number ("1", "2") or name
 */
function matchProjectFromSelection(text, activeProjects) {
    if (!text || !activeProjects || activeProjects.length === 0)
        return null;
    const raw = text.trim();
    const lower = raw.toLowerCase();
    // 1. Exact numeric selection: "1", "2", "3", "#1", "project 1", "option 2"
    const numMatch = lower.match(/^(?:project|option|number|no\.?|#)?\s*(\d{1,2})\b/i);
    if (numMatch) {
        const idx = parseInt(numMatch[1], 10) - 1;
        if (idx >= 0 && idx < activeProjects.length) {
            return activeProjects[idx];
        }
    }
    // 2. Project name or keywords matching
    for (const proj of activeProjects) {
        const pName = (proj.name || '').toLowerCase().trim();
        if (pName.length >= 3 && lower.includes(pName)) {
            return proj;
        }
        const slug = (proj.slug || '').toLowerCase().trim();
        if (slug.length >= 3 && lower.includes(slug)) {
            return proj;
        }
        for (const kw of proj.keywords || []) {
            const cleanKw = (kw || '').toLowerCase().trim();
            if (cleanKw.length >= 3 && lower.includes(cleanKw)) {
                return proj;
            }
        }
    }
    return null;
}
/**
 * Master Real Estate Response Synthesizer:
 * Takes DB verified facts and generates an immediate, high-quality, consultative response
 * strictly adhering to the user's language (English, Hindi, Hinglish).
 * This ensures that whether LLM is active or on fallback, the user NEVER receives
 * a repeated or unsatisfactory reply!
 */
function buildIntelligentRealEstateResponse(project, userMessage, lang, activeProjects = []) {
    const rawLower = (userMessage || '').toLowerCase().trim();
    // 1. Direct verified answer from FAQs or attributes
    const direct = findDirectFaqAnswer(project, userMessage);
    if (direct) {
        return direct;
    }
    // 2. Asking about Projects / Available Portfolio
    const askingProjects = /projects?|options|properties|portfolio|list|what do you have|kya kya|kaun se/i.test(rawLower);
    if (askingProjects && activeProjects && activeProjects.length > 1) {
        return formatMultiProjectList(activeProjects, lang);
    }
    // 3. Asking about Price / Rates
    const isAskingPrice = /price|rate|cost|budget|kitna|kitne|pricing|amount|lakh|cr/i.test(rawLower);
    if (isAskingPrice && project?.priceRange) {
        if (lang === 'english') {
            let r = `The pricing for *${project.name}* starts from *${project.priceRange}*.`;
            if (project.unitTypes && project.unitTypes.length > 0) {
                const uStr = project.unitTypes.map((u) => `• *${u.type}*: Starting from ${u.priceFrom || 'Best market price'}${u.sizeSqft ? ` (${u.sizeSqft})` : ''}`).join('\n');
                r += `\n\n${uStr}`;
            }
            r += `\n\nAre you looking to buy for personal residence (self-use) or investment? 🏡`;
            return r;
        }
        if (lang === 'hindi') {
            let r = `*${project.name}* में कीमतें *${project.priceRange}* से शुरू होती हैं।`;
            if (project.unitTypes && project.unitTypes.length > 0) {
                const uStr = project.unitTypes.map((u) => `• *${u.type}*: ${u.priceFrom || 'उचित मूल्य'}${u.sizeSqft ? ` (${u.sizeSqft})` : ''}`).join('\n');
                r += `\n\n${uStr}`;
            }
            r += `\n\nक्या आप यह प्रॉपर्टी खुद रहने के लिए देख रहे हैं या निवेश के लिए? 🏡`;
            return r;
        }
        let r = `*${project.name}* mein price starting *${project.priceRange}* se hai.`;
        if (project.unitTypes && project.unitTypes.length > 0) {
            const uStr = project.unitTypes.map((u) => `• *${u.type}*: Starting from ${u.priceFrom || 'Best market price'}${u.sizeSqft ? ` (${u.sizeSqft})` : ''}`).join('\n');
            r += `\n\n${uStr}`;
        }
        r += `\n\nAap is property ko self-use (rehne ke liye) dekh rahe hain ya investment purpose ke liye? 🏡`;
        return r;
    }
    // 4. Asking about Location / Connectivity
    const isAskingLocation = /location|where|address|kahan|kahape|reach|distance|highway|road/i.test(rawLower);
    if (isAskingLocation && project?.location) {
        const mapsLink = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${project.name} ${project.location}`.trim())}`;
        if (lang === 'english') {
            return `*${project.name}* is ideally located at *${project.location}*.\n\n📍 *Google Maps:* ${mapsLink}\n\nIt offers seamless highway connectivity and quick access to top schools, healthcare, and retail hubs. Would you like to schedule a site visit this weekend to see the location in person? 🏡`;
        }
        if (lang === 'hindi') {
            return `*${project.name}* प्राइम लोकेशन *${project.location}* पर स्थित है।\n\n📍 *गूगल मैप्स लिंक:* ${mapsLink}\n\nयहाँ से मुख्य हाईवे, स्कूल और अस्पतालों की बेहतरीन कनेक्टिविटी है। क्या हम इस सप्ताहांत पर आपका साइट विजिट प्लान करें? 🏡`;
        }
        return `*${project.name}* prime location par situated hai — *${project.location}*.\n\n📍 *Google Maps Link:* ${mapsLink}\n\nYahan se highway connectivity, schools aur daily essentials bohot paas hain. Kya hum is weekend par aapka ek sample flat site visit schedule karein? 🏡`;
    }
    // 5. Asking about Amenities / Facilities
    const isAskingAmenities = /amenit|facilit|park|gym|pool|security|road|water|cctv|suvidha/i.test(rawLower);
    if (isAskingAmenities && project?.amenities && project.amenities.length > 0) {
        const aList = project.amenities.slice(0, 8).join(', ');
        if (lang === 'english') {
            return `*${project.name}* comes equipped with top-tier lifestyle amenities:\n\n✨ ${aList}\n\nWhich configuration (1 BHK, 2 BHK, 3 BHK, or plot) are you looking for? 🏡`;
        }
        if (lang === 'hindi') {
            return `*${project.name}* में आधुनिक सुविधाएं उपलब्ध हैं:\n\n✨ ${aList}\n\nआपकी प्राथमिकता किस साइज या यूनिट के लिए है? 🏡`;
        }
        return `*${project.name}* mein world-class amenities provide ki gayi hain:\n\n✨ ${aList}\n\nAap kis size ka flat ya plot prefer kar rahe hain? 🏡`;
    }
    // 6. Default Consultative Response Grounded in Bhole Baba Investments
    const projName = project?.name || 'our prime properties';
    const priceSnippet = project?.priceRange ? `starting @ ${project.priceRange}` : 'at the best market rates';
    if (lang === 'english') {
        return `Thank you for reaching out to *Bhole Baba Investments*! Regarding *${projName}*, we offer excellent premium options ${priceSnippet}.\n\nWould you like more details on the exact location, available unit layouts, or shall we arrange a sample flat site visit this weekend? 🏡`;
    }
    if (lang === 'hindi') {
        return `*भोले बाबा इन्वेस्टमेंट्स* में संपर्क करने के लिए धन्यवाद! *${projName}* में हमारे पास ${priceSnippet} बेहतरीन विकल्प उपलब्ध हैं।\n\nक्या आप लोकेशन, यूनिट साइज जानना चाहते हैं या इस सप्ताहांत पर साइट विजिट प्लान करना चाहेंगे? 🏡`;
    }
    return `*Bhole Baba Investments* mein sampark karne ke liye shukriya! *${projName}* ke regarding hamare paas ${priceSnippet} prime options available hain.\n\nKya aap exact location, unit layouts dekhna chahenge ya is weekend par ek sample flat site visit schedule karein? 🏡`;
}
//# sourceMappingURL=projectKnowledgeService.js.map