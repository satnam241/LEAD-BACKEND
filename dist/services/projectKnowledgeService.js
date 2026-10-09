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
const project_model_1 = __importDefault(require("../models/project.model"));
async function getProjectFacts(projectId, userMessage) {
    const project = await project_model_1.default.findById(projectId).lean();
    if (!project || !project.isActive) {
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
function detectLanguage(text) {
    if (!text)
        return 'hinglish';
    // 1. Pure Hindi Devanagari script (Unicode range 0900-097F)
    if (/[\u0900-\u097F]/.test(text)) {
        return 'hindi';
    }
    // 2. Hinglish (Roman Hindi tokens)
    const hinglishTokens = [
        'kya', 'hai', 'hain', 'h', 'ka', 'ki', 'ke', 'ko', 'se', 'me', 'mein', 'par',
        'pe', 'kitna', 'kitne', 'kitni', 'kahan', 'kaha', 'kab', 'batao', 'batayein',
        'bhai', 'sir', 'ji', 'kr', 'karein', 'karna', 'hoga', 'hogi', 'chahiye',
        'dekhna', 'lena', 'saste', 'sasta', 'mehenga', 'accha', 'achha', 'thik',
        'ha', 'haan', 'nahi', 'nhi', 'na', 'bhi', 'paas', 'kaise', 'kese', 'kon',
        'kaun', 'aap', 'tum', 'mera', 'meri', 'mere', 'hum', 'humare', 'apna',
        'baje', 'kal', 'aaj', 'parso', 'subah', 'shaam', 'dopahar', 'raat', 'kuch',
        'chhat', 'gadi', 'bache', 'naam', 'sun', 'suno', 'btao', 'plz', 'kripya',
        'batana', 'pata', 'yr', 'dost', 'bhejo', 'bhejna', 'dekh', 'dekho', 'bhejiye',
        'karwa', 'karwana', 'bolo', 'bata'
    ];
    const lower = text.toLowerCase();
    const words = lower.replace(/[^\w\s]/g, ' ').split(/\s+/).filter(Boolean);
    for (const w of words) {
        if (hinglishTokens.includes(w)) {
            return 'hinglish';
        }
    }
    return 'english';
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
    const lang = detectLanguage(userMessage);
    // ─────────────────────────────────────────────────────────────
    // 1. TOP PRIORITY: Conversational & Small-Talk Handling
    // ─────────────────────────────────────────────────────────────
    // FIRST MESSAGE & INITIAL GREETINGS
    if (/^(hello|hi|hey|hii|helo|hlo|namaste|good morning|good afternoon|good evening|hello sir|hi sir|hey sir|hello ji|hi ji|greetings|start)(\s+.*)?$/i.test(rawLower) && rawLower.split(/\s+/).length <= 4) {
        if (project?.welcomeMessage && project.welcomeMessage.trim()) {
            return project.welcomeMessage.trim();
        }
        return null;
    }
    if (/(who are you|tum kaun ho|aap kaun ho|kya naam hai|bot ho|robot ho|ai ho|kya tum ai ho|who r u|who you are|आप कौन|तुम कौन|क्या नाम|कौन हो|कौन हैं)/i.test(rawLower)) {
        if (lang === 'english') {
            return `I am your dedicated Property Consultant for *${project?.name || 'this property'}* 🏡 I am here to assist you with live pricing, plot layouts, location details, and scheduling site visits. What details would you like to explore?`;
        }
        if (lang === 'hindi') {
            return `मैं *${project?.name || 'प्रॉपर्टी एडवाइजरी'}* का समर्पित प्रॉपर्टी कंसलटेंट हूँ 🏡 मैं आपको इस प्रोजेक्ट की लाइव कीमतें, लेआउट, लोकेशन और साइट विजिट अरेंज करने में मदद करूँगा। आप क्या जानकारी जानना चाहेंगे?`;
        }
        return `Main *${project?.name || 'Property Advisory'}* ka dedicated Property Consultant hoon 🏡 Main aapko is project ki live pricing, plot layouts, location aur site visit arrange karne mein guide karta hoon. Aap is property mein kya explore karna chahenge?`;
    }
    if (/(kaise ho|how are you|kya haal|kya chal raha|sab theek|sab kaisa hai|kese ho|how r u|कैसे हो|कैसा है|क्या हाल|सब ठीक)/i.test(rawLower)) {
        if (lang === 'english') {
            return `I am doing great, thank you! 😊 Hope you are having a wonderful day. How may I assist you with *${project?.name || 'this property'}* today? Would you like to check pricing or unit sizes?`;
        }
        if (lang === 'hindi') {
            return `मैं बिल्कुल कुशलपूर्वक हूँ, धन्यवाद! 😊 आशा है आप भी सपरिवार कुशल होंगे। मैं *${project?.name || 'इस प्रोजेक्ट'}* के संबंध में आपकी क्या सहायता कर सकता हूँ? क्या आप कीमत या प्लॉट साइज देखना चाहेंगे?`;
        }
        return `Main bilkul badhiya hoon, thank you! 😊 Aasha hai aap bhi ache honge. Main *${project?.name || 'is project'}* ke regarding aapki kya madad kar sakta hoon? Kya aap pricing ya plot sizes dekhna chahenge?`;
    }
    if (/(weather|mausam|temperature|forecast|baarish|rain|garmi|thand|cold|hot today|मौसम|बारिश|गर्मी|ठंड|तापमान)/i.test(rawLower)) {
        if (lang === 'english') {
            return `Haha, I cannot check the weather forecast as I'm the Real Estate Advisor for *${project?.name || 'this property'}*! 🌤️ But I can definitely guide you on plot pricing, connectivity, and scheduling a site visit. Would you like to explore location or unit sizes?`;
        }
        if (lang === 'hindi') {
            return `मौसम का हाल तो मैं नहीं बता सकता क्योंकि मैं *${project?.name || 'प्रॉपर्टी'}* का रियल एस्टेट एडवाइजर हूँ! 🌤️ लेकिन यहाँ प्लॉट्स की कीमत, लोकेशन और साइट विजिट के बारे में पूरी जानकारी दे सकता हूँ। क्या आप लोकेशन या प्लॉट साइज जानना चाहेंगे?`;
        }
        return `Haha, main weather forecast toh nahi bata sakta kyunki main *${project?.name || 'Property'}* ka Real Estate Advisor hoon! 🌤️ Lekin agar aap yahan plots ki location, pricing ya sample flat visit ke baare mein jaanna chahte hain, toh main zaroor guide kar sakta hoon. Kya aap location ya plot sizes explore karna chahenge?`;
    }
    if (/(thanks|thank you|shukriya|dhanyawad|thx|धन्यवाद|शुक्रिया)/i.test(rawLower)) {
        if (lang === 'english') {
            return `You're most welcome! 🤝 Feel free to let me know if you have any questions about *${project?.name || 'this property'}* or wish to plan a site visit.`;
        }
        if (lang === 'hindi') {
            return `आपका बहुत-बहुत स्वागत है! 🤝 यदि *${project?.name || 'इस प्रॉपर्टी'}* के बारे में कोई अन्य सवाल हो या साइट विजिट प्लान करनी हो, तो अवश्य बताएं।`;
        }
        return `Most welcome! 🤝 Agar *${project?.name || 'is property'}* ke regarding koi bhi sawal ho ya site visit plan karni ho, toh zaroor batayein.`;
    }
    if (/(joke|jokes|gana|song|movie|film|cricket|match|modi|politics|चुटकुला|गाना|फिल्म)/i.test(rawLower)) {
        if (lang === 'english') {
            return `Haha, my entire focus is on helping you find your dream home at *${project?.name || 'our property'}*! 🏡 Shall we discuss pricing or schedule a site visit?`;
        }
        if (lang === 'hindi') {
            return `हाँ, मेरा पूरा ध्यान तो आपको *${project?.name || 'हमारे प्रोजेक्ट'}* में बेहतरीन प्रॉपर्टी दिलाने पर है! 🏡 क्या हम कीमत या साइट विजिट के बारे में बात करें?`;
        }
        return `Haha, mera poora focus toh aapko *${project?.name || 'hamare project'}* mein best property dilwane par hai! 🏡 Kya hum pricing ya site visit ke baare mein baat karein?`;
    }
    // ─────────────────────────────────────────────────────────────
    // 2. Attribute-based intelligent matching (Price, Location, Possession, Sizes)
    // ─────────────────────────────────────────────────────────────
    const isAskingPrice = [
        'price', 'rate', 'budget', 'cost', 'kitne', 'kimat', 'amount', 'pricing', 'lakh', 'cr', 'bhav', 'paisa', 'costing', 'rate kya',
        'कीमत', 'कीमतें', 'दाम', 'रेट', 'प्राइस', 'बजट', 'रुपये', 'लाख', 'भाव', 'कितने का', 'मूल्य'
    ].some(w => rawLower.includes(w));
    if (isAskingPrice && project.priceRange) {
        if (lang === 'english') {
            let priceReply = `The price range for *${project.name}* starts from *${project.priceRange}*.`;
            if (project.unitTypes && project.unitTypes.length > 0) {
                const unitDetails = project.unitTypes
                    .filter((u) => u.priceFrom)
                    .map((u) => `• ${u.type}: Starting from ${u.priceFrom}${u.sizeSqft ? ` (${u.sizeSqft})` : ''}`)
                    .join('\n');
                if (unitDetails)
                    priceReply += `\n\n${unitDetails}`;
            }
            priceReply += `\n\nAre you looking for self-use or investment purpose? 🏡`;
            return priceReply;
        }
        if (lang === 'hindi') {
            let priceReply = `*${project.name}* में कीमतें *${project.priceRange}* से शुरू होती हैं।`;
            if (project.unitTypes && project.unitTypes.length > 0) {
                const unitDetails = project.unitTypes
                    .filter((u) => u.priceFrom)
                    .map((u) => `• ${u.type}: शुरुआती दर ${u.priceFrom}${u.sizeSqft ? ` (${u.sizeSqft})` : ''}`)
                    .join('\n');
                if (unitDetails)
                    priceReply += `\n\n${unitDetails}`;
            }
            priceReply += `\n\nक्या आप यह प्रॉपर्टी खुद रहने के लिए देख रहे हैं या निवेश के लिए? 🏡`;
            return priceReply;
        }
        let priceReply = `*${project.name}* mein price starting *${project.priceRange}* se hai.`;
        if (project.unitTypes && project.unitTypes.length > 0) {
            const unitDetails = project.unitTypes
                .filter((u) => u.priceFrom)
                .map((u) => `• ${u.type}: Starting from ${u.priceFrom}${u.sizeSqft ? ` (${u.sizeSqft})` : ''}`)
                .join('\n');
            if (unitDetails)
                priceReply += `\n\n${unitDetails}`;
        }
        priceReply += `\n\nAap is property ko self-use (rehne ke liye) dekh rahe hain ya investment purpose ke liye? 🏡`;
        return priceReply;
    }
    const isAskingLocation = [
        'location', 'address', 'kahan', 'kahape', 'sector', 'road', 'where', 'situated', 'landmark', 'pataa', 'site kahan', 'site address',
        'लोकेशन', 'कहाँ', 'कहा', 'पता', 'कहाँ पर', 'कहा पे', 'स्थान', 'जगह', 'रास्ता', 'पहुंचना', 'किधर'
    ].some(w => rawLower.includes(w));
    if (isAskingLocation && project.location) {
        if (lang === 'english') {
            return `*${project.name}* is located at *${project.location}*.\n\nWould you like more details on nearby connectivity, or shall we arrange a site visit this weekend? 🏡`;
        }
        if (lang === 'hindi') {
            return `*${project.name}* प्राइम लोकेशन *${project.location}* पर स्थित है।\n\nक्या हम इस सप्ताहांत पर आपका साइट विजिट शेड्यूल करें? 🏡`;
        }
        return `*${project.name}* prime location par situated hai — *${project.location}*.\n\nKya hum is weekend par aapka ek sample flat site visit schedule karein? 🏡`;
    }
    const isAskingPossession = [
        'possession', 'ready', 'move in', 'construction', 'timeline', 'kab tak', 'delivery', 'handover', 'completion',
        'पजेशन', 'कब्जा', 'कब तक', 'तैयार', 'हैंडओवर', 'निर्माण'
    ].some(w => rawLower.includes(w));
    if (isAskingPossession && project.possession) {
        if (lang === 'english') {
            return `The possession timeline for *${project.name}* is *${project.possession}*.\n\nWould you like to schedule a site visit to inspect ongoing development? 🏡`;
        }
        if (lang === 'hindi') {
            return `*${project.name}* का पजेशन टाइमलाइन *${project.possession}* है।\n\nक्या आप कंस्ट्रक्शन क्वालिटी देखने के लिए साइट विजिट प्लान करना चाहेंगे? 🏡`;
        }
        return `*${project.name}* ka possession timeline *${project.possession}* hai.\n\nKya aap construction quality aur development dekhne ke liye site visit arrange karna chahenge? 🏡`;
    }
    const isAskingSizes = [
        'size', 'sqft', 'sq.ft', 'units', 'flat', 'apartment', 'bhk', 'configuration', 'space', 'layouts', 'plot size',
        'साइज', 'प्लॉट', 'गज', 'स्क्वायर यार्ड', 'क्षेत्रफल', 'बीएचके', 'फ्लैट', 'आकार', 'नाप'
    ].some(w => rawLower.includes(w));
    if (isAskingSizes && project.unitTypes && project.unitTypes.length > 0) {
        const unitList = project.unitTypes
            .map((u) => `• *${u.type}*${u.sizeSqft ? ` — Space: ${u.sizeSqft}` : ''}${u.priceFrom ? ` — Rate: ${u.priceFrom}` : ''}`)
            .join('\n');
        if (lang === 'english') {
            return `Available configurations at *${project.name}*:\n\n${unitList}\n\nWhich configuration best suits your requirement?`;
        }
        if (lang === 'hindi') {
            return `*${project.name}* में उपलब्ध साइज और कॉन्फ़िगरेशन:\n\n${unitList}\n\nआपकी पसंद कौन से साइज के लिए है?`;
        }
        return `*${project.name}* mein available configurations:\n\n${unitList}\n\nAapki requirement kis configuration ya size ke liye best rahegi?`;
    }
    // ─────────────────────────────────────────────────────────────
    // 3. Trained FAQs Matcher (With Stop-Word Filtering & High Confidence)
    // ─────────────────────────────────────────────────────────────
    const STOP_WORDS = new Set([
        'who', 'are', 'you', 'how', 'is', 'am', 'was', 'were', 'the', 'in', 'to', 'for',
        'of', 'and', 'a', 'an', 'at', 'by', 'do', 'does', 'did', 'kya', 'hai', 'hain',
        'ho', 'h', 'ka', 'ki', 'ke', 'ko', 'se', 'me', 'mein', 'par', 'pe', 'bhi',
        'kuch', 'batao', 'bataiye', 'sir', 'ji', 'bhai', 'yaar', 'yr', 'please', 'tell'
    ]);
    const meaningfulTokens = cleanMsg
        .split(/\s+/)
        .map(t => t.trim())
        .filter(t => t.length >= 3 && !STOP_WORDS.has(t));
    // If user query only had stop words (e.g. "who are you"), do NOT match random FAQs!
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
    const projects = await project_model_1.default.find(query)
        .select('name location priceRange unitTypes developer summary')
        .lean();
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
//# sourceMappingURL=projectKnowledgeService.js.map