/** Token estimation utilities. ~4 chars per token approximation. */

/** Estimate token count from text. Intentionally simple — no tiktoken dependency. */
export function estimateTokenCount(text: string): number {
  return Math.max(1, Math.ceil(text.length / 4));
}
