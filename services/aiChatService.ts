import mongoose, { Types } from 'mongoose';
import { askLLMSafe, LLMMessage } from './llmService';
import {
  getProjectFacts,
  getDynamicPortfolioCatalogue,
  findDirectFaqAnswer,
  findCrossSellProject,
  detectLanguage,
  DetectedLanguage,
  isPropertyDetailsQuery,
  matchProjectFromSelection,
  buildIntelligentRealEstateResponse,
} from './projectKnowledgeService';
import ConversationMessage from '../models/conversationMessage.model';
import ConversationState from '../models/conversationState.model';
import Lead from '../models/lead.model';
import Project from '../models/project.model';
import FbForm from '../models/fbForm.model';
import { persistLeadInterest } from './chatbotService';
import {
  recordLearnedQuestion,
  extractAndSaveLeadPreferences,
  logConversationForTraining,
} from './aiLearningService';
import { sendSupportAlert } from './emailService';
import { sendMedia } from './baileysService';

const AI_HISTORY_MESSAGES = parseInt(process.env.AI_HISTORY_MESSAGES || '6', 10);
const AI_MAX_REPLY_CHARS = parseInt(process.env.AI_MAX_REPLY_CHARS || '600', 10);

// Only explicit requests to speak with a human/agent/manager or contact number trigger handoff
export const CONTACT_NUMBER_KEYWORDS = [
  'contact number',
  'sales number',
  'sales team number',
  'sales contact',
  'phone number',
  'mobile number',
  'calling number',
  'apna number',
  'office number',
  'share number',
  'send number',
  'give number',
  'your number',
  'helpline',
  'support number',
  'contact details',
  'connect number',
  'number do',
  'number de do',
  'number dena',
  'number batao',
  'number share',
  'kis number',
  'kisko call',
  'how to call',
  'where to call',
  'call on which',
  'कॉलिंग नंबर',
  'कांटेक्ट नंबर',
  'नंबर दो',
  'नंबर बताओ',
  'फोन नंबर',
];

export function isContactNumberRequest(text: string): boolean {
  if (!text) return false;
  const lower = text.toLowerCase();
  return CONTACT_NUMBER_KEYWORDS.some(kw => lower.includes(kw));
}

const HANDOFF_KEYWORDS = [
  'agent',
  'human',
  'person',
  'call me',
  'callback',
  'call back',
  'call karo',
  'phone karo',
  'call kijiye',
  'call karna',
  'call kar do',
  'call chaiye',
  'call chahiye',
  'call please',
  'please call',
  'contact me',
  'executive',
  'representative',
  'manager',
  'baat karni',
  'phone lagao',
  'contact number',
  'insan se baat',
  'calling',
  'sales number',
  'sales team number',
  'sales contact',
  'office number',
  'apna number',
  'number do',
  'number de do',
  'number dena',
  'number batao',
  'number share',
  'share number',
  'send number',
  'give number',
  'your number',
  'helpline',
  'phone number',
  'mobile number',
  'बात करनी',
  'कॉल करो',
  'फोन करो',
  'कॉल कीजिए',
  'एजेंट',
  'नंबर दो',
];

export function isHandoffRequested(text: string): boolean {
  if (!text) return false;
  const lower = text.toLowerCase();
  return HANDOFF_KEYWORDS.some(kw => lower.includes(kw));
}

/**
 * Resolves the official sales contact phone for a tenant.
 * Priority:
 * 1. Connected WhatsApp session phoneNumber (Baileys)
 * 2. Tenant.whatsappConfig.phoneNumber
 * 3. Tenant.phone (business phone)
 * 4. Master Tenant's connected WhatsApp or business phone
 * 5. Environment fallback (SUPPORT_PHONE / WHATSAPP_PHONE)
 */
export async function getSalesContactPhone(tenantId?: any): Promise<string> {
  try {
    const tid = tenantId ? tenantId.toString() : 'master';
    const { getConnectionStatus } = await import('./baileysService');
    const status = getConnectionStatus(tid);
    if (status?.phoneNumber && status.phoneNumber.replace(/\D/g, '').length >= 10) {
      return status.phoneNumber;
    }

    const Tenant = (await import('../models/tenant.model')).default;
    if (tenantId) {
      const tenant = await Tenant.findById(tenantId).select('phone whatsappConfig').lean();
      if (tenant?.whatsappConfig?.phoneNumber && tenant.whatsappConfig.phoneNumber.replace(/\D/g, '').length >= 10) {
        return tenant.whatsappConfig.phoneNumber;
      }
      if (tenant?.phone && tenant.phone.replace(/\D/g, '').length >= 10) {
        return tenant.phone;
      }
    }

    // Fallback to master tenant
    const master = await Tenant.findOne({ isMaster: true }).select('phone whatsappConfig').lean();
    if (master?.whatsappConfig?.phoneNumber && master.whatsappConfig.phoneNumber.replace(/\D/g, '').length >= 10) {
      return master.whatsappConfig.phoneNumber;
    }
    if (master?.phone && master.phone.replace(/\D/g, '').length >= 10) {
      return master.phone;
    }

    const Admin = (await import('../models/admin.model')).default;
    const admin = await Admin.findOne({ role: 'super_admin' }).select('phone').lean();
    if (admin?.phone && admin.phone.replace(/\D/g, '').length >= 10) {
      return admin.phone;
    }
  } catch (err: any) {
    console.error('[SalesPhone] Error resolving sales contact phone:', err?.message || err);
  }
  return process.env.SUPPORT_PHONE || process.env.WHATSAPP_PHONE || '+91 98558 69999';
}

export function formatDisplayPhone(rawPhone: string): string {
  if (!rawPhone) return '';
  let digits = rawPhone.replace(/\D/g, '');
  if (digits.startsWith('0') && digits.length === 11) {
    digits = digits.slice(1);
  }
  if (digits.length === 10) {
    return `+91 ${digits.slice(0, 5)} ${digits.slice(5)}`;
  }
  if (digits.length === 12 && digits.startsWith('91')) {
    const main = digits.slice(2);
    return `+91 ${main.slice(0, 5)} ${main.slice(5)}`;
  }
  if (digits.length > 5) {
    return `+${digits}`;
  }
  return rawPhone.startsWith('+') ? rawPhone : `+${rawPhone}`;
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
    'site visit',
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

export type MediaRequestType = 'images' | 'videos' | 'map' | 'brochure' | 'location' | null;

export function detectMediaRequest(text: string): MediaRequestType {
  if (!text) return null;
  const lower = text.toLowerCase();

  // 1. Videos / Walkthrough
  if (/(video|walkthrough|sample flat video|site video|tour video|tour|वीडियो|विडियो|वॉकथ्रू)/i.test(lower)) {
    return 'videos';
  }

  // 2. Location Request (send location, location bhejo, location share karo, location link, location map)
  if (/(locations*(bhejo|bhej|send|share|dikhao|btao|des*do|link|map)|(send|share|give)s*(mes*)?location|locations*chahiye|exacts*locations*batao)/i.test(lower)) {
    return 'location';
  }

  // 3. Map / Master plan / Layout
  if (/(map|layout|master plan|site plan|location map|naksha|masterplan|नक्शा|मैप|मास्टर प्लान|लेआउट)/i.test(lower)) {
    return 'map';
  }

  // 4. Brochure / PDF Document
  if (/(brochure|brochur|broucher|brocher|pdf|document|e-brochure|ब्रोशर|पीडीएफ)/i.test(lower)) {
    return 'brochure';
  }

  // 5. Images / Photos
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
    veervar: 4,
    brihaspativar: 4,
    'गुरुवार': 4,
    'वीरवार': 4,
    'बृहस्पतिवार': 4,
    friday: 5,
    fri: 5,
    shukravar: 5,
    jumma: 5,
    'शुक्रवार': 5,
    'जुम्मा': 5,
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
  } else if (/parso|परसों/i.test(lower)) {
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

// Clean and format text for clean WhatsApp presentation
export function cleanWhatsAppReply(text: string): string {
  if (!text) return '';
  return text
    .replace(/^["']|["']$/g, '')
    // Strip raw server upload paths or download links to ensure native WhatsApp attachment UX
    .replace(/(?:https?:\/\/[^\s]+)?\/(?:public\/)?uploads\/[^\s)]+/gi, '')
    .replace(/\[(?:Brochure|Video|PDF|Photos?|Images?|Download|Link|Document)\]\([^\)]+\)/gi, '')
    .replace(/###\s*(.*)/g, '*$1*')
    .replace(/##\s*(.*)/g, '*$1*')
    .replace(/#\s*(.*)/g, '*$1*')
    .replace(/\*\*(.*?)\*\*/g, '*$1*')
    .replace(/\\([$#*_~])/g, '$1')
    .replace(/\n{3,}/g, '\n\n')
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
  contextNote?: string,
  enforcedLang?: DetectedLanguage
): Promise<LLMMessage[]> {
  // Fetch lead document first to get accurate phone reference and tenant context
  const leadDoc = await Lead.findById(leadId).lean();
  const tenantId = leadDoc?.tenantId || null;

  let agencyName = 'our Real Estate Advisory Team';
  if (tenantId) {
    const Tenant = (await import('../models/tenant.model')).default;
    const t = await Tenant.findById(tenantId).select('name').lean();
    if (t?.name) agencyName = t.name;
  } else {
    const Tenant = (await import('../models/tenant.model')).default;
    const master = await Tenant.findOne({ isMaster: true }).select('name').lean();
    agencyName = master?.name || 'Bhole Baba Investments';
  }

  const historyQuery: any = leadDoc?.phone
    ? { $or: [{ leadId }, { phone: leadDoc.phone }] }
    : { leadId };
  if (tenantId) {
    historyQuery.tenantId = tenantId;
  }

  const convStateQuery: any = { $or: [{ leadId }, ...(leadDoc?.phone ? [{ phone: leadDoc.phone }] : [])] };
  if (tenantId) {
    convStateQuery.tenantId = tenantId;
  }

  // Fetch recent conversation history, state, and project facts in parallel
  const [salesPhone, projectFacts, dynamicPortfolio, convState, historyDocs] = await Promise.all([
    getSalesContactPhone(tenantId),
    getProjectFacts(projectId, currentMessage),
    getDynamicPortfolioCatalogue(projectId, tenantId),
    ConversationState.findOne(convStateQuery).select('preferredLanguage').lean(),
    ConversationMessage.find(historyQuery)
      .sort({ createdAt: -1 })
      .limit(AI_HISTORY_MESSAGES)
      .lean(),
  ]);

  const formattedSalesPhone = formatDisplayPhone(salesPhone);
  const displayLeadPhone = (leadDoc?.phone || '').replace(/\D/g, '').slice(-10);

  historyDocs.reverse();

  // Deduplicate consecutive identical messages & filter looping template promises
  const sanitizedHistory: LLMMessage[] = [];
  for (const doc of historyDocs) {
    const last = sanitizedHistory[sanitizedHistory.length - 1];
    if (last && last.role === doc.role && last.content.trim().toLowerCase() === doc.content.trim().toLowerCase()) {
      continue;
    }
    if (doc.role === 'assistant' && /^sure,?\s*(i\s*can\s*send|we\s*can\s*send)/i.test(doc.content.trim())) {
      continue;
    }
    sanitizedHistory.push({
      role: doc.role as 'user' | 'assistant',
      content: doc.content,
    });
  }

  // -------------------------------------------------------------------------
  // STRICT FIRST MESSAGE RULE:
  // An interaction is a "First Message" if the assistant has sent 0 prior messages.
  // On this first turn, language MUST unconditionally be 'english'.
  // Turn 2 onwards: Follow enforcedLang -> convState -> detected language from human reply.
  // -------------------------------------------------------------------------
  const hasAssistantReplied = sanitizedHistory.some(m => m.role === 'assistant');
  let detectedLang: DetectedLanguage;

  if (!hasAssistantReplied) {
    detectedLang = 'english';
  } else if (enforcedLang) {
    detectedLang = enforcedLang;
  } else {
    detectedLang = detectLanguage(currentMessage, {
      history: sanitizedHistory,
      preferredLanguage: convState?.preferredLanguage || null,
    });
  }

  // Extract client metadata for persistent memory card
  let formName = leadDoc?.formName || '';
  if (!formName && leadDoc?.formId) {
    const fbForm = await FbForm.findOne({ formId: leadDoc.formId }).select('name').lean();
    if (fbForm?.name) formName = fbForm.name;
  }
  if (!formName) {
    formName = leadDoc?.source ? `Lead from ${leadDoc.source}` : 'Direct WhatsApp Inquiry';
  }

  const clientName = leadDoc?.fullName && !leadDoc.fullName.startsWith('WhatsApp Lead') ? leadDoc.fullName.trim() : 'Prospective Buyer';
  const knownBudget = leadDoc?.whatIsYourBudget || leadDoc?.extraFields?.budgetRaw || '';
  const knownBhk = leadDoc?.extraFields?.bhkPreference || leadDoc?.extraFields?.preferredUnit || '';
  const knownPurpose = leadDoc?.extraFields?.purpose || '';
  const knownTimeline = leadDoc?.whenAreYouPlanningToPurchase || '';
  const knownLocation = leadDoc?.extraFields?.preferredLocation || leadDoc?.extraFields?.sharedLocation || '';

  const extraFieldsSummary =
    leadDoc?.extraFields && typeof leadDoc.extraFields === 'object' && Object.keys(leadDoc.extraFields).length > 0
      ? Object.entries(leadDoc.extraFields)
          .filter(([k]) => !['bhkPreference', 'preferredUnit', 'budgetRaw', 'purpose', 'preferredLocation', 'sharedLocation', 'sharedLocationUrl'].includes(k))
          .map(([k, v]) => `${k}: ${v}`)
          .join(', ')
      : '';

  const systemPrompt = `You are an elite, consultative Senior Real Estate Property Advisor assisting home buyers on WhatsApp.
You represent our real estate firm "${agencyName}".
Your mission is to provide deeply satisfying, accurate, consultative, and direct answers just like ChatGPT/OpenAI, strictly grounded in the database facts provided below.

🔒 STRICT FIRM BOUNDARY & TENANT ISOLATION:
- You work exclusively for "${agencyName}".
- Under NO circumstance should you ever mention, recommend, or leak details about any real estate firm or property not explicitly listed in PRIMARY PROPERTY or OUR OTHER ACTIVE PROJECTS below.
- If the buyer asks about any other firm, agency, or external property, state that you represent "${agencyName}" and offer assistance with our verified projects.

📞 OFFICIAL SALES TEAM & ADVISORY CONTACT:
- Official Sales Team Helpline / Direct Phone: ${formattedSalesPhone}
- Connected WhatsApp Channel: This official WhatsApp chat (${formattedSalesPhone})
- CRITICAL RULES REGARDING CONTACT NUMBERS:
  1. Whenever the client asks for our contact number, sales team number, calling number, office phone, or asks how to call or reach us, ALWAYS provide our official sales team phone number: ${formattedSalesPhone}.
  2. ABSOLUTE PROHIBITION: NEVER quote or give the client's own phone number as our sales team or office number! The client's registered phone number (${displayLeadPhone || 'buyer phone'}) belongs strictly to the client, NOT to our sales team.

--------------------------------------------------
🎯 CORE BEHAVIOR & CONVERSATIONAL FLOW RULES:
--------------------------------------------------
1. 💡 ANSWER THE USER'S SPECIFIC QUESTION FIRST & DIRECTLY:
   - When the user asks a specific question (e.g. "is it gated?", "price kitna hai?", "where is it located?", "road size?", "possession kab milega?"), give the direct, precise factual answer in the VERY FIRST sentence.
   - Never evade the question, and never recite introductory boilerplate before answering what they asked.
   - Use the PRIMARY PROPERTY database facts below for all numbers, prices, sizes, amenities, and dates.

2. ⏱️ CONVERSATION PACING & BREVITY (CRISP WHATSAPP FORMAT):
   - Keep replies scannable, punchy, and concise (3 to 6 sentences maximum, or clean bullet points).
   - Never overwhelm the buyer with massive walls of text on WhatsApp.

3. 🎯 STRICT ONE-QUESTION RULE:
   - NEVER ask more than ONE single question per message!
   - Bombarding buyers with multiple questions (e.g. asking budget, BHK, and timeline all at once) overwhelms them and destroys response rates.
   - Choose the single most relevant next consultative question to guide the conversation forward.

4. 🔒 MANDATORY LANGUAGE POLICY (DYNAMIC SENTENCE ADAPTATION):
   - Current Reply Language: [ *** ${detectedLang.toUpperCase()} *** ]
${
  detectedLang === 'english'
    ? `   * 🇬🇧 STRICT PROFESSIONAL ENGLISH INSTRUCTION:
      ${!hasAssistantReplied ? '- FIRST MESSAGE DIRECTIVE: This is our very FIRST message to the client. You MUST respond 100% in fluent, polished, elite professional English, even if the user\'s inquiry was in Hindi or Hinglish.' : '- The user is communicating in ENGLISH. You MUST reply 100% in fluent, polished, elite professional English.'}
      - NEVER use Hindi or Hinglish words (NO "ji", "haan", "bhai", "aap", "karein", "hain", etc.).
      - Maintain the standard of a premier international property advisory consultant.`
    : detectedLang === 'hinglish'
    ? `   * 🇮🇳 RESPECTFUL HINGLISH INSTRUCTION:
      - The user has explicitly asked a full sentence or distinct query in HINGLISH.
      - Reply in warm, natural, respectful Hinglish using the English/Roman alphabet (e.g. "Yeh project prime location Sector 150 par situated hai aur yahan 24/7 security, clubhouse aur swimming pool jaisi top amenities milti hain...").
      - Keep technical property terminology in English (e.g., "site visit", "clubhouse", "swimming pool", "floor plan", "down payment", "brochure").
      - Always remain polite, helpful, and consultative.`
    : `   * 🪔 STRICT HINDI (DEVANAGARI) INSTRUCTION:
      - The user is communicating in HINDI. You MUST reply 100% in respectful, clear Hindi Devanagari script.`
}

5. 🚫 STRICT NO-MEDIA-LINKS DIRECTIVE (EXACT NATIVE ATTACHMENTS ONLY):
   - Whenever the client asks for photos, images, video walkthrough, master plan layout, or brochure PDF:
     * The actual native media file (Photos, Video, PDF Document) is dispatched directly to their WhatsApp chat automatically by our system.
     * ABSOLUTE PROHIBITION: NEVER write or output raw file links, server URLs, download links, or markdown links (NO "http://...", NO ".pdf links", NO ".mp4 links", NO "click here to download", NO "/public/uploads/...")!
     * Instead, acknowledge naturally:
       "I have shared the official project brochure PDF right above in this chat 📑", OR
       "I have sent the HD video walkthrough right above in this chat 🎥", OR
       "I have shared the site photos right above in this chat 📸".
     * Only verified Google Maps navigation URLs (for site visit directions) are permitted in text. All other media MUST remain native WhatsApp media attachments for premium user experience.

--------------------------------------------------
🛡️ OBJECTION HANDLING & SALES CLOSING MATRIX:
--------------------------------------------------
1. PRICE / BUDGET OBJECTIONS ("too expensive", "budget issue", "sasta chahiye", "kam rate", "over budget"):
   - Highlight High Value & Growth: Explain why the project commands this rate (prime connectivity, luxury amenities, top developer quality, high appreciation corridor).
   - Flexible Financial Structures: Highlight Construction-Linked Payment (CLP) plans, easy staggered milestones, and tie-ups with leading nationalized banks (SBI, HDFC, ICICI) with attractive EMI options.
   - Sister Project Cross-Sell: If the buyer's budget is strictly lower than this project's starting price, consultatively introduce an ideal alternative from OUR OTHER ACTIVE PROJECTS below that fits their budget.
2. LOCATION / DISTANCE OBJECTIONS ("bahut door hai", "too far", "outskirts", "location issue"):
   - Express Connectivity: Focus on driving time rather than kilometers (e.g. "Only 15-20 minutes via the Expressway / Metro corridor").
   - Growth Corridor ROI: Point out that buying early in high-speed infrastructure corridors offers the highest capital appreciation before rates multiply.
3. RERA / BUILDER TRUST / LEGALITY ("is it legal?", "RERA approved?", "builder kaisa hai?"):
   - Trust Anchor: Immediately quote the exact RERA Registration Number from PRIMARY PROPERTY facts.
   - Bank Approvals: Mention approval from leading banks (SBI/HDFC), complete clear land title, and zero legal ambiguity.
4. POSSESSION / CONSTRUCTION TIMELINE ("possession kab milega?", "construction slow to nahi?"):
   - Quote the verified possession date from PRIMARY PROPERTY facts.
   - Offer to share recent construction progress photos or an HD video walkthrough.
5. SOFT SALES CLOSING (MICRO-COMMITMENT CTAs):
   - Never push aggressively. Use low-friction binary choice closing:
     * "Would you like me to share a quick 1-minute video walkthrough, or are you free for a site visit this Saturday?"
     * "Does Saturday or Sunday morning work better for a quick 20-minute site walkthrough?"

--------------------------------------------------
📋 DELIVERING PROPERTY DETAILS / OVERVIEW / "BHEJO":
--------------------------------------------------
- If the user asks for property details, brochure, overview, or says "send details" / "details bhejo" / "bhejo" / "give details" / "tell me more", IMMEDIATELY provide the complete structured facts right in this reply using clean WhatsApp bullet points:
  * 🏡 *Project:* [Project Name]
  * 📍 *Location:* [Location & Connectivity]
  * 🗺️ *Google Maps:* [Include LOCATION MAP LINK if available in DB facts]
  * 💰 *Pricing:* [Starting Price / Price Range]
  * 📐 *Configurations & Sizes:* [Unit types, BHKs, sq.ft. from DB]
  * ✨ *Key Amenities:* [Top amenities from DB]
  * 📅 *Possession:* [Possession timeline]
  * 🏛️ *RERA:* [RERA Number if available]
- NEVER make empty promises like "Sure, I can send you details" without providing the details right in the message!

--------------------------------------------------
🚫 NO ROBOTIC REPETITION OR SCRIPT LOOPS:
--------------------------------------------------
- Do NOT introduce the firm name "${agencyName}" in every single message. Mention it naturally on the first greeting or when asked.
- Do NOT keep asking the exact same closing question (e.g., "Are you looking for self-use or investment?") on every turn if it was already asked or answered in the chat history.
- Guide the customer forward naturally (e.g. offering a walkthrough video, layout map, or scheduling a site visit for Saturday or Sunday).

--------------------------------------------------
💎 ZERO-HALLUCINATION / 100% FACTUAL GROUNDING:
--------------------------------------------------
- All rates, sizes, possession dates, and amenities MUST strictly come from the PRIMARY PROPERTY facts below.
- If a specific piece of information is NOT in the database (e.g., specific floor availability or custom discounts), politely state that our site manager will confirm that detail.

--------------------------------------------------
CLIENT MEMORY CARD (PERSISTENT CLIENT CONTEXT):
--------------------------------------------------
- Client Name: ${clientName}
- Known Target Budget: ${knownBudget || 'Not specified yet'}
- Preferred BHK / Size: ${knownBhk || 'Not specified yet'}
- Buying Purpose: ${knownPurpose || 'Not specified yet (Self-Use vs Investment)'}
- Purchase Timeline: ${knownTimeline || 'Not specified yet'}
- Preferred Location / Landmark: ${knownLocation || 'Not specified yet'}
- Inquiry Origin / Campaign: "${formName}"
${extraFieldsSummary ? `- Additional Form Details: ${extraFieldsSummary}` : ''}
${contextNote ? `- Live Factual Action Hint: ${contextNote}` : ''}
--------------------------------------------------
CRITICAL RULES FOR CLIENT MEMORY:
1. NEVER re-ask for any information already known in the CLIENT MEMORY CARD above! (e.g. if Budget is already known, do not ask "What is your budget?").
2. Use known preferences to personalize recommendations (e.g. reference their preferred BHK or budget range).
3. If a detail is missing (e.g. Purpose: Self-Use vs Investment is unknown), you may explore it naturally when appropriate using the One-Question Rule.

--------------------------------------------------
PRIMARY PROPERTY (DATABASE FACTS):
--------------------------------------------------
${projectFacts || 'Project details are on file. Assist the buyer with configurations, pricing, and site visits.'}

--------------------------------------------------
OUR OTHER ACTIVE PROJECTS (FOR PORTFOLIO / CROSS-SELLING):
--------------------------------------------------
${dynamicPortfolio}`;

  const messages: LLMMessage[] = [{ role: 'system', content: systemPrompt }];
  messages.push(...sanitizedHistory);
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
  // 1. Retrieve conversation history & state to ensure strict language continuity and firm isolation
  const tenantId = lead.tenantId || null;
  let agencyName = 'our Real Estate Advisory Team';
  if (tenantId) {
    const Tenant = (await import('../models/tenant.model')).default;
    const t = await Tenant.findById(tenantId).select('name').lean();
    if (t?.name) agencyName = t.name;
  } else {
    const Tenant = (await import('../models/tenant.model')).default;
    const master = await Tenant.findOne({ isMaster: true }).select('name').lean();
    agencyName = master?.name || 'Bhole Baba Investments';
  }

  const convFilter: any = { $or: [{ leadId: lead._id }, { phone }] };
  if (tenantId) convFilter.tenantId = tenantId;

  const [convState, recentMessages] = await Promise.all([
    ConversationState.findOne(convFilter).select('preferredLanguage').lean(),
    ConversationMessage.find(convFilter).sort({ createdAt: -1 }).limit(10).lean(),
  ]);

  // Determine if the assistant has EVER replied before in this conversation
  const hasAssistantReplied = (recentMessages || []).some(m => m.role === 'assistant');
  const isFirstTurn = !hasAssistantReplied;

  // -------------------------------------------------------------------------
  // Strict First Message Rule: First message sent by the bot is ALWAYS 100% pure professional English!
  // Subsequent turns: Human's reply determines the language (English/Hinglish/Hindi).
  // -------------------------------------------------------------------------
  let lang: DetectedLanguage;
  if (isFirstTurn) {
    lang = 'english';
  } else {
    lang = detectLanguage(text, {
      history: recentMessages ? ([...recentMessages].reverse() as any) : [],
      preferredLanguage: convState?.preferredLanguage || null,
    });
  }

  // 2. Extract and profile lead preferences (budget, unit, timeline, purpose) from message
  const profiled = await extractAndSaveLeadPreferences(lead._id, text).catch(() => ({}));
  const currentLead = (await Lead.findById(lead._id).lean()) || lead;

  let projectDoc: any = null;
  let targetProjectId: Types.ObjectId = projectId;
  if (projectId) {
    projectDoc = await Project.findById(projectId).lean();
  }

  // 3. Context & Background Action Placeholders (Side-effects run in background without overriding LLM)
  let sharedLocationNote = '';
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

  // ── S. SHARED LOCATION PIN DETECTION (Customer sends location on WhatsApp) ──
  if (/\[Shared (?:Live )?Location:/i.test(text)) {
    detectedIntent = 'shared_location';
    sharedLocationNote = `USER ACTION COMPLETED: The customer has shared their pinned or live location on WhatsApp (${text}).
INSTRUCTION FOR AI: Thank the customer warmly for sharing their location. Let them know our property advisory team at ${agencyName} has received it. Clearly explain the route and accessibility to our project "${projectDoc?.name || 'our project'}" located at "${projectDoc?.location || 'our site'}", and consultatively offer to schedule a private site visit this weekend. Keep your response strictly grounded in [ ${lang.toUpperCase()} ].`;
  }

  // ── A. SITE VISIT DETECTION & ENGINE ──
  if (isSiteVisitIntent(text)) {
    detectedIntent = 'site_visit';
    const slot = parseSlotDateTime(text);

    if (slot) {
      detectedIntent = 'site_visit_confirmed';
      const visitMessage = `Site Visit Booked via WhatsApp for ${projectDoc?.name || 'Property'}`;

      // Update Lead DB
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

      // Google Calendar Integration (Background)
      try {
        let refreshToken: string | null = null;
        if (lead.tenantId) {
          const Tenant = (await import('../models/tenant.model')).default;
          const tenant = await Tenant.findById(lead.tenantId).lean();
          if (tenant?.googleConfig?.isConnected && tenant.googleConfig?.refreshToken) {
            refreshToken = tenant.googleConfig.refreshToken;
          }
        }

        if (!refreshToken) {
          const Admin = (await import('../models/admin.model')).default;
          const admin = await Admin.findOne({
            'googleCalendar.isConnected': true,
            'googleCalendar.refreshToken': { $exists: true, $ne: '' },
          });
          refreshToken = admin?.googleCalendar?.refreshToken || null;
        }

        if (refreshToken) {
          const { createCalendarEvent } = await import('./googleCalendar.service');
          const updatedLead = await Lead.findById(lead._id);
          const calEvent = await createCalendarEvent(refreshToken, updatedLead);
          if (calEvent?.id) {
            await Lead.findByIdAndUpdate(lead._id, { $set: { 'followUp.googleEventId': calEvent.id } });
          }
        }
      } catch (calErr: any) {
        console.warn('[Site Visit] Google Calendar sync warning:', calErr?.message || calErr);
      }

      // Dual Support Email Notification (Background)
      sendSupportAlert({
        subject: `🏠 New Site Visit Booked: ${currentLead.fullName || 'Lead'} • ${slot.formattedSlot}`,
        badge: '🏠 Site Visit Booked',
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
    } else {
      detectedIntent = 'site_visit_inquiry';
      siteVisitNote = `USER INTENT: The buyer wants to schedule a site visit for "${projectDoc?.name || 'our property'}", but has not mentioned a specific date or time.
INSTRUCTION FOR AI: Warmly welcome their visit interest. Consultatively ask whether Saturday or Sunday works best for their schedule, and whether Morning (11:00 AM) or Evening (4:00 PM) is preferred.`;
    }
  }

  // ── B. MEDIA DISPATCH ENGINE (Background delivery of Photos/Videos/Map) ──
  const mediaReq = detectMediaRequest(text);
  if (mediaReq && projectDoc) {
    detectedIntent = `media_${mediaReq}`;

    if (mediaReq === 'images') {
      const images: string[] = Array.isArray(projectDoc.images) ? projectDoc.images.filter(Boolean) : [];
      if (images.length > 0) {
        for (let i = 0; i < Math.min(images.length, 3); i++) {
          const caption = i === 0 ? `📸 *${projectDoc.name}* • Site & Project Photo` : undefined;
          await sendMedia(phone, images[i], caption, tenantId ? tenantId.toString() : undefined).catch(err => console.error('[Media] Photo send error:', err?.message || err));
        }
        mediaNote = `SYSTEM ACTION COMPLETED: We have dispatched ${Math.min(images.length, 3)} site and project photos of "${projectDoc.name}" directly as native WhatsApp photo attachments above.
CRITICAL INSTRUCTION FOR AI: Dynamically acknowledge that the photos have been sent directly above in this chat. DO NOT print, provide, or write any image links or URLs! Highlight the quality construction/layout, and consultatively ask if they would like to schedule a private site visit to tour the property in person.`;
      } else {
        mediaNote = `NOTE: The buyer requested photos of "${projectDoc.name}", but new site photos are being prepared by the site team.
INSTRUCTION FOR AI: Politely reassure the buyer that our team will share the updated photo gallery directly on WhatsApp shortly. DO NOT output any image links or broken URLs, and invite them to schedule a personal site visit in the meantime.`;
      }
    } else if (mediaReq === 'videos') {
      const videos: string[] = Array.isArray(projectDoc.videos) ? projectDoc.videos.filter(Boolean) : [];
      if (videos.length > 0) {
        await sendMedia(phone, videos[0], `🎥 *${projectDoc.name}* • Video Walkthrough`, tenantId ? tenantId.toString() : undefined).catch(err => console.error('[Media] Video send error:', err?.message || err));
        mediaNote = `SYSTEM ACTION COMPLETED: We have dispatched the video walkthrough file for "${projectDoc.name}" directly to their WhatsApp as a native video attachment above.
CRITICAL INSTRUCTION FOR AI: Dynamically mention that the video walkthrough has been delivered right above in this chat. DO NOT print, output, or send any video URLs, YouTube links, or download links! Consultatively ask if they would like to schedule a private site visit to see the project live.`;
      } else {
        mediaNote = `NOTE: The buyer requested a video walkthrough for "${projectDoc.name}", but the walkthrough video is currently being updated.
INSTRUCTION FOR AI: Inform them politely that our team will send the video walkthrough directly on WhatsApp shortly. DO NOT write or provide any video links or URLs.`;
      }
    } else if (mediaReq === 'map' || mediaReq === 'location') {
      const mapsSearchUrl = projectDoc.locationUrl || `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${projectDoc.name} ${projectDoc.location || ''}`.trim())}`;
      if (projectDoc.map && projectDoc.map.trim()) {
        const isUrlLink = projectDoc.map.startsWith('http') && (projectDoc.map.includes('maps.google') || projectDoc.map.includes('goo.gl') || projectDoc.map.includes('maps.app'));
        if (!isUrlLink) {
          await sendMedia(phone, projectDoc.map.trim(), `🗺️ *${projectDoc.name}* • Approved Master Plan & Layout Map`, tenantId ? tenantId.toString() : undefined).catch(err => console.error('[Media] Map send error:', err?.message || err));
        }
        mediaNote = `SYSTEM ACTION COMPLETED: We have dispatched the layout map file for "${projectDoc.name}" directly to their WhatsApp as an attachment. Exact location is "${projectDoc.location || 'prime area'}" with Google Maps link: ${mapsSearchUrl}.
INSTRUCTION FOR AI: Dynamically acknowledge the layout map shared above, provide the Google Maps navigation link (${mapsSearchUrl}), and consultatively ask which unit or plot size they would like to explore or if they'd like to plan a site visit.`;
      } else {
        mediaNote = `SYSTEM ACTION COMPLETED: Project location is at "${projectDoc.location || 'prime area'}" with Google Maps link: ${mapsSearchUrl}.
INSTRUCTION FOR AI: Clearly provide the exact location address and the Google Maps navigation link (${mapsSearchUrl}) right in your response, and consultatively invite them to schedule a personal site visit this weekend.`;
      }
    } else if (mediaReq === 'brochure') {
      if (projectDoc.brochure && projectDoc.brochure.trim()) {
        await sendMedia(phone, projectDoc.brochure.trim(), `📑 *${projectDoc.name}* • Official Project Brochure`, tenantId ? tenantId.toString() : undefined).catch(err => console.error('[Media] Brochure send error:', err?.message || err));
        mediaNote = `SYSTEM ACTION COMPLETED: We have dispatched the official project brochure PDF for "${projectDoc.name}" directly to their WhatsApp as a native PDF document attachment.
CRITICAL INSTRUCTION FOR AI: Dynamically mention that the official brochure PDF has been sent directly above in this chat. DO NOT print, provide, or write any brochure download links, file URLs, or markdown links! Highlight the project's standout features and consultatively invite them to schedule a personal site visit.`;
      } else {
        mediaNote = `NOTE: The buyer requested the project brochure for "${projectDoc.name}", but the PDF brochure is currently being updated.
INSTRUCTION FOR AI: Inform them that our team will send the detailed PDF brochure directly on WhatsApp shortly. DO NOT output or invent any brochure links or URLs.`;
      }
    }
  }

  // ── C. HUMAN AGENT / CALL REQUEST (Handoff / Callback) ──
  if (isHandoffRequested(text)) {
    detectedIntent = 'agent_handoff';
    needsAgent = true;
    aiPaused = false; // Do NOT freeze AI! Keep assistant active so other questions are not silently dropped.

    sendSupportAlert({
      subject: `🚨 Callback/Contact Requested: ${currentLead.fullName || 'Lead'}`,
      badge: '📞 Contact / Callback',
      title: 'Lead Requested Contact or Callback',
      lead: currentLead,
      project: projectDoc,
      details: {
        'Customer Message': text,
        'Phone': currentLead.phone || phone || '—',
        'Project of Interest': projectDoc?.name || 'Primary Property',
        'Budget': currentLead.whatIsYourBudget || 'Not specified',
      },
      ctaText: 'Open Lead & Call Customer →',
    }).catch(err => console.error('[Handoff] Support alert warning:', err?.message || err));

    const salesPhone = await getSalesContactPhone(tenantId);
    const formattedSalesPhone = formatDisplayPhone(salesPhone);
    const displayLeadPhone = (currentLead.phone || phone || '').replace(/\D/g, '').slice(-10);
    const isDirectNumberQuery = isContactNumberRequest(text);

    let callbackReply = '';
    if (isDirectNumberQuery) {
      if (lang === 'english') {
        callbackReply = `Certainly! You can connect with our Sales & Property Advisory Team directly at *${formattedSalesPhone}* (or continue chatting right here on this WhatsApp number).

Our Senior Advisor at *${agencyName}* is also available to assist you with complete details, brochures, and private site visits. Feel free to ask any questions! 🏡`;
      } else if (lang === 'hindi') {
        callbackReply = `जी बिल्कुल! आप हमारी सेल्स और प्रॉपर्टी एडवाइजरी टीम से सीधे *${formattedSalesPhone}* पर संपर्क कर सकते हैं (या इसी व्हाट्सएप नंबर पर चैट जारी रख सकते हैं)।

*${agencyName}* के हमारे सीनियर एडवाइजर प्रोजेक्ट डिटेल्स और साइट विजिट के लिए भी उपलब्ध हैं। आप बेझिझक कोई भी सवाल पूछ सकते हैं! 🏡`;
      } else {
        callbackReply = `Ji bilkul! Aap hamari Sales & Advisory Team se directly *${formattedSalesPhone}* par call ya WhatsApp par connect kar sakte hain (ya isi chat par baat continue kar sakte hain).

*${agencyName}* ke hamare Senior Property Advisor complete project details, brochures aur site visit ke liye available hain. Aap pricing ya layout ko lekar koi bhi sawaal yahan puch sakte hain! 🏡`;
      }
    } else {
      if (lang === 'english') {
        callbackReply = `Certainly! I have registered your callback request with our Senior Property Advisor at *${agencyName}*.

📞 Our advisor will call you shortly on your registered number${displayLeadPhone ? ` (${displayLeadPhone})` : ''}.

You can also reach our Sales Team directly at *${formattedSalesPhone}* (or message us here anytime). In the meantime, feel free to ask if you have any questions regarding pricing, location, or available layouts! 🏡`;
      } else if (lang === 'hindi') {
        callbackReply = `जी बिल्कुल! मैंने आपका कॉलबैक अनुरोध *${agencyName}* के सीनियर एडवाइजर को भेज दिया है।

📞 हमारे एडवाइजर जल्द ही आपके नंबर${displayLeadPhone ? ` (${displayLeadPhone})` : ''} पर कॉल करेंगे।

आप सीधे हमारी सेल्स टीम से *${formattedSalesPhone}* पर भी संपर्क कर सकते हैं। इस दौरान यदि आपका कोई भी सवाल हो, तो आप यहाँ पूछ सकते हैं! 🏡`;
      } else {
        callbackReply = `Ji bilkul! Maine aapka callback request hamare Senior Property Advisor (*${agencyName}*) ko forward kar diya hai.

📞 Hamare advisor jald hi aapse aapke number${displayLeadPhone ? ` (${displayLeadPhone})` : ''} par call par connect karenge.

Aap hamari Sales Team se directly *${formattedSalesPhone}* par bhi connect kar sakte hain. Is dauran agar aapka pricing ya flat layouts ko lekar koi bhi sawaal ho, toh aap freely puch sakte hain! 🏡`;
      }
    }

    // Persist conversation message with strict tenant isolation
    await ConversationMessage.create([
      { tenantId: tenantId || null, leadId: lead._id, phone, role: 'user', content: text, createdAt: new Date() },
      { tenantId: tenantId || null, leadId: lead._id, phone, role: 'assistant', content: callbackReply, createdAt: new Date() },
    ]);

    // Persist conversation state with needsAgent: true, aiPaused: false
    await ConversationState.findOneAndUpdate(
      tenantId ? { tenantId, $or: [{ phone }, { leadId: lead._id }] } : { $or: [{ phone }, { leadId: lead._id }] },
      {
        $setOnInsert: { currentStep: 'AI_CHAT', startedAt: new Date(), tenantId: tenantId || null },
        $set: {
          phone,
          lastMessageFromUser: text,
          lastMessageAt: new Date(),
          lastActiveAt: new Date(),
          activeProjectId: targetProjectId,
          needsAgent: true,
          aiPaused: false,
          ...((!isFirstTurn && lang) ? { preferredLanguage: lang } : {}),
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
      detectedIntent,
      projectId: targetProjectId,
      projectName: projectDoc?.name || agencyName,
      userMessage: text,
      aiResponse: callbackReply,
      source: 'whatsapp',
    }).catch(() => {});

    return { reply: callbackReply, needsAgent: true, aiPaused: false };
  }

  // ── D. PROJECT SELECTION MATCHING ──
  let activeProjects = await Project.find(tenantId ? { tenantId, isActive: true } : { isActive: true }).lean();
  if (activeProjects.length === 0) {
    activeProjects = await Project.find(tenantId ? { tenantId } : {}).lean();
  }
  targetProjectId = targetProjectId || projectId;

  const selectedProj = matchProjectFromSelection(text, activeProjects);
  let projectSelectionNote = '';

  if (selectedProj) {
    targetProjectId = selectedProj._id as any;
    projectDoc = selectedProj;
    detectedIntent = 'project_selection';
    projectSelectionNote = `USER SELECTION: The buyer selected "${selectedProj.name}". Focus this response on "${selectedProj.name}" (Location: ${selectedProj.location || 'prime area'}, Starting Price: ${selectedProj.priceRange || 'market price'}). Dynamically highlight its features and ask what they would like to explore next.`;
  } else if (targetProjectId) {
    if (!projectDoc) {
      projectDoc = await Project.findById(targetProjectId).lean();
    }
  }

  if (!projectDoc && activeProjects.length > 0) {
    projectDoc = activeProjects[0];
    targetProjectId = projectDoc._id as any;
  }

  // ── E. PROPERTY DETAILS / PORTFOLIO QUERY ──
  const isDetailsQuery =
    isPropertyDetailsQuery(text) ||
    /(send\s+me|send\s+details|send\s+info|bhejo|share\s+details|share\s+info|share\s+brochure|tell\s+me\s+details|give\s+details|details\s+de\s+do|details\s+batao|overview|information)/i.test(text);

  if (isDetailsQuery) {
    detectedIntent = 'property_details';
    const askingAllProjects =
      activeProjects.length > 1 &&
      /(all\s*projects|kya\s*(kya)?\s*project|options|list|kaun\s*se\s*project|konsa\s*project|what\s*projects|which\s*projects)/i.test(text);

    if (askingAllProjects) {
      detailsNote = `USER INQUIRY: The buyer is asking about available projects / options across our portfolio.
INSTRUCTION FOR AI: Clearly present all our active projects from the portfolio catalogue below (Project Names, Prime Locations, Starting Prices), and consultatively ask which one they would like to explore or visit!`;
    } else {
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

  // ── F. GREETINGS CHECK (DYNAMIC FROM ADMIN SETTINGS IN DB) ──
  const isGreeting = /^(hello|hi|hey|hii|helo|hlo|namaste|good morning|good afternoon|good evening|hello sir|hi sir|hey sir|hello ji|hi ji|greetings|start)(\s+.*)?$/i.test(text.toLowerCase().trim());
  if (isGreeting && !isDetailsQuery && !siteVisitNote && !mediaNote && !handoffNote) {
    detectedIntent = 'greeting';
    const { getResolvedDefaultMessage } = await import('../utils/messageTemplates');
    const dynamicGreeting = await getResolvedDefaultMessage({ ...currentLead, projectId: targetProjectId, project: projectDoc });

    // If bare opening greeting on first turn, directly deliver the admin's exact configured welcome message!
    const isBareGreeting = /^(hello|hi|hey|hii|helo|hlo|namaste|good\s+morning|good\s+afternoon|good\s+evening|greetings|start)(\s+(sir|ji|mam|team|bro|bhaiya|bhai))?$/i.test(text.trim());
    if (isBareGreeting && isFirstTurn && dynamicGreeting && dynamicGreeting.trim()) {
      const cleanReply = dynamicGreeting.trim();
      await ConversationMessage.create([
        { tenantId: tenantId || null, leadId: lead._id, phone, role: 'user', content: text, createdAt: new Date() },
        { tenantId: tenantId || null, leadId: lead._id, phone, role: 'assistant', content: cleanReply, createdAt: new Date() },
      ]);

      await ConversationState.findOneAndUpdate(
        tenantId ? { tenantId, $or: [{ phone }, { leadId: lead._id }] } : { $or: [{ phone }, { leadId: lead._id }] },
        {
          $setOnInsert: { currentStep: 'AI_CHAT', startedAt: new Date(), tenantId: tenantId || null },
          $set: {
            phone,
            lastMessageFromUser: text,
            lastMessageAt: new Date(),
            lastActiveAt: new Date(),
            activeProjectId: targetProjectId,
            needsAgent,
            aiPaused,
          },
          $inc: { attemptCount: 1 },
        },
        { upsert: true, new: true }
      );

      return { reply: cleanReply, needsAgent, aiPaused };
    }

    if (dynamicGreeting && dynamicGreeting.trim()) {
      greetingNote = `USER GREETING / INITIAL CONTACT: The user sent an opening greeting ("${text}").
ADMIN CONFIGURED FIRST WELCOME MESSAGE (FROM DATABASE): "${dynamicGreeting.trim()}".
INSTRUCTION FOR AI: The FIRST message to the customer MUST ALWAYS BE IN 100% POLISHED, PROFESSIONAL ENGLISH (No Hinglish or Hindi words). Deliver or warmly incorporate this exact admin-configured greeting into your response and ask how you can assist them today with our projects, pricing, location, or scheduling a site visit.`;
    } else {
      greetingNote = `USER GREETING / INITIAL CONTACT: The user sent an opening greeting ("${text}").
INSTRUCTION FOR AI: The FIRST message to the customer MUST ALWAYS BE IN 100% POLISHED, PROFESSIONAL ENGLISH (No Hinglish or Hindi words). Warmly welcome them to ${agencyName}, introduce yourself as their Senior Property Advisor, and consultatively ask how you can assist them today (exploring projects, latest pricing, location, available plot/flat sizes, or scheduling a site visit).`;
    }
  }

  // ── G. FAQ FACTUAL HINT (Used as knowledge context, NEVER as hardcoded static return) ──
  if (projectDoc && !isDetailsQuery && !isGreeting && !siteVisitNote && !mediaNote && !handoffNote) {
    const rawDirect = findDirectFaqAnswer(projectDoc, text);
    if (rawDirect && rawDirect.trim()) {
      faqHintNote = `DATABASE FACT FROM FAQ: "${rawDirect}". Synthesize and express this verified fact naturally, accurately, and consultatively in your dynamic response.`;
    }
  }

  // ── H. CROSS-SELLING BUDGET ENGINE ──
  const statedBudget = currentLead.whatIsYourBudget || text;
  const isAskingCheaper = /sasta|saste|budget kam|lower budget|affordable|cheap|less price|kam rate/i.test(text);
  if (statedBudget || isAskingCheaper) {
    const crossProj = await findCrossSellProject(targetProjectId, statedBudget, tenantId);
    if (crossProj) {
      crossSellNote = `CROSS-SELLING RECOMMENDATION: The buyer asked for affordable / lower budget options. Introduce "${crossProj.name}" at "${crossProj.location}" (starting from ${crossProj.priceRange}) as an ideal match, highlighting why it offers outstanding value.`;
    }
  }

  // ── 5. ASSEMBLE COMPLETE CONTEXT NOTES ──
  const contextParts: string[] = [];
  if (contextNote) contextParts.push(contextNote);
  if (sharedLocationNote) contextParts.push(sharedLocationNote);
  if (projectSelectionNote) contextParts.push(projectSelectionNote);
  if (siteVisitNote) contextParts.push(siteVisitNote);
  if (mediaNote) contextParts.push(mediaNote);
  if (handoffNote) contextParts.push(handoffNote);
  if (detailsNote) contextParts.push(detailsNote);
  if (greetingNote) contextParts.push(greetingNote);
  if (crossSellNote) contextParts.push(crossSellNote);
  if (faqHintNote) contextParts.push(faqHintNote);

  const fullContextNote = contextParts.join('\n\n');

  // ── 6. DYNAMIC AI GENERATION GROUNDED IN DATABASE FACTS ──
  const smartFallback = buildIntelligentRealEstateResponse(projectDoc, text, lang, activeProjects, agencyName);
  const messages = await buildMessages(lead._id, targetProjectId, text, fullContextNote, lang);

  const rawReply = await askLLMSafe(messages, smartFallback);
  let reply = cleanWhatsAppReply(rawReply);

  // Cap maximum reply length
  if (reply.length > AI_MAX_REPLY_CHARS) {
    reply = reply.slice(0, AI_MAX_REPLY_CHARS - 3).trim() + '...';
  }

  // ── 7. PERSIST CONVERSATION & STATE (TENANT ISOLATED) ──
  await ConversationMessage.create([
    { tenantId: tenantId || null, leadId: lead._id, phone, role: 'user', content: text, createdAt: new Date() },
    { tenantId: tenantId || null, leadId: lead._id, phone, role: 'assistant', content: reply, createdAt: new Date() },
  ]);

  const stateUpdates: Record<string, any> = {
    lastMessageFromUser: text,
    lastMessageAt: new Date(),
    lastActiveAt: new Date(),
    activeProjectId: targetProjectId,
    needsAgent,
    aiPaused,
  };

  // Only lock preferredLanguage AFTER the first turn (Turn 2 onwards) when the user has responded to our initial message:
  if (!isFirstTurn && lang) {
    stateUpdates.preferredLanguage = lang;
  }

  await ConversationState.findOneAndUpdate(
    tenantId ? { tenantId, $or: [{ phone }, { leadId: lead._id }] } : { $or: [{ phone }, { leadId: lead._id }] },
    {
      $setOnInsert: { currentStep: 'AI_CHAT', startedAt: new Date(), tenantId: tenantId || null },
      $set: { ...stateUpdates, phone },
      $inc: { attemptCount: 1 },
    },
    { upsert: true, new: true }
  );

  await persistLeadInterest(lead._id, 'hot', { status: 'interested' });

  // ── 8. LOG FOR CONTINUOUS MODEL TRAINING (llm.sharesampatti.com) ──
  logConversationForTraining({
    leadId: lead._id,
    phone,
    language: lang,
    detectedIntent,
    projectId: targetProjectId,
    projectName: projectDoc?.name || agencyName,
    userMessage: text,
    aiResponse: reply,
    source: 'whatsapp',
  }).catch(() => {});

  // ── 9. AUTO-LEARNING TRIGGER ──
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
    recordLearnedQuestion(targetProjectId, text, lead._id).catch(() => {});
  }

  return { reply, needsAgent, aiPaused };
}
