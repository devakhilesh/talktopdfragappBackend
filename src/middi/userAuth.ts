

// src/middi/userAuth.ts
import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { configEnv } from "../config";
import userModel from "../model/userModel/userAuthModel";

import { UserAuth } from "../types/userTypes";

export interface UserAuthenticationRequest extends Request {
  user?: UserAuth;
}

export const userAuthentication = async (
  req: UserAuthenticationRequest,
  res: Response,
  next: NextFunction
) => {
  
const token = req.headers["x-user-token"];
  if (!token  || typeof token !== "string") {
    return res.status(401).json({ status: false, message: "Login required" });
  }


  jwt.verify(
    token,
    configEnv.JWT_USER_SECERET_KEY,
    async (err: jwt.VerifyErrors | null, decoded: any) => {
      // 1) JWT verification error
      if (err) {
        return res.status(401).json({ status: false, message: err.message });
      }

      // 2) Missing or malformed payload
      if (!decoded || !decoded._id) {
        return res
          .status(401)
          .json({ status: false, message: "Invalid token payload" });
      }

      // 3) Load user from DB
      const userDoc = await userModel.findById(decoded._id).lean();
      if (!userDoc) {
        return res
          .status(404)
          .json({ status: false, message: "user not found" });
      }

      // 4) Attach minimal user info to req.user
      req.user = {
        _id: userDoc._id,
        name:userDoc.name,
        role: userDoc.role,
        email: userDoc.email!,
      } as UserAuth

      next();
    }
  );
};

// Authorization middleware
export const userAuthorization = async (
  req: UserAuthenticationRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    if (!req.user) {
      return res.status(401).json({status:false ,message:"Login required"});
    }

    const userDoc = await userModel.findById(req.user._id).lean();
    if (!userDoc) {
       return res.status(404).json({status:false ,message: "User not found"});
    }
    if (userDoc.role !== req.user.role) {
     return res.status(403).json({status:false ,message: "Unauthorized access"});
    }

    next();
  } catch (err: any) {
    // If it's an HttpError, it has status & message
    const status = err.status || 500;
    const message = err.message || "Internal Server Error";
  return  res.status(status).json({ status: false, message });
  }
};
