"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const mongoose_1 = require("mongoose");
const flowOptionSchema = new mongoose_1.Schema({
    id: { type: String, required: true },
    title: { type: String, required: true, trim: true },
    detailText: { type: String, default: '' },
}, { _id: false });
const botFlowSchema = new mongoose_1.Schema({
    stepOrder: { type: Number, required: true, default: 1 },
    stepKey: { type: String, required: true, trim: true },
    question: { type: String, required: true, trim: true },
    options: {
        type: [flowOptionSchema],
        validate: [
            (val) => val.length >= 1,
            'At least one option is required',
        ],
    },
    isActive: { type: Boolean, default: true },
}, { timestamps: true });
botFlowSchema.index({ stepOrder: 1 });
botFlowSchema.index({ stepKey: 1 }, { unique: true });
exports.default = (0, mongoose_1.model)('BotFlow', botFlowSchema);
//# sourceMappingURL=botFlow.model.js.map