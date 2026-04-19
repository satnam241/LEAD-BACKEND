import mongoose from "mongoose";

export const connectDB = async (): Promise<void> => {
  try {
    const mongoURI = process.env.MONGO_URI1 //||"mongodb+srv://sharesampatti_db_user:gisT4ZAeM4SJ0IDs@cluster1.fexcuo8.mongodb.net/?appName=Cluster1"
    if (!mongoURI) throw new Error("Missing MONGO_URI in env");
await mongoose.connect(mongoURI as string);

    console.log("✅ MongoDB connected successfully");
  } catch (error) {
    console.error("❌ MongoDB connection error:", error);
    process.exit(1);
  }
};
