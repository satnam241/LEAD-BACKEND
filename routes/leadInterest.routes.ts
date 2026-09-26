import { Router } from 'express';
import {
  listLeadInterest,
  getLeadInterestById,
  updateLeadInterest,
} from '../controllers/leadInterest.controller';

const router = Router();

router.get('/', listLeadInterest);
router.get('/:leadId', getLeadInterestById);
router.put('/:leadId', updateLeadInterest);
router.patch('/:leadId', updateLeadInterest);

export default router;