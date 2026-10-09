"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const adminAuth_1 = require("../middleware/adminAuth");
const aiChat_controller_1 = require("../controllers/aiChat.controller");
const router = (0, express_1.Router)();
// Health, Messages, and Test Diagnostic
router.get('/health', adminAuth_1.adminAuth, aiChat_controller_1.getAiHealth);
router.post('/test-query', adminAuth_1.adminAuth, aiChat_controller_1.testAiQuery);
router.get('/messages/:leadId', adminAuth_1.adminAuth, aiChat_controller_1.getLeadMessages);
router.patch('/resume/:leadId', adminAuth_1.adminAuth, aiChat_controller_1.resumeLeadAi);
// Training and FAQs insertion/management
router.get('/training-data', adminAuth_1.adminAuth, aiChat_controller_1.getTrainingData);
router.post('/train', adminAuth_1.adminAuth, aiChat_controller_1.insertTrainingData);
router.put('/training-data/:projectId/:faqIndex', adminAuth_1.adminAuth, aiChat_controller_1.updateTrainingFaq);
router.delete('/training-data/:projectId/:faqIndex', adminAuth_1.adminAuth, aiChat_controller_1.deleteTrainingFaq);
// First Message Configuration ("Pehle kya msg krna h") - Full CRUD
router.get('/first-message', adminAuth_1.adminAuth, aiChat_controller_1.getFirstMessage);
router.post('/first-message', adminAuth_1.adminAuth, aiChat_controller_1.setFirstMessage);
router.put('/first-message', adminAuth_1.adminAuth, aiChat_controller_1.setFirstMessage);
router.delete('/first-message', adminAuth_1.adminAuth, aiChat_controller_1.deleteFirstMessage);
router.delete('/first-message/:projectId', adminAuth_1.adminAuth, aiChat_controller_1.deleteFirstMessage);
// Auto-Learned Questions
router.get('/learned-questions', adminAuth_1.adminAuth, aiChat_controller_1.listLearnedQuestions);
router.post('/learned-questions/:id/approve', adminAuth_1.adminAuth, aiChat_controller_1.approveQuestion);
router.delete('/learned-questions/:id', adminAuth_1.adminAuth, aiChat_controller_1.rejectQuestion);
exports.default = router;
//# sourceMappingURL=aiChat.routes.js.map