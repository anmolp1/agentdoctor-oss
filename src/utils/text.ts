/** Text utility functions. */

/** Truncate a string to a max length, appending "..." if truncated. */
export function truncate(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength - 3) + "...";
}

/** Common English words to filter out from tool name extraction. */
const STOP_WORDS = new Set([
  "the", "a", "an", "and", "or", "but", "in", "on", "at", "to", "for",
  "of", "with", "by", "from", "it", "is", "are", "was", "were", "be",
  "been", "has", "have", "had", "do", "does", "did", "will", "would",
  "could", "should", "may", "might", "can", "this", "that", "these",
  "those", "not", "no", "if", "then", "else", "when", "where", "how",
  "all", "each", "every", "any", "some", "your", "my", "our", "their",
]);

/** Extract tool names referenced in text (backtick-wrapped or "use the X tool" patterns). */
export function extractToolReferences(text: string): Set<string> {
  const refs = new Set<string>();

  // Match backtick-wrapped tool names (most reliable signal)
  const backtickPattern = /`([a-zA-Z_][a-zA-Z0-9_-]*)`/g;
  let match;
  while ((match = backtickPattern.exec(text)) !== null) {
    if (match[1] && !STOP_WORDS.has(match[1].toLowerCase())) {
      refs.add(match[1]);
    }
  }

  // Match "use the X tool", "call X tool" patterns — require "tool" suffix to reduce false positives
  const phrasePattern = /(?:use|call|invoke|run|execute)\s+(?:the\s+)?([a-zA-Z_]\w[\w-]*?)\s+tool\b/gi;
  while ((match = phrasePattern.exec(text)) !== null) {
    if (match[1] && !STOP_WORDS.has(match[1].toLowerCase())) {
      refs.add(match[1]);
    }
  }

  return refs;
}

/** Check if text contains any of the given keywords (case-insensitive). */
export function containsKeywords(text: string, keywords: readonly string[]): boolean {
  const lower = text.toLowerCase();
  return keywords.some((kw) => lower.includes(kw.toLowerCase()));
}

/** Extract directive phrases ("always", "never", "must", "do not") from text. */
export function extractDirectives(
  text: string,
): Array<{ directive: string; keyword: string; subject: string }> {
  const results: Array<{ directive: string; keyword: string; subject: string }> = [];
  const directivePattern =
    /\b(always|never|must|must not|do not|don't|shall not|shall)\b\s+(.{5,80}?)(?:\.|$)/gi;
  let match;
  while ((match = directivePattern.exec(text)) !== null) {
    if (match[1] && match[2]) {
      results.push({
        directive: match[0].trim(),
        keyword: match[1].toLowerCase(),
        subject: match[2].trim(),
      });
    }
  }
  return results;
}
