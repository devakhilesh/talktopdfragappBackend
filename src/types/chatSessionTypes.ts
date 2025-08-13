import { Types } from "mongoose";

/**
 * A source/citation from a PDF chunk
 */
export interface Source {
  pdfId: string;
  pageNumber?: number | null;
  snippet?: string;
}

/**
 * Single chat message stored in a session
 */
export interface ChatMessage {
  role: "user" | "assistant" | "system";
  content: string;
  createdAt?: Date;
  sources?: Source[];       // only assistant messages typically have sources
  embeddingId?: string | null;
}

/**
 * Chat session (document) structure
 */
export interface ChatSession {
  sessionId: string;
  userId: Types.ObjectId | string;
  title?: string;
  messages: ChatMessage[];
  memorySummary?: string;
  lastActiveAt?: Date;
  createdAt?: Date;
}

/**
 * Mongoose Document type for ChatSession (used when typing the model)
 */
import { Document } from "mongoose";
export interface ChatSessionDocument extends ChatSession, Document {}
