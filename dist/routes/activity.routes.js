"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const activity_controller_1 = require("../controllers/activity.controller");
const router = express_1.default.Router();
// Add new log
router.post("/", activity_controller_1.addActivity);
// Get all logs (with optional date filter)
router.get("/:userId", activity_controller_1.getActivities);
// Update specific activity
router.put("/:id", activity_controller_1.updateActivity);
// Delete specific activity
router.delete("/:id", activity_controller_1.deleteActivity);
exports.default = router;
//# sourceMappingURL=activity.routes.js.map