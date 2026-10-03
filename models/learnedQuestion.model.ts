import mongoose, { Schema, Document, Types } from 'mongoose';

export interface ILearnedQuestion extends Document {
  projectId: Types.ObjectId;
  question: string;
  normalizedQuestion: string;
  occurrences: number;
  leadIds: Types.ObjectId[];
  exampleUserQueries: string[];
  suggestedAnswer?: string;
  status: 'pending' | 'approved' | 'rejected';
  approvedAnswer?: string;
  approvedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const LearnedQuestionSchema = new Schema<ILearnedQuestion>(
  {
    projectId: { type: Schema.Types.ObjectId, ref: 'Project', required: true, index: true },
    question: { type: String, required: true, trim: true },
    normalizedQuestion: { type: String, required: true, trim: true, index: true },
    occurrences: { type: Number, default: 1 },
    leadIds: [{ type: Schema.Types.ObjectId, ref: 'Lead' }],
    exampleUserQueries: [{ type: String, trim: true }],
    suggestedAnswer: { type: String, default: '', trim: true },
    status: {
      type: String,
      enum: ['pending', 'approved', 'rejected'],
      default: 'pending',
      index: true,
    },
    approvedAnswer: { type: String, default: '', trim: true },
    approvedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

LearnedQuestionSchema.index({ projectId: 1, normalizedQuestion: 1 });

export default mongoose.model<ILearnedQuestion>('LearnedQuestion', LearnedQuestionSchema);
