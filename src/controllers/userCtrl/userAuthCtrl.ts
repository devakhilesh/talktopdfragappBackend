import { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";
import bcrypt from "bcrypt";
import userModel from "../../model/userModel/userAuthModel";
// import { makeCookieOptions } from "../../helper/cookies";
import { UserAuthenticationRequest } from "../../middi/userAuth";

import { UserAuth } from "../../types/userTypes";
import { configEnv } from "../../config";

// ===================== REGISTER =====================
export const userRegister = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = req.body as UserAuth;
    const { name, email, password } = data;

    const existingUser = await userModel.findOne({ email });
    if (existingUser) {
      return res.status(400).json({ status: false, message: "Email already in use" });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    await userModel.create({ name, email, password: hashedPassword });

    return res.status(201).json({
      status: true,
      message: "User registered successfully",
    });
  } catch (err: any) {
    return res.status(500).json({ status: false, message: err.message });
  }
};

// ===================== LOGIN =====================
export const userLogIn = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = req.body as UserAuth;
    const { email, password } = data;

    const user = await userModel.findOne({ email });
    if (!user) {
      return res.status(400).json({ status: false, message: "Invalid credentials" });
    }

    const passwordMatch = await bcrypt.compare(password, user.password);
    if (!passwordMatch) {
      return res.status(400).json({ status: false, message: "Invalid credentials" });
    }

    const token = jwt.sign({ _id: user._id, role: user.role }, configEnv.JWT_USER_SECERET_KEY as string);

    // res.cookie("x-user-token", token, makeCookieOptions(req));

    return res.status(200).json({
      status: true,
      message: "Logged in successfully",
      data: user,
      token: token,
    });
  } catch (err: any) {
    return res.status(500).json({ status: false, message: err.message });
  }
};

// ===================== LOGOUT =====================
export const userLogout = async (req: UserAuthenticationRequest, res: Response) => {
  try {
    // res.clearCookie("x-user-token", makeCookieOptions(req));

    return res.status(200).json({
      status: true,
      message: "Logged out successfully",
    });
  } catch (err: any) {
    return res.status(500).json({ status: false, message: err.message });
  }
};


// ===================== PROFILE =====================
export const userProfile = async (req: UserAuthenticationRequest, res: Response) => {
  try {
    if (!req.user || !req.user._id) {
      return res.status(401).json({ status: false, message: "Login Required" });
    }

    const user = await userModel.findById(req.user._id).select("-password");
    return res.status(200).json({ status: true, message: user });
  } catch (err: any) {
    return res.status(500).json({ status: false, message: err.message });
  }
};
