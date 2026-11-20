"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const superAdmin_controller_1 = require("../controllers/superAdmin.controller");
const adminAuth_1 = require("../middleware/adminAuth");
const router = express_1.default.Router();
// ── Super Admin Platform Management (All endpoints restricted to superAdminOnly) ──
router.use(adminAuth_1.adminAuth, adminAuth_1.superAdminOnly);
router.get("/overview", superAdmin_controller_1.getPlatformOverview);
router.get("/tenants", superAdmin_controller_1.getAllTenants);
router.get("/tenants/:id", superAdmin_controller_1.getTenantDetails);
router.patch("/tenants/:id/extend", superAdmin_controller_1.extendTenantSubscription);
router.patch("/tenants/:id/status", superAdmin_controller_1.toggleTenantStatus);
router.get("/transactions", superAdmin_controller_1.getAllTransactions);
router.get("/users", superAdmin_controller_1.getAllUsers);
router.patch("/users/:id/status", superAdmin_controller_1.toggleUserStatus);
exports.default = router;
//# sourceMappingURL=superAdmin.routes.js.map