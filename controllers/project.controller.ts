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
      images,
      videos,
      map,
      brochure,
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
      images: Array.isArray(images) ? images : [],
      videos: Array.isArray(videos) ? videos : [],
      map: map || '',
      brochure: brochure || '',
      isActive: isActive !== undefined ? Boolean(isActive) : true,
    });

    res.status(201).json({ success: true, project });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message || 'Failed to create project' });
  }
}

// POST /api/projects/:id/media - Upload images, videos, and map for a project
export async function uploadProjectMedia(req: Request, res: Response): Promise<void> {
  try {
    const { id } = req.params;
    const project = await Project.findById(id);
    if (!project) {
      res.status(404).json({ success: false, error: 'Project not found' });
      return;
    }

    const files = req.files as { [fieldname: string]: Express.Multer.File[] } | undefined;

    if (files) {
      if (files.images && files.images.length > 0) {
        const newImages = files.images.map(f => `/public/uploads/${f.filename}`);
        project.images = [...(project.images || []), ...newImages];
      }
      if (files.videos && files.videos.length > 0) {
        const newVideos = files.videos.map(f => `/public/uploads/${f.filename}`);
        project.videos = [...(project.videos || []), ...newVideos];
      }
      if (files.map && files.map.length > 0) {
        project.map = `/public/uploads/${files.map[0].filename}`;
      }
      if (files.brochure && files.brochure.length > 0) {
        project.brochure = `/public/uploads/${files.brochure[0].filename}`;
      }
    }

    // Also support passing direct URLs in body (e.g. hosted links)
    const { images, videos, map, brochure } = req.body;
    if (images) {
      const arr = Array.isArray(images) ? images : [images];
      project.images = [...(project.images || []), ...arr.filter(Boolean)];
    }
    if (videos) {
      const arr = Array.isArray(videos) ? videos : [videos];
      project.videos = [...(project.videos || []), ...arr.filter(Boolean)];
    }
    if (map) {
      project.map = map;
    }
    if (brochure) {
      project.brochure = brochure;
    }

    await project.save();
    res.json({
      success: true,
      message: 'Project media uploaded and saved successfully',
      project,
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message || 'Failed to upload project media' });
  }
}

// DELETE /api/projects/:id/media - Delete a specific media asset from a project
export async function deleteProjectMedia(req: Request, res: Response): Promise<void> {
  try {
    const { id } = req.params;
    const { type, url } = req.body;
    const project = await Project.findById(id);
    if (!project) {
      res.status(404).json({ success: false, error: 'Project not found' });
      return;
    }

    if (type === 'image' || type === 'images') {
      project.images = (project.images || []).filter(img => img !== url);
    } else if (type === 'video' || type === 'videos') {
      project.videos = (project.videos || []).filter(vid => vid !== url);
    } else if (type === 'map') {
      project.map = '';
    } else if (type === 'brochure') {
      project.brochure = '';
    }

    await project.save();
    res.json({ success: true, message: 'Media removed successfully', project });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message || 'Failed to delete media' });
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
