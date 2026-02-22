/** Similarity computation utilities. */

/** Flatten a nested object into dot-notation key=value pairs. */
export function flattenDict(obj: Record<string, unknown>, prefix = ""): Set<string> {
  const pairs = new Set<string>();
  for (const [key, value] of Object.entries(obj)) {
    const fullKey = prefix ? `${prefix}.${key}` : key;
    if (value !== null && typeof value === "object" && !Array.isArray(value)) {
      for (const pair of flattenDict(value as Record<string, unknown>, fullKey)) {
        pairs.add(pair);
      }
    } else {
      pairs.add(`${fullKey}=${JSON.stringify(value)}`);
    }
  }
  return pairs;
}

/** Compute Jaccard similarity between two sets. */
export function jaccardSimilarity(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 && b.size === 0) return 1.0;
  const intersection = new Set([...a].filter((x) => b.has(x)));
  const union = new Set([...a, ...b]);
  if (union.size === 0) return 1.0;
  return intersection.size / union.size;
}

/** Compute input similarity between two tool call inputs. */
export function inputSimilarity(
  a: Record<string, unknown>,
  b: Record<string, unknown>,
): number {
  return jaccardSimilarity(flattenDict(a), flattenDict(b));
}
