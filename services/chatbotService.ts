import ConversationState, { ConversationStateDoc } from '../models/conversationState.model';
import Campaign from '../models/campaign.model';
import BotFlow, { FlowOption, BotFlowDoc } from '../models/botFlow.model';
import {
  sendText,
  sendInteractiveButtons,
  onIncomingMessage,
  onMessageStatus,
  normalizePhone,
  toJid,
  MessageStatusType,
} from './baileysService';
import LeadModel, { ILead } from '../models/lead.model';

const FALLBACK_TEXT =
  "Please tap an option button or reply with your choice:";
const COMPLETION_TEXT =
  "Thanks! We've noted your preferences — our property advisory team will contact you shortly.";

const READ_TRIGGER_DELAY_MS = 2500;

// Format question and button options for fallback/logging
export function renderStepAsText(question: string, options: FlowOption[]): string {
  const optionLines = options.map(o => `🔘 [ ${o.title} ]`).join('\n');
  return `${question}\n\n${optionLines}\n\nTap an option or reply with your choice.`;
}

// Send question with interactive buttons (WhatsApp UI)
export async function sendStepQuestion(
  phone: string,
  step: { question: string; options: FlowOption[] },
  isFirstStep = false
) {
  const header = isFirstStep ? "Real Estate Assistant 🏡👋" : undefined;
  return sendInteractiveButtons(
    phone,
    step.question,
    step.options,
    header,
    'Tap an option button below'
  );
}

// Robust option matching by number (1, 2, 3) or by option title/keywords or option id
export function matchOption(options: FlowOption[], replyText: string | undefined): FlowOption | null {
  if (!replyText) return null;
  const trimmed = replyText.trim();

  // 1. Direct number match
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
  const currentLead = await LeadModel.findById(leadId).select('interestLevel').lean();
  const finalInterest = upgradeInterest(currentLead?.interestLevel, candidateInterest);
  return LeadModel.findByIdAndUpdate(leadId, {
    ...extraUpdates,
    interestLevel: finalInterest,
  });
}

// Compute lead interest based on replies / interaction count (3+ reactions or completed flow -> 'hot')
export function calculateInterest(attemptCount: number, isCompleted: boolean): 'hot' | 'warm' | 'cold' {
  if (attemptCount === 0) return 'cold';
  if (isCompleted || attemptCount >= 2) return 'hot';
  return 'warm';
}

// Normalizes and searches lead across all common formats
export async function findLeadByPhone(rawPhone: string) {
  const norm = normalizePhone(rawPhone);
  if (!norm) return null;
  const last10 = norm.slice(-10);

  return LeadModel.findOne({
    $or: [
      { phone: norm },
      { phone: `+${norm}` },
      { phone: last10 },
      { phone: `+91${last10}` },
      { phone: `91${last10}` },
      { phone: `0${last10}` },
    ],
  });
}

const DEFAULT_SEEDED_STEPS = [
  {
    stepOrder: 1,
    stepKey: 'property_interest',
    question: 'Which property type interests you?',
    options: [
      {
        id: '2bhk',
        title: '2BHK Apartment',
        detailText: '2BHK Apartments start from ₹45L, 900-1100 sq.ft, available in prime locations.',
      },
      {
        id: '3bhk',
        title: '3BHK Apartment',
        detailText: '3BHK Apartments start from ₹75L, 1400-1700 sq.ft with modern amenities.',
      },
      {
        id: 'villa',
        title: 'Luxury Villa',
        detailText: 'Luxury Villas start from ₹1.2Cr, 2400+ sq.ft with private garden.',
      },
      {
        id: 'plot',
        title: 'Residential Plot',
        detailText: 'Gated community residential plots starting from ₹25L.',
      },
    ],
    isActive: true,
  },
  {
    stepOrder: 2,
    stepKey: 'budget_range',
    question: 'What is your budget range?',
    options: [
      { id: 'under_50l', title: 'Under ₹50 Lakhs' },
      { id: '50l_1cr', title: '₹50 Lakhs - ₹1 Crore' },
      { id: 'above_1cr', title: 'Above ₹1 Crore' },
    ],
    isActive: true,
  },
];

async function getActiveFlowSteps() {
  const steps = await BotFlow.find({ isActive: true }).sort({ stepOrder: 1 }).lean();
  if (steps && steps.length > 0) return steps;
  const anySteps = await BotFlow.find().sort({ stepOrder: 1 }).lean();
  return anySteps || [];
}

export function registerChatbot(): void {
  console.log('[Chatbot] 🤖 Initializing Chatbot listeners for Delivery, Read, and Incoming messages...');

  const readTriggerDebounce = new Map<string, number>();

  // 1. Trigger on Message Status (Delivered or Read)
  onMessageStatus(async (fromJid, waMessageId, status: MessageStatusType) => {
    try {
      console.log(`[Chatbot] 📡 Message status update: "${status}" for JID: ${fromJid} (ID: ${waMessageId || 'N/A'})`);

      let lead: any = null;
      let targetPhone = '';

      // 1. If waMessageId is provided, find the campaign recipient
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

      // 2. If targetPhone still unknown, derive from fromJid
      if (!targetPhone && fromJid) {
        targetPhone = normalizePhone(fromJid);
      }

      // 3. If lead still null, search by targetPhone
      if (!lead && targetPhone) {
        lead = await findLeadByPhone(targetPhone);
      }

      if (!targetPhone) {
        console.warn(`[Chatbot] ⚠️ Could not determine target phone number for status: ${status}, waMessageId: ${waMessageId}`);
        return;
      }

      // If lead still not in DB, create one so tracking and interest scoring work
      if (!lead) {
        lead = await LeadModel.create({
          fullName: `WhatsApp Lead (${targetPhone.slice(-4)})`,
          phone: targetPhone,
          source: 'whatsapp',
          status: 'new',
          interestLevel: 'cold',
        });
      }

      // Update deliveryStatus on existing ConversationState
      await ConversationState.updateMany(
        { $or: [{ phone: targetPhone }, { leadId: lead._id }] },
        { $set: { deliveryStatus: status, lastActiveAt: new Date() } }
      ).catch(() => {});

      // ── When message is READ (Blue ticks): Automatically trigger Questioning (Step 1) ──
      if (status === 'read') {
        // Set initial interest to cold if not already warm/hot
        if (!lead.interestLevel) {
          await LeadModel.findByIdAndUpdate(lead._id, { interestLevel: 'cold' });
        }

        // Deduplication check: prevent multiple triggers in a 45-second burst for same lead/message
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

        // If user already answered 1+ questions recently (in the last 15 minutes), do not interrupt them
        if (existingConv && existingConv.answers && existingConv.answers.length > 0 && existingConv.currentStep !== 'completed') {
          const minutesSinceLastActive = (Date.now() - new Date(existingConv.lastActiveAt).getTime()) / (1000 * 60);
          if (minutesSinceLastActive < 15) {
            console.log(`[Chatbot] ℹ️ Lead ${targetPhone} is actively answering flow (step: ${existingConv.currentStep}). Not restarting.`);
            return;
          }
        }

        console.log(`[Chatbot] 🕒 Lead ${targetPhone} READ campaign message. Auto-triggering Step 1 in ${READ_TRIGGER_DELAY_MS}ms...`);

        setTimeout(async () => {
          try {
            await startNewConversation(targetPhone, lead);
          } catch (err: any) {
            console.error('[Chatbot] ❌ Error auto-sending Step 1 after read:', err.message);
          }
        }, READ_TRIGGER_DELAY_MS);
      }
    } catch (err: any) {
      console.error('[Chatbot] ❌ Error in onMessageStatus handler:', err.message);
    }
  });

  // 2. Trigger on Incoming User Messages
  onIncomingMessage(async (fromJid, text) => {
    try {
      const normPhone = normalizePhone(fromJid);
      if (!normPhone) return;

      console.log(`[Chatbot] 💬 Incoming message from ${normPhone}: "${text ?? ''}"`);
      await handleIncomingUserMessage(normPhone, text);
    } catch (err: any) {
      console.error('[Chatbot] ❌ Error handling incoming user message:', err.message);
    }
  });
}

// Start questionnaire from Step 1
async function startNewConversation(phone: string, lead: any): Promise<void> {
  const steps = await getActiveFlowSteps();
  if (!steps || steps.length === 0) {
    console.error('[Chatbot] ❌ Cannot start questionnaire: No BotFlow steps found in database.');
    return;
  }

  const firstStep = steps[0];

  // Remove or complete any old conversation for this lead
  await ConversationState.deleteMany({
    $or: [{ phone }, { leadId: lead._id }],
  });

  // Lead is initially cold unless they already have a warm/hot status
  const currentLead = await LeadModel.findById(lead._id).select('interestLevel').lean();
  const initialInterest = currentLead?.interestLevel || 'cold';
  await LeadModel.findByIdAndUpdate(lead._id, {
    interestLevel: initialInterest,
  });

  await ConversationState.create({
    leadId: lead._id,
    phone,
    currentStep: firstStep.stepKey,
    answers: [],
    attemptCount: 0,
    deliveryStatus: 'read',
    startedAt: new Date(),
    lastActiveAt: new Date(),
  });

  console.log(`[Chatbot] 🚀 Auto-sending Step 1 Question to ${phone}: "${firstStep.question}" with buttons`);
  const sendRes = await sendStepQuestion(phone, firstStep, true);
  if (!sendRes.success) {
    console.error(`[Chatbot] ❌ Failed to send Step 1 question to ${phone}:`, sendRes.error);
  } else {
    console.log(`[Chatbot] ✅ Step 1 question successfully delivered to ${phone}`);
  }
}

// Handle all incoming replies and free-text messages from user
async function handleIncomingUserMessage(phone: string, text: string | undefined): Promise<void> {
  const steps = await getActiveFlowSteps();
  if (!steps || steps.length === 0) {
    console.log('[Chatbot] No bot flow steps configured.');
    return;
  }

  // Find lead in CRM
  let lead = await findLeadByPhone(phone);
  if (!lead) {
    console.log(`[Chatbot] ⚠️ Number ${phone} is not registered as a lead in CRM. Creating active lead...`);
    lead = await LeadModel.create({
      fullName: `WhatsApp Lead (${phone.slice(-4)})`,
      phone,
      source: 'whatsapp',
      status: 'interested',
      interestLevel: 'warm',
    });
  }

  // User sent an active message — immediately mark as interested in CRM
  await LeadModel.findByIdAndUpdate(lead._id, { status: 'interested' });

  // Find latest conversation state
  let state = await ConversationState.findOne({
    $or: [{ phone }, { leadId: lead._id }],
  }).sort({ updatedAt: -1 });

  // ── CASE 1: No active conversation or previously completed ──
  if (!state || state.currentStep === 'completed') {
    const firstStep = steps[0];

    // Check if user's message already answered Step 1
    const matchedFirst = matchOption(firstStep.options, text);

    if (matchedFirst) {
      // User answered step 1 right away!
      const isLastStep = steps.length <= 1;
      const interest = isLastStep ? 'hot' : 'warm';

      await persistLeadInterest(lead._id, interest, { status: 'interested' });

      state = await ConversationState.create({
        leadId: lead._id,
        phone,
        currentStep: isLastStep ? 'completed' : steps[1]?.stepKey || 'completed',
        answers: [
          {
            step: firstStep.stepKey,
            optionId: matchedFirst.id,
            optionTitle: matchedFirst.title,
            answeredAt: new Date(),
          },
        ],
        attemptCount: 1,
        startedAt: new Date(),
        completedAt: isLastStep ? new Date() : undefined,
        lastActiveAt: new Date(),
      });

      if (matchedFirst.detailText && matchedFirst.detailText.trim()) {
        await sendText(phone, matchedFirst.detailText.trim());
      }

      if (isLastStep) {
        await sendText(phone, COMPLETION_TEXT);
      } else if (steps[1]) {
        await sendStepQuestion(phone, steps[1], false);
      }
      return;
    }

    // User sent a greeting / question (e.g. "hi", "details", "call me")
    // Start Step 1 questionnaire and mark as Warm (permanent upgrade)
    await persistLeadInterest(lead._id, 'warm', { status: 'interested' });

    state = await ConversationState.create({
      leadId: lead._id,
      phone,
      currentStep: firstStep.stepKey,
      answers: [],
      attemptCount: 1,
      startedAt: new Date(),
      lastActiveAt: new Date(),
    });

    console.log(`[Chatbot] 🚀 Started questionnaire for ${phone} after incoming message. Sending Step 1 with buttons...`);
    await sendStepQuestion(phone, firstStep, true);
    return;
  }

  // ── CASE 2: Active in-progress questionnaire ──
  const currentStepIndex = steps.findIndex((s: any) => s.stepKey === state!.currentStep);
  const currentStep = currentStepIndex !== -1 ? steps[currentStepIndex] : steps[0];

  if (!currentStep) return;

  const matched = matchOption(currentStep.options, text);

  if (matched) {
    // Valid option selected!
    state.answers.push({
      step: currentStep.stepKey,
      optionId: matched.id,
      optionTitle: matched.title,
      answeredAt: new Date(),
    });
    state.attemptCount += 1;
    state.lastActiveAt = new Date();

    const isLastStep = currentStepIndex >= steps.length - 1;
    const interest = calculateInterest(state.attemptCount, isLastStep);

    // Update Lead in CRM to Hot or Warm permanently without downgrading
    await persistLeadInterest(lead._id, interest, { status: 'interested' });

    // Send option's instant detail response if configured
    if (matched.detailText && matched.detailText.trim()) {
      await sendText(phone, matched.detailText.trim());
    }

    if (isLastStep) {
      state.currentStep = 'completed';
      state.completedAt = new Date();
      await state.save();
      console.log(`[Chatbot] 🎉 Lead ${phone} completed all questions! Interest: ${interest.toUpperCase()}`);
      await sendText(phone, COMPLETION_TEXT);
      return;
    }

    // Advance to next step
    const nextStep = steps[currentStepIndex + 1];
    state.currentStep = nextStep.stepKey;
    await state.save();

    console.log(`[Chatbot] ➡️ Advancing ${phone} to Step ${currentStepIndex + 2}: "${nextStep.question}"`);
    await sendStepQuestion(phone, nextStep, false);
    return;
  }

  // Free-text reply that did not match an option directly
  // Still register user engagement!
  state.attemptCount += 1;
  state.lastActiveAt = new Date();
  const interest = state.attemptCount >= 2 ? 'hot' : 'warm';

  await persistLeadInterest(lead._id, interest, { status: 'interested' });
  await state.save();

  // Send guidance with current question & button options
  console.log(`[Chatbot] ℹ️ Free-text received from ${phone}: "${text}". Resending Step ${currentStepIndex + 1} buttons...`);
  await sendStepQuestion(phone, currentStep, false);
}