import mongoose, { Schema, Document } from "mongoose";

export interface IAdmin extends Document {
<<<<<<< HEAD
  name:string;
=======
>>>>>>> 12ce192d2a5bd74df4854ba96063b1583eb3a95c
  email: string;
  password: string;
}

const AdminSchema: Schema = new Schema(
  {
<<<<<<< HEAD
    name:{type:String,required:true},
    email: { type: String, required: true, unique: false },
=======
    email: { type: String, required: true, unique: true },
>>>>>>> 12ce192d2a5bd74df4854ba96063b1583eb3a95c
    password: { type: String, required: true },
  },
  { timestamps: true }
);

export default mongoose.model<IAdmin>("Admin", AdminSchema);
