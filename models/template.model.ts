import { Schema, model, Document, Types } from 'mongoose';

export interface TemplateDoc extends Document {
  name: string;
  label: string;
  bodyText: string; // uses {{1}}, {{2}}... placeholders — filled in directly, no approval needed
  variables: string[]; // friendly names in placeholder order, e.g. ['name', 'property']
  header?: string;
  imageUrl?: string;
  footer?: string;
  type?: 'text' | 'advertise';
  options?: string[]; // interactive choices e.g. ['📅 Rent property', '🏡 Buy property', ...]
  createdBy?: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const templateSchema = new Schema<TemplateDoc>(
  {
    name: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      lowercase: true,
      match: /^[a-z0-9_]+$/,
    },
    label: { type: String, required: true, trim: true },
    bodyText: { type: String, required: true },
    variables: [String],
    header: { type: String, default: null, trim: true },
    imageUrl: { type: String, default: null, trim: true },
    footer: { type: String, default: null, trim: true },
    type: { type: String, enum: ['text', 'advertise'], default: 'text' },
    options: { type: [String], default: [] },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
);

export default model<TemplateDoc>('Template', templateSchema);