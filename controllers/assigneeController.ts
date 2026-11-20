import { Request, Response } from "express";
import mongoose from "mongoose";
import Assignee from "../models/assignee.model";
import { getTenantFilter, AuthenticatedRequest } from "../middleware/adminAuth";

export const getAssignees = async (req: Request, res: Response) => {
  try {
    const tenantFilter = getTenantFilter(req as AuthenticatedRequest);
    const assignees = await Assignee.find(tenantFilter).sort({ name: 1 });
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
    const tenantFilter = getTenantFilter(req as AuthenticatedRequest);
    const tenantId = (req as any).tenantId;

    const existing = await Assignee.findOne({ ...tenantFilter, name: trimmed }).collation({
      locale: "en",
      strength: 2,
    });
    if (existing) return res.json({ success: true, data: existing });

    const assignee = await Assignee.create({
      tenantId: tenantId ? (mongoose.Types.ObjectId.isValid(tenantId) ? new mongoose.Types.ObjectId(tenantId) : tenantId) : null,
      name: trimmed,
    });
    return res.status(201).json({ success: true, data: assignee });
  } catch (err: any) {
    if (err.code === 11000) {
      const tenantFilter = getTenantFilter(req as AuthenticatedRequest);
      const existing = await Assignee.findOne({ ...tenantFilter, name: req.body.name?.trim() }).collation({
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
    const tenantFilter = getTenantFilter(req as AuthenticatedRequest);
    const deleted = await Assignee.findOneAndDelete({ _id: req.params.id, ...tenantFilter });
    if (!deleted) {
      return res.status(404).json({ success: false, error: "Assignee not found" });
    }
    return res.json({ success: true, message: "Assignee removed" });
  } catch (err) {
    console.error("Delete assignee error:", err);
    return res.status(500).json({ success: false, error: "Server error" });
  }
};
