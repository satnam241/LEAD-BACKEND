"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const mongoose_1 = require("mongoose");
const llmTrainingLogSchema = new mongoose_1.Schema({
    leadId: { type: mongoose_1.Schema.Types.ObjectId, ref: 'Lead' },
    phone: { type: String, trim: true },
    language: { type: String, enum: ['english', 'hindi', 'hinglish'], default: 'hinglish' },
    detectedIntent: { type: String, trim: true },
    projectId: { type: mongoose_1.Schema.Types.ObjectId, ref: 'Project' },
    projectName: { type: String, trim: true },
    userMessage: { type: String, required: true, trim: true },
    aiResponse: { type: String, required: true, trim: true },
    source: { type: String, default: 'whatsapp' },
    isReviewed: { type: Boolean, default: false },
    qualityScore: { type: Number, default: 5 },
    isSyncedToSharesampatti: { type: Boolean, default: false },
    syncedAt: { type: Date },
    syncStatus: { type: String, enum: ['pending', 'synced', 'failed'], default: 'pending' },
}, { timestamps: true });
llmTrainingLogSchema.index({ createdAt: -1 });
llmTrainingLogSchema.index({ language: 1 });
llmTrainingLogSchema.index({ detectedIntent: 1 });
llmTrainingLogSchema.index({ isSyncedToSharesampatti: 1 });
exports.default = (0, mongoose_1.model)('LLMTrainingLog', llmTrainingLogSchema);
//# sourceMappingURL=llmTrainingLog.model.js.map