// models/documentModel.ts
import mongoose from "mongoose";
import { DocumentDoc } from "../../types/userTypes";

const DocumentSchema = new mongoose.Schema<DocumentDoc>({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "user",
    required: true,
  },
  pdfId: {
    type: String,
    required: true,
    unique: true,
  }, // uuid
  filename: {
    type: String,
    required: true,
  },
  pdfHash: {
    type: String,
    required: true,
    index: true,
  },
  size: { type: Number },
  qdrantCollection: {
    type: String,
    default: "pdf-docs",
  },
  createdAt: { type: Date, default: Date.now },
});

const DocumentModel = mongoose.model<DocumentDoc>("Document", DocumentSchema);
export default DocumentModel;
