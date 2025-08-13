// utils/tokens.ts
export function estimateTokens(text: string) {
  // quick heuristic: ~4 characters per token (depends on language)
  return Math.ceil(text.length / 4);
}
 
export function truncateToTokenLimit(messages: { role: string; content: string }[], maxTokens: number) {
  // Keep messages from the end until token budget fits
  let total = 0;
  const out: { role: string; content: string }[] = [];
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    const t = estimateTokens(m.content);
    if (total + t > maxTokens) break;
    out.unshift(m);
    total += t;
  }
  return out;
}
