import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";

const JWT_SECRET = process.env.JWT_SECRET || "supersecret";

<<<<<<< HEAD
export const adminAuth = (req: Request, res: Response, next: NextFunction) => {
=======
export const authMiddleware = (req: Request, res: Response, next: NextFunction) => {
>>>>>>> 12ce192d2a5bd74df4854ba96063b1583eb3a95c
  const token = req.headers.authorization?.split(" ")[1];
  if (!token) return res.status(401).json({ success: false, error: "Unauthorized" });

  try {
<<<<<<< HEAD
    const decoded = jwt.verify(token, JWT_SECRET!) as any;
=======
    const decoded = jwt.verify(token, JWT_SECRET) as any;
>>>>>>> 12ce192d2a5bd74df4854ba96063b1583eb3a95c
    if (decoded.role !== "admin") {
      return res.status(403).json({ success: false, error: "Forbidden" });
    }
    (req as any).adminId = decoded.id;
    next();
  } catch (err) {
    return res.status(401).json({ success: false, error: "Invalid token" });
  }
};
