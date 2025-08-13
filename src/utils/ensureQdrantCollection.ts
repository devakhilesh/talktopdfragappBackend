// ऊपर: import axios from "axios";
import axios from "axios";

async function ensureQdrantCollection(
  qdrantUrl: string,
  apiKey: string | undefined,
  collectionName: string,
  vectorSize = 1536, // adjust to your embedding dim
  indexFields: string[] = ["userId", "pdfId", "filename"]
) {
  const base = qdrantUrl.replace(/\/$/, "");
  const infoUrl = `${base}/collections/${collectionName}`;

  const headers: Record<string, string> = {};
  if (apiKey) headers["api-key"] = apiKey;

  try {
    // check if collection exists
    const infoResp = await axios.get(infoUrl, { headers, timeout: 5000 });
    console.log(`Qdrant collection '${collectionName}' exists.`);

    // Try to create payload index for each field (safe to call repeatedly)
    for (const field of indexFields) {
      try {
        const idxUrl = `${base}/collections/${collectionName}/index`;
        const body = { field_name: field, field_schema: "keyword" };
        await axios.put(idxUrl, body, { headers, timeout: 10000 });
        console.log(`Ensured index for field '${field}'.`);
      } catch (idxErr: any) {
        // If index already exists or qdrant returns specific error, ignore, else warn
        const status = idxErr?.response?.status;
        const data = idxErr?.response?.data;
        if (status === 400 && String(data?.status?.error ?? "").toLowerCase().includes("index")) {
          // some qdrant versions return 400 with message if index exists or incompatible; ignore safely
          console.warn(`Index create warning for '${field}':`, data);
        } else {
          console.warn(`Failed to create index for '${field}':`, idxErr?.message || idxErr);
        }
      }
    }

    return;
  } catch (err: any) {
    const status = err?.response?.status;
    if (status && status !== 404) {
      console.error("Failed to check Qdrant collection:", err?.message || err);
      throw err;
    }

    // collection not found -> create collection with payload_schema + vectors
    const createUrl = infoUrl;
    const createBody = {
      vectors: {
        size: vectorSize,
        distance: "Cosine",
      },
      payload_schema: indexFields.reduce((acc: any, f) => {
        acc[f] = { type: "keyword" };
        return acc;
      }, {} as Record<string, any>),
    };

    try {
      await axios.put(createUrl, createBody, { headers, timeout: 15000 });
      console.log(`Qdrant collection '${collectionName}' created with payload_schema.`);
      return;
    } catch (createErr: any) {
      console.error("Failed to create Qdrant collection:", createErr?.message || createErr);
      throw createErr;
    }
  }
}


export default ensureQdrantCollection