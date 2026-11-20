import { Request, Response } from "express";
import Lead from "../models/lead.model";
import FollowUpLog from "../models/followupLog.model";
import Admin from "../models/admin.model";
import Tenant from "../models/tenant.model";
import {
  createCalendarEvent,
  updateCalendarEvent,
  deleteCalendarEvent,
} from "../services/googleCalendar.service";
import mongoose from "mongoose";
import { getTenantFilter } from "../middleware/adminAuth";

const computeNextDate = (recurrence: string, from?: Date): Date => {
  const base = from ? new Date(from) : new Date();
  switch (recurrence) {
    case "tomorrow":
      base.setDate(base.getDate() + 1);
      break;
    case "3days":
      base.setDate(base.getDate() + 3);
      break;
    case "weekly":
      base.setDate(base.getDate() + 7);
      break;
  }
  return base;
};

// Helper to resolve Google Calendar refresh token for tenant or admin
async function getRefreshTokenForRequest(req: any): Promise<string | null> {
  try {
    if (req.tenantId) {
      const tenant = await Tenant.findById(req.tenantId).lean();
      if (tenant?.googleConfig?.refreshToken && tenant.googleConfig?.isConnected) {
        return tenant.googleConfig.refreshToken;
      }
    }
    const admin = await Admin.findById(req.adminId).lean();
    if (admin?.googleCalendar?.refreshToken && admin.googleCalendar?.isConnected) {
      return admin.googleCalendar.refreshToken;
    }
  } catch {}
  return null;
}

// ── Schedule Follow-up ────────────────────────────────────────────────────────
export const scheduleFollowUp = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { recurrence, date, message, whatsappOptIn } = req.body;
    const tenantFilter = getTenantFilter(req as any);

    const lead = await Lead.findOne({ _id: id, ...tenantFilter });
    if (!lead) {
      return res.status(404).json({ success: false, error: "Lead not found" });
    }

    if (!date && !recurrence) {
      return res.status(400).json({
        success: false,
        error: "Either date or recurrence is required",
      });
    }

    const followDate: Date = date ? new Date(date) : computeNextDate(recurrence);

    await Lead.findOneAndUpdate(
      { _id: id, ...tenantFilter },
      {
        $set: {
          "followUp.date": followDate,
          "followUp.recurrence": recurrence || "once",
          "followUp.message": message || null,
          "followUp.whatsappOptIn": !!whatsappOptIn,
          "followUp.active": true,
          "followUp.overdueStatus": "pending",
          "followUp.acknowledgedAt": null,
          "followUp.rescheduledAt": null,
          "followUp.resolvedAt": null,
          "followUp.notifiedAt": null,
          ...(message ? { note: message } : {}),
        },
      },
      { new: true }
    );

    // Google Calendar sync
    try {
      const refreshToken = await getRefreshTokenForRequest(req as any);
      if (refreshToken) {
        const updatedLead = await Lead.findById(id);
        if (updatedLead) {
          const event = await createCalendarEvent(refreshToken, updatedLead);
          if (event?.id) {
            await Lead.findByIdAndUpdate(id, { $set: { "followUp.googleEventId": event.id } });
          }
        }
      }
    } catch (calErr) {
      console.error("Google Calendar sync error (non-fatal):", calErr);
    }

    const finalLead = await Lead.findById(id);

    return res.json({
      success: true,
      message: "Follow-up scheduled successfully",
      data: finalLead?.followUp,
    });
  } catch (err) {
    console.error("Schedule error:", err);
    return res.status(500).json({ success: false, error: "Server error" });
  }
};

// ── Cancel Follow-up ──────────────────────────────────────────────────────────
export const cancelFollowUp = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const tenantFilter = getTenantFilter(req as any);

    const lead = await Lead.findOne({ _id: id, ...tenantFilter });
    if (!lead) {
      return res.status(404).json({ success: false, error: "Lead not found" });
    }

    // Google Calendar delete
    try {
      const refreshToken = await getRefreshTokenForRequest(req as any);
      if (lead.followUp?.googleEventId && refreshToken) {
        await deleteCalendarEvent(refreshToken, lead.followUp.googleEventId);
        console.log("CALENDAR DELETED");
      }
    } catch (err) {
      console.log("DELETE ERROR", err);
    }

    await Lead.findOneAndUpdate(
      { _id: id, ...tenantFilter },
      {
        $set: {
          "followUp.date": null,
          "followUp.recurrence": null,
          "followUp.message": null,
          "followUp.whatsappOptIn": false,
          "followUp.active": false,
          "followUp.overdueStatus": "pending",
          "followUp.acknowledgedAt": null,
          "followUp.rescheduledAt": null,
          "followUp.resolvedAt": null,
          "followUp.googleEventId": null,
          "followUp.notifiedAt": null,
        },
      },
      { new: true }
    );

    return res.json({ success: true, message: "Follow-up cancelled" });
  } catch (err) {
    console.error("Cancel error:", err);
    return res.status(500).json({ success: false, error: "Server error" });
  }
};

// ── List All Active Follow-ups ────────────────────────────────────────────────
export const listFollowUps = async (req: Request, res: Response) => {
  try {
    const tenantFilter = getTenantFilter(req as any);
    const followUps = await Lead.find({
      ...tenantFilter,
      "followUp.active": true,
      "followUp.date": { $ne: null },
    })
      .select("fullName phone email followUp note assignedTo assignedBy")
      .sort({ "followUp.date": 1 });

    return res.json({ success: true, data: followUps });
  } catch (err) {
    console.error("List follow-ups error:", err);
    return res.status(500).json({ success: false, error: "Server error" });
  }
};

// ── Upcoming Follow-ups ───────────────────────────────────────────────────────
export const getUpcomingFollowUps = async (req: Request, res: Response) => {
  try {
    const now = new Date();
    const { search, fromDate, toDate } = req.query;
    const tenantFilter = getTenantFilter(req as any);

    const filter: any = {
      ...tenantFilter,
      "followUp.active": true,
      "followUp.date": { $gte: now },
    };

    if (fromDate || toDate) {
      filter["followUp.date"] = {
        ...(fromDate && { $gte: new Date(fromDate as string) }),
        ...(toDate && { $lte: new Date(toDate as string) }),
      };
    }

    if (search) {
      const regex = new RegExp(search as string, "i");
      filter.$or = [{ fullName: regex }, { phone: regex }, { email: regex }];
    }

    const leads = await Lead.find(filter)
      .select("fullName phone email followUp note assignedTo assignedBy")
      .sort({ "followUp.date": 1 })
      .lean();

    const validRecurrences = ["once", "tomorrow", "3days", "weekly"];

    const data = leads.map((lead: any) => {
      let recurrence = lead.followUp?.recurrence;
      if (!validRecurrences.includes(recurrence)) recurrence = "once";
      return { ...lead, followUp: { ...lead.followUp, recurrence } };
    });

    return res.json({ success: true, count: data.length, data });
  } catch (err) {
    console.error("Upcoming follow-ups error:", err);
    return res.status(500).json({ success: false, error: "Server error" });
  }
};

// ── Due Today Follow-ups ──────────────────────────────────────────────────────
export const getDueFollowUps = async (req: Request, res: Response) => {
  try {
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);

    const endOfDay = new Date();
    endOfDay.setHours(23, 59, 59, 999);
    const tenantFilter = getTenantFilter(req as any);

    const due = await Lead.find({
      ...tenantFilter,
      "followUp.active": true,
      "followUp.date": { $gte: startOfDay, $lte: endOfDay },
    })
      .select("fullName phone email followUp note assignedTo assignedBy")
      .sort({ "followUp.date": 1 });

    return res.json({ success: true, data: due });
  } catch (err) {
    console.error("Due follow-ups error:", err);
    return res.status(500).json({ success: false, error: "Server error" });
  }
};

// ── Overdue Follow-ups ────────────────────────────────────────────────────────
export const getOverdueFollowUps = async (req: Request, res: Response) => {
  try {
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);
    const tenantFilter = getTenantFilter(req as any);

    const overdue = await Lead.find({
      ...tenantFilter,
      "followUp.date": { $ne: null, $lt: startOfDay },
      "followUp.overdueStatus": { $ne: "resolved" },
    })
      .select("fullName phone email followUp note assignedTo assignedBy status createdAt")
      .sort({ "followUp.date": 1 });

    const data = overdue.map((lead) => {
      const overdueMs = startOfDay.getTime() - new Date(lead.followUp!.date!).getTime();
      const mins = Math.floor(overdueMs / 60000);
      const hours = Math.floor(mins / 60);
      const days = Math.max(1, Math.floor(hours / 24));
      const overdueLabel = `${days}d overdue`;

      return {
        _id: lead._id,
        fullName: lead.fullName,
        phone: lead.phone,
        email: lead.email,
        status: lead.status,
        note: lead.note,
        followUp: lead.followUp,
        overdueLabel,
        overdueMs,
      };
    });

    return res.json({ success: true, count: data.length, data });
  } catch (err) {
    console.error("Overdue follow-ups error:", err);
    return res.status(500).json({ success: false, error: "Server error" });
  }
};

// ── Acknowledge Follow-up ─────────────────────────────────────────────────────
export const acknowledgeFollowUp = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const tenantFilter = getTenantFilter(req as any);

    const lead = await Lead.findOneAndUpdate(
      { _id: id, ...tenantFilter },
      {
        $set: {
          "followUp.overdueStatus": "acknowledged",
          "followUp.acknowledgedAt": new Date(),
        },
      },
      { new: true }
    );

    if (!lead) return res.status(404).json({ success: false, error: "Lead not found" });

    return res.json({ success: true, message: "Acknowledged", data: lead.followUp });
  } catch (err) {
    console.error("Acknowledge error:", err);
    return res.status(500).json({ success: false, error: "Server error" });
  }
};

// ── Resolve Follow-up ─────────────────────────────────────────────────────────
export const resolveFollowUp = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { note, type = "whatsapp" } = req.body;
    const tenantFilter = getTenantFilter(req as any);

    const lead = await Lead.findOne({ _id: id, ...tenantFilter });
    if (!lead) return res.status(404).json({ success: false, error: "Lead not found" });

    await Lead.findOneAndUpdate(
      { _id: id, ...tenantFilter },
      {
        $set: {
          "followUp.active": false,
          "followUp.overdueStatus": "resolved",
          "followUp.resolvedAt": new Date(),
          ...(note ? { note } : {}),
        },
      }
    );

    const rawId = req.params.id;
    const leadId = Array.isArray(rawId) ? rawId[0] : rawId;

    if (mongoose.Types.ObjectId.isValid(leadId)) {
      await FollowUpLog.create({
        leadId: new mongoose.Types.ObjectId(leadId),
        message: note || lead.followUp?.message || "Follow-up completed",
        type,
        status: "sent",
        scheduledAt: lead.followUp?.date,
        sentAt: new Date(),
      });
    }

    return res.json({ success: true, message: "Follow-up resolved and logged" });
  } catch (err) {
    console.error("Resolve error:", err);
    return res.status(500).json({ success: false, error: "Server error" });
  }
};

// ── Reschedule Follow-up ──────────────────────────────────────────────────────
export const rescheduleFollowUp = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { newDate } = req.body;
    const tenantFilter = getTenantFilter(req as any);

    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(10, 0, 0, 0);

    const scheduledDate = newDate ? new Date(newDate) : tomorrow;

    const lead = await Lead.findOneAndUpdate(
      { _id: id, ...tenantFilter },
      {
        $set: {
          "followUp.date": scheduledDate,
          "followUp.active": true,
          "followUp.overdueStatus": "rescheduled",
          "followUp.rescheduledAt": new Date(),
          "followUp.notifiedAt": null,
        },
      },
      { new: true }
    );

    if (!lead) {
      return res.status(404).json({ success: false, error: "Lead not found" });
    }

    try {
      const refreshToken = await getRefreshTokenForRequest(req as any);
      if (lead.followUp?.googleEventId && refreshToken) {
        await updateCalendarEvent(refreshToken, lead.followUp.googleEventId, lead);
        console.log("CALENDAR UPDATED");
      }
    } catch (err) {
      console.log("CALENDAR UPDATE ERROR", err);
    }

    return res.json({
      success: true,
      message: `Rescheduled to ${scheduledDate.toLocaleString("en-IN")}`,
      data: lead.followUp,
    });
  } catch (err) {
    console.error("Reschedule error:", err);
    return res.status(500).json({ success: false, error: "Server error" });
  }
};

// ── Follow-up Stats ───────────────────────────────────────────────────────────
export const getFollowUpStats = async (req: Request, res: Response) => {
  try {
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);
    const tenantFilter = getTenantFilter(req as any);

    const [overdue, upcoming, resolved] = await Promise.all([
      Lead.countDocuments({
        ...tenantFilter,
        "followUp.date": { $ne: null, $lt: startOfDay },
        "followUp.overdueStatus": { $ne: "resolved" },
      }),
      Lead.countDocuments({
        ...tenantFilter,
        "followUp.active": true,
        "followUp.date": { $gte: startOfDay },
      }),
      Lead.countDocuments({
        ...tenantFilter,
        "followUp.overdueStatus": "resolved",
      }),
    ]);

    return res.json({ success: true, data: { overdue, upcoming, resolved } });
  } catch (err) {
    console.error("Stats error:", err);
    return res.status(500).json({ success: false, error: "Server error" });
  }
};
