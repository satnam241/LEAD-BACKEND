import mongoose, { Schema, Document, Types } from 'mongoose';

export interface IFbForm extends Document {
  formId: string;
  name: string;
  locale: string;
  status: string;
  tenantId?: Types.ObjectId | null;
  projectId: Types.ObjectId | null;
  suggestedProject: string | null;
  lastSyncedAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

const FbFormSchema = new Schema<IFbForm>(
  {
    tenantId: { type: Schema.Types.ObjectId, ref: "Tenant", default: null, index: true },
    formId: { type: String, required: true, trim: true, index: true },
    name: { type: String, required: true, trim: true },
    locale: { type: String, default: 'en_US', trim: true },
    status: { type: String, default: 'ACTIVE', trim: true },
    projectId: { type: Schema.Types.ObjectId, ref: 'Project', default: null, index: true },
    suggestedProject: { type: String, default: null, trim: true },
    lastSyncedAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

export default mongoose.model<IFbForm>('FbForm', FbFormSchema);
