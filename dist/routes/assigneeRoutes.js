"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const assigneeController_1 = require("../controllers/assigneeController");
const adminAuth_1 = require("../middleware/adminAuth");
const router = (0, express_1.Router)();
router.get("/", adminAuth_1.adminAuth, assigneeController_1.getAssignees);
router.post("/", adminAuth_1.adminAuth, assigneeController_1.createAssignee);
router.delete("/:id", adminAuth_1.adminAuth, assigneeController_1.deleteAssignee);
exports.default = router;
//# sourceMappingURL=assigneeRoutes.js.map