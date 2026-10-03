"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.listFbForms = listFbForms;
exports.syncFbForms = syncFbForms;
exports.mapFbForm = mapFbForm;
const mongoose_1 = __importDefault(require("mongoose"));
const fbForm_model_1 = __importDefault(require("../models/fbForm.model"));
const lead_model_1 = __importDefault(require("../models/lead.model"));
const project_model_1 = __importDefault(require("../models/project.model"));
const fetchWithRetry_1 = __importDefault(require("../services/fetchWithRetry"));
// GET /api/fb-forms - List forms with mapped project and lead counts
async function listFbForms(_req, res) {
    try {
        const forms = await fbForm_model_1.default.find()
            .populate('projectId', 'name slug')
            .sort({ createdAt: -1 })
            .lean();
        // Compute lead count per formId
        const leadCounts = await lead_model_1.default.aggregate([
            { $match: { formId: { $ne: null } } },
            { $group: { _id: '$formId', count: { $sum: 1 } } },
        ]);
        const countMap = new Map();
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
    }
    catch (err) {
        res.status(500).json({ success: false, error: err.message || 'Failed to list FB forms' });
    }
}
// POST /api/fb-forms/sync - Fetch forms from Meta Graph API and upsert
async function syncFbForms(_req, res) {
    try {
        const token = process.env.FB_PAGE_ACCESS_TOKEN;
        if (!token) {
            res.status(400).json({ success: false, error: 'FB_PAGE_ACCESS_TOKEN is not configured' });
            return;
        }
        const version = process.env.META_GRAPH_API_VERSION || process.env.FB_GRAPH_VERSION || 'v23.0';
        let nextUrl = `https://graph.facebook.com/${version}/me/leadgen_forms?fields=id,name,locale,status&limit=100&access_token=${token}`;
        let totalSynced = 0;
        while (nextUrl) {
            const data = await (0, fetchWithRetry_1.default)(nextUrl, 3, 1000);
            if (!data || !Array.isArray(data.data)) {
                break;
            }
            for (const item of data.data) {
                if (!item.id)
                    continue;
                // Upsert by formId without overwriting existing projectId or suggestedProject
                const existing = await fbForm_model_1.default.findOne({ formId: item.id });
                if (existing) {
                    existing.name = item.name || existing.name;
                    existing.locale = item.locale || existing.locale;
                    existing.status = item.status || existing.status;
                    existing.lastSyncedAt = new Date();
                    await existing.save();
                }
                else {
                    await fbForm_model_1.default.create({
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
    }
    catch (err) {
        res.status(500).json({ success: false, error: err.message || 'Failed to sync FB forms' });
    }
}
// PATCH /api/fb-forms/:formId - Map or unmap a form to a project
async function mapFbForm(req, res) {
    try {
        const { formId } = req.params;
        const { projectId } = req.body; // string (valid ObjectId) or null
        let targetProjectId = null;
        if (projectId) {
            if (!mongoose_1.default.Types.ObjectId.isValid(projectId)) {
                res.status(400).json({ success: false, error: 'Invalid projectId' });
                return;
            }
            const projectExists = await project_model_1.default.findById(projectId);
            if (!projectExists) {
                res.status(404).json({ success: false, error: 'Project not found' });
                return;
            }
            targetProjectId = new mongoose_1.default.Types.ObjectId(projectId);
        }
        const form = await fbForm_model_1.default.findOneAndUpdate({ formId }, { $set: { projectId: targetProjectId, lastSyncedAt: new Date() } }, { new: true }).populate('projectId', 'name slug');
        if (!form) {
            res.status(404).json({ success: false, error: 'Facebook form not found' });
            return;
        }
        // When a form is mapped, update leads with that formId and no projectId
        let updatedLeadsCount = 0;
        if (targetProjectId) {
            const updateResult = await lead_model_1.default.updateMany({
                formId,
                $or: [{ projectId: null }, { projectId: { $exists: false } }],
            }, { $set: { projectId: targetProjectId } });
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
    }
    catch (err) {
        res.status(500).json({ success: false, error: err.message || 'Failed to map FB form' });
    }
}
//# sourceMappingURL=fbForm.controller.js.map