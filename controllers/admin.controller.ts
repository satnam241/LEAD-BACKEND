import { Request, Response } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { Parser } from "json2csv";
<<<<<<< HEAD
import nodemailer from "nodemailer";
import Admin from "../models/admin.model";
import Lead from "../models/lead.model";
import ExcelJS from 'exceljs'


import * as XLSX from "xlsx";


const getEmail = (row: any) => {
  const possibleKeys = [
    "email",
    "Email",
    "EMAIL",
    "email_address",
    "Email Address",
    "E-mail",
    "e-mail",
    "Mail",
    "mail",
    "contact_email",
    "Contact Email",
  ];

  for (const key of possibleKeys) {
    if (row[key] && row[key] !== "null" && row[key] !== "") {
      return String(row[key]).trim();
    }
  }

  return null;
};
const getPhone = (row: any) => {
  const possibleKeys = [
    "phone",
    "Phone",
    "PHONE",
    "mobile",
    "Mobile",
    "MOBILE",
    "contact",
    "Contact",
    "Phone Number",
    "Mobile Number",
    "Contact Number",
  ];

  for (const key of possibleKeys) {
    if (row[key] && row[key] !== "null" && row[key] !== "") {
      return String(row[key]).trim();
    }
  }

  return null;
};


const JWT_SECRET = process.env.JWT_SECRET || "supersecret";
const FRONTEND_URL = process.env.FRONTEND_URL;

// ==============================
// ✅ Admin Signup (Only once)
// ==============================
=======
import Admin from "../models/admin.model";
import Lead from "../models/lead.model";

const JWT_SECRET = process.env.JWT_SECRET || "supersecret";
>>>>>>> 12ce192d2a5bd74df4854ba96063b1583eb3a95c


export const adminSignup = async (req: Request, res: Response) => {
  try {
<<<<<<< HEAD
    const { email, password, name } = req.body;

    // ✅ Validate name
    if (!name || name.trim().length === 0) {
      return res.status(400).json({
        success: false,
        error: "Name is required",
      });
    }

    const existingAdmin = await Admin.findOne();
    if (existingAdmin) {
      return res.status(400).json({
        success: false,
        error: "Admin already exists. Signup disabled."
      });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const admin = new Admin({ email, password: hashedPassword, name: name.trim() });
=======
    const { email, password } = req.body;

    
    const existingAdmin = await Admin.findOne();
    if (existingAdmin) {
      return res
        .status(400)
        .json({ success: false, error: "Admin already exists. Signup disabled." });
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Save admin
    const admin = new Admin({ email, password: hashedPassword });
>>>>>>> 12ce192d2a5bd74df4854ba96063b1583eb3a95c
    await admin.save();

    res.status(201).json({ success: true, message: "Admin created successfully" });
  } catch (err) {
<<<<<<< HEAD
    console.error("Admin signup error:", err);
=======
    console.error("Signup error:", err);
>>>>>>> 12ce192d2a5bd74df4854ba96063b1583eb3a95c
    res.status(500).json({ success: false, error: "Server error" });
  }
};


<<<<<<< HEAD
// ==============================
// ✅ Admin Login
// ==============================
export const adminLogin = async (req: Request, res: Response) => {
  try {
    const { email, password } = req.body;
    const admin = await Admin.findOne({ email });

    if (!admin) {
      return res.status(400).json({ success: false, error: "Invalid credentials" });
    }

    const isMatch = await bcrypt.compare(password, admin.password);
    if (!isMatch) {
      return res.status(400).json({ success: false, error: "Invalid credentials" });
    }

    const token = jwt.sign({ id: admin._id, role: "admin" }, JWT_SECRET, { expiresIn: "1h" });

    res.json({ success: true, token, admin: { id: admin._id, email: admin.email } });
  } catch (err) {
    console.error("Admin login error:", err);
    res.status(500).json({ success: false, error: "Server error" });
  }
};

// ==============================
// ✅ Forgot Password
// ==============================
export const forgotPassword = async (req: Request, res: Response) => {
  try {
    const { email } = req.body;
    const admin = await Admin.findOne({ email });
    if (!admin) return res.status(404).json({ success: false, error: "Admin not found" });

    const token = jwt.sign({ id: admin._id }, JWT_SECRET, { expiresIn: "15m" });
    const resetLink = `${FRONTEND_URL}/reset-password/${token}`;

    const transporter = nodemailer.createTransport({
      service: "gmail",
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS,
      },
    });

    await transporter.sendMail({
      from: process.env.EMAIL_USER,
      to: admin.email,
      subject: "Password Reset",
      html: `<p>Click the link to reset your password (valid 15 mins):</p><a href="${resetLink}">${resetLink}</a>`,
    });

    res.json({ success: true, message: "Reset link sent to email" });
  } catch (err) {
    console.error("Forgot password error:", err);
    res.status(500).json({ success: false, error: "Server error" });
  }
};

// ==============================
// ✅ Reset Password
// ==============================
// ✅ Change password after login (self-service)
export const changePasswordLoggedIn = async (req: Request, res: Response) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith("Bearer ")) 
      return res.status(401).json({ success: false, error: "Unauthorized" });

    const token = authHeader.split(" ")[1];
    let decoded: any;

    try {
      decoded = jwt.verify(token, JWT_SECRET!);
    } catch (err) {
      return res.status(401).json({ success: false, error: "Invalid token" });
    }

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
=======
export const adminLogin = async (req: Request, res: Response) => {
  try {
    const { email, password } = req.body;

    const admin = await Admin.findOne({ email });
    if (!admin)
      return res.status(400).json({ success: false, error: "Invalid credentials" });

    const isMatch = await bcrypt.compare(password, admin.password);
    if (!isMatch)
      return res.status(400).json({ success: false, error: "Invalid credentials" });

    const token = jwt.sign({ id: admin._id, role: "admin" }, JWT_SECRET, {
      expiresIn: "1d",
    });

    res.json({ success: true, token });
  } catch (err) {
    console.error("Login error:", err);
>>>>>>> 12ce192d2a5bd74df4854ba96063b1583eb3a95c
    res.status(500).json({ success: false, error: "Server error" });
  }
};


<<<<<<< HEAD
// ==============================
// ✅ Get All Leads
// ==============================

// ════════════════════════════════════════════════
// GET /admin/leads — Dynamic filtering (backend)
// ════════════════════════════════════════════════
export const adminGetLeads = async (req: Request, res: Response) => {
  try {
    const {
      page      = '1',
      limit     = '10',
      status,
      source,
      search,
      dateFrom,
      dateTo,
    } = req.query as Record<string, string>

    const filter: Record<string, any> = { isDeleted: false }

    // Status filter
    if (status) filter.status = status.toLowerCase()

    // Source filter
    if (source) filter.source = source

    // Search — name, phone, email
    if (search) {
      const q = search.trim()
      filter.$or = [
        { fullName: { $regex: q, $options: 'i' } },
        { phone:    { $regex: q, $options: 'i' } },
        { email:    { $regex: q, $options: 'i' } },
      ]
    }

    // Date range — receivedAt
    if (dateFrom || dateTo) {
      filter.receivedAt = {}
      if (dateFrom) filter.receivedAt.$gte = new Date(dateFrom)
      if (dateTo) {
        const end = new Date(dateTo)
        end.setHours(23, 59, 59, 999)
        filter.receivedAt.$lte = end
      }
    }

    const pageNum  = Math.max(1, parseInt(page))
    const limitNum = Math.min(100, parseInt(limit))
    const skip     = (pageNum - 1) * limitNum

    const [leads, totalLeads] = await Promise.all([
      Lead.find(filter).sort({ receivedAt: -1 }).skip(skip).limit(limitNum),
      Lead.countDocuments(filter),
    ])

    // Status counts (unfiltered — for stat cards)
    const statusAgg = await Lead.aggregate([
      { $match: { isDeleted: false } },
      { $group: { _id: '$status', count: { $sum: 1 } } },
    ])

    const byStatus: Record<string, number> = {}
    statusAgg.forEach(({ _id, count }: any) => {
      if (_id) byStatus[_id] = count
    })

    res.json({
      success:        true,
      leads,
      totalLeads,
      newLeadsCount:  byStatus['new']       ?? 0,
      contactedCount: byStatus['contacted'] ?? 0,
      convertedCount: byStatus['closed']    ?? 0,
      page:           pageNum,
      totalPages:     Math.ceil(totalLeads / limitNum),
    })
  } catch (err) {
    console.error('Get leads error:', err)
    res.status(500).json({ success: false, error: 'Server error' })
  }
}

// ════════════════════════════════════════════════
// GET /admin/leads/export — Export XLSX or CSV
// ════════════════════════════════════════════════
export const adminExportLeads = async (req: Request, res: Response) => {
  try {
    const {
      format = 'xlsx',   // 'xlsx' | 'csv'
      status,            // 'new' | 'contacted' | 'closed' | 'lost' | '' (all)
    } = req.query as Record<string, string>

    // Build filter
    const filter: Record<string, any> = { isDeleted: false }
    if (status && status !== 'all') filter.status = status.toLowerCase()

    const leads = await Lead.find(filter).sort({ receivedAt: -1 })

    if (!leads.length)
      return res.status(404).json({ success: false, error: 'No leads found' })

    // Shared row mapper
    const rows = leads.map(l => ({
      'Full Name':    l.fullName    ?? '',
      'Email':        l.email       ?? '',
      'Phone':        l.phone       ?? '',
      'Source':       l.source      ?? '',
      'Status':       l.status      ?? '',
      'Budget':       (l as any).extraFields?.what_is_your_budget_
                      ?? (l as any).whatIsYourBudget ?? '',
      'Purchase Timeline': (l as any).extraFields?.when_are_you_planning_to_purchase_
                           ?? (l as any).whenAreYouPlanningToPurchase ?? '',
      'Message':      (l as any).message ?? '',
      'Received At':  l.receivedAt
                      ? new Date(l.receivedAt).toLocaleString('en-IN')
                      : '',
    }))

    const statusLabel = status && status !== 'all'
      ? status.charAt(0).toUpperCase() + status.slice(1)
      : 'All'
    const filename = `leads-${statusLabel.toLowerCase()}-${Date.now()}`

    // ── XLSX ──────────────────────────────────────────────
    if (format === 'xlsx') {
      const wb = new ExcelJS.Workbook()
      const ws = wb.addWorksheet(`${statusLabel} Leads`)

      // Header row
      const headers = Object.keys(rows[0])
      ws.addRow(headers)

      // Style header
      const headerRow = ws.getRow(1)
      headerRow.font      = { bold: true, color: { argb: 'FFFFFFFF' } }
      headerRow.fill      = {
        type: 'pattern', pattern: 'solid',
        fgColor: { argb: 'FF1E3A5F' },  // navy
      }
      headerRow.alignment = { vertical: 'middle', horizontal: 'center' }
      headerRow.height    = 20

      // Data rows with alternating fill
      rows.forEach((row, i) => {
        const r = ws.addRow(Object.values(row))
        r.fill = {
          type: 'pattern', pattern: 'solid',
          fgColor: { argb: i % 2 === 0 ? 'FFFFFFFF' : 'FFF1F5F9' },
        }
      })

      // Auto column width
      ws.columns.forEach(col => {
        let max = 12
        col.eachCell?.({ includeEmpty: true }, cell => {
          const len = cell.value ? String(cell.value).length : 0
          if (len > max) max = len
        })
        col.width = Math.min(max + 4, 40)
      })

      res.setHeader('Content-Type',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
      res.setHeader('Content-Disposition', `attachment; filename="${filename}.xlsx"`)
      await wb.xlsx.write(res)
      return res.end()
    }

    // ── CSV ───────────────────────────────────────────────
    const parser = new Parser({ fields: Object.keys(rows[0]) })
    const csv    = parser.parse(rows)
    res.setHeader('Content-Type', 'text/csv')
    res.setHeader('Content-Disposition', `attachment; filename="${filename}.csv"`)
    return res.send(csv)

  } catch (err) {
    console.error('Export leads error:', err)
    res.status(500).json({ success: false, error: 'Server error' })
  }
}


// ==============================
// ✅ Update Lead
// ==============================
=======
export const adminGetLeads = async (_req: Request, res: Response) => {
  try {
    const leads = await Lead.find().sort({ createdAt: -1 });
    res.json({ success: true, leads });
  } catch (err) {
    console.error("Get leads error:", err);
    res.status(500).json({ success: false, error: "Server error" });
  }
};


>>>>>>> 12ce192d2a5bd74df4854ba96063b1583eb3a95c
export const adminUpdateLead = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

<<<<<<< HEAD
    if (!status) return res.status(400).json({ success: false, error: "Status is required" });

=======
>>>>>>> 12ce192d2a5bd74df4854ba96063b1583eb3a95c
    const lead = await Lead.findByIdAndUpdate(id, { status }, { new: true });
    if (!lead) return res.status(404).json({ success: false, error: "Lead not found" });

    res.json({ success: true, lead });
  } catch (err) {
    console.error("Update lead error:", err);
    res.status(500).json({ success: false, error: "Server error" });
  }
};

<<<<<<< HEAD
// ==============================
// ✅ Delete Lead
// ==============================
export const adminDeleteLead = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const lead = await Lead.findByIdAndDelete(id);

=======

export const adminDeleteLead = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const lead = await Lead.findByIdAndDelete(id);
>>>>>>> 12ce192d2a5bd74df4854ba96063b1583eb3a95c
    if (!lead) return res.status(404).json({ success: false, error: "Lead not found" });

    res.json({ success: true, message: "Lead deleted successfully" });
  } catch (err) {
    console.error("Delete lead error:", err);
    res.status(500).json({ success: false, error: "Server error" });
  }
};

<<<<<<< HEAD
// ==============================
// ✅ Daily Stats
// ==============================
// Existing function — UNTOUCHED
=======
>>>>>>> 12ce192d2a5bd74df4854ba96063b1583eb3a95c
export const adminDailyStats = async (_req: Request, res: Response) => {
  try {
    const stats = await Lead.aggregate([
      {
        $group: {
          _id: {
            year: { $year: "$createdAt" },
            month: { $month: "$createdAt" },
            day: { $dayOfMonth: "$createdAt" },
          },
          count: { $sum: 1 },
        },
      },
      { $sort: { "_id.year": -1, "_id.month": -1, "_id.day": -1 } },
    ]);
    res.json({ success: true, stats });
  } catch (err) {
<<<<<<< HEAD
    console.error("Daily stats error:", err);
=======
    console.error("Stats error:", err);
>>>>>>> 12ce192d2a5bd74df4854ba96063b1583eb3a95c
    res.status(500).json({ success: false, error: "Server error" });
  }
};

<<<<<<< HEAD
// ✅ NEW — Stat cards ke liye real-time counts
export const adminSummaryStats = async (_req: Request, res: Response) => {
  try {
    const today = new Date();
    const todayStart = new Date(today.setHours(0, 0, 0, 0));
    const todayEnd   = new Date(today.setHours(23, 59, 59, 999));

    const [statusCounts, todayFollowups, overdueFollowups] = await Promise.all([
      // Status-wise count
      Lead.aggregate([
        { $match: { isDeleted: false } },
        { $group: { _id: "$status", count: { $sum: 1 } } },
      ]),

      // Today's active follow-ups
      Lead.countDocuments({
        isDeleted: false,
        "followUp.active": true,
        "followUp.date": { $gte: todayStart, $lte: todayEnd },
      }),

      // Overdue follow-ups
      Lead.countDocuments({
        isDeleted: false,
        "followUp.active": true,
        "followUp.date": { $lt: todayStart },
      }),
    ]);

    // ["new", "contacted", "closed"] → { New: 5, Contacted: 3, Closed: 1 }
    const byStatus: Record<string, number> = {};
    let total = 0;
    statusCounts.forEach(({ _id, count }: { _id: string; count: number }) => {
      if (!_id) return;
      const key = _id.charAt(0).toUpperCase() + _id.slice(1).toLowerCase();
      byStatus[key] = count;
      total += count;
    });

    res.json({
      success: true,
      total,
      byStatus,
      todayFollowups,
      overdueFollowups,
    });
  } catch (err) {
    console.error("Summary stats error:", err);
    res.status(500).json({ success: false, error: "Server error" });
  }
};
// ==============================
// ✅ Export Leads CSV
// ==============================
// export const adminExportLeads = async (_req: Request, res: Response) => {
//   try {
//     // Fetch all leads sorted by newest first
//     const leads = await Lead.find().sort({ createdAt: -1 });

//     if (!leads.length)
//       return res.status(404).json({ success: false, error: "No leads found" });

//     // Map fields according to your model
//     const fields = [
//       { label: "Full Name", value: "fullName" },
//       { label: "Email", value: "email" },
//       { label: "Phone", value: "phone" },
//       { label: "Phone Verified", value: "phoneVerified" },
//       { label: "Planned Purchase Time", value: "whenAreYouPlanningToPurchase" },
//       { label: "Budget", value: "whatIsYourBudget" },
//       { label: "Message", value: "message" },
//       { label: "Source", value: "source" },
//       { label: "Status", value: "status" },
//       { label: "Created At", value: (row: any) => row.createdAt.toISOString() },
//     ];

//     const parser = new Parser({ fields });
//     const csv = parser.parse(leads);

//     // Send CSV file
//     res.header("Content-Type", "text/csv");
//     res.attachment("leads-export.csv");
//     res.send(csv);
//   } catch (err) {
//     console.error("Export leads error:", err);
//     res.status(500).json({ success: false, error: "Server error" });
//   }
// };

export const importLeadsController = async (req: Request, res: Response) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: "Please upload a file" });
    }

    const filePath = req.file.path;
    const ext = req.file.originalname.split(".").pop()?.toLowerCase();

    // ------------------------------
    // UTF-16 / NULL BYTE CLEANER
    // ------------------------------
    const cleanUTF16 = (value: any) => {
      if (value == null) return null;
      if (typeof value !== "string") return value;

      let str = value.replace(/\u0000/g, ""); // remove null bytes
      str = str.replace(/^"|"$/g, ""); // remove quotes
      str = str.trim();

      return str || null;
    };

    let data: any[] = [];

    // Read Excel / CSV
    const workbook = XLSX.readFile(filePath, { cellDates: true });
    const sheetName = workbook.SheetNames[0];
    data = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], {
      defval: null,
      raw: true,
    });

    // ⭐ Clean all rows from UTF-16 garbage
    const cleanedData = data.map((row: any) => {
      const cleanedRow: any = {};
      for (const [key, val] of Object.entries(row)) {
        cleanedRow[key] = cleanUTF16(val);
      }
      return cleanedRow;
    });

    // ------------------------------
    // SAVE DATA EXACT AS IT IS
    // ------------------------------
    for (const row of cleanedData) {
      await Lead.create({
        fullName:
          row.fullName ||
          row.name ||
          row["Full Name"] ||
          row["full_name"] ||
          "Unknown User",
      
        email: getEmail(row),   // ⭐ FIXED
        phone: getPhone(row),   // ⭐ FIXED
      
        message: row.message || row.Message || null,
      
        whenAreYouPlanningToPurchase:
          row.whenAreYouPlanningToPurchase ||
          row.PurchaseTime ||
          null,
      
        whatIsYourBudget:
          row.whatIsYourBudget ||
          row.Budget ||
          null,
      
        source: "import",
      
        extraFields: row,   // All fields stored
        rawData: row,
      
        receivedAt: new Date(),
      });
       
    }

    return res.json({
      message: "Leads imported successfully",
      total: cleanedData.length,
      sample: cleanedData[0], // preview clean data
    });

  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: "Import failed" });
  }
};


// ==============================
// ✅ Get Admin Profile
// ==============================
// export const adminGetProfile = async (req: Request, res: Response) => {
//   try {
//     const authHeader = req.headers.authorization;
//     if (!authHeader?.startsWith("Bearer "))
//       return res.status(401).json({ success: false, error: "Unauthorized" });

//     const token = authHeader.split(" ")[1];

//     let decoded: any;
//     try {
//       decoded = jwt.verify(token, JWT_SECRET);
//     } catch (err) {
//       return res.status(401).json({ success: false, error: "Invalid token" });
//     }

//     const admin = await Admin.findById(decoded.id).select("-password");
//     if (!admin) return res.status(404).json({ success: false, error: "Admin not found" });

//     res.json({ _id: admin._id, email: admin.email || "" });
//   } catch (err) {
//     console.error("Get admin profile error:", err);
//     res.status(500).json({ success: false, error: "Server error" });
//   }
// };
export const adminGetProfile = async (req: Request, res: Response) => {
  try {
    const admin = await Admin.findOne().select("-password");

    if (!admin) {
      return res.status(404).json({ success: false, error: "Admin not found" });
    }

    
    res.json({
      _id: admin._id,
      name: admin.name || "",
    });
  } catch (err) {
    console.error("Get admin profile error:", err);
    res.status(500).json({ success: false, error: "Server error" });
  }
};

// ==============================
// ✅ Get Leads That Need Reminder (Popup)
// ==============================
export const getReminderLeads = async (req: Request, res: Response) => {
  try {
    const leads = await Lead.find({
      reminderCount: { $gt: 0, $lte: 5 },
      status: { $ne: "closed" }
    }).sort({ lastReminderSent: -1 });

    return res.json({ success: true, leads });
  } catch (error) {
    console.error("Get reminder leads error:", error);
    return res.status(500).json({ success: false, error: "Server error" });
  }
};

// ==============================
// ✅ Mark Lead as Contacted (Reset Reminder)
// ==============================
export const markAsContacted = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    await Lead.findByIdAndUpdate(id, {
      status: "contacted",
      reminderCount: 0
    });

    return res.json({ success: true, message: "Lead marked as contacted" });
  } catch (error) {
    console.error("Mark contacted error:", error);
    return res.status(500).json({ success: false, error: "Server error" });
  }
};

// ==============================
// ✅ Dashboard – Pending Reminder Count
// ==============================
export const getPendingReminderCount = async (req: Request, res: Response) => {
  try {
    const count = await Lead.countDocuments({
      status: { $ne: "closed" },
      reminderCount: { $gte: 1, $lte: 5 }
    });

    return res.json({ success: true, pendingReminders: count });
  } catch (error) {
    console.error("Pending reminder count error:", error);
    return res.status(500).json({ success: false, error: "Server error" });
  }
};
=======

export const adminExportLeads = async (_req: Request, res: Response) => {
  try {
    const leads = await Lead.find().sort({ createdAt: -1 });

    if (!leads || leads.length === 0) {
      return res.status(404).json({ success: false, error: "No leads found" });
    }

    // Fields for CSV
    const fields = ["name", "email", "phone", "status", "message", "createdAt"];
    const opts = { fields };

    const parser = new Parser(opts);
    const csv = parser.parse(leads);

    // Set headers for CSV download
    res.header("Content-Type", "text/csv");
    res.attachment("leads-export.csv");
    return res.send(csv);
  } catch (err) {
    console.error("Export leads error:", err);
    res.status(500).json({ success: false, error: "Server error" });
  }
};
>>>>>>> 12ce192d2a5bd74df4854ba96063b1583eb3a95c
