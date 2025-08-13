

import OpenAI from "openai";
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY }); 

export async function summarizeTexts(shortName: string, texts: string[]) {
  const prompt = `Summarize the following conversation so that future context is preserved succinctly. Provide short bullets and highlight user preferences or facts. Title: ${shortName}\n\n${texts.join("\n\n---\n\n")}\n\nSummary:`;
  const resp: any = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [{ role: "user", content: prompt }],
    max_tokens: 300,
  });
  return (resp as any)?.choices?.[0]?.message?.content ?? "";
} 
