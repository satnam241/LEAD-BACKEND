"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.connectDB = void 0;
const mongoose_1 = __importDefault(require("mongoose"));
const connectDB = async () => {
    try {
        const mongoURI = process.env.MONGO_URI1; //||"mongodb+srv://sharesampatti_db_user:gisT4ZAeM4SJ0IDs@cluster1.fexcuo8.mongodb.net/?appName=Cluster1"
        if (!mongoURI)
            throw new Error("Missing MONGO_URI in env");
        await mongoose_1.default.connect(mongoURI);
        console.log("✅ MongoDB connected successfully");
    }
    catch (error) {
        console.error("❌ MongoDB connection error:", error);
        process.exit(1);
    }
};
exports.connectDB = connectDB;
//# sourceMappingURL=DB.js.map