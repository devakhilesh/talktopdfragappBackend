/* 
import express, { NextFunction, Request, Response } from "express";
import { Queue } from "bullmq";
import fileUpload from "express-fileupload";

import { configEnv } from "./config";
import cors from "cors";
import cookieParser from "cookie-parser";
import path from "path";
import fs from "fs";
import os from "os";
import OpenAI from "openai";

import {
  userAuthentication,
  UserAuthenticationRequest,
  userAuthorization,
} from "./middi/userAuth";

import DocumentModel from "./model/userModel/documentModel";
import { v4 as uuidv4 } from "uuid";
import { sha256FromBuffer } from "./helper/hashingHex";

// connection
const queue: any = new Queue("file-upload-queue", {
  connection: {
    host: "localhost",
    port: 6379,
  },
});

const app = express();
app.set("trust proxy", true);

// 1️⃣ CORS configuration
app.use(
  cors({
    origin: ["http://localhost:3000", "https://advertiser-frontend.vercel.app"], // e.g. "https://app.yoursite.com"
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "X-Requested-With"],
    credentials: true, // Allow cookies
    preflightContinue: false,
    optionsSuccessStatus: 204,
  })
);

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(cookieParser());

// app.use(express.static("public"));

app.use(
  fileUpload({
    limits: { fileSize: 9 * 1024 * 1024 },
  })
);

//===================================== pdf upload ===========================================================

app.post(
  "/upload/file",
  userAuthentication,
  userAuthorization,
  async (req: UserAuthenticationRequest, res) => {
    try {
      if (!req.files || !req.files.pdf) {
        return res
          .status(400)
          .json({ status: false, message: "Please provide your PDF" });
      }

      const pdfFile = req.files.pdf as any;
      const buffer: Buffer = pdfFile.data;
      const pdfHash = sha256FromBuffer(buffer);

      // duplicate check per user
      const existing = await DocumentModel.findOne({
        userId: req.user!._id,
        pdfHash,
      }).lean();
      if (existing) {
        return res.status(200).json({
          status: true,
          message: "This PDF already uploaded & processed",
          data: { pdfId: existing.pdfId, filename: existing.filename },
        });
      }

      // create pdfId and write to OS temp dir
      const pdfId = uuidv4();
      const tmpDir = path.join(os.tmpdir(), "rag-temp");
      if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });

      const tmpFilename = `${pdfId}__${Date.now()}__${pdfFile.name}`;
      const tmpPath = path.join(tmpDir, tmpFilename);

      await fs.promises.writeFile(tmpPath, buffer);

      // save document record with processed=false
      await DocumentModel.create({
        userId: req.user!._id,
        pdfId,
        filename: pdfFile.name,
        pdfHash,
        size: pdfFile.size,
      });

      // enqueue job with path (do not pass buffer)
      await queue.add("file-ready", {
        path: tmpPath,
        userId: req.user!._id.toString(),
        pdfId,
        filename: pdfFile.name,
      });

      return res.status(200).json({
        status: true,
        message: "File uploaded and queued (temp stored)",
        data: { pdfId },
      });
    } catch (err: any) {
      console.error("UPLOAD_ERR:", err);
      return res
        .status(500)
        .json({ status: false, message: err.message || "Upload failed" });
    }
  }
);

//======================================== get =================================================================

import { OpenAIEmbeddings } from "@langchain/openai";

import { QdrantVectorStore } from "@langchain/qdrant";
import { QdrantClient } from "@qdrant/js-client-rest";

const embeddings = new OpenAIEmbeddings({
  apiKey: configEnv.OPENAI_API_KEY,
});

const openaiClient = new OpenAI({
  apiKey: configEnv.OPENAI_API_KEY,
});

const client = new QdrantClient({
  url: configEnv.QDRANT_URL,
  apiKey: configEnv.API_KEY_QDRANT,
});

import ChatSessionModel from "./model/userModel/chatSession";
import { estimateTokens, truncateToTokenLimit } from "./utils/token";
import { summarizeTexts } from "./utils/summarize";

// constants
const MODEL_TOKEN_LIMIT = 32000; // model limit (approx)
const RESPONSE_TOKEN_RESERVE = 1000; // reserve for output
const MAX_CONTEXT_TOKENS = 8000; // for doc contexts
const MAX_HISTORY_TOKENS = 4000; // for chat history (recent)

app.post(
  "/chat",
  userAuthentication,
  userAuthorization,
  async (req: UserAuthenticationRequest, res) => {
    try {
      const {
        pdfId,
        sessionId: incomingSessionId,
        message,
      } = req.body as { pdfId: string; sessionId?: string; message: string };

      if (!pdfId || !message)
        return res
          .status(400)
          .json({ status: false, message: "pdfId and message required" });

      // 1) session create / load
      let sessionId = incomingSessionId;
      let session = null;
      if (!sessionId) {
        sessionId = uuidv4();
        session = await ChatSessionModel.create({
          sessionId,
          userId: req.user!._id,
          messages: [],
        });
      } else {
        session = await ChatSessionModel.findOne({
          sessionId,
          userId: req.user!._id,
        });
        if (!session) {
          session = await ChatSessionModel.create({
            sessionId,
            userId: req.user!._id,
            messages: [],
          });
        }
      }

      // 2) optimistically save user's message
      session.messages.push({
        role: "user",
        content: message,
        createdAt: new Date(),
      });
      session.lastActiveAt = new Date();
      await session.save();

      // 3) RAG retrieval using LangChain retriever (the method that previously worked)
      let contextDocs: any[] = [];
      try {
        const vectorStore = await QdrantVectorStore.fromExistingCollection(
          embeddings,
          {
            client,
            collectionName: "pdf-docs",
          }
        );

        // Use metadata.userId / metadata.pdfId keys (same as your working code)

        // const filter = {
        //   must: [
        //     {
        //       key: "metadata.userId",
        //       match: { value: req.user!._id.toString() },
        //     },
        //     { key: "metadata.pdfId", match: { value: pdfId } },
        //   ],
        // };

        const filter = {
          must: [
            {
              key: "metadata.userId",
              match: { value: req.user!._id.toString() },
            },
            {
              key: "metadata.pdfId",
              match: { value: pdfId },
            },
          ],
        };

        // const filter = {
        //   must: [
        //     { key: "userId", match: { value: req.user!._id.toString() } },
        //     { key: "pdfId", match: { value: pdfId } },
        //   ],
        // };

        const retriever = vectorStore.asRetriever({
          filter,
          k: 4,
        });

        // try LangChain retriever invoke / getRelevantDocuments / retrieve
        if (typeof (retriever as any).invoke === "function") {
          contextDocs = await (retriever as any).invoke(message);
        } else if (
          typeof (retriever as any).getRelevantDocuments === "function"
        ) {
          contextDocs = await (retriever as any).getRelevantDocuments(message);
        } else if (typeof (retriever as any).retrieve === "function") {
          contextDocs = await (retriever as any).retrieve(message);
        } else {
          contextDocs = [];
        }
      } catch (retrieverErr) {
        console.warn(
          "LangChain retriever failed or not available:",
          retrieverErr
        );
        contextDocs = [];
      }

      // 3b) Fallback: if retriever returned nothing, try direct Qdrant vector search (safe)
      if (
        !contextDocs ||
        (Array.isArray(contextDocs) && contextDocs.length === 0)
      ) {
        try {
          const embedAny: any =
            (await (embeddings as any).embedDocuments?.([message])) ??
            (await (embeddings as any).embedQuery?.(message));
          const queryVector = Array.isArray(embedAny) ? embedAny[0] : embedAny;

          const qdrantRes: any = await client.search("pdf-docs", {
            vector: queryVector,
            limit: 5,
            with_payload: true,
            filter: {
              must: [
                { key: "userId", match: { value: req.user!._id.toString() } }, // fallback to top-level keys
                { key: "pdfId", match: { value: pdfId } },
              ],
            },
          });

          const points = (qdrantRes.result ??
            (Array.isArray(qdrantRes) ? qdrantRes : [])) as any[];
          // Convert Qdrant payloads to a Document-like shape for later code compatibility
          contextDocs = points.map((p) => ({
            metadata: p.payload ?? p,
            pageContent: (
              p.payload?.text ??
              p.payload?.pageContent ??
              p.payload?.content ??
              ""
            ).toString(),
          }));
        } catch (qErr) {
          console.warn("Fallback Qdrant search failed:", qErr);
          contextDocs = [];
        }
      }

      // 4) Format retrieved docs (same as your old working GET handler)
      const formattedSources = (contextDocs || []).map((doc: any) => {
        const metadata = doc.metadata ?? {};
        return {
          pageNumber: metadata.loc?.pageNumber || metadata.pageNumber || 1,
          lineFrom: metadata.loc?.lines?.from || 1,
          lineTo: metadata.loc?.lines?.to || 1,
          pdfId: metadata.pdfId,
          filename: metadata.filename,
          contentSnippet:
            (doc.pageContent ?? "").substring(0, 150) +
            ((doc.pageContent ?? "").length > 150 ? "..." : ""),
        };
      });

      const contextWithCitations = (contextDocs || [])
        .map((doc: any, index: number) => {
          const metadata = doc.metadata ?? {};
          const page = metadata.loc?.pageNumber || metadata.pageNumber || 1;
          return `[Source ${index + 1}, Page ${page}]:\n${
            doc.pageContent ?? ""
          }`;
        })
        .join("\n\n---\n\n");

      // 5) Prepare messages for LLM: memory summary + recent history + contexts + user message
      const systemInstructions = {
        role: "system",
        content:
          "You are a helpful AI assistant that answers questions based on PDF documents. Use only the provided context from the user's PDF. Cite sources using the reference numbers.",
      };

      const systemMemoryMsg = session.memorySummary
        ? {
            role: "system",
            content: `Memory Summary: ${session.memorySummary}`,
          }
        : null;

      const allHistory = session.messages.map((m) => ({
        role: m.role,
        content: m.content,
      }));
      const recentHistory = truncateToTokenLimit(
        allHistory,
        MAX_HISTORY_TOKENS
      );

      // include contexts (trim if too large)
      let contextSystemMsg = {
        role: "system",
        content: `Document contexts (only use them as facts):\n${contextWithCitations}`,
      };
      const contextTokens = estimateTokens(contextWithCitations);
      if (contextTokens > MAX_CONTEXT_TOKENS) {
        const trimmed = (contextDocs || [])
          .slice(0, 3)
          .map((d: any, i: number) => {
            const md = d.metadata ?? {};
            const p = md.pageNumber ?? "?";
            return `[Source ${i + 1} | page:${p}]\n${String(
              d.pageContent ?? ""
            ).slice(0, 1000)}`;
          })
          .join("\n\n---\n\n");
        contextSystemMsg = {
          role: "system",
          content: `Document contexts (trimmed):\n${trimmed}`,
        };
      }

      const messagesForLLM: { role: string; content: string }[] = [
        systemInstructions,
        ...(systemMemoryMsg ? [systemMemoryMsg] : []),
        ...recentHistory,
        contextSystemMsg,
        { role: "user", content: message },
      ];

      // token safety (same logic you already used)
      const estimated = messagesForLLM.reduce(
        (s, m) => s + estimateTokens(m.content),
        0
      );
      const allowed = MODEL_TOKEN_LIMIT - RESPONSE_TOKEN_RESERVE;
      if (estimated > allowed) {
        const truncatedHistory = truncateToTokenLimit(
          allHistory,
          Math.max(1000, MAX_HISTORY_TOKENS / 2)
        );
        const rebuilt = [
          systemInstructions,
          ...(systemMemoryMsg ? [systemMemoryMsg] : []),
          ...truncatedHistory,
          contextSystemMsg,
          { role: "user", content: message },
        ];
        messagesForLLM.length = 0;
        messagesForLLM.push(...rebuilt);
      }

      // 6) Call OpenAI (map messages to SDK shape; cast to any for compatibility)
      const payloadMessages = messagesForLLM.map((m) => ({
        role: m.role as "system" | "user" | "assistant",
        content: m.content,
      }));
      const chatRes: any = await openaiClient.chat.completions.create({
        model: "gpt-4-turbo", // or whichever model you use
        messages: payloadMessages as any,
        max_tokens: RESPONSE_TOKEN_RESERVE,
      });

      const assistantReply =
        (chatRes as any)?.choices?.[0]?.message?.content ??
        "Sorry, couldn't generate a response.";

      // 7) Save assistant message with sources and update session
      const assistantSources = (contextDocs || []).map(
        (d: any, idx: number) => {
          const md = d.metadata ?? {};
          return {
            pdfId: md.pdfId ?? pdfId,
            pageNumber: md.pageNumber ?? null,
            snippet: String((d.pageContent ?? "").slice(0, 200)),
          };
        }
      );

      session.messages.push({
        role: "assistant",
        content: assistantReply,
        createdAt: new Date(),
        sources: assistantSources,
      });
      session.lastActiveAt = new Date();
      await session.save();

      // 8) summarization if session grows too big
      const MSG_COUNT_LIMIT = 60;
      if (session.messages.length > MSG_COUNT_LIMIT) {
        const older = session.messages
          .slice(0, Math.floor(session.messages.length / 2))
          .map((m) => `${m.role}: ${m.content}`);
        const summary = await summarizeTexts(
          `Session ${session.sessionId}`,
          older
        );
        const keep = session.messages.slice(
          Math.floor(session.messages.length / 2)
        );
        session.memorySummary =
          (session.memorySummary ? session.memorySummary + "\n\n" : "") +
          summary;
        session.messages = keep;
        await session.save();
      }

      // 9) return
      return res.status(200).json({
        status: true,
        sessionId: session.sessionId,
        response: assistantReply,
        sources: assistantSources,
        metadata: formattedSources,
      });
    } catch (err: any) {
      console.error("CHAT_ERROR", err);
      return res.status(500).json({ status: false, message: err.message });
    }
  }
);

app.get("/", async (req: Request, res: Response) => {
  return res.status(200).json({ message: "App is working perfect" });
});

import user from "./route/userAuthRoute";

app.use("/", user);

export default app;
 */