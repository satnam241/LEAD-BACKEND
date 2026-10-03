"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const adminAuth_1 = require("../middleware/adminAuth");
const project_controller_1 = require("../controllers/project.controller");
const router = (0, express_1.Router)();
router.get('/', adminAuth_1.adminAuth, project_controller_1.listProjects);
router.get('/:id', adminAuth_1.adminAuth, project_controller_1.getProjectById);
router.post('/', adminAuth_1.adminAuth, project_controller_1.createProject);
router.put('/:id', adminAuth_1.adminAuth, project_controller_1.updateProject);
router.patch('/:id/deactivate', adminAuth_1.adminAuth, project_controller_1.deactivateProject);
exports.default = router;
//# sourceMappingURL=project.routes.js.map