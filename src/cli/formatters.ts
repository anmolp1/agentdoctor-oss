/** Terminal output helpers with colored output. */

import pc from "picocolors";
import type { HealthScore } from "../models/scores.js";
import type { DiagnosticResult } from "../models/findings.js";
import { Severity } from "../models/findings.js";

/** Format score with color based on grade. */
export function colorScore(score: number, grade: string): string {
  const text = `${score}/100 (${grade})`;
  if (grade === "A" || grade === "B") return pc.green(text);
  if (grade === "C") return pc.yellow(text);
  return pc.red(text);
}

/** Format severity badge with color. */
export function colorSeverity(severity: Severity): string {
  switch (severity) {
    case Severity.Critical:
      return pc.red("CRITICAL");
    case Severity.Warning:
      return pc.yellow("WARNING");
    case Severity.Info:
      return pc.blue("INFO");
  }
}

/** Print a summary to stdout. */
export function printSummary(healthScore: HealthScore, diagnostics: DiagnosticResult): void {
  const criticals = diagnostics.findings.filter((f) => f.severity === Severity.Critical).length;
  const warnings = diagnostics.findings.filter((f) => f.severity === Severity.Warning).length;

  // eslint-disable-next-line no-console
  console.log("");
  // eslint-disable-next-line no-console
  console.log(`  Health Score: ${colorScore(healthScore.overallScore, healthScore.overallGrade)}`);
  // eslint-disable-next-line no-console
  console.log("");

  if (criticals > 0) {
    // eslint-disable-next-line no-console
    console.log(pc.red(`  ${criticals} critical finding${criticals > 1 ? "s" : ""}`));
  }
  if (warnings > 0) {
    // eslint-disable-next-line no-console
    console.log(pc.yellow(`  ${warnings} warning${warnings > 1 ? "s" : ""}`));
  }
  if (criticals === 0 && warnings === 0) {
    // eslint-disable-next-line no-console
    console.log(pc.green("  No issues detected"));
  }

  // eslint-disable-next-line no-console
  console.log("");
  // eslint-disable-next-line no-console
  console.log(pc.dim("  Full diagnostic by MLDeep Systems → mldeep.systems/agentdoctor"));
  // eslint-disable-next-line no-console
  console.log("");
}

/** Print just the score and grade (for score command). */
export function printScore(healthScore: HealthScore): void {
  // eslint-disable-next-line no-console
  console.log(colorScore(healthScore.overallScore, healthScore.overallGrade));
}
