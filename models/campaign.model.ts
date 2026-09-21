import { Schema, model, Document, Types } from 'mongoose';

export type CampaignStatus = 'Draft' | 'Running' | 'Completed' | 'Failed';
export type RecipientMessageStatus = 'queued' | 'sent' | 'delivered' | 'read' | 'failed';

export interface RecipientStatusDoc {
  leadId?: Types.ObjectId;
  name: string;
  phone: string;
  status: RecipientMessageStatus;
  waMessageId?: string;
  error?: string;
}

export interface CampaignDoc extends Document {
  name: string;
  audience: string;
  template: string;
  recipients: number;
  sent: number;
  failed: number;
  status: CampaignStatus;
  recipientStatuses: RecipientStatusDoc[];
  createdAt: Date;
  updatedAt: Date;
}

const recipientStatusSchema = new Schema<RecipientStatusDoc>(
  {
    leadId: { type: Schema.Types.ObjectId, ref: 'Lead' },
    name: String,
    phone: String,
    status: {
      type: String,
      enum: ['queued', 'sent', 'delivered', 'read', 'failed'],
      default: 'queued',
    },
    waMessageId: String,
    error: String,
  },
  { _id: false }
);

const campaignSchema = new Schema<CampaignDoc>(
  {
    name: { type: String, required: true, trim: true },
    audience: { type: String, required: true },
    template: { type: String, required: true },
    recipients: { type: Number, default: 0 },
    sent: { type: Number, default: 0 },
    failed: { type: Number, default: 0 },
    status: { type: String, enum: ['Draft', 'Running', 'Completed', 'Failed'], default: 'Draft' },
    recipientStatuses: [recipientStatusSchema],
  },
  { timestamps: true }
);

export default model<CampaignDoc>('Campaign', campaignSchema);