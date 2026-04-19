<<<<<<< HEAD
import mongoose, { Schema, Document, Query } from "mongoose";

export interface ILead extends Document {
  fullName?: string;
  email?: string | null;
  phone?: string | null;
  phoneVerified?: boolean;
  source?: string;
  formId?: string | null;

  whenAreYouPlanningToPurchase?: string | null;
  whatIsYourBudget?: string | null;
  message?: string;

  extraFields?: Record<string, any>;
  rawData?: any;

  receivedAt?: Date;
  createdAt?: Date;
  updatedAt?: Date;

  // reminder fields
  reminderCount?: number;
  lastReminderSent?: Date | null;
  status?: "new" | "contacted" | "closed";

  // 🆕 SOFT DELETE
  isDeleted?: boolean;
  deletedAt?: Date | null;

  // 🆕 follow-up
  followUp?: {
    date?: Date | null;
    recurrence?: "once" | "tomorrow" | "3days" | "weekly" | null;
    message?: string | null;
    whatsappOptIn?: boolean;
    active?: boolean;
  };
}

const LeadSchema = new Schema<ILead>(
  {
    fullName: { type: String, trim: true },

    email: {
      type: String,
      lowercase: true,
      trim: true,
      index: true,
    },

    phone: {
      type: String,
      trim: true,
      index: true,
    },

    phoneVerified: { type: Boolean, default: false },

    source: {
      type: String,
      default: "facebook",
      index: true,
    },

    formId: { type: String, default: null },

    whenAreYouPlanningToPurchase: { type: String, default: null },
    whatIsYourBudget: { type: String, default: null },

    // ✅ SAFE MESSAGE HANDLING
    message: {
      type: String,
      default: "No message provided",
      trim: true,
    },

    extraFields: {
      type: Schema.Types.Mixed,
      default: {},
    },

    rawData: {
      type: Schema.Types.Mixed,
      default: {},
    },

    receivedAt: {
      type: Date,
      default: Date.now,
    },

    // 📊 tracking
    reminderCount: { type: Number, default: 0 },
    lastReminderSent: { type: Date, default: null },

    status: {
      type: String,
      enum: ["new", "contacted", "closed"],
      default: "new",
      index: true,
    },

    // 🗑️ SOFT DELETE
    isDeleted: {
      type: Boolean,
      default: false,
      index: true,
    },

    deletedAt: {
      type: Date,
      default: null,
    },

    // 📅 FOLLOW-UP
    followUp: {
      date: { type: Date, default: null },
      recurrence: {
        type: String,
        enum: ["once", "tomorrow", "3days", "weekly", null],
        default: null,
      },
      message: { type: String, default: null },
      whatsappOptIn: { type: Boolean, default: false },
      active: { type: Boolean, default: false },
    },
  },
  {
    timestamps: true,
  }
);

LeadSchema.pre(/^find/, function (this: Query<any, ILead>, next) {
  this.where({
    $or: [
      { isDeleted: false },
      { isDeleted: { $exists: false } }
    ]
  });
  next();
});


(LeadSchema.query as any).withDeleted = function () {
  return this.where({});
};


LeadSchema.index({ createdAt: -1 });
LeadSchema.index({ phone: 1, email: 1 });

export default mongoose.model<ILead>("Lead", LeadSchema);
=======
import mongoose, { Schema, Document } from "mongoose";

export interface ILead extends Document {
  name: string;
  email: string;
  phone: string;
  message?: string;
  status: "new" | "contacted" | "purchased" | "not_purchased";
  createdAt: Date;
}

const LeadSchema: Schema = new Schema(
  {
    name: { type: String, required: true },
    email: { type: String, required: true },
    phone: { type: String, required: true },
    message: { type: String },
    status: {
      type: String,
      enum: ["new", "contacted", "purchased", "not_purchased"],
      default: "new",
    },
  },
  { timestamps: true }
);

export default mongoose.model<ILead>("Lead", LeadSchema);
>>>>>>> 12ce192d2a5bd74df4854ba96063b1583eb3a95c
