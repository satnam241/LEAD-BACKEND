import express from "express";
import {
  getPlatformOverview,
  getAllTenants,
  getTenantDetails,
  extendTenantSubscription,
  toggleTenantStatus,
  getAllTransactions,
  getAllUsers,
  toggleUserStatus,
} from "../controllers/superAdmin.controller";
import { adminAuth, superAdminOnly } from "../middleware/adminAuth";

const router = express.Router();

// ── Super Admin Platform Management (All endpoints restricted to superAdminOnly) ──
router.use(adminAuth, superAdminOnly);

router.get("/overview", getPlatformOverview);
router.get("/tenants", getAllTenants);
router.get("/tenants/:id", getTenantDetails);
router.patch("/tenants/:id/extend", extendTenantSubscription);
router.patch("/tenants/:id/status", toggleTenantStatus);
router.get("/transactions", getAllTransactions);
router.get("/users", getAllUsers);
router.patch("/users/:id/status", toggleUserStatus);

export default router;
