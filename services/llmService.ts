import OpenAI from 'openai';
import axios from 'axios';

export interface LLMMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

// Clean <think>...</think> tags and XML thinking blocks or markdown fences
export function cleanThinkTags(text: string): string {
  if (!text) return '';
  return text
    .replace(/<think>[\s\S]*?<\/think>/gi, '')
    .replace(/<think>[\s\S]*/gi, '')
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/```$/i, '')
    .trim();
}

// ── Multi-Provider Intelligent LLM Setup (Gemini Key Pool, OpenAI, Groq, Local) ────────
export interface ResolvedClient {
  client: OpenAI;
  model: string;
  provider: 'gemini' | 'openai' | 'groq' | 'local';
  keyIndex?: number;
  totalKeysInPool?: number;
}

export interface GeminiKeyEntry {
  index: number;
  apiKey: string;
  maskedKey: string;
  client: OpenAI;
  chatCount: number;
  totalRequests: number;
  rateLimitCount: number;
  errorCount: number;
  lastUsedAt: Date | null;
  cooldownUntil: number; // ms timestamp
}

let geminiPool: GeminiKeyEntry[] = [];
let currentPoolKeyString = '';
let lastKeyIndex = 0;

/**
 * Initializes or refreshes the Gemini key pool from GEMINI_API_KEYS (comma-separated) or GEMINI_API_KEY
 */
export function getGeminiKeyPool(): GeminiKeyEntry[] {
  const rawKeys = process.env.GEMINI_API_KEYS || process.env.GEMINI_API_KEY || '';
  if (rawKeys === currentPoolKeyString && geminiPool.length > 0) {
    return geminiPool;
  }

  // Parse comma or newline separated keys
  const parsed = rawKeys
    .split(/[,\n]+/)
    .map(k => k.trim())
    .filter(k => k.length > 10);

  const uniqueKeys = Array.from(new Set(parsed));

  // Preserve existing statistics if key was already in pool
  const newPool: GeminiKeyEntry[] = uniqueKeys.map((key, idx) => {
    const existing = geminiPool.find(p => p.apiKey === key);
    const masked = key.length > 10 ? `${key.slice(0, 6)}...${key.slice(-4)}` : 'key-***';
    return {
      index: idx,
      apiKey: key,
      maskedKey: masked,
      client: new OpenAI({
        baseURL: 'https://generativelanguage.googleapis.com/v1beta/openai/',
        apiKey: key,
        timeout: 30000,
      }),
      chatCount: existing?.chatCount || 0,
      totalRequests: existing?.totalRequests || 0,
      rateLimitCount: existing?.rateLimitCount || 0,
      errorCount: existing?.errorCount || 0,
      lastUsedAt: existing?.lastUsedAt || null,
      cooldownUntil: existing?.cooldownUntil || 0,
    };
  });

  geminiPool = newPool;
  currentPoolKeyString = rawKeys;
  return geminiPool;
}

/**
 * Live diagnostic statistics for Gemini Key Pool
 */
export function getGeminiPoolStats() {
  const pool = getGeminiKeyPool();
  const now = Date.now();
  return {
    totalKeys: pool.length,
    activeKeys: pool.filter(k => k.cooldownUntil <= now).length,
    cooldownKeys: pool.filter(k => k.cooldownUntil > now).length,
    totalChatsHandled: pool.reduce((acc, k) => acc + k.chatCount, 0),
    totalRequestsAttempted: pool.reduce((acc, k) => acc + k.totalRequests, 0),
    totalRateLimits: pool.reduce((acc, k) => acc + k.rateLimitCount, 0),
    keys: pool.map(k => ({
      index: k.index + 1,
      maskedKey: k.maskedKey,
      chatCount: k.chatCount,
      totalRequests: k.totalRequests,
      rateLimitCount: k.rateLimitCount,
      errorCount: k.errorCount,
      isCooldown: k.cooldownUntil > now,
      cooldownRemainingSec: k.cooldownUntil > now ? Math.ceil((k.cooldownUntil - now) / 1000) : 0,
      lastUsedAt: k.lastUsedAt,
    })),
  };
}

export function getActiveLLMClient(): ResolvedClient {
  // 1. Google Gemini Key Pool (Multi-key auto-failover, deep Hinglish/English understanding)
  const pool = getGeminiKeyPool();
  if (pool.length > 0) {
    const now = Date.now();
    // Pick first non-cooldown key starting from lastKeyIndex
    let selected = pool.find((k, idx) => idx >= lastKeyIndex && k.cooldownUntil <= now)
      || pool.find(k => k.cooldownUntil <= now);

    // If all keys are in cooldown, pick the one with earliest cooldown expiry
    if (!selected) {
      selected = [...pool].sort((a, b) => a.cooldownUntil - b.cooldownUntil)[0];
    }

    return {
      client: selected.client,
      model: process.env.GEMINI_MODEL || 'gemini-2.5-flash',
      provider: 'gemini',
      keyIndex: selected.index,
      totalKeysInPool: pool.length,
    };
  }

  // 2. OpenAI GPT-4o-mini / GPT-4o
  if (process.env.OPENAI_API_KEY && process.env.OPENAI_API_KEY.startsWith('sk-')) {
    return {
      client: new OpenAI({
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
      client: new OpenAI({
        baseURL: 'https://api.groq.com/openai/v1',
        apiKey: process.env.GROQ_API_KEY.trim(),
        timeout: 30000,
      }),
      model: process.env.GROQ_MODEL || 'llama-3.3-70b-versatile',
      provider: 'groq',
    };
  }

  // 4. Local Llamafile / llama.cpp or sharesampatti LLM
  const rawBase = (process.env.LLM_BASE_URL || 'https://llm.sharesampatti.com/v1').trim();
  const baseUrl = rawBase.replace(/\/+$/, '').endsWith('/v1')
    ? rawBase.replace(/\/+$/, '')
    : `${rawBase.replace(/\/+$/, '')}/v1`;

  return {
    client: new OpenAI({
      baseURL: baseUrl,
      apiKey: process.env.OPENAI_API_KEY || 'local-no-key',
      timeout: parseInt(process.env.LLM_TIMEOUT_MS || '60000', 10),
    }),
    model: (process.env.LLM_MODEL || '/opt/llm/Llama-3.2-3B-Instruct-Q4_K_M.gguf').trim(),
    provider: 'local',
  };
}

const RAW_BASE_URL = (process.env.LLM_BASE_URL || 'https://llm.sharesampatti.com/v1').trim();
export const LLM_BASE_URL = RAW_BASE_URL.replace(/\/+$/, '').endsWith('/v1')
  ? RAW_BASE_URL.replace(/\/+$/, '')
  : `${RAW_BASE_URL.replace(/\/+$/, '')}/v1`;

export const LLM_MODEL = (process.env.LLM_MODEL || '/opt/llm/Llama-3.2-3B-Instruct-Q4_K_M.gguf').trim();

export function getLLMQueueLength(): number {
  return 0;
}

let cachedModelId: string | null = null;

/**
 * Health check to verify if the LLM provider is reachable
 */
export async function isLLMUp(): Promise<boolean> {
  const active = getActiveLLMClient();
  if (active.provider !== 'local') {
    return true; // Cloud providers (Gemini, OpenAI, Groq) are active
  }

  const rootUrl = RAW_BASE_URL.replace(/\/+$/, '').replace(/\/v1$/, '');
  const authHeaders = process.env.OPENAI_API_KEY && process.env.OPENAI_API_KEY !== 'local-no-key'
    ? { Authorization: `Bearer ${process.env.OPENAI_API_KEY}` }
    : {};

  try {
    const res = await axios.get(`${LLM_BASE_URL}/models`, {
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
  } catch {}

  try {
    const res = await axios.get(`${rootUrl}/health`, {
      timeout: 2500,
      headers: authHeaders,
      validateStatus: () => true,
    });
    if (res.status === 200) return true;
  } catch {}

  try {
    const res = await axios.get(rootUrl, {
      timeout: 2000,
      headers: authHeaders,
      validateStatus: () => true,
    });
    if (res.status === 200) return true;
  } catch {}

  return false;
}

/**
 * Calls the active intelligent LLM (Gemini / OpenAI / Groq / Local llamafile)
 */
export async function askLLM(
  messages: LLMMessage[],
  options?: { maxTokens?: number; temperature?: number }
): Promise<string> {
  const active = getActiveLLMClient();
  const requestedMax = options?.maxTokens || parseInt(process.env.LLM_MAX_TOKENS || '400', 10);
  const maxTokens = Math.min(Math.max(requestedMax > 0 ? requestedMax : 400, 64), 1024);
  const temperature = options?.temperature !== undefined ? options.temperature : 0.3;

  // 1. Google Gemini Key Pool (Multi-Key Auto-Failover + Quota Management)
  const pool = getGeminiKeyPool();
  if (pool.length > 0) {
    const model = process.env.GEMINI_MODEL || 'gemini-2.5-flash';
    const now = Date.now();
    // Sort keys: available first, then lowest chatCount for fair load distribution
    const sortedPool = [...pool].sort((a, b) => {
      const aCooldown = a.cooldownUntil > now ? 1 : 0;
      const bCooldown = b.cooldownUntil > now ? 1 : 0;
      if (aCooldown !== bCooldown) return aCooldown - bCooldown;
      return a.chatCount - b.chatCount;
    });

    for (const keyEntry of sortedPool) {
      keyEntry.totalRequests++;
      keyEntry.lastUsedAt = new Date();
      try {
        console.log(`[Gemini Pool] 🤖 Calling Key #${keyEntry.index + 1} (${keyEntry.maskedKey} - ${model}) [Total chats: ${keyEntry.chatCount}]...`);
        const response = await keyEntry.client.chat.completions.create({
          model,
          messages,
          max_tokens: maxTokens,
          temperature,
        });

        const raw = response.choices?.[0]?.message?.content || '';
        const cleaned = cleanThinkTags(raw);
        if (cleaned && cleaned.trim()) {
          keyEntry.chatCount++;
          lastKeyIndex = (keyEntry.index + 1) % pool.length;
          console.log(`[Gemini Pool] ✅ Key #${keyEntry.index + 1} (${keyEntry.maskedKey}) generated response! (Key Chat Count: ${keyEntry.chatCount})`);
          return cleaned;
        }
      } catch (geminiErr: any) {
        keyEntry.errorCount++;
        const status = geminiErr?.status || geminiErr?.statusCode || 0;
        const errMsg = geminiErr?.message || String(geminiErr);
        const isRateLimit = status === 429 || /rate limit|resource_exhausted|quota|429/i.test(errMsg);

        if (isRateLimit) {
          keyEntry.rateLimitCount++;
          keyEntry.cooldownUntil = Date.now() + 60000; // 60s cooldown
          console.warn(`[Gemini Pool] ⚠️ Key #${keyEntry.index + 1} (${keyEntry.maskedKey}) hit quota limit (429)! Cooldown for 60s. Auto-switching to next key...`);
        } else {
          console.error(`[Gemini Pool] ❌ Key #${keyEntry.index + 1} (${keyEntry.maskedKey}) error (${status}):`, errMsg);
        }
        // Auto-switch: Continue loop to try next key in pool
      }
    }
    console.warn(`[Gemini Pool] ⚠️ All ${pool.length} Gemini key(s) exhausted/cooldown. Attempting fallback providers...`);
  }

  // 2. OpenAI GPT-4o-mini Fallback
  if (process.env.OPENAI_API_KEY && process.env.OPENAI_API_KEY.startsWith('sk-')) {
    try {
      console.log(`[LLM Service] 🤖 Calling OpenAI (${process.env.OPENAI_MODEL || 'gpt-4o-mini'})...`);
      const client = new OpenAI({
        baseURL: process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1',
        apiKey: process.env.OPENAI_API_KEY.trim(),
        timeout: 30000,
      });
      const response = await client.chat.completions.create({
        model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
        messages,
        max_tokens: maxTokens,
        temperature,
      });
      const raw = response.choices?.[0]?.message?.content || '';
      const cleaned = cleanThinkTags(raw);
      if (cleaned && cleaned.trim()) return cleaned;
    } catch (openAiErr: any) {
      console.error('[LLM Service] ❌ OpenAI fallback failed:', openAiErr?.message || openAiErr);
    }
  }

  // 3. Groq Fallback
  if (process.env.GROQ_API_KEY && process.env.GROQ_API_KEY.trim()) {
    try {
      console.log(`[LLM Service] 🤖 Calling Groq (${process.env.GROQ_MODEL || 'llama-3.3-70b-versatile'})...`);
      const client = new OpenAI({
        baseURL: 'https://api.groq.com/openai/v1',
        apiKey: process.env.GROQ_API_KEY.trim(),
        timeout: 30000,
      });
      const response = await client.chat.completions.create({
        model: process.env.GROQ_MODEL || 'llama-3.3-70b-versatile',
        messages,
        max_tokens: maxTokens,
        temperature,
      });
      const raw = response.choices?.[0]?.message?.content || '';
      const cleaned = cleanThinkTags(raw);
      if (cleaned && cleaned.trim()) return cleaned;
    } catch (groqErr: any) {
      console.error('[LLM Service] ❌ Groq fallback failed:', groqErr?.message || groqErr);
    }
  }

  // 2. Local Llamafile / llama.cpp fallback or default
  const modelCandidate = cachedModelId || LLM_MODEL;
  const apiKey = process.env.OPENAI_API_KEY;
  const authHeaders: Record<string, string> = { 'Content-Type': 'application/json' };
  if (apiKey && apiKey !== 'local-no-key') {
    authHeaders['Authorization'] = `Bearer ${apiKey}`;
  }

  const tryLocalChat = async (modelToUse: string): Promise<string | null> => {
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
    } catch (sdkErr: any) {
      console.warn(
        `[Local LLM] ⚠️ Local client call with model "${modelToUse}" failed:`,
        sdkErr?.status || '',
        sdkErr?.message || sdkErr
      );
    }

    // B. Direct Axios fallback
    try {
      const res = await axios.post(
        `${LLM_BASE_URL}/chat/completions`,
        {
          model: modelToUse,
          messages,
          max_tokens: maxTokens,
          temperature,
        },
        {
          timeout: parseInt(process.env.LLM_TIMEOUT_MS || '60000', 10),
          headers: authHeaders,
        }
      );

      const raw = res.data?.choices?.[0]?.message?.content || '';
      const cleaned = cleanThinkTags(raw);
      if (cleaned && cleaned.trim()) {
        return cleaned;
      }
    } catch (axiosErr: any) {
      const status = axiosErr.response?.status;
      const errorData = axiosErr.response?.data;
      console.error(
        `[Local LLM] ❌ Direct Axios call to llamafile failed (HTTP ${status}):`,
        errorData || axiosErr.message
      );
    }

    return null;
  };

  let result = await tryLocalChat(modelCandidate);
  if (result) return result;

  if (modelCandidate !== LLM_MODEL) {
    result = await tryLocalChat(LLM_MODEL);
    if (result) return result;
  } else if (!modelCandidate.startsWith('/opt/llm/')) {
    result = await tryLocalChat(`/opt/llm/${modelCandidate}`);
    if (result) return result;
  }

  return '';
}

/**
 * Safe LLM call with fallback on error or offline model server
 */
export async function askLLMSafe(
  messages: LLMMessage[],
  fallbackText: string,
  options?: { maxTokens?: number; temperature?: number }
): Promise<string> {
  try {
    const result = await askLLM(messages, options);
    if (!result || !result.trim()) {
      return fallbackText;
    }
    return result;
  } catch (err: any) {
    console.error('[LLM Service] ❌ askLLM error:', err?.message || err);
    return fallbackText;
  }
}
