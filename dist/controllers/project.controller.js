"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.listProjects = listProjects;
exports.getProjectById = getProjectById;
exports.createProject = createProject;
exports.uploadProjectMedia = uploadProjectMedia;
exports.deleteProjectMedia = deleteProjectMedia;
exports.updateProject = updateProject;
exports.deactivateProject = deactivateProject;
const project_model_1 = __importDefault(require("../models/project.model"));
const adminAuth_1 = require("../middleware/adminAuth");
// GET /api/projects - List all projects for authenticated tenant
async function listProjects(req, res) {
    try {
        const filter = (0, adminAuth_1.getTenantFilter)(req);
        const projects = await project_model_1.default.find(filter).sort({ createdAt: -1 }).lean();
        res.json({ success: true, projects });
    }
    catch (err) {
        res.status(500).json({ success: false, error: err.message || 'Failed to list projects' });
    }
}
// GET /api/projects/:id - Get single project by ID (tenant scoped)
async function getProjectById(req, res) {
    try {
        const filter = { _id: req.params.id, ...(0, adminAuth_1.getTenantFilter)(req) };
        const project = await project_model_1.default.findOne(filter).lean();
        if (!project) {
            res.status(404).json({ success: false, error: 'Project not found' });
            return;
        }
        res.json({ success: true, project });
    }
    catch (err) {
        res.status(500).json({ success: false, error: err.message || 'Failed to get project' });
    }
}
// POST /api/projects - Create a new project with subscription limit verification
async function createProject(req, res) {
    try {
        const tenantId = req.tenantId;
        // Check tenant project limits via centralized Limit Service
        if (tenantId) {
            const { canTenantAddProject } = await Promise.resolve().then(() => __importStar(require("../services/tenantLimitService")));
            const check = await canTenantAddProject(tenantId);
            if (!check.allowed) {
                res.status(403).json({
                    success: false,
                    error: check.error,
                });
                return;
            }
        }
        const { name, slug, keywords, summary, location, locationUrl, locationLink, googleMapsUrl, developer, priceRange, unitTypes, amenities, possession, reraNumber, paymentPlan, siteVisitInfo, currentOffers, doNotSay, faqs, welcomeMessage, images, videos, map, brochure, isActive, } = req.body;
        if (!name || !name.trim()) {
            res.status(400).json({ success: false, error: 'Project name is required' });
            return;
        }
        const finalSlug = slug && slug.trim()
            ? slug.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-')
            : name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-');
        const tenantFilter = (0, adminAuth_1.getTenantFilter)(req);
        const existing = await project_model_1.default.findOne({ slug: finalSlug, ...tenantFilter });
        if (existing) {
            res.status(400).json({ success: false, error: 'A project with this slug or name already exists in your account' });
            return;
        }
        const finalLocationUrl = (locationUrl || locationLink || googleMapsUrl || '').toString().trim();
        const project = await project_model_1.default.create({
            name: name.trim(),
            slug: finalSlug,
            tenantId: tenantId || null,
            keywords: Array.isArray(keywords) ? keywords.map((k) => k.trim()) : [],
            summary: summary || '',
            location: location || '',
            locationUrl: finalLocationUrl,
            developer: developer || '',
            priceRange: priceRange || '',
            unitTypes: Array.isArray(unitTypes) ? unitTypes : [],
            amenities: Array.isArray(amenities) ? amenities.map((a) => a.trim()) : [],
            possession: possession || '',
            reraNumber: reraNumber || '',
            paymentPlan: paymentPlan || '',
            siteVisitInfo: siteVisitInfo || '',
            currentOffers: currentOffers || '',
            doNotSay: Array.isArray(doNotSay) ? doNotSay.map((d) => d.trim()) : [],
            faqs: Array.isArray(faqs) ? faqs : [],
            welcomeMessage: welcomeMessage || '',
            images: Array.isArray(images) ? images : [],
            videos: Array.isArray(videos) ? videos : [],
            map: map || '',
            brochure: brochure || '',
            isActive: isActive !== undefined ? Boolean(isActive) : true,
        });
        res.status(201).json({ success: true, project });
    }
    catch (err) {
        res.status(500).json({ success: false, error: err.message || 'Failed to create project' });
    }
}
// POST /api/projects/:id/media - Upload images, videos, and map for a project
async function uploadProjectMedia(req, res) {
    try {
        const { id } = req.params;
        const filter = { _id: id, ...(0, adminAuth_1.getTenantFilter)(req) };
        const project = await project_model_1.default.findOne(filter);
        if (!project) {
            res.status(404).json({ success: false, error: 'Project not found' });
            return;
        }
        const files = req.files;
        if (files) {
            const imgFiles = files.images || files.image;
            if (imgFiles && imgFiles.length > 0) {
                const newImages = imgFiles.map(f => `/public/uploads/${f.filename}`);
                project.images = [...(project.images || []), ...newImages];
            }
            const vidFiles = files.videos || files.video;
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
    }
    catch (err) {
        res.status(500).json({ success: false, error: err.message || 'Failed to upload project media' });
    }
}
// DELETE /api/projects/:id/media - Delete a specific media asset from a project
async function deleteProjectMedia(req, res) {
    try {
        const { id } = req.params;
        const { type, url } = req.body;
        const filter = { _id: id, ...(0, adminAuth_1.getTenantFilter)(req) };
        const project = await project_model_1.default.findOne(filter);
        if (!project) {
            res.status(404).json({ success: false, error: 'Project not found' });
            return;
        }
        if (type === 'image' || type === 'images') {
            project.images = (project.images || []).filter(img => img !== url);
        }
        else if (type === 'video' || type === 'videos') {
            project.videos = (project.videos || []).filter(vid => vid !== url);
        }
        else if (type === 'map') {
            project.map = '';
        }
        else if (type === 'brochure') {
            project.brochure = '';
        }
        await project.save();
        res.json({ success: true, message: 'Media removed successfully', project });
    }
    catch (err) {
        res.status(500).json({ success: false, error: err.message || 'Failed to delete media' });
    }
}
// PUT /api/projects/:id - Update an existing project
async function updateProject(req, res) {
    try {
        const { id } = req.params;
        const updateData = { ...req.body };
        const tenantFilter = (0, adminAuth_1.getTenantFilter)(req);
        const locLink = updateData.locationUrl || updateData.locationLink || updateData.googleMapsUrl;
        if (locLink !== undefined) {
            updateData.locationUrl = locLink ? String(locLink).trim() : '';
        }
        if (updateData.slug) {
            updateData.slug = updateData.slug.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-');
            const conflict = await project_model_1.default.findOne({ slug: updateData.slug, _id: { $ne: id }, ...tenantFilter });
            if (conflict) {
                res.status(400).json({ success: false, error: 'Slug is already used by another project' });
                return;
            }
        }
        const project = await project_model_1.default.findOneAndUpdate({ _id: id, ...tenantFilter }, updateData, { new: true });
        if (!project) {
            res.status(404).json({ success: false, error: 'Project not found' });
            return;
        }
        res.json({ success: true, project });
    }
    catch (err) {
        res.status(500).json({ success: false, error: err.message || 'Failed to update project' });
    }
}
// PATCH /api/projects/:id/deactivate - Toggle or deactivate project
async function deactivateProject(req, res) {
    try {
        const { id } = req.params;
        const tenantFilter = (0, adminAuth_1.getTenantFilter)(req);
        const project = await project_model_1.default.findOne({ _id: id, ...tenantFilter });
        if (!project) {
            res.status(404).json({ success: false, error: 'Project not found' });
            return;
        }
        project.isActive = !project.isActive;
        await project.save();
        res.json({ success: true, project, message: `Project ${project.isActive ? 'activated' : 'deactivated'}` });
    }
    catch (err) {
        res.status(500).json({ success: false, error: err.message || 'Failed to change project status' });
    }
}
//# sourceMappingURL=project.controller.js.map