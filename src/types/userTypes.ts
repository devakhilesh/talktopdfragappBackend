import { Types ,Document } from "mongoose";


export interface UserAuth extends Document {
  _id:Types.ObjectId,
  name: string;
  email: string;
  password: string;
  role: string;
}

export interface DocumentDoc extends Document {
  _id:Types.ObjectId,
  userId: Types.ObjectId;       // Reference to user model
  pdfId: string;                 // UUID
  filename: string;
  pdfHash: string;               // Indexed hash
  size?: number;                 // Optional
  qdrantCollection?: string;     // Default: "pdf-docs"
  createdAt?: Date;              // Auto-generated
}



