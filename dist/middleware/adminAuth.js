"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.adminAuth = void 0;
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const JWT_SECRET = process.env.JWT_SECRET || "supersecret";
const adminAuth = (req, res, next) => {
    const token = req.headers.authorization?.split(" ")[1];
    if (!token)
        return res.status(401).json({ success: false, error: "Unauthorized" });
    try {
        const decoded = jsonwebtoken_1.default.verify(token, JWT_SECRET);
        if (decoded.role !== "admin") {
            return res.status(403).json({ success: false, error: "Forbidden" });
        }
        req.adminId = decoded.id;
        next();
    }
    catch (err) {
        return res.status(401).json({ success: false, error: "Invalid token" });
    }
};
exports.adminAuth = adminAuth;
//# sourceMappingURL=adminAuth.js.map