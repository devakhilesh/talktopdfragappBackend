import "dotenv/config";

const _configEnv = {
  PORT: process.env.PORT || 3000,
  MONGODB_URL_LOCAL:
    process.env.MONGODB_URL_LOCAL || "mongodb://localhost:27017/advertiser",
  CLOUD_NAME: process.env.CLOUD_NAME || "your-cloud-name",
  API_KEY: process.env.API_KEY || "your-api-key",
  API_SECRET: process.env.API_SECRET || "your-api-secret",
  JWT_ADVERTISER_SECERET_KEY:
    process.env.JWT_ADVERTISER_SECERET_KEY || "your-advertiser-secret-key",
  JWT_ADMIN_SECERET_KEY:
    process.env.JWT_ADMIN_SECERET_KEY || "your-admin-secret-key",
  JWT_USER_SECERET_KEY:
    process.env.JWT_USER_SECERET_KEY || "your-user-secret-key",
  NODE_ENV: process.env.NODE_ENV || "development",
  OPENAI_API_KEY: process.env.OPENAIAPIKEY,
  QDRANT_DB:process.env.QDRANT_DB
}; 

export const configEnv = (_configEnv);
