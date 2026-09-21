"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const mongoose_1 = require("mongoose");
const templateSchema = new mongoose_1.Schema({
    name: {
        type: String,
        required: true,
        unique: true,
        trim: true,
        lowercase: true,
        match: /^[a-z0-9_]+$/,
    },
    label: { type: String, required: true, trim: true },
    bodyText: { type: String, required: true },
    variables: [String],
    header: { type: String, default: null, trim: true },
    imageUrl: { type: String, default: null, trim: true },
    footer: { type: String, default: null, trim: true },
    type: { type: String, enum: ['text', 'advertise'], default: 'text' },
    options: { type: [String], default: [] },
    createdBy: { type: mongoose_1.Schema.Types.ObjectId, ref: 'User' },
}, { timestamps: true });
exports.default = (0, mongoose_1.model)('Template', templateSchema);
//# sourceMappingURL=template.model.js.map