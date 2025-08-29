/* import { Request } from "express";




export function isRequestSecure(req: Request): boolean {
  return req.secure || req.headers["x-forwarded-proto"] === "https";
}

export function makeCookieOptions(req: Request): object {
  const secure = isRequestSecure(req); 
  return {
    httpOnly: true, // JS can’t read it
    secure, // only send over HTTPS in prod
    sameSite: secure ? "none" : "lax", // none+lax for localhost
    // domain/path: usually omit on localhost
  };
} */