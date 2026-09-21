import { Schema, model, Document } from 'mongoose';

export interface FlowOption {
  id: string;
  title: string;
  detailText?: string;
}

export interface BotFlowDoc extends Document {
  stepOrder: number;
  stepKey: string;
  question: string;
  options: FlowOption[];
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const flowOptionSchema = new Schema<FlowOption>(
  {
    id: { type: String, required: true },
    title: { type: String, required: true, trim: true },
    detailText: { type: String, default: '' },
  },
  { _id: false }
);

const botFlowSchema = new Schema<BotFlowDoc>(
  {
    stepOrder: { type: Number, required: true, default: 1 },
    stepKey: { type: String, required: true, trim: true },
    question: { type: String, required: true, trim: true },
    options: {
      type: [flowOptionSchema],
      validate: [
        (val: FlowOption[]) => val.length >= 1,
        'At least one option is required',
      ],
    },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

botFlowSchema.index({ stepOrder: 1 });
botFlowSchema.index({ stepKey: 1 }, { unique: true });

export default model<BotFlowDoc>('BotFlow', botFlowSchema);
