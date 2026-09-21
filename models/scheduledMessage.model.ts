import mongoose, { Schema, Document } from "mongoose";

export interface IScheduledMessage extends Document {
  leadId: mongoose.Types.ObjectId;
  messageType: "email" | "whatsapp" | "both";
  message?: string;
  adminEmail?: string;
  sendAt: Date;
  status: "pending" | "sent" | "failed";
  error?: string;
  createdAt: Date;
}

const schema = new Schema<IScheduledMessage>(
  {
    leadId: { type: Schema.Types.ObjectId, ref: "Lead", required: true },
    messageType: { type: String, enum: ["email", "whatsapp", "both"], default: "whatsapp" },
    message: { type: String, default: null },
    adminEmail: { type: String, default: null },
    sendAt: { type: Date, required: true, index: true },
    status: { type: String, enum: ["pending", "sent", "failed"], default: "pending", index: true },
    error: { type: String, default: null },
  },
  { timestamps: true }
);

export default mongoose.model<IScheduledMessage>("ScheduledMessage", schema);