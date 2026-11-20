"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.toggleUserStatus = exports.getAllUsers = exports.getAllTransactions = exports.toggleTenantStatus = exports.extendTenantSubscription = exports.getTenantDetails = exports.getAllTenants = exports.getPlatformOverview = void 0;
const tenant_model_1 = __importDefault(require("../models/tenant.model"));
const admin_model_1 = __importDefault(require("../models/admin.model"));
const lead_model_1 = __importDefault(require("../models/lead.model"));
const plan_model_1 = __importDefault(require("../models/plan.model"));
const subscriptionTransaction_model_1 = __importDefault(require("../models/subscriptionTransaction.model"));
// ── Super Admin: Platform Overview & Metrics ─────────────────────────────────
const getPlatformOverview = async (_req, res) => {
    try {
        const totalTenants = await tenant_model_1.default.countDocuments({ isMaster: false });
        const activeTenants = await tenant_model_1.default.countDocuments({ isMaster: false, status: "active" });
        const suspendedTenants = await tenant_model_1.default.countDocuments({ isMaster: false, status: "suspended" });
        const pendingPaymentTenants = await tenant_model_1.default.countDocuments({ isMaster: false, status: "pending_payment" });
        const totalUsers = await admin_model_1.default.countDocuments({});
        const activeUsers = await admin_model_1.default.countDocuments({ status: "active" });
        const superAdminCount = await admin_model_1.default.countDocuments({ role: "super_admin" });
        const tenantAdminCount = await admin_model_1.default.countDocuments({ role: { $in: ["tenant_admin", "admin"] } });
        const teamMemberCount = await admin_model_1.default.countDocuments({ role: "team_member" });
        const totalLeads = await lead_model_1.default.countDocuments({ isDeleted: false });
        // Calculate Total Revenue
        const revenueStats = await subscriptionTransaction_model_1.default.aggregate([
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
        const recentTransactions = await subscriptionTransaction_model_1.default.find({ status: "paid" })
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
    }
    catch (err) {
        console.error("Error in getPlatformOverview:", err);
        return res.status(500).json({ success: false, error: "Failed to fetch platform overview" });
    }
};
exports.getPlatformOverview = getPlatformOverview;
// ── Super Admin: List All SaaS Clients / Tenants ─────────────────────────────
const getAllTenants = async (req, res) => {
    try {
        const { search, status, page = "1", limit = "20" } = req.query;
        const query = { isMaster: false };
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
            tenant_model_1.default.find(query)
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(take)
                .populate("subscription.planId", "name priceMonthly priceYearly")
                .lean(),
            tenant_model_1.default.countDocuments(query),
        ]);
        // Attach lead counts, user counts, team members, and days remaining
        const enrichedTenants = await Promise.all(tenants.map(async (t) => {
            const [leadCount, userCount, users] = await Promise.all([
                lead_model_1.default.countDocuments({ tenantId: t._id, isDeleted: false }),
                admin_model_1.default.countDocuments({ tenantId: t._id }),
                admin_model_1.default.find({ tenantId: t._id }).select("name email phone role status createdAt").lean(),
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
        }));
        return res.status(200).json({
            success: true,
            tenants: enrichedTenants,
            totalCount,
            page: parseInt(page, 10),
            totalPages: Math.ceil(totalCount / take),
        });
    }
    catch (err) {
        console.error("Error in getAllTenants:", err);
        return res.status(500).json({ success: false, error: "Failed to list tenants" });
    }
};
exports.getAllTenants = getAllTenants;
// ── Super Admin: Get Tenant Details ──────────────────────────────────────────
const getTenantDetails = async (req, res) => {
    try {
        const { id } = req.params;
        const tenant = await tenant_model_1.default.findById(id).populate("subscription.planId").lean();
        if (!tenant) {
            return res.status(404).json({ success: false, error: "Tenant not found" });
        }
        const [adminUser, transactions, leadCount] = await Promise.all([
            admin_model_1.default.findOne({ tenantId: tenant._id }).select("-password").lean(),
            subscriptionTransaction_model_1.default.find({ tenantId: tenant._id }).sort({ createdAt: -1 }).lean(),
            lead_model_1.default.countDocuments({ tenantId: tenant._id, isDeleted: false }),
        ]);
        return res.status(200).json({
            success: true,
            tenant,
            adminUser,
            transactions,
            leadCount,
        });
    }
    catch (err) {
        console.error("Error in getTenantDetails:", err);
        return res.status(500).json({ success: false, error: "Failed to fetch tenant details" });
    }
};
exports.getTenantDetails = getTenantDetails;
// ── Super Admin: 1-Click Extend Plan / Manual Activation ─────────────────────
const extendTenantSubscription = async (req, res) => {
    try {
        const { id } = req.params;
        const { days = 30, planId, status = "active" } = req.body;
        const tenant = await tenant_model_1.default.findById(id);
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
            const plan = await plan_model_1.default.findById(planId);
            if (plan) {
                tenant.subscription.planId = plan._id;
                tenant.subscription.planName = plan.name;
                tenant.subscription.limits = plan.limits;
            }
        }
        await tenant.save();
        // Also activate associated admin user if previously suspended
        if (status === "active") {
            await admin_model_1.default.updateMany({ tenantId: tenant._id }, { $set: { status: "active" } });
        }
        return res.status(200).json({
            success: true,
            message: `Tenant subscription extended by ${days} days until ${newExpiry.toLocaleDateString("en-IN")}`,
            subscription: tenant.subscription,
            status: tenant.status,
        });
    }
    catch (err) {
        console.error("Error in extendTenantSubscription:", err);
        return res.status(500).json({ success: false, error: "Failed to extend subscription" });
    }
};
exports.extendTenantSubscription = extendTenantSubscription;
// ── Super Admin: Suspend or Activate Tenant ──────────────────────────────────
const toggleTenantStatus = async (req, res) => {
    try {
        const { id } = req.params;
        const { status } = req.body;
        if (!["active", "suspended"].includes(status)) {
            return res.status(400).json({
                success: false,
                error: "Status must be either 'active' or 'suspended'",
            });
        }
        const tenant = await tenant_model_1.default.findById(id);
        if (!tenant) {
            return res.status(404).json({ success: false, error: "Tenant not found" });
        }
        if (tenant.isMaster) {
            return res.status(400).json({ success: false, error: "Master Tenant cannot be suspended" });
        }
        tenant.status = status;
        if (status === "suspended") {
            tenant.subscription.status = "cancelled";
        }
        else {
            tenant.subscription.status = "active";
        }
        await tenant.save();
        await admin_model_1.default.updateMany({ tenantId: tenant._id }, { $set: { status: status === "active" ? "active" : "suspended" } });
        return res.status(200).json({
            success: true,
            message: `Tenant status changed to '${status}'`,
            tenant,
        });
    }
    catch (err) {
        console.error("Error in toggleTenantStatus:", err);
        return res.status(500).json({ success: false, error: "Failed to update tenant status" });
    }
};
exports.toggleTenantStatus = toggleTenantStatus;
// ── Super Admin: View All Transactions ───────────────────────────────────────
const getAllTransactions = async (req, res) => {
    try {
        const { page = "1", limit = "25", status } = req.query;
        const query = {};
        if (status && status !== "all") {
            query.status = status;
        }
        const skip = (Math.max(1, parseInt(page, 10)) - 1) * parseInt(limit, 10);
        const take = parseInt(limit, 10);
        const [transactions, totalCount] = await Promise.all([
            subscriptionTransaction_model_1.default.find(query)
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(take)
                .populate("tenantId", "name email phone")
                .populate("planId", "name")
                .lean(),
            subscriptionTransaction_model_1.default.countDocuments(query),
        ]);
        return res.status(200).json({
            success: true,
            transactions,
            totalCount,
            page: parseInt(page, 10),
            totalPages: Math.ceil(totalCount / take),
        });
    }
    catch (err) {
        console.error("Error in getAllTransactions:", err);
        return res.status(500).json({ success: false, error: "Failed to fetch transactions" });
    }
};
exports.getAllTransactions = getAllTransactions;
// ── Super Admin: List All Platform Users / Admins Across All Tenants ─────────
const getAllUsers = async (req, res) => {
    try {
        const { search, role, status, page = "1", limit = "25" } = req.query;
        const query = {};
        if (role && role !== "all") {
            if (role === "admin") {
                query.role = { $in: ["admin", "tenant_admin"] };
            }
            else {
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
            admin_model_1.default.find(query)
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
            admin_model_1.default.countDocuments(query),
        ]);
        return res.status(200).json({
            success: true,
            users,
            totalCount,
            page: parseInt(page, 10),
            totalPages: Math.ceil(totalCount / take),
        });
    }
    catch (err) {
        console.error("Error in getAllUsers:", err);
        return res.status(500).json({ success: false, error: "Failed to fetch platform users" });
    }
};
exports.getAllUsers = getAllUsers;
// ── Super Admin: Suspend or Activate User ─────────────────────────────────────
const toggleUserStatus = async (req, res) => {
    try {
        const { id } = req.params;
        const { status } = req.body;
        if (!["active", "suspended"].includes(status)) {
            return res.status(400).json({
                success: false,
                error: "Status must be either 'active' or 'suspended'",
            });
        }
        const user = await admin_model_1.default.findById(id);
        if (!user) {
            return res.status(404).json({ success: false, error: "User not found" });
        }
        if (user.role === "super_admin" && status === "suspended") {
            return res.status(400).json({ success: false, error: "Cannot suspend a Super Admin" });
        }
        user.status = status;
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
    }
    catch (err) {
        console.error("Error in toggleUserStatus:", err);
        return res.status(500).json({ success: false, error: "Failed to update user status" });
    }
};
exports.toggleUserStatus = toggleUserStatus;
//# sourceMappingURL=superAdmin.controller.js.map