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
  OPENAI_API_KEY: process.env.OPENAI_API_KEY,
  QDRANT_DB: process.env.QDRANT_DB, // for local testing
  //for production ready QDRANT_DB
  QDRANT_URL: process.env.QDRANT_URL,
  API_KEY_QDRANT: process.env.API_KEY_QDRANT,
  REDIS_HOST: process.env.REDIS_HOST,
  REDIS_PORT: process.env.REDIS_PORT,
  REDIS_PASSWORD: process.env.REDIS_PASSWORD,
  REDIS_URL: process.env.REDIS_URL,
  WORKER_CONCURRENCY: process.env.WORKER_CONCURRENCY,
};

export const configEnv = _configEnv;
