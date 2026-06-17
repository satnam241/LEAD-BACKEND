import mongoose, { Schema, Document } from "mongoose";

export interface IAdmin extends Document {
  name: string;
  email: string;
  password: string;

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
    },

    email: {
      type: String,
      required: true,
      unique: false,
    },

    password: {
      type: String,
      required: true,
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

export default mongoose.model<IAdmin>("Admin", AdminSchema);