import { Request, Response } from 'express';
import ConversationState from '../models/conversationState.model';
import BotFlow from '../models/botFlow.model';

export type InterestLevel = 'hot' | 'warm' | 'cold';

function computeInterest(attemptCount: number, completedAt?: Date, existingLevel?: string | null): InterestLevel {
  if (existingLevel === 'hot') return 'hot';
  if (existingLevel === 'warm') {
    return (completedAt || attemptCount >= 2) ? 'hot' : 'warm';
  }
  if (attemptCount === 0) return (existingLevel as InterestLevel) || 'cold';
  if (completedAt || attemptCount >= 2) return 'hot';
  return 'warm';
}

const INTEREST_ORDER: Record<InterestLevel, number> = { hot: 0, warm: 1, cold: 2 };

// GET /api/lead-interest?sortBy=interest|recent
export async function listLeadInterest(req: Request, res: Response): Promise<void> {
  try {
    const sortBy = (req.query.sortBy as string) || 'interest';

    const [states, activeStepsCount] = await Promise.all([
      ConversationState.find()
        .populate('leadId', 'fullName phone email status interestLevel')
        .lean(),
      BotFlow.countDocuments({ isActive: true }),
    ]);

    const totalSteps = activeStepsCount > 0 ? activeStepsCount : 2;

    const rows = states.map(s => {
      const leadDoc = s.leadId as any;
      const leadInterest = leadDoc?.interestLevel || null;
      const interest = computeInterest(s.attemptCount, s.completedAt, leadInterest);
      const activityLabel =
        interest === 'hot'
          ? 'Most Activity'
          : interest === 'warm'
          ? 'Interested'
          : 'No Response';

      return {
        leadId: s.leadId,
        phone: s.phone,
        currentStep: s.currentStep,
        totalSteps,
        stepsCompleted: s.answers.length,
        interest,
        activityLabel,
        attemptCount: s.attemptCount,
        deliveryStatus: (s as any).deliveryStatus || 'sent',
        lastMessageFromUser: (s as any).lastMessageFromUser || null,
        lastMessageAt: (s as any).lastMessageAt || null,
        conversationDurationSec: Math.round(
          (new Date(s.lastActiveAt).getTime() - new Date(s.startedAt).getTime()) / 1000
        ),
        startedAt: s.startedAt,
        completedAt: s.completedAt,
        lastActiveAt: s.lastActiveAt,
      };
    });

    if (sortBy === 'recent') {
      rows.sort((a, b) => +new Date(b.lastActiveAt) - +new Date(a.lastActiveAt));
    } else {
      rows.sort((a, b) => {
        const diff = INTEREST_ORDER[a.interest] - INTEREST_ORDER[b.interest];
        return diff !== 0 ? diff : +new Date(b.lastActiveAt) - +new Date(a.lastActiveAt);
      });
    }

    res.json(rows);
  } catch (err) {
    res.status(500).json({
      message: 'Failed to fetch lead interest data',
      error: (err as Error).message,
    });
  }
}

// GET /api/lead-interest/:leadId — full conversation timeline for one lead
export async function getLeadInterestById(req: Request, res: Response): Promise<void> {
  try {
    const [state, activeStepsCount] = await Promise.all([
      ConversationState.findOne({ leadId: req.params.leadId })
        .sort({ updatedAt: -1 })
        .populate('leadId', 'fullName phone email status interestLevel')
        .lean(),
      BotFlow.countDocuments({ isActive: true }),
    ]);

    if (!state) {
      res.status(404).json({ message: 'No conversation activity found for this lead' });
      return;
    }

    const totalSteps = activeStepsCount > 0 ? activeStepsCount : 2;
    const leadDoc = state.leadId as any;
    const leadInterest = leadDoc?.interestLevel || null;
    const interest = computeInterest(state.attemptCount, state.completedAt, leadInterest);
    const activityLabel =
      interest === 'hot'
        ? 'Most Activity'
        : interest === 'warm'
        ? 'Interested'
        : 'No Response';

    res.json({
      ...state,
      totalSteps,
      deliveryStatus: (state as any).deliveryStatus || 'sent',
      lastMessageFromUser: (state as any).lastMessageFromUser || null,
      lastMessageAt: (state as any).lastMessageAt || null,
      interest,
      activityLabel,
    });
  } catch (err) {
    res.status(500).json({
      message: 'Failed to fetch lead interest data',
      error: (err as Error).message,
    });
  }
}