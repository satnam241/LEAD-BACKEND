"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.deletePlan = exports.togglePlanStatus = exports.updatePlan = exports.createPlan = exports.getAllPlansAdmin = exports.getPlanDetails = exports.getPublicPlans = void 0;
const plan_model_1 = __importDefault(require("../models/plan.model"));
const tenant_model_1 = __importDefault(require("../models/tenant.model"));
// ── Public: Get Plans for Landing Page ───────────────────────────────────────
const getPublicPlans = async (_req, res) => {
    try {
        const plans = await plan_model_1.default.find({ isActive: true })
            .sort({ sortOrder: 1, createdAt: 1 })
            .lean();
        return res.status(200).json({
            success: true,
            plans,
            count: plans.length,
        });
    }
    catch (err) {
        console.error("Error fetching public plans:", err);
        return res.status(500).json({
            success: false,
            error: "Failed to fetch subscription plans",
        });
    }
};
exports.getPublicPlans = getPublicPlans;
// ── Public: Get Single Plan by ID or Slug ────────────────────────────────────
const getPlanDetails = async (req, res) => {
    try {
        const rawParam = req.params.idOrSlug;
        const idOrSlug = Array.isArray(rawParam) ? rawParam[0] : String(rawParam || "");
        const plan = idOrSlug.match(/^[0-9a-fA-F]{24}$/)
            ? await plan_model_1.default.findById(idOrSlug).lean()
            : await plan_model_1.default.findOne({ slug: idOrSlug.toLowerCase() }).lean();
        if (!plan) {
            return res.status(404).json({ success: false, error: "Plan not found" });
        }
        return res.status(200).json({ success: true, plan });
    }
    catch (err) {
        console.error("Error fetching plan details:", err);
        return res.status(500).json({ success: false, error: "Failed to fetch plan" });
    }
};
exports.getPlanDetails = getPlanDetails;
// ── Super Admin: Get All Plans (Active + Inactive) with Tenant Counts ────────
const getAllPlansAdmin = async (_req, res) => {
    try {
        const plans = await plan_model_1.default.find().sort({ sortOrder: 1, createdAt: 1 }).lean();
        // Attach active subscriber counts
        const plansWithStats = await Promise.all(plans.map(async (plan) => {
            const subscriberCount = await tenant_model_1.default.countDocuments({
                "subscription.planId": plan._id,
                status: "active",
            });
            return {
                ...plan,
                subscriberCount,
            };
        }));
        return res.status(200).json({
            success: true,
            plans: plansWithStats,
        });
    }
    catch (err) {
        console.error("Error in getAllPlansAdmin:", err);
        return res.status(500).json({ success: false, error: "Failed to fetch admin plans" });
    }
};
exports.getAllPlansAdmin = getAllPlansAdmin;
// ── Super Admin: Create Plan ─────────────────────────────────────────────────
const createPlan = async (req, res) => {
    try {
        const { name, slug: userSlug, description, priceMonthly, priceYearly, currency = "INR", features = [], limits = {}, badge, isPopular = false, isActive = true, sortOrder = 0, } = req.body;
        if (!name || priceMonthly === undefined || priceYearly === undefined) {
            return res.status(400).json({
                success: false,
                error: "Plan name, monthly price, and yearly price are required",
            });
        }
        const slug = (userSlug || name.toLowerCase().replace(/[^a-z0-9]+/g, "-")).trim();
        const existingSlug = await plan_model_1.default.findOne({ slug });
        if (existingSlug) {
            return res.status(400).json({
                success: false,
                error: `Plan with slug '${slug}' already exists`,
            });
        }
        const plan = await plan_model_1.default.create({
            name: name.trim(),
            slug,
            description: description || "",
            priceMonthly: Number(priceMonthly),
            priceYearly: Number(priceYearly),
            currency,
            features: Array.isArray(features) ? features : [],
            limits: {
                maxLeads: limits.maxLeads ?? 500,
                maxProjects: limits.maxProjects ?? 2,
                maxCampaigns: limits.maxCampaigns ?? 1000,
                aiBotEnabled: limits.aiBotEnabled ?? true,
                fbIntegrationEnabled: limits.fbIntegrationEnabled ?? true,
                customGoogleCalendar: limits.customGoogleCalendar ?? true,
            },
            badge: badge || null,
            isPopular: Boolean(isPopular),
            isActive: Boolean(isActive),
            sortOrder: Number(sortOrder) || 0,
        });
        return res.status(201).json({
            success: true,
            message: "Plan created successfully",
            plan,
        });
    }
    catch (err) {
        console.error("Error creating plan:", err);
        return res.status(500).json({
            success: false,
            error: err.message || "Failed to create plan",
        });
    }
};
exports.createPlan = createPlan;
// ── Super Admin: Update Plan ─────────────────────────────────────────────────
const updatePlan = async (req, res) => {
    try {
        const { id } = req.params;
        const updates = { ...req.body };
        if (updates.slug) {
            updates.slug = updates.slug.toLowerCase().trim();
            const existing = await plan_model_1.default.findOne({ slug: updates.slug, _id: { $ne: id } });
            if (existing) {
                return res.status(400).json({
                    success: false,
                    error: `Another plan already uses slug '${updates.slug}'`,
                });
            }
        }
        const plan = await plan_model_1.default.findByIdAndUpdate(id, { $set: updates }, { new: true, runValidators: true });
        if (!plan) {
            return res.status(404).json({ success: false, error: "Plan not found" });
        }
        return res.status(200).json({
            success: true,
            message: "Plan updated successfully",
            plan,
        });
    }
    catch (err) {
        console.error("Error updating plan:", err);
        return res.status(500).json({
            success: false,
            error: err.message || "Failed to update plan",
        });
    }
};
exports.updatePlan = updatePlan;
// ── Super Admin: Toggle Plan Status ──────────────────────────────────────────
const togglePlanStatus = async (req, res) => {
    try {
        const { id } = req.params;
        const plan = await plan_model_1.default.findById(id);
        if (!plan) {
            return res.status(404).json({ success: false, error: "Plan not found" });
        }
        plan.isActive = !plan.isActive;
        await plan.save();
        return res.status(200).json({
            success: true,
            message: `Plan ${plan.isActive ? "activated" : "deactivated"} successfully`,
            plan,
        });
    }
    catch (err) {
        console.error("Error toggling plan status:", err);
        return res.status(500).json({ success: false, error: "Failed to toggle plan status" });
    }
};
exports.togglePlanStatus = togglePlanStatus;
// ── Super Admin: Delete Plan ─────────────────────────────────────────────────
const deletePlan = async (req, res) => {
    try {
        const { id } = req.params;
        // Check if any tenant is actively subscribed to this plan
        const activeSubscribers = await tenant_model_1.default.countDocuments({
            "subscription.planId": id,
            status: "active",
        });
        if (activeSubscribers > 0) {
            return res.status(400).json({
                success: false,
                error: `Cannot delete plan: ${activeSubscribers} active tenant(s) are currently on this plan. Deactivate it instead.`,
            });
        }
        const deleted = await plan_model_1.default.findByIdAndDelete(id);
        if (!deleted) {
            return res.status(404).json({ success: false, error: "Plan not found" });
        }
        return res.status(200).json({
            success: true,
            message: "Plan deleted successfully",
        });
    }
    catch (err) {
        console.error("Error deleting plan:", err);
        return res.status(500).json({ success: false, error: "Failed to delete plan" });
    }
};
exports.deletePlan = deletePlan;
//# sourceMappingURL=plan.controller.js.map