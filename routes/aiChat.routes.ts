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
} from '../controllers/aiChat.controller';

const router = Router();

// Health, Messages, and Test Diagnostic
router.get('/health', adminAuth, getAiHealth);
router.post('/test-query', adminAuth, testAiQuery);
router.get('/messages/:leadId', adminAuth, getLeadMessages);
router.patch('/resume/:leadId', adminAuth, resumeLeadAi);

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
