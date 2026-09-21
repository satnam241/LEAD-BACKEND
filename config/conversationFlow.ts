// Edit this file to change the conversation content — no other file needs touching.
// Options are sent as a numbered plain-text list (not native WhatsApp buttons/lists —
// those are unofficial/unreliable via Baileys) and matched back by the number the
// user types, or by a loose match on the option's title as a fallback.

export type ConversationStepId = 'awaiting_property' | 'awaiting_budget' | 'completed';

export const FIRST_STEP: ConversationStepId = 'awaiting_property';

export interface FlowOption {
  id: string;
  title: string;
  // Optional — sent back to the user right after they pick this option, before
  // the next question. Use it for "here's more about what you picked" replies.
  detailText?: string;
}

export interface FlowStep {
  id: ConversationStepId;
  question: string;
  options: FlowOption[];
  next: ConversationStepId;
}

export const conversationFlow: Record<Exclude<ConversationStepId, 'completed'>, FlowStep> = {
  awaiting_property: {
    id: 'awaiting_property',
    question: 'Which property type interests you?',
    options: [
      {
        id: '2bhk',
        title: '2BHK Apartment',
        detailText: '2BHK Apartments start from ₹45L, 900-1100 sq.ft, available in Sector 12 and Sector 21.',
      },
      {
        id: '3bhk',
        title: '3BHK Apartment',
        detailText: '3BHK Apartments start from ₹75L, 1400-1700 sq.ft, available in Sector 12, 21 and Kharar.',
      },
      {
        id: 'villa',
        title: 'Villa',
        detailText: 'Villas start from ₹1.2Cr, 2400+ sq.ft with private garden, available in Zirakpur and Kharar.',
      },
    ],
    next: 'awaiting_budget',
  },
  awaiting_budget: {
    id: 'awaiting_budget',
    question: "What's your budget range?",
    options: [
      { id: 'under_50l', title: 'Under 50L' },
      { id: '50l_1cr', title: '50L - 1Cr' },
      { id: 'above_1cr', title: 'Above 1Cr' },
    ],
    next: 'completed',
  },
};

export const TOTAL_STEPS = Object.keys(conversationFlow).length;

export function getFlowStep(stepId: ConversationStepId): FlowStep | null {
  if (stepId === 'completed') return null;
  return conversationFlow[stepId];
}

// Renders a step as plain text: "1. 2BHK Apartment\n2. 3BHK Apartment\n3. Villa"
// with the question above it, and a "reply with the number" instruction.
export function renderStepAsText(step: FlowStep): string {
  const optionLines = step.options.map((o, i) => `${i + 1}. ${o.title}`).join('\n');
  return `${step.question}\n\n${optionLines}\n\nReply with the number of your choice.`;
}

// Matches a free-text reply against a step's options — by number first, then by
// loose title match (so "villa" or "Villa please" both match the Villa option).
export function matchOption(step: FlowStep, replyText: string): FlowOption | null {
  const trimmed = replyText.trim();

  const asNumber = parseInt(trimmed, 10);
  if (!isNaN(asNumber) && asNumber >= 1 && asNumber <= step.options.length) {
    return step.options[asNumber - 1];
  }

  const lower = trimmed.toLowerCase();
  const byTitle = step.options.find(o => lower.includes(o.title.toLowerCase()) || o.title.toLowerCase().includes(lower));
  return byTitle || null;
}