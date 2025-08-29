// import express, { NextFunction, Request, Response } from "express";
// import { Queue } from "bullmq";
// import fileUpload from "express-fileupload";

// import { configEnv } from "./config";
// import cors from "cors";
// import cookieParser from "cookie-parser";
// import path from "path";
// import fs from "fs";

// import OpenAI from "openai";

// import {
//   userAuthentication,
//   UserAuthenticationRequest,
//   userAuthorization,
// } from "./middi/userAuth";

// import DocumentModel from "./model/userModel/documentModel";
// import { v4 as uuidv4 } from "uuid";
// import { sha256FromBuffer } from "./helper/hashingHex";

// // connection
// const queue: any = new Queue("file-upload-queue", {
//   connection: {
//     host: "localhost",
//     port: 6379,
//   },
// });

// const app = express();
// app.set("trust proxy", true);

// // 1️⃣ CORS configuration
// app.use(
//   cors({
//     origin: ["http://localhost:3000", "https://advertiser-frontend.vercel.app"], // e.g. "https://app.yoursite.com"
//     methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
//     allowedHeaders: ["Content-Type", "Authorization", "X-Requested-With"],
//     credentials: true, // Allow cookies
//     preflightContinue: false,
//     optionsSuccessStatus: 204,
//   })
// );

// app.use(express.json());
// app.use(express.urlencoded({ extended: true }));

// app.use(cookieParser());

// // app.use(express.static("public"));

// app.use(
//   fileUpload({
//     limits: { fileSize: 9 * 1024 * 1024 },
//   })
// );

// //===================================== pdf upload ===========================================================

// app.post(
//   "/upload/file",
//   userAuthentication,
//   userAuthorization,
//   async (req: UserAuthenticationRequest, res: Response) => {
//     try {
//       if (!req.files || !req.files.pdf) {
//         return res
//           .status(400)
//           .json({ status: false, message: "Please provide your PDF" });
//       }
//       const pdfFile = req.files.pdf as any;
//       const buffer: Buffer = pdfFile.data; // express-fileupload gives .data
//       const pdfHash = sha256FromBuffer(buffer);

//       // 1) duplicate check for this user
//       const existing = await DocumentModel.findOne({
//         userId: req.user!._id,
//         pdfHash,
//       }).lean();

//       if (existing) {
//         return res.status(200).json({
//           status: true,
//           message: "This PDF already uploaded & processed",
//           data: { pdfId: existing.pdfId, filename: existing.filename },
//         });
//       }

//       // 2) Save file to disk (optional) and create a db record
//       const pdfId = uuidv4();
//       const uploadDir = path.join(__dirname, "../uploads");
//       if (!fs.existsSync(uploadDir))
//         fs.mkdirSync(uploadDir, { recursive: true });
//       const filePath = path.join(uploadDir, `${pdfId}__${pdfFile.name}`);
//       await pdfFile.mv(filePath);
 
//       await DocumentModel.create({
//         userId: req.user!._id,
//         pdfId,
//         filename: pdfFile.name,
//         pdfHash,
//         size: pdfFile.size,
//       });

//       // 3) enqueue worker job with userId and pdfId
//       await queue.add("file-ready", {
//         filename: pdfFile.name,
//         mimetype: pdfFile.mimetype,
//         size: pdfFile.size,
//         path: filePath,
//         userId: req.user!._id.toString(),
//         pdfId,
//       });

//       return res
//         .status(200)
//         .json({
//           status: true,
//           message: "File uploaded and queued",
//           data: { pdfId },
//         });
//     } catch (err: any) {
//       return res.status(500).json({ status: false, message: err.message });
//     }
//   }
// );

// //======================================== get =================================================================

// import { OpenAIEmbeddings } from "@langchain/openai";

// import { QdrantVectorStore } from "@langchain/qdrant";
// import { QdrantClient } from "@qdrant/js-client-rest";

// const embeddings = new OpenAIEmbeddings({
//   apiKey: configEnv.OPENAI_API_KEY,
// });

// const openaiClient = new OpenAI({
//   apiKey: configEnv.OPENAI_API_KEY,
// });

// const client = new QdrantClient({ url: configEnv.QDRANT_DB });

// /* app.get(
//   "/chat",
//   userAuthentication,
//   userAuthorization,
//   async (req: UserAuthenticationRequest, res: Response) => {
//     try {
//       const pdfId = String(req.query.pdfId || "").trim();
//       const message = String(req.query.message || "").trim();

//       // Validate required parameters
//       if (!pdfId)
//         return res
//           .status(400)
//           .json({ status: false, message: "pdfId is required" });
//       if (!message)
//         return res
//           .status(400)
//           .json({ status: false, message: "message is required" });

//       // Check if document exists and is processed
//       const doc = await DocumentModel.findOne({
//         pdfId,
//         userId: req.user!._id,
//       });

//       if (!doc) {
//         return res
//           .status(404)
//           .json({ status: false, message: "PDF not found" });
//       }

//       // Initialize vector store with error handling
//       let vectorStore: QdrantVectorStore;
//       try {
//         vectorStore = await QdrantVectorStore.fromExistingCollection(
//           embeddings,
//           {
//             client,
//             collectionName: "pdf-docs",
//           }
//         );
//       } catch (err) {
//         console.error("Vector store initialization failed:", err);
//         return res.status(503).json({
//           status: false,
//           message: "Vector database not ready. Try again later.",
//         });
//       }
//       // Create retriever with metadata filtering
//       const filter = {
//         must: [
//           {
//             key: "metadata.userId",
//             match: { value: req.user!._id.toString() },
//           },
//           { key: "metadata.pdfId", match: { value: pdfId } },
//         ],
//       };

//       const retriever = vectorStore.asRetriever({
//         filter: filter,
//         k: 4, // Optimal for most use cases
//       });

//       const contextDocs = await retriever.invoke(message);

//       console.log(contextDocs);

//       // Prepare context for LLM
//       const contextText = contextDocs
//         .map((doc) => doc.pageContent)
//         .join("\n---\n");

//       const SYSTEM_PROMPT = `You are a helpful AI assistant that answers questions based on PDF documents.
// Use only the following context from the user's PDF file:
// ${contextText}

// If the context doesn't contain the answer, say "I couldn't find relevant information in your document."`;

//       // Generate response
//       const chatResult = await openaiClient.chat.completions.create({
//         model: "gpt-4-turbo",
//         messages: [
//           { role: "system", content: SYSTEM_PROMPT },
//           { role: "user", content: message },
//         ],
//         max_tokens: 1000,
//       });
//       return res.status(200).json({
//         status: true,
//         message: "Response generated",
//         data: chatResult.choices[0].message.content,
//         metaData:
//       });
//     } catch (err: any) {
//       console.error("Chat Error:", err);
//       return res.status(500).json({
//         status: false,
//         message: "Internal server error: " + err.message,
//       });
//     }
//   }
// );
//  */

// app.get(
//   "/chat",
//   userAuthentication,
//   userAuthorization,
//   async (req: UserAuthenticationRequest, res: Response) => {
//     try {
//       const pdfId = String(req.query.pdfId || "").trim();
//       const message = String(req.query.message || "").trim();

//       // Validate required parameters
//       if (!pdfId)
//         return res
//           .status(400)
//           .json({ status: false, message: "pdfId is required" });
//       if (!message)
//         return res
//           .status(400)
//           .json({ status: false, message: "message is required" });

//       // Check if document exists and is processed
//       const doc = await DocumentModel.findOne({
//         pdfId,
//         userId: req.user!._id,
//       });

//       if (!doc) {
//         return res
//           .status(404)
//           .json({ status: false, message: "PDF not found" });
//       }

//       // if (!doc.processed as any) {
//       //   return res.status(425).json({
//       //     status: false,
//       //     message: "PDF is still processing. Try again later.",
//       //   });
//       // }

//       // Initialize vector store
//       let vectorStore: QdrantVectorStore;
//       try {
//         vectorStore = await QdrantVectorStore.fromExistingCollection(
//           embeddings,
//           {
//             client,
//             collectionName: "pdf-docs",
//           }
//         );
//       } catch (err) {
//         console.error("Vector store initialization failed:", err);
//         return res.status(503).json({
//           status: false,
//           message: "Vector database not ready. Try again later.",
//         });
//       }

//       // Create retriever with metadata filtering
//       const filter = {
//         must: [
//           {
//             key: "metadata.userId",
//             match: { value: req.user!._id.toString() },
//           },
//           { key: "metadata.pdfId", match: { value: pdfId } },
//         ],
//       };

//       const retriever = vectorStore.asRetriever({
//         filter: filter,
//         k: 4,
//       });

//       const contextDocs = await retriever.invoke(message);

//       // Format metadata for response and LLM context
//       const formattedSources = contextDocs.map(doc => {
//         const metadata = doc.metadata;
//         return {
//           pageNumber: metadata.loc?.pageNumber || metadata.pageNumber || 1,
//           lineFrom: metadata.loc?.lines?.from || 1,
//           lineTo: metadata.loc?.lines?.to || 1,
//           pdfId: metadata.pdfId,
//           filename: metadata.filename,
//           contentSnippet: doc.pageContent.substring(0, 150) +
//                           (doc.pageContent.length > 150 ? "..." : "")
//         };
//       });

//       // Prepare context for LLM with citations
//       const contextWithCitations = contextDocs
//         .map((doc, index) => {
//           const metadata = doc.metadata;
//           const page = metadata.loc?.pageNumber || metadata.pageNumber || 1;
//           return `[Source ${index + 1}, Page ${page}]:\n${doc.pageContent}`;
//         })
//         .join("\n\n---\n\n");

//       const SYSTEM_PROMPT = `You are a helpful AI assistant that answers questions based on PDF documents.
// Use only the following context from the user's PDF file. Always cite your sources using the reference numbers in brackets:

// ${contextWithCitations}

// If the context doesn't contain the answer, say "I couldn't find relevant information in your document."`;

//       // Generate response
//       const chatResult = await openaiClient.chat.completions.create({
//         model: "gpt-4-turbo",
//         messages: [
//           { role: "system", content: SYSTEM_PROMPT },
//           { role: "user", content: message },
//         ],
//         max_tokens: 1000,
//       });

//       return res.status(200).json({
//         status: true,
//         message: "Response generated",
//         response: chatResult.choices[0].message.content,
//         sources: formattedSources
//       });
//     } catch (err: any) {
//       console.error("Chat Error:", err);
//       return res.status(500).json({
//         status: false,
//         message: "Internal server error: " + err.message,
//       });
//     }
//   }
// );

// app.get("/", async (req: Request, res: Response) => {
//   return res.status(200).json({ message: "App is working perfect" });
// });

// import user from "./route/userAuthRoute";

// app.use("/", user);

// export default app;

/////////======================================== new with modificztion ================================================================
// src/app.ts

import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import fileUpload from "express-fileupload";

const app = express();
app.set("trust proxy", true);

// CORS
app.use(
  cors({
    origin: ["http://localhost:3000", "https://advertiser-frontend.vercel.app"],
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "X-Requested-With"],
    credentials: true,
    preflightContinue: false,
    optionsSuccessStatus: 204,
  })
);

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

app.use(
  fileUpload({
    limits: { fileSize: 9 * 1024 * 1024 },
    useTempFiles: false,
  })
);


// routes 
import user from "./route/userAuthRoute";

app.use("/", user);

// health
app.get("/", (req, res) =>
  res.status(200).json({ message: "App is working perfect" })
);

export default app;
