import mongoose from "mongoose";
import { ChatSessionDocument } from "../../types/chatSessionTypes";

const MessageSchema = new mongoose.Schema({
  role: { type: String, enum: ["user", "assistant", "system"], required: true },
  content: { type: String, required: true },
  createdAt: { type: Date, default: Date.now },

  sources: {
    type: [{ pdfId: String, pageNumber: Number, snippet: String }],
    default: [],
  },

  embeddingId: { type: String, default: null },
});

const ChatSessionSchema = new mongoose.Schema<ChatSessionDocument>({
  sessionId: { type: String, required: true, unique: true },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "user", required: true },
  title: { type: String },
  messages: [MessageSchema],
  memorySummary: { type: String, default: "" },
  lastActiveAt: { type: Date, default: Date.now },
  createdAt: { type: Date, default: Date.now },
});

const ChatSessionModel = mongoose.model<ChatSessionDocument>("ChatSession", ChatSessionSchema);

export default ChatSessionModel