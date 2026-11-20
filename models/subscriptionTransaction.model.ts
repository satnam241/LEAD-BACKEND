import mongoose, { Schema, Document, Types } from "mongoose";

export interface ISubscriptionTransaction extends Document {
  tenantId: Types.ObjectId;
  userId: Types.ObjectId;
  planId: Types.ObjectId;
  planName: string;
  gateway: "razorpay" | "stripe" | "manual_admin" | "sandbox";
  gatewayOrderId?: string | null;
  gatewayPaymentId?: string | null;
  amount: number;
  currency: string;
  billingCycle: "monthly" | "yearly";
  status: "pending" | "success" | "paid" | "failed" | "refunded";
  invoiceNumber: string;
  paidAt?: Date | null;
  notes?: string | null;
  createdAt: Date;
  updatedAt: Date;
}

const SubscriptionTransactionSchema = new Schema<ISubscriptionTransaction>(
  {
    tenantId: {
      type: Schema.Types.ObjectId,
      ref: "Tenant",
      required: true,
      index: true,
    },
    userId: {
      type: Schema.Types.ObjectId,
      ref: "Admin",
      required: true,
      index: true,
    },
    planId: {
      type: Schema.Types.ObjectId,
      ref: "Plan",
      required: true,
    },
    planName: {
      type: String,
      required: true,
    },
    gateway: {
      type: String,
      enum: ["razorpay", "stripe", "manual_admin", "sandbox"],
      default: "razorpay",
    },
    gatewayOrderId: {
      type: String,
      default: null,
      index: true,
    },
    gatewayPaymentId: {
      type: String,
      default: null,
      index: true,
    },
    amount: {
      type: Number,
      required: true,
      min: 0,
    },
    currency: {
      type: String,
      default: "INR",
    },
    billingCycle: {
      type: String,
      enum: ["monthly", "yearly"],
      default: "monthly",
    },
    status: {
      type: String,
      enum: ["pending", "success", "paid", "failed", "refunded"],
      default: "pending",
      index: true,
    },
    invoiceNumber: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    paidAt: {
      type: Date,
      default: null,
    },
    notes: {
      type: String,
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

export default mongoose.model<ISubscriptionTransaction>(
  "SubscriptionTransaction",
  SubscriptionTransactionSchema
);
