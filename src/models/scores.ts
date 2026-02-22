/** Health score models. */

export type Grade = "A" | "B" | "C" | "D" | "F";

export interface LayerScore {
  readonly name: string;
  readonly score: number; // 0-100
  readonly grade: Grade;
  readonly summary: string;
  readonly components: Record<string, number>;
  readonly flags: readonly string[];
}

export interface HealthScore {
  readonly overallScore: number;
  readonly overallGrade: Grade;
  readonly layers: readonly LayerScore[];
  readonly assessedLayers: number;
  readonly unassessedLayers: readonly string[];
  readonly summary: string;
}

/** Convert a numeric score (0-100) to a letter grade. */
export function gradeFromScore(score: number): Grade {
  if (score >= 90) return "A";
  if (score >= 80) return "B";
  if (score >= 70) return "C";
  if (score >= 60) return "D";
  return "F";
}
