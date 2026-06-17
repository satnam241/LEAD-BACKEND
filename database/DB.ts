// import mongoose from "mongoose";

// export const connectDB = async (): Promise<void> => {
//   try {
//     const mongoURI = process.env.MONGO_URI1 
//     if (!mongoURI) throw new Error("Missing MONGO_URI in env");
// await mongoose.connect(mongoURI as string);

//     console.log("✅ MongoDB connected successfully");
//   } catch (error) {
//     console.error("❌ MongoDB connection error:", error);
//     process.exit(1);
//   }
// };
import mongoose from "mongoose";

export const connectDB = async (): Promise<void> => {
  try {
    const mongoURI = process.env.MONGO_URI1;

    console.log("Mongo URI Exists:", !!mongoURI);

    if (!mongoURI) {
      throw new Error("Missing MONGO_URI1 in env");
    }

    await mongoose.connect(mongoURI);

    console.log(" MongoDB connected successfully");
  } catch (error) {
    console.error("MongoDB connection error:", error);
    process.exit(1);
  }
};