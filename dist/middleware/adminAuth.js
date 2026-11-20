"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getTenantFilter = exports.superAdminOnly = exports.adminAuth = void 0;
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const mongoose_1 = __importDefault(require("mongoose"));
const tenant_model_1 = __importDefault(require("../models/tenant.model"));
const admin_model_1 = __importDefault(require("../models/admin.model"));
const JWT_SECRET = process.env.JWT_SECRET || "supersecret";
/**
 * Validates JWT token and extracts user/tenant identity.
 * Compatible with legacy tokens (role: "admin") and SaaS tokens (role: "super_admin" | "tenant_admin" | "team_member").
 */
const adminAuth = async (req, res, next) => {
    const authHeader = req.headers.authorization;
    const token = authHeader && authHeader.startsWith("Bearer ") ? authHeader.split(" ")[1] : null;
    if (!token) {
        return res.status(401).json({ success: false, error: "Unauthorized: Missing authentication token" });
    }
    try {
        const decoded = jsonwebtoken_1.default.verify(token, JWT_SECRET);
        const allowedRoles = ["admin", "super_admin", "tenant_admin", "team_member"];
        if (!allowedRoles.includes(decoded.role)) {
            return res.status(403).json({ success: false, error: "Forbidden: Access denied" });
        }
        req.adminId = decoded.userId || decoded.id;
        req.tenantId = decoded.tenantId ? String(decoded.tenantId) : undefined;
        req.userRole = decoded.role;
        req.userEmail = decoded.email;
        // Fallback: If tenantId was not encoded in legacy token, resolve from DB
        if (!req.tenantId && req.adminId) {
            try {
                const adminDoc = await admin_model_1.default.findById(req.adminId).select("tenantId role").lean();
                if (adminDoc?.tenantId) {
                    req.tenantId = adminDoc.tenantId.toString();
                }
                else if (req.userRole === "super_admin") {
                    const master = await tenant_model_1.default.findOne({ isMaster: true }).select("_id").lean();
                    if (master)
                        req.tenantId = master._id.toString();
                }
            }
            catch (err) {
                // Continue gracefully
            }
        }
        // Load Tenant Record if tenantId exists
        if (req.tenantId) {
            try {
                const tenant = await tenant_model_1.default.findById(req.tenantId).select("status subscription isMaster name").lean();
                if (tenant) {
                    req.tenant = tenant;
                    // If tenant account is suspended/pending and user is NOT super admin of master tenant
                    if (!tenant.isMaster && req.userRole !== "super_admin") {
                        if (tenant.status === "suspended") {
                            return res.status(403).json({
                                success: false,
                                error: "Your organization account is suspended. Please contact administrator.",
                                isSuspended: true,
                            });
                        }
                        if (tenant.status === "pending_payment") {
                            return res.status(402).json({
                                success: false,
                                error: "Subscription payment is pending. Please complete payment.",
                                paymentRequired: true,
                            });
                        }
                    }
                }
            }
            catch (err) {
                // Continue gracefully
            }
        }
        next();
    }
    catch (err) {
        return res.status(401).json({ success: false, error: "Invalid or expired token" });
    }
};
exports.adminAuth = adminAuth;
/**
 * Restricts route strictly to Super Admin.
 */
const superAdminOnly = (req, res, next) => {
    const isSuperAdmin = req.userRole === "super_admin" && (!req.tenantId || req.tenant?.isMaster);
    if (!isSuperAdmin) {
        return res.status(403).json({
            success: false,
            error: "Forbidden: Super Admin access required",
        });
    }
    next();
};
exports.superAdminOnly = superAdminOnly;
/**
 * Returns database query filter partitioned by tenant.
 * - For super_admin: Allows filtering by requested tenantId, or defaults to their masterTenantId
 * - For tenant_admin / team_member: Strictly forces { tenantId: req.tenantId }
 */
const getTenantFilter = (req) => {
    const isSuperAdmin = (req.userRole === "super_admin") && (!req.tenantId || req.tenant?.isMaster);
    if (isSuperAdmin) {
        const requestedTenantId = req.query.tenantId || req.headers["x-tenant-id"];
        if (requestedTenantId && requestedTenantId !== "all") {
            const tid = String(requestedTenantId);
            return { tenantId: mongoose_1.default.Types.ObjectId.isValid(tid) ? new mongoose_1.default.Types.ObjectId(tid) : tid };
        }
        if (req.query.allTenants === "true") {
            return {};
        }
        // Default super admin view to their own master organization if set
        if (req.tenantId) {
            const tid = String(req.tenantId);
            return { tenantId: mongoose_1.default.Types.ObjectId.isValid(tid) ? new mongoose_1.default.Types.ObjectId(tid) : tid };
        }
        return {};
    }
    // Tenant admin or team member: strictly isolated to their own tenantId
    if (!req.tenantId) {
        return { _id: null }; // Fallback to return empty result rather than leaking global data
    }
    const tid = String(req.tenantId);
    return { tenantId: mongoose_1.default.Types.ObjectId.isValid(tid) ? new mongoose_1.default.Types.ObjectId(tid) : tid };
};
exports.getTenantFilter = getTenantFilter;
//# sourceMappingURL=adminAuth.js.map