import mongoose, { Schema, Document } from "mongoose";

export interface IAdmin extends Document {
  name:string;
  email: string;
  password: string;
}

const AdminSchema: Schema = new Schema(
  {
    name:{type:String,required:true},
    email: { type: String, required: true, unique: false },
    password: { type: String, required: true },
  },
  { timestamps: true }
);

export default mongoose.model<IAdmin>("Admin", AdminSchema);
