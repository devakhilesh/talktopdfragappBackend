import mongoose from "mongoose";

import { configEnv } from "./config";

const connectDB = async () => {
  try {

    mongoose.connection.on("connected", () => {
      console.log("MongoDB connected successfully");
    });

    mongoose.connection.on("error", (err) => {
      console.error("MongoDB connection error:", err);
    }); 


    await mongoose.connect(configEnv.MONGODB_URL_LOCAL as string, );
 

  } catch (error) {
    console.error("MongoDB connection failed:", error);
    process.exit(1);
  }
};

export default connectDB;