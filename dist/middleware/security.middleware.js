"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.auditSecurityConfig = exports.getCorsOriginDelegate = exports.noSqlSanitizer = exports.baileysLimiter = exports.publicApiLimiter = exports.authLimiter = void 0;
const express_rate_limit_1 = __importDefault(require("express-rate-limit"));
// ── 1. RATE LIMITERS ──────────────────────────────────────────────────────────
/**
 * Strict limiter for sensitive authentication & onboarding routes.
 * Blocks brute-force password guessing & automated fake account spam.
 */
exports.authLimiter = (0, express_rate_limit_1.default)({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 30, // Max 30 attempts per IP per window
    standardHeaders: true,
    legacyHeaders: false,
    message: {
        success: false,
        error: "Too many authentication attempts from this IP address. Please try again in 15 minutes.",
    },
});
/**
 * General public API rate limiter to protect server from DoS / crawling.
 */
exports.publicApiLimiter = (0, express_rate_limit_1.default)({
    windowMs: 1 * 60 * 1000, // 1 minute
    max: 120, // 120 requests per minute
    standardHeaders: true,
    legacyHeaders: false,
    message: {
        success: false,
        error: "Rate limit exceeded. Please slow down your requests.",
    },
});
/**
 * WhatsApp QR Polling Limiter.
 * Frontend polls QR status every 3s (~20-30 req/min). Max 90 req/min allows headroom.
 */
exports.baileysLimiter = (0, express_rate_limit_1.default)({
    windowMs: 1 * 60 * 1000, // 1 minute
    max: 90,
    standardHeaders: true,
    legacyHeaders: false,
    message: {
        success: false,
        error: "Too many status checks. Please wait a moment.",
    },
});
// ── 2. NoSQL INJECTION SANITIZER ─────────────────────────────────────────────
/**
 * Recursively deletes MongoDB query operators ($gt, $ne, $where, etc.)
 * in-place from req.body, req.query, and req.params (compatible with Express 5 getters).
 */
function cleanInPlace(obj) {
    if (!obj || typeof obj !== "object")
        return;
    if (Array.isArray(obj)) {
        for (const item of obj) {
            cleanInPlace(item);
        }
        return;
    }
    for (const key of Object.keys(obj)) {
        if (key.startsWith("$") || key.includes(".")) {
            console.warn(`[Security Alert] Stripped potential NoSQL injection key: "${key}"`);
            delete obj[key];
        }
        else if (typeof obj[key] === "object" && obj[key] !== null) {
            cleanInPlace(obj[key]);
        }
    }
}
const noSqlSanitizer = (req, _res, next) => {
    if (req.body && typeof req.body === "object") {
        cleanInPlace(req.body);
    }
    if (req.query && typeof req.query === "object") {
        cleanInPlace(req.query);
    }
    if (req.params && typeof req.params === "object") {
        cleanInPlace(req.params);
    }
    next();
};
exports.noSqlSanitizer = noSqlSanitizer;
// ── 3. STRICT CORS CONFIGURATION ─────────────────────────────────────────────
const DEFAULT_DEV_ORIGINS = [
    "http://localhost:5173",
    "http://localhost:5174",
    "http://localhost:3000",
    "http://127.0.0.1:5173",
    "http://127.0.0.1:5174",
    "http://127.0.0.1:3000",
    "https://leads.sharesampatti.com",
    "https://api.sharesampatti.com",
    "https://sharesampatti.com",
    "https://www.sharesampatti.com",
];
const getCorsOriginDelegate = () => {
    const envOrigins = process.env.ALLOWED_ORIGINS
        ? process.env.ALLOWED_ORIGINS.split(",").map((o) => o.trim())
        : [];
    const frontendUrl = process.env.FRONTEND_URL ? [process.env.FRONTEND_URL.trim()] : [];
    const allowedList = new Set([...DEFAULT_DEV_ORIGINS, ...envOrigins, ...frontendUrl]);
    return (origin, callback) => {
        // Allow non-browser requests (e.g. mobile apps, curl, server-to-server webhooks)
        if (!origin) {
            return callback(null, true);
        }
        if (allowedList.has(origin)) {
            return callback(null, true);
        }
        // Automatically allow all sharesampatti.com domains & subdomains (e.g. leads.sharesampatti.com)
        try {
            const parsed = new URL(origin);
            if (parsed.hostname === "sharesampatti.com" ||
                parsed.hostname.endsWith(".sharesampatti.com") ||
                parsed.hostname === "localhost" ||
                parsed.hostname === "127.0.0.1") {
                return callback(null, true);
            }
        }
        catch { }
        // In development mode, allow all origins with warning
        if (process.env.NODE_ENV !== "production") {
            return callback(null, true);
        }
        console.warn(`[Security] Blocked unauthorized CORS origin: ${origin}`);
        callback(new Error(`CORS Error: Origin ${origin} is not allowed`));
    };
};
exports.getCorsOriginDelegate = getCorsOriginDelegate;
// ── 4. JWT & SECRETS STARTUP AUDIT ───────────────────────────────────────────
const auditSecurityConfig = () => {
    const secret = process.env.JWT_SECRET;
    if (!secret || secret === "supersecret" || secret.length < 16) {
        if (process.env.NODE_ENV === "production") {
            console.error("❌ [CRITICAL SECURITY ERROR] Insecure JWT_SECRET detected in production! Please set a strong 32+ character JWT_SECRET in your .env file.");
            process.exit(1);
        }
        else {
            console.warn("⚠️ [Security Notice] Using default/weak JWT_SECRET in development. Ensure a strong random secret is set before deploying to production.");
        }
    }
};
exports.auditSecurityConfig = auditSecurityConfig;
//# sourceMappingURL=security.middleware.js.map