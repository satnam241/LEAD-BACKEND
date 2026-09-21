import { Schema, model, Document, Types } from 'mongoose';
import type { ConversationStepId } from '../config/conversationFlow';

export interface ConversationAnswer {
  step: string;
  optionId: string;
  optionTitle: string;
  answeredAt: Date;
}

export interface ConversationStateDoc extends Document {
  leadId: Types.ObjectId;
  phone: string;
  currentStep: string;
  answers: ConversationAnswer[];
  attemptCount: number;
  deliveryStatus?: 'sent' | 'delivered' | 'read' | 'replied';
  lastMessageFromUser?: string;
  lastMessageAt?: Date;
  startedAt: Date;
  completedAt?: Date;
  lastActiveAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

const answerSchema = new Schema<ConversationAnswer>(
  {
    step: { type: String, required: true },
    optionId: { type: String, required: true },
    optionTitle: { type: String, required: true },
    answeredAt: { type: Date, default: Date.now },
  },
  { _id: false }
);

const conversationStateSchema = new Schema<ConversationStateDoc>(
  {
    leadId: { type: Schema.Types.ObjectId, ref: 'Lead', required: true },
    phone: { type: String, required: true, index: true },
    currentStep: { type: String, required: true },
    answers: [answerSchema],
    attemptCount: { type: Number, default: 0 },
    deliveryStatus: {
      type: String,
      enum: ['sent', 'delivered', 'read', 'replied'],
      default: 'sent',
    },
    lastMessageFromUser: { type: String, default: null },
    lastMessageAt: { type: Date, default: null },
    startedAt: { type: Date, default: Date.now },
    completedAt: Date,
    lastActiveAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

export default model<ConversationStateDoc>('ConversationState', conversationStateSchema);