"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.listCampaigns = listCampaigns;
exports.getStats = getStats;
exports.getAudienceCounts = getAudienceCounts;
exports.getTemplates = getTemplates;
exports.getCampaignById = getCampaignById;
exports.createCampaign = createCampaign;
const campaign_model_1 = __importDefault(require("../models/campaign.model"));
const template_model_1 = __importDefault(require("../models/template.model"));
// ⚠️ Adjust this import to match your actual Lead model file/export.
const lead_model_1 = __importDefault(require("../models/lead.model"));
const audienceMap_1 = require("../config/audienceMap");
const baileysService_1 = require("../services/baileysService");
const Lead = lead_model_1.default;
async function listCampaigns(req, res) {
    try {
        const search = req.query.search || '';
        const status = req.query.status || 'All';
        const audience = req.query.audience || 'All';
        const query = {};
        if (status !== 'All')
            query.status = status;
        if (audience !== 'All')
            query.audience = audience;
        if (search.trim()) {
            const rx = new RegExp(search.trim(), 'i');
            query.$or = [{ name: rx }, { audience: rx }, { template: rx }];
        }
        const campaigns = await campaign_model_1.default.find(query).sort({ createdAt: -1 }).lean();
        res.json(campaigns);
    }
    catch (err) {
        res.status(500).json({ message: 'Failed to fetch campaigns', error: err.message });
    }
}
async function getStats(_req, res) {
    try {
        const campaigns = await campaign_model_1.default.find().lean();
        res.json({
            total: campaigns.length,
            active: campaigns.filter(c => c.status === 'Running').length,
            sent: campaigns.reduce((n, c) => n + c.sent, 0),
            failed: campaigns.reduce((n, c) => n + c.failed, 0),
        });
    }
    catch (err) {
        res.status(500).json({ message: 'Failed to compute stats', error: err.message });
    }
}
async function getAudienceCounts(_req, res) {
    try {
        const entries = await Promise.all(Object.entries(audienceMap_1.audienceMap).map(async ([label, statusValue]) => {
            let count;
            if (label === 'Follow-up Leads') {
                count = await Lead.countDocuments({ 'followUp.active': true });
            }
            else if (statusValue === null) {
                count = await Lead.countDocuments({});
            }
            else {
                count = await Lead.countDocuments({ status: statusValue });
            }
            return [label, count];
        }));
        res.json(Object.fromEntries(entries));
    }
    catch (err) {
        res.status(500).json({ message: 'Failed to compute audience counts', error: err.message });
    }
}
async function getTemplates(_req, res) {
    try {
        const templates = await template_model_1.default.find().sort({ createdAt: -1 }).lean();
        res.json(templates);
    }
    catch (err) {
        res.status(500).json({ message: 'Failed to fetch templates', error: err.message });
    }
}
async function getCampaignById(req, res) {
    try {
        const campaign = await campaign_model_1.default.findById(req.params.id).lean();
        if (!campaign) {
            res.status(404).json({ message: 'Campaign not found' });
            return;
        }
        res.json(campaign);
    }
    catch (err) {
        res.status(500).json({ message: 'Failed to fetch campaign', error: err.message });
    }
}
async function resolveEligibleLeads(audience, filters) {
    const query = {};
    if (audience === 'Follow-up Leads') {
        query['followUp.active'] = true;
    }
    else {
        const statusValue = audienceMap_1.audienceMap[audience];
        if (statusValue !== null && statusValue !== undefined)
            query.status = statusValue;
    }
    if (filters.source && filters.source !== 'All sources')
        query.source = filters.source;
    if (filters.assignedTo && filters.assignedTo !== 'All assignees')
        query.assignedTo = filters.assignedTo;
    if (filters.dateFrom || filters.dateTo) {
        const createdAt = {};
        if (filters.dateFrom)
            createdAt.$gte = new Date(filters.dateFrom);
        if (filters.dateTo)
            createdAt.$lte = new Date(filters.dateTo);
        query.createdAt = createdAt;
    }
    return Lead.find(query).lean();
}
function fillTemplate(bodyText, variables, lead) {
    const source = {
        name: lead.fullName || lead.name || '',
        property: lead.property || lead.propertyInterest || lead.extraFields?.property || '',
    };
    let result = bodyText;
    variables.forEach((v, i) => {
        result = result.split(`{{${i + 1}}}`).join(source[v] ?? '');
    });
    return result;
}
function buildFullMessage(template, lead) {
    const body = fillTemplate(template.bodyText, template.variables || [], lead);
    const parts = [];
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
async function createCampaign(req, res) {
    try {
        const { name, audience, template, filters = {}, action = 'draft' } = req.body;
        if (!name?.trim() || !audience || !template) {
            res.status(400).json({ message: 'name, audience and template are required' });
            return;
        }
        const templateData = await template_model_1.default.findOne({ name: template });
        if (!templateData) {
            res.status(400).json({ message: `Template "${template}" not found` });
            return;
        }
        const eligibleLeads = await resolveEligibleLeads(audience, filters);
        const campaign = await campaign_model_1.default.create({
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
        const { status } = (0, baileysService_1.getConnectionStatus)();
        if (status !== 'open') {
            campaign.status = 'Failed';
            await campaign.save();
            res.status(503).json({ message: 'WhatsApp is not connected — scan the QR code first, then retry.' });
            return;
        }
        const results = [];
        for (const lead of eligibleLeads) {
            const message = buildFullMessage(templateData, lead);
            let outcome;
            if (templateData.imageUrl?.trim()) {
                outcome = await (0, baileysService_1.sendMedia)(lead.phone, templateData.imageUrl.trim(), message);
            }
            else {
                outcome = await (0, baileysService_1.sendText)(lead.phone, message);
            }
            const recipientRecord = {
                leadId: lead._id,
                name: lead.fullName || lead.name || '',
                phone: lead.phone,
                status: (outcome.success ? 'sent' : 'failed'),
                waMessageId: outcome.waMessageId,
                error: outcome.error,
            };
            results.push(recipientRecord);
            // Save each recipient to the campaign immediately so read/delivery receipts find waMessageId instantly
            await campaign_model_1.default.findByIdAndUpdate(campaign._id, {
                $push: { recipientStatuses: recipientRecord },
                $inc: { sent: outcome.success ? 1 : 0, failed: outcome.success ? 0 : 1 },
            });
            // Only set initial interest to 'cold' if lead does not already have an interest status
            if (outcome.success && lead._id) {
                const existing = await lead_model_1.default.findById(lead._id).select('interestLevel').lean();
                if (!existing?.interestLevel) {
                    await lead_model_1.default.findByIdAndUpdate(lead._id, { interestLevel: 'cold' }).catch(() => { });
                }
            }
            // Anti-Ban Shield: Randomized delay between 2500ms and 4500ms prevents WhatsApp bulk-bot detection
            const jitterDelay = 2500 + Math.floor(Math.random() * 2000);
            await new Promise(r => setTimeout(r, jitterDelay));
        }
        const sentCount = results.filter(r => r.status === 'sent').length;
        const failedCount = results.filter(r => r.status === 'failed').length;
        campaign.recipientStatuses = results;
        campaign.sent = sentCount;
        campaign.failed = failedCount;
        campaign.status = eligibleLeads.length && failedCount === eligibleLeads.length ? 'Failed' : 'Completed';
        await campaign.save();
        res.status(201).json(campaign);
    }
    catch (err) {
        res.status(500).json({ message: 'Failed to create campaign', error: err.message });
    }
}
//# sourceMappingURL=campaign.controller.js.map