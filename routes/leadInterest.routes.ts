import { Router } from 'express';
import {
  listLeadInterest,
  getLeadInterestById,
  updateLeadInterest,
} from '../controllers/leadInterest.controller';
import {
  getLeadMessages,
  resumeLeadAi,
} from '../controllers/aiChat.controller';

const router = Router();

router.get('/', listLeadInterest);
router.get('/:leadId', getLeadInterestById);
router.get('/:leadId/messages', getLeadMessages);
router.patch('/:leadId/resume-ai', resumeLeadAi);
router.put('/:leadId', updateLeadInterest);
router.patch('/:leadId', updateLeadInterest);

export default router;