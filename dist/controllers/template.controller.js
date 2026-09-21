"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.uploadTemplateImage = uploadTemplateImage;
exports.listTemplates = listTemplates;
exports.createTemplate = createTemplate;
exports.updateTemplate = updateTemplate;
exports.deleteTemplate = deleteTemplate;
const template_model_1 = __importDefault(require("../models/template.model"));
const NAME_REGEX = /^[a-z0-9_]+$/;
async function uploadTemplateImage(req, res) {
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
    }
    catch (err) {
        res.status(500).json({ message: 'Image upload failed', error: err.message });
    }
}
async function listTemplates(_req, res) {
    try {
        const templates = await template_model_1.default.find().sort({ createdAt: -1 }).lean();
        res.json(templates);
    }
    catch (err) {
        res.status(500).json({ message: 'Failed to fetch templates', error: err.message });
    }
}
async function createTemplate(req, res) {
    try {
        const { name, label, bodyText, variables = [], header, imageUrl, footer, type, options = [] } = req.body;
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
        const exists = await template_model_1.default.findOne({ name });
        if (exists) {
            res.status(409).json({ message: `Template "${name}" already exists` });
            return;
        }
        // Determine type: if advertise specified or imageUrl/header/footer/options given, type is 'advertise'
        const finalType = type || (imageUrl || header || footer || (options && options.length > 0) ? 'advertise' : 'text');
        const template = await template_model_1.default.create({
            name,
            label,
            bodyText,
            variables,
            header: header?.trim() || null,
            imageUrl: imageUrl?.trim() || null,
            footer: footer?.trim() || null,
            type: finalType,
            options: Array.isArray(options) ? options.filter(Boolean) : [],
        });
        res.status(201).json(template);
    }
    catch (err) {
        res.status(500).json({ message: 'Failed to create template', error: err.message });
    }
}
async function updateTemplate(req, res) {
    try {
        const { label, bodyText, variables, header, imageUrl, footer, type, options } = req.body;
        const existing = await template_model_1.default.findById(req.params.id);
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
        const updates = {};
        if (label !== undefined)
            updates.label = label;
        if (bodyText !== undefined)
            updates.bodyText = bodyText;
        if (variables !== undefined)
            updates.variables = variables;
        if (header !== undefined)
            updates.header = header ? header.trim() : null;
        if (imageUrl !== undefined)
            updates.imageUrl = imageUrl ? imageUrl.trim() : null;
        if (footer !== undefined)
            updates.footer = footer ? footer.trim() : null;
        if (type !== undefined)
            updates.type = type;
        if (options !== undefined)
            updates.options = Array.isArray(options) ? options.filter(Boolean) : [];
        const updated = await template_model_1.default.findByIdAndUpdate(req.params.id, { $set: updates }, { new: true });
        res.json(updated);
    }
    catch (err) {
        res.status(500).json({ message: 'Failed to update template', error: err.message });
    }
}
async function deleteTemplate(req, res) {
    try {
        const deleted = await template_model_1.default.findByIdAndDelete(req.params.id);
        if (!deleted) {
            res.status(404).json({ message: 'Template not found' });
            return;
        }
        res.json({ message: 'Template deleted' });
    }
    catch (err) {
        res.status(500).json({ message: 'Failed to delete template', error: err.message });
    }
}
//# sourceMappingURL=template.controller.js.map