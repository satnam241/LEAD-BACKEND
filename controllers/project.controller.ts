import { Request, Response } from 'express';
import Project from '../models/project.model';
import Tenant from '../models/tenant.model';
import { getTenantFilter } from '../middleware/adminAuth';

// GET /api/projects - List all projects for authenticated tenant
export async function listProjects(req: Request, res: Response): Promise<void> {
  try {
    const filter = getTenantFilter(req as any);
    const projects = await Project.find(filter).sort({ createdAt: -1 }).lean();
    res.json({ success: true, projects });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message || 'Failed to list projects' });
  }
}

// GET /api/projects/:id - Get single project by ID (tenant scoped)
export async function getProjectById(req: Request, res: Response): Promise<void> {
  try {
    const filter = { _id: req.params.id, ...getTenantFilter(req as any) };
    const project = await Project.findOne(filter).lean();
    if (!project) {
      res.status(404).json({ success: false, error: 'Project not found' });
      return;
    }
    res.json({ success: true, project });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message || 'Failed to get project' });
  }
}

// POST /api/projects - Create a new project with subscription limit verification
export async function createProject(req: Request, res: Response): Promise<void> {
  try {
    const tenantId = (req as any).tenantId;

    // Check tenant project limits via centralized Limit Service
    if (tenantId) {
      const { canTenantAddProject } = await import("../services/tenantLimitService");
      const check = await canTenantAddProject(tenantId);
      if (!check.allowed) {
        res.status(403).json({
          success: false,
          error: check.error,
        });
        return;
      }
    }

    const {
      name,
      slug,
      keywords,
      summary,
      location,
      locationUrl,
      locationLink,
      googleMapsUrl,
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

    const tenantFilter = getTenantFilter(req as any);
    const existing = await Project.findOne({ slug: finalSlug, ...tenantFilter });
    if (existing) {
      res.status(400).json({ success: false, error: 'A project with this slug or name already exists in your account' });
      return;
    }

    const finalLocationUrl = (locationUrl || locationLink || googleMapsUrl || '').toString().trim();

    const project = await Project.create({
      name: name.trim(),
      slug: finalSlug,
      tenantId: tenantId || null,
      keywords: Array.isArray(keywords) ? keywords.map((k: string) => k.trim()) : [],
      summary: summary || '',
      location: location || '',
      locationUrl: finalLocationUrl,
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
    const filter = { _id: id, ...getTenantFilter(req as any) };
    const project = await Project.findOne(filter);
    if (!project) {
      res.status(404).json({ success: false, error: 'Project not found' });
      return;
    }

    const files = req.files as { [fieldname: string]: Express.Multer.File[] } | undefined;

    if (files) {
      const imgFiles = files.images || (files as any).image;
      if (imgFiles && imgFiles.length > 0) {
        const newImages = imgFiles.map(f => `/public/uploads/${f.filename}`);
        project.images = [...(project.images || []), ...newImages];
      }
      const vidFiles = files.videos || (files as any).video;
      if (vidFiles && vidFiles.length > 0) {
        const newVideos = vidFiles.map(f => `/public/uploads/${f.filename}`);
        project.videos = [...(project.videos || []), ...newVideos];
      }
      if (files.map && files.map.length > 0) {
        project.map = `/public/uploads/${files.map[0].filename}`;
      }
      if (files.brochure && files.brochure.length > 0) {
        project.brochure = `/public/uploads/${files.brochure[0].filename}`;
      }
    }

    const { images, image, videos, video, map, brochure, locationUrl, locationLink, googleMapsUrl } = req.body;
    const directImages = images || image;
    if (directImages) {
      const arr = Array.isArray(directImages) ? directImages : [directImages];
      project.images = [...(project.images || []), ...arr.filter(Boolean)];
    }
    const directVideos = videos || video;
    if (directVideos) {
      const arr = Array.isArray(directVideos) ? directVideos : [directVideos];
      project.videos = [...(project.videos || []), ...arr.filter(Boolean)];
    }
    if (map) {
      project.map = map;
    }
    if (brochure) {
      project.brochure = brochure;
    }
    const finalLocLink = locationUrl || locationLink || googleMapsUrl;
    if (finalLocLink !== undefined) {
      project.locationUrl = finalLocLink ? String(finalLocLink).trim() : '';
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
    const filter = { _id: id, ...getTenantFilter(req as any) };
    const project = await Project.findOne(filter);
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
    const tenantFilter = getTenantFilter(req as any);

    const locLink = updateData.locationUrl || updateData.locationLink || updateData.googleMapsUrl;
    if (locLink !== undefined) {
      updateData.locationUrl = locLink ? String(locLink).trim() : '';
    }

    if (updateData.slug) {
      updateData.slug = updateData.slug.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-');
      const conflict = await Project.findOne({ slug: updateData.slug, _id: { $ne: id }, ...tenantFilter });
      if (conflict) {
        res.status(400).json({ success: false, error: 'Slug is already used by another project' });
        return;
      }
    }

    const project = await Project.findOneAndUpdate({ _id: id, ...tenantFilter }, updateData, { new: true });
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
    const tenantFilter = getTenantFilter(req as any);
    const project = await Project.findOne({ _id: id, ...tenantFilter });
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
