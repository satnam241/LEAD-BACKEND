import mongoose from "mongoose";
import { initMasterTenantAndPlans } from "./seedMasterTenant";

export const connectDB = async (): Promise<void> => {
  try {
    const mongoURI = process.env.MONGO_URI1;

    console.log("Mongo URI Exists:", !!mongoURI);

    if (!mongoURI) {
      throw new Error("Missing MONGO_URI1 in env");
    }

    await mongoose.connect(mongoURI);

    console.log(" MongoDB connected successfully");

    // Initialize Master Tenant, Plans, and backfill existing data
    await initMasterTenantAndPlans();
  } catch (error) {
    console.error("MongoDB connection error:", error);
    process.exit(1);
  }
};
