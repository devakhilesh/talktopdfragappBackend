import { Worker, WorkerOptions, Job } from 'bullmq';

import { OpenAIEmbeddings } from "@langchain/openai";

import { QdrantVectorStore } from "@langchain/qdrant";

import { Document } from "@langchain/core/documents";

import type { AttributeInfo } from "langchain/chains/query_constructor";

import { PDFLoader } from "@langchain/community/document_loaders/fs/pdf";

import { CharacterTextSplitter } from "@langchain/textsplitters";

import { QdrantClient } from "@qdrant/js-client-rest";
import { configEnv } from './config';

const workerOptions: WorkerOptions = {
  connection: {
    host: 'localhost',
    port: 6379
  },
  concurrency: 100
}; 

const worker = new Worker(
  'file-upload-queue',
  async (job: Job) => {
    console.log(`Job:`, job.data);

  const { path } = job.data; // no JSON.parse

/* 
path:data.path
read the pdf from path,
chunk the pdf,
call the openai  embdding model for every chunk,
store the chunk in the qdrant db

*/


// Load the pdf


const loader = new PDFLoader(path);
const docs = await loader.load();


    // 2️⃣ Chunk text
    const textSplitter = new CharacterTextSplitter({
      chunkSize: 300,
      chunkOverlap: 0,
    });
    const splitDocs = await textSplitter.splitDocuments(docs);


    // console.log(`splitDocs=============\n\n`, splitDocs)

     console.log(`Chunks ready: ${splitDocs.length}`);


/**
 * Next, we instantiate a vector store. This is where we store the embeddings of the documents.
 * We also need to provide an embeddings object. This is used to embed the documents.
 */

const client = new QdrantClient({ url: configEnv.QDRANT_DB });

const embeddings = new OpenAIEmbeddings({
    apiKey:configEnv.OPENAI_API_KEY
});

const vectorStore = await QdrantVectorStore.fromDocuments(splitDocs, embeddings, {
  client,
  collectionName: "pdf-docs",
});

  },
  workerOptions
);
 