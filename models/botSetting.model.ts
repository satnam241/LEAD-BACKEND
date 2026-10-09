import { Schema, model, Document } from 'mongoose';

export interface BotSettingDoc extends Document {
  key: string;
  value: string;
  description?: string;
  updatedAt: Date;
}

const botSettingSchema = new Schema<BotSettingDoc>(
  {
    key: { type: String, required: true, unique: true, trim: true },
    value: { type: String, default: '', trim: true },
    description: { type: String, default: '' },
  },
  { timestamps: true }
);

botSettingSchema.index({ key: 1 }, { unique: true });

export default model<BotSettingDoc>('BotSetting', botSettingSchema);
