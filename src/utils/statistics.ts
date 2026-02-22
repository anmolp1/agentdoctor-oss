/** Statistical utility functions. */

/**
 * Check if a numeric sequence is monotonically increasing.
 * Returns the fraction of consecutive pairs that are increasing.
 */
export function monotonicIncreasingRatio(values: readonly number[]): number {
  if (values.length < 2) return 0;
  let increasing = 0;
  for (let i = 1; i < values.length; i++) {
    if ((values[i] ?? 0) > (values[i - 1] ?? 0)) {
      increasing++;
    }
  }
  return increasing / (values.length - 1);
}

/** Check if a sequence is monotonically increasing above a threshold. */
export function isMonotonic(values: readonly number[], threshold: number): boolean {
  return monotonicIncreasingRatio(values) >= threshold;
}

/** Classify trend direction of a numeric sequence. */
export function trendDirection(values: readonly number[]): "increasing" | "decreasing" | "stable" {
  if (values.length < 2) return "stable";
  const ratio = monotonicIncreasingRatio(values);
  if (ratio >= 0.6) return "increasing";
  // Check decreasing
  let decreasing = 0;
  for (let i = 1; i < values.length; i++) {
    if ((values[i] ?? 0) < (values[i - 1] ?? 0)) {
      decreasing++;
    }
  }
  if (decreasing / (values.length - 1) >= 0.6) return "decreasing";
  return "stable";
}

/** Compute average of a numeric array. Returns 0 for empty arrays. */
export function average(values: readonly number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

/** Linear interpolation: maps value from [low, high] to [0, 100]. */
export function linearScore(value: number, healthyValue: number, criticalValue: number): number {
  if (healthyValue === criticalValue) return value >= healthyValue ? 100 : 0;
  const score = ((value - criticalValue) / (healthyValue - criticalValue)) * 100;
  return Math.max(0, Math.min(100, score));
}
