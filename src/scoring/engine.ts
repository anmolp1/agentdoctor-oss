/** Health scoring engine — computes composite health score. */

import type { AgentLogBundle } from "../models/canonical.js";
import type { DiagnosticResult } from "../models/findings.js";
import { Severity } from "../models/findings.js";
import type { AgentDoctorConfig } from "../models/config.js";
import type { HealthScore, LayerScore } from "../models/scores.js";
import { gradeFromScore } from "../models/scores.js";
import { computeContextHealth } from "./context-health.js";
import { computeToolReliability } from "./tool-reliability.js";
import { computeInstructionCoherence } from "./instruction-coherence.js";

const LAYER_WEIGHTS: Record<string, number> = {
  "Context Health": 0.4,
  "Tool Reliability": 0.35,
  "Instruction Coherence": 0.25,
};

const UNASSESSED_LAYERS = ["Recovery Robustness", "Output Quality Baselines"];

/**
 * Compute the overall health score.
 *
 * 1. Compute each layer score (or null if insufficient data)
 * 2. For null layers, redistribute weight proportionally
 * 3. Apply finding penalties:
 *    - Each CRITICAL: -5 pts (max -25)
 *    - Each WARNING: -2 pts (max -10)
 * 4. Clamp to [0, 100]
 */
export function computeHealthScore(
  bundle: AgentLogBundle,
  diagnostics: DiagnosticResult,
  config: AgentDoctorConfig,
): HealthScore {
  // Compute each layer
  const contextHealth = computeContextHealth(bundle, config);
  const toolReliability = computeToolReliability(bundle, diagnostics);
  const instructionCoherence = computeInstructionCoherence(bundle, diagnostics);

  const layerResults: Array<{ name: string; result: LayerScore | null }> = [
    { name: "Context Health", result: contextHealth },
    { name: "Tool Reliability", result: toolReliability },
    { name: "Instruction Coherence", result: instructionCoherence },
  ];

  // Assessed and unassessed layers
  const assessedLayers: LayerScore[] = [];
  const nullLayers: string[] = [];

  for (const layer of layerResults) {
    if (layer.result) {
      assessedLayers.push(layer.result);
    } else {
      nullLayers.push(layer.name);
    }
  }

  // Compute raw score with weight redistribution
  let rawScore: number;
  if (assessedLayers.length === 0) {
    rawScore = 100; // No data = assume healthy
  } else {
    // Redistribute null layer weights proportionally
    const totalAssessedWeight = assessedLayers.reduce(
      (sum, layer) => sum + (LAYER_WEIGHTS[layer.name] ?? 0),
      0,
    );

    if (totalAssessedWeight === 0) {
      rawScore = 100;
    } else {
      rawScore = assessedLayers.reduce((sum, layer) => {
        const baseWeight = LAYER_WEIGHTS[layer.name] ?? 0;
        const adjustedWeight = baseWeight / totalAssessedWeight;
        return sum + layer.score * adjustedWeight;
      }, 0);
    }
  }

  // Apply finding penalties
  const criticalFindings = diagnostics.findings.filter(
    (f) => f.severity === Severity.Critical,
  ).length;
  const warningFindings = diagnostics.findings.filter(
    (f) => f.severity === Severity.Warning,
  ).length;

  const criticalPenalty = Math.min(
    config.scoring.criticalPenaltyMax,
    criticalFindings * config.scoring.criticalPenalty,
  );
  const warningPenalty = Math.min(
    config.scoring.warningPenaltyMax,
    warningFindings * config.scoring.warningPenalty,
  );

  const finalScore = Math.round(
    Math.max(0, Math.min(100, rawScore - criticalPenalty - warningPenalty)),
  );

  const unassessedLayers = [
    ...nullLayers.map((n) => `${n} (insufficient data)`),
    ...UNASSESSED_LAYERS,
  ];

  return {
    overallScore: finalScore,
    overallGrade: gradeFromScore(finalScore),
    layers: assessedLayers,
    assessedLayers: assessedLayers.length,
    unassessedLayers,
    summary: generateSummary(finalScore, assessedLayers, criticalFindings, warningFindings),
  };
}

function generateSummary(
  score: number,
  layers: LayerScore[],
  criticals: number,
  warnings: number,
): string {
  const grade = gradeFromScore(score);
  let summary = `Overall health score: ${score}/100 (${grade}). `;

  if (criticals > 0) {
    summary += `${criticals} critical finding${criticals > 1 ? "s" : ""} detected. `;
  }
  if (warnings > 0) {
    summary += `${warnings} warning${warnings > 1 ? "s" : ""} detected. `;
  }
  if (criticals === 0 && warnings === 0) {
    summary += "No significant issues detected. ";
  }

  summary += `${layers.length} of 5 diagnostic layers assessed.`;
  return summary;
}
