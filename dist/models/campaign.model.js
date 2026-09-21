"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const mongoose_1 = require("mongoose");
const recipientStatusSchema = new mongoose_1.Schema({
    leadId: { type: mongoose_1.Schema.Types.ObjectId, ref: 'Lead' },
    name: String,
    phone: String,
    status: {
        type: String,
        enum: ['queued', 'sent', 'delivered', 'read', 'failed'],
        default: 'queued',
    },
    waMessageId: String,
    error: String,
}, { _id: false });
const campaignSchema = new mongoose_1.Schema({
    name: { type: String, required: true, trim: true },
    audience: { type: String, required: true },
    template: { type: String, required: true },
    recipients: { type: Number, default: 0 },
    sent: { type: Number, default: 0 },
    failed: { type: Number, default: 0 },
    status: { type: String, enum: ['Draft', 'Running', 'Completed', 'Failed'], default: 'Draft' },
    recipientStatuses: [recipientStatusSchema],
}, { timestamps: true });
exports.default = (0, mongoose_1.model)('Campaign', campaignSchema);
//# sourceMappingURL=campaign.model.js.map