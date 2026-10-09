"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const mongoose_1 = require("mongoose");
const botSettingSchema = new mongoose_1.Schema({
    key: { type: String, required: true, unique: true, trim: true },
    value: { type: String, default: '', trim: true },
    description: { type: String, default: '' },
}, { timestamps: true });
botSettingSchema.index({ key: 1 }, { unique: true });
exports.default = (0, mongoose_1.model)('BotSetting', botSettingSchema);
//# sourceMappingURL=botSetting.model.js.map