import mongoose, { Schema, Document, Types } from 'mongoose';

export interface IConversationMessage extends Document {
  leadId: Types.ObjectId;
  phone: string;
  role: 'user' | 'assistant';
  content: string;
  createdAt: Date;
}

const ConversationMessageSchema = new Schema<IConversationMessage>(
  {
    leadId: { type: Schema.Types.ObjectId, ref: 'Lead', required: true, index: true },
    phone: { type: String, required: true, index: true },
    role: { type: String, enum: ['user', 'assistant'], required: true },
    content: { type: String, required: true, trim: true },
    createdAt: { type: Date, default: Date.now, index: true },
  },
  { timestamps: false }
);

ConversationMessageSchema.index({ leadId: 1, createdAt: 1 });
ConversationMessageSchema.index({ phone: 1, createdAt: 1 });

export default mongoose.model<IConversationMessage>('ConversationMessage', ConversationMessageSchema);
