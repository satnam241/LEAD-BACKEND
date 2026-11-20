"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const tenantSettings_controller_1 = require("../controllers/tenantSettings.controller");
const adminAuth_1 = require("../middleware/adminAuth");
const router = express_1.default.Router();
// ── Tenant Self-Service Routes (Protected by adminAuth) ──
router.get("/settings", adminAuth_1.adminAuth, tenantSettings_controller_1.getTenantSettings);
router.get("/usage", adminAuth_1.adminAuth, tenantSettings_controller_1.getTenantUsageController);
router.get("/team", adminAuth_1.adminAuth, tenantSettings_controller_1.getTenantTeamMembers);
router.put("/notification-emails", adminAuth_1.adminAuth, tenantSettings_controller_1.updateNotificationEmails);
router.put("/facebook-config", adminAuth_1.adminAuth, tenantSettings_controller_1.updateFacebookConfig);
router.get("/google/auth-url", adminAuth_1.adminAuth, tenantSettings_controller_1.getTenantGoogleAuthUrl);
router.get("/google/callback", tenantSettings_controller_1.handleTenantGoogleCallback); // Google redirects here
router.post("/google/disconnect", adminAuth_1.adminAuth, tenantSettings_controller_1.disconnectTenantGoogleCalendar);
exports.default = router;
//# sourceMappingURL=tenantSettings.routes.js.map