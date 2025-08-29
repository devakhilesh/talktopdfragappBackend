
/* 
import { Worker, WorkerOptions, Job } from "bullmq";

import { OpenAIEmbeddings } from "@langchain/openai";

import { QdrantVectorStore } from "@langchain/qdrant";

import { Document } from "@langchain/core/documents";
import fs from "fs";
import type { AttributeInfo } from "langchain/chains/query_constructor";

import { PDFLoader } from "@langchain/community/document_loaders/fs/pdf";

import { CharacterTextSplitter } from "@langchain/textsplitters";

import { QdrantClient } from "@qdrant/js-client-rest";
import { configEnv } from "../config";
import DocumentModel from "../model/userModel/documentModel";

import { v4 as uuidv4 } from "uuid";

const workerOptions: WorkerOptions = {
  connection: {
    host: configEnv.REDIS_HOST || "localhost",
    port: Number(configEnv.REDIS_PORT || 6379),
  },
  concurrency: 100,
};

const worker = new Worker(
  "file-upload-queue",
  async (job: Job) => {
    const data = job.data as {
      path: string;
      userId: string;
      pdfId: string;
      filename?: string;
    };
    const filePath = data.path;
    const userId = String(data.userId);
    const pdfId = String(data.pdfId);
    const filename = data.filename;

    if (!filePath) {
      console.error("Worker job missing file path", job.id);
      return;
    }

    try {
      console.log("Worker started job:", job.id, "file:", filePath);

      // 1) load pdf
      const loader = new PDFLoader(filePath);
      const docs = await loader.load();
      console.log("Loaded docs/pages:", docs.length);

      // 2) chunk
      const splitter = new CharacterTextSplitter({
        chunkSize: 500,
        chunkOverlap: 50,
      });
      const splitDocs = await splitter.splitDocuments(docs);
      console.log("Chunks ready:", splitDocs.length);

      // 3) ensure metadata and map to LangChain Document objects
      const docsWithMeta = splitDocs.map((d: any) => ({
        pageContent: d.pageContent,
        metadata: {
          ...(d.metadata || {}),
          userId: String(userId),
          pdfId: String(pdfId),
          filename: filename || d.metadata?.filename,
          text: d.pageContent,
          pageNumber: d.metadata?.pageNumber ?? null,
        },
      }));

      // 4) embed + push to Qdrant
      const client = new QdrantClient({
        url: configEnv.QDRANT_URL,
        apiKey: configEnv.API_KEY_QDRANT,
      });
      const embeddings = new OpenAIEmbeddings({
        apiKey: configEnv.OPENAI_API_KEY,
      });

      // After adding documents to Qdrant
      await client.createPayloadIndex("pdf-docs", {
        field_name: "metadata.userId", // Index the userId field
        field_schema: "keyword", // Use keyword type for exact matches
      });

      await client.createPayloadIndex("pdf-docs", {
        field_name: "metadata.pdfId", // Also index pdfId
        field_schema: "keyword",
      });

      await QdrantVectorStore.fromDocuments(
        docsWithMeta as any,
        embeddings as any,
        {
          client,
          collectionName: "pdf-docs",
        }
      );

      try {
        await client.createPayloadIndex("pdf-docs", {
          field_name: "metadata.userId",
          field_schema: "keyword",
        });
        console.log("Created index for metadata.userId");
      } catch (e: any) {
        if (
          e.status === 400 &&
          e.data?.status?.error?.includes("already exists")
        ) {
          console.log("Index for metadata.userId already exists, skipping");
        } else {
          throw e;
        }
      }

      try {
        await client.createPayloadIndex("pdf-docs", {
          field_name: "metadata.pdfId",
          field_schema: "keyword",
        });
        console.log("Created index for metadata.pdfId");
      } catch (e: any) {
        if (
          e.status === 400 &&
          e.data?.status?.error?.includes("already exists")
        ) {
          console.log("Index for metadata.pdfId already exists, skipping");
        } else {
          throw e;
        }
      }

      const result = await client.getCollections();
      console.log("List of collections:", result.collections);

      // 5) mark processed true
      await DocumentModel.updateOne(
        { pdfId },
        { $set: { processed: true, processedAt: new Date(), lastError: null } }
      );

      console.log("Indexing done for pdfId:", pdfId);
    } catch (err: any) {
      console.error("Worker job failed:", job.id, err);
      // update document with error
      try {
        await DocumentModel.updateOne(
          { pdfId },
          { $set: { processed: false, lastError: String(err?.message || err) } }
        );
      } catch (e) {
        console.error("Failed to update DocumentModel on error:", e);
      }
      // rethrow if you want BullMQ retries: throw err;
    } finally {
      // always cleanup temp file
      try {
        if (filePath && fs.existsSync(filePath)) {
          await fs.promises.unlink(filePath);
          console.log("Temp file removed:", filePath);
        }
      } catch (unlinkErr) {
        console.error("Failed to remove temp file:", filePath, unlinkErr);
      }
    }
  },
  {
    connection: {
      host: configEnv.REDIS_HOST || "valkey",
      port: Number(configEnv.REDIS_PORT || 6379),
    },
    concurrency: 5,
  }
);

worker.on("failed", (job: any, err: any) => {
  console.error(`Job ${job.id} failed:`, err.message);
});
 */

// worker.ts
import Redis from "ioredis";
import { Worker, Job } from "bullmq";

import { OpenAIEmbeddings } from "@langchain/openai";
import { QdrantVectorStore } from "@langchain/qdrant";
import { QdrantClient } from "@qdrant/js-client-rest";

import { PDFLoader } from "@langchain/community/document_loaders/fs/pdf";
import { CharacterTextSplitter } from "@langchain/textsplitters";

import fs from "fs";
import { configEnv } from "../config";
import DocumentModel from "../model/userModel/documentModel";

// ---------- Redis connection ----------
const redisUrl = process.env.REDIS_URL || configEnv.REDIS_URL || null;

export const redisConnection = redisUrl
  ? new Redis(redisUrl, {
      maxRetriesPerRequest: 5,
      connectTimeout: 10000,
    })
  : new Redis({
      host: configEnv.REDIS_HOST || process.env.REDIS_HOST || "localhost",
      port: Number(configEnv.REDIS_PORT || process.env.REDIS_PORT || 6379),
      password: configEnv.REDIS_PASSWORD || process.env.REDIS_PASSWORD || undefined,
    });

// Optional quick connectivity test (non-blocking)
(async () => {
  try {
    await (redisConnection as Redis).set("__conn_test__", "1");
    const v = await (redisConnection as Redis).get("__conn_test__");
    console.log("Redis test OK:", v);
  } catch (e) {
    console.error("Redis test failed:", e);
  }
})();

(redisConnection as Redis).on("connect", () => console.log("Connected to Redis"));
(redisConnection as Redis).on("error", (err) => console.error("Redis error:", err));

// ---------- Worker options ----------
const concurrencyFromEnv = Number(process.env.WORKER_CONCURRENCY || configEnv.WORKER_CONCURRENCY || 100);

export const workerOptions = {
  connection: redisConnection,
  concurrency: concurrencyFromEnv,
};

// ---------- Worker ----------
const worker = new Worker(
  "file-upload-queue",
  async (job: Job) => {
    const data = job.data as {
      path: string;
      userId: string;
      pdfId: string;
      filename?: string;
    };
    const filePath = data.path;
    const userId = String(data.userId);
    const pdfId = String(data.pdfId);
    const filename = data.filename;

    if (!filePath) {
      console.error("Worker job missing file path", job.id);
      return;
    }

    try {
      console.log("Worker started job:", job.id, "file:", filePath);

      // 1) load pdf
      const loader = new PDFLoader(filePath);
      const docs = await loader.load();
      console.log("Loaded docs/pages:", docs.length);

      // 2) chunk
      const splitter = new CharacterTextSplitter({
        chunkSize: 500,
        chunkOverlap: 50,
      });
      const splitDocs = await splitter.splitDocuments(docs);
      console.log("Chunks ready:", splitDocs.length);

      // 3) prepare docs with metadata
      const docsWithMeta = splitDocs.map((d: any) => ({
        pageContent: d.pageContent,
        metadata: {
          ...(d.metadata || {}),
          userId,
          pdfId,
          filename: filename || d.metadata?.filename,
          text: d.pageContent,
          pageNumber: d.metadata?.pageNumber ?? null,
        },
      }));

      // 4) Qdrant client
      const qdrantClient = new QdrantClient({
        url: configEnv.QDRANT_URL,
        apiKey: configEnv.API_KEY_QDRANT,
      });

      // 5) Embeddings (lazy init at runtime)
      const openAiKey = process.env.OPENAI_API_KEY || configEnv.OPENAI_API_KEY;
      if (!openAiKey) {
        throw new Error("OPENAI_API_KEY missing in environment; cannot create embeddings");
      }
      const embeddings = new OpenAIEmbeddings({ apiKey: openAiKey });

      // 6) Ensure payload indexes (create once, ignore 'already exists' errors)
      const ensureIndex = async (field_name: string) => {
        try {
          await qdrantClient.createPayloadIndex("pdf-docs", {
            field_name,
            field_schema: "keyword",
          });
          console.log("Created payload index:", field_name);
        } catch (e: any) {
          // swallow 'already exists' style errors (Qdrant returns 400)
          const message = String(e?.data?.status?.error || e?.message || e);
          if (message.toLowerCase().includes("already exists") || (e?.status === 400 && message)) {
            console.log(`Index ${field_name} already exists, skipping`);
          } else {
            console.warn("Failed creating index, rethrowing:", e);
            throw e;
          }
        }
      };

      await ensureIndex("metadata.userId");
      await ensureIndex("metadata.pdfId");

      // 7) Push to Qdrant
      await QdrantVectorStore.fromDocuments(docsWithMeta as any, embeddings as any, {
        client: qdrantClient,
        collectionName: "pdf-docs",
      });

      const collections = await qdrantClient.getCollections();
      console.log("List of collections:", collections?.collections || []);

      // 8) mark processed true
      await DocumentModel.updateOne(
        { pdfId },
        { $set: { processed: true, processedAt: new Date(), lastError: null } }
      );

      console.log("Indexing done for pdfId:", pdfId);
    } catch (err: any) {
      console.error("Worker job failed:", job.id, err?.message || err);
      try {
        await DocumentModel.updateOne(
          { pdfId },
          { $set: { processed: false, lastError: String(err?.message || err) } }
        );
      } catch (e) {
        console.error("Failed to update DocumentModel on error:", e);
      }
      // optionally rethrow to let BullMQ handle retries: throw err;
    } finally {
      // always cleanup temp file
      try {
        if (filePath && fs.existsSync(filePath)) {
          await fs.promises.unlink(filePath);
          console.log("Temp file removed:", filePath);
        }
      } catch (unlinkErr) {
        console.error("Failed to remove temp file:", filePath, unlinkErr);
      }
    }
  },
  workerOptions // <<< use the workerOptions object we built above
);

worker.on("failed", (job: any, err: any) => {
  console.error(`Job ${job.id} failed:`, err?.message || err);
});

export default worker;
