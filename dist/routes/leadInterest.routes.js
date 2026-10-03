"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const leadInterest_controller_1 = require("../controllers/leadInterest.controller");
const aiChat_controller_1 = require("../controllers/aiChat.controller");
const router = (0, express_1.Router)();
router.get('/', leadInterest_controller_1.listLeadInterest);
router.get('/:leadId', leadInterest_controller_1.getLeadInterestById);
router.get('/:leadId/messages', aiChat_controller_1.getLeadMessages);
router.patch('/:leadId/resume-ai', aiChat_controller_1.resumeLeadAi);
router.put('/:leadId', leadInterest_controller_1.updateLeadInterest);
router.patch('/:leadId', leadInterest_controller_1.updateLeadInterest);
exports.default = router;
//# sourceMappingURL=leadInterest.routes.js.map