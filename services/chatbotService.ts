import ConversationState, { ConversationStateDoc } from '../models/conversationState.model';
import Campaign from '../models/campaign.model';
import BotFlow, { FlowOption, BotFlowDoc } from '../models/botFlow.model';
import Project, { IProject } from '../models/project.model';
import FbForm from '../models/fbForm.model';
import {
  sendText,
  sendInteractiveButtons,
  sendTyping,
  onIncomingMessage,
  onMessageStatus,
  normalizePhone,
  toJid,
  MessageStatusType,
} from './baileysService';
import LeadModel, { ILead } from '../models/lead.model';
import { generateReply } from './aiChatService';
import { getLLMQueueLength } from './llmService';
import { extractAndSaveLeadPreferences } from './aiLearningService';
import { findDirectFaqAnswer } from './projectKnowledgeService';
import mongoose from 'mongoose';

const READ_TRIGGER_DELAY_MS = 2500;

// Format question and button options for text fallback
export function renderStepAsText(question: string, options: FlowOption[]): string {
  const optionLines = options.map(o => `🔘 [ ${o.title} ]`).join('\n');
  return `${question}\n\n${optionLines}\n\nTap an option or reply with your choice.`;
}

// Send question with interactive buttons (WhatsApp UI)
export async function sendStepQuestion(
  phone: string,
  step: { question: string; options: FlowOption[] },
  isFirstStep = false,
  headerText?: string
) {
  const header = headerText || (isFirstStep ? 'Real Estate Assistant 🏡👋' : undefined);
  return sendInteractiveButtons(
    phone,
    step.question,
    step.options,
    header,
    'Tap an option button below'
  );
}

// Robust option matching by number (1, 2, 3), title keywords, or option id
export function matchOption(options: FlowOption[], replyText: string | undefined): FlowOption | null {
  if (!replyText) return null;
  const trimmed = replyText.trim();

  // 1. Direct number match (e.g. 1, 2, 3)
  const asNumber = parseInt(trimmed, 10);
  if (!isNaN(asNumber) && asNumber >= 1 && asNumber <= options.length) {
    return options[asNumber - 1];
  }

  // 2. Word / title / id match
  const lower = trimmed.toLowerCase();
  const byTitle = options.find(o => {
    const optTitle = (o.title || '').toLowerCase();
    const optId = (o.id || '').toLowerCase();
    return (
      lower === optTitle ||
      lower === optId ||
      lower.includes(optTitle) ||
      optTitle.includes(lower) ||
      (optId && lower.includes(optId))
    );
  });

  return byTitle || null;
}

// Permanent interest retention: status only upgrades (cold -> warm -> hot), never downgrades
export function upgradeInterest(
  current: 'hot' | 'warm' | 'cold' | null | undefined,
  candidate: 'hot' | 'warm' | 'cold'
): 'hot' | 'warm' | 'cold' {
  if (current === 'hot') return 'hot';
  if (current === 'warm') return candidate === 'hot' ? 'hot' : 'warm';
  return candidate;
}

export async function persistLeadInterest(
  leadId: any,
  candidateInterest: 'hot' | 'warm' | 'cold',
  extraUpdates: Record<string, any> = {}
) {
  if (!leadId) return null;
  const currentLead = await LeadModel.findById(leadId).select('interestLevel').lean();
  const finalInterest = upgradeInterest(currentLead?.interestLevel, candidateInterest);
  return LeadModel.findByIdAndUpdate(
    leadId,
    {
      ...extraUpdates,
      interestLevel: finalInterest,
      updatedAt: new Date(),
    },
    { new: true }
  );
}

// Compute lead interest - anyone who chats or answers is HOT
export function calculateInterest(
  attemptCount: number,
  isCompleted: boolean = false,
  hasCampaignContext: boolean = false
): 'hot' | 'warm' | 'cold' {
  if (attemptCount === 0) return 'cold';
  if (hasCampaignContext || isCompleted || attemptCount >= 1) return 'hot';
  return 'warm';
}

// Normalizes and searches lead across all common phone formats + ConversationState mapping
export async function findLeadByPhone(rawPhone: string) {
  const norm = normalizePhone(rawPhone);
  if (!norm) return null;
  const last10 = norm.slice(-10);

  // 1. Direct phone matches with exact or regex on last 10 digits
  let lead = await LeadModel.findOne({
    $or: [
      { phone: norm },
      { phone: `+${norm}` },
      { phone: last10 },
      { phone: `+91${last10}` },
      { phone: `91${last10}` },
      { phone: `0${last10}` },
      { phone: { $regex: last10 } },
    ],
  });
  if (lead) return lead;

  // 2. Check ConversationState for mapped leadId (handles WhatsApp privacy @lid or alternative JIDs)
  const conv = await ConversationState.findOne({
    $or: [{ phone: norm }, { phone: rawPhone }],
  }).populate('leadId');
  if (conv && conv.leadId) {
    return conv.leadId;
  }

  // 3. Check Campaign recipient history
  const camp = await Campaign.findOne({
    $or: [
      { 'recipientStatuses.phone': norm },
      { 'recipientStatuses.phone': { $regex: last10 } },
    ],
  }).lean();
  if (camp) {
    const rec = camp.recipientStatuses.find(
      (r: any) => r.phone && (normalizePhone(r.phone) === norm || r.phone.includes(last10))
    );
    if (rec?.leadId) {
      const campLead = await LeadModel.findById(rec.leadId);
      if (campLead) return campLead;
    }
  }

  return null;
}

export async function getActiveFlowSteps() {
  const steps = await BotFlow.find({ isActive: true }).sort({ stepOrder: 1 }).lean();
  if (steps && steps.length > 0) return steps;
  const anySteps = await BotFlow.find().sort({ stepOrder: 1 }).lean();
  return anySteps || [];
}

/**
 * Resolve project for a lead in priority order:
 * 1) conversationState.activeProjectId (if already chosen)
 * 2) lead.projectId (set from Facebook form mapping)
 * 3) Campaign's projectId (from recent campaign sent to this lead)
 * 4) Form's projectId (if lead submitted an FB form mapped to a project)
 */
async function resolveProjectForLead(lead: any, phone: string, state?: any): Promise<any | null> {
  if (state?.activeProjectId) {
    const p = await Project.findOne({ _id: state.activeProjectId, isActive: true }).lean();
    if (p) return p;
  }

  if (lead?.projectId) {
    const p = await Project.findOne({ _id: lead.projectId, isActive: true }).lean();
    if (p) return p;
  }

  const campaign = await Campaign.findOne({
    'recipientStatuses.phone': { $regex: phone.slice(-10) },
    projectId: { $ne: null },
  })
    .sort({ createdAt: -1 })
    .lean();

  if (campaign?.projectId) {
    const p = await Project.findOne({ _id: campaign.projectId, isActive: true }).lean();
    if (p) return p;
  }

  if (lead?.formId) {
    const fbForm = await FbForm.findOne({ formId: lead.formId, projectId: { $ne: null } }).lean();
    if (fbForm?.projectId) {
      const p = await Project.findOne({ _id: fbForm.projectId, isActive: true }).lean();
      if (p) {
        await LeadModel.findByIdAndUpdate(lead._id, { projectId: fbForm.projectId }).catch(() => {});
        return p;
      }
    }
  }

  return null;
}

/**
 * Detect if user message clearly mentions another active project
 */
function detectMentionedOtherProject(text: string, currentProjectId: any, activeProjects: any[]): any | null {
  if (!text) return null;
  const lower = text.toLowerCase();

  for (const proj of activeProjects) {
    if (String(proj._id) === String(currentProjectId)) continue;

    const projName = proj.name.toLowerCase();
    if (projName.length >= 3 && lower.includes(projName)) {
      return proj;
    }

    for (const kw of proj.keywords || []) {
      const cleanKw = kw.toLowerCase().trim();
      if (cleanKw.length >= 3 && lower.includes(cleanKw)) {
        return proj;
      }
    }
  }

  return null;
}

// ─────────────────────────────────────────────────────────────
// 🌟 DEBOUNCE PROTECTION FOR RAPID USER MESSAGES
// ─────────────────────────────────────────────────────────────
interface DebounceEntry {
  texts: string[];
  timer: NodeJS.Timeout;
  lead: any;
  phone: string;
}

const debounceMap = new Map<string, DebounceEntry>();
const processingPhones = new Set<string>();

/**
 * Send the first message with buttons when campaign message is READ
 */
export async function sendReadWelcomeWithButtons(phone: string, lead: any): Promise<void> {
  try {
    const steps = await getActiveFlowSteps();
    const existingConv = await ConversationState.findOne({
      $or: [{ phone }, { leadId: lead._id }],
    }).sort({ updatedAt: -1 });

    let project = await resolveProjectForLead(lead, phone, existingConv);
    if (!project) {
      const activeProjects = await Project.find({ isActive: true }).lean();
      if (activeProjects && activeProjects.length > 0) {
        project = activeProjects[0];
      }
    }

    const leadName = lead.fullName && !lead.fullName.startsWith('WhatsApp Lead') ? ` ${lead.fullName}` : '';
    let greeting = (project?.welcomeMessage && project.welcomeMessage.trim())
      ? project.welcomeMessage.trim()
      : `Hello${leadName}! 👋 Welcome to *${project?.name || 'Property Advisory'}* 🏡`;
    greeting = greeting.replace(/{{name}}/gi, leadName.trim() || 'there');

    if (steps && steps.length > 0) {
      const firstStep = steps[0];
      const questionText = `${greeting}\n\n${firstStep.question}`;

      await ConversationState.deleteMany({
        $or: [{ phone }, { leadId: lead._id }],
      });

      await ConversationState.create({
        leadId: lead._id,
        phone,
        activeProjectId: project?._id || null,
        currentStep: firstStep.stepKey,
        answers: [],
        attemptCount: 0,
        deliveryStatus: 'read',
        startedAt: new Date(),
        lastActiveAt: new Date(),
      });

      console.log(`[Chatbot] 🚀 Auto-sending Step 1 Question with Buttons to ${phone}: "${firstStep.question}"`);
      await sendInteractiveButtons(
        phone,
        questionText,
        firstStep.options,
        project?.name || 'Real Estate Assistant 🏡',
        'Tap an option button below'
      );
    } else {
      await ConversationState.findOneAndUpdate(
        { leadId: lead._id },
        {
          $set: {
            phone,
            activeProjectId: project?._id || null,
            currentStep: 'completed',
            deliveryStatus: 'read',
            lastActiveAt: new Date(),
          },
          $setOnInsert: { startedAt: new Date(), attemptCount: 0 },
        },
        { upsert: true }
      );
      await sendText(
        phone,
        `${greeting}\n\nHow can I assist you with this property today? Feel free to ask about location, pricing, unit sizes, or schedule a site visit.`
      );
    }
  } catch (err: any) {
    console.error('[Chatbot] ❌ Error sending read welcome with buttons:', err?.message || err);
  }
}

/**
 * Main interaction handler: Handles button choices, free-text questions during flow,
 * and ongoing free-text querying once questions are complete
 */
async function handleUserInteraction(phone: string, text: string, lead: any): Promise<void> {
  try {
    let state = await ConversationState.findOne({
      $or: [{ phone }, { leadId: lead._id }],
    }).sort({ updatedAt: -1 });

    // 1. Check if AI is paused for human agent handoff
    if (state?.aiPaused) {
      console.log(`[Chatbot] ⏸️ AI is paused for lead ${phone} (awaiting human agent)`);
      return;
    }

    const activeProjects = await Project.find({ isActive: true }).lean();
    let project = await resolveProjectForLead(lead, phone, state);
    if (!project && activeProjects.length > 0) {
      project = activeProjects[0];
    }

    // 2. Check for Project Switch Confirmation
    if (state?.pendingProjectSwitchId) {
      const switchTarget = activeProjects.find(p => String(p._id) === String(state!.pendingProjectSwitchId));
      const lower = text.toLowerCase().trim();
      const isAffirmative = ['haan', 'ha', 'yes', 'y', 'sahi', 'sure', '1'].includes(lower);

      if (isAffirmative && switchTarget) {
        state.activeProjectId = switchTarget._id as any;
        state.pendingProjectSwitchId = null;
        state.lastActiveAt = new Date();
        await state.save();

        await sendText(
          phone,
          `Sure! We are now exploring *${switchTarget.name}* 🏡.\nFeel free to ask about pricing, location, unit sizes, or schedule a site visit.`
        );
        return;
      } else {
        state.pendingProjectSwitchId = null;
        await state.save();
      }
    }

    // 3. Project Switch Detection: If user explicitly mentions another property
    if (project && activeProjects.length > 1) {
      const otherMentioned = detectMentionedOtherProject(text, project._id, activeProjects);
      if (otherMentioned) {
        if (state) {
          state.pendingProjectSwitchId = otherMentioned._id as any;
          state.lastActiveAt = new Date();
          await state.save();
        }
        await sendText(
          phone,
          `You were previously inquiring about *${project.name}*. Would you like to explore *${otherMentioned.name}* instead?\n\nPlease reply with *Yes* or *No*.`
        );
        return;
      }
    }

    // 4. Retrieve BotFlow steps
    const steps = await getActiveFlowSteps();
    const currentStepIndex = steps.findIndex(s => s.stepKey === state?.currentStep);

    // ─────────────────────────────────────────────────────────────
    // CASE A: User is in the middle of BotFlow questionnaire
    // ─────────────────────────────────────────────────────────────
    if (state && currentStepIndex !== -1 && state.currentStep !== 'completed') {
      const currentStep = steps[currentStepIndex];
      const matched = matchOption(currentStep.options, text);

      if (matched) {
        // --- Option matched (User clicked button or typed option) ---
        state.answers.push({
          step: currentStep.stepKey,
          optionId: matched.id,
          optionTitle: matched.title,
          answeredAt: new Date(),
        });
        state.attemptCount += 1;
        state.lastActiveAt = new Date();
        state.lastMessageFromUser = text;
        state.lastMessageAt = new Date();

        const isLastStep = currentStepIndex >= steps.length - 1;
        const interest = calculateInterest(state.attemptCount, isLastStep, true);
        await persistLeadInterest(lead._id, interest, { status: 'interested' });

        // Extract lead preferences (e.g. 2 BHK, 3 BHK)
        extractAndSaveLeadPreferences(lead._id, matched.title).catch(() => {});

        // If option has detail text, send it
        if (matched.detailText && matched.detailText.trim()) {
          await sendText(phone, matched.detailText.trim());
        }

        if (isLastStep) {
          state.currentStep = 'completed';
          state.completedAt = new Date();
          await state.save();

          console.log(`[Chatbot] 🎉 Lead ${phone} completed all BotFlow questions! Interest: ${interest.toUpperCase()}`);
          const completionMsg =
            `Thanks! We've noted your preferences — our property advisory team will connect with you shortly.\n\nIn the meantime, feel free to ask any questions about *${project?.name || 'our properties'}* (pricing, exact location, site visits, or brochure) — I'm right here to help! 🏡`;
          await sendText(phone, completionMsg);
          return;
        }

        // Advance to next step with buttons
        const nextStep = steps[currentStepIndex + 1];
        state.currentStep = nextStep.stepKey;
        await state.save();

        console.log(`[Chatbot] ➡️ Advancing ${phone} to Step ${currentStepIndex + 2}: "${nextStep.question}"`);
        await sendStepQuestion(phone, nextStep, false);
        return;
      }

      // --- Option NOT matched: User typed a question or gave custom input! ---
      // "NOW: Jab user ne saare question/kuj input daali to uske hisaab se msg send ho ja une pucha h
      //  or jab question bhi khtam ho jaaye to bhi user next questioning text ke through puch skta h"
      console.log(`[Chatbot] 💡 User ${phone} asked a question during step "${currentStep.stepKey}": "${text}"`);

      // Extract preferences if present in text (e.g. budget or timeline)
      extractAndSaveLeadPreferences(lead._id, text).catch(() => {});

      // Show typing indicator
      await sendTyping(phone, 'composing');

      try {
        const contextNote = `The prospective buyer was asked the questionnaire question: "${currentStep.question}". Instead of tapping an option button, the buyer asked: "${text}". Answer their specific question directly, politely, and accurately using the property database facts.`;
        const aiResult = await generateReply(phone, text, lead, project?._id as any, contextNote);

        await sendTyping(phone, 'paused');

        if (aiResult.reply && aiResult.reply.trim()) {
          await sendText(phone, aiResult.reply.trim());
        }

        if (aiResult.needsAgent) {
          return;
        }

        // After answering their query, present buttons only if AI didn't already ask a natural follow-up question
        if (!aiResult.reply.includes('?')) {
          await new Promise(r => setTimeout(r, 1200));
          await sendStepQuestion(phone, currentStep, false);
        }
      } catch (err: any) {
        console.error('[Chatbot] ❌ Error answering question with LLM:', err?.message || err);
        await sendTyping(phone, 'paused');
        await sendStepQuestion(phone, currentStep, false);
      }
      return;
    }

    // ─────────────────────────────────────────────────────────────
    // CASE B: BotFlow is completed or free-text inquiry
    // "or jab question bhi khtam ho jaaye to bhi user next questioning text ke through puch skta h"
    // ─────────────────────────────────────────────────────────────
    if (!state) {
      state = await ConversationState.create({
        leadId: lead._id,
        phone,
        activeProjectId: project?._id || null,
        currentStep: 'completed',
        answers: [],
        attemptCount: 1,
        startedAt: new Date(),
        lastActiveAt: new Date(),
      });
    }

    console.log(`[Chatbot] 🤖 Llama 3.2 processing free-text query from ${phone}: "${text}"`);
    await sendTyping(phone, 'composing');

    try {
      const aiResult = await generateReply(phone, text, lead, project?._id as any);
      await sendTyping(phone, 'paused');

      if (aiResult.reply && aiResult.reply.trim()) {
        await sendText(phone, aiResult.reply.trim());
        console.log(`[Chatbot] ✅ Sent LLM reply to ${phone}`);
      }
    } catch (err: any) {
      console.error('[Chatbot] ❌ Error generating LLM reply:', err?.message || err);
      await sendTyping(phone, 'paused');
      const directFallback = project ? findDirectFaqAnswer(project, text) : null;
      await sendText(
        phone,
        directFallback ||
        (project?.summary
          ? `Regarding *${project.name}*: ${project.summary}\n\nFeel free to ask about pricing, unit sizes, location, or schedule a site visit.`
          : 'Thank you! I have noted your requirements. Our dedicated property advisory team will connect with you shortly!')
      );
    }
  } catch (err: any) {
    console.error('[Chatbot] ❌ Unhandled error in handleUserInteraction:', err?.message || err);
  }
}

// ─────────────────────────────────────────────────────────────
// 🤖 MAIN CHATBOT INITIALIZATION
// ─────────────────────────────────────────────────────────────
export function registerChatbot(): void {
  console.log('[Chatbot] 🤖 Initializing Chatbot listeners for Delivery, Read, and Incoming messages...');

  const readTriggerDebounce = new Map<string, number>();

  // 1. Trigger on Message Status (Delivered or Read)
  onMessageStatus(async (fromJid, waMessageId, status: MessageStatusType) => {
    try {
      console.log(`[Chatbot] 📡 Message status update: "${status}" for JID: ${fromJid} (ID: ${waMessageId || 'N/A'})`);

      let lead: any = null;
      let targetPhone = '';

      if (waMessageId) {
        await Campaign.updateOne(
          { 'recipientStatuses.waMessageId': waMessageId },
          { $set: { 'recipientStatuses.$.status': status } }
        ).catch(() => {});

        const campaign = await Campaign.findOne({ 'recipientStatuses.waMessageId': waMessageId });
        if (campaign) {
          const recipient = campaign.recipientStatuses.find(r => r.waMessageId === waMessageId);
          if (recipient) {
            if (recipient.phone) targetPhone = normalizePhone(recipient.phone);
            if (recipient.leadId) {
              lead = await LeadModel.findById(recipient.leadId);
            }
          }
        }
      }

      if (!targetPhone && fromJid) {
        targetPhone = normalizePhone(fromJid);
      }

      if (!lead && targetPhone) {
        lead = await findLeadByPhone(targetPhone);
      }

      if (!targetPhone) {
        console.warn(`[Chatbot] ⚠️ Could not determine target phone number for status: ${status}`);
        return;
      }

      if (!lead) {
        lead = await LeadModel.create({
          fullName: `WhatsApp Lead (${targetPhone.slice(-4)})`,
          phone: targetPhone,
          source: 'whatsapp',
          status: 'new',
          interestLevel: 'cold',
        });
      }

      await ConversationState.updateMany(
        { $or: [{ phone: targetPhone }, { leadId: lead._id }] },
        { $set: { deliveryStatus: status, lastActiveAt: new Date() } }
      ).catch(() => {});

      // ── When message is READ (Blue ticks) ──
      // "user ke read pe mera next msg chla jaye buttons ke sath"
      if (status === 'read') {
        if (!lead.interestLevel) {
          await LeadModel.findByIdAndUpdate(lead._id, { interestLevel: 'cold' });
        }

        const debounceKey = `${targetPhone}_${waMessageId || 'read'}`;
        const lastTrigger = readTriggerDebounce.get(debounceKey) || readTriggerDebounce.get(targetPhone) || 0;
        if (Date.now() - lastTrigger < 45000) {
          console.log(`[Chatbot] ⏳ Read trigger already fired recently for ${targetPhone}. Skipping duplicate.`);
          return;
        }
        readTriggerDebounce.set(debounceKey, Date.now());
        readTriggerDebounce.set(targetPhone, Date.now());

        // Check active conversation state
        const existingConv = await ConversationState.findOne({
          $or: [{ phone: targetPhone }, { leadId: lead._id }],
        }).sort({ updatedAt: -1 });

        // If lead was already active in last 15 minutes, do not interrupt
        if (existingConv && (existingConv.attemptCount > 0 || (existingConv.answers && existingConv.answers.length > 0))) {
          const minutesSinceLastActive = (Date.now() - new Date(existingConv.lastActiveAt).getTime()) / (1000 * 60);
          if (minutesSinceLastActive < 15) {
            console.log(`[Chatbot] ℹ️ Lead ${targetPhone} is actively in conversation. Not interrupting with read trigger.`);
            return;
          }
        }

        console.log(`[Chatbot] 🕒 Lead ${targetPhone} READ campaign message. Triggering first question with buttons in ${READ_TRIGGER_DELAY_MS}ms...`);

        setTimeout(async () => {
          await sendReadWelcomeWithButtons(targetPhone, lead);
        }, READ_TRIGGER_DELAY_MS);
      }
    } catch (err: any) {
      console.error('[Chatbot] ❌ Error in onMessageStatus handler:', err.message || err);
    }
  });

  // 2. Trigger on Incoming User Messages
  onIncomingMessage(async (fromJid, text) => {
    try {
      const normPhone = normalizePhone(fromJid);
      if (!normPhone) return;

      console.log(`[Chatbot] 💬 Incoming message from ${normPhone}: "${text ?? ''}"`);

      let lead = await findLeadByPhone(normPhone);
      if (!lead && fromJid) {
        lead = await findLeadByPhone(fromJid);
      }

      if (!lead) {
        console.log(`[Chatbot] ⚠️ Number ${normPhone} is not registered in CRM. Creating active lead...`);
        lead = await LeadModel.create({
          fullName: `WhatsApp Lead (${normPhone.slice(-4)})`,
          phone: normPhone,
          source: 'whatsapp',
          status: 'interested',
          interestLevel: 'hot',
        });
      }

      // 🔥 GUARANTEED IMMEDIATE HOT UPGRADE in Lead document!
      await LeadModel.findByIdAndUpdate(lead._id, {
        $set: {
          interestLevel: 'hot',
          status: 'interested',
          updatedAt: new Date(),
        },
      });

      // Also ensure ConversationState attemptCount is at least 1 so filters and stats stay synced
      await ConversationState.findOneAndUpdate(
        { $or: [{ phone: normPhone }, { leadId: lead._id }] },
        {
          $set: {
            deliveryStatus: 'replied',
            lastMessageFromUser: text,
            lastMessageAt: new Date(),
            lastActiveAt: new Date(),
          },
          $inc: { attemptCount: 1 },
          $setOnInsert: { startedAt: new Date(), currentStep: 'completed' },
        },
        { upsert: true, new: true }
      ).catch(() => {});

      // ── Per-Phone 3-Second Debounce Protection ──
      if (processingPhones.has(normPhone)) {
        console.log(`[Chatbot] Already processing reply for ${normPhone}. Buffering message...`);
      }

      const existing = debounceMap.get(normPhone);
      if (existing) {
        clearTimeout(existing.timer);
        if (text) existing.texts.push(text);
        existing.timer = setTimeout(async () => {
          const entry = debounceMap.get(normPhone);
          debounceMap.delete(normPhone);
          if (!entry || entry.texts.length === 0) return;

          processingPhones.add(normPhone);
          try {
            const combinedText = entry.texts.join('. ');
            await handleUserInteraction(normPhone, combinedText, entry.lead);
          } catch (err: any) {
            console.error('[Chatbot] ❌ Error processing debounced interaction:', err.message || err);
          } finally {
            processingPhones.delete(normPhone);
          }
        }, 3000);
      } else {
        const texts = text ? [text] : [];
        const timer = setTimeout(async () => {
          const entry = debounceMap.get(normPhone);
          debounceMap.delete(normPhone);
          if (!entry || entry.texts.length === 0) return;

          processingPhones.add(normPhone);
          try {
            const combinedText = entry.texts.join('. ');
            await handleUserInteraction(normPhone, combinedText, entry.lead);
          } catch (err: any) {
            console.error('[Chatbot] ❌ Error processing debounced interaction:', err.message || err);
          } finally {
            processingPhones.delete(normPhone);
          }
        }, 3000);

        debounceMap.set(normPhone, { texts, timer, lead, phone: normPhone });
      }
    } catch (err: any) {
      console.error('[Chatbot] ❌ Error handling incoming user message:', err.message || err);
    }
  });
}