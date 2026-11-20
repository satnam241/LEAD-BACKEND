"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.saasLogout = exports.saasRefreshToken = exports.getMe = exports.saasLogin = exports.saasVerifyPayment = exports.saasSignup = exports.JWT_REFRESH_SECRET = void 0;
const axios_1 = __importDefault(require("axios"));
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const admin_model_1 = __importDefault(require("../models/admin.model"));
const tenant_model_1 = __importDefault(require("../models/tenant.model"));
const plan_model_1 = __importDefault(require("../models/plan.model"));
const project_model_1 = __importDefault(require("../models/project.model"));
const subscriptionTransaction_model_1 = __importDefault(require("../models/subscriptionTransaction.model"));
const emailService_1 = require("../services/emailService");
const JWT_SECRET = process.env.JWT_SECRET || "supersecret";
exports.JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET ||
    (process.env.JWT_SECRET ? process.env.JWT_SECRET + "_refresh" : "supersecret_refresh");
/**
 * 1. User signs up on landing page with selected plan.
 * Verifies that email & phone are unique and mapped.
 * Creates pending admin user & tenant record, returns payment order payload.
 */
const saasSignup = async (req, res) => {
    try {
        const { name, email, phone, password, companyName, planId, billingCycle = "monthly", } = req.body;
        // Validation
        if (!name || !email || !phone || !password || !planId) {
            return res.status(400).json({
                success: false,
                error: "Full name, email, phone number, password, and planId are required.",
            });
        }
        const cleanEmail = String(email).toLowerCase().trim();
        const cleanPhone = String(phone).trim();
        const cleanCycle = billingCycle === "yearly" ? "yearly" : "monthly";
        // Strict uniqueness check on Email & Phone across Tenant & Admin
        const existingTenant = await tenant_model_1.default.findOne({
            $or: [{ email: cleanEmail }, { phone: cleanPhone }],
        });
        const existingAdmin = await admin_model_1.default.findOne({
            $or: [{ email: cleanEmail }, { phone: cleanPhone }],
        });
        if (existingTenant || existingAdmin) {
            return res.status(400).json({
                success: false,
                error: "Email address or phone number is already registered. Please log in or use a different contact.",
            });
        }
        // Locate Plan
        const plan = planId.match(/^[0-9a-fA-F]{24}$/)
            ? await plan_model_1.default.findById(planId)
            : await plan_model_1.default.findOne({ slug: planId.toLowerCase() });
        if (!plan || !plan.isActive) {
            return res.status(404).json({
                success: false,
                error: "Selected subscription plan is not available or inactive.",
            });
        }
        // Calculate Amount
        const amount = cleanCycle === "yearly" ? plan.priceYearly : plan.priceMonthly;
        // Hash Password
        const hashedPassword = await bcryptjs_1.default.hash(password, 10);
        const businessName = companyName?.trim() || `${name.trim()}'s Properties`;
        // 1. Create Pending Tenant
        const tenant = await tenant_model_1.default.create({
            name: businessName,
            ownerName: name.trim(),
            email: cleanEmail,
            phone: cleanPhone,
            status: "pending_payment",
            isMaster: false,
            subscription: {
                planId: plan._id,
                planName: plan.name,
                billingCycle: cleanCycle,
                startDate: new Date(),
                expiresAt: new Date(Date.now() + (cleanCycle === "yearly" ? 365 : 30) * 86400000),
                status: "pending_payment",
                autoRenew: false,
                limits: plan.limits,
            },
            notificationEmails: {
                primaryEmail: cleanEmail,
                secondaryEmail1: null,
                secondaryEmail2: null,
            },
            facebookConfig: {
                isConnected: false,
                formIds: [],
            },
            googleConfig: {
                isConnected: false,
            },
        });
        // 2. Create Pending Admin Account
        const admin = await admin_model_1.default.create({
            name: name.trim(),
            email: cleanEmail,
            phone: cleanPhone,
            password: hashedPassword,
            role: "tenant_admin",
            tenantId: tenant._id,
            companyName: businessName,
            status: "pending_payment",
        });
        // 3. Create Gateway Order Reference
        const invoiceNumber = `INV-${Date.now().toString().slice(-6)}`;
        let razorpayOrderId = null;
        const rzpKey = process.env.RAZORPAY_KEY_ID;
        const rzpSecret = process.env.RAZORPAY_KEY_SECRET;
        if (rzpKey && rzpSecret) {
            try {
                const auth = Buffer.from(`${rzpKey}:${rzpSecret}`).toString("base64");
                const rzpRes = await axios_1.default.post("https://api.razorpay.com/v1/orders", {
                    amount: Math.round(amount * 100),
                    currency: plan.currency || "INR",
                    receipt: invoiceNumber,
                    notes: {
                        tenantId: String(tenant._id),
                        planName: plan.name,
                        subscriberEmail: cleanEmail,
                    },
                }, {
                    headers: {
                        Authorization: `Basic ${auth}`,
                        "Content-Type": "application/json",
                    },
                });
                if (rzpRes.data && rzpRes.data.id) {
                    razorpayOrderId = rzpRes.data.id;
                }
            }
            catch (rzpErr) {
                console.warn("Razorpay API order creation note:", rzpErr.response?.data || rzpErr.message);
            }
        }
        const gatewayOrderId = razorpayOrderId || `ORDER_${Date.now()}_${Math.floor(1000 + Math.random() * 9000)}`;
        const transaction = await subscriptionTransaction_model_1.default.create({
            tenantId: tenant._id,
            userId: admin._id,
            planId: plan._id,
            planName: plan.name,
            gateway: "razorpay",
            gatewayOrderId,
            amount,
            currency: plan.currency || "INR",
            billingCycle: cleanCycle,
            status: "pending",
            invoiceNumber,
        });
        return res.status(201).json({
            success: true,
            message: "Signup successful. Complete payment to activate your dashboard.",
            order: {
                orderId: gatewayOrderId,
                razorpayOrderId,
                keyId: rzpKey || null,
                transactionId: transaction._id,
                amount,
                currency: plan.currency || "INR",
                planName: plan.name,
                billingCycle: cleanCycle,
                tenantId: tenant._id,
                user: {
                    id: admin._id,
                    name: admin.name,
                    email: admin.email,
                    phone: admin.phone,
                },
            },
        });
    }
    catch (err) {
        console.error("Error in saasSignup:", err);
        return res.status(500).json({
            success: false,
            error: err.message || "Failed to complete signup",
        });
    }
};
exports.saasSignup = saasSignup;
/**
 * 2. Verify / Capture Payment.
 * Activates Tenant & Admin, sets subscription validity, and issues JWT token.
 */
const saasVerifyPayment = async (req, res) => {
    try {
        const { orderId, paymentId, tenantId: bodyTenantId } = req.body;
        if (!orderId) {
            return res.status(400).json({
                success: false,
                error: "orderId is required to verify payment",
            });
        }
        const transaction = await subscriptionTransaction_model_1.default.findOne({ gatewayOrderId: orderId });
        if (!transaction) {
            return res.status(404).json({
                success: false,
                error: "Subscription transaction not found",
            });
        }
        const tenantId = transaction.tenantId || bodyTenantId;
        const tenant = await tenant_model_1.default.findById(tenantId);
        if (!tenant) {
            return res.status(404).json({ success: false, error: "Associated tenant not found" });
        }
        const admin = await admin_model_1.default.findOne({ tenantId: tenant._id });
        if (!admin) {
            return res.status(404).json({ success: false, error: "Associated admin user not found" });
        }
        // Determine cycle duration
        const daysToAdd = transaction.billingCycle === "yearly" ? 365 : 30;
        const expiresAt = new Date(Date.now() + daysToAdd * 86400000);
        // Update Transaction
        transaction.status = "success";
        transaction.gatewayPaymentId = paymentId || `PAY_${Date.now()}_MOCK`;
        transaction.paidAt = new Date();
        await transaction.save();
        // Activate Tenant
        tenant.status = "active";
        tenant.subscription.status = "active";
        tenant.subscription.startDate = new Date();
        tenant.subscription.expiresAt = expiresAt;
        await tenant.save();
        // Activate Admin
        admin.status = "active";
        await admin.save();
        // Auto-seed Demo Project for new Tenant so AI is immediately active & testable
        try {
            const tenantIdStr = String(tenant._id);
            const existingProject = await project_model_1.default.findOne({ tenantId: tenant._id });
            if (!existingProject) {
                const slug = `demo-luxury-heights-${tenantIdStr.slice(-6)}`;
                await project_model_1.default.create({
                    tenantId: tenant._id,
                    name: 'Emerald Heights (Sample Project)',
                    slug,
                    keywords: ['emerald', 'heights', 'sample', 'flat', 'apartment', '2bhk', '3bhk'],
                    summary: 'Luxury high-rise residential township with world-class amenities, premium finishes, and expressway connectivity.',
                    location: 'Sector 150, Noida Expressway',
                    developer: tenant.name || 'Prime Developers',
                    priceRange: '₹75 Lakhs - ₹1.45 Cr',
                    possession: 'December 2026',
                    reraNumber: 'UPRERAPRJ987654',
                    paymentPlan: 'Flexible Construction-Linked Payment (CLP) with 10% booking amount and leading bank tie-ups (SBI, HDFC, ICICI).',
                    siteVisitInfo: 'Complimentary private site walkthrough available every Saturday & Sunday between 10:00 AM and 5:00 PM.',
                    currentOffers: 'Zero Registry Charges + Free Modular Kitchen for site visit bookings this month.',
                    unitTypes: [
                        { type: '2 BHK Luxury', sizeSqft: '1150 sq.ft.', priceFrom: '₹75 Lakhs' },
                        { type: '3 BHK Premium', sizeSqft: '1550 sq.ft.', priceFrom: '₹1.10 Cr' },
                        { type: '4 BHK Penthouse', sizeSqft: '2250 sq.ft.', priceFrom: '₹1.65 Cr' },
                    ],
                    amenities: ['Clubhouse', 'Swimming Pool', 'Gymnasium', '24/7 Security', 'Covered Car Parking', 'Power Backup', 'Landscaped Gardens', 'Kids Play Area'],
                    faqs: [
                        { question: 'What is the starting price?', answer: 'The pricing for Emerald Heights starts from ₹75 Lakhs for a 2 BHK and ₹1.10 Cr for a 3 BHK.', keywords: ['price', 'cost', 'rate', 'starting'] },
                        { question: 'Where is the project located?', answer: 'Emerald Heights is located at Sector 150, Noida Expressway with direct connectivity to the airport corridor and top international schools.', keywords: ['location', 'where', 'address'] },
                        { question: 'What amenities are available?', answer: 'The project features an infinity swimming pool, clubhouse, state-of-the-art gym, 24/7 gated multi-tier security, and 80% open green space.', keywords: ['amenities', 'facilities', 'gym', 'pool'] },
                    ],
                    isActive: true,
                });
                console.log(`[SaaS Onboarding] ✅ Auto-created Demo Project for Tenant ${tenant.name} (${tenant._id})`);
            }
        }
        catch (seedErr) {
            console.warn('[SaaS Onboarding] Warning seeding demo project:', seedErr);
        }
        // Generate JWT Auth Token
        const token = jsonwebtoken_1.default.sign({
            id: admin._id,
            userId: admin._id,
            tenantId: tenant._id,
            role: admin.role || "tenant_admin",
            email: admin.email,
        }, JWT_SECRET, { expiresIn: "24h" });
        // Generate Long-Lived Refresh Token
        const refreshToken = jsonwebtoken_1.default.sign({
            id: admin._id,
            userId: admin._id,
            tenantId: tenant._id,
            role: admin.role || "tenant_admin",
            email: admin.email,
            jti: `${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
        }, exports.JWT_REFRESH_SECRET, { expiresIn: "30d" });
        admin.refreshToken = refreshToken;
        await admin.save();
        // Send Welcome Email (Non-blocking)
        (async () => {
            try {
                const welcomeHtml = `
          <div style="font-family:'Segoe UI',Roboto,Helvetica,Arial,sans-serif;max-width:600px;margin:0 auto;border:1px solid #e2e8f0;border-radius:10px;overflow:hidden">
            <div style="background:linear-gradient(135deg, #1e3a8a, #2563eb);padding:28px;color:#ffffff;text-align:center">
              <h2 style="margin:0;font-size:22px">🎉 Welcome to Real Estate CRM SaaS!</h2>
              <p style="margin:8px 0 0;opacity:0.9">Your subscription is now active</p>
            </div>
            <div style="padding:24px;color:#334155;line-height:1.6">
              <p>Hi <strong>${admin.name}</strong>,</p>
              <p>Thank you for subscribing to the <strong>${tenant.subscription.planName}</strong> (${transaction.billingCycle}). Your account is fully configured and ready to capture leads.</p>
              <table style="width:100%;border-collapse:collapse;margin:16px 0;background:#f8fafc;border-radius:8px;padding:12px">
                <tr><td style="padding:8px 12px;font-weight:600">Company Name:</td><td style="padding:8px 12px">${tenant.name}</td></tr>
                <tr><td style="padding:8px 12px;font-weight:600">Mapped Phone:</td><td style="padding:8px 12px">${tenant.phone}</td></tr>
                <tr><td style="padding:8px 12px;font-weight:600">Subscription Validity:</td><td style="padding:8px 12px">${expiresAt.toLocaleDateString("en-IN")}</td></tr>
              </table>
              <p>You can now connect your Facebook Lead Forms and Google Calendar directly from your CRM settings.</p>
            </div>
          </div>
        `;
                await (0, emailService_1.sendEmail)(admin.email, "Welcome to Your Real Estate CRM Dashboard", welcomeHtml);
            }
            catch (mailErr) {
                console.warn("Could not send welcome email:", mailErr);
            }
        })();
        return res.status(200).json({
            success: true,
            message: "Payment verified successfully. Welcome aboard!",
            token,
            accessToken: token,
            refreshToken,
            user: {
                id: admin._id,
                name: admin.name,
                email: admin.email,
                phone: admin.phone,
                role: admin.role,
                companyName: admin.companyName,
                tenantId: tenant._id,
            },
            tenant: {
                id: tenant._id,
                name: tenant.name,
                status: tenant.status,
                subscription: tenant.subscription,
                notificationEmails: tenant.notificationEmails,
            },
        });
    }
    catch (err) {
        console.error("Error in saasVerifyPayment:", err);
        return res.status(500).json({
            success: false,
            error: err.message || "Failed to verify payment",
        });
    }
};
exports.saasVerifyPayment = saasVerifyPayment;
/**
 * 3. SaaS User Login.
 * Handles authentication for both Super Admin and Tenant Admins.
 * Issues JWT containing userId and tenantId for strict data scoping.
 */
const saasLogin = async (req, res) => {
    try {
        const { email, password } = req.body;
        if (!email || !password) {
            return res.status(400).json({
                success: false,
                error: "Email and password are required",
            });
        }
        const cleanEmail = String(email).toLowerCase().trim();
        const admin = await admin_model_1.default.findOne({ email: cleanEmail });
        if (!admin) {
            return res.status(400).json({
                success: false,
                error: "Invalid email address or password",
            });
        }
        const isMatch = await bcryptjs_1.default.compare(password, admin.password);
        if (!isMatch) {
            return res.status(400).json({
                success: false,
                error: "Invalid email address or password",
            });
        }
        // Check account status
        if (admin.status === "pending_payment") {
            return res.status(402).json({
                success: false,
                paymentPending: true,
                tenantId: admin.tenantId,
                error: "Payment is pending for your account. Please complete subscription to access dashboard.",
            });
        }
        if (admin.status === "suspended") {
            return res.status(403).json({
                success: false,
                isSuspended: true,
                error: "Your account has been suspended. Please contact administrator.",
            });
        }
        // Check Tenant Subscription Expiry if tenant account
        let tenant = null;
        if (admin.tenantId) {
            tenant = await tenant_model_1.default.findById(admin.tenantId);
            if (tenant && tenant.subscription) {
                if (new Date(tenant.subscription.expiresAt).getTime() < Date.now()) {
                    tenant.subscription.status = "expired";
                    await tenant.save();
                }
            }
        }
        // Issue JWT Access Token
        const token = jsonwebtoken_1.default.sign({
            id: admin._id,
            userId: admin._id,
            tenantId: admin.tenantId || null,
            role: admin.role || "tenant_admin",
            email: admin.email,
        }, JWT_SECRET, { expiresIn: "24h" });
        // Issue Long-Lived Refresh Token (30 Days)
        const refreshToken = jsonwebtoken_1.default.sign({
            id: admin._id,
            userId: admin._id,
            tenantId: admin.tenantId || null,
            role: admin.role || "tenant_admin",
            email: admin.email,
            jti: `${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
        }, exports.JWT_REFRESH_SECRET, { expiresIn: "30d" });
        admin.refreshToken = refreshToken;
        await admin.save();
        return res.status(200).json({
            success: true,
            message: "Login successful",
            token,
            accessToken: token,
            refreshToken,
            user: {
                id: admin._id,
                name: admin.name,
                email: admin.email,
                phone: admin.phone,
                role: admin.role || "tenant_admin",
                companyName: admin.companyName,
                tenantId: admin.tenantId,
            },
            tenant: tenant
                ? {
                    id: tenant._id,
                    name: tenant.name,
                    status: tenant.status,
                    subscription: tenant.subscription,
                    notificationEmails: tenant.notificationEmails,
                    isMaster: tenant.isMaster,
                }
                : null,
        });
    }
    catch (err) {
        console.error("Error in saasLogin:", err);
        return res.status(500).json({
            success: false,
            error: "Server error during login",
        });
    }
};
exports.saasLogin = saasLogin;
/**
 * 4. Get Current User & Tenant Session Info.
 */
const getMe = async (req, res) => {
    try {
        const admin = await admin_model_1.default.findById(req.adminId).select("-password").lean();
        if (!admin) {
            return res.status(404).json({ success: false, error: "User not found" });
        }
        let tenant = null;
        if (admin.tenantId) {
            tenant = await tenant_model_1.default.findById(admin.tenantId).lean();
        }
        return res.status(200).json({
            success: true,
            user: admin,
            tenant,
        });
    }
    catch (err) {
        console.error("Error in getMe:", err);
        return res.status(500).json({ success: false, error: "Failed to fetch user session" });
    }
};
exports.getMe = getMe;
/**
 * 5. Refresh Access Token.
 * Exchanges a valid, unrevoked Refresh Token for a fresh Access Token & rotated Refresh Token.
 */
const saasRefreshToken = async (req, res) => {
    try {
        const { refreshToken } = req.body;
        if (!refreshToken) {
            return res.status(400).json({
                success: false,
                error: "Refresh token is required",
            });
        }
        let decoded;
        try {
            decoded = jsonwebtoken_1.default.verify(refreshToken, exports.JWT_REFRESH_SECRET);
        }
        catch (err) {
            return res.status(401).json({
                success: false,
                error: "Invalid or expired refresh token",
            });
        }
        const admin = await admin_model_1.default.findById(decoded.id || decoded.userId);
        if (!admin) {
            return res.status(401).json({
                success: false,
                error: "User associated with refresh token not found",
            });
        }
        // Verify token matches current stored token (anti-replay / revocation check)
        if (admin.refreshToken !== refreshToken) {
            return res.status(401).json({
                success: false,
                error: "Refresh token has been revoked or replaced",
            });
        }
        if (admin.status === "suspended") {
            return res.status(403).json({
                success: false,
                error: "Account has been suspended",
            });
        }
        // Check Tenant Subscription if applicable
        if (admin.tenantId) {
            const tenant = await tenant_model_1.default.findById(admin.tenantId);
            if (tenant && tenant.subscription && new Date(tenant.subscription.expiresAt).getTime() < Date.now()) {
                tenant.subscription.status = "expired";
                await tenant.save();
                return res.status(402).json({
                    success: false,
                    error: "Tenant subscription has expired. Please renew your plan.",
                });
            }
        }
        // Generate fresh Access Token
        const newAccessToken = jsonwebtoken_1.default.sign({
            id: admin._id,
            userId: admin._id,
            tenantId: admin.tenantId || null,
            role: admin.role || "tenant_admin",
            email: admin.email,
        }, JWT_SECRET, { expiresIn: "24h" });
        // Rotate Refresh Token
        const newRefreshToken = jsonwebtoken_1.default.sign({
            id: admin._id,
            userId: admin._id,
            tenantId: admin.tenantId || null,
            role: admin.role || "tenant_admin",
            email: admin.email,
            jti: `${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
        }, exports.JWT_REFRESH_SECRET, { expiresIn: "30d" });
        admin.refreshToken = newRefreshToken;
        await admin.save();
        return res.status(200).json({
            success: true,
            message: "Token refreshed successfully",
            token: newAccessToken,
            accessToken: newAccessToken,
            refreshToken: newRefreshToken,
        });
    }
    catch (err) {
        console.error("Error in saasRefreshToken:", err);
        return res.status(500).json({
            success: false,
            error: "Server error during token refresh",
        });
    }
};
exports.saasRefreshToken = saasRefreshToken;
/**
 * 6. Logout & Revoke Refresh Token.
 */
const saasLogout = async (req, res) => {
    try {
        const adminId = req.adminId;
        if (adminId) {
            await admin_model_1.default.findByIdAndUpdate(adminId, { $set: { refreshToken: null } });
        }
        return res.status(200).json({
            success: true,
            message: "Logged out successfully. Refresh token revoked.",
        });
    }
    catch (err) {
        console.error("Error in saasLogout:", err);
        return res.status(500).json({
            success: false,
            error: "Server error during logout",
        });
    }
};
exports.saasLogout = saasLogout;
//# sourceMappingURL=saasAuth.controller.js.map