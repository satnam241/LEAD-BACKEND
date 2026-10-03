import { Request, Response } from 'express';
import Project from '../models/project.model';

// GET /api/projects - List all projects
export async function listProjects(_req: Request, res: Response): Promise<void> {
  try {
    const projects = await Project.find().sort({ createdAt: -1 }).lean();
    res.json({ success: true, projects });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message || 'Failed to list projects' });
  }
}

// GET /api/projects/:id - Get single project by ID
export async function getProjectById(req: Request, res: Response): Promise<void> {
  try {
    const project = await Project.findById(req.params.id).lean();
    if (!project) {
      res.status(404).json({ success: false, error: 'Project not found' });
      return;
    }
    res.json({ success: true, project });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message || 'Failed to get project' });
  }
}

// POST /api/projects - Create a new project
export async function createProject(req: Request, res: Response): Promise<void> {
  try {
    const {
      name,
      slug,
      keywords,
      summary,
      location,
      developer,
      priceRange,
      unitTypes,
      amenities,
      possession,
      reraNumber,
      paymentPlan,
      siteVisitInfo,
      currentOffers,
      doNotSay,
      faqs,
      welcomeMessage,
      isActive,
    } = req.body;

    if (!name || !name.trim()) {
      res.status(400).json({ success: false, error: 'Project name is required' });
      return;
    }

    const finalSlug = slug && slug.trim()
      ? slug.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-')
      : name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-');

    const existing = await Project.findOne({ slug: finalSlug });
    if (existing) {
      res.status(400).json({ success: false, error: 'A project with this slug or name already exists' });
      return;
    }

    const project = await Project.create({
      name: name.trim(),
      slug: finalSlug,
      keywords: Array.isArray(keywords) ? keywords.map((k: string) => k.trim()) : [],
      summary: summary || '',
      location: location || '',
      developer: developer || '',
      priceRange: priceRange || '',
      unitTypes: Array.isArray(unitTypes) ? unitTypes : [],
      amenities: Array.isArray(amenities) ? amenities.map((a: string) => a.trim()) : [],
      possession: possession || '',
      reraNumber: reraNumber || '',
      paymentPlan: paymentPlan || '',
      siteVisitInfo: siteVisitInfo || '',
      currentOffers: currentOffers || '',
      doNotSay: Array.isArray(doNotSay) ? doNotSay.map((d: string) => d.trim()) : [],
      faqs: Array.isArray(faqs) ? faqs : [],
      welcomeMessage: welcomeMessage || '',
      isActive: isActive !== undefined ? Boolean(isActive) : true,
    });

    res.status(201).json({ success: true, project });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message || 'Failed to create project' });
  }
}

// PUT /api/projects/:id - Update an existing project
export async function updateProject(req: Request, res: Response): Promise<void> {
  try {
    const { id } = req.params;
    const updateData = { ...req.body };

    if (updateData.slug) {
      updateData.slug = updateData.slug.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-');
      const conflict = await Project.findOne({ slug: updateData.slug, _id: { $ne: id } });
      if (conflict) {
        res.status(400).json({ success: false, error: 'Slug is already used by another project' });
        return;
      }
    }

    const project = await Project.findByIdAndUpdate(id, updateData, { new: true });
    if (!project) {
      res.status(404).json({ success: false, error: 'Project not found' });
      return;
    }

    res.json({ success: true, project });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message || 'Failed to update project' });
  }
}

// PATCH /api/projects/:id/deactivate - Toggle or deactivate project
export async function deactivateProject(req: Request, res: Response): Promise<void> {
  try {
    const { id } = req.params;
    const project = await Project.findById(id);
    if (!project) {
      res.status(404).json({ success: false, error: 'Project not found' });
      return;
    }

    project.isActive = !project.isActive;
    await project.save();

    res.json({ success: true, project, message: `Project ${project.isActive ? 'activated' : 'deactivated'}` });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message || 'Failed to change project status' });
  }
}
