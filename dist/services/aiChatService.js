"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.isHandoffRequested = isHandoffRequested;
exports.cleanWhatsAppReply = cleanWhatsAppReply;
exports.buildMessages = buildMessages;
exports.generateReply = generateReply;
const llmService_1 = require("./llmService");
const projectKnowledgeService_1 = require("./projectKnowledgeService");
const conversationMessage_model_1 = __importDefault(require("../models/conversationMessage.model"));
const conversationState_model_1 = __importDefault(require("../models/conversationState.model"));
const lead_model_1 = __importDefault(require("../models/lead.model"));
const fbForm_model_1 = __importDefault(require("../models/fbForm.model"));
const chatbotService_1 = require("./chatbotService");
const aiLearningService_1 = require("./aiLearningService");
const AI_HISTORY_MESSAGES = parseInt(process.env.AI_HISTORY_MESSAGES || '6', 10);
const AI_MAX_REPLY_CHARS = parseInt(process.env.AI_MAX_REPLY_CHARS || '600', 10);
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
    'site visit',
    'visit site',
    'visit kab',
    'milna hai',
    'location dekhni',
];
function isHandoffRequested(text) {
    if (!text)
        return false;
    const lower = text.toLowerCase();
    return HANDOFF_KEYWORDS.some(kw => lower.includes(kw));
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
    const systemPrompt = `You are an elite, consultative Real Estate Property Advisor on WhatsApp.
You represent our property advisory firm and assist prospective home buyers strictly using the dynamic database information provided below.

════════════════════════════════════════════════════════════════════════════════
PROSPECTIVE BUYER INQUIRY SOURCE & FORM DATA:
════════════════════════════════════════════════════════════════════════════════
• Lead Name: ${leadDoc?.fullName || 'Prospective Buyer'}
• Origin Form / Source: "${formName}"
• Submitted Budget: ${leadDoc?.whatIsYourBudget || 'Not specified'}
• Preferred Timeline: ${leadDoc?.whenAreYouPlanningToPurchase || 'Not specified'}
• Submitted Requirement / Message: ${leadDoc?.message && leadDoc.message !== 'No message provided' ? leadDoc.message : 'General property inquiry'}
${extraFieldsSummary ? `• Additional Form Fields: ${extraFieldsSummary}` : ''}
${contextNote ? `• Current Context: ${contextNote}` : ''}

════════════════════════════════════════════════════════════════════════════════
PRIMARY INQUIRY PROPERTY (CURRENT FOCUS OF LEAD'S INQUIRY):
════════════════════════════════════════════════════════════════════════════════
${projectFacts || 'No detailed facts loaded yet for this project.'}

════════════════════════════════════════════════════════════════════════════════
DYNAMIC PORTFOLIO OF ALL OTHER ACTIVE PROPERTIES (FROM LIVE DATABASE):
════════════════════════════════════════════════════════════════════════════════
${dynamicPortfolio}

════════════════════════════════════════════════════════════════════════════════
CORE CONVERSATION RULES & PRIORITIES (STRICTLY ENFORCE):
════════════════════════════════════════════════════════════════════════════════
1. TOP PRIORITY LANGUAGE: ENGLISH
   - Always communicate in polished, fluent, courteous, and professional English.
   - English is your default and highest-priority language for all responses, explanations, and questions.
   - If the user explicitly asks in Hindi or Hinglish, respond courteously while maintaining clear English real estate terminology, and naturally transition back to English.

2. TWO-STAGE INQUIRY & PORTFOLIO RECOMMENDATION FLOW:
   - STAGE 1 (ANSWER PRIMARY PROPERTY FIRST):
     * Always address the buyer's immediate question regarding the primary property first.
     * Respect their submitted preferences (budget, timeline, unit size).
     * Follow strict incremental pacing: answer only what was asked in this turn.
   - STAGE 2 (CROSS-SELLING OUR OTHER ACTIVE PROJECTS FROM LIVE PORTFOLIO):
     * If user asks what other options we have, or if their budget/preferences differ:
     * Gracefully introduce other developments from our live portfolio above.

3. STRICT STEP-BY-STEP INFORMATION PACING (NEVER DUMP ALL DETAILS AT ONCE):
   - Answer ONLY the specific question the user asked in their current message.
   - NEVER dump the entire fact sheet, all unit types, all amenities, and full specs in one single message!
   - Specific scenarios:
     * If user asks about PRICE/RATES: Share only the pricing/starting rate for the units, and ask: "Are you interested in a 2 BHK or 3 BHK?"
     * If user asks about LOCATION: Share the exact location and key connectivity point.
     * If user asks about SIZES/CONFIGURATIONS: Share only the unit types and space in sq.ft, then ask about their preferred budget.
     * If user asks about AMENITIES: Mention 2-3 top lifestyle amenities briefly.
     * If user asks about POSSESSION: State the possession timeline directly.
   - Keep regular responses short and conversational: 2 to 3 sentences maximum (or clean WhatsApp bullet points).
   - Conclude each turn with ONE relevant, consultative follow-up question.

4. CONSULTATIVE, HUMAN-LIKE TONE:
   - Act as an attentive, knowledgeable real estate advisor, NOT a robotic FAQ engine.
   - Use clean WhatsApp formatting (e.g. *bold* for property names, prices, or key highlights).
   - Guide interested buyers toward scheduling a private site visit or an advisory callback.

5. OUT-OF-SCOPE REDIRECTION RULE:
   If the user asks about an unknown project or location not in database:
   a. Politely state: "We currently do not have information regarding that project or location."
   b. Present available verified properties from our live database above.

6. 100% FACTUAL GROUNDING / NO INVENTED FACTS:
   - NEVER invent or fabricate any property, location, space/size, rate, discount, or possession date.
   - All facts must come strictly from the dynamic database data above.`;
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
    const fallbackText = "Thank you! I have noted your requirements. Our property advisory team will connect with you shortly.";
    // 1. Check for explicit human agent / callback / site visit request
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
        await (0, chatbotService_1.persistLeadInterest)(lead._id, 'hot', { status: 'interested' });
        return { reply: handoffReply, needsAgent: true, aiPaused: true };
    }
    // 2. Extract and learn lead preferences (budget, unit, timeline) from text
    (0, aiLearningService_1.extractAndSaveLeadPreferences)(lead._id, text).catch(() => { });
    // 3. Build system and conversation messages with dynamic facts, portfolio, and guardrails
    const messages = await buildMessages(lead._id, projectId, text, contextNote);
    // 4. Call Local Llama 3.2 safely
    const rawReply = await (0, llmService_1.askLLMSafe)(messages, fallbackText);
    let reply = cleanWhatsAppReply(rawReply);
    // Cap maximum reply length
    if (reply.length > AI_MAX_REPLY_CHARS) {
        reply = reply.slice(0, AI_MAX_REPLY_CHARS - 3).trim() + '...';
    }
    // 5. Persist messages for history & transcript
    await conversationMessage_model_1.default.create([
        { leadId: lead._id, phone, role: 'user', content: text, createdAt: new Date() },
        { leadId: lead._id, phone, role: 'assistant', content: reply, createdAt: new Date() },
    ]);
    // 6. Update ConversationState and Lead interest scoring
    const state = await conversationState_model_1.default.findOneAndUpdate({ leadId: lead._id }, {
        $set: {
            lastMessageFromUser: text,
            lastMessageAt: new Date(),
            lastActiveAt: new Date(),
            activeProjectId: projectId,
        },
        $inc: { attemptCount: 1 },
    }, { upsert: true, new: true });
    const isCampaignLead = Boolean(state.deliveryStatus === 'read' ||
        state.deliveryStatus === 'delivered' ||
        state.deliveryStatus === 'replied' ||
        lead.source === 'whatsapp' ||
        lead.source === 'campaign');
    const interest = (0, chatbotService_1.calculateInterest)(state.attemptCount, false, isCampaignLead);
    await (0, chatbotService_1.persistLeadInterest)(lead._id, interest, { status: 'interested' });
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