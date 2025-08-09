
 import express, { NextFunction, Request, Response } from "express";

import fileUpload from "express-fileupload";


import { configEnv } from "./config";
import cors from "cors";
import cookieParser from "cookie-parser";

const app = express();
app.set("trust proxy", true);

// 1️⃣ CORS configuration
app.use(cors({
  origin: [
    "http://localhost:3000",
    "https://advertiser-frontend.vercel.app"
  ],   // e.g. "https://app.yoursite.com"
  methods: ["GET","POST","PUT","DELETE","OPTIONS"],
  allowedHeaders: ["Content-Type","Authorization","X-Requested-With"],
  credentials: true,                    // Allow cookies
  preflightContinue: false,
  optionsSuccessStatus: 204
}));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(cookieParser());



// app.use(express.static("public"));

app.use(
  fileUpload({
    limits: { fileSize: 9 * 1024 * 1024 },
  })
);


app.get("/", async (req: Request, res: Response) => {
  return res.status(200).json({ message: "App is working perfect" });
});

import path from "path"
import fs from "fs"


// //Global error handler
// app.use((err: HttpError, req: Request, res: Response, next: NextFunction) => {
//   const statusCode = err.statusCode || 500;

//   return res.status(statusCode).json({
//     status: false,
//     message: err.message,
//     errorStack: configEnv.NODE_ENV === "production" ? null : err.stack,
//   });
// });




export default app;