// models/followUpLog.model.ts

import mongoose, { Schema, Document } from "mongoose";

export interface IFollowUpLog extends Document {
  leadId: mongoose.Types.ObjectId;
  message: string;
  type: "email" | "whatsapp" | "both";
  status: "pending" | "sent" | "failed";
  scheduledAt?: Date;
  sentAt?: Date;
  error?: string;
}

const FollowUpLogSchema = new Schema<IFollowUpLog>(
  {
    leadId: { type: Schema.Types.ObjectId, ref: "Lead", required: true },

    message: { type: String, required: true },

    type: {
      type: String,
      enum: ["email", "whatsapp", "both"],
      required: true,
    },

    status: {
      type: String,
      enum: ["pending", "sent", "failed"],
      default: "pending",
    },

    scheduledAt: { type: Date },
    sentAt: { type: Date },

    error: { type: String },
  },
  { timestamps: true }
);

export default mongoose.model<IFollowUpLog>(
  "FollowUpLog",
  FollowUpLogSchema
);