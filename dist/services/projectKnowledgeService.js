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
        return 'english';
    // 1. Pure Hindi Devanagari script (Unicode range 0900-097F)
    if (/[\u0900-\u097F]/.test(text)) {
        return 'hindi';
    }
    const lower = text.toLowerCase();
    const words = lower.replace(/[^\w\s]/g, ' ').split(/\s+/).filter(Boolean);
    if (words.length === 0)
        return 'english';
    // Distinct Roman Hindi tokens that NEVER collide with valid English words
    const distinctHinglishTokens = new Set([
        'kya', 'hai', 'hain', 'mein', 'kitna', 'kitne', 'kitni', 'kahan', 'kaha',
        'batao', 'batayein', 'bataiye', 'chahiye', 'chahie', 'hoga', 'hogi', 'honge',
        'karna', 'karein', 'kare', 'kaise', 'kese', 'accha', 'achha', 'theek', 'thik',
        'sasta', 'saste', 'mehenga', 'mehenge', 'paas', 'bhi', 'kuch', 'bhejo',
        'bhejiye', 'dekho', 'dekhna', 'btao', 'kr', 'nhi', 'nahi', 'raha', 'rahi',
        'rahe', 'humein', 'aapko', 'mujhe', 'mera', 'meri', 'mere', 'humara',
        'humari', 'kaun', 'konsa', 'konsi', 'kaunsa', 'kaunsi', 'yaar', 'dost',
        'bolo', 'karwa', 'karwana', 'subah', 'shaam', 'dopahar', 'chhat', 'gaadi',
        'gadi', 'bache', 'bata', 'batana', 'pata', 'dhanyawad', 'shukriya', 'namaste',
        'pranam', 'apna', 'apne', 'apni', 'bta', 'krna', 'kro', 'karo', 'gandu'
    ]);
    // Common English words in real-estate & daily chat
    const commonEnglishWords = new Set([
        'the', 'is', 'are', 'am', 'was', 'were', 'will', 'would', 'could', 'should',
        'can', 'please', 'tell', 'give', 'send', 'show', 'property', 'project',
        'location', 'price', 'pricing', 'details', 'brochure', 'visit', 'available',
        'apartment', 'flat', 'plots', 'villa', 'about', 'want', 'looking', 'for',
        'have', 'has', 'had', 'any', 'some', 'this', 'that', 'these', 'those',
        'good', 'morning', 'afternoon', 'evening', 'hello', 'hi', 'hey', 'thank',
        'thanks', 'you', 'your', 'my', 'our', 'we', 'they', 'them', 'their', 'i',
        'me', 'call', 'contact', 'need', 'interested', 'rate', 'cost', 'where',
        'what', 'which', 'who', 'how', 'when', 'why', 'sir', 'yes', 'no', 'okay',
        'ok', 'sure', 'fine', 'ready', 'booking', 'budget', 'bhk', 'sqft', 'sqyd',
        'size', 'amenities', 'road', 'sector', 'highway', 'park', 'pool', 'gym',
        'help', 'assist', 'know', 'much', 'like', 'schedule', 'book'
    ]);
    let hinglishCount = 0;
    let englishCount = 0;
    for (const w of words) {
        if (distinctHinglishTokens.has(w))
            hinglishCount++;
        if (commonEnglishWords.has(w))
            englishCount++;
    }
    // Only classify as Hinglish if distinct Hinglish tokens are present and outnumber/equal English
    if (hinglishCount > 0 && hinglishCount >= englishCount) {
        return 'hinglish';
    }
    // Default strictly to English
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
        if (lang === 'english') {
            return `Hello! Welcome to *Bhole Baba Investments* Real Estate 🏡\n\nI am your dedicated AI Property Consultant. I am here to help you explore our prime residential & commercial projects, pricing, prime locations, unit layouts, or schedule a site visit.\n\nWhich project or detail would you like to explore today?`;
        }
        if (lang === 'hindi') {
            return `नमस्ते! *भोले बाबा इन्वेस्टमेंट्स* रियल एस्टेट में आपका स्वागत है 🏡\n\nमैं आपका AI प्रॉपर्टी कंसलटेंट हूँ। हमारे पास जो भी प्रमुख प्रोजेक्ट्स हैं, उनकी लोकेशन, लाइव कीमतें, लेआउट व साइट विजिट की जानकारी के लिए मैं यहाँ उपस्थित हूँ।\n\nआप किस प्रोजेक्ट या प्रॉपर्टी के बारे में जानना चाहते हैं?`;
        }
        return `Hello! *Bhole Baba Investments* Real Estate mein aapka swagat hai 🏡\n\nMain aapka AI Property Consultant hoon. Hamare paas jo bhi prime properties aur projects hain, unki live pricing, location, unit sizes aur site visit ke regarding main aapki poori madad karunga.\n\nAap kis project ya property ki details dekhna chahenge?`;
    }
    if (/(who are you|tum kaun ho|aap kaun ho|kya naam hai|bot ho|robot ho|ai ho|kya tum ai ho|who r u|who you are|aap kya ho|kya kaam hai|kya karte ho|आप कौन|तुम कौन|क्या नाम|कौन हो|कौन हैं)/i.test(rawLower)) {
        if (lang === 'english') {
            return `I am the AI Property Consultant for *Bhole Baba Investments* Real Estate 🏡\n\nI am right here to help you with all the properties and projects in our portfolio! You can ask me anything about live pricing, prime locations, unit layouts, amenities, or schedule a site visit. Which property or detail would you like to explore?`;
        }
        if (lang === 'hindi') {
            return `मैं *भोले बाबा इन्वेस्टमेंट्स* रियल एस्टेट का AI बॉट व प्रॉपर्टी कंसलटेंट हूँ 🏡\n\nहमारे पास जो भी प्रमुख प्रोजेक्ट्स हैं, उनके संबंध में सहायता करने के लिए मैं यहाँ उपस्थित हूँ! आप लाइव कीमतें, लोकेशन, यूनिट साइज, सुविधाएं या साइट विजिट बुक करने के बारे में बात कर सकते हैं। आप किस प्रोजेक्ट या प्रॉपर्टी के बारे में जानना चाहते हैं?`;
        }
        return `Main *Bhole Baba Investments* Real Estate ka AI Bot & Property Consultant hoon 🏡\n\nHamare paas jo bhi prime properties aur projects hain, unke regarding main aapki poori madad karne ke liye yahan hoon! Aap live pricing, locations, unit sizes, layouts ya site visit ke baare mein baat kar sakte hain. Aap kaun se project ya property ke baare mein jaanna chahenge?`;
    }
    if (/(kaise ho|how are you|kya haal|kya chal raha|sab theek|sab kaisa hai|kese ho|how r u|कैसे हो|कैसा है|क्या हाल|सब ठीक)/i.test(rawLower)) {
        if (lang === 'english') {
            return `I am doing great, thank you! 😊 Hope you are having a wonderful day. How may I assist you with properties at *Bhole Baba Investments* today? Would you like to check pricing or unit sizes?`;
        }
        if (lang === 'hindi') {
            return `मैं बिल्कुल कुशलपूर्वक हूँ, धन्यवाद! 😊 आशा है आप भी सपरिवार कुशल होंगे। मैं *भोले बाबा इन्वेस्टमेंट्स* के प्रोजेक्ट्स के संबंध में आपकी क्या सहायता कर सकता हूँ? क्या आप कीमत या प्लॉट साइज देखना चाहेंगे?`;
        }
        return `Main bilkul badhiya hoon, thank you! 😊 Aasha hai aap bhi ache honge. Main *Bhole Baba Investments* ke projects ke regarding aapki kya madad kar sakta hoon? Kya aap pricing ya plot sizes dekhna chahenge?`;
    }
    if (/(weather|mausam|temperature|forecast|baarish|rain|garmi|thand|cold|hot today|मौसम|बारिश|गर्मी|ठंड|तापमान)/i.test(rawLower)) {
        if (lang === 'english') {
            return `Haha, I cannot check the weather forecast as I'm the Real Estate Consultant for *Bhole Baba Investments*! 🌤️ But I can definitely guide you on property pricing, connectivity, and scheduling a site visit. Would you like to explore location or unit sizes?`;
        }
        if (lang === 'hindi') {
            return `मौसम का हाल तो मैं नहीं बता सकता क्योंकि मैं *भोले बाबा इन्वेस्टमेंट्स* का रियल एस्टेट एडवाइजर हूँ! 🌤️ लेकिन यहाँ प्रॉपर्टी की कीमत, लोकेशन और साइट विजिट के बारे में पूरी जानकारी दे सकता हूँ। क्या आप लोकेशन या प्लॉट साइज जानना चाहेंगे?`;
        }
        return `Haha, main weather forecast toh nahi bata sakta kyunki main *Bhole Baba Investments* ka Real Estate Advisor hoon! 🌤️ Lekin agar aap yahan properties ki location, pricing ya sample flat visit ke baare mein jaanna chahte hain, toh main zaroor guide kar sakta hoon. Kya aap location ya plot sizes explore karna chahenge?`;
    }
    if (/(thanks|thank you|shukriya|dhanyawad|thx|धन्यवाद|शुक्रिया)/i.test(rawLower)) {
        if (lang === 'english') {
            return `You're most welcome! 🤝 Feel free to let me know if you have any questions about properties at *Bhole Baba Investments* or wish to plan a site visit.`;
        }
        if (lang === 'hindi') {
            return `आपका बहुत-बहुत स्वागत है! 🤝 यदि *भोले बाबा इन्वेस्टमेंट्स* के प्रोजेक्ट्स के बारे में कोई अन्य सवाल हो या साइट विजिट प्लान करनी हो, तो अवश्य बताएं।`;
        }
        return `Most welcome! 🤝 Agar *Bhole Baba Investments* ke regarding koi bhi sawal ho ya site visit plan karni ho, toh zaroor batayein.`;
    }
    if (/(joke|jokes|gana|song|movie|film|cricket|match|modi|politics|चुटकुला|गाना|फिल्म)/i.test(rawLower)) {
        if (lang === 'english') {
            return `Haha, my entire focus is on helping you find your dream property with *Bhole Baba Investments*! 🏡 Shall we discuss pricing or schedule a site visit?`;
        }
        if (lang === 'hindi') {
            return `हाँ, मेरा पूरा ध्यान तो आपको *भोले बाबा इन्वेस्टमेंट्स* में बेहतरीन प्रॉपर्टी दिलाने पर है! 🏡 क्या हम कीमत या साइट विजिट के बारे में बात करें?`;
        }
        return `Haha, mera poora focus toh aapko *Bhole Baba Investments* mein best property dilwane par hai! 🏡 Kya hum pricing ya site visit ke baare mein baat karein?`;
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
        if (lang === 'english') {
            return `*${project.name}* is ideally located at *${project.location}*.\n\nIt offers seamless highway connectivity and access to top schools, healthcare, and markets. Would you like to schedule a site visit this weekend to see the location in person? 🏡`;
        }
        if (lang === 'hindi') {
            return `*${project.name}* प्राइम लोकेशन *${project.location}* पर स्थित है।\n\nयहाँ से मुख्य हाईवे, स्कूल और अस्पतालों की बेहतरीन कनेक्टिविटी है। क्या हम इस सप्ताहांत पर आपका साइट विजिट प्लान करें? 🏡`;
        }
        return `*${project.name}* prime location par situated hai — *${project.location}*.\n\nYahan se highway connectivity, schools aur daily essentials bohot paas hain. Kya hum is weekend par aapka ek sample flat site visit schedule karein? 🏡`;
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