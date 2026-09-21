import { Request, Response } from 'express';
import { Model, FilterQuery } from 'mongoose';
import Campaign from '../models/campaign.model';
import Template from '../models/template.model';
// ⚠️ Adjust this import to match your actual Lead model file/export.
import LeadModel from '../models/lead.model';
import { audienceMap } from '../config/audienceMap';
import { sendText, sendMedia, getConnectionStatus } from '../services/baileysService';
import type { CampaignFilters, LeadLike } from '../types/whatsapp.types';

const Lead = LeadModel as unknown as Model<LeadLike>;

export async function listCampaigns(req: Request, res: Response): Promise<void> {
  try {
    const search = (req.query.search as string) || '';
    const status = (req.query.status as string) || 'All';
    const audience = (req.query.audience as string) || 'All';

    const query: Record<string, unknown> = {};
    if (status !== 'All') query.status = status;
    if (audience !== 'All') query.audience = audience;
    if (search.trim()) {
      const rx = new RegExp(search.trim(), 'i');
      query.$or = [{ name: rx }, { audience: rx }, { template: rx }];
    }

    const campaigns = await Campaign.find(query).sort({ createdAt: -1 }).lean();
    res.json(campaigns);
  } catch (err) {
    res.status(500).json({ message: 'Failed to fetch campaigns', error: (err as Error).message });
  }
}

export async function getStats(_req: Request, res: Response): Promise<void> {
  try {
    const campaigns = await Campaign.find().lean();
    res.json({
      total: campaigns.length,
      active: campaigns.filter(c => c.status === 'Running').length,
      sent: campaigns.reduce((n, c) => n + c.sent, 0),
      failed: campaigns.reduce((n, c) => n + c.failed, 0),
    });
  } catch (err) {
    res.status(500).json({ message: 'Failed to compute stats', error: (err as Error).message });
  }
}

export async function getAudienceCounts(_req: Request, res: Response): Promise<void> {
  try {
    const entries = await Promise.all(
      Object.entries(audienceMap).map(async ([label, statusValue]) => {
        let count: number;
        if (label === 'Follow-up Leads') {
          count = await Lead.countDocuments({ 'followUp.active': true } as FilterQuery<LeadLike>);
        } else if (statusValue === null) {
          count = await Lead.countDocuments({});
        } else {
          count = await Lead.countDocuments({ status: statusValue } as FilterQuery<LeadLike>);
        }
        return [label, count] as const;
      })
    );
    res.json(Object.fromEntries(entries));
  } catch (err) {
    res.status(500).json({ message: 'Failed to compute audience counts', error: (err as Error).message });
  }
}

export async function getTemplates(_req: Request, res: Response): Promise<void> {
  try {
    const templates = await Template.find().sort({ createdAt: -1 }).lean();
    res.json(templates);
  } catch (err) {
    res.status(500).json({ message: 'Failed to fetch templates', error: (err as Error).message });
  }
}

export async function getCampaignById(req: Request, res: Response): Promise<void> {
  try {
    const campaign = await Campaign.findById(req.params.id).lean();
    if (!campaign) {
      res.status(404).json({ message: 'Campaign not found' });
      return;
    }
    res.json(campaign);
  } catch (err) {
    res.status(500).json({ message: 'Failed to fetch campaign', error: (err as Error).message });
  }
}

async function resolveEligibleLeads(audience: string, filters: CampaignFilters): Promise<LeadLike[]> {
  const query: FilterQuery<LeadLike> = {};

  if (audience === 'Follow-up Leads') {
    (query as Record<string, unknown>)['followUp.active'] = true;
  } else {
    const statusValue = audienceMap[audience];
    if (statusValue !== null && statusValue !== undefined) query.status = statusValue;
  }

  if (filters.source && filters.source !== 'All sources') query.source = filters.source;
  if (filters.assignedTo && filters.assignedTo !== 'All assignees') query.assignedTo = filters.assignedTo;
  if (filters.dateFrom || filters.dateTo) {
    const createdAt: Record<string, Date> = {};
    if (filters.dateFrom) createdAt.$gte = new Date(filters.dateFrom);
    if (filters.dateTo) createdAt.$lte = new Date(filters.dateTo);
    (query as Record<string, unknown>).createdAt = createdAt;
  }

  return Lead.find(query).lean();
}

function fillTemplate(bodyText: string, variables: string[], lead: LeadLike): string {
  const source: Record<string, string> = {
    name: lead.fullName || lead.name || '',
    property: lead.property || lead.propertyInterest || (lead.extraFields?.property as string) || '',
  };
  let result = bodyText;
  variables.forEach((v, i) => {
    result = result.split(`{{${i + 1}}}`).join(source[v] ?? '');
  });
  return result;
}

function buildFullMessage(
  template: {
    header?: string | null;
    bodyText: string;
    footer?: string | null;
    variables: string[];
    options?: string[];
  },
  lead: LeadLike
): string {
  const body = fillTemplate(template.bodyText, template.variables || [], lead);
  const parts: string[] = [];
  if (template.header?.trim()) {
    parts.push(`*${template.header.trim()}*`);
  }
  parts.push(body);

  if (template.options && template.options.length > 0) {
    const validOpts = template.options.filter(Boolean);
    if (validOpts.length > 0) {
      const optLines = validOpts.map((opt, i) => `${i + 1}️⃣  ${opt}`).join('\n');
      parts.push(`*Choose an option:*\n${optLines}\n\n_Reply with the number (e.g. 1, 2) or option text_`);
    }
  }

  if (template.footer?.trim()) {
    parts.push(`_${template.footer.trim()}_`);
  }
  return parts.join('\n\n');
}

interface CreateCampaignBody {
  name: string;
  audience: string;
  template: string;
  filters?: CampaignFilters;
  action?: 'draft' | 'send';
}

export async function createCampaign(
  req: Request<unknown, unknown, CreateCampaignBody>,
  res: Response
): Promise<void> {
  try {
    const { name, audience, template, filters = {}, action = 'draft' } = req.body;

    if (!name?.trim() || !audience || !template) {
      res.status(400).json({ message: 'name, audience and template are required' });
      return;
    }

    const templateData = await Template.findOne({ name: template });
    if (!templateData) {
      res.status(400).json({ message: `Template "${template}" not found` });
      return;
    }

    const eligibleLeads = await resolveEligibleLeads(audience, filters);

    const campaign = await Campaign.create({
      name: name.trim(),
      audience,
      template,
      recipients: eligibleLeads.length,
      status: action === 'send' ? 'Running' : 'Draft',
    });

    if (action === 'draft') {
      res.status(201).json(campaign);
      return;
    }

    const { status } = getConnectionStatus();
    if (status !== 'open') {
      campaign.status = 'Failed';
      await campaign.save();
      res.status(503).json({ message: 'WhatsApp is not connected — scan the QR code first, then retry.' });
      return;
    }

    const results = [];
    for (const lead of eligibleLeads) {
      const message = buildFullMessage(templateData as any, lead);
      let outcome;
      if (templateData.imageUrl?.trim()) {
        outcome = await sendMedia(lead.phone, templateData.imageUrl.trim(), message);
      } else {
        outcome = await sendText(lead.phone, message);
      }
      const recipientRecord = {
        leadId: lead._id,
        name: lead.fullName || lead.name || '',
        phone: lead.phone,
        status: (outcome.success ? 'sent' : 'failed') as any,
        waMessageId: outcome.waMessageId,
        error: outcome.error,
      };
      results.push(recipientRecord);

      // Save each recipient to the campaign immediately so read/delivery receipts find waMessageId instantly
      await Campaign.findByIdAndUpdate(campaign._id, {
        $push: { recipientStatuses: recipientRecord },
        $inc: { sent: outcome.success ? 1 : 0, failed: outcome.success ? 0 : 1 },
      });

      // Only set initial interest to 'cold' if lead does not already have an interest status
      if (outcome.success && lead._id) {
        const existing = await LeadModel.findById(lead._id).select('interestLevel').lean();
        if (!existing?.interestLevel) {
          await LeadModel.findByIdAndUpdate(lead._id, { interestLevel: 'cold' }).catch(() => {});
        }
      }

      // Anti-Ban Shield: Randomized delay between 2500ms and 4500ms prevents WhatsApp bulk-bot detection
      const jitterDelay = 2500 + Math.floor(Math.random() * 2000);
      await new Promise(r => setTimeout(r, jitterDelay));
    }

    const sentCount = results.filter(r => r.status === 'sent').length;
    const failedCount = results.filter(r => r.status === 'failed').length;

    campaign.recipientStatuses = results as any;
    campaign.sent = sentCount;
    campaign.failed = failedCount;
    campaign.status = eligibleLeads.length && failedCount === eligibleLeads.length ? 'Failed' : 'Completed';
    await campaign.save();

    res.status(201).json(campaign);
  } catch (err) {
    res.status(500).json({ message: 'Failed to create campaign', error: (err as Error).message });
  }
}