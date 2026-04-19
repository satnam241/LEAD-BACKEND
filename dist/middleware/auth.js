"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.authenticateJWT = void 0;
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const JWT_SECRET = process.env.JWT_SECRET || "your_secret_key";
const authenticateJWT = (req, res, next) => {
    const authHeader = req.headers.authorization;
    if (!authHeader)
        return res.status(401).json({ message: "No token provided" });
    const token = authHeader.split(" ")[1];
    jsonwebtoken_1.default.verify(token, JWT_SECRET || "", (err, user) => {
        if (!token)
            return res.status(401).json({ message: "Token missing" });
        req.user = user;
        next();
    });
};
exports.authenticateJWT = authenticateJWT;
//# sourceMappingURL=auth.js.map