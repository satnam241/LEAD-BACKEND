import { Router } from 'express';
import {
  listCampaigns,
  getStats,
  getAudienceCounts,
  getTemplates,
  getCampaignById,
  createCampaign,
} from '../controllers/campaign.controller';
import { adminAuth } from '../middleware/adminAuth';

const router = Router();

router.use(adminAuth);

router.get('/stats', getStats);
router.get('/audiences', getAudienceCounts);
router.get('/templates', getTemplates);

router.get('/', listCampaigns);
router.post('/', createCampaign);
router.get('/:id', getCampaignById);

export default router;
