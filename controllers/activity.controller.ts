import { Request, Response } from "express";
import Activity from "../models/activity.model";

// 🟢 Add new activity
export const addActivity = async (req: Request, res: Response) => {
  try {
    const { userId, adminId, text } = req.body;

    if (!userId || !text)
      return res.status(400).json({ error: "userId and text required" });

    const activity = await Activity.create({
      userId,
      adminId: adminId || "admin",
      text,
    });

    res.status(201).json(activity);
  } catch (error) {
    console.error("Error adding activity:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};

// 🟢 Get all activities for specific user
export const getActivities = async (req: Request, res: Response) => {
  try {
    const { userId } = req.params;
    const { startDate, endDate } = req.query;

    let query: any = { userId };

    // ✅ Optional date range filter
    if (startDate || endDate) {
      query.createdAt = {};
      if (startDate) query.createdAt.$gte = new Date(startDate as string);
      if (endDate) query.createdAt.$lte = new Date(endDate as string);
    }

    const activities = await Activity.find(query).sort({ createdAt: -1 });
    res.json(activities);
  } catch (error) {
    console.error("Error fetching activities:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};

// 🟢 Update activity (edit text)
export const updateActivity = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { text } = req.body;

    if (!text) return res.status(400).json({ error: "Text is required" });

    const updated = await Activity.findByIdAndUpdate(
      id,
      { text, updatedAt: new Date() },
      { new: true }
    );

    if (!updated) return res.status(404).json({ error: "Activity not found" });
    res.json(updated);
  } catch (error) {
    console.error("Error updating activity:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};

// 🗑️ Delete activity
export const deleteActivity = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    await Activity.findByIdAndDelete(id);
    res.json({ success: true });
  } catch (error) {
    console.error("Error deleting activity:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};

