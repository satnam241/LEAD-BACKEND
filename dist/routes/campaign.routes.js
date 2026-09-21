"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const campaign_controller_1 = require("../controllers/campaign.controller");
const router = (0, express_1.Router)();
router.get('/stats', campaign_controller_1.getStats);
router.get('/audiences', campaign_controller_1.getAudienceCounts);
router.get('/templates', campaign_controller_1.getTemplates);
router.get('/', campaign_controller_1.listCampaigns);
router.post('/', campaign_controller_1.createCampaign);
router.get('/:id', campaign_controller_1.getCampaignById);
exports.default = router;
//# sourceMappingURL=campaign.routes.js.map