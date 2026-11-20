import { Request, Response } from "express";
import Lead from "../models/lead.model";
import Tenant from "../models/tenant.model";
import { sendMessageToLead } from "../services/messageService";
import { getTenantFilter, AuthenticatedRequest } from "../middleware/adminAuth";
import { canTenantAddLeads, checkAndSendLeadLimitNotification } from "../services/tenantLimitService";

function extractFields(rawData: any) {
  const extracted: Record<string, any> = {
    fullName: null,
    email: null,
    phone: null,
    message: null,
    source: "facebook",
    extraFields: {},
  };

  if (!rawData) return extracted;

  const messageKeys = [
    "message",
    "description",
    "query",
    "requirement",
    "comment",
    "details",
    "note",
    "feedback",
  ];

  if (Array.isArray(rawData.field_data)) {
    for (const f of rawData.field_data) {
      const key = (f.name || "").toLowerCase();
      const val = f.values?.[0];
      if (!val) continue;
      if (key.includes("name")) extracted.fullName ||= val;
      else if (key.includes("email")) extracted.email ||= val;
      else if (key.includes("phone") || key.includes("mobile")) extracted.phone ||= val;
      else if (messageKeys.some((k) => key.includes(k))) extracted.message ||= val;
      else extracted.extraFields[key] = val;
    }
  }

  for (const [key, val] of Object.entries(rawData)) {
    const k = key.toLowerCase();
    if (!val) continue;
    if (k.includes("name")) extracted.fullName ||= val;
    else if (k.includes("email")) extracted.email ||= val;
    else if (k.includes("phone")) extracted.phone ||= val;
    else if (messageKeys.some((m) => k.includes(m))) extracted.message ||= val;
    else extracted.extraFields[k] = val;
  }

  if (!extracted.message) {
    const possibleMessage = Object.values(rawData).find(
      (v) => typeof v === "string" && v.length > 10
    );
    if (possibleMessage) extracted.message = possibleMessage;
  }

  return extracted;
}

// ── Create Lead ───────────────────────────────────────────────────────────────
export const createLeadController = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const tenantId = req.tenantId || req.body.tenantId;

    // Real-time monthly limit check
    if (tenantId) {
      const check = await canTenantAddLeads(tenantId, 1);
      if (!check.allowed) {
        return res.status(403).json({
          success: false,
          error: check.error,
          limitReached: true,
          currentCount: check.currentCount,
          maxLeads: check.maxLeads,
        });
      }
    }

    const {
      fullName: bodyFullName,
      email: bodyEmail,
      phone: bodyPhone,
      phoneVerified,
      whenAreYouPlanningToPurchase,
      whatIsYourBudget,
      source: bodySource,
      status: bodyStatus,
      followUp: bodyFollowUp,
      rawData,
      message: bodyMessage,
      note: bodyNote,
      assignedTo,
      assignedBy,
      interestLevel: bodyInterestLevel,
      interest: bodyInterest,
      projectId,
    } = req.body;

    const extracted = extractFields(rawData || {});
    const fullName = bodyFullName || extracted.fullName || "Unknown User";
    const email = bodyEmail || extracted.email || null;
    const phone = bodyPhone || extracted.phone || null;

    const message =
      bodyMessage ||
      extracted.message ||
      rawData?.message ||
      "No message provided";

    const finalBudget =
      whatIsYourBudget ||
      extracted.extraFields?.["what_is_your_budget_"] ||
      null;

    const finalTimeline =
      whenAreYouPlanningToPurchase ||
      extracted.extraFields?.["when_are_you_planning_to_purchase_"] ||
      null;

    const source = bodySource || extracted.source || "import";

    const rawInterest = bodyInterestLevel || bodyInterest || null;
    const finalInterest =
      rawInterest && ["hot", "warm", "cold"].includes(String(rawInterest).toLowerCase().trim())
        ? (String(rawInterest).toLowerCase().trim() as "hot" | "warm" | "cold")
        : null;

    if (!fullName && !email && !phone) {
      return res.status(400).json({ error: "Lead must include at least one of: fullName, email, or phone." });
    }

    const isContacted = bodyStatus && String(bodyStatus).toLowerCase() === "contacted";
    const lead = new Lead({
      tenantId: tenantId || null,
      projectId: projectId || null,
      fullName,
      email,
      phone,
      phoneVerified: phoneVerified || false,
      whenAreYouPlanningToPurchase: finalTimeline,
      whatIsYourBudget: finalBudget,
      message,
      source,
      status: bodyStatus ? String(bodyStatus).toLowerCase() : "new",
      contactedAt: isContacted ? new Date() : null,
      statusUpdatedAt: new Date(),
      interestLevel: finalInterest,
      followUp: bodyFollowUp || undefined,
      note: bodyNote || null,
      assignedTo: assignedTo || null,
      assignedBy: assignedBy || null,
      extraFields: extracted.extraFields,
      rawData: { ...rawData, extractedMessage: message, extraFields: extracted.extraFields },
    });
    await lead.save();
    console.log("🆕 New Lead Created:", String(lead._id), tenantId ? `(Tenant: ${tenantId})` : "");

    // Real-time limit threshold notification check (80% / 100%)
    if (tenantId) {
      checkAndSendLeadLimitNotification(tenantId).catch(console.error);
    }

    // Auto message (non-blocking)
    (async () => {
      try {
        await sendMessageToLead({ leadId: (lead._id as any).toString(), messageType: "both" });
        console.log("📩 Auto message sent:", String(lead._id));
      } catch (err) {
        console.error("⚠️ Auto message failed:", err);
      }
    })();

    return res.status(201).json({ success: true, data: lead });
  } catch (err: any) {
    console.error("💥 Error createLeadController:", err);
    return res.status(500).json({
      success: false,
      error: err.message || "Failed to create lead",
    });
  }
};

// ── Update Lead ───────────────────────────────────────────────────────────────
export const updateLeadController = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id } = req.params;
    const updates = { ...req.body };
    const tenantFilter = getTenantFilter(req);

    if (updates.status) {
      updates.status = updates.status.toLowerCase();
      if (updates.status === "contacted") {
        updates.contactedAt = new Date();
      }
      updates.statusUpdatedAt = new Date();
    }

    if (
      Object.prototype.hasOwnProperty.call(updates, "interestLevel") ||
      Object.prototype.hasOwnProperty.call(updates, "interest")
    ) {
      const raw = updates.interestLevel !== undefined ? updates.interestLevel : updates.interest;
      updates.interestLevel =
        raw && ["hot", "warm", "cold"].includes(String(raw).toLowerCase().trim())
          ? String(raw).toLowerCase().trim()
          : null;
    }

    const existingLead = await Lead.findOne({ _id: id, ...tenantFilter });
    if (!existingLead) return res.status(404).json({ error: "Lead not found" });

    const followUpSync: Record<string, any> = {};
    if (Object.prototype.hasOwnProperty.call(updates, "note")) {
      followUpSync["followUp.message"] = updates.note;
    }

    const updatedLead = await Lead.findOneAndUpdate(
      { _id: id, ...tenantFilter },
      {
        $set: {
          ...updates,
          ...followUpSync,
          rawData: updates.rawData
            ? {
                ...existingLead.rawData,
                ...updates.rawData,
                extraFields: {
                  ...existingLead.rawData?.extraFields,
                  ...updates.rawData?.extraFields,
                },
              }
            : existingLead.rawData,
        },
      },
      { new: true }
    );

    return res.status(200).json({ success: true, lead: updatedLead, data: updatedLead });
  } catch (err) {
    console.error("💥 Error updateLeadController:", err);
    return res.status(500).json({ error: "Failed to update lead" });
  }
};

// ── Delete Lead (soft) ────────────────────────────────────────────────────────
export const deleteLeadController = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id } = req.params;
    const tenantFilter = getTenantFilter(req);
    const lead = await Lead.findOneAndUpdate(
      { _id: id, ...tenantFilter },
      { isDeleted: true, deletedAt: new Date() },
      { new: true }
    );
    if (!lead) return res.status(404).json({ error: "Lead not found" });
    console.log("🗑️ Soft deleted lead:", String(lead._id));
    return res.status(200).json({
      success: true,
      message: "Lead moved to trash",
      data: { id: lead._id, deletedAt: lead.deletedAt },
    });
  } catch (err) {
    console.error("💥 Error delete Lead:", err);
    return res.status(500).json({ success: false, error: "Failed to delete lead" });
  }
};

// ── Restore Lead ──────────────────────────────────────────────────────────────
export const restoreLeadController = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id } = req.params;
    const tenantFilter = getTenantFilter(req);
    const lead = await Lead.findOneAndUpdate(
      { _id: id, ...tenantFilter },
      { isDeleted: false, deletedAt: null },
      { new: true }
    );
    if (!lead) return res.status(404).json({ error: "Lead not found" });
    return res.json({ success: true, message: "Lead restored successfully", data: lead });
  } catch (err) {
    console.error("Restore error:", err);
    return res.status(500).json({ error: "Failed to restore lead" });
  }
};

// ── Bulk Delete ───────────────────────────────────────────────────────────────
export const bulkDeleteLeadsController = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { ids } = req.body;
    if (!Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ success: false, error: "ids array is required" });
    }

    const tenantFilter = getTenantFilter(req);
    const result = await Lead.updateMany(
      { _id: { $in: ids }, ...tenantFilter },
      { isDeleted: true, deletedAt: new Date() }
    );
    return res.json({
      success: true,
      message: "Leads moved to trash",
      modifiedCount: result.modifiedCount,
    });
  } catch (err) {
    console.error("💥 Bulk delete error:", err);
    return res.status(500).json({ success: false, error: "Bulk delete failed" });
  }
};

// ── Bulk Restore ──────────────────────────────────────────────────────────────
export const bulkRestoreLeadsController = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { ids } = req.body;
    const tenantFilter = getTenantFilter(req);
    const result = await Lead.updateMany(
      { _id: { $in: ids }, ...tenantFilter },
      { isDeleted: false, deletedAt: null }
    );
    return res.json({
      success: true,
      message: "Leads restored",
      modifiedCount: result.modifiedCount,
    });
  } catch (err) {
    console.error("Bulk restore error:", err);
    return res.status(500).json({ error: "Failed to restore" });
  }
};

// ── Get Leads ─────────────────────────────────────────────────────────────────
export const getLeadsController = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id, email, phone, source, followupFilter, interest, interestLevel } = req.query;
    const tenantFilter = getTenantFilter(req);

    if (id) {
      const lead = await Lead.findOne({ _id: id, ...tenantFilter }).lean();
      if (!lead) return res.status(404).json({ error: "Lead not found" });
      return res.status(200).json(lead);
    }

    const filters: any = { isDeleted: false, ...tenantFilter };
    if (email && email !== "null" && email !== "") filters.email = String(email).trim().toLowerCase();
    if (phone && phone !== "null" && phone !== "") filters.phone = String(phone).trim();
    if (source && source !== "null" && source !== "") filters.source = source;

    const rawInterest = String(interest || interestLevel || "").toLowerCase().trim();
    if (rawInterest && rawInterest !== "all" && ["hot", "warm", "cold"].includes(rawInterest)) {
      filters.interestLevel = rawInterest;
    }

    if (followupFilter) {
      const now = new Date();

      if (followupFilter === "today") {
        const start = new Date();
        start.setHours(0, 0, 0, 0);
        const end = new Date();
        end.setHours(23, 59, 59, 999);
        filters["followUp.date"] = { $gte: start, $lte: end };
        filters["followUp.active"] = true;
      }

      if (followupFilter === "missed") {
        filters["followUp.date"] = { $lt: now };
        filters["followUp.active"] = true;
      }

      if (followupFilter === "week") {
        const start = new Date();
        start.setDate(start.getDate() - start.getDay());
        const end = new Date();
        end.setDate(end.getDate() + (6 - end.getDay()));
        end.setHours(23, 59, 59, 999);
        filters["followUp.date"] = { $gte: start, $lte: end };
        filters["followUp.active"] = true;
      }

      if (followupFilter === "next24") {
        const next24 = new Date(now.getTime() + 24 * 60 * 60 * 1000);
        filters["followUp.date"] = { $gte: now, $lte: next24 };
        filters["followUp.active"] = true;
      }
    }

    const leads = await Lead.find(filters).sort({ updatedAt: -1, createdAt: -1 }).lean();
    return res.status(200).json(leads);
  } catch (err) {
    console.error("💥 Error in getLeadsController:", err);
    return res.status(500).json({ error: "Failed to fetch leads" });
  }
};
