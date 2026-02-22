/** Instruction Coherence scoring layer. */

import type { AgentLogBundle } from "../models/canonical.js";
import type { DiagnosticResult } from "../models/findings.js";
import { Pathology } from "../models/findings.js";
import type { LayerScore } from "../models/scores.js";
import { gradeFromScore } from "../models/scores.js";

/**
 * Compute Instruction Coherence layer score.
 *
 * Components:
 * - Prompt-schema alignment (0.50): All correct = 100; Multiple phantom/orphan = 0
 * - Instruction consistency (0.30): No contradictions = 100; Multiple found = 0
 * - System prompt present (0.20): Yes = 100; No = 0
 */
export function computeInstructionCoherence(
  bundle: AgentLogBundle,
  diagnostics: DiagnosticResult,
): LayerScore {
  const driftFindings = diagnostics.findings.filter(
    (f) => f.pathology === Pathology.InstructionDrift,
  );

  // Prompt-schema alignment
  const phantomFindings = driftFindings.filter((f) => f.title.toLowerCase().includes("phantom"));
  const orphanFindings = driftFindings.filter((f) => f.title.toLowerCase().includes("orphan"));
  const alignmentIssues = phantomFindings.length * 2 + orphanFindings.length;
  const alignmentScore = Math.max(0, 100 - alignmentIssues * 25);

  // Instruction consistency
  const contradictionFindings = driftFindings.filter((f) =>
    f.title.toLowerCase().includes("contradict"),
  );
  const consistencyScore = Math.max(0, 100 - contradictionFindings.length * 30);

  // System prompt present
  let promptPresent = true;
  for (const session of bundle.sessions) {
    if (!session.systemPrompt) {
      promptPresent = false;
      break;
    }
  }
  const promptScore = promptPresent ? 100 : 0;

  const components: Record<string, number> = {
    prompt_schema_alignment: alignmentScore,
    instruction_consistency: consistencyScore,
    system_prompt_present: promptScore,
  };

  const weightedScore = alignmentScore * 0.5 + consistencyScore * 0.3 + promptScore * 0.2;
  const score = Math.round(Math.max(0, Math.min(100, weightedScore)));

  const flags: string[] = [];
  if (phantomFindings.length > 0)
    flags.push(`${phantomFindings.length} phantom tool(s) referenced`);
  if (orphanFindings.length > 0) flags.push(`${orphanFindings.length} orphaned tool(s) found`);
  if (contradictionFindings.length > 0) flags.push("Potentially contradictory directives found");
  if (!promptPresent) flags.push("System prompt missing");

  return {
    name: "Instruction Coherence",
    score,
    grade: gradeFromScore(score),
    summary: generateSummary(score, flags),
    components,
    flags,
  };
}

function generateSummary(score: number, flags: string[]): string {
  if (score >= 90) return "Instructions are coherent and well-aligned with tool schemas.";
  if (score >= 70) return "Instruction coherence is acceptable. " + flags.join(". ") + ".";
  if (score >= 50) return "Instruction coherence is concerning. " + flags.join(". ") + ".";
  return "Instruction coherence is critical. " + flags.join(". ") + ". Immediate attention needed.";
}
