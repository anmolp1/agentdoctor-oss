/** JSON structured report output. */

import type { DiagnosticResult } from "../models/findings.js";
import type { HealthScore } from "../models/scores.js";

export interface JsonReportData {
  diagnostics: DiagnosticResult;
  healthScore: HealthScore;
  filesAnalyzed: string[];
}

/** Render a structured JSON diagnostic report. */
export function renderJson(data: JsonReportData): string {
  const report = {
    version: "0.1.0",
    generatedBy: "AgentDoctor",
    generatedAt: data.diagnostics.analysisTimestamp,
    filesAnalyzed: data.filesAnalyzed,
    diagnostics: {
      findings: data.diagnostics.findings,
      sessionsAnalyzed: data.diagnostics.sessionsAnalyzed,
      turnsAnalyzed: data.diagnostics.turnsAnalyzed,
      toolCallsAnalyzed: data.diagnostics.toolCallsAnalyzed,
      analysisTimestamp: data.diagnostics.analysisTimestamp,
      configUsed: data.diagnostics.configUsed,
    },
    healthScore: {
      overallScore: data.healthScore.overallScore,
      overallGrade: data.healthScore.overallGrade,
      layers: data.healthScore.layers,
      assessedLayers: data.healthScore.assessedLayers,
      unassessedLayers: data.healthScore.unassessedLayers,
      summary: data.healthScore.summary,
    },
  };

  return JSON.stringify(report, null, 2);
}
