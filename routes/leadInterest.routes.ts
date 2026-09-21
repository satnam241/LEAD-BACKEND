import { Router } from 'express';
import { listLeadInterest, getLeadInterestById } from '../controllers/leadInterest.controller';

const router = Router();

router.get('/', listLeadInterest);
router.get('/:leadId', getLeadInterestById);

export default router;