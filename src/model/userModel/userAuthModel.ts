import mongoose from "mongoose";
import { UserAuth } from "../../types/userTypes";

const userAuthSchema = new mongoose.Schema<UserAuth>(
  {
    name: {
      type: String,
      required: true,
    },
    email: {
      type: String,
      required: true,
      unique: true,
    },
    password: {
      type: String,
      required: true,
    },
    role: {
      type: String,
      default: "user",
    },
  },
  { timestamps: true }
);

const userModel = mongoose.model<UserAuth>("user", userAuthSchema);

export default userModel;
