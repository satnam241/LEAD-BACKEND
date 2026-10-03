"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const adminAuth_1 = require("../middleware/adminAuth");
const fbForm_controller_1 = require("../controllers/fbForm.controller");
const router = (0, express_1.Router)();
router.get('/', adminAuth_1.adminAuth, fbForm_controller_1.listFbForms);
router.post('/sync', adminAuth_1.adminAuth, fbForm_controller_1.syncFbForms);
router.patch('/:formId', adminAuth_1.adminAuth, fbForm_controller_1.mapFbForm);
exports.default = router;
//# sourceMappingURL=fbForm.routes.js.map