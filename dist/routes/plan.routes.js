"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const plan_controller_1 = require("../controllers/plan.controller");
const adminAuth_1 = require("../middleware/adminAuth");
const router = express_1.default.Router();
// ── Public Routes (Landing Page) ──
router.get("/public", plan_controller_1.getPublicPlans);
router.get("/public/:idOrSlug", plan_controller_1.getPlanDetails);
// ── Super Admin Management Routes ──
router.get("/", adminAuth_1.adminAuth, adminAuth_1.superAdminOnly, plan_controller_1.getAllPlansAdmin);
router.post("/", adminAuth_1.adminAuth, adminAuth_1.superAdminOnly, plan_controller_1.createPlan);
router.put("/:id", adminAuth_1.adminAuth, adminAuth_1.superAdminOnly, plan_controller_1.updatePlan);
router.patch("/:id/toggle", adminAuth_1.adminAuth, adminAuth_1.superAdminOnly, plan_controller_1.togglePlanStatus);
router.delete("/:id", adminAuth_1.adminAuth, adminAuth_1.superAdminOnly, plan_controller_1.deletePlan);
exports.default = router;
//# sourceMappingURL=plan.routes.js.map