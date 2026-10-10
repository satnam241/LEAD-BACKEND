import { Schema, model, Document, Types } from 'mongoose';

export interface LLMTrainingLogDoc extends Document {
  leadId?: Types.ObjectId;
  phone?: string;
  language: 'english' | 'hindi' | 'hinglish';
  detectedIntent?: string;
  projectId?: Types.ObjectId;
  projectName?: string;
  userMessage: string;
  aiResponse: string;
  source: 'whatsapp' | 'manual_agent' | 'web';
  isReviewed: boolean;
  qualityScore?: number;
  isSyncedToSharesampatti: boolean;
  syncedAt?: Date;
  syncStatus?: 'pending' | 'synced' | 'failed';
  createdAt: Date;
  updatedAt: Date;
}

const llmTrainingLogSchema = new Schema<LLMTrainingLogDoc>(
  {
    leadId: { type: Schema.Types.ObjectId, ref: 'Lead' },
    phone: { type: String, trim: true },
    language: { type: String, enum: ['english', 'hindi', 'hinglish'], default: 'hinglish' },
    detectedIntent: { type: String, trim: true },
    projectId: { type: Schema.Types.ObjectId, ref: 'Project' },
    projectName: { type: String, trim: true },
    userMessage: { type: String, required: true, trim: true },
    aiResponse: { type: String, required: true, trim: true },
    source: { type: String, default: 'whatsapp' },
    isReviewed: { type: Boolean, default: false },
    qualityScore: { type: Number, default: 5 },
    isSyncedToSharesampatti: { type: Boolean, default: false },
    syncedAt: { type: Date },
    syncStatus: { type: String, enum: ['pending', 'synced', 'failed'], default: 'pending' },
  },
  { timestamps: true }
);

llmTrainingLogSchema.index({ createdAt: -1 });
llmTrainingLogSchema.index({ language: 1 });
llmTrainingLogSchema.index({ detectedIntent: 1 });
llmTrainingLogSchema.index({ isSyncedToSharesampatti: 1 });

export default model<LLMTrainingLogDoc>('LLMTrainingLog', llmTrainingLogSchema);
