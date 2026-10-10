import { Router } from 'express';
import { adminAuth } from '../middleware/adminAuth';
import {
  getAiHealth,
  getLeadMessages,
  resumeLeadAi,
  listLearnedQuestions,
  approveQuestion,
  rejectQuestion,
  getTrainingData,
  insertTrainingData,
  updateTrainingFaq,
  deleteTrainingFaq,
  getFirstMessage,
  setFirstMessage,
  deleteFirstMessage,
  testAiQuery,
  getGeminiPoolStatus,
  getTrainingLogs,
  exportTrainingLogsJsonl,
  getSharesampattiSyncData,
  triggerSharesampattiSync,
  getSharesampattiSyncStatsController,
} from '../controllers/aiChat.controller';

const router = Router();

// Health, Gemini Key Pool, Messages, and Test Diagnostic
router.get('/health', adminAuth, getAiHealth);
router.get('/gemini-pool', adminAuth, getGeminiPoolStatus);
router.post('/test-query', adminAuth, testAiQuery);
router.get('/messages/:leadId', adminAuth, getLeadMessages);
router.patch('/resume/:leadId', adminAuth, resumeLeadAi);

// Automated Training Dataset & Fine-Tuning Sync (for llm.sharesampatti.com)
router.get('/training-logs', adminAuth, getTrainingLogs);
router.get('/training-logs/export-jsonl', adminAuth, exportTrainingLogsJsonl);
router.get('/sharesampatti-sync', adminAuth, getSharesampattiSyncData);
router.post('/sharesampatti-sync/trigger', adminAuth, triggerSharesampattiSync);
router.get('/sharesampatti-sync/stats', adminAuth, getSharesampattiSyncStatsController);

// Training and FAQs insertion/management
router.get('/training-data', adminAuth, getTrainingData);
router.post('/train', adminAuth, insertTrainingData);
router.put('/training-data/:projectId/:faqIndex', adminAuth, updateTrainingFaq);
router.delete('/training-data/:projectId/:faqIndex', adminAuth, deleteTrainingFaq);

// First Message Configuration ("Pehle kya msg krna h") - Full CRUD
router.get('/first-message', adminAuth, getFirstMessage);
router.post('/first-message', adminAuth, setFirstMessage);
router.put('/first-message', adminAuth, setFirstMessage);
router.delete('/first-message', adminAuth, deleteFirstMessage);
router.delete('/first-message/:projectId', adminAuth, deleteFirstMessage);

// Auto-Learned Questions
router.get('/learned-questions', adminAuth, listLearnedQuestions);
router.post('/learned-questions/:id/approve', adminAuth, approveQuestion);
router.delete('/learned-questions/:id', adminAuth, rejectQuestion);

export default router;
