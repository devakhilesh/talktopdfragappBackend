import express, { NextFunction, Request, Response } from "express";
import { Queue } from "bullmq";
import { OpenAIEmbeddings } from "@langchain/openai";
import Redis from "ioredis";
import { QdrantVectorStore } from "@langchain/qdrant";
import { QdrantClient } from "@qdrant/js-client-rest";
import ChatSessionModel from "../../model/userModel/chatSession";
import { estimateTokens, truncateToTokenLimit } from "../../utils/token";

import { summarizeTexts } from "../../utils/summarize";
import { configEnv } from "../../config";
import path from "path";
import fs from "fs";
import os from "os";
import OpenAI from "openai";

import {
  userAuthentication,
  UserAuthenticationRequest,
  userAuthorization,
} from "../../middi/userAuth";

import DocumentModel from "../../model/userModel/documentModel";
import { v4 as uuidv4 } from "uuid";
import { sha256FromBuffer } from "../../helper/hashingHex";

// ---------- Redis connection (single source) ----------
const redisUrl = process.env.REDIS_URL || configEnv.REDIS_URL || null;

export const redisConnection = redisUrl
  ? new Redis(redisUrl, {
      maxRetriesPerRequest: 5,
      connectTimeout: 10000,
    })
  : {
      host: configEnv.REDIS_HOST || process.env.REDIS_HOST || "valkey", // keep valkey only as local compose fallback
      port: Number(configEnv.REDIS_PORT || process.env.REDIS_PORT || 6379),
      password: configEnv.REDIS_PASSWORD || process.env.REDIS_PASSWORD || undefined,
    };

// Optional: quick non-blocking connectivity test (logs)
if ("on" in redisConnection) {
  (async () => {
    try {
      await (redisConnection as Redis).set("__conn_test__", "1");
      const v = await (redisConnection as Redis).get("__conn_test__");
      console.log("Redis test OK:", v);
    } catch (e) {
      console.error("Redis test failed:", e);
    }
  })();
}

// ---------- Queue (reuses same connection) ----------
export const queue = new Queue("file-upload-queue", {
  connection: redisConnection,
});


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

// constants
const MODEL_TOKEN_LIMIT = 32000; // model limit (approx)
const RESPONSE_TOKEN_RESERVE = 1000; // reserve for output
const MAX_CONTEXT_TOKENS = 8000; // for doc contexts
const MAX_HISTORY_TOKENS = 4000; // for chat history (recent)
//---------------------------------------------------------------------------------------------
//======================== pdf upload ==============================
//---------------------------------------------------------------------------------------------
export const uploadPdf = async (
  req: UserAuthenticationRequest,
  res: Response
) => {
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
};
//---------------------------------------------------------------------------------------------
//=============================== chat with pdf ===================
//---------------------------------------------------------------------------------------------

//========================================SYSTEM PROMPT ===========================

const systemInstructions = {
  role: "system",
  content: `You are an assistant that answers like a knowledgeable, practical friend. Follow these rules.

1) Use the document contexts when they are available.
   - Treat the contexts as facts. Use only the provided contexts to support factual claims about the document.
   - Cite passages inline using this format: [Source 2, Page 5]. If you use multiple passages, include each citation.
   - Start with a one or two sentence summary, then give the full answer.

2) If the provided contexts do not contain relevant information:
   - Say, "I do not see relevant document context; answering from general knowledge."
   - Then answer clearly and directly from general knowledge.
   - If your general-knowledge answer could be time sensitive, mention that you are answering from your general knowledge and, when appropriate, suggest checking current sources.

3) If the documents do not provide enough information to answer confidently:
   - Say you do not have enough information, do not invent facts, and ask one short, focused clarifying question.

4) If you make a best-effort guess, label it as a guess. Example: "Guess: ..."

5) Format and tone:
   - Keep the tone professional, conversational, and direct, as if explaining to a smart friend.
   - Begin with a short summary (one or two sentences).
   - If giving steps, number them.
   - If recommending actions, be specific and practical.
   - Avoid marketing language, long formal statements, and filler. Be concise and helpful.

6) Output rules:
   - Always include inline citations when using document text.
   - If you cannot answer from the documents and answer from general knowledge, make that clear at the start of your reply.

Be concise, useful, and human.`,
};

//===============================================================================================================================

export const chat = async (req: UserAuthenticationRequest, res: Response) => {
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
        return `[Source ${index + 1}, Page ${page}]:\n${doc.pageContent ?? ""}`;
      })
      .join("\n\n---\n\n");

    // 5) Prepare messages for LLM: memory summary + recent history + contexts + user message

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
    const recentHistory = truncateToTokenLimit(allHistory, MAX_HISTORY_TOKENS);

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
    const assistantSources = (contextDocs || []).map((d: any, idx: number) => {
      const md = d.metadata ?? {};
      return {
        pdfId: md.pdfId ?? pdfId,
        pageNumber: md.pageNumber ?? null,
        snippet: String((d.pageContent ?? "").slice(0, 200)),
      };
    });

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
        (session.memorySummary ? session.memorySummary + "\n\n" : "") + summary;
      session.messages = keep;
      await session.save();
    }

    // 9) return
    return res.status(200).json({
      status: true,
      sessionId: session.sessionId,
      response: assistantReply,
      //   sources: assistantSources,
      metadata: formattedSources,
    });
  } catch (err: any) {
    console.error("CHAT_ERROR", err);
    return res.status(500).json({ status: false, message: err.message });
  }
};

//================GET ALL UPLOADED FILES LIST =========================

export const getUserDocuments = async (
  req: UserAuthenticationRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    const userId = req.user!._id;
    const page = Math.max(1, parseInt((req.query.page as string) || "1", 10));
    const limit = Math.max(
      1,
      parseInt((req.query.limit as string) || "10", 10)
    );
    const q = (req.query.q as string) || "";

    const skip = (page - 1) * limit;

    const filter: any = { userId };
    if (q && q.trim().length > 0) {
      // simple filename search (case-insensitive)
      filter.filename = { $regex: q.trim(), $options: "i" };
    }

    const total = await DocumentModel.countDocuments(filter);

    const docs = await DocumentModel.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean();

    const data = docs.map((d: any) => ({
      _id: d._id,
      pdfId: d.pdfId,
      filename: d.filename,
      size: d.size ?? null,
      qdrantCollection: d.qdrantCollection ?? null,
      createdAt: d.createdAt,
      pdfHash: d.pdfHash,
    }));

    const totalPages = Math.ceil(total / limit);

    return res.status(200).json({
      status: true,
      data,
      meta: { page, limit, total, totalPages },
    });
  } catch (err: any) {
    console.error("GET_USER_DOCUMENTS_ERR", err);
    return res
      .status(500)
      .json({ status: false, message: err.message || "Server error" });
  }
};

//================GET ALL UPLOADED sINGLE FILE DATA =========================

export const getDocumentById = async (
  req: UserAuthenticationRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    const userId = req.user!._id;

    const docId = req.params.docId;
    if (!docId) {
      return res
        .status(400)
        .json({ status: false, message: "Please Provide DocId" });
    }

    const doc = await DocumentModel.findOne({
      _id: docId,
      userId: userId,
    }).lean();

    if (!doc)
      return res
        .status(404)
        .json({ status: false, message: "Document not found" });

    return res.status(200).json({
      status: true,
      data: {
        pdfId: doc.pdfId,
        filename: doc.filename,
        size: doc.size ?? null,
        qdrantCollection: doc.qdrantCollection ?? null,
        createdAt: doc.createdAt,
        pdfHash: doc.pdfHash,
      },
    });
  } catch (err: any) {
    console.error("GET_DOCUMENT_ERR", err);
    return res
      .status(500)
      .json({ status: false, message: err.message || "Server error" });
  }
};

//---------------------------------------------------------------------------------------------
//=============================== All Conversation History ===================
//---------------------------------------------------------------------------------------------

export const getAllHistory = async (
  req: UserAuthenticationRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    const userId = req.user!._id;

    const page = Math.max(1, parseInt((req.query.page as string) || "1", 10));
    const limit = Math.max(
      1,
      parseInt((req.query.limit as string) || "10", 10)
    );
    const sortBy = (req.query.sortBy as string) || "lastActiveAt";
    const sortOrder =
      ((req.query.sortOrder as string) || "desc").toLowerCase() === "asc"
        ? 1
        : -1;

    const skip = (page - 1) * limit;

    // total count for pagination meta
    const total = await ChatSessionModel.countDocuments({ userId });

    // get sessions (lightweight projection)
    const sessions = await ChatSessionModel.find({ userId })
      .sort({ [sortBy]: sortOrder })
      .skip(skip)
      .limit(limit)
      .lean();

    // map for lightweight preview data
    const data = sessions.map((s: any) => {
      const msgCount = Array.isArray(s.messages) ? s.messages.length : 0;
      const lastMsg =
        msgCount > 0
          ? s.messages[msgCount - 1] ?? s.messages[msgCount - 1 - 0] // guard
          : null;
      return {
        _id: s._id,
        sessionId: s.sessionId,
        createdAt: s.createdAt,
        lastActiveAt: s.lastActiveAt,
        memorySummary: s.memorySummary ?? null,
        messageCount: msgCount,
        lastMessagePreview: lastMsg
          ? {
              role: lastMsg.role,
              content:
                typeof lastMsg.content === "string"
                  ? lastMsg.content.slice(0, 200)
                  : lastMsg.content,
              createdAt: lastMsg.createdAt,
            }
          : null,
      };
    });

    const totalPages = Math.ceil(total / limit);

    return res.status(200).json({
      status: true,
      data,
      meta: {
        page,
        limit,
        total,
        totalPages,
      },
    });
  } catch (err: any) {
    console.error("GET_HISTORY_ERR", err);
    return res
      .status(500)
      .json({ status: false, message: err.message || "Server error" });
  }
};

// ===========================  get session messages =======================

export const getSessionMessages = async (
  req: UserAuthenticationRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    const userId = req.user!._id;
    const { chatId } = req.params; // _id
    if (!chatId)
      return res
        .status(400)
        .json({ status: false, message: "chatId required" });

    const page = Math.max(1, parseInt((req.query.page as string) || "1", 10));
    const limit = Math.max(
      1,
      parseInt((req.query.limit as string) || "20", 10)
    );
    const direction = (
      (req.query.direction as string) || "newest"
    ).toLowerCase();

    const session = await ChatSessionModel.findOne({
      _id: chatId,
      userId: userId,
    }).lean();

    if (!session) {
      return res
        .status(404)
        .json({ status: false, message: "Session not found" });
    }

    const messages = Array.isArray(session.messages) ? session.messages : [];

    // normalize createdAt to Date for sorting safety
    const normalized = messages.map((m: any) => ({
      ...m,
      createdAt: m.createdAt ? new Date(m.createdAt) : new Date(0),
    }));

    // sort messages by createdAt (oldest first)
    normalized.sort(
      (a: any, b: any) => a.createdAt.getTime() - b.createdAt.getTime()
    );

    // If user wants newest-first pages, reverse for paging convenience
    let ordered =
      direction === "oldest" ? normalized : normalized.slice().reverse();

    const total = ordered.length;
    const totalPages = Math.ceil(total / limit);
    const start = (page - 1) * limit;
    const paged = ordered.slice(start, start + limit);

    // return messages with createdAt as ISO string
    const items = paged.map((m: any) => ({
      role: m.role,
      content: m.content,
      createdAt:
        m.createdAt instanceof Date ? m.createdAt.toISOString() : m.createdAt,
      sources: m.sources ?? null,
      // include any other fields you store on messages
    }));

    return res.status(200).json({
      status: true,
      data: {
        sessionId: session.sessionId,
        memorySummary: session.memorySummary ?? null,
        messages: items,
      },
      meta: {
        page,
        limit,
        total,
        totalPages,
        direction,
      },
    });
  } catch (err: any) {
    console.error("GET_SESSION_MESSAGES_ERR", err);
    return res
      .status(500)
      .json({ status: false, message: err.message || "Server error" });
  }
};
