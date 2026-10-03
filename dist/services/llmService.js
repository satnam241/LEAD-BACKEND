"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.LLM_MODEL = exports.LLM_BASE_URL = void 0;
exports.cleanThinkTags = cleanThinkTags;
exports.getLLMQueueLength = getLLMQueueLength;
exports.isLLMUp = isLLMUp;
exports.askLLM = askLLM;
exports.askLLMSafe = askLLMSafe;
const openai_1 = __importDefault(require("openai"));
const axios_1 = __importDefault(require("axios"));
// Clean <think>...</think> tags and XML thinking blocks or markdown fences
function cleanThinkTags(text) {
    if (!text)
        return '';
    return text
        .replace(/<think>[\s\S]*?<\/think>/gi, '')
        .replace(/<think>[\s\S]*/gi, '')
        .trim();
}
// ── Local LLM / Llamafile Setup (Llama-3.2-3B-Instruct-Q4_K_M.gguf) ───────────
const RAW_BASE_URL = (process.env.LLM_BASE_URL || 'http://127.0.0.1:8080').trim();
exports.LLM_BASE_URL = RAW_BASE_URL.replace(/\/+$/, '').endsWith('/v1')
    ? RAW_BASE_URL.replace(/\/+$/, '')
    : `${RAW_BASE_URL.replace(/\/+$/, '')}/v1`;
exports.LLM_MODEL = (process.env.LLM_MODEL || 'Llama-3.2-3B-Instruct-Q4_K_M.gguf').trim();
const openai = new openai_1.default({
    baseURL: exports.LLM_BASE_URL,
    apiKey: process.env.OPENAI_API_KEY || 'local-no-key',
    timeout: parseInt(process.env.LLM_TIMEOUT_MS || '60000', 10),
});
function getLLMQueueLength() {
    return 0;
}
/**
 * Health check to verify if the local Llamafile / llama.cpp server is running and reachable
 */
async function isLLMUp() {
    const rootUrl = RAW_BASE_URL.replace(/\/+$/, '').replace(/\/v1$/, '');
    // 1. Check root /health endpoint of llamafile/llama.cpp
    try {
        const res = await axios_1.default.get(`${rootUrl}/health`, {
            timeout: 2500,
            validateStatus: () => true,
        });
        if (res.status === 200)
            return true;
    }
    catch { }
    // 2. Check OpenAI-compatible /v1/models endpoint
    try {
        const res = await axios_1.default.get(`${exports.LLM_BASE_URL}/models`, {
            timeout: 2500,
            validateStatus: () => true,
        });
        if (res.status === 200)
            return true;
    }
    catch { }
    // 3. Fallback check root endpoint
    try {
        const res = await axios_1.default.get(rootUrl, {
            timeout: 2000,
            validateStatus: () => true,
        });
        if (res.status === 200)
            return true;
    }
    catch { }
    return false;
}
/**
 * Calls Local Llamafile LLM using OpenAI-compatible chat completions API
 * with direct Axios fallback for resilience
 */
async function askLLM(messages, options) {
    const model = exports.LLM_MODEL;
    const maxTokens = options?.maxTokens || parseInt(process.env.LLM_MAX_TOKENS || '512', 10);
    const temperature = options?.temperature !== undefined ? options.temperature : 0.3;
    // 1. Try via OpenAI SDK client
    try {
        const response = await openai.chat.completions.create({
            model,
            messages,
            max_tokens: maxTokens,
            temperature,
        });
        const raw = response.choices?.[0]?.message?.content || '';
        const cleaned = cleanThinkTags(raw);
        if (cleaned && cleaned.trim()) {
            return cleaned;
        }
    }
    catch (sdkErr) {
        console.warn('[Local LLM] ⚠️ OpenAI SDK call failed, attempting direct HTTP fallback:', sdkErr?.message || sdkErr);
    }
    // 2. Fallback: Direct Axios POST to /v1/chat/completions
    try {
        const res = await axios_1.default.post(`${exports.LLM_BASE_URL}/chat/completions`, {
            model,
            messages,
            max_tokens: maxTokens,
            temperature,
        }, {
            timeout: parseInt(process.env.LLM_TIMEOUT_MS || '60000', 10),
            headers: { 'Content-Type': 'application/json' },
        });
        const raw = res.data?.choices?.[0]?.message?.content || '';
        const cleaned = cleanThinkTags(raw);
        if (cleaned && cleaned.trim()) {
            return cleaned;
        }
    }
    catch (axiosErr) {
        console.error('[Local LLM] ❌ Direct HTTP call to llamafile failed:', axiosErr?.message || axiosErr);
    }
    return '';
}
/**
 * Safe LLM call with fallback on error or offline model server
 */
async function askLLMSafe(messages, fallbackText, options) {
    try {
        const result = await askLLM(messages, options);
        if (!result || !result.trim()) {
            return fallbackText;
        }
        return result;
    }
    catch (err) {
        console.error('[Local LLM] ❌ askLLM error:', err?.message || err);
        return fallbackText;
    }
}
//# sourceMappingURL=llmService.js.map