import { Request, Response } from "express";
import { oauth2Client } from "../config/google";
import Admin from "../models/admin.model";

// Connect Google
export const connectGoogle = async (req: Request, res: Response) => {
  try {
    const url = oauth2Client.generateAuthUrl({
  access_type: "offline",
  prompt: "consent",
  include_granted_scopes: true,
  scope: [
    "https://www.googleapis.com/auth/calendar.events",
    "https://www.googleapis.com/auth/gmail.send",
  ],
});

    return res.redirect(url);
  } catch (err) {
    console.log("CONNECT ERROR:", err);

    return res.status(500).send("Google auth failed");
  }
};

// Callback
export const googleCallback = async (req: Request, res: Response) => {
  try {
    const code = req.query.code as string;

    if (!code) {
      return res.status(400).send("Authorization code missing");
    }

    const { tokens } = await oauth2Client.getToken(code);

    console.log("TOKENS:", tokens);

    // admin
    const admin = await Admin.findOne();

    if (!admin) {
      return res.status(404).send("Admin not found");
    }

    // save
    admin.googleCalendar = {
      accessToken: tokens.access_token || admin.googleCalendar?.accessToken,

      refreshToken: tokens.refresh_token || admin.googleCalendar?.refreshToken,

      expiryDate: tokens.expiry_date || admin.googleCalendar?.expiryDate,
    };

    await admin.save();

    console.log("GOOGLE SAVED");

    return res.redirect(`${process.env.FRONTEND_URL1}`);
  } catch (err) {
    console.log("GOOGLE ERROR:", err);

    return res.status(500).send("Google connect failed");
  }
};
