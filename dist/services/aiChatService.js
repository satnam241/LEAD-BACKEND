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
    ];
    return siteKeywords.some(kw => lower.includes(kw));
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
        monday: 1,
        mon: 1,
        somvar: 1,
        tuesday: 2,
        tue: 2,
        mangalvar: 2,
        wednesday: 3,
        wed: 3,
        budhvar: 3,
        thursday: 4,
        thu: 4,
        guruvar: 4,
        friday: 5,
        fri: 5,
        shukravar: 5,
        saturday: 6,
        sat: 6,
        shanivar: 6,
        weekend: 6,
    };
    const now = new Date();
    let targetDate = new Date();
    let dayDetected = false;
    // Relative days
    if (/kal|tomorrow/i.test(lower)) {
        targetDate.setDate(targetDate.getDate() + 1);
        dayDetected = true;
    }
    else if (/parso/i.test(lower)) {
        targetDate.setDate(targetDate.getDate() + 2);
        dayDetected = true;
    }
    else if (/aaj|today/i.test(lower)) {
        dayDetected = true;
    }
    else {
        for (const [dayName, dayIndex] of Object.entries(daysMap)) {
            const regex = new RegExp(`\\b${dayName}\\b`, 'i');
            if (regex.test(lower)) {
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
    const timeMatch = lower.match(/(\d{1,2})(?::(\d{2}))?\s*(am|pm|baje)?/i);
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
            else if (meridian === 'baje') {
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
    if (/morning|subah/i.test(lower) && !timeDetected) {
        hour = 11;
        minute = 0;
        timeDetected = true;
    }
    else if (/afternoon|dopahar/i.test(lower) && !timeDetected) {
        hour = 14;
        minute = 30;
        timeDetected = true;
    }
    else if (/evening|shaam/i.test(lower) && !timeDetected) {
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
You represent our real estate advisory firm. You possess deep property sales intelligence, emotional EQ, and sharp consultative selling skills. You strictly ground all factual details (pricing, location, configurations, possession, RERA) in the database information provided below.

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

1. 🗣️ LANGUAGE & NATURAL TONE MATCHING (HINGLISH / ENGLISH):
   - Mirror the buyer's language naturally. If the buyer chats in Hinglish or Hindi (e.g., "price kitna hai", "kuch discount milega", "kahan par hai"), respond in natural, courteous, respectful, and fluent Hinglish like a top Indian property consultant.
   - If the buyer asks in English, respond in polished, professional English.
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

3. 🛡️ MASTER REAL ESTATE OBJECTION HANDLING (NEVER GET DEFENSIVE):
   - OBJECTION: "Price bohot zyada hai / mehenga hai / budget se bahar hai":
     * Empathize first: "Main bilkul samajh sakta hoon budget ka importance!"
     * Value pitch: Highlight prime location connectivity, superior construction quality (Mivan), and lifestyle amenities that justify the investment and ensure strong appreciation.
     * Soft Hook: Suggest scheduling a private site visit to experience the actual sample flat quality in person, or suggest alternative configurations / payment plans.
   - OBJECTION: "Kuch discount milega kya / thoda rate kam karo / negotiation":
     * Do NOT bluntly say "No discounts". Instead explain: "Special festive benefits aur spot-booking offers builder management direct site meeting mein discuss karte hain. Kya hum aapke liye weekend par ek site visit arrange karein taaki aap sales head se direct best offer explore kar sakein?"
   - OBJECTION: "Possession late hai / time zyada hai":
     * Reassure that construction is strictly on schedule under RERA guidelines with top-tier construction technology.

4. 🎯 CONSULTATIVE SELLING (ALWAYS GUIDE TO THE NEXT STEP):
   - NEVER just drop facts and go silent.
   - Keep every response concise: 2 to 4 sentences or clean WhatsApp bullet points.
   - Always conclude each message with ONE natural, consultative qualifying question:
     * "Aap is property ko self-use (rehne ke liye) dekh rahe hain ya investment purpose ke liye?"
     * "Aapki preference 2 BHK ke liye hai ya 3 BHK spacious layout ke liye?"
     * "Kya hum is weekend par aapka ek sample flat site visit schedule karein?"

5. 🔒 ZERO-HALLUCINATION / 100% FACTUAL GROUNDING:
   - All prices, sizes, amenities, RERA numbers, and possession dates must come STRICTLY from the database facts above.
   - NEVER invent rates, fake discounts, or imaginary flat numbers.
   - If asked for specific live inventory (e.g. "5th floor corner flat available hai kya?"):
     * Reassure: "Is specific unit availability ke liye main hamari sales team se live inventory chart check karwa deta hoon, wo aapko shortly update kar denge."

6. 📱 WHATSAPP PRESENTATION:
   - Use clean *bold* formatting for project names, rates, and key highlights.
   - No huge walls of text. Short, punchy, conversational messages.`;
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
    // 1. Extract and profile lead preferences (budget, unit, timeline, purpose) from message
    const profiled = await (0, aiLearningService_1.extractAndSaveLeadPreferences)(lead._id, text).catch(() => ({}));
    const currentLead = (await lead_model_1.default.findById(lead._id).lean()) || lead;
    let projectDoc = null;
    if (projectId) {
        projectDoc = await project_model_1.default.findById(projectId).lean();
    }
    // 2. 🏡 INTERACTIVE SITE VISIT SLOT BOOKING ENGINE
    if (isSiteVisitIntent(text)) {
        const slot = parseSlotDateTime(text);
        if (slot) {
            // Slot (day + time) parsed! Schedule site visit and calendar sync
            const visitMessage = `Site Visit Booked via WhatsApp for ${projectDoc?.name || 'Property'}`;
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
            // Google Calendar Integration
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
                console.warn('[Site Visit] Non-fatal Google Calendar sync warning:', calErr?.message || calErr);
            }
            // Dual Support Email Notification (SUPPORT_EMAIL and SUPPORT_EMAIL1 + Admin)
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
            const confirmReply = `🎉 *Site Visit Confirmed!*\n\nAapka sample flat visit schedule kar diya gaya hai:\n\n📅 *Slot:* ${slot.formattedSlot}\n📍 *Project:* ${projectDoc?.name || 'Our Property'}${projectDoc?.location ? ` (${projectDoc.location})` : ''}\n\nHamare Senior Relationship Manager site par aapko receive karenge aur complete property tour denge. Agar aapko location direction chahiye ya time reschedule karna ho, toh bas yahan reply kar dein! 🏡`;
            await conversationMessage_model_1.default.create([
                { leadId: lead._id, phone, role: 'user', content: text, createdAt: new Date() },
                { leadId: lead._id, phone, role: 'assistant', content: confirmReply, createdAt: new Date() },
            ]);
            await conversationState_model_1.default.findOneAndUpdate({ leadId: lead._id }, {
                $set: {
                    lastMessageFromUser: text,
                    lastMessageAt: new Date(),
                    lastActiveAt: new Date(),
                    activeProjectId: projectId,
                },
                $inc: { attemptCount: 1 },
            }, { upsert: true, new: true });
            await (0, chatbotService_1.persistLeadInterest)(lead._id, 'hot', { status: 'interested' });
            return { reply: confirmReply, needsAgent: false, aiPaused: false };
        }
        else {
            // Site visit intent expressed, but no specific date/time given yet -> offer consultative slots
            const slotOfferReply = `Bilkul! Hum aapka sample flat visit zaroor schedule kar dete hain taaki aap construction quality, layout aur actual sample flat khud dekh sakein 🏡\n\nKya aap *Saturday* ya *Sunday* mein visit karna chahenge? Aur kaun sa time aapke liye best rahega — *Morning (11:00 AM)* ya *Evening (4:00 PM)*?`;
            await conversationMessage_model_1.default.create([
                { leadId: lead._id, phone, role: 'user', content: text, createdAt: new Date() },
                { leadId: lead._id, phone, role: 'assistant', content: slotOfferReply, createdAt: new Date() },
            ]);
            await conversationState_model_1.default.findOneAndUpdate({ leadId: lead._id }, {
                $set: {
                    lastMessageFromUser: text,
                    lastMessageAt: new Date(),
                    lastActiveAt: new Date(),
                    activeProjectId: projectId,
                },
                $inc: { attemptCount: 1 },
            }, { upsert: true, new: true });
            await (0, chatbotService_1.persistLeadInterest)(lead._id, 'hot', { status: 'interested' });
            return { reply: slotOfferReply, needsAgent: false, aiPaused: false };
        }
    }
    // 3. Check for explicit human agent / callback request
    if (isHandoffRequested(text)) {
        const handoffReply = "Sure! I have shared your request with our senior sales & advisory team. A dedicated property advisor will contact you shortly.";
        // Save user and assistant messages
        await conversationMessage_model_1.default.create([
            { leadId: lead._id, phone, role: 'user', content: text, createdAt: new Date() },
            { leadId: lead._id, phone, role: 'assistant', content: handoffReply, createdAt: new Date() },
        ]);
        // Update conversation state: needsAgent = true, aiPaused = true
        await conversationState_model_1.default.findOneAndUpdate({ leadId: lead._id }, {
            $set: {
                needsAgent: true,
                aiPaused: true,
                lastMessageFromUser: text,
                lastMessageAt: new Date(),
                lastActiveAt: new Date(),
            },
            $inc: { attemptCount: 1 },
        }, { upsert: true, new: true });
        // Active conversational request -> definitely HOT!
        await (0, chatbotService_1.persistLeadInterest)(lead._id, 'hot', { status: 'interested' });
        // Send dual support email notification about handoff request
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
        return { reply: handoffReply, needsAgent: true, aiPaused: true };
    }
    // 4. Check trained FAQs, keywords, and core project knowledge directly
    let directAnswer = null;
    if (projectDoc) {
        directAnswer = (0, projectKnowledgeService_1.findDirectFaqAnswer)(projectDoc, text);
    }
    // 5. 🎯 CROSS-SELLING BUDGET ENGINE
    // If user mentions a specific budget lower than current project or asks for cheaper options
    let crossSellNote = '';
    const statedBudget = currentLead.whatIsYourBudget || text;
    const isAskingCheaper = /sasta|saste|budget kam|lower budget|affordable|cheap|less price|kam rate/i.test(text);
    if (statedBudget || isAskingCheaper) {
        const crossProj = await (0, projectKnowledgeService_1.findCrossSellProject)(projectId, statedBudget);
        if (crossProj) {
            crossSellNote = `CROSS-SELLING RECOMMENDATION: The buyer's budget appears to be around ${currentLead.whatIsYourBudget || 'budget-friendly'}. Our active portfolio property "${crossProj.name}" at "${crossProj.location}" starts from ${crossProj.priceRange}. Enthusiastically pitch "${crossProj.name}" as an ideal alternative matching their budget!`;
        }
    }
    // Define smart fallback so user NEVER gets an empty/repetitive single message
    const smartFallback = directAnswer ||
        (projectDoc?.summary
            ? `Regarding *${projectDoc.name}*: ${projectDoc.summary}\n\nFeel free to ask about pricing, unit sizes, location, or schedule a site visit.`
            : "Thank you! I have noted your requirements. Our property advisory team will connect with you shortly with full details.");
    // 6. Build system and conversation messages with dynamic facts, portfolio, and guardrails
    let effectiveContextNote = directAnswer
        ? `${contextNote ? `${contextNote}\n` : ''}VERIFIED DATABASE FACT FOR THIS QUERY: "${directAnswer}". Convey this answer directly, concisely, and accurately.`
        : (contextNote || '');
    if (crossSellNote) {
        effectiveContextNote = `${effectiveContextNote ? `${effectiveContextNote}\n` : ''}${crossSellNote}`;
    }
    const messages = await buildMessages(lead._id, projectId, text, effectiveContextNote);
    // 7. Call Local Llama 3.2 safely with smart fallback
    const rawReply = await (0, llmService_1.askLLMSafe)(messages, smartFallback);
    let reply = cleanWhatsAppReply(rawReply);
    // Cap maximum reply length
    if (reply.length > AI_MAX_REPLY_CHARS) {
        reply = reply.slice(0, AI_MAX_REPLY_CHARS - 3).trim() + '...';
    }
    // 6. Persist messages for history & transcript
    await conversationMessage_model_1.default.create([
        { leadId: lead._id, phone, role: 'user', content: text, createdAt: new Date() },
        { leadId: lead._id, phone, role: 'assistant', content: reply, createdAt: new Date() },
    ]);
    // 7. Update ConversationState and upgrade lead interest to HOT!
    await conversationState_model_1.default.findOneAndUpdate({ leadId: lead._id }, {
        $set: {
            lastMessageFromUser: text,
            lastMessageAt: new Date(),
            lastActiveAt: new Date(),
            activeProjectId: projectId,
        },
        $inc: { attemptCount: 1 },
    }, { upsert: true, new: true });
    // 🔥 Anyone actively querying/chatting on WhatsApp is an engaged HOT lead!
    await (0, chatbotService_1.persistLeadInterest)(lead._id, 'hot', { status: 'interested' });
    // 7. Auto-learning: if AI deferred to human team or was asked an unhandled question, record it
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
        (0, aiLearningService_1.recordLearnedQuestion)(projectId, text, lead._id).catch(() => { });
    }
    return { reply, needsAgent: false, aiPaused: false };
}
//# sourceMappingURL=aiChatService.js.map