import { Request, Response } from 'express';
import ConversationState from '../models/conversationState.model';
import BotFlow from '../models/botFlow.model';
import Lead from '../models/lead.model';
import FbForm from '../models/fbForm.model';

export type InterestLevel = 'hot' | 'warm' | 'cold';

function computeInterest(attemptCount: number, completedAt?: Date, existingLevel?: string | null): InterestLevel {
  const norm = (existingLevel || '').toLowerCase().trim();
  if (norm === 'hot') return 'hot';
  // Any lead with active interaction or completed flow is HOT
  if (completedAt || attemptCount >= 1) return 'hot';
  if (norm === 'warm' || norm === 'cold') return norm as InterestLevel;
  if (attemptCount === 0) return 'cold';
  return 'warm';
}

const INTEREST_ORDER: Record<InterestLevel, number> = { hot: 0, warm: 1, cold: 2 };

// GET /api/lead-interest?sortBy=interest|recent
export async function listLeadInterest(req: Request, res: Response): Promise<void> {
  try {
    const sortBy = (req.query.sortBy as string) || 'interest';
    const now = new Date();

    const [states, activeStepsCount, manualLeads, fbForms] = await Promise.all([
      ConversationState.find()
        .populate({
          path: 'leadId',
          select: 'fullName phone email status interestLevel formName formId source projectId followUp note createdAt updatedAt',
          populate: { path: 'projectId', select: 'name slug' },
        })
        .populate('activeProjectId', 'name slug')
        .lean(),
      BotFlow.countDocuments({ isActive: true }),
      Lead.find({
        interestLevel: { $in: ['hot', 'warm', 'cold'] },
        isDeleted: { $ne: true },
      })
        .populate('projectId', 'name slug')
        .lean(),
      FbForm.find().select('formId name').lean(),
    ]);

    const formMap = new Map<string, string>();
    for (const f of fbForms) {
      if (f.formId && f.name) {
        formMap.set(f.formId, f.name);
      }
    }

    const totalSteps = activeStepsCount > 0 ? activeStepsCount : 2;

    const rows = states
      .filter(s => s.leadId != null)
      .map(s => {
        const leadDoc = s.leadId as any;
        const leadInterest = leadDoc?.interestLevel || null;
        const interest = computeInterest(s.attemptCount, s.completedAt, leadInterest);
        const activityLabel =
          interest === 'hot'
            ? 'Most Activity'
            : interest === 'warm'
            ? 'Interested'
            : 'No Response';

        const isFollowUpDue = Boolean(
          leadDoc?.followUp?.active &&
          leadDoc?.followUp?.date &&
          new Date(leadDoc.followUp.date) <= now
        );

        const formName =
          leadDoc?.formName ||
          (leadDoc?.formId && formMap.get(leadDoc.formId)) ||
          (leadDoc?.formId ? `Form ${leadDoc.formId}` : null) ||
          (leadDoc?.source ? `Source: ${leadDoc.source}` : null) ||
          'Direct WhatsApp';

        const projectName =
          (s as any).activeProjectId?.name ||
          (leadDoc?.projectId as any)?.name ||
          null;

        return {
          leadId: s.leadId,
          phone: s.phone || leadDoc?.phone || '',
          formName,
          source: leadDoc?.source || 'WhatsApp',
          projectName,
          isFollowUpDue,
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

    // Also include leads that have manual interest set (e.g. from direct call or CRM manual setting)
    const stateLeadIds = new Set(
      states
        .map(s => {
          const l = s.leadId as any;
          return l?._id ? String(l._id) : l ? String(l) : null;
        })
        .filter(Boolean)
    );

    for (const m of manualLeads) {
      if (!m || !m._id) continue;
      const mid = String(m._id);
      if (!stateLeadIds.has(mid)) {
        const interest = ((m.interestLevel || 'cold').toLowerCase().trim()) as InterestLevel;
        const activityLabel =
          interest === 'hot'
            ? 'Hot (Direct / Call)'
            : interest === 'warm'
            ? 'Warm (Direct / Call)'
            : 'Cold (Direct / Call)';

        const isFollowUpDue = Boolean(
          m.followUp?.active &&
          m.followUp?.date &&
          new Date(m.followUp.date) <= now
        );

        const formName =
          m.formName ||
          (m.formId && formMap.get(m.formId)) ||
          (m.formId ? `Form ${m.formId}` : null) ||
          (m.source ? `Source: ${m.source}` : null) ||
          'Direct / Call';

        const projectName = (m.projectId as any)?.name || null;

        rows.push({
          leadId: m as any,
          phone: m.phone || (m as any).whatsapp || '',
          formName,
          source: m.source || 'Manual / Call',
          projectName,
          isFollowUpDue,
          currentStep: 'manual',
          totalSteps,
          stepsCompleted: 0,
          interest,
          activityLabel,
          attemptCount: 0,
          deliveryStatus: 'call' as any,
          lastMessageFromUser: m.note || null,
          lastMessageAt: (m.updatedAt || m.createdAt) as any,
          conversationDurationSec: 0,
          startedAt: m.createdAt as any,
          completedAt: undefined,
          lastActiveAt: (m.updatedAt || m.createdAt) as any,
        });
      }
    }

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
    const [state, activeStepsCount, leadDoc, fbForms] = await Promise.all([
      ConversationState.findOne({ leadId: req.params.leadId })
        .sort({ updatedAt: -1 })
        .populate({
          path: 'leadId',
          select: 'fullName phone email status interestLevel formName formId source projectId followUp',
          populate: { path: 'projectId', select: 'name slug' },
        })
        .populate('activeProjectId', 'name slug')
        .lean(),
      BotFlow.countDocuments({ isActive: true }),
      Lead.findById(req.params.leadId).populate('projectId', 'name slug').lean(),
      FbForm.find().select('formId name').lean(),
    ]);

    if (!state && !leadDoc) {
      res.status(404).json({ message: 'Lead not found' });
      return;
    }

    const formMap = new Map<string, string>();
    for (const f of fbForms) {
      if (f.formId && f.name) formMap.set(f.formId, f.name);
    }

    const currentLead = (state?.leadId as any) || leadDoc;
    const formName =
      currentLead?.formName ||
      (currentLead?.formId && formMap.get(currentLead.formId)) ||
      (currentLead?.formId ? `Form ${currentLead.formId}` : null) ||
      (currentLead?.source ? `Source: ${currentLead.source}` : null) ||
      'Direct WhatsApp';

    const totalSteps = activeStepsCount > 0 ? activeStepsCount : 2;
    const leadInterest = currentLead?.interestLevel || null;
    const interest = computeInterest(state?.attemptCount || 0, state?.completedAt, leadInterest);
    const activityLabel =
      interest === 'hot'
        ? 'Most Activity'
        : interest === 'warm'
        ? 'Interested'
        : 'No Response';

    if (!state) {
      // Manual lead (without bot conversation state)
      res.json({
        leadId: leadDoc,
        phone: leadDoc?.phone || '',
        formName,
        source: leadDoc?.source || 'Manual / Call',
        projectName: (leadDoc?.projectId as any)?.name || null,
        currentStep: 'manual',
        answers: [],
        attemptCount: 0,
        totalSteps,
        deliveryStatus: 'call',
        lastMessageFromUser: leadDoc?.note || null,
        lastMessageAt: leadDoc?.updatedAt || leadDoc?.createdAt,
        interest,
        activityLabel,
        startedAt: leadDoc?.createdAt,
        completedAt: null,
        lastActiveAt: leadDoc?.updatedAt || leadDoc?.createdAt,
      });
      return;
    }

    res.json({
      ...state,
      formName,
      source: currentLead?.source || 'WhatsApp',
      projectName: (state as any).activeProjectId?.name || (currentLead?.projectId as any)?.name || null,
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

// PUT/PATCH /api/lead-interest/:leadId — update interestLevel for a lead
export async function updateLeadInterest(req: Request, res: Response): Promise<void> {
  try {
    const { leadId } = req.params;
    const { interest, interestLevel } = req.body;
    const raw = interestLevel !== undefined ? interestLevel : interest;
    const level = raw ? String(raw).toLowerCase().trim() : null;

    if (level && !['hot', 'warm', 'cold'].includes(level)) {
      res.status(400).json({ message: 'Invalid interest level. Must be hot, warm, cold, or null' });
      return;
    }

    const updatedLead = await Lead.findByIdAndUpdate(
      leadId,
      { interestLevel: level },
      { new: true }
    );

    if (!updatedLead) {
      res.status(404).json({ message: 'Lead not found' });
      return;
    }

    res.json({ success: true, lead: updatedLead, interestLevel: updatedLead.interestLevel });
  } catch (err) {
    res.status(500).json({
      message: 'Failed to update interest level',
      error: (err as Error).message,
    });
  }
}