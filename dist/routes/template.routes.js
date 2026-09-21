"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const template_controller_1 = require("../controllers/template.controller");
const upload_1 = require("../middleware/upload");
const router = (0, express_1.Router)();
router.get('/', template_controller_1.listTemplates);
router.post('/', template_controller_1.createTemplate);
router.post('/upload', upload_1.upload.single('image'), template_controller_1.uploadTemplateImage);
router.put('/:id', template_controller_1.updateTemplate);
router.delete('/:id', template_controller_1.deleteTemplate);
exports.default = router;
//# sourceMappingURL=template.routes.js.map