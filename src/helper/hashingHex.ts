// utils/hash.ts
import crypto from "crypto";

export function sha256FromBuffer(buf: Buffer) {
  return crypto.createHash("sha256").update(buf).digest("hex");
}
