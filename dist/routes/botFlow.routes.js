"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const botFlow_controller_1 = require("../controllers/botFlow.controller");
const router = (0, express_1.Router)();
router.get('/', botFlow_controller_1.getBotFlow);
router.post('/', botFlow_controller_1.createBotFlowStep);
router.put('/:id', botFlow_controller_1.updateBotFlowStep);
router.delete('/:id', botFlow_controller_1.deleteBotFlowStep);
router.post('/reorder', botFlow_controller_1.reorderBotFlowSteps);
exports.default = router;
//# sourceMappingURL=botFlow.routes.js.map