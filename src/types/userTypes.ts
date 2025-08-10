import { Types ,Document } from "mongoose";


export interface UserAuth extends Document {
  _id:Types.ObjectId,
  name: string;
  email: string;
  password: string;
  role: string;
}
