import mongoose, { Schema, Document } from "mongoose";

export interface IActivity extends Document {
  userId: string;
  adminId?: string;
  text: string;
  createdAt: Date;
  updatedAt: Date;
}

const ActivitySchema = new Schema<IActivity>(
  {
    userId: { type: String, required: true },
    adminId: { type: String, default: "admin" },
    text: { type: String, required: true },
  },
  { timestamps: true }
);

export default mongoose.model<IActivity>("Activity", ActivitySchema);
