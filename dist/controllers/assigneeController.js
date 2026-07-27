"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.deleteAssignee = exports.createAssignee = exports.getAssignees = void 0;
const assignee_model_1 = __importDefault(require("../models/assignee.model"));
const getAssignees = async (_req, res) => {
    try {
        const assignees = await assignee_model_1.default.find().sort({ name: 1 });
        return res.json({ success: true, data: assignees });
    }
    catch (err) {
        console.error("Get assignees error:", err);
        return res.status(500).json({ success: false, error: "Server error" });
    }
};
exports.getAssignees = getAssignees;
const createAssignee = async (req, res) => {
    try {
        const { name } = req.body;
        if (!name || !name.trim()) {
            return res.status(400).json({ success: false, error: "Name is required" });
        }
        const trimmed = name.trim();
        const existing = await assignee_model_1.default.findOne({ name: trimmed }).collation({
            locale: "en",
            strength: 2,
        });
        if (existing)
            return res.json({ success: true, data: existing });
        const assignee = await assignee_model_1.default.create({ name: trimmed });
        return res.status(201).json({ success: true, data: assignee });
    }
    catch (err) {
        if (err.code === 11000) {
            const existing = await assignee_model_1.default.findOne({ name: req.body.name?.trim() }).collation({
                locale: "en",
                strength: 2,
            });
            return res.json({ success: true, data: existing });
        }
        console.error("Create assignee error:", err);
        return res.status(500).json({ success: false, error: "Server error" });
    }
};
exports.createAssignee = createAssignee;
const deleteAssignee = async (req, res) => {
    try {
        await assignee_model_1.default.findByIdAndDelete(req.params.id);
        return res.json({ success: true, message: "Assignee removed" });
    }
    catch (err) {
        console.error("Delete assignee error:", err);
        return res.status(500).json({ success: false, error: "Server error" });
    }
};
exports.deleteAssignee = deleteAssignee;
//# sourceMappingURL=assigneeController.js.map