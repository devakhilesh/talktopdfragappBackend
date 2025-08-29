// import { Worker, WorkerOptions, Job } from "bullmq";

// import { OpenAIEmbeddings } from "@langchain/openai";

// import { QdrantVectorStore } from "@langchain/qdrant";

// import { Document } from "@langchain/core/documents";

// import type { AttributeInfo } from "langchain/chains/query_constructor";

// import { PDFLoader } from "@langchain/community/document_loaders/fs/pdf";

// import { CharacterTextSplitter } from "@langchain/textsplitters";

// import { QdrantClient } from "@qdrant/js-client-rest";
// import { configEnv } from "./config";
// import DocumentModel from "./model/userModel/documentModel";
// import { v4 as uuidv4 } from "uuid";

// const workerOptions: WorkerOptions = {
//   connection: {
//     host: "localhost",
//     port: 6379,
//   },
//   concurrency: 100,
// };

// const worker = new Worker(
//   "file-upload-queue",
//   async (job: Job) => {
//     console.log(`Job:`, job.data);

//     const { path, userId, pdfId, filename } = job.data;

//     /*
// path:data.path
// read the pdf from path,
// chunk the pdf,
// call the openai  embdding model for every chunk,
// store the chunk in the qdrant db

// */

//     // 1) load pdf and create docs
//     const loader = new PDFLoader(path);
//     const docs = await loader.load();

//     // 2) chunk
//     const splitter = new CharacterTextSplitter({
//       chunkSize: 300,
//       chunkOverlap: 50,
//     });
//     const splitDocs = await splitter.splitDocuments(docs);

//     // console.log(`splitDocs=============\n\n`, splitDocs)

//     console.log(`Chunks ready: ${splitDocs.length}`);

//     const docsWithMeta = splitDocs.map((d) => {
//       return new Document({
//         pageContent: d.pageContent,
//         metadata: {
//           ...(d.metadata || {}),
//           userId,
//           pdfId,
//           filename,
//         },
//       });
//     });

//     // 3) embed + push to Qdrant

//     const client = new QdrantClient({ url: configEnv.QDRANT_DB });

//     const embeddings = new OpenAIEmbeddings({
//       apiKey: configEnv.OPENAI_API_KEY,
//     });

//     const vectorStore = await QdrantVectorStore.fromDocuments(
//       docsWithMeta,
//       embeddings,
//       {
//         client,
//         collectionName: "pdf-docs",
//         // optional: specify distance, onProgress callback, etc.
//       }
//     );

//    // 4) optionally update DocumentModel status processed=true
//     await DocumentModel.updateOne({ pdfId }, { $set: { processed: true } });

//   },
//   workerOptions
// );

//================================== new modified ====================================
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
import { configEnv } from "./config";
import DocumentModel from "./model/userModel/documentModel";
import { v4 as uuidv4 } from "uuid";

const workerOptions: WorkerOptions = {
  connection: {
    host: "localhost",
    port: 6379,
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

      await QdrantVectorStore.fromDocuments(
        docsWithMeta as any,
        embeddings as any,
        {
          client,
          collectionName: "pdf-docs",
        }
      );

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
      host: process.env.REDIS_HOST || "localhost",
      port: Number(process.env.REDIS_PORT || 6379),
    },
    concurrency: 5, // recommended starting value
  }
);

worker.on("failed", (job: any, err: any) => {
  console.error(`Job ${job.id} failed:`, err.message);
});
 */

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
      host: process.env.REDIS_HOST || "localhost",
      port: Number(process.env.REDIS_PORT || 6379),
    },
    concurrency: 5,
  }
);

worker.on("failed", (job: any, err: any) => {
  console.error(`Job ${job.id} failed:`, err.message);
});
