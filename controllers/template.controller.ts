import { Request, Response } from 'express';
import mongoose from 'mongoose';
import Template from '../models/template.model';
import { getTenantFilter, AuthenticatedRequest } from '../middleware/adminAuth';

const NAME_REGEX = /^[a-z0-9_]+$/;

interface CreateTemplateBody {
  name: string;
  label: string;
  bodyText: string;
  variables?: string[];
  header?: string;
  imageUrl?: string;
  footer?: string;
  type?: 'text' | 'advertise';
  options?: string[];
  isDefault?: boolean;
}

export async function uploadTemplateImage(req: Request, res: Response): Promise<void> {
  try {
    if (!req.file) {
      res.status(400).json({ message: 'No image file uploaded' });
      return;
    }
    const relativeUrl = `/public/uploads/${req.file.filename}`;
    const host = req.get('host') || 'localhost:4520';
    const protocol = req.protocol || 'http';
    const fullUrl = `${protocol}://${host}${relativeUrl}`;

    res.status(201).json({
      url: fullUrl,
      relativeUrl,
      filename: req.file.filename,
    });
  } catch (err) {
    res.status(500).json({ message: 'Image upload failed', error: (err as Error).message });
  }
}

export async function listTemplates(req: Request, res: Response): Promise<void> {
  try {
    const tenantFilter = getTenantFilter(req as AuthenticatedRequest);
    const templates = await Template.find(tenantFilter).sort({ isDefault: -1, createdAt: -1 }).lean();
    res.json(templates);
  } catch (err) {
    res.status(500).json({ message: 'Failed to fetch templates', error: (err as Error).message });
  }
}

export async function getDefaultTemplate(req: Request, res: Response): Promise<void> {
  try {
    const tenantFilter = getTenantFilter(req as AuthenticatedRequest);
    let template = await Template.findOne({ ...tenantFilter, isDefault: true }).lean();
    if (!template) {
      template = await Template.findOne({ ...tenantFilter, name: { $in: ['default', 'welcome', 'default_welcome'] } }).lean();
    }
    if (!template) {
      template = await Template.findOne(tenantFilter).sort({ createdAt: -1 }).lean();
    }
    res.json({ success: true, template });
  } catch (err: any) {
    res.status(500).json({ message: 'Failed to fetch default template', error: err.message });
  }
}

export async function setDefaultTemplate(req: Request, res: Response): Promise<void> {
  try {
    const { id } = req.params;
    const tenantFilter = getTenantFilter(req as AuthenticatedRequest);
    const template = await Template.findOne({ _id: id, ...tenantFilter });
    if (!template) {
      res.status(404).json({ message: 'Template not found' });
      return;
    }

    // Set all others for this tenant to isDefault = false
    await Template.updateMany({ ...tenantFilter, _id: { $ne: template._id } }, { $set: { isDefault: false } });
    template.isDefault = true;
    await template.save();

    res.json({ success: true, message: `Template "${template.label}" is now the default message template`, template });
  } catch (err: any) {
    res.status(500).json({ message: 'Failed to set default template', error: err.message });
  }
}

export async function createTemplate(req: Request<unknown, unknown, CreateTemplateBody>, res: Response): Promise<void> {
  try {
    const { name, label, bodyText, variables = [], header, imageUrl, footer, type, options = [], isDefault = false } = req.body;

    if (!name || !label || !bodyText) {
      res.status(400).json({ message: 'name, label and bodyText are required' });
      return;
    }
    if (!NAME_REGEX.test(name)) {
      res.status(400).json({ message: 'Template name must be lowercase letters, numbers and underscores only' });
      return;
    }

    const placeholderCount = (bodyText.match(/\{\{\d+\}\}/g) || []).length;
    if (placeholderCount !== variables.length) {
      res.status(400).json({
        message: `Body has ${placeholderCount} placeholder(s) but ${variables.length} variable name(s) were given`,
      });
      return;
    }

    const tenantFilter = getTenantFilter(req as AuthenticatedRequest);
    const exists = await Template.findOne({ name, ...tenantFilter });
    if (exists) {
      res.status(409).json({ message: `Template "${name}" already exists` });
      return;
    }

    // Determine type: if advertise specified or imageUrl/header/footer/options given, type is 'advertise'
    const finalType = type || (imageUrl || header || footer || (options && options.length > 0) ? 'advertise' : 'text');

    if (isDefault) {
      await Template.updateMany(tenantFilter, { $set: { isDefault: false } });
    }

    const tenantId = (req as any).tenantId || null;
    const template = await Template.create({
      tenantId: tenantId ? (mongoose.Types.ObjectId.isValid(tenantId) ? new mongoose.Types.ObjectId(tenantId) : tenantId) : null,
      name,
      label,
      bodyText,
      variables,
      header: header?.trim() || null,
      imageUrl: imageUrl?.trim() || null,
      footer: footer?.trim() || null,
      type: finalType,
      options: Array.isArray(options) ? options.filter(Boolean) : [],
      isDefault: !!isDefault,
    });
    res.status(201).json(template);
  } catch (err) {
    res.status(500).json({ message: 'Failed to create template', error: (err as Error).message });
  }
}

export async function updateTemplate(req: Request, res: Response): Promise<void> {
  try {
    const { label, bodyText, variables, header, imageUrl, footer, type, options, isDefault } = req.body;
    const tenantFilter = getTenantFilter(req as AuthenticatedRequest);
    const existing = await Template.findOne({ _id: req.params.id, ...tenantFilter });
    if (!existing) {
      res.status(404).json({ message: 'Template not found' });
      return;
    }

    if (bodyText !== undefined && variables !== undefined) {
      const placeholderCount = (bodyText.match(/\{\{\d+\}\}/g) || []).length;
      if (placeholderCount !== variables.length) {
        res.status(400).json({
          message: `Body has ${placeholderCount} placeholder(s) but ${variables.length} variable name(s) were given`,
        });
        return;
      }
    }

    const updates: Record<string, any> = {};
    if (label !== undefined) updates.label = label;
    if (bodyText !== undefined) updates.bodyText = bodyText;
    if (variables !== undefined) updates.variables = variables;
    if (header !== undefined) updates.header = header ? header.trim() : null;
    if (imageUrl !== undefined) updates.imageUrl = imageUrl ? imageUrl.trim() : null;
    if (footer !== undefined) updates.footer = footer ? footer.trim() : null;
    if (type !== undefined) updates.type = type;
    if (options !== undefined) updates.options = Array.isArray(options) ? options.filter(Boolean) : [];
    if (isDefault !== undefined) {
      updates.isDefault = !!isDefault;
      if (isDefault) {
        await Template.updateMany({ ...tenantFilter, _id: { $ne: req.params.id } }, { $set: { isDefault: false } });
      }
    }

    const updated = await Template.findOneAndUpdate({ _id: req.params.id, ...tenantFilter }, { $set: updates }, { new: true });
    res.json(updated);
  } catch (err) {
    res.status(500).json({ message: 'Failed to update template', error: (err as Error).message });
  }
}

export async function deleteTemplate(req: Request, res: Response): Promise<void> {
  try {
    const tenantFilter = getTenantFilter(req as AuthenticatedRequest);
    const deleted = await Template.findOneAndDelete({ _id: req.params.id, ...tenantFilter });
    if (!deleted) {
      res.status(404).json({ message: 'Template not found' });
      return;
    }
    res.json({ message: 'Template deleted' });
  } catch (err) {
    res.status(500).json({ message: 'Failed to delete template', error: (err as Error).message });
  }
}
