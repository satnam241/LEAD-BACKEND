"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.isHandoffRequested = isHandoffRequested;
exports.isSiteVisitIntent = isSiteVisitIntent;
exports.detectMediaRequest = detectMediaRequest;
exports.parseSlotDateTime = parseSlotDateTime;
exports.cleanWhatsAppReply = cleanWhatsAppReply;
exports.buildMessages = buildMessages;
exports.generateReply = generateReply;
const llmService_1 = require("./llmService");
const projectKnowledgeService_1 = require("./projectKnowledgeService");
const conversationMessage_model_1 = __importDefault(require("../models/conversationMessage.model"));
const conversationState_model_1 = __importDefault(require("../models/conversationState.model"));
const lead_model_1 = __importDefault(require("../models/lead.model"));
const project_model_1 = __importDefault(require("../models/project.model"));
const fbForm_model_1 = __importDefault(require("../models/fbForm.model"));
const chatbotService_1 = require("./chatbotService");
const aiLearningService_1 = require("./aiLearningService");
const emailService_1 = require("./emailService");
const baileysService_1 = require("./baileysService");
const AI_HISTORY_MESSAGES = parseInt(process.env.AI_HISTORY_MESSAGES || '6', 10);
const AI_MAX_REPLY_CHARS = parseInt(process.env.AI_MAX_REPLY_CHARS || '600', 10);
// Only explicit requests to speak with a human/agent/manager trigger handoff
const HANDOFF_KEYWORDS = [
    'agent',
    'human',
    'person',
    'call me',
    'callback',
    'call back',
    'executive',
    'representative',
    'manager',
    'baat karni',
    'phone karo',
    'call karo',
    'contact number',
    'insan se baat',
];
function isHandoffRequested(text) {
    if (!text)
        return false;
    const lower = text.toLowerCase();
    return HANDOFF_KEYWORDS.some(kw => lower.includes(kw));
}
function isSiteVisitIntent(text) {
    if (!text)
        return false;
    const lower = text.toLowerCase();
    const siteKeywords = [
        'site visit',
        'visit site',
        'visit kab',
        'visit kar',
        'sample flat dekh',
        'sample flat visit',
        'property dekh',
        'kab aa sakte',
        'visit schedule',
        'book visit',
        'site pe aana',
        'site dekhni',
        'flat dekhne',
        'sample flat',
        'visit arrange',
        'visit book',
        'visit karna',
        'साइट विजिट',
        'विजिट',
        'देखने आना',
        'सैंपल फ्लैट',
        'कब आ सकते',
        'प्रॉपर्टी देखना',
    ];
    return siteKeywords.some(kw => lower.includes(kw));
}
function detectMediaRequest(text) {
    if (!text)
        return null;
    const lower = text.toLowerCase();
    // 1. Videos / Walkthrough
    if (/(video|walkthrough|sample flat video|site video|tour video|tour|वीडियो|विडियो|वॉकथ्रू)/i.test(lower)) {
        return 'videos';
    }
    // 2. Map / Master plan / Layout
    if (/(map|layout|master plan|site plan|location map|naksha|masterplan|नक्शा|मैप|मास्टर प्लान|लेआउट)/i.test(lower)) {
        return 'map';
    }
    // 3. Images / Photos
    if (/(photo|photos|image|images|picture|pictures|pic|pics|tasveer|tasveerein|फोटो|तस्वीर|तस्वीरें)/i.test(lower)) {
        return 'images';
    }
    return null;
}
/**
 * Intelligent slot parser for Real Estate WhatsApp conversations.
 * Detects relative days (kal, parso, aaj), weekday names (Saturday, Sunday...),
 * explicit dates (15th, 12 April), and times (11 AM, 2 PM, 4 baje, morning, evening).
 */
function parseSlotDateTime(text) {
    if (!text)
        return null;
    const lower = text.toLowerCase();
    const daysMap = {
        sunday: 0,
        sun: 0,
        ravivar: 0,
        itwar: 0,
        'रविवार': 0,
        'इतवार': 0,
        monday: 1,
        mon: 1,
        somvar: 1,
        'सोमवार': 1,
        tuesday: 2,
        tue: 2,
        mangalvar: 2,
        'मंगलवार': 2,
        wednesday: 3,
        wed: 3,
        budhvar: 3,
        'बुधवार': 3,
        thursday: 4,
        thu: 4,
        guruvar: 4,
        'गुरुवार': 4,
        'बृहस्पतिवार': 4,
        friday: 5,
        fri: 5,
        shukravar: 5,
        'शुक्रवार': 5,
        saturday: 6,
        sat: 6,
        shanivar: 6,
        'शनिवार': 6,
        weekend: 6,
    };
    const now = new Date();
    let targetDate = new Date();
    let dayDetected = false;
    // Relative days
    if (/kal|tomorrow|कल/i.test(lower)) {
        targetDate.setDate(targetDate.getDate() + 1);
        dayDetected = true;
    }
    else if (/parso|परसों|परसो/i.test(lower)) {
        targetDate.setDate(targetDate.getDate() + 2);
        dayDetected = true;
    }
    else if (/aaj|today|आज/i.test(lower)) {
        dayDetected = true;
    }
    else {
        for (const [dayName, dayIndex] of Object.entries(daysMap)) {
            if (lower.includes(dayName)) {
                const currentDay = targetDate.getDay();
                let diff = dayIndex - currentDay;
                if (diff <= 0)
                    diff += 7;
                targetDate.setDate(targetDate.getDate() + diff);
                dayDetected = true;
                break;
            }
        }
    }
    // Explicit calendar day: e.g. "15th", "15 april", "12 tarikh"
    const dateMatch = lower.match(/(\d{1,2})(?:st|nd|rd|th|\s*tarikh)?\s*(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec|april|march|may|june|july)?/i);
    if (dateMatch && parseInt(dateMatch[1], 10) <= 31) {
        const dayNum = parseInt(dateMatch[1], 10);
        if (!dayDetected || dateMatch[2]) {
            targetDate.setDate(dayNum);
            if (dateMatch[2]) {
                const months = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
                const mIdx = months.findIndex(m => dateMatch[2].toLowerCase().startsWith(m));
                if (mIdx !== -1)
                    targetDate.setMonth(mIdx);
            }
            if (targetDate.getTime() < now.getTime()) {
                targetDate.setFullYear(targetDate.getFullYear() + 1);
            }
            dayDetected = true;
        }
    }
    // Time parsing
    let hour = 11; // default morning slot 11:00 AM
    let minute = 0;
    let timeDetected = false;
    const timeMatch = lower.match(/(\d{1,2})(?::(\d{2}))?\s*(am|pm|baje|बजे)?/i);
    if (timeMatch && timeMatch[0]) {
        const rawH = parseInt(timeMatch[1], 10);
        const rawM = timeMatch[2] ? parseInt(timeMatch[2], 10) : 0;
        const meridian = timeMatch[3] ? timeMatch[3].toLowerCase() : '';
        if (rawH >= 1 && rawH <= 24) {
            timeDetected = true;
            minute = rawM;
            if (meridian === 'pm' && rawH < 12) {
                hour = rawH + 12;
            }
            else if (meridian === 'am' && rawH === 12) {
                hour = 0;
            }
            else if (meridian === 'baje' || meridian === 'बजे') {
                if (rawH >= 1 && rawH <= 7)
                    hour = rawH + 12;
                else
                    hour = rawH;
            }
            else if (!meridian) {
                if (rawH >= 1 && rawH <= 6)
                    hour = rawH + 12;
                else
                    hour = rawH;
            }
            else {
                hour = rawH;
            }
        }
    }
    if (/morning|subah|सुबह/i.test(lower) && !timeDetected) {
        hour = 11;
        minute = 0;
        timeDetected = true;
    }
    else if (/afternoon|dopahar|दोपहर/i.test(lower) && !timeDetected) {
        hour = 14;
        minute = 30;
        timeDetected = true;
    }
    else if (/evening|shaam|शाम/i.test(lower) && !timeDetected) {
        hour = 16;
        minute = 30;
        timeDetected = true;
    }
    if (!dayDetected && !timeDetected) {
        return null;
    }
    if (!dayDetected && timeDetected) {
        targetDate.setDate(targetDate.getDate() + 1);
    }
    targetDate.setHours(hour, minute, 0, 0);
    const formattedSlot = targetDate.toLocaleString('en-IN', {
        timeZone: 'Asia/Kolkata',
        weekday: 'long',
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
        hour12: true,
    });
    return { date: targetDate, formattedSlot };
}
// Clean markdown wrapping quotes for clean WhatsApp presentation
function cleanWhatsAppReply(text) {
    if (!text)
        return '';
    return text
        .replace(/^["']|["']$/g, '')
        .trim();
}
/**
 * Builds system prompt with lead submission context (Form/Requirements),
 * dynamic project facts, dynamic portfolio catalogue, two-stage inquiry progression,
 * English language priority, step-by-step pacing, and strict boundary rules.
 */
async function buildMessages(leadId, projectId, currentMessage, contextNote) {
    const detectedLang = (0, projectKnowledgeService_1.detectLanguage)(currentMessage);
    const [projectFacts, dynamicPortfolio, leadDoc] = await Promise.all([
        (0, projectKnowledgeService_1.getProjectFacts)(projectId, currentMessage),
        (0, projectKnowledgeService_1.getDynamicPortfolioCatalogue)(projectId),
        lead_model_1.default.findById(leadId).lean(),
    ]);
    let formName = leadDoc?.formName || '';
    if (!formName && leadDoc?.formId) {
        const fbForm = await fbForm_model_1.default.findOne({ formId: leadDoc.formId }).select('name').lean();
        if (fbForm?.name)
            formName = fbForm.name;
    }
    if (!formName) {
        formName = leadDoc?.source ? `Lead from ${leadDoc.source}` : 'Direct WhatsApp Inquiry';
    }
    const extraFieldsSummary = leadDoc?.extraFields && typeof leadDoc.extraFields === 'object' && Object.keys(leadDoc.extraFields).length > 0
        ? Object.entries(leadDoc.extraFields)
            .map(([k, v]) => `${k}: ${v}`)
            .join(', ')
        : '';
    const systemPrompt = `You are an elite, consultative Senior Real Estate Property Advisor assisting prospective home buyers on WhatsApp.
You proudly represent our real estate firm "Bhole Baba Investments". You possess deep property sales intelligence, emotional EQ, and sharp consultative selling skills. You strictly ground all factual details (pricing, location, configurations, possession, RERA) in the database information provided below.

════════════════════════════════════════════════════════════════════════════════
🌐 CURRENT USER INQUIRY LANGUAGE DETECTED: [ ${detectedLang.toUpperCase()} ]
════════════════════════════════════════════════════════════════════════════════
MANDATORY LANGUAGE CONSTRAINTS (STRICT & ABSOLUTE ENFORCEMENT):
${detectedLang === 'english'
        ? `🚨 STRICT ENGLISH MODE ACTIVATED (ZERO HINDI/HINGLISH TOLERANCE):
- The prospective buyer messaged in ENGLISH.
- You MUST generate your ENTIRE reply in 100% FLUENT, GRAMMATICAL, PROFESSIONAL ENGLISH ONLY!
- ABSOLUTELY FORBIDDEN: Do NOT include ANY Hindi or Hinglish words (such as "kya", "hai", "hain", "aap", "ji", "bhai", "shukriya", "batao", "sir ji").
- Every single sentence must be pure, clean, natural English.`
        : detectedLang === 'hindi'
            ? `🚨 STRICT HINDI DEVANAGARI MODE:
- The prospective buyer messaged in PURE HINDI (Devanagari script).
- You MUST generate your response in respectful, clear Devanagari Hindi.`
            : `🚨 HINGLISH MODE:
- The prospective buyer messaged in HINGLISH (Roman Hindi).
- Respond in warm, respectful, consultative Hinglish.`}
- FIRM NAME: Always introduce or refer to our firm as "Bhole Baba Investments".
- FIRST GREETING: The first welcome greeting must ALWAYS be in 100% polished English.
- CURRENT DETECTED MODE: [ ${detectedLang.toUpperCase()} ]

════════════════════════════════════════════════════════════════════════════════
PROSPECTIVE BUYER INQUIRY SOURCE & CONTEXT:
════════════════════════════════════════════════════════════════════════════════
• Lead Name: ${leadDoc?.fullName || 'Prospective Buyer'}
• Origin Form / Source: "${formName}"
• Submitted Budget: ${leadDoc?.whatIsYourBudget || 'Not specified'}
• Preferred Timeline: ${leadDoc?.whenAreYouPlanningToPurchase || 'Not specified'}
• Submitted Requirement: ${leadDoc?.message && leadDoc.message !== 'No message provided' ? leadDoc.message : 'General property inquiry'}
${extraFieldsSummary ? `• Additional Form Details: ${extraFieldsSummary}` : ''}
${contextNote ? `• Immediate Context / Database Fact: ${contextNote}` : ''}

════════════════════════════════════════════════════════════════════════════════
PRIMARY PROPERTY (DATABASE FACTS):
════════════════════════════════════════════════════════════════════════════════
${projectFacts || 'No detailed facts loaded yet for this project.'}

════════════════════════════════════════════════════════════════════════════════
LIVE PORTFOLIO OF OUR OTHER ACTIVE PROPERTIES (FOR CROSS-SELLING):
════════════════════════════════════════════════════════════════════════════════
${dynamicPortfolio}

════════════════════════════════════════════════════════════════════════════════
🧠 CORE REAL ESTATE INTELLIGENCE & BEHAVIOR RULES (STRICTLY ENFORCE):
════════════════════════════════════════════════════════════════════════════════

1. 🗣️ LANGUAGE & NATURAL TONE MATCHING:
   - Always adhere to the [ ${detectedLang.toUpperCase()} ] mode.
   - Keep the tone warm, consultative, and human-like — NEVER sound like an automated robotic IVR or generic FAQ bot.

2. 💡 DECODE INTENT, TYPOS, AND MESSY TEXT (USE YOUR OWN BRAIN):
   - Buyers often type casually or make typos (e.g. "prce kitna h", "possesion kb tk milega", "gadi parking?", "chhat milegi", "bache khelne ka park", "saste me kuch hai").
   - Intelligently figure out what the buyer is actually looking for:
     * "prce / kitna lagega / budget" ➔ Answer unit starting rates & ask preferred BHK.
     * "possession / kab tak / ready" ➔ Answer possession timeline directly.
     * "gadi parking / bache khelne / gym" ➔ Highlight relevant amenities.
     * "loan / EMI" ➔ Reassure bank loan approvals & flexible payment plans.
   - IF THE BUYER SENDS GIBBERISH OR RANDOM CHARACTERS (e.g. "asdfghjk", "???"):
     * Politely and warmly clarify: "Lagta hai typing mein kuch miss ho gaya! Main is property ka advisor hoon. Kya aap pricing, location ya sample flat visit ke baare mein jaanna chahte hain?"
   - IF THE BUYER ASKS OFF-TOPIC / OUT-OF-BOUND QUESTIONS (e.g. weather, cars, politics, personal):
     * Gracefully steer them back: "Haha, main toh aapka property consultant hoon! Par is project mein aapka dream home zaroor banwa sakta hoon 🏡 Kya aap location ya pricing explore karna chahenge?"

${detectedLang === 'english'
        ? `3. 🛡️ REAL ESTATE OBJECTION HANDLING (ENGLISH):
   - OBJECTION: "The price is too high / out of budget":
     * Empathize first: "I completely understand that budget is a crucial factor!"
     * Value pitch: Highlight prime location connectivity, quality construction, and lifestyle amenities ensuring strong long-term appreciation.
     * Soft Hook: Offer to schedule a private site visit to tour the sample flat in person or explore tailored flexible payment plans.
   - OBJECTION: "Can I get a discount? / Is negotiation possible?":
     * Explain: "Special festive privileges and spot-booking offers are discussed directly with our sales management during a site visit. Shall we schedule a site visit this weekend so you can explore the best direct offer?"
   - OBJECTION: "Possession is late":
     * Reassure: Construction is strictly on schedule under approved RERA guidelines with top-tier technology.`
        : `3. 🛡️ MASTER REAL ESTATE OBJECTION HANDLING (NEVER GET DEFENSIVE):
   - OBJECTION: "Price bohot zyada hai / mehenga hai / budget se bahar hai":
     * Empathize first: "Main bilkul samajh sakta hoon budget ka importance!"
     * Value pitch: Highlight prime location connectivity, superior construction quality, and lifestyle amenities that justify the investment and ensure strong appreciation.
     * Soft Hook: Suggest scheduling a private site visit to experience the actual sample flat quality in person, or suggest alternative configurations / payment plans.
   - OBJECTION: "Kuch discount milega kya / thoda rate kam karo / negotiation":
     * Do NOT bluntly say "No discounts". Instead explain: "Special festive benefits aur spot-booking offers builder management direct site meeting mein discuss karte hain. Kya hum aapke liye weekend par ek site visit arrange karein taaki aap sales head se direct best offer explore kar sakein?"
   - OBJECTION: "Possession late hai / time zyada hai":
     * Reassure that construction is strictly on schedule under RERA guidelines with top-tier construction technology.`}

4. 🎯 CONSULTATIVE SELLING (ALWAYS GUIDE TO THE NEXT STEP):
   - NEVER just drop facts and go silent.
   - Keep every response concise: 2 to 4 sentences or clean WhatsApp bullet points.
   - Always conclude each message with ONE natural, consultative qualifying question matching [ ${detectedLang.toUpperCase()} ]:
${detectedLang === 'english'
        ? `     * "Are you considering this property for personal residence (self-use) or as an investment?"
     * "Do you prefer a 2 BHK or a more spacious 3 BHK configuration?"
     * "Would you like to schedule a site visit this weekend to inspect the sample flat in person?"`
        : `     * "Aap is property ko self-use (rehne ke liye) dekh rahe hain ya investment purpose ke liye?"
     * "Aapki preference 2 BHK ke liye hai ya 3 BHK spacious layout ke liye?"
     * "Kya hum is weekend par aapka ek sample flat site visit schedule karein?"`}

5. 🔒 ZERO-HALLUCINATION / 100% FACTUAL GROUNDING:
   - All prices, sizes, amenities, RERA numbers, and possession dates must come STRICTLY from the database facts above.
   - NEVER invent rates, fake discounts, or imaginary flat numbers.

6. 📱 WHATSAPP PRESENTATION:
   - Use clean *bold* formatting for project names, rates, and key highlights.
   - No huge walls of text. Short, punchy, consultative messages.

${detectedLang === 'english'
        ? `════════════════════════════════════════════════════════════════════════════════
🎯 FEW-SHOT EXAMPLES (HOW A TOP ADVISOR RESPONDS IN ENGLISH):
════════════════════════════════════════════════════════════════════════════════
Buyer: "What is the price?"
Advisor: "Our properties start from ${projectFacts ? 'the rates listed above' : 'attractive market rates'} 🏡 Are you considering this for personal residence or as an investment?"

Buyer: "Where is the property located?"
Advisor: "The project is situated at a prime location with excellent highway connectivity. Would you like to schedule a site visit this weekend to see the property in person?"

Buyer: "What amenities do you offer?"
Advisor: "The property features 24/7 security, wide roads, underground utilities, and landscaped green parks! Which configuration or unit size best matches your requirement?"

Buyer: "Can I get a discount?"
Advisor: "I completely understand! Best festive benefits and spot-booking offers are discussed directly with our sales management during a site visit. Shall we arrange a visit for this weekend? 🏡"`
        : detectedLang === 'hindi'
            ? `════════════════════════════════════════════════════════════════════════════════
🎯 FEW-SHOT EXAMPLES (HINDI DEVANAGARI):
════════════════════════════════════════════════════════════════════════════════
Buyer: "कीमत क्या है?"
Advisor: "प्रॉपर्टी की शुरुआती दरें उपलब्ध हैं 🏡 क्या आप खुद रहने के लिए देख रहे हैं या निवेश के लिए?"

Buyer: "लोकेशन कहाँ पर है?"
Advisor: "प्रोजेक्ट प्राइम लोकेशन पर स्थित है। क्या हम इस सप्ताहांत पर आपका साइट विजिट शेड्यूल करें?"`
            : `════════════════════════════════════════════════════════════════════════════════
🎯 FEW-SHOT EXAMPLES (HINGLISH):
════════════════════════════════════════════════════════════════════════════════
Buyer: "price kitna hai?"
Advisor: "Hamare paas plots starting rates se available hain 🏡 Aap self-use (ghar banane) ke liye dekh rahe hain ya investment purpose ke liye?"

Buyer: "location kahan par hai?"
Advisor: "Project prime location par situated hai. Kya hum is weekend par aapka ek sample flat site visit schedule karein?"

Buyer: "kya amenities hain?"
Advisor: "Township mein wide roads, gated security, underground wiring aur landscaped parks available hain! Aap kis size ka plot ya unit prefer karenge?"`}

CRITICAL INSTRUCTIONS (ABSOLUTE ENFORCEMENT):
- Answer accurately based ONLY on PRIMARY PROPERTY facts and database information provided above.
- STRICTLY adhere to [ ${detectedLang.toUpperCase()} ]. ZERO foreign language words!
- NEVER EVER GIVE EMPTY PROMISES: NEVER say "Sure, I can send you the details", "I will provide the details", or "I can share that with you" without actually including the details right in this message!
- If the buyer asks for details, brochure, property overview, or says "send me" / "send details" / "bhejo" / "details do" / "tell me details", you MUST IMMEDIATELY provide the complete property facts (Project Name, Location, Starting Price, Available Plot/Flat Sizes & Spaces, Key Amenities, Possession Timeline, RERA) directly in this reply formatted with clean WhatsApp bullet points!
- AVOID REPETITION: If previous assistant messages in the conversation history contained phrases like "Sure, I can send you the details", DO NOT REPEAT THAT! Deliver the requested factual details immediately!
- If the buyer asked a specific single question (e.g., "is it gated?", "what is the road width?", "is loan available?", "where is it located?"), answer that specific question directly and concisely in 2-3 sentences from the database facts.
- Conclude with ONE natural, consultative question guiding the buyer towards next steps (preferred configuration or a site visit).`;
    // Fetch recent conversation history
    const historyDocs = await conversationMessage_model_1.default.find({ leadId })
        .sort({ createdAt: -1 })
        .limit(AI_HISTORY_MESSAGES)
        .lean();
    historyDocs.reverse();
    const messages = [{ role: 'system', content: systemPrompt }];
    for (const doc of historyDocs) {
        messages.push({
            role: doc.role,
            content: doc.content,
        });
    }
    messages.push({ role: 'user', content: currentMessage });
    return messages;
}
/**
 * Generates an AI reply for an incoming WhatsApp message using Local Llama 3.2 (llamafile)
 */
async function generateReply(phone, text, lead, projectId, contextNote) {
    // 1. Detect language immediately for 100% strict adherence
    const lang = (0, projectKnowledgeService_1.detectLanguage)(text);
    // 2. Extract and profile lead preferences (budget, unit, timeline, purpose) from message
    const profiled = await (0, aiLearningService_1.extractAndSaveLeadPreferences)(lead._id, text).catch(() => ({}));
    const currentLead = (await lead_model_1.default.findById(lead._id).lean()) || lead;
    let projectDoc = null;
    if (projectId) {
        projectDoc = await project_model_1.default.findById(projectId).lean();
    }
    // 3. Context & Background Action Placeholders (Side-effects run in background without overriding LLM)
    let siteVisitNote = '';
    let mediaNote = '';
    let handoffNote = '';
    let detailsNote = '';
    let greetingNote = '';
    let crossSellNote = '';
    let faqHintNote = '';
    let needsAgent = false;
    let aiPaused = false;
    let detectedIntent = 'general_ai_dialogue';
    // ── A. SITE VISIT DETECTION & ENGINE ──
    if (isSiteVisitIntent(text)) {
        detectedIntent = 'site_visit';
        const slot = parseSlotDateTime(text);
        if (slot) {
            detectedIntent = 'site_visit_confirmed';
            const visitMessage = `Site Visit Booked via WhatsApp for ${projectDoc?.name || 'Property'}`;
            // Update Lead DB
            await lead_model_1.default.findByIdAndUpdate(lead._id, {
                $set: {
                    'followUp.date': slot.date,
                    'followUp.recurrence': 'once',
                    'followUp.message': visitMessage,
                    'followUp.active': true,
                    'followUp.whatsappOptIn': true,
                    'followUp.overdueStatus': 'pending',
                    'followUp.notifiedAt': null,
                    interestLevel: 'hot',
                    status: 'interested',
                    updatedAt: new Date(),
                },
            });
            // Google Calendar Integration (Background)
            try {
                const Admin = (await Promise.resolve().then(() => __importStar(require('../models/admin.model')))).default;
                const { createCalendarEvent } = await Promise.resolve().then(() => __importStar(require('./googleCalendar.service')));
                const admin = await Admin.findOne({
                    'googleCalendar.isConnected': true,
                    'googleCalendar.refreshToken': { $exists: true, $ne: '' },
                });
                if (admin?.googleCalendar?.refreshToken) {
                    const updatedLead = await lead_model_1.default.findById(lead._id);
                    const calEvent = await createCalendarEvent(admin.googleCalendar.refreshToken, updatedLead);
                    if (calEvent?.id) {
                        await lead_model_1.default.findByIdAndUpdate(lead._id, { $set: { 'followUp.googleEventId': calEvent.id } });
                    }
                }
            }
            catch (calErr) {
                console.warn('[Site Visit] Google Calendar sync warning:', calErr?.message || calErr);
            }
            // Dual Support Email Notification (Background)
            (0, emailService_1.sendSupportAlert)({
                subject: `🏡 New Site Visit Booked: ${currentLead.fullName || 'Lead'} • ${slot.formattedSlot}`,
                badge: '🏡 Site Visit Booked',
                title: `Site Visit Booked for ${currentLead.fullName || 'Prospective Buyer'}`,
                lead: currentLead,
                project: projectDoc,
                details: {
                    'Scheduled Slot': slot.formattedSlot,
                    'Property / Project': projectDoc?.name || 'Primary Property',
                    'Location': projectDoc?.location || 'On File',
                    'Budget Preference': currentLead.whatIsYourBudget || 'Not specified',
                    'Unit Preference': currentLead.extraFields?.bhkPreference || 'Not specified',
                    'Booking Channel': 'WhatsApp Interactive AI',
                },
                ctaText: 'Open Lead in CRM →',
            }).catch(err => console.error('[Site Visit] Support alert error:', err));
            siteVisitNote = `SYSTEM ACTION COMPLETED: The site visit has been officially confirmed in the CRM & Calendar for: "${slot.formattedSlot}" for "${projectDoc?.name || 'our project'}".
INSTRUCTION FOR AI: Dynamically generate a warm, enthusiastic, professional confirmation message for this booked slot (${slot.formattedSlot}). Inform them that our Senior Relationship Manager will welcome them at the site to give a complete walkthrough. Tell them they can reply here for exact location directions or if they ever need to reschedule. Ground everything dynamically in [ ${lang.toUpperCase()} ].`;
        }
        else {
            detectedIntent = 'site_visit_inquiry';
            siteVisitNote = `USER INTENT: The buyer wants to visit the site or sample flat for "${projectDoc?.name || 'our property'}", but has not mentioned a specific date or time.
INSTRUCTION FOR AI: Warmly welcome their visit interest. Consultatively ask whether Saturday or Sunday works best for their schedule, and whether Morning (11:00 AM) or Evening (4:00 PM) is preferred.`;
        }
    }
    // ── B. MEDIA DISPATCH ENGINE (Background delivery of Photos/Videos/Map) ──
    const mediaReq = detectMediaRequest(text);
    if (mediaReq && projectDoc) {
        detectedIntent = `media_${mediaReq}`;
        if (mediaReq === 'images') {
            const images = Array.isArray(projectDoc.images) ? projectDoc.images.filter(Boolean) : [];
            if (images.length > 0) {
                for (let i = 0; i < Math.min(images.length, 3); i++) {
                    const caption = i === 0 ? `📸 *${projectDoc.name}* • Sample Flat & Site Photo` : undefined;
                    (0, baileysService_1.sendMedia)(phone, images[i], caption).catch(() => { });
                }
                mediaNote = `SYSTEM ACTION COMPLETED: We have dispatched ${Math.min(images.length, 3)} sample flat and site photos of "${projectDoc.name}" to the buyer's WhatsApp.
INSTRUCTION FOR AI: Dynamically acknowledge that the photos have been sent above, highlight the quality construction/layout, and consultatively ask if they would like to schedule a private site visit to tour the property in person.`;
            }
            else {
                mediaNote = `NOTE: The buyer requested photos of "${projectDoc.name}", but new site photos are being prepared by the site team.
INSTRUCTION FOR AI: Politely reassure the buyer that our team will share the updated photo gallery directly on WhatsApp shortly, and invite them to schedule a personal site visit in the meantime.`;
            }
        }
        else if (mediaReq === 'videos') {
            const videos = Array.isArray(projectDoc.videos) ? projectDoc.videos.filter(Boolean) : [];
            if (videos.length > 0) {
                (0, baileysService_1.sendMedia)(phone, videos[0], `🎥 *${projectDoc.name}* • Video Walkthrough`).catch(() => { });
                mediaNote = `SYSTEM ACTION COMPLETED: We have dispatched the video walkthrough for "${projectDoc.name}" to their WhatsApp.
INSTRUCTION FOR AI: Dynamically mention the video walkthrough sent above and consultatively ask if they would like to schedule a private site visit to see the project live.`;
            }
            else {
                mediaNote = `NOTE: The buyer requested a video walkthrough for "${projectDoc.name}".
INSTRUCTION FOR AI: Inform them politely that our team will share the video walkthrough link shortly on WhatsApp, and ask if they would like to plan a personal site tour.`;
            }
        }
        else if (mediaReq === 'map') {
            if (projectDoc.map && projectDoc.map.trim()) {
                (0, baileysService_1.sendMedia)(phone, projectDoc.map.trim(), `🗺️ *${projectDoc.name}* • Approved Master Plan & Layout Map`).catch(() => { });
                mediaNote = `SYSTEM ACTION COMPLETED: We have dispatched the approved master plan and layout map for "${projectDoc.name}" to their WhatsApp.
INSTRUCTION FOR AI: Dynamically mention the layout map sent above, and consultatively ask which plot size or configuration best matches their requirements.`;
            }
            else {
                mediaNote = `NOTE: The buyer requested the layout map / master plan for "${projectDoc.name}".
INSTRUCTION FOR AI: Inform them that our team will share the approved PDF layout shortly on WhatsApp, and ask what size or configuration they are considering.`;
            }
        }
    }
    // ── C. HUMAN AGENT / CALL REQUEST (Handoff) ──
    if (isHandoffRequested(text)) {
        detectedIntent = 'agent_handoff';
        needsAgent = true;
        aiPaused = true;
        (0, emailService_1.sendSupportAlert)({
            subject: `🚨 Human Agent Requested: ${currentLead.fullName || 'Lead'}`,
            badge: '👤 Agent Handoff',
            title: `Lead Requested Callback / Human Agent`,
            lead: currentLead,
            project: projectDoc,
            details: {
                'Customer Message': text,
                'Phone': currentLead.phone || '—',
                'Budget': currentLead.whatIsYourBudget || '—',
            },
            ctaText: 'Open Lead & Call Customer →',
        }).catch(() => { });
        handoffNote = `USER INTENT: The customer has explicitly requested to speak with a human agent/manager or requested a phone callback.
INSTRUCTION FOR AI: Reassure the customer warmly and professionally that their request has been forwarded to our senior sales & advisory team at Bhole Baba Investments, and a dedicated property advisor will call them shortly.`;
    }
    // ── D. PROJECT SELECTION MATCHING ──
    const activeProjects = await project_model_1.default.find({ isActive: true }).lean();
    let targetProjectId = projectId;
    const selectedProj = (0, projectKnowledgeService_1.matchProjectFromSelection)(text, activeProjects);
    let projectSelectionNote = '';
    if (selectedProj) {
        targetProjectId = selectedProj._id;
        projectDoc = selectedProj;
        detectedIntent = 'project_selection';
        projectSelectionNote = `USER SELECTION: The buyer selected "${selectedProj.name}". Focus this response on "${selectedProj.name}" (Location: ${selectedProj.location || 'prime area'}, Starting Price: ${selectedProj.priceRange || 'market price'}). Dynamically highlight its features and ask what they would like to explore next.`;
    }
    else if (targetProjectId) {
        if (!projectDoc) {
            projectDoc = await project_model_1.default.findById(targetProjectId).lean();
        }
    }
    if (!projectDoc && activeProjects.length > 0) {
        projectDoc = activeProjects[0];
        targetProjectId = projectDoc._id;
    }
    // ── E. PROPERTY DETAILS / PORTFOLIO QUERY ──
    const isDetailsQuery = (0, projectKnowledgeService_1.isPropertyDetailsQuery)(text) ||
        /(send\s+me|send\s+details|send\s+info|bhejo|share\s+details|share\s+info|share\s+brochure|tell\s+me\s+details|give\s+details|details\s+de\s+do|details\s+batao|overview|information)/i.test(text);
    if (isDetailsQuery) {
        detectedIntent = 'property_details';
        const askingAllProjects = activeProjects.length > 1 &&
            /(all\s*projects|kya\s*(kya)?\s*project|options|list|kaun\s*se\s*project|konsa\s*project|what\s*projects|which\s*projects)/i.test(text);
        if (askingAllProjects) {
            detailsNote = `USER INQUIRY: The buyer is asking about available projects / options across our portfolio.
INSTRUCTION FOR AI: Clearly present all our active projects from the portfolio catalogue below (Project Names, Prime Locations, Starting Prices), and consultatively ask which one they would like to explore or visit!`;
        }
        else {
            detailsNote = `CRITICAL MANDATORY DIRECTIVE: The buyer is asking for property/project details (or said "send me" / "send details" / "details of this project").
YOU MUST IMMEDIATELY PROVIDE THE COMPLETE PROPERTY DETAILS DIRECTLY IN THIS REPLY!
DO NOT say "Sure I can send you" or "I will share details" without actually delivering the details right here!
Include the following verified facts from PRIMARY PROPERTY in clean, structured WhatsApp bullet points:
- Project Name & Exact Location
- Starting Price / Pricing Range
- Available Units / Plot Sizes & Space
- Top Amenities & Infrastructure Highlights
- Possession Timeline
- RERA Status
Conclude with a warm consultative question asking if they would like to schedule a site visit this weekend.`;
        }
    }
    // ── F. GREETINGS CHECK ──
    const isGreeting = /^(hello|hi|hey|hii|helo|hlo|namaste|good morning|good afternoon|good evening|hello sir|hi sir|hey sir|hello ji|hi ji|greetings|start)(\s+.*)?$/i.test(text.toLowerCase().trim());
    if (isGreeting && !isDetailsQuery && !siteVisitNote && !mediaNote && !handoffNote) {
        detectedIntent = 'greeting';
        greetingNote = `USER GREETING: The user sent a greeting.
INSTRUCTION FOR AI: Warmly welcome them to Bhole Baba Investments, introduce yourself as their AI Property Consultant, and consultatively ask how you can assist them today (exploring projects, latest pricing, location, available plot/flat sizes, or scheduling a site visit).`;
    }
    // ── G. FAQ FACTUAL HINT (Used as knowledge context, NEVER as hardcoded static return) ──
    if (projectDoc && !isDetailsQuery && !isGreeting && !siteVisitNote && !mediaNote && !handoffNote) {
        const rawDirect = (0, projectKnowledgeService_1.findDirectFaqAnswer)(projectDoc, text);
        if (rawDirect && rawDirect.trim()) {
            faqHintNote = `DATABASE FACT FROM FAQ: "${rawDirect}". Synthesize and express this verified fact naturally, accurately, and consultatively in your dynamic response.`;
        }
    }
    // ── H. CROSS-SELLING BUDGET ENGINE ──
    const statedBudget = currentLead.whatIsYourBudget || text;
    const isAskingCheaper = /sasta|saste|budget kam|lower budget|affordable|cheap|less price|kam rate/i.test(text);
    if (statedBudget || isAskingCheaper) {
        const crossProj = await (0, projectKnowledgeService_1.findCrossSellProject)(targetProjectId, statedBudget);
        if (crossProj) {
            crossSellNote = `CROSS-SELLING RECOMMENDATION: The buyer asked for affordable / lower budget options. Introduce "${crossProj.name}" at "${crossProj.location}" (starting from ${crossProj.priceRange}) as an ideal match, highlighting why it offers outstanding value.`;
        }
    }
    // ── 5. ASSEMBLE COMPLETE CONTEXT NOTES ──
    const contextParts = [];
    if (contextNote)
        contextParts.push(contextNote);
    if (projectSelectionNote)
        contextParts.push(projectSelectionNote);
    if (siteVisitNote)
        contextParts.push(siteVisitNote);
    if (mediaNote)
        contextParts.push(mediaNote);
    if (handoffNote)
        contextParts.push(handoffNote);
    if (detailsNote)
        contextParts.push(detailsNote);
    if (greetingNote)
        contextParts.push(greetingNote);
    if (crossSellNote)
        contextParts.push(crossSellNote);
    if (faqHintNote)
        contextParts.push(faqHintNote);
    const fullContextNote = contextParts.join('\n\n');
    // ── 6. DYNAMIC AI GENERATION GROUNDED IN DATABASE FACTS ──
    const smartFallback = (0, projectKnowledgeService_1.buildIntelligentRealEstateResponse)(projectDoc, text, lang, activeProjects);
    const messages = await buildMessages(lead._id, targetProjectId, text, fullContextNote);
    const rawReply = await (0, llmService_1.askLLMSafe)(messages, smartFallback);
    let reply = cleanWhatsAppReply(rawReply);
    // Cap maximum reply length
    if (reply.length > AI_MAX_REPLY_CHARS) {
        reply = reply.slice(0, AI_MAX_REPLY_CHARS - 3).trim() + '...';
    }
    // ── 7. PERSIST CONVERSATION & STATE ──
    await conversationMessage_model_1.default.create([
        { leadId: lead._id, phone, role: 'user', content: text, createdAt: new Date() },
        { leadId: lead._id, phone, role: 'assistant', content: reply, createdAt: new Date() },
    ]);
    await conversationState_model_1.default.findOneAndUpdate({ leadId: lead._id }, {
        $set: {
            lastMessageFromUser: text,
            lastMessageAt: new Date(),
            lastActiveAt: new Date(),
            activeProjectId: targetProjectId,
            needsAgent,
            aiPaused,
        },
        $inc: { attemptCount: 1 },
    }, { upsert: true, new: true });
    await (0, chatbotService_1.persistLeadInterest)(lead._id, 'hot', { status: 'interested' });
    // ── 8. LOG FOR CONTINUOUS MODEL TRAINING (llm.sharesampatti.com) ──
    (0, aiLearningService_1.logConversationForTraining)({
        leadId: lead._id,
        phone,
        language: lang,
        detectedIntent,
        projectId: targetProjectId,
        projectName: projectDoc?.name || 'Bhole Baba Investments',
        userMessage: text,
        aiResponse: reply,
        source: 'whatsapp',
    }).catch(() => { });
    // ── 9. AUTO-LEARNING TRIGGER ──
    const lowerReply = reply.toLowerCase();
    const isDeferred = lowerReply.includes('team') ||
        lowerReply.includes('confirm') ||
        lowerReply.includes('connect karegi') ||
        lowerReply.includes('note kar li hai') ||
        lowerReply.includes('advisory team') ||
        lowerReply.includes('available nahi hai') ||
        lowerReply.includes('information hamare paas') ||
        lowerReply.includes('do not have information') ||
        lowerReply.includes("don't have information") ||
        lowerReply.includes('will connect with you') ||
        lowerReply.includes('will contact you');
    if (isDeferred) {
        (0, aiLearningService_1.recordLearnedQuestion)(targetProjectId, text, lead._id).catch(() => { });
    }
    return { reply, needsAgent, aiPaused };
}
//# sourceMappingURL=aiChatService.js.map