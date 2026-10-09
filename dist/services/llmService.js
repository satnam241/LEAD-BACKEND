"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.LLM_MODEL = exports.LLM_BASE_URL = void 0;
exports.cleanThinkTags = cleanThinkTags;
exports.getActiveLLMClient = getActiveLLMClient;
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
        .replace(/^```json\s*/i, '')
        .replace(/^```\s*/i, '')
        .replace(/```$/i, '')
        .trim();
}
function getActiveLLMClient() {
    // 1. Google Gemini (Deep reasoning, superb Hinglish understanding, fast)
    if (process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY.trim()) {
        return {
            client: new openai_1.default({
                baseURL: 'https://generativelanguage.googleapis.com/v1beta/openai/',
                apiKey: process.env.GEMINI_API_KEY.trim(),
                timeout: 30000,
            }),
            model: process.env.GEMINI_MODEL || 'gemini-2.5-flash',
            provider: 'gemini',
        };
    }
    // 2. OpenAI GPT-4o-mini / GPT-4o
    if (process.env.OPENAI_API_KEY && process.env.OPENAI_API_KEY.startsWith('sk-')) {
        return {
            client: new openai_1.default({
                baseURL: process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1',
                apiKey: process.env.OPENAI_API_KEY.trim(),
                timeout: 30000,
            }),
            model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
            provider: 'openai',
        };
    }
    // 3. Groq Llama 3.3 70B Versatile
    if (process.env.GROQ_API_KEY && process.env.GROQ_API_KEY.trim()) {
        return {
            client: new openai_1.default({
                baseURL: 'https://api.groq.com/openai/v1',
                apiKey: process.env.GROQ_API_KEY.trim(),
                timeout: 30000,
            }),
            model: process.env.GROQ_MODEL || 'llama-3.3-70b-versatile',
            provider: 'groq',
        };
    }
    // 4. Local Llamafile / llama.cpp
    const rawBase = (process.env.LLM_BASE_URL || 'http://127.0.0.1:8080').trim();
    const baseUrl = rawBase.replace(/\/+$/, '').endsWith('/v1')
        ? rawBase.replace(/\/+$/, '')
        : `${rawBase.replace(/\/+$/, '')}/v1`;
    return {
        client: new openai_1.default({
            baseURL: baseUrl,
            apiKey: process.env.OPENAI_API_KEY || 'local-no-key',
            timeout: parseInt(process.env.LLM_TIMEOUT_MS || '60000', 10),
        }),
        model: (process.env.LLM_MODEL || 'Llama-3.2-3B-Instruct-Q4_K_M.gguf').trim(),
        provider: 'local',
    };
}
const RAW_BASE_URL = (process.env.LLM_BASE_URL || 'http://127.0.0.1:8080').trim();
exports.LLM_BASE_URL = RAW_BASE_URL.replace(/\/+$/, '').endsWith('/v1')
    ? RAW_BASE_URL.replace(/\/+$/, '')
    : `${RAW_BASE_URL.replace(/\/+$/, '')}/v1`;
exports.LLM_MODEL = (process.env.LLM_MODEL || 'Llama-3.2-3B-Instruct-Q4_K_M.gguf').trim();
function getLLMQueueLength() {
    return 0;
}
let cachedModelId = null;
/**
 * Health check to verify if the LLM provider is reachable
 */
async function isLLMUp() {
    const active = getActiveLLMClient();
    if (active.provider !== 'local') {
        return true; // Cloud providers (Gemini, OpenAI, Groq) are active
    }
    const rootUrl = RAW_BASE_URL.replace(/\/+$/, '').replace(/\/v1$/, '');
    const authHeaders = process.env.OPENAI_API_KEY && process.env.OPENAI_API_KEY !== 'local-no-key'
        ? { Authorization: `Bearer ${process.env.OPENAI_API_KEY}` }
        : {};
    try {
        const res = await axios_1.default.get(`${exports.LLM_BASE_URL}/models`, {
            timeout: 3000,
            headers: authHeaders,
            validateStatus: () => true,
        });
        if (res.status === 200 && res.data) {
            const models = res.data?.data || res.data?.models || [];
            if (models.length > 0 && models[0]?.id) {
                cachedModelId = models[0].id;
            }
            return true;
        }
    }
    catch { }
    try {
        const res = await axios_1.default.get(`${rootUrl}/health`, {
            timeout: 2500,
            headers: authHeaders,
            validateStatus: () => true,
        });
        if (res.status === 200)
            return true;
    }
    catch { }
    try {
        const res = await axios_1.default.get(rootUrl, {
            timeout: 2000,
            headers: authHeaders,
            validateStatus: () => true,
        });
        if (res.status === 200)
            return true;
    }
    catch { }
    return false;
}
/**
 * Calls the active intelligent LLM (Gemini / OpenAI / Groq / Local llamafile)
 */
async function askLLM(messages, options) {
    const active = getActiveLLMClient();
    const requestedMax = options?.maxTokens || parseInt(process.env.LLM_MAX_TOKENS || '400', 10);
    const maxTokens = Math.min(Math.max(requestedMax > 0 ? requestedMax : 400, 64), 1024);
    const temperature = options?.temperature !== undefined ? options.temperature : 0.3;
    // 1. If using Cloud Provider (Gemini / OpenAI / Groq):
    if (active.provider !== 'local') {
        try {
            console.log(`[LLM Service] 🤖 Calling ${active.provider.toUpperCase()} (${active.model})...`);
            const response = await active.client.chat.completions.create({
                model: active.model,
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
        catch (apiErr) {
            console.error(`[LLM Service] ❌ ${active.provider.toUpperCase()} call failed:`, apiErr?.status || '', apiErr?.message || apiErr);
        }
    }
    // 2. Local Llamafile / llama.cpp fallback or default
    const modelCandidate = cachedModelId || exports.LLM_MODEL;
    const apiKey = process.env.OPENAI_API_KEY;
    const authHeaders = { 'Content-Type': 'application/json' };
    if (apiKey && apiKey !== 'local-no-key') {
        authHeaders['Authorization'] = `Bearer ${apiKey}`;
    }
    const tryLocalChat = async (modelToUse) => {
        // A. Via local OpenAI SDK client
        try {
            const response = await active.client.chat.completions.create({
                model: modelToUse,
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
            console.warn(`[Local LLM] ⚠️ Local client call with model "${modelToUse}" failed:`, sdkErr?.status || '', sdkErr?.message || sdkErr);
        }
        // B. Direct Axios fallback
        try {
            const res = await axios_1.default.post(`${exports.LLM_BASE_URL}/chat/completions`, {
                model: modelToUse,
                messages,
                max_tokens: maxTokens,
                temperature,
            }, {
                timeout: parseInt(process.env.LLM_TIMEOUT_MS || '60000', 10),
                headers: authHeaders,
            });
            const raw = res.data?.choices?.[0]?.message?.content || '';
            const cleaned = cleanThinkTags(raw);
            if (cleaned && cleaned.trim()) {
                return cleaned;
            }
        }
        catch (axiosErr) {
            const status = axiosErr.response?.status;
            const errorData = axiosErr.response?.data;
            console.error(`[Local LLM] ❌ Direct Axios call to llamafile failed (HTTP ${status}):`, errorData || axiosErr.message);
        }
        return null;
    };
    let result = await tryLocalChat(modelCandidate);
    if (result)
        return result;
    if (modelCandidate !== exports.LLM_MODEL) {
        result = await tryLocalChat(exports.LLM_MODEL);
        if (result)
            return result;
    }
    else if (!modelCandidate.startsWith('/opt/llm/')) {
        result = await tryLocalChat(`/opt/llm/${modelCandidate}`);
        if (result)
            return result;
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
        console.error('[LLM Service] ❌ askLLM error:', err?.message || err);
        return fallbackText;
    }
}
//# sourceMappingURL=llmService.js.map