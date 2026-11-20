import { Response } from "express";
import Tenant from "../models/tenant.model";
import Admin from "../models/admin.model";
import Lead from "../models/lead.model";
import Plan from "../models/plan.model";
import SubscriptionTransaction from "../models/subscriptionTransaction.model";
import { AuthenticatedRequest } from "../middleware/adminAuth";

// ── Super Admin: Platform Overview & Metrics ─────────────────────────────────
export const getPlatformOverview = async (_req: AuthenticatedRequest, res: Response) => {
  try {
    const totalTenants = await Tenant.countDocuments({ isMaster: false });
    const activeTenants = await Tenant.countDocuments({ isMaster: false, status: "active" });
    const suspendedTenants = await Tenant.countDocuments({ isMaster: false, status: "suspended" });
    const pendingPaymentTenants = await Tenant.countDocuments({ isMaster: false, status: "pending_payment" });

    const totalUsers = await Admin.countDocuments({});
    const activeUsers = await Admin.countDocuments({ status: "active" });
    const superAdminCount = await Admin.countDocuments({ role: "super_admin" });
    const tenantAdminCount = await Admin.countDocuments({ role: { $in: ["tenant_admin", "admin"] } });
    const teamMemberCount = await Admin.countDocuments({ role: "team_member" });

    const totalLeads = await Lead.countDocuments({ isDeleted: false });

    // Calculate Total Revenue
    const revenueStats = await SubscriptionTransaction.aggregate([
      { $match: { status: "paid" } },
      {
        $group: {
          _id: null,
          totalRevenue: { $sum: "$amount" },
          paidCount: { $sum: 1 },
        },
      },
    ]);

    const totalRevenue = revenueStats[0]?.totalRevenue || 0;
    const paidCount = revenueStats[0]?.paidCount || 0;

    // Recent Transactions
    const recentTransactions = await SubscriptionTransaction.find({ status: "paid" })
      .sort({ paidAt: -1 })
      .limit(5)
      .populate("tenantId", "name email phone")
      .populate("planId", "name")
      .lean();

    return res.status(200).json({
      success: true,
      stats: {
        totalTenants,
        activeTenants,
        suspendedTenants,
        pendingPaymentTenants,
        totalUsers,
        activeUsers,
        superAdminCount,
        tenantAdminCount,
        teamMemberCount,
        totalLeads,
        totalRevenue,
        paidTransactionsCount: paidCount,
      },
      recentTransactions,
    });
  } catch (err: any) {
    console.error("Error in getPlatformOverview:", err);
    return res.status(500).json({ success: false, error: "Failed to fetch platform overview" });
  }
};

// ── Super Admin: List All SaaS Clients / Tenants ─────────────────────────────
export const getAllTenants = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { search, status, page = "1", limit = "20" } = req.query as Record<string, string>;

    const query: Record<string, any> = { isMaster: false };

    if (status && status !== "all") {
      query.status = status;
    }

    if (search) {
      const regex = new RegExp(search.trim(), "i");
      query.$or = [{ name: regex }, { ownerName: regex }, { email: regex }, { phone: regex }];
    }

    const skip = (Math.max(1, parseInt(page, 10)) - 1) * parseInt(limit, 10);
    const take = parseInt(limit, 10);

    const [tenants, totalCount] = await Promise.all([
      Tenant.find(query)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(take)
        .populate("subscription.planId", "name priceMonthly priceYearly")
        .lean(),
      Tenant.countDocuments(query),
    ]);

    // Attach lead counts, user counts, team members, and days remaining
    const enrichedTenants = await Promise.all(
      tenants.map(async (t) => {
        const [leadCount, userCount, users] = await Promise.all([
          Lead.countDocuments({ tenantId: t._id, isDeleted: false }),
          Admin.countDocuments({ tenantId: t._id }),
          Admin.find({ tenantId: t._id }).select("name email phone role status createdAt").lean(),
        ]);
        const expiresAt = t.subscription?.expiresAt ? new Date(t.subscription.expiresAt).getTime() : 0;
        const daysRemaining = Math.max(0, Math.ceil((expiresAt - Date.now()) / (1000 * 60 * 60 * 24)));

        return {
          ...t,
          leadCount,
          userCount,
          users,
          daysRemaining,
        };
      })
    );

    return res.status(200).json({
      success: true,
      tenants: enrichedTenants,
      totalCount,
      page: parseInt(page, 10),
      totalPages: Math.ceil(totalCount / take),
    });
  } catch (err: any) {
    console.error("Error in getAllTenants:", err);
    return res.status(500).json({ success: false, error: "Failed to list tenants" });
  }
};

// ── Super Admin: Get Tenant Details ──────────────────────────────────────────
export const getTenantDetails = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id } = req.params;

    const tenant = await Tenant.findById(id).populate("subscription.planId").lean();
    if (!tenant) {
      return res.status(404).json({ success: false, error: "Tenant not found" });
    }

    const [adminUser, transactions, leadCount] = await Promise.all([
      Admin.findOne({ tenantId: tenant._id }).select("-password").lean(),
      SubscriptionTransaction.find({ tenantId: tenant._id }).sort({ createdAt: -1 }).lean(),
      Lead.countDocuments({ tenantId: tenant._id, isDeleted: false }),
    ]);

    return res.status(200).json({
      success: true,
      tenant,
      adminUser,
      transactions,
      leadCount,
    });
  } catch (err: any) {
    console.error("Error in getTenantDetails:", err);
    return res.status(500).json({ success: false, error: "Failed to fetch tenant details" });
  }
};

// ── Super Admin: 1-Click Extend Plan / Manual Activation ─────────────────────
export const extendTenantSubscription = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { days = 30, planId, status = "active" } = req.body;

    const tenant = await Tenant.findById(id);
    if (!tenant) {
      return res.status(404).json({ success: false, error: "Tenant not found" });
    }

    // Extend expiry
    const currentExpiry = tenant.subscription?.expiresAt
      ? new Date(tenant.subscription.expiresAt).getTime()
      : Date.now();
    const baseTime = Math.max(Date.now(), currentExpiry);
    const newExpiry = new Date(baseTime + Number(days) * 86400000);

    tenant.status = status;
    tenant.subscription.status = status;
    tenant.subscription.expiresAt = newExpiry;

    if (planId) {
      const plan = await Plan.findById(planId);
      if (plan) {
        tenant.subscription.planId = plan._id as any;
        tenant.subscription.planName = plan.name;
        tenant.subscription.limits = plan.limits;
      }
    }

    await tenant.save();

    // Also activate associated admin user if previously suspended
    if (status === "active") {
      await Admin.updateMany({ tenantId: tenant._id }, { $set: { status: "active" } });
    }

    return res.status(200).json({
      success: true,
      message: `Tenant subscription extended by ${days} days until ${newExpiry.toLocaleDateString("en-IN")}`,
      subscription: tenant.subscription,
      status: tenant.status,
    });
  } catch (err: any) {
    console.error("Error in extendTenantSubscription:", err);
    return res.status(500).json({ success: false, error: "Failed to extend subscription" });
  }
};

// ── Super Admin: Suspend or Activate Tenant ──────────────────────────────────
export const toggleTenantStatus = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    if (!["active", "suspended"].includes(status)) {
      return res.status(400).json({
        success: false,
        error: "Status must be either 'active' or 'suspended'",
      });
    }

    const tenant = await Tenant.findById(id);
    if (!tenant) {
      return res.status(404).json({ success: false, error: "Tenant not found" });
    }

    if (tenant.isMaster) {
      return res.status(400).json({ success: false, error: "Master Tenant cannot be suspended" });
    }

    tenant.status = status;
    if (status === "suspended") {
      tenant.subscription.status = "cancelled";
    } else {
      tenant.subscription.status = "active";
    }
    await tenant.save();

    await Admin.updateMany(
      { tenantId: tenant._id },
      { $set: { status: status === "active" ? "active" : "suspended" } }
    );

    return res.status(200).json({
      success: true,
      message: `Tenant status changed to '${status}'`,
      tenant,
    });
  } catch (err: any) {
    console.error("Error in toggleTenantStatus:", err);
    return res.status(500).json({ success: false, error: "Failed to update tenant status" });
  }
};

// ── Super Admin: View All Transactions ───────────────────────────────────────
export const getAllTransactions = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { page = "1", limit = "25", status } = req.query as Record<string, string>;

    const query: Record<string, any> = {};
    if (status && status !== "all") {
      query.status = status;
    }

    const skip = (Math.max(1, parseInt(page, 10)) - 1) * parseInt(limit, 10);
    const take = parseInt(limit, 10);

    const [transactions, totalCount] = await Promise.all([
      SubscriptionTransaction.find(query)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(take)
        .populate("tenantId", "name email phone")
        .populate("planId", "name")
        .lean(),
      SubscriptionTransaction.countDocuments(query),
    ]);

    return res.status(200).json({
      success: true,
      transactions,
      totalCount,
      page: parseInt(page, 10),
      totalPages: Math.ceil(totalCount / take),
    });
  } catch (err: any) {
    console.error("Error in getAllTransactions:", err);
    return res.status(500).json({ success: false, error: "Failed to fetch transactions" });
  }
};

// ── Super Admin: List All Platform Users / Admins Across All Tenants ─────────
export const getAllUsers = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { search, role, status, page = "1", limit = "25" } = req.query as Record<string, string>;

    const query: Record<string, any> = {};

    if (role && role !== "all") {
      if (role === "admin") {
        query.role = { $in: ["admin", "tenant_admin"] };
      } else {
        query.role = role;
      }
    }

    if (status && status !== "all") {
      query.status = status;
    }

    if (search) {
      const regex = new RegExp(search.trim(), "i");
      query.$or = [{ name: regex }, { email: regex }, { phone: regex }, { companyName: regex }];
    }

    const skip = (Math.max(1, parseInt(page, 10)) - 1) * parseInt(limit, 10);
    const take = parseInt(limit, 10);

    const [users, totalCount] = await Promise.all([
      Admin.find(query)
        .select("-password")
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(take)
        .populate({
          path: "tenantId",
          select: "name status subscription email phone",
          populate: { path: "subscription.planId", select: "name limits" },
        })
        .lean(),
      Admin.countDocuments(query),
    ]);

    return res.status(200).json({
      success: true,
      users,
      totalCount,
      page: parseInt(page, 10),
      totalPages: Math.ceil(totalCount / take),
    });
  } catch (err: any) {
    console.error("Error in getAllUsers:", err);
    return res.status(500).json({ success: false, error: "Failed to fetch platform users" });
  }
};

// ── Super Admin: Suspend or Activate User ─────────────────────────────────────
export const toggleUserStatus = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    if (!["active", "suspended"].includes(status)) {
      return res.status(400).json({
        success: false,
        error: "Status must be either 'active' or 'suspended'",
      });
    }

    const user = await Admin.findById(id);
    if (!user) {
      return res.status(404).json({ success: false, error: "User not found" });
    }

    if ((user as any).role === "super_admin" && status === "suspended") {
      return res.status(400).json({ success: false, error: "Cannot suspend a Super Admin" });
    }

    user.status = status as any;
    await user.save();

    return res.status(200).json({
      success: true,
      message: `User status changed to '${status}'`,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        status: user.status,
      },
    });
  } catch (err: any) {
    console.error("Error in toggleUserStatus:", err);
    return res.status(500).json({ success: false, error: "Failed to update user status" });
  }
};
