import { Router } from 'express';
import {
  listCampaigns,
  getStats,
  getAudienceCounts,
  getTemplates,
  getCampaignById,
  createCampaign,
} from '../controllers/campaign.controller';

const router = Router();

router.get('/stats', getStats);
router.get('/audiences', getAudienceCounts);
router.get('/templates', getTemplates);

router.get('/', listCampaigns);
router.post('/', createCampaign);
router.get('/:id', getCampaignById);

export default router;