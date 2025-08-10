import express, { NextFunction, Request, Response } from "express";
import { Queue } from "bullmq";
import fileUpload from "express-fileupload";

import { configEnv } from "./config";
import cors from "cors";
import cookieParser from "cookie-parser";
import path from "path";
import fs from "fs";

import OpenAI from "openai";

import { userAuthentication, UserAuthenticationRequest, userAuthorization } from "./middi/userAuth";


// connection 
const queue:any = new Queue("file-upload-queue",{
    connection: {
    host: 'localhost',
    port: 6379
  },
})

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

app.post("/upload/file", userAuthentication , userAuthorization, async (req: UserAuthenticationRequest, res: Response) => {
  try {
    if (!req.files || !req.files.pdf) {
      return res
        .status(400)
        .json({ status: false, message: "Please provide your PDF" });
    }

    const pdfFile = req.files.pdf as any;

    // Save to uploads directory
    const uploadDir = path.join(__dirname, "../uploads");
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    const filePath = path.join(uploadDir, pdfFile.name);
    await pdfFile.mv(filePath);

    // Send to worker with actual path
    await queue.add("file-ready", {
      filename: pdfFile.name,
      mimetype: pdfFile.mimetype,
      size: pdfFile.size,
      path: filePath,
    });

    return res
      .status(200)
      .json({ status: true, message: "File uploaded successfully" });
  } catch (err: any) {
    return res.status(500).json({ status: false, message: err.message });
  }
});


//======================================== get =================================================================

import { OpenAIEmbeddings } from "@langchain/openai";

import { QdrantVectorStore } from "@langchain/qdrant";
import { QdrantClient } from "@qdrant/js-client-rest";

const embeddings = new OpenAIEmbeddings({
    apiKey:configEnv.OPENAI_API_KEY
});


const openaiClient = new OpenAI({
  apiKey:configEnv.OPENAI_API_KEY
})

const client = new QdrantClient({ url: configEnv.QDRANT_DB });




app.get("/chat",userAuthentication , userAuthorization, async (req:UserAuthenticationRequest, res:Response)=>{
try{

const {message:string} = req.query

const message = "SSC Reasoning sallabus in hindi"

const vectorStore = await QdrantVectorStore.fromExistingCollection( embeddings, {
  client,
  collectionName: "pdf-docs",
})

const ret = vectorStore.asRetriever({
  k:2
})
const result = await ret.invoke(message)

console.log(result)

const SYSTEM_PROMPT =`You are helpfull AI Assistant who answeres the user query based on the availavle context from pdf file${JSON.stringify(result)}
`
const chatResult = await openaiClient.chat.completions.create({
  model:"gpt-4.1",
  messages:[
    {"role":"system","content":SYSTEM_PROMPT},
    {"role":"user","content":`${message}`}
  ]
})

const resultOpenAi = chatResult.choices[0].message.content

return res.status(200).json({status:true , message:"result retrives successfully", data:resultOpenAi, 
  // metadata:result

  }
)

}catch(err:any){
  return res.status(500).json({status:false,message:err.message})
}
})


app.get("/", async (req: Request, res: Response) => {
  return res.status(200).json({ message: "App is working perfect" });
});



import user from "./route/userAuthRoute"


app.use("/",user)


export default app;
