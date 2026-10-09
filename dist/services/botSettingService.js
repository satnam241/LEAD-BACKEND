"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.GLOBAL_WELCOME_KEY = void 0;
exports.getGlobalWelcomeMessage = getGlobalWelcomeMessage;
exports.setGlobalWelcomeMessage = setGlobalWelcomeMessage;
const botSetting_model_1 = __importDefault(require("../models/botSetting.model"));
const project_model_1 = __importDefault(require("../models/project.model"));
exports.GLOBAL_WELCOME_KEY = 'global_welcome_message';
/**
 * Returns the universal first message configured by admin for all leads.
 */
async function getGlobalWelcomeMessage() {
    try {
        const setting = await botSetting_model_1.default.findOne({ key: exports.GLOBAL_WELCOME_KEY }).lean();
        if (setting && typeof setting.value === 'string' && setting.value.trim()) {
            return setting.value.trim();
        }
    }
    catch (err) {
        console.error('[BotSetting] ❌ Error getting global welcome message:', err?.message || err);
    }
    return '';
}
/**
 * Saves or updates the universal first message for ALL incoming leads across CRM.
 */
async function setGlobalWelcomeMessage(message) {
    try {
        const trimmed = (message || '').trim();
        await botSetting_model_1.default.findOneAndUpdate({ key: exports.GLOBAL_WELCOME_KEY }, {
            $set: {
                value: trimmed,
                description: 'Universal first message sent automatically to all incoming leads',
            },
        }, { upsert: true, new: true });
        // Also sync to all projects so any project-level query also has it
        if (trimmed) {
            await project_model_1.default.updateMany({}, { $set: { welcomeMessage: trimmed } }).catch(() => { });
        }
        console.log(`[BotSetting] ✅ Universal welcome message saved successfully (${trimmed.length} chars)`);
    }
    catch (err) {
        console.error('[BotSetting] ❌ Error saving global welcome message:', err?.message || err);
        throw err;
    }
}
//# sourceMappingURL=botSettingService.js.map