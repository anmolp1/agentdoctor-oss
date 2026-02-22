/** Report assembly orchestrator. */

import type { DiagnosticResult } from "../models/findings.js";
import type { HealthScore } from "../models/scores.js";
import { renderMarkdown } from "./markdown.js";
import { renderJson } from "./json-report.js";

export type OutputFormat = "markdown" | "json";

/** Generate a report in the specified format. */
export function generateReport(
  diagnostics: DiagnosticResult,
  healthScore: HealthScore,
  filesAnalyzed: string[],
  format: OutputFormat,
): string {
  const data = { diagnostics, healthScore, filesAnalyzed };

  switch (format) {
    case "markdown":
      return renderMarkdown(data);
    case "json":
      return renderJson(data);
  }
}
