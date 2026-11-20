"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const leadController_1 = require("../controllers/leadController");
const adminAuth_1 = require("../middleware/adminAuth");
const router = express_1.default.Router();
// CRM Lead Management Routes (Protected by adminAuth)
router.post("/leads", adminAuth_1.adminAuth, leadController_1.createLeadController);
router.get("/leads", adminAuth_1.adminAuth, leadController_1.getLeadsController);
router.put("/leads/:id", adminAuth_1.adminAuth, leadController_1.updateLeadController);
router.delete("/leads/:id", adminAuth_1.adminAuth, leadController_1.deleteLeadController);
router.patch("/leads/bulk-delete", adminAuth_1.adminAuth, leadController_1.bulkDeleteLeadsController);
router.patch("/leads/:id/restore", adminAuth_1.adminAuth, leadController_1.restoreLeadController);
router.patch("/leads/bulk-restore", adminAuth_1.adminAuth, leadController_1.bulkRestoreLeadsController);
exports.default = router;
//# sourceMappingURL=leads.route.js.map