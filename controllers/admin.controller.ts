
import { Request, Response } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { Parser } from "json2csv";
import nodemailer from "nodemailer";
import Admin from "../models/admin.model";
import Lead from "../models/lead.model";
import ExcelJS from "exceljs";
import XLSX from "xlsx";

const getEmail = (row: any) => {
  const possibleKeys = [
    "email", "Email", "EMAIL", "email_address", "Email Address",
    "E-mail", "e-mail", "Mail", "mail", "contact_email", "Contact Email",
  ];
  for (const key of possibleKeys) {
    if (row[key] && row[key] !== "null" && row[key] !== "") return String(row[key]).trim();
  }
  return null;
};

const getPhone = (row: any) => {
  const possibleKeys = [
    "phone", "Phone", "PHONE", "mobile", "Mobile", "MOBILE",
    "contact", "Contact", "Phone Number", "Mobile Number", "Contact Number",
  ];
  for (const key of possibleKeys) {
    if (row[key] && row[key] !== "null" && row[key] !== "") return String(row[key]).trim();
  }
  return null;
};

const JWT_SECRET   = process.env.JWT_SECRET || "supersecret";
const FRONTEND_URL = process.env.FRONTEND_URL;
const FRONTEND_URL1 = process.env.FRONTEND_URL1;

// ── Admin Signup ──────────────────────────────────────────────────────────────
export const adminSignup = async (req: Request, res: Response) => {
  try {
    const { email, password, name } = req.body;
    if (!name || name.trim().length === 0)
      return res.status(400).json({ success: false, error: "Name is required" });

    const existingAdmin = await Admin.findOne();
    if (existingAdmin)
      return res.status(400).json({ success: false, error: "Admin already exists. Signup disabled." });

    const hashedPassword = await bcrypt.hash(password, 10);
    const admin = new Admin({ email, password: hashedPassword, name: name.trim() });
    await admin.save();

    res.status(201).json({ success: true, message: "Admin created successfully" });
  } catch (err) {
    console.error("Admin signup error:", err);
    res.status(500).json({ success: false, error: "Server error" });
  }
};

// ── Admin Login ───────────────────────────────────────────────────────────────
export const adminLogin = async (req: Request, res: Response) => {
  try {
    const { email, password } = req.body;
    const admin = await Admin.findOne({ email });

    if (!admin)
      return res.status(400).json({ success: false, error: "Invalid credentials" });

    const isMatch = await bcrypt.compare(password, admin.password);
    if (!isMatch)
      return res.status(400).json({ success: false, error: "Invalid credentials" });

    const token = jwt.sign({ id: admin._id, role: "admin" }, JWT_SECRET, { expiresIn: "1h" });
    res.json({
      success: true,
      token,
      admin: { id: admin._id, email: admin.email, name: admin.name },   // ✅ FIX — name add kiya
    });
  } catch (err) {
    console.error("Admin login error:", err);
    res.status(500).json({ success: false, error: "Server error" });
  }
};

// ── Forgot Password ────────────────────────
import { sendEmail } from "../services/emailService";

// forgotPassword function ko ye replace karo
export const forgotPassword = async (req: Request, res: Response) => {
  try {
    const { email } = req.body;
    const admin = await Admin.findOne({ email });
    if (!admin) return res.status(404).json({ success: false, error: "Admin not found" });

    const token     = jwt.sign({ id: admin._id }, JWT_SECRET, { expiresIn: "15m" });
    const resetLink = `${FRONTEND_URL1}/reset-password/${token}`;

    await sendEmail(
      admin.email,
      "Password Reset Request",
      `<p>Click the link to reset your password (valid 15 mins):</p><a href="${resetLink}">${resetLink}</a>`
    );

    res.json({ success: true, message: "Reset link sent to email" });
  } catch (err) {
    console.error("Forgot password error:", err);
    res.status(500).json({ success: false, error: "Server error" });
  }
};

// ── Change Password (logged in) ───────────────────────────────────────────────
export const changePasswordLoggedIn = async (req: Request, res: Response) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith("Bearer "))
      return res.status(401).json({ success: false, error: "Unauthorized" });

    const token = authHeader.split(" ")[1];
    let decoded: any;
    try { decoded = jwt.verify(token, JWT_SECRET!); }
    catch { return res.status(401).json({ success: false, error: "Invalid token" }); }

    const { currentPassword, newPassword } = req.body;
    if (!currentPassword || !newPassword)
      return res.status(400).json({ success: false, error: "Current and new password required" });

    const admin = await Admin.findById(decoded.id);
    if (!admin) return res.status(404).json({ success: false, error: "Admin not found" });

    const isMatch = await bcrypt.compare(currentPassword, admin.password);
    if (!isMatch) return res.status(400).json({ success: false, error: "Current password incorrect" });

    admin.password = await bcrypt.hash(newPassword, 10);
    await admin.save();

    res.json({ success: true, message: "Password changed successfully" });
  } catch (err) {
    console.error("Change password error:", err);
    res.status(500).json({ success: false, error: "Server error" });
  }
};

// ── Get All Leads ─────────────────────────────────────────────────────────────
export const adminGetLeads = async (req: Request, res: Response) => {
  try {
    const {
      page     = "1",
      limit    = "10",
      status,
      source,
      search,
      dateFrom,
      dateTo,
    } = req.query as Record<string, string>;

    const filter: Record<string, any> = { isDeleted: false };

    // ✅ FIX: Status filter — accept any case, store lowercase
    if (status) filter.status = status.toLowerCase();

    if (source) filter.source = source;

    if (search) {
      const q = search.trim();
      filter.$and = [
        { isDeleted: false },
        {
          $or: [
            { fullName: { $regex: q, $options: "i" } },
            { phone:    { $regex: q, $options: "i" } },
            { email:    { $regex: q, $options: "i" } },
          ],
        },
      ];
    }

    if (dateFrom || dateTo) {
      filter.receivedAt = {};
      if (dateFrom) filter.receivedAt.$gte = new Date(dateFrom);
      if (dateTo) {
        const end = new Date(dateTo);
        end.setHours(23, 59, 59, 999);
        filter.receivedAt.$lte = end;
      }
    }

    const pageNum  = Math.max(1, parseInt(page));
    const limitNum = Math.min(100, parseInt(limit));
    const skip     = (pageNum - 1) * limitNum;

    const [leads, totalLeads] = await Promise.all([
      Lead.find(filter).sort({ receivedAt: -1 }).skip(skip).limit(limitNum),
      Lead.countDocuments(filter),
    ]);

    // Status counts (unfiltered — for stat cards)
    const statusAgg = await Lead.aggregate([
      { $match: { isDeleted: false } },
      { $group: { _id: "$status", count: { $sum: 1 } } },
    ]);

    const byStatus: Record<string, number> = {};
    statusAgg.forEach(({ _id, count }: any) => {
      if (_id) byStatus[_id] = count;
    });

    res.json({
      success:        true,
      leads,
      totalLeads,
      // legacy fields (frontend purana code ke liye)
      newLeadsCount:  byStatus["new"]         ?? 0,
      contactedCount: byStatus["contacted"]   ?? 0,
      convertedCount: byStatus["closed"]      ?? 0,
      lostCount:      byStatus["lost"]        ?? 0,
      // 🆕 new statuses
      negotiationCount: byStatus["negotiation"] ?? 0,
      visitorCount:     byStatus["visitor"]     ?? 0,
      page:       pageNum,
      totalPages: Math.ceil(totalLeads / limitNum),
    });
  } catch (err) {
    console.error("Get leads error:", err);
    res.status(500).json({ success: false, error: "Server error" });
  }
};

// ── Export Leads ──────────────────────────────────────────────────────────────
export const adminExportLeads = async (req: Request, res: Response) => {
  try {
    const { format = "xlsx", status } = req.query as Record<string, string>;

    const filter: Record<string, any> = { isDeleted: false };
    if (status && status !== "all") filter.status = status.toLowerCase();

    const leads = await Lead.find(filter).sort({ receivedAt: -1 });

    if (!leads.length)
      return res.status(404).json({ success: false, error: "No leads found" });

    const rows = leads.map((l) => ({
      "Full Name":    l.fullName ?? "",
      "Email":        l.email   ?? "",
      "Phone":        l.phone   ?? "",
      "Source":       l.source  ?? "",
      "Status":       l.status  ?? "",
      "Budget":       (l as any).extraFields?.what_is_your_budget_
                      ?? (l as any).whatIsYourBudget ?? "",
      "Purchase Timeline": (l as any).extraFields?.when_are_you_planning_to_purchase_
                           ?? (l as any).whenAreYouPlanningToPurchase ?? "",
      "Message":      (l as any).message ?? "",
      "Received At":  l.receivedAt ? new Date(l.receivedAt).toLocaleString("en-IN") : "",
    }));

    const statusLabel = status && status !== "all"
      ? status.charAt(0).toUpperCase() + status.slice(1)
      : "All";
    const filename = `leads-${statusLabel.toLowerCase()}-${Date.now()}`;

    if (format === "xlsx") {
      const wb = new ExcelJS.Workbook();
      const ws = wb.addWorksheet(`${statusLabel} Leads`);

      const headers = Object.keys(rows[0]);
      ws.addRow(headers);

      const headerRow = ws.getRow(1);
      headerRow.font      = { bold: true, color: { argb: "FFFFFFFF" } };
      headerRow.fill      = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1E3A5F" } };
      headerRow.alignment = { vertical: "middle", horizontal: "center" };
      headerRow.height    = 20;

      rows.forEach((row, i) => {
        const r = ws.addRow(Object.values(row));
        r.fill = {
          type: "pattern", pattern: "solid",
          fgColor: { argb: i % 2 === 0 ? "FFFFFFFF" : "FFF1F5F9" },
        };
      });

      ws.columns.forEach((col) => {
        let max = 12;
        col.eachCell?.({ includeEmpty: true }, (cell) => {
          const len = cell.value ? String(cell.value).length : 0;
          if (len > max) max = len;
        });
        col.width = Math.min(max + 4, 40);
      });

      res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
      res.setHeader("Content-Disposition", `attachment; filename="${filename}.xlsx"`);
      await wb.xlsx.write(res);
      return res.end();
    }

    const parser = new Parser({ fields: Object.keys(rows[0]) });
    const csv    = parser.parse(rows);
    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}.csv"`);
    return res.send(csv);
  } catch (err) {
    console.error("Export leads error:", err);
    res.status(500).json({ success: false, error: "Server error" });
  }
};

// ── Update Lead ───────────────────────────────────────────────────────────────
export const adminUpdateLead = async (req: Request, res: Response) => {
  try {
    const { id }    = req.params;
    const { status } = req.body;

    if (!status) return res.status(400).json({ success: false, error: "Status is required" });

    // ✅ FIX: lowercase mein store karo
    const lead = await Lead.findByIdAndUpdate(id, { status: status.toLowerCase() }, { new: true });
    if (!lead) return res.status(404).json({ success: false, error: "Lead not found" });

    res.json({ success: true, lead });
  } catch (err) {
    console.error("Update lead error:", err);
    res.status(500).json({ success: false, error: "Server error" });
  }
};

// ── Delete Lead ───────────────────────────────────────────────────────────────
export const adminDeleteLead = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const lead   = await Lead.findByIdAndDelete(id);
    if (!lead) return res.status(404).json({ success: false, error: "Lead not found" });
    res.json({ success: true, message: "Lead deleted successfully" });
  } catch (err) {
    console.error("Delete lead error:", err);
    res.status(500).json({ success: false, error: "Server error" });
  }
};

// ── Daily Stats ───────────────────────────────────────────────────────────────
export const adminDailyStats = async (_req: Request, res: Response) => {
  try {
    const stats = await Lead.aggregate([
      {
        $group: {
          _id: {
            year:  { $year:        "$createdAt" },
            month: { $month:       "$createdAt" },
            day:   { $dayOfMonth:  "$createdAt" },
          },
          count: { $sum: 1 },
        },
      },
      { $sort: { "_id.year": -1, "_id.month": -1, "_id.day": -1 } },
    ]);
    res.json({ success: true, stats });
  } catch (err) {
    console.error("Daily stats error:", err);
    res.status(500).json({ success: false, error: "Server error" });
  }
};

// ── Import Leads ──────────────────────────────────────────────────────────────
export const importLeadsController = async (req: Request, res: Response) => {
  try {
    if (!req.file)
      return res.status(400).json({ error: "Please upload a file" });

    const filePath = req.file.path;

    const cleanUTF16 = (value: any) => {
      if (value == null) return null;
      if (typeof value !== "string") return value;
      let str = value.replace(/\u0000/g, "").replace(/^"|"$/g, "").trim();
      return str || null;
    };

    const workbook  = XLSX.readFile(filePath, { cellDates: true });
    const sheetName = workbook.SheetNames[0];
    const data      = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { defval: null, raw: true }) as any[];

    const cleanedData = data.map((row: any) => {
      const cleanedRow: any = {};
      for (const [key, val] of Object.entries(row)) cleanedRow[key] = cleanUTF16(val);
      return cleanedRow;
    });

    for (const row of cleanedData) {
      await Lead.create({
        fullName: row.fullName || row.name || row["Full Name"] || row["full_name"] || "Unknown User",
        email:    getEmail(row),
        phone:    getPhone(row),
        message:  row.message || row.Message || null,
        whenAreYouPlanningToPurchase: row.whenAreYouPlanningToPurchase || row.PurchaseTime || null,
        whatIsYourBudget:             row.whatIsYourBudget || row.Budget || null,
        source:      "import",
        extraFields: row,
        rawData:     row,
        receivedAt:  new Date(),
      });
    }

    return res.json({
      message: "Leads imported successfully",
      total:   cleanedData.length,
      sample:  cleanedData[0],
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: "Import failed" });
  }
};


export const adminGetProfile = async (req: Request, res: Response) => {
  try {
    const admin = await Admin.findOne().select("-password");
    if (!admin) return res.status(404).json({ success: false, error: "Admin not found" });

    res.json({
      _id:   admin._id,
      name:  admin.name || "",
      email: admin.email || "",
      // ✅ Google Calendar status frontend ko bhejna zaroori hai
      googleCalendar: {
        isConnected:  !!(admin.googleCalendar?.refreshToken),
        refreshToken: admin.googleCalendar?.refreshToken ? "EXISTS" : null, // token expose mat karo
      },
    });
  } catch (err) {
    console.error("Get admin profile error:", err);
    res.status(500).json({ success: false, error: "Server error" });
  }
};

// ── Reminder Leads ────────────────────────────────────────────────────────────
export const getReminderLeads = async (req: Request, res: Response) => {
  try {
    const leads = await Lead.find({
      reminderCount: { $gt: 0, $lte: 5 },
      status:        { $ne: "closed" },
    }).sort({ lastReminderSent: -1 });
    return res.json({ success: true, leads });
  } catch (error) {
    console.error("Get reminder leads error:", error);
    return res.status(500).json({ success: false, error: "Server error" });
  }
};

// ── Mark As Contacted ─────────────────────────────────────────────────────────
export const markAsContacted = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    await Lead.findByIdAndUpdate(id, { status: "contacted", reminderCount: 0 });
    return res.json({ success: true, message: "Lead marked as contacted" });
  } catch (error) {
    console.error("Mark contacted error:", error);
    return res.status(500).json({ success: false, error: "Server error" });
  }
};

// ── Pending Reminder Count ────────────────────────────────────────────────────
export const getPendingReminderCount = async (req: Request, res: Response) => {
  try {
    const count = await Lead.countDocuments({
      status:        { $ne: "closed" },
      reminderCount: { $gte: 1, $lte: 5 },
    });
    return res.json({ success: true, pendingReminders: count });
  } catch (error) {
    console.error("Pending reminder count error:", error);
    return res.status(500).json({ success: false, error: "Server error" });
  }
}
export const adminAdvancedMonthlyReport = async (
  req: Request,
  res: Response
) => {
  try {
    const month = Number(req.query.month);
    const year  = Number(req.query.year);

    if (!month || !year) {
      return res.status(400).json({ success: false, error: 'month and year are required' });
    }

    // ── DATE RANGES ───────────────────────────────────────────────
    const startDate     = new Date(year, month - 1, 1,  0,  0,  0,   0);
    const endDate       = new Date(year, month,     0, 23, 59, 59, 999);
    const prevStartDate = new Date(year, month - 2, 1,  0,  0,  0,   0);
    const prevEndDate   = new Date(year, month - 1, 0, 23, 59, 59, 999);

    // ── QUERIES ───────────────────────────────────────────────────

    // Current month total
    const totalLeadsPromise = Lead.countDocuments({
      isDeleted: false,
      createdAt: { $gte: startDate, $lte: endDate },
    });

    // Previous month total
    const previousMonthLeadsPromise = Lead.countDocuments({
      isDeleted: false,
      createdAt: { $gte: prevStartDate, $lte: prevEndDate },
    });

    // Current month status breakdown
    const statusCountsPromise = Lead.aggregate([
      { $match: { isDeleted: false, createdAt: { $gte: startDate, $lte: endDate } } },
      { $group: { _id: '$status', count: { $sum: 1 } } },
    ]);

    // ✅ NEW — Previous month status breakdown (for ring chart comparison)
    const prevStatusCountsPromise = Lead.aggregate([
      { $match: { isDeleted: false, createdAt: { $gte: prevStartDate, $lte: prevEndDate } } },
      { $group: { _id: '$status', count: { $sum: 1 } } },
    ]);

    // Source wise
    const sourceWisePromise = Lead.aggregate([
      { $match: { isDeleted: false, createdAt: { $gte: startDate, $lte: endDate } } },
      { $group: { _id: '$source', count: { $sum: 1 } } },
      { $sort: { count: -1 } },
    ]);

    // Daily growth
    const dailyGrowthPromise = Lead.aggregate([
      { $match: { isDeleted: false, createdAt: { $gte: startDate, $lte: endDate } } },
      { $group: { _id: { day: { $dayOfMonth: '$createdAt' } }, count: { $sum: 1 } } },
      { $sort: { '_id.day': 1 } },
    ]);

    // Follow-up completion
    const followupCompletionPromise = Lead.aggregate([
      {
        $match: {
          isDeleted: false,
          'followUp.active': true,
          createdAt: { $gte: startDate, $lte: endDate },
        },
      },
      { $group: { _id: '$followUp.overdueStatus', count: { $sum: 1 } } },
    ]);

    // Lead temperature
    const leadTemperaturePromise = Lead.aggregate([
      { $match: { isDeleted: false, createdAt: { $gte: startDate, $lte: endDate } } },
      { $group: { _id: '$leadTemperature', count: { $sum: 1 } } },
    ]);

    // ── EXECUTE ALL ───────────────────────────────────────────────
    const [
      totalLeads,
      previousMonthLeads,
      statusCounts,
      prevStatusCounts,        // ✅ NEW
      sourceWise,
      dailyGrowth,
      followupCompletion,
      leadTemperature,
    ] = await Promise.all([
      totalLeadsPromise,
      previousMonthLeadsPromise,
      statusCountsPromise,
      prevStatusCountsPromise, // ✅ NEW
      sourceWisePromise,
      dailyGrowthPromise,
      followupCompletionPromise,
      leadTemperaturePromise,
    ]);

    // ── GROWTH % ──────────────────────────────────────────────────
    const growthPercentage =
      previousMonthLeads > 0
        ? ((totalLeads - previousMonthLeads) / previousMonthLeads) * 100
        : 0;

    // ── STATUS FORMAT HELPER ──────────────────────────────────────
    const normalizeStatus = (
      raw: { _id: string; count: number }[]
    ): Record<string, number> => {
      const base: Record<string, number> = {
        New: 0, Contacted: 0, Interested: 0,
        Negotiation: 0, Visitor: 0, Closed: 0, Lost: 0,
      };
      raw.forEach(({ _id, count }) => {
        if (!_id) return;
        const key = _id.charAt(0).toUpperCase() + _id.slice(1).toLowerCase();
        base[key] = count;
      });
      return base;
    };

    const byStatus     = normalizeStatus(statusCounts);
    const prevByStatus = normalizeStatus(prevStatusCounts); // ✅ NEW

    // ── FOLLOW-UP STATS ───────────────────────────────────────────
    const followupStats = { pending: 0, overdue: 0, resolved: 0 };
    let totalFollowups  = 0;
    followupCompletion.forEach(({ _id, count }: { _id: string; count: number }) => {
      if (!_id) return;
      followupStats[_id as keyof typeof followupStats] = count;
      totalFollowups += count;
    });
    const completionRate =
      totalFollowups > 0
        ? ((followupStats.resolved / totalFollowups) * 100).toFixed(2)
        : 0;

    // ── TEMPERATURE STATS ─────────────────────────────────────────
    const leadTemperatureStats = { hot: 0, warm: 0, cold: 0 };
    leadTemperature.forEach(({ _id, count }: { _id: string; count: number }) => {
      if (!_id) return;
      leadTemperatureStats[_id as keyof typeof leadTemperatureStats] = count;
    });

    // ── RESPONSE ──────────────────────────────────────────────────
    return res.json({
      success: true,
      filters: { month, year },
      analytics: {
        // Current month
        totalLeads,
        byStatus,

        // ✅ Previous month — used by ring chart comparison
        previousMonthLeads,
        prevByStatus,

        // Growth
        growthPercentage,

        // Charts
        sourceWise: sourceWise.map(item => ({
          source: item._id || 'Unknown',
          count:  item.count,
        })),
        dailyGrowth: dailyGrowth.map(item => ({
          day:   item._id.day,
          count: item.count,
        })),

        // Follow-ups
        followupStats,
        followupCompletionRate: `${completionRate}%`,

        // Temperature
        leadTemperatureStats,
      },
    });
  } catch (err) {
    console.error('Advanced report error:', err);
    return res.status(500).json({ success: false, error: 'Server error' });
  }
};


export const getNotifications = async (req: Request, res: Response) => {
  try {
    const now = new Date();
 
    // ── Time boundaries ───────────────────────────────────────
    const in30min  = new Date(now.getTime() + 30 * 60 * 1000);
    const in1day   = new Date(now.getTime() + 24 * 60 * 60 * 1000);
    const in2days  = new Date(now.getTime() + 48 * 60 * 60 * 1000);
 
    // ── Fetch all relevant leads in one query ─────────────────
    const leads = await Lead.find({
      isDeleted: false,
      "followUp.active": true,
      "followUp.date": { $ne: null },
      "followUp.overdueStatus": { $ne: "resolved" },
    })
      .select("fullName phone email followUp status")
      .lean();
 
    const notifications: {
      id: string;
      leadId: string;
      leadName: string;
      phone: string | null;
      message: string;
      type: "overdue" | "due_today" | "upcoming_30min" | "upcoming_1day" | "upcoming_2days";
      priority: "critical" | "high" | "medium" | "low";
      followUpDate: string;
      overdueLabel?: string;
    }[] = [];
 
    for (const lead of leads) {
      const followDate = lead.followUp?.date ? new Date(lead.followUp.date) : null;
      if (!followDate) continue;
 
      const diffMs   = followDate.getTime() - now.getTime();
      const diffMins = Math.floor(diffMs / 60000);
      const diffHrs  = Math.floor(diffMins / 60);
      const diffDays = Math.floor(diffHrs / 24);
 
      const leadId   = String((lead as any)._id);
      const leadName = lead.fullName ?? "Unknown";
      const phone    = lead.phone ?? null;
 
      // ── OVERDUE ──────────────────────────────────────────────
      if (diffMs < 0) {
        const overdueMs   = Math.abs(diffMs);
        const overdueMins = Math.floor(overdueMs / 60000);
        const overdueHrs  = Math.floor(overdueMins / 60);
        const overdueDays = Math.floor(overdueHrs / 24);
 
        const overdueLabel =
          overdueDays > 0  ? `${overdueDays}d overdue` :
          overdueHrs  > 0  ? `${overdueHrs}h overdue`  :
                             `${overdueMins}m overdue`;
 
        notifications.push({
          id:           `overdue-${leadId}`,
          leadId,
          leadName,
          phone,
          message:      `Follow-up overdue — ${overdueLabel}`,
          type:         "overdue",
          priority:     "critical",
          followUpDate: followDate.toISOString(),
          overdueLabel,
        });
      }
 
      // ── UPCOMING in 30 mins ───────────────────────────────────
      else if (diffMs <= 30 * 60 * 1000) {
        notifications.push({
          id:           `30min-${leadId}`,
          leadId,
          leadName,
          phone,
          message:      `Follow-up in ${diffMins} min`,
          type:         "upcoming_30min",
          priority:     "high",
          followUpDate: followDate.toISOString(),
        });
      }
 
      // ── UPCOMING today (30min - 24hr) ─────────────────────────
      else if (diffMs <= 24 * 60 * 60 * 1000) {
        const label =
          diffHrs > 0 ? `${diffHrs}h ${diffMins % 60}m` : `${diffMins}m`;
        notifications.push({
          id:           `today-${leadId}`,
          leadId,
          leadName,
          phone,
          message:      `Follow-up due in ${label}`,
          type:         "due_today",
          priority:     "medium",
          followUpDate: followDate.toISOString(),
        });
      }
 
      // ── UPCOMING tomorrow (24hr - 48hr) ──────────────────────
      else if (diffMs <= 48 * 60 * 60 * 1000) {
        notifications.push({
          id:           `1day-${leadId}`,
          leadId,
          leadName,
          phone,
          message:      `Follow-up tomorrow`,
          type:         "upcoming_1day",
          priority:     "low",
          followUpDate: followDate.toISOString(),
        });
      }
    }
 
    // ── Sort: critical first ───────────────────────────────────
    const priorityOrder = { critical: 0, high: 1, medium: 2, low: 3 };
    notifications.sort(
      (a, b) => priorityOrder[a.priority] - priorityOrder[b.priority]
    );
 
    return res.json({
      success: true,
      count:   notifications.length,
      data:    notifications,
    });
  } catch (err) {
    console.error("Notifications error:", err);
    return res.status(500).json({ success: false, error: "Server error" });
  }
};

// ── Monthly Report Export (Excel) ──────────────────────────────────────────
export const adminExportMonthlyReport = async (req: Request, res: Response) => {
  try {
    const month = Number(req.query.month);
    const year  = Number(req.query.year);

    if (!month || !year) {
      return res.status(400).json({ success: false, error: "month and year are required" });
    }

    const startDate = new Date(year, month - 1, 1, 0, 0, 0, 0);
    const endDate   = new Date(year, month, 0, 23, 59, 59, 999);

    const leads = await Lead.find({
      isDeleted: false,
      createdAt: { $gte: startDate, $lte: endDate },
    }).sort({ createdAt: -1 });

    // ── Summary counts ──────────────────────────────────────────
    const summary = {
      total:       leads.length,
      new:         0,
      contacted:   0,
      interested:  0,
      negotiation: 0,
      visitor:     0,
      closed:      0,
      lost:        0,
    };
    leads.forEach((l: any) => {
      const s = (l.status || "new") as keyof typeof summary;
      if (s in summary) summary[s]++;
    });

    const monthLabel = startDate.toLocaleString("en-IN", { month: "long", year: "numeric" });

    // ── Single workbook, single sheet ────────────────────────────
    const wb    = new ExcelJS.Workbook();
    const sheet = wb.addWorksheet("Monthly Report");

    const headers = [
      "Full Name", "Email", "Phone", "Source",
      "Budget", "Purchase Timeline", "Message", "Note", "Received At",
    ];

    // ── Title ─────────────────────────────────────────────────────
    const titleRow = sheet.addRow([`Monthly Report — ${monthLabel}`]);
    sheet.mergeCells(titleRow.number, 1, titleRow.number, headers.length);
    titleRow.font = { bold: true, size: 14 };
    sheet.addRow([]);

    // ── Summary section ──────────────────────────────────────────
    const summaryHeaderRow = sheet.addRow(["Metric", "Count"]);
    summaryHeaderRow.font = { bold: true, color: { argb: "FFFFFFFF" } };
    summaryHeaderRow.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1E3A5F" } };

    const summaryRows: [string, number][] = [
      ["Total Leads",  summary.total],
      ["New",          summary.new],
      ["Contacted",    summary.contacted],
      ["Interested",   summary.interested],
      ["Negotiation",  summary.negotiation],
      ["Visitor",      summary.visitor],
      ["Closed (Won)", summary.closed],
      ["Lost",         summary.lost],
    ];
    summaryRows.forEach(([label, count]) => sheet.addRow([label, count]));

    sheet.addRow([]);
    sheet.addRow([]);

    // ── Lead details, grouped by status ──────────────────────────
    const detailsTitleRow = sheet.addRow(["Lead Details"]);
    sheet.mergeCells(detailsTitleRow.number, 1, detailsTitleRow.number, headers.length);
    detailsTitleRow.font = { bold: true, size: 13 };
    sheet.addRow([]);

    const statusOrder: { key: string; label: string }[] = [
      { key: "new",         label: "New" },
      { key: "contacted",   label: "Contacted" },
      { key: "interested",  label: "Interested" },
      { key: "negotiation", label: "Negotiation" },
      { key: "visitor",     label: "Visitor" },
      { key: "closed",      label: "Closed (Won)" },
      { key: "lost",        label: "Lost" },
    ];

    for (const { key, label } of statusOrder) {
      const groupLeads = leads.filter((l: any) => (l.status ?? "new") === key);
      if (groupLeads.length === 0) continue;

      const headingRow = sheet.addRow([`${label} (${groupLeads.length})`]);
      sheet.mergeCells(headingRow.number, 1, headingRow.number, headers.length);
      headingRow.font = { bold: true, size: 12, color: { argb: "FFFFFFFF" } };
      headingRow.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1E3A5F" } };
      headingRow.height = 20;

      const colHeaderRow = sheet.addRow(headers);
      colHeaderRow.font = { bold: true };
      colHeaderRow.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE2E8F0" } };

      groupLeads.forEach((l: any, i: number) => {
        const row = sheet.addRow([
          l.fullName ?? "",
          l.email ?? "",
          l.phone ?? "",
          l.source ?? "",
          l.extraFields?.what_is_your_budget_ ?? l.whatIsYourBudget ?? "",
          l.extraFields?.when_are_you_planning_to_purchase_ ?? l.whenAreYouPlanningToPurchase ?? "",
          l.message && l.message !== "No message provided" ? l.message : "",
          l.note ?? "",
          l.createdAt ? new Date(l.createdAt).toLocaleString("en-IN") : "",
        ]);
        row.fill = {
          type: "pattern", pattern: "solid",
          fgColor: { argb: i % 2 === 0 ? "FFFFFFFF" : "FFF8FAFC" },
        };
      });

      sheet.addRow([]);
    }

    sheet.columns.forEach((col) => {
      let max = 12;
      col.eachCell?.({ includeEmpty: true }, (cell) => {
        const len = cell.value ? String(cell.value).length : 0;
        if (len > max) max = len;
      });
      col.width = Math.min(max + 4, 40);
    });

    const filename = `monthly-report-${monthLabel.replace(" ", "-")}`;
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}.xlsx"`);
    await wb.xlsx.write(res);
    return res.end();
  } catch (err) {
    console.error("Monthly report export error:", err);
    res.status(500).json({ success: false, error: "Server error" });
  }
};

// ── Reset Password via Email Token ────────────────────────────────────────────
export const resetPasswordWithToken = async (req: Request, res: Response) => {
  try {
    const { token, newPassword } = req.body;
    if (!token || !newPassword)
      return res.status(400).json({ success: false, error: "Token and new password required" });

    let decoded: any;
    try {
      decoded = jwt.verify(token, JWT_SECRET!);
    } catch {
      return res.status(400).json({ success: false, error: "Reset link expired or invalid" });
    }

    const admin = await Admin.findById(decoded.id);
    if (!admin) return res.status(404).json({ success: false, error: "Admin not found" });

    admin.password = await bcrypt.hash(newPassword, 10);
    await admin.save();

    res.json({ success: true, message: "Password reset successfully" });
  } catch (err) {
    console.error("Reset password error:", err);
    res.status(500).json({ success: false, error: "Server error" });
  }
};