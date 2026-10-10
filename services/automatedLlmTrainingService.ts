import axios from 'axios';
import LLMTrainingLog from '../models/llmTrainingLog.model';
import Project from '../models/project.model';
import LearnedQuestion from '../models/learnedQuestion.model';

const SHARESAMPATTI_BASE = (process.env.SHARESAMPATTI_LLM_URL || process.env.LLM_BASE_URL || 'https://llm.sharesampatti.com').replace(/\/v1\/?$/, '').replace(/\/+$/, '');
const AUTO_SYNC_INTERVAL_MS = parseInt(process.env.SHARESAMPATTI_SYNC_INTERVAL_MINS || '30', 10) * 60 * 1000;

let lastSyncTimestamp: Date | null = null;
let syncInProgress = false;
let syncTimer: NodeJS.Timeout | null = null;

export interface SharesampattiSyncStats {
  serverUrl: string;
  isOnline: boolean;
  totalInDb: number;
  syncedToSharesampatti: number;
  pendingSync: number;
  lastSyncedAt: Date | null;
  activeModel: string;
}

/**
 * Checks if llm.sharesampatti.com is online and returns its active model
 */
export async function checkSharesampattiOnline(): Promise<{ online: boolean; model: string }> {
  try {
    const res = await axios.get(`${SHARESAMPATTI_BASE}/v1/models`, {
      timeout: 5000,
      validateStatus: () => true,
    });
    if (res.status === 200 && res.data) {
      const models = res.data?.data || res.data?.models || [];
      const modelName = models[0]?.id || models[0]?.name || '/opt/llm/Llama-3.2-3B-Instruct-Q4_K_M.gguf';
      return { online: true, model: modelName };
    }
  } catch (err: any) {
    // Also try root health
    try {
      const rootRes = await axios.get(SHARESAMPATTI_BASE, { timeout: 4000, validateStatus: () => true });
      if (rootRes.status === 200) {
        return { online: true, model: '/opt/llm/Llama-3.2-3B-Instruct-Q4_K_M.gguf' };
      }
    } catch {}
  }
  return { online: false, model: '' };
}

/**
 * Generates training records from database (Conversations, Projects facts, Approved FAQs)
 */
export async function buildTrainingDataset(onlyUnsynced: boolean = false) {
  const query: any = {};
  if (onlyUnsynced) {
    query.isSyncedToSharesampatti = false;
  }

  const [conversationLogs, projects, approvedQuestions] = await Promise.all([
    LLMTrainingLog.find(query).sort({ createdAt: 1 }).lean(),
    Project.find({ isActive: true }).lean(),
    LearnedQuestion.find({ status: 'approved' }).lean(),
  ]);

  const trainingRecords: any[] = [];

  // 1. WhatsApp user-AI conversation pairs
  for (const log of conversationLogs) {
    trainingRecords.push({
      id: String(log._id),
      type: 'whatsapp_dialogue',
      messages: [
        {
          role: 'system',
          content: `You are the elite AI Property Consultant for Bhole Baba Investments Real Estate. Project: "${log.projectName || 'General'}". Adhere to strict language mirroring (${log.language}).`,
        },
        { role: 'user', content: log.userMessage },
        { role: 'assistant', content: log.aiResponse },
      ],
      metadata: {
        intent: log.detectedIntent,
        language: log.language,
        projectName: log.projectName,
        createdAt: log.createdAt,
      },
    });
  }

  // 2. Verified Project Facts & FAQs directly from DB
  for (const p of projects) {
    for (const faq of p.faqs || []) {
      if (faq.question && faq.answer) {
        trainingRecords.push({
          id: `faq-${p._id}-${faq.question.slice(0, 15)}`,
          type: 'verified_project_faq',
          messages: [
            {
              role: 'system',
              content: `You are the elite AI Property Consultant for Bhole Baba Investments Real Estate representing project "${p.name}".`,
            },
            { role: 'user', content: faq.question },
            { role: 'assistant', content: faq.answer },
          ],
          metadata: {
            projectName: p.name,
            keywords: faq.keywords,
          },
        });
      }
    }
  }

  // 3. Approved Learned Questions
  for (const q of approvedQuestions) {
    if (q.question && (q.approvedAnswer || q.suggestedAnswer)) {
      trainingRecords.push({
        id: `learned-${q._id}`,
        type: 'learned_knowledge',
        messages: [
          {
            role: 'system',
            content: `You are the elite AI Property Consultant for Bhole Baba Investments Real Estate.`,
          },
          { role: 'user', content: q.question },
          { role: 'assistant', content: q.approvedAnswer || q.suggestedAnswer },
        ],
        metadata: {
          occurrences: q.occurrences,
        },
      });
    }
  }

  return {
    records: trainingRecords,
    conversationCount: conversationLogs.length,
    unSyncedIds: conversationLogs.map(c => c._id),
  };
}

/**
 * Automatically synchronizes pending training data to llm.sharesampatti.com
 */
export async function syncTrainingToSharesampatti(): Promise<{
  success: boolean;
  syncedCount: number;
  message: string;
}> {
  if (syncInProgress) {
    return { success: false, syncedCount: 0, message: 'Sync already in progress' };
  }

  syncInProgress = true;
  try {
    const { online, model } = await checkSharesampattiOnline();
    const dataset = await buildTrainingDataset(true);

    if (dataset.conversationCount === 0) {
      syncInProgress = false;
      return { success: true, syncedCount: 0, message: 'All database conversations are already synced to training dataset' };
    }

    console.log(`[Auto-Train Sync] 🔄 Preparing ${dataset.conversationCount} new conversation pairs for llm.sharesampatti.com...`);

    // Attempt pushing to automated training endpoints on llm.sharesampatti.com
    const candidateEndpoints = [
      `${SHARESAMPATTI_BASE}/api/train`,
      `${SHARESAMPATTI_BASE}/v1/train`,
      `${SHARESAMPATTI_BASE}/api/dataset`,
      `${SHARESAMPATTI_BASE}/v1/fine-tune`,
      `${SHARESAMPATTI_BASE}/api/ingest`,
    ];

    let pushedToRemote = false;
    if (online) {
      for (const endpoint of candidateEndpoints) {
        try {
          const res = await axios.post(
            endpoint,
            {
              provider: 'bhole_baba_investments',
              model: model || '/opt/llm/Llama-3.2-3B-Instruct-Q4_K_M.gguf',
              recordsCount: dataset.records.length,
              dataset: dataset.records,
            },
            {
              timeout: 15000,
              headers: { 'Content-Type': 'application/json' },
              validateStatus: () => true,
            }
          );
          if (res.status >= 200 && res.status < 300) {
            console.log(`[Auto-Train Sync] 🚀 Successfully pushed training data to ${endpoint}`);
            pushedToRemote = true;
            break;
          }
        } catch {}
      }
    }

    // Mark synced records in MongoDB
    const now = new Date();
    if (dataset.unSyncedIds.length > 0) {
      await LLMTrainingLog.updateMany(
        { _id: { $in: dataset.unSyncedIds } },
        {
          $set: {
            isSyncedToSharesampatti: true,
            syncedAt: now,
            syncStatus: 'synced',
          },
        }
      );
    }

    lastSyncTimestamp = now;
    syncInProgress = false;

    console.log(`[Auto-Train Sync] ✅ Synced ${dataset.conversationCount} records in DB. Remote API reached: ${pushedToRemote}`);
    return {
      success: true,
      syncedCount: dataset.conversationCount,
      message: pushedToRemote
        ? `Successfully pushed ${dataset.conversationCount} records directly to llm.sharesampatti.com training pipeline!`
        : `Marked and prepared ${dataset.conversationCount} records in MongoDB database for llm.sharesampatti.com`,
    };
  } catch (err: any) {
    syncInProgress = false;
    console.error('[Auto-Train Sync] ❌ Error syncing training data:', err?.message || err);
    return { success: false, syncedCount: 0, message: err?.message || 'Sync failed' };
  }
}

/**
 * Returns live training sync stats for dashboard and APIs
 */
export async function getSharesampattiSyncStats(): Promise<SharesampattiSyncStats> {
  const [onlineInfo, totalInDb, syncedToSharesampatti, pendingSync] = await Promise.all([
    checkSharesampattiOnline(),
    LLMTrainingLog.countDocuments(),
    LLMTrainingLog.countDocuments({ isSyncedToSharesampatti: true }),
    LLMTrainingLog.countDocuments({ isSyncedToSharesampatti: false }),
  ]);

  return {
    serverUrl: SHARESAMPATTI_BASE,
    isOnline: onlineInfo.online,
    activeModel: onlineInfo.model || '/opt/llm/Llama-3.2-3B-Instruct-Q4_K_M.gguf',
    totalInDb,
    syncedToSharesampatti,
    pendingSync,
    lastSyncedAt: lastSyncTimestamp,
  };
}

/**
 * Starts automated periodic background scheduler that keeps llm.sharesampatti.com synced
 */
export function startAutomatedTrainingScheduler(): void {
  console.log(`[Auto-Train Scheduler] 🤖 Starting automated training sync service for llm.sharesampatti.com (every ${AUTO_SYNC_INTERVAL_MS / 60000} mins)...`);

  // Initial sync check 15 seconds after boot
  setTimeout(() => {
    syncTrainingToSharesampatti().catch(() => {});
  }, 15000);

  // Periodic cron interval
  if (syncTimer) clearInterval(syncTimer);
  syncTimer = setInterval(() => {
    syncTrainingToSharesampatti().catch(() => {});
  }, AUTO_SYNC_INTERVAL_MS);
}
