
import { Request, Response } from "express";
import Assignee from "../models/assignee.model";

export const getAssignees = async (_req: Request, res: Response) => {
  try {
    const assignees = await Assignee.find().sort({ name: 1 });
    return res.json({ success: true, data: assignees });
  } catch (err) {
    console.error("Get assignees error:", err);
    return res.status(500).json({ success: false, error: "Server error" });
  }
};

export const createAssignee = async (req: Request, res: Response) => {
  try {
    const { name } = req.body;
    if (!name || !name.trim()) {
      return res.status(400).json({ success: false, error: "Name is required" });
    }
    const trimmed = name.trim();

    const existing = await Assignee.findOne({ name: trimmed }).collation({
      locale: "en",
      strength: 2,
    });
    if (existing) return res.json({ success: true, data: existing });

    const assignee = await Assignee.create({ name: trimmed });
    return res.status(201).json({ success: true, data: assignee });
  } catch (err: any) {
    if (err.code === 11000) {
      const existing = await Assignee.findOne({ name: req.body.name?.trim() }).collation({
        locale: "en",
        strength: 2,
      });
      return res.json({ success: true, data: existing });
    }
    console.error("Create assignee error:", err);
    return res.status(500).json({ success: false, error: "Server error" });
  }
};

export const deleteAssignee = async (req: Request, res: Response) => {
  try {
    await Assignee.findByIdAndDelete(req.params.id);
    return res.json({ success: true, message: "Assignee removed" });
  } catch (err) {
    console.error("Delete assignee error:", err);
    return res.status(500).json({ success: false, error: "Server error" });
  }
};