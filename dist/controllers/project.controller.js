"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.listProjects = listProjects;
exports.getProjectById = getProjectById;
exports.createProject = createProject;
exports.updateProject = updateProject;
exports.deactivateProject = deactivateProject;
const project_model_1 = __importDefault(require("../models/project.model"));
// GET /api/projects - List all projects
async function listProjects(_req, res) {
    try {
        const projects = await project_model_1.default.find().sort({ createdAt: -1 }).lean();
        res.json({ success: true, projects });
    }
    catch (err) {
        res.status(500).json({ success: false, error: err.message || 'Failed to list projects' });
    }
}
// GET /api/projects/:id - Get single project by ID
async function getProjectById(req, res) {
    try {
        const project = await project_model_1.default.findById(req.params.id).lean();
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
// POST /api/projects - Create a new project
async function createProject(req, res) {
    try {
        const { name, slug, keywords, summary, location, developer, priceRange, unitTypes, amenities, possession, reraNumber, paymentPlan, siteVisitInfo, currentOffers, doNotSay, faqs, welcomeMessage, isActive, } = req.body;
        if (!name || !name.trim()) {
            res.status(400).json({ success: false, error: 'Project name is required' });
            return;
        }
        const finalSlug = slug && slug.trim()
            ? slug.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-')
            : name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-');
        const existing = await project_model_1.default.findOne({ slug: finalSlug });
        if (existing) {
            res.status(400).json({ success: false, error: 'A project with this slug or name already exists' });
            return;
        }
        const project = await project_model_1.default.create({
            name: name.trim(),
            slug: finalSlug,
            keywords: Array.isArray(keywords) ? keywords.map((k) => k.trim()) : [],
            summary: summary || '',
            location: location || '',
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
            isActive: isActive !== undefined ? Boolean(isActive) : true,
        });
        res.status(201).json({ success: true, project });
    }
    catch (err) {
        res.status(500).json({ success: false, error: err.message || 'Failed to create project' });
    }
}
// PUT /api/projects/:id - Update an existing project
async function updateProject(req, res) {
    try {
        const { id } = req.params;
        const updateData = { ...req.body };
        if (updateData.slug) {
            updateData.slug = updateData.slug.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-');
            const conflict = await project_model_1.default.findOne({ slug: updateData.slug, _id: { $ne: id } });
            if (conflict) {
                res.status(400).json({ success: false, error: 'Slug is already used by another project' });
                return;
            }
        }
        const project = await project_model_1.default.findByIdAndUpdate(id, updateData, { new: true });
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
        const project = await project_model_1.default.findById(id);
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