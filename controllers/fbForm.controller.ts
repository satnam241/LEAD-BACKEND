import { Request, Response } from 'express';
import mongoose from 'mongoose';
import FbForm from '../models/fbForm.model';
import Lead from '../models/lead.model';
import Project from '../models/project.model';
import fetchWithRetry from '../services/fetchWithRetry';

// GET /api/fb-forms - List forms with mapped project and lead counts
export async function listFbForms(_req: Request, res: Response): Promise<void> {
  try {
    const forms = await FbForm.find()
      .populate('projectId', 'name slug')
      .sort({ createdAt: -1 })
      .lean();

    // Compute lead count per formId
    const leadCounts = await Lead.aggregate([
      { $match: { formId: { $ne: null } } },
      { $group: { _id: '$formId', count: { $sum: 1 } } },
    ]);

    const countMap = new Map<string, number>();
    for (const item of leadCounts) {
      if (item._id) {
        countMap.set(String(item._id), item.count);
      }
    }

    const result = forms.map(f => ({
      _id: f._id,
      formId: f.formId,
      name: f.name,
      locale: f.locale,
      status: f.status,
      projectId: f.projectId,
      suggestedProject: f.suggestedProject,
      lastSyncedAt: f.lastSyncedAt,
      leadCount: countMap.get(f.formId) || 0,
      createdAt: f.createdAt,
      updatedAt: f.updatedAt,
    }));

    res.json({ success: true, forms: result });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message || 'Failed to list FB forms' });
  }
}

// POST /api/fb-forms/sync - Fetch forms from Meta Graph API and upsert
export async function syncFbForms(_req: Request, res: Response): Promise<void> {
  try {
    const token = process.env.FB_PAGE_ACCESS_TOKEN;
    if (!token) {
      res.status(400).json({ success: false, error: 'FB_PAGE_ACCESS_TOKEN is not configured' });
      return;
    }

    const version = process.env.META_GRAPH_API_VERSION || process.env.FB_GRAPH_VERSION || 'v23.0';
    let nextUrl: string | null = `https://graph.facebook.com/${version}/me/leadgen_forms?fields=id,name,locale,status&limit=100&access_token=${token}`;
    let totalSynced = 0;

    while (nextUrl) {
      const data: any = await fetchWithRetry(nextUrl, 3, 1000);
      if (!data || !Array.isArray(data.data)) {
        break;
      }

      for (const item of data.data) {
        if (!item.id) continue;

        // Upsert by formId without overwriting existing projectId or suggestedProject
        const existing = await FbForm.findOne({ formId: item.id });
        if (existing) {
          existing.name = item.name || existing.name;
          existing.locale = item.locale || existing.locale;
          existing.status = item.status || existing.status;
          existing.lastSyncedAt = new Date();
          await existing.save();
        } else {
          await FbForm.create({
            formId: item.id,
            name: item.name || 'Untitled Form',
            locale: item.locale || 'en_US',
            status: item.status || 'ACTIVE',
            projectId: null,
            suggestedProject: null,
            lastSyncedAt: new Date(),
          });
        }
        totalSynced++;
      }

      nextUrl = data.paging?.next || null;
    }

    res.json({ success: true, message: `Successfully synced ${totalSynced} forms`, totalSynced });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message || 'Failed to sync FB forms' });
  }
}

// PATCH /api/fb-forms/:formId - Map or unmap a form to a project
export async function mapFbForm(req: Request, res: Response): Promise<void> {
  try {
    const { formId } = req.params;
    const { projectId } = req.body; // string (valid ObjectId) or null

    let targetProjectId: mongoose.Types.ObjectId | null = null;
    if (projectId) {
      if (!mongoose.Types.ObjectId.isValid(projectId)) {
        res.status(400).json({ success: false, error: 'Invalid projectId' });
        return;
      }
      const projectExists = await Project.findById(projectId);
      if (!projectExists) {
        res.status(404).json({ success: false, error: 'Project not found' });
        return;
      }
      targetProjectId = new mongoose.Types.ObjectId(projectId);
    }

    const form = await FbForm.findOneAndUpdate(
      { formId },
      { $set: { projectId: targetProjectId, lastSyncedAt: new Date() } },
      { new: true }
    ).populate('projectId', 'name slug');

    if (!form) {
      res.status(404).json({ success: false, error: 'Facebook form not found' });
      return;
    }

    // When a form is mapped, update leads with that formId and no projectId
    let updatedLeadsCount = 0;
    if (targetProjectId) {
      const updateResult = await Lead.updateMany(
        {
          formId,
          $or: [{ projectId: null }, { projectId: { $exists: false } }],
        },
        { $set: { projectId: targetProjectId } }
      );
      updatedLeadsCount = updateResult.modifiedCount || 0;
    }

    res.json({
      success: true,
      form,
      updatedLeadsCount,
      message: targetProjectId
        ? `Form mapped to project. Updated ${updatedLeadsCount} existing leads.`
        : 'Form unmapped from project.',
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message || 'Failed to map FB form' });
  }
}
