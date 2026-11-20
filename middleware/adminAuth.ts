import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import mongoose from "mongoose";
import Tenant from "../models/tenant.model";
import Admin from "../models/admin.model";

const JWT_SECRET = process.env.JWT_SECRET || "supersecret";

export interface AuthenticatedRequest extends Request {
  adminId?: string;
  tenantId?: string;
  userRole?: string;
  userEmail?: string;
  tenant?: any;
}

/**
 * Validates JWT token and extracts user/tenant identity.
 * Compatible with legacy tokens (role: "admin") and SaaS tokens (role: "super_admin" | "tenant_admin" | "team_member").
 */
export const adminAuth = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  const authHeader = req.headers.authorization;
  const token = authHeader && authHeader.startsWith("Bearer ") ? authHeader.split(" ")[1] : null;

  if (!token) {
    return res.status(401).json({ success: false, error: "Unauthorized: Missing authentication token" });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET) as any;

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
        const adminDoc = await Admin.findById(req.adminId).select("tenantId role").lean();
        if (adminDoc?.tenantId) {
          req.tenantId = adminDoc.tenantId.toString();
        } else if (req.userRole === "super_admin") {
          const master = await Tenant.findOne({ isMaster: true }).select("_id").lean();
          if (master) req.tenantId = master._id.toString();
        }
      } catch (err) {
        // Continue gracefully
      }
    }

    // Load Tenant Record if tenantId exists
    if (req.tenantId) {
      try {
        const tenant = await Tenant.findById(req.tenantId).select("status subscription isMaster name").lean();
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
      } catch (err) {
        // Continue gracefully
      }
    }

    next();
  } catch (err: any) {
    return res.status(401).json({ success: false, error: "Invalid or expired token" });
  }
};

/**
 * Restricts route strictly to Super Admin.
 */
export const superAdminOnly = (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  const isSuperAdmin = req.userRole === "super_admin" && (!req.tenantId || req.tenant?.isMaster);
  if (!isSuperAdmin) {
    return res.status(403).json({
      success: false,
      error: "Forbidden: Super Admin access required",
    });
  }
  next();
};

/**
 * Returns database query filter partitioned by tenant.
 * - For super_admin: Allows filtering by requested tenantId, or defaults to their masterTenantId
 * - For tenant_admin / team_member: Strictly forces { tenantId: req.tenantId }
 */
export const getTenantFilter = (req: AuthenticatedRequest): Record<string, any> => {
  const isSuperAdmin = (req.userRole === "super_admin") && (!req.tenantId || req.tenant?.isMaster);

  if (isSuperAdmin) {
    const requestedTenantId = req.query.tenantId || req.headers["x-tenant-id"];
    if (requestedTenantId && requestedTenantId !== "all") {
      const tid = String(requestedTenantId);
      return { tenantId: mongoose.Types.ObjectId.isValid(tid) ? new mongoose.Types.ObjectId(tid) : tid };
    }
    if (req.query.allTenants === "true") {
      return {};
    }
    // Default super admin view to their own master organization if set
    if (req.tenantId) {
      const tid = String(req.tenantId);
      return { tenantId: mongoose.Types.ObjectId.isValid(tid) ? new mongoose.Types.ObjectId(tid) : tid };
    }
    return {};
  }

  // Tenant admin or team member: strictly isolated to their own tenantId
  if (!req.tenantId) {
    return { _id: null }; // Fallback to return empty result rather than leaking global data
  }

  const tid = String(req.tenantId);
  return { tenantId: mongoose.Types.ObjectId.isValid(tid) ? new mongoose.Types.ObjectId(tid) : tid };
};
