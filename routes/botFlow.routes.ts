import { Router } from 'express';
import {
  getBotFlow,
  createBotFlowStep,
  updateBotFlowStep,
  deleteBotFlowStep,
  reorderBotFlowSteps,
} from '../controllers/botFlow.controller';

const router = Router();

router.get('/', getBotFlow);
router.post('/', createBotFlowStep);
router.put('/:id', updateBotFlowStep);
router.delete('/:id', deleteBotFlowStep);
router.post('/reorder', reorderBotFlowSteps);

export default router;
