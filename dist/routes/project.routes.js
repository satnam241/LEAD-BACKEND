"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const adminAuth_1 = require("../middleware/adminAuth");
const project_controller_1 = require("../controllers/project.controller");
const upload_1 = require("../middleware/upload");
const router = (0, express_1.Router)();
router.get('/', adminAuth_1.adminAuth, project_controller_1.listProjects);
router.get('/:id', adminAuth_1.adminAuth, project_controller_1.getProjectById);
router.post('/', adminAuth_1.adminAuth, project_controller_1.createProject);
router.put('/:id', adminAuth_1.adminAuth, project_controller_1.updateProject);
router.patch('/:id/deactivate', adminAuth_1.adminAuth, project_controller_1.deactivateProject);
// Media Upload & Delete routes for Project (Images, Videos, Map, Brochure)
router.post('/:id/media', adminAuth_1.adminAuth, upload_1.uploadMedia.fields([
    { name: 'images', maxCount: 10 },
    { name: 'videos', maxCount: 5 },
    { name: 'map', maxCount: 1 },
    { name: 'brochure', maxCount: 1 },
]), project_controller_1.uploadProjectMedia);
router.delete('/:id/media', adminAuth_1.adminAuth, project_controller_1.deleteProjectMedia);
exports.default = router;
//# sourceMappingURL=project.routes.js.map