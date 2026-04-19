"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.default = fetchWithRetry;
const axios_1 = __importDefault(require("axios"));
async function fetchWithRetry(url, retries = 3, delayMs = 500) {
    for (let i = 0; i < retries; i++) {
        try {
            const res = await axios_1.default.get(url, {
                timeout: 10000,
                validateStatus: () => true, // handle manually
            });
            if (res.status >= 200 && res.status < 300) {
                return res.data;
            }
            console.warn(`⚠️ Attempt ${i + 1}: Status ${res.status}`);
        }
        catch (err) {
            console.warn(`⚠️ Attempt ${i + 1} failed:`, err?.message);
        }
        // 🔥 exponential delay
        const wait = delayMs * Math.pow(2, i);
        await new Promise((r) => setTimeout(r, wait));
    }
    console.error("❌ All retries failed for URL:", url);
    return null;
}
//# sourceMappingURL=fetchWithRetry.js.map