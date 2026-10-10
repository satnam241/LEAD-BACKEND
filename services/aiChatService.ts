import mongoose, { Types } from 'mongoose';
import { askLLMSafe, LLMMessage } from './llmService';
import {
  getProjectFacts,
  getDynamicPortfolioCatalogue,
  findDirectFaqAnswer,
  findCrossSellProject,
  detectLanguage,
  isPropertyDetailsQuery,
  formatSingleProjectDetails,
  formatMultiProjectList,
  matchProjectFromSelection,
  buildIntelligentRealEstateResponse,
} from './projectKnowledgeService';
import ConversationMessage from '../models/conversationMessage.model';
import ConversationState from '../models/conversationState.model';
import Lead from '../models/lead.model';
import Project from '../models/project.model';
import FbForm from '../models/fbForm.model';
import { calculateInterest, persistLeadInterest } from './chatbotService';
import {
  recordLearnedQuestion,
  extractAndSaveLeadPreferences,
  logConversationForTraining,
} from './aiLearningService';
import { sendSupportAlert } from './emailService';
import { sendMedia } from './baileysService';

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

export function isHandoffRequested(text: string): boolean {
  if (!text) return false;
  const lower = text.toLowerCase();
  return HANDOFF_KEYWORDS.some(kw => lower.includes(kw));
}

export function isSiteVisitIntent(text: string): boolean {
  if (!text) return false;
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

export type MediaRequestType = 'images' | 'videos' | 'map' | null;

export function detectMediaRequest(text: string): MediaRequestType {
  if (!text) return null;
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

export interface ParsedSlot {
  date: Date;
  formattedSlot: string;
}

/**
 * Intelligent slot parser for Real Estate WhatsApp conversations.
 * Detects relative days (kal, parso, aaj), weekday names (Saturday, Sunday...),
 * explicit dates (15th, 12 April), and times (11 AM, 2 PM, 4 baje, morning, evening).
 */
export function parseSlotDateTime(text: string): ParsedSlot | null {
  if (!text) return null;
  const lower = text.toLowerCase();

  const daysMap: Record<string, number> = {
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
  } else if (/parso|परसों|परसो/i.test(lower)) {
    targetDate.setDate(targetDate.getDate() + 2);
    dayDetected = true;
  } else if (/aaj|today|आज/i.test(lower)) {
    dayDetected = true;
  } else {
    for (const [dayName, dayIndex] of Object.entries(daysMap)) {
      if (lower.includes(dayName)) {
        const currentDay = targetDate.getDay();
        let diff = dayIndex - currentDay;
        if (diff <= 0) diff += 7;
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
        if (mIdx !== -1) targetDate.setMonth(mIdx);
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
      } else if (meridian === 'am' && rawH === 12) {
        hour = 0;
      } else if (meridian === 'baje' || meridian === 'बजे') {
        if (rawH >= 1 && rawH <= 7) hour = rawH + 12;
        else hour = rawH;
      } else if (!meridian) {
        if (rawH >= 1 && rawH <= 6) hour = rawH + 12;
        else hour = rawH;
      } else {
        hour = rawH;
      }
    }
  }

  if (/morning|subah|सुबह/i.test(lower) && !timeDetected) {
    hour = 11;
    minute = 0;
    timeDetected = true;
  } else if (/afternoon|dopahar|दोपहर/i.test(lower) && !timeDetected) {
    hour = 14;
    minute = 30;
    timeDetected = true;
  } else if (/evening|shaam|शाम/i.test(lower) && !timeDetected) {
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
export function cleanWhatsAppReply(text: string): string {
  if (!text) return '';
  return text
    .replace(/^["']|["']$/g, '')
    .trim();
}

/**
 * Builds system prompt with lead submission context (Form/Requirements),
 * dynamic project facts, dynamic portfolio catalogue, two-stage inquiry progression,
 * English language priority, step-by-step pacing, and strict boundary rules.
 */
export async function buildMessages(
  leadId: Types.ObjectId,
  projectId: Types.ObjectId,
  currentMessage: string,
  contextNote?: string
): Promise<LLMMessage[]> {
  const detectedLang = detectLanguage(currentMessage);

  const [projectFacts, dynamicPortfolio, leadDoc] = await Promise.all([
    getProjectFacts(projectId, currentMessage),
    getDynamicPortfolioCatalogue(projectId),
    Lead.findById(leadId).lean(),
  ]);

  let formName = leadDoc?.formName || '';
  if (!formName && leadDoc?.formId) {
    const fbForm = await FbForm.findOne({ formId: leadDoc.formId }).select('name').lean();
    if (fbForm?.name) formName = fbForm.name;
  }
  if (!formName) {
    formName = leadDoc?.source ? `Lead from ${leadDoc.source}` : 'Direct WhatsApp Inquiry';
  }

  const extraFieldsSummary =
    leadDoc?.extraFields && typeof leadDoc.extraFields === 'object' && Object.keys(leadDoc.extraFields).length > 0
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
${
  detectedLang === 'english'
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
- Respond in warm, respectful, consultative Hinglish.`
}
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

${
  detectedLang === 'english'
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
     * Reassure that construction is strictly on schedule under RERA guidelines with top-tier construction technology.`
}

4. 🎯 CONSULTATIVE SELLING (ALWAYS GUIDE TO THE NEXT STEP):
   - NEVER just drop facts and go silent.
   - Keep every response concise: 2 to 4 sentences or clean WhatsApp bullet points.
   - Always conclude each message with ONE natural, consultative qualifying question matching [ ${detectedLang.toUpperCase()} ]:
${
  detectedLang === 'english'
    ? `     * "Are you considering this property for personal residence (self-use) or as an investment?"
     * "Do you prefer a 2 BHK or a more spacious 3 BHK configuration?"
     * "Would you like to schedule a site visit this weekend to inspect the sample flat in person?"`
    : `     * "Aap is property ko self-use (rehne ke liye) dekh rahe hain ya investment purpose ke liye?"
     * "Aapki preference 2 BHK ke liye hai ya 3 BHK spacious layout ke liye?"
     * "Kya hum is weekend par aapka ek sample flat site visit schedule karein?"`
}

5. 🔒 ZERO-HALLUCINATION / 100% FACTUAL GROUNDING:
   - All prices, sizes, amenities, RERA numbers, and possession dates must come STRICTLY from the database facts above.
   - NEVER invent rates, fake discounts, or imaginary flat numbers.

6. 📱 WHATSAPP PRESENTATION:
   - Use clean *bold* formatting for project names, rates, and key highlights.
   - No huge walls of text. Short, punchy, consultative messages.

${
  detectedLang === 'english'
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
Advisor: "Township mein wide roads, gated security, underground wiring aur landscaped parks available hain! Aap kis size ka plot ya unit prefer karenge?"`
}

CRITICAL INSTRUCTION:
- Answer ONLY what the buyer asked.
- STRICTLY adhere to [ ${detectedLang.toUpperCase()} ]. ZERO foreign language words!
- Conclude in 2-3 sentences with a consultative next step question.`;

  // Fetch recent conversation history
  const historyDocs = await ConversationMessage.find({ leadId })
    .sort({ createdAt: -1 })
    .limit(AI_HISTORY_MESSAGES)
    .lean();

  historyDocs.reverse();

  const messages: LLMMessage[] = [{ role: 'system', content: systemPrompt }];

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
export async function generateReply(
  phone: string,
  text: string,
  lead: any,
  projectId: Types.ObjectId,
  contextNote?: string
): Promise<{ reply: string; needsAgent: boolean; aiPaused: boolean }> {
  // 1. Detect language immediately for 100% strict adherence
  const lang = detectLanguage(text);

  // 2. Extract and profile lead preferences (budget, unit, timeline, purpose) from message
  const profiled = await extractAndSaveLeadPreferences(lead._id, text).catch(() => ({}));
  const currentLead = (await Lead.findById(lead._id).lean()) || lead;

  let projectDoc: any = null;
  if (projectId) {
    projectDoc = await Project.findById(projectId).lean();
  }

  // 3. 🏡 INTERACTIVE SITE VISIT SLOT BOOKING ENGINE
  if (isSiteVisitIntent(text)) {
    const slot = parseSlotDateTime(text);

    if (slot) {
      // Slot (day + time) parsed! Schedule site visit and calendar sync
      const visitMessage = `Site Visit Booked via WhatsApp for ${projectDoc?.name || 'Property'}`;

      await Lead.findByIdAndUpdate(lead._id, {
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
        const Admin = (await import('../models/admin.model')).default;
        const { createCalendarEvent } = await import('./googleCalendar.service');
        const admin = await Admin.findOne({
          'googleCalendar.isConnected': true,
          'googleCalendar.refreshToken': { $exists: true, $ne: '' },
        });

        if (admin?.googleCalendar?.refreshToken) {
          const updatedLead = await Lead.findById(lead._id);
          const calEvent = await createCalendarEvent(admin.googleCalendar.refreshToken, updatedLead);
          if (calEvent?.id) {
            await Lead.findByIdAndUpdate(lead._id, { $set: { 'followUp.googleEventId': calEvent.id } });
          }
        }
      } catch (calErr: any) {
        console.warn('[Site Visit] Non-fatal Google Calendar sync warning:', calErr?.message || calErr);
      }

      // Dual Support Email Notification (SUPPORT_EMAIL and SUPPORT_EMAIL1 + Admin)
      sendSupportAlert({
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

      let confirmReply = `🎉 *Site Visit Confirmed!*\n\nAapka sample flat visit schedule kar diya gaya hai:\n\n📅 *Slot:* ${slot.formattedSlot}\n📍 *Project:* ${projectDoc?.name || 'Our Property'}${projectDoc?.location ? ` (${projectDoc.location})` : ''}\n\nHamare Senior Relationship Manager site par aapko receive karenge aur complete property tour denge. Agar aapko location direction chahiye ya time reschedule karna ho, toh bas yahan reply kar dein! 🏡`;
      if (lang === 'english') {
        confirmReply = `🎉 *Site Visit Confirmed!*\n\nYour sample flat visit has been scheduled:\n\n📅 *Slot:* ${slot.formattedSlot}\n📍 *Project:* ${projectDoc?.name || 'Our Property'}${projectDoc?.location ? ` (${projectDoc.location})` : ''}\n\nOur Senior Relationship Manager will welcome you at the site and provide a complete property walkthrough. Feel free to reply here if you need location directions or wish to reschedule! 🏡`;
      } else if (lang === 'hindi') {
        confirmReply = `🎉 *साइट विजिट कन्फर्म!*\n\nआपका सैंपल फ्लैट विजिट शेड्यूल कर दिया गया है:\n\n📅 *स्लॉट:* ${slot.formattedSlot}\n📍 *प्रोजेक्ट:* ${projectDoc?.name || 'प्रॉपर्टी'}${projectDoc?.location ? ` (${projectDoc.location})` : ''}\n\nहमारे सीनियर रिलेशनशिप मैनेजर साइट पर आपका स्वागत करेंगे और पूरा टूर देंगे। लोकेशन या समय बदलने के लिए यहाँ रिप्लाई करें! 🏡`;
      }

      await ConversationMessage.create([
        { leadId: lead._id, phone, role: 'user', content: text, createdAt: new Date() },
        { leadId: lead._id, phone, role: 'assistant', content: confirmReply, createdAt: new Date() },
      ]);

      await ConversationState.findOneAndUpdate(
        { leadId: lead._id },
        {
          $set: {
            lastMessageFromUser: text,
            lastMessageAt: new Date(),
            lastActiveAt: new Date(),
            activeProjectId: projectId,
          },
          $inc: { attemptCount: 1 },
        },
        { upsert: true, new: true }
      );

      await persistLeadInterest(lead._id, 'hot', { status: 'interested' });

      logConversationForTraining({
        leadId: lead._id,
        phone,
        language: lang,
        detectedIntent: 'site_visit_confirmed',
        projectId,
        projectName: projectDoc?.name || 'Bhole Baba Investments',
        userMessage: text,
        aiResponse: confirmReply,
        source: 'whatsapp',
      }).catch(() => {});

      return { reply: confirmReply, needsAgent: false, aiPaused: false };
    } else {
      // Site visit intent expressed, but no specific date/time given yet -> offer consultative slots
      let slotOfferReply = `Bilkul! Hum aapka sample flat visit zaroor schedule kar dete hain taaki aap construction quality, layout aur actual sample flat khud dekh sakein 🏡\n\nKya aap *Saturday* ya *Sunday* mein visit karna chahenge? Aur kaun sa time aapke liye best rahega — *Morning (11:00 AM)* ya *Evening (4:00 PM)*?`;
      if (lang === 'english') {
        slotOfferReply = `Certainly! We would love to schedule your sample flat visit so you can inspect the construction quality, spacious layouts, and actual site in person 🏡\n\nWould you prefer visiting this *Saturday* or *Sunday*? And which time works best for you — *Morning (11:00 AM)* or *Evening (4:00 PM)*?`;
      } else if (lang === 'hindi') {
        slotOfferReply = `बिल्कुल! हम आपका सैंपल फ्लैट विजिट ज़रूर शेड्यूल कर देते हैं ताकि आप कंस्ट्रक्शन क्वालिटी और लेआउट खुद देख सकें 🏡\n\nक्या आप *शनिवार* या *रविवार* को आना चाहेंगे? आपके लिए कौन सा समय सही रहेगा — *सुबह (11:00 AM)* या *शाम (4:00 PM)*?`;
      }

      await ConversationMessage.create([
        { leadId: lead._id, phone, role: 'user', content: text, createdAt: new Date() },
        { leadId: lead._id, phone, role: 'assistant', content: slotOfferReply, createdAt: new Date() },
      ]);

      await ConversationState.findOneAndUpdate(
        { leadId: lead._id },
        {
          $set: {
            lastMessageFromUser: text,
            lastMessageAt: new Date(),
            lastActiveAt: new Date(),
            activeProjectId: projectId,
          },
          $inc: { attemptCount: 1 },
        },
        { upsert: true, new: true }
      );

      await persistLeadInterest(lead._id, 'hot', { status: 'interested' });

      logConversationForTraining({
        leadId: lead._id,
        phone,
        language: lang,
        detectedIntent: 'site_visit_inquiry',
        projectId,
        projectName: projectDoc?.name || 'Bhole Baba Investments',
        userMessage: text,
        aiResponse: slotOfferReply,
        source: 'whatsapp',
      }).catch(() => {});

      return { reply: slotOfferReply, needsAgent: false, aiPaused: false };
    }
  }

  // 3. 📸 🎥 🗺️ MEDIA DISPATCH ENGINE (Images, Videos, Map)
  const mediaReq = detectMediaRequest(text);
  if (mediaReq && projectDoc) {
    const lang = detectLanguage(text);

    if (mediaReq === 'images') {
      const images: string[] = Array.isArray(projectDoc.images) ? projectDoc.images.filter(Boolean) : [];
      if (images.length > 0) {
        for (let i = 0; i < Math.min(images.length, 3); i++) {
          const caption = i === 0 ? `📸 *${projectDoc.name}* • Sample Flat & Site Photo` : undefined;
          await sendMedia(phone, images[i], caption).catch(() => {});
        }

        let replyText = `Yeh rahe *${projectDoc.name}* ke latest sample flat aur site photos! 📸\n\nKya hum is weekend par aapka sample flat visit schedule karein taaki aap quality khud dekh sakein? 🏡`;
        if (lang === 'english') {
          replyText = `Here are the latest sample flat and site photos for *${projectDoc.name}*! 📸\n\nWould you like to schedule a site visit this weekend to experience the quality in person? 🏡`;
        } else if (lang === 'hindi') {
          replyText = `पेश हैं *${projectDoc.name}* के लेटेस्ट सैंपल फ्लैट और साइट के फोटो! 📸\n\nक्या हम इस सप्ताहांत पर आपका साइट विजिट शेड्यूल करें ताकि आप कंस्ट्रक्शन क्वालिटी खुद देख सकें? 🏡`;
        }

        await ConversationMessage.create([
          { leadId: lead._id, phone, role: 'user', content: text, createdAt: new Date() },
          { leadId: lead._id, phone, role: 'assistant', content: replyText, createdAt: new Date() },
        ]);

        await ConversationState.findOneAndUpdate(
          { leadId: lead._id },
          {
            $set: {
              lastMessageFromUser: text,
              lastMessageAt: new Date(),
              lastActiveAt: new Date(),
              activeProjectId: projectId,
            },
            $inc: { attemptCount: 1 },
          },
          { upsert: true, new: true }
        );

        await persistLeadInterest(lead._id, 'hot', { status: 'interested' });
        return { reply: replyText, needsAgent: false, aiPaused: false };
      } else {
        let fallbackText = `Humne *${projectDoc.name}* ke photos ki request note kar li hai! Hamari sales team aapko WhatsApp par gallery thodi der mein share kar degi 📸\n\nKya hum is weekend par aapka sample flat visit schedule karein? 🏡`;
        if (lang === 'english') {
          fallbackText = `We have noted your request for photos of *${projectDoc.name}*! Our team will share the photo gallery on this WhatsApp chat shortly 📸\n\nWould you also like to schedule a site visit this weekend? 🏡`;
        } else if (lang === 'hindi') {
          fallbackText = `हमने *${projectDoc.name}* के फोटो की आपकी रिक्वेस्ट नोट कर ली है! हमारी टीम जल्द ही व्हाट्सएप पर फोटो शेयर करेगी 📸\n\nक्या हम इस सप्ताहांत पर आपका साइट विजिट शेड्यूल करें? 🏡`;
        }

        await ConversationMessage.create([
          { leadId: lead._id, phone, role: 'user', content: text, createdAt: new Date() },
          { leadId: lead._id, phone, role: 'assistant', content: fallbackText, createdAt: new Date() },
        ]);
        await persistLeadInterest(lead._id, 'hot', { status: 'interested' });
        return { reply: fallbackText, needsAgent: false, aiPaused: false };
      }
    }

    if (mediaReq === 'videos') {
      const videos: string[] = Array.isArray(projectDoc.videos) ? projectDoc.videos.filter(Boolean) : [];
      if (videos.length > 0) {
        await sendMedia(phone, videos[0], `🎥 *${projectDoc.name}* • Video Walkthrough`).catch(() => {});

        let replyText = `Yeh raha *${projectDoc.name}* ka walkthrough video! 🎥\n\nKya aap actual site dekhne ke liye is weekend par private site visit schedule karna chahenge? 🏡`;
        if (lang === 'english') {
          replyText = `Here is the official walkthrough video for *${projectDoc.name}*! 🎥\n\nWould you like to schedule a private site visit this weekend to tour the property in person? 🏡`;
        } else if (lang === 'hindi') {
          replyText = `पेश है *${projectDoc.name}* का वॉकथ्रू वीडियो! 🎥\n\nक्या आप प्रॉपर्टी खुद देखने के लिए इस सप्ताहांत साइट विजिट प्लान करना चाहेंगे? 🏡`;
        }

        await ConversationMessage.create([
          { leadId: lead._id, phone, role: 'user', content: text, createdAt: new Date() },
          { leadId: lead._id, phone, role: 'assistant', content: replyText, createdAt: new Date() },
        ]);
        await persistLeadInterest(lead._id, 'hot', { status: 'interested' });
        return { reply: replyText, needsAgent: false, aiPaused: false };
      } else {
        let fallbackText = `Humne *${projectDoc.name}* ke video walkthrough ki request note kar li hai! Hamari team aapko video link WhatsApp par shortly share karegi 🎥\n\nKya hum is weekend par aapka live site tour plan karein? 🏡`;
        if (lang === 'english') {
          fallbackText = `We have noted your request for the walkthrough video of *${projectDoc.name}*! Our team will share it shortly 🎥\n\nWould you also like to plan a personal site tour this weekend? 🏡`;
        } else if (lang === 'hindi') {
          fallbackText = `हमने *${projectDoc.name}* के वीडियो की रिक्वेस्ट नोट कर ली है! हमारी टीम जल्द ही वीडियो शेयर करेगी 🎥\n\nक्या हम इस सप्ताहांत पर आपका साइट विजिट शेड्यूल करें? 🏡`;
        }

        await ConversationMessage.create([
          { leadId: lead._id, phone, role: 'user', content: text, createdAt: new Date() },
          { leadId: lead._id, phone, role: 'assistant', content: fallbackText, createdAt: new Date() },
        ]);
        await persistLeadInterest(lead._id, 'hot', { status: 'interested' });
        return { reply: fallbackText, needsAgent: false, aiPaused: false };
      }
    }

    if (mediaReq === 'map') {
      if (projectDoc.map && projectDoc.map.trim()) {
        await sendMedia(phone, projectDoc.map.trim(), `🗺️ *${projectDoc.name}* • Approved Master Plan & Layout Map`).catch(() => {});

        let replyText = `Yeh raha *${projectDoc.name}* ka approved layout map aur master plan! 🗺️\n\nAapko kaun sa plot size ya location best lag raha hai? 🏡`;
        if (lang === 'english') {
          replyText = `Here is the approved layout map & master plan for *${projectDoc.name}*! 🗺️\n\nWhich plot size or configuration best matches your preference? 🏡`;
        } else if (lang === 'hindi') {
          replyText = `पेश है *${projectDoc.name}* का अप्रूव्ड लेआउट मैप और मास्टर प्लान! 🗺️\n\nआपकी पसंद कौन से साइज के प्लॉट या यूनिट के लिए है? 🏡`;
        }

        await ConversationMessage.create([
          { leadId: lead._id, phone, role: 'user', content: text, createdAt: new Date() },
          { leadId: lead._id, phone, role: 'assistant', content: replyText, createdAt: new Date() },
        ]);
        await persistLeadInterest(lead._id, 'hot', { status: 'interested' });
        return { reply: replyText, needsAgent: false, aiPaused: false };
      } else {
        let fallbackText = `Humne *${projectDoc.name}* ke layout map aur master plan ki request note kar li hai! Hamari team WhatsApp par PDF layout share kar degi 🗺️\n\nKya aap location aur plots dekhne ke liye site visit karna chahenge? 🏡`;
        if (lang === 'english') {
          fallbackText = `We have noted your request for the layout map of *${projectDoc.name}*! Our team will share the master plan shortly 🗺️\n\nWould you like to schedule a site visit? 🏡`;
        } else if (lang === 'hindi') {
          fallbackText = `हमने *${projectDoc.name}* के लेआउट मैप की रिक्वेस्ट नोट कर ली है! हमारी टीम जल्द ही मास्टर प्लान शेयर करेगी 🗺️\n\nक्या आप साइट विजिट प्लान करना चाहेंगे? 🏡`;
        }

        await ConversationMessage.create([
          { leadId: lead._id, phone, role: 'user', content: text, createdAt: new Date() },
          { leadId: lead._id, phone, role: 'assistant', content: fallbackText, createdAt: new Date() },
        ]);
        await persistLeadInterest(lead._id, 'hot', { status: 'interested' });
        return { reply: fallbackText, needsAgent: false, aiPaused: false };
      }
    }
  }

  // 4. Check for explicit human agent / callback request
  if (isHandoffRequested(text)) {
    let handoffReply = "Bilkul! Maine aapki request Bhole Baba Investments ki senior sales & advisory team ko forward kar di hai. Hamare senior advisor aapse jald hi call par connect karenge.";
    if (lang === 'english') {
      handoffReply = "Certainly! I have forwarded your request to our senior sales & advisory team at *Bhole Baba Investments*. A dedicated property advisor will call you shortly.";
    } else if (lang === 'hindi') {
      handoffReply = "बिल्कुल! मैंने आपका अनुरोध *भोले बाबा इन्वेस्टमेंट्स* की सीनियर एडवाइजरी टीम को भेज दिया है। हमारे सलाहकार जल्द ही आपसे संपर्क करेंगे।";
    }

    // Save user and assistant messages
    await ConversationMessage.create([
      { leadId: lead._id, phone, role: 'user', content: text, createdAt: new Date() },
      { leadId: lead._id, phone, role: 'assistant', content: handoffReply, createdAt: new Date() },
    ]);

    // Update conversation state: needsAgent = true, aiPaused = true
    await ConversationState.findOneAndUpdate(
      { leadId: lead._id },
      {
        $set: {
          needsAgent: true,
          aiPaused: true,
          lastMessageFromUser: text,
          lastMessageAt: new Date(),
          lastActiveAt: new Date(),
        },
        $inc: { attemptCount: 1 },
      },
      { upsert: true, new: true }
    );

    await persistLeadInterest(lead._id, 'hot', { status: 'interested' });

    sendSupportAlert({
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
    }).catch(() => {});

    logConversationForTraining({
      leadId: lead._id,
      phone,
      language: lang,
      detectedIntent: 'agent_handoff',
      projectId,
      projectName: projectDoc?.name || 'Bhole Baba Investments',
      userMessage: text,
      aiResponse: handoffReply,
      source: 'whatsapp',
    }).catch(() => {});

    return { reply: handoffReply, needsAgent: true, aiPaused: true };
  }

  // ─────────────────────────────────────────────────────────────
  // 5. 🎯 PROJECT SELECTION MATCHING (e.g. user typed "1", "2", or project name)
  // ─────────────────────────────────────────────────────────────
  const activeProjects = await Project.find({ isActive: true }).lean();
  const selectedProj = matchProjectFromSelection(text, activeProjects);

  if (selectedProj && activeProjects.length > 1) {
    console.log(`[AI Chat] 🎯 User selected project: "${selectedProj.name}" from text: "${text}"`);
    const projectReply = formatSingleProjectDetails(selectedProj, lang);

    await ConversationMessage.create([
      { leadId: lead._id, phone, role: 'user', content: text, createdAt: new Date() },
      { leadId: lead._id, phone, role: 'assistant', content: projectReply, createdAt: new Date() },
    ]);

    await ConversationState.findOneAndUpdate(
      { leadId: lead._id },
      {
        $set: {
          lastMessageFromUser: text,
          lastMessageAt: new Date(),
          lastActiveAt: new Date(),
          activeProjectId: selectedProj._id,
        },
        $inc: { attemptCount: 1 },
      },
      { upsert: true, new: true }
    );

    await persistLeadInterest(lead._id, 'hot', { status: 'interested' });

    logConversationForTraining({
      leadId: lead._id,
      phone,
      language: lang,
      detectedIntent: 'project_selection',
      projectId: selectedProj._id,
      projectName: selectedProj.name,
      userMessage: text,
      aiResponse: projectReply,
      source: 'whatsapp',
    }).catch(() => {});

    return { reply: projectReply, needsAgent: false, aiPaused: false };
  }

  // ─────────────────────────────────────────────────────────────
  // 6. 🏡 PROPERTY DETAILS INQUIRY (Single vs Multiple Projects Routing)
  // ─────────────────────────────────────────────────────────────
  if (isPropertyDetailsQuery(text)) {
    let detailsReply = '';
    let targetProject = projectDoc;

    if (activeProjects.length <= 1) {
      const singleProj = activeProjects[0] || projectDoc;
      if (singleProj) {
        detailsReply = formatSingleProjectDetails(singleProj, lang);
        targetProject = singleProj;
      }
    } else {
      const askingPortfolio = /all\s*projects|kya\s*(kya)?\s*project|options|list|kaun\s*se\s*project|konsa\s*project|what\s*projects|which\s*projects/i.test(text);
      if (askingPortfolio || !projectDoc) {
        detailsReply = formatMultiProjectList(activeProjects, lang);
      } else {
        detailsReply = formatSingleProjectDetails(projectDoc, lang);
      }
    }

    if (detailsReply) {
      await ConversationMessage.create([
        { leadId: lead._id, phone, role: 'user', content: text, createdAt: new Date() },
        { leadId: lead._id, phone, role: 'assistant', content: detailsReply, createdAt: new Date() },
      ]);

      await ConversationState.findOneAndUpdate(
        { leadId: lead._id },
        {
          $set: {
            lastMessageFromUser: text,
            lastMessageAt: new Date(),
            lastActiveAt: new Date(),
            activeProjectId: targetProject?._id || projectId,
          },
          $inc: { attemptCount: 1 },
        },
        { upsert: true, new: true }
      );

      await persistLeadInterest(lead._id, 'hot', { status: 'interested' });

      logConversationForTraining({
        leadId: lead._id,
        phone,
        language: lang,
        detectedIntent: 'property_details',
        projectId: targetProject?._id || projectId,
        projectName: targetProject?.name || 'Bhole Baba Investments',
        userMessage: text,
        aiResponse: detailsReply,
        source: 'whatsapp',
      }).catch(() => {});

      return { reply: detailsReply, needsAgent: false, aiPaused: false };
    }
  }

  // 7. Check trained FAQs, keywords, and core project knowledge directly
  let directAnswer: string | null = null;
  if (projectDoc) {
    directAnswer = findDirectFaqAnswer(projectDoc, text);
  }

  // 🛡️ Extra Safety Guardrail: Suppress false 35acres match if user didn't ask for area
  if (directAnswer && /35\s*acres?|spread\s*over/i.test(directAnswer)) {
    const isAskingArea = /acre|acres|spread|total area|land area|master plan/i.test(text);
    if (!isAskingArea) {
      console.warn(`[AI Guardrail] 🛡️ Suppressed false 35acres answer for query: "${text}"`);
      directAnswer = null;
    }
  }

  // Check Universal First Welcome Message if user sent a greeting
  const isGreeting = /^(hello|hi|hey|hii|helo|hlo|namaste|good morning|good afternoon|good evening|hello sir|hi sir|hey sir|hello ji|hi ji|greetings|start)(\s+.*)?$/i.test(text.toLowerCase().trim());
  if (!directAnswer && isGreeting) {
    if (lang === 'english') {
      directAnswer = `Hello! Welcome to *Bhole Baba Investments* Real Estate 🏡\n\nI am your dedicated AI Property Consultant. How can I assist you today? You can ask me about our residential & commercial projects, latest pricing, location, available layouts, or schedule a site visit.`;
    } else {
      const { getGlobalWelcomeMessage } = await import('./botSettingService');
      const globalMsg = await getGlobalWelcomeMessage();
      if (globalMsg && globalMsg.trim()) {
        directAnswer = globalMsg.trim();
      }
    }
  }

  // If user is in English mode, ensure directAnswer does not leak Hindi
  if (directAnswer && lang === 'english') {
    const hasHindi = /[\u0900-\u097F]|\b(hai|hain|kya|aap|karein|batao|humare|paas|se)\b/i.test(directAnswer);
    if (hasHindi) {
      // Re-route through LLM with English constraint so it gets translated cleanly
      contextNote = `${contextNote ? `${contextNote}\n` : ''}VERIFIED DATABASE FACT: "${directAnswer}". Translate/express this fact in 100% PURE, PROFESSIONAL ENGLISH ONLY!`;
      directAnswer = null;
    }
  }

  // 🎯 If a direct verified answer was found matching user language, use it!
  if (directAnswer && directAnswer.trim()) {
    const cleanAnswer = cleanWhatsAppReply(directAnswer);

    await ConversationMessage.create([
      { leadId: lead._id, phone, role: 'user', content: text, createdAt: new Date() },
      { leadId: lead._id, phone, role: 'assistant', content: cleanAnswer, createdAt: new Date() },
    ]);

    await ConversationState.findOneAndUpdate(
      { leadId: lead._id },
      {
        $set: {
          lastMessageFromUser: text,
          lastMessageAt: new Date(),
          lastActiveAt: new Date(),
          activeProjectId: projectId,
        },
        $inc: { attemptCount: 1 },
      },
      { upsert: true, new: true }
    );

    await persistLeadInterest(lead._id, 'hot', { status: 'interested' });

    logConversationForTraining({
      leadId: lead._id,
      phone,
      language: lang,
      detectedIntent: 'direct_knowledge_or_persona',
      projectId,
      projectName: projectDoc?.name || 'Bhole Baba Investments',
      userMessage: text,
      aiResponse: cleanAnswer,
      source: 'whatsapp',
    }).catch(() => {});

    return { reply: cleanAnswer, needsAgent: false, aiPaused: false };
  }

  // 8. 🎯 CROSS-SELLING BUDGET ENGINE
  let crossSellNote = '';
  const statedBudget = currentLead.whatIsYourBudget || text;
  const isAskingCheaper = /sasta|saste|budget kam|lower budget|affordable|cheap|less price|kam rate/i.test(text);
  if (statedBudget || isAskingCheaper) {
    const crossProj = await findCrossSellProject(projectId, statedBudget);
    if (crossProj) {
      crossSellNote = `CROSS-SELLING RECOMMENDATION: The buyer's budget appears to be around ${currentLead.whatIsYourBudget || 'budget-friendly'}. Our active portfolio property "${crossProj.name}" at "${crossProj.location}" starts from ${crossProj.priceRange}. Enthusiastically pitch "${crossProj.name}" as an ideal alternative matching their budget!`;
    }
  }

  // Intelligent Contextual Fallback synthesized from DB: NEVER returns a repeated or dumb 1-liner!
  const smartFallback = buildIntelligentRealEstateResponse(projectDoc, text, lang, activeProjects);

  // 6. Build system and conversation messages with dynamic facts, portfolio, and guardrails
  let effectiveContextNote = directAnswer
    ? `${contextNote ? `${contextNote}\n` : ''}VERIFIED DATABASE FACT FOR THIS QUERY: "${directAnswer}". Convey this answer directly, concisely, and accurately.`
    : (contextNote || '');

  if (crossSellNote) {
    effectiveContextNote = `${effectiveContextNote ? `${effectiveContextNote}\n` : ''}${crossSellNote}`;
  }

  const messages = await buildMessages(lead._id, projectId, text, effectiveContextNote);

  // 7. Call Local Llama 3.2 safely with smart fallback
  const rawReply = await askLLMSafe(messages, smartFallback);
  let reply = cleanWhatsAppReply(rawReply);

  // Cap maximum reply length
  if (reply.length > AI_MAX_REPLY_CHARS) {
    reply = reply.slice(0, AI_MAX_REPLY_CHARS - 3).trim() + '...';
  }

  // 6. Persist messages for history & transcript
  await ConversationMessage.create([
    { leadId: lead._id, phone, role: 'user', content: text, createdAt: new Date() },
    { leadId: lead._id, phone, role: 'assistant', content: reply, createdAt: new Date() },
  ]);

  // 7. Update ConversationState and upgrade lead interest to HOT!
  await ConversationState.findOneAndUpdate(
    { leadId: lead._id },
    {
      $set: {
        lastMessageFromUser: text,
        lastMessageAt: new Date(),
        lastActiveAt: new Date(),
        activeProjectId: projectId,
      },
      $inc: { attemptCount: 1 },
    },
    { upsert: true, new: true }
  );

  // 🔥 Anyone actively querying/chatting on WhatsApp is an engaged HOT lead!
  await persistLeadInterest(lead._id, 'hot', { status: 'interested' });

  // 📝 Continuously log high-quality conversational training pair for llm.sharesampatti.com
  logConversationForTraining({
    leadId: lead._id,
    phone,
    language: lang,
    detectedIntent: 'general_ai_dialogue',
    projectId,
    projectName: projectDoc?.name || 'Bhole Baba Investments',
    userMessage: text,
    aiResponse: reply,
    source: 'whatsapp',
  }).catch(() => {});

  // 7. Auto-learning: if AI deferred to human team or was asked an unhandled question, record it
  const lowerReply = reply.toLowerCase();
  const isDeferred =
    lowerReply.includes('team') ||
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
    recordLearnedQuestion(projectId, text, lead._id).catch(() => {});
  }

  return { reply, needsAgent: false, aiPaused: false };
}
