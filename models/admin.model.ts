import mongoose, { Schema, Document } from "mongoose";

export interface IAdmin extends Document {
  name: string;
  email: string;
  password: string;
  phone?: string | null;
  role?: "super_admin" | "tenant_admin" | "team_member";
  tenantId?: mongoose.Types.ObjectId | null;
  companyName?: string | null;
  status?: "active" | "pending_payment" | "suspended";
  refreshToken?: string | null;

  // ✅ Google Calendar
  googleCalendar?: {
    accessToken?:    string | null;
    refreshToken?:   string | null;
    expiryDate?:     number | null;
    isConnected?:    boolean;
    lastSyncAt?:     Date | null;
    connectedEmail?: string | null;
  };
}

const AdminSchema = new Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },

    email: {
      type: String,
      required: true,
      lowercase: true,
      trim: true,
      index: true,
    },

    password: {
      type: String,
      required: true,
    },

    phone: {
      type: String,
      trim: true,
      default: null,
      index: true,
    },

    role: {
      type: String,
      enum: ["super_admin", "tenant_admin", "team_member"],
      default: "tenant_admin",
      index: true,
    },

    tenantId: {
      type: Schema.Types.ObjectId,
      ref: "Tenant",
      default: null,
      index: true,
    },

    companyName: {
      type: String,
      trim: true,
      default: null,
    },

    status: {
      type: String,
      enum: ["active", "pending_payment", "suspended"],
      default: "active",
      index: true,
    },

    refreshToken: {
      type: String,
      default: null,
    },

    // ✅ Google Calendar
    googleCalendar: {
      accessToken: {
        type: String,
        default: null,
      },

      refreshToken: {
        type: String,
        default: null,
      },

      expiryDate: {
        type: Number,
        default: null,
      },

      isConnected: {
        type: Boolean,
        default: false,
      },

      lastSyncAt: {
        type: Date,
        default: null,
      },

      connectedEmail: {
        type: String,
        default: null,
      },
    },
  },
  {
    timestamps: true,
  }
);

AdminSchema.index({ tenantId: 1, role: 1 });

export default mongoose.model<IAdmin>("Admin", AdminSchema);
