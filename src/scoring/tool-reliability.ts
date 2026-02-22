/** Tool Reliability scoring layer. */

import type { AgentLogBundle } from "../models/canonical.js";
import type { DiagnosticResult } from "../models/findings.js";
import { Pathology } from "../models/findings.js";
import type { LayerScore } from "../models/scores.js";
import { gradeFromScore } from "../models/scores.js";
import { ToolCallStatus } from "../models/canonical.js";
import { linearScore } from "../utils/statistics.js";

/**
 * Compute Tool Reliability layer score.
 *
 * Components:
 * - Success rate (0.40): >95% = 100; <50% = 0
 * - Calls-per-turn (0.30): <=2 avg = 100; >8 avg = 0
 * - Thrashing score (0.30): 0 episodes = 100; >3 episodes = 0
 */
export function computeToolReliability(
  bundle: AgentLogBundle,
  diagnostics: DiagnosticResult,
): LayerScore | null {
  let totalCalls = 0;
  let successCalls = 0;
  let totalTurns = 0;

  for (const session of bundle.sessions) {
    totalTurns += session.turns.length;
    for (const turn of session.turns) {
      totalCalls += turn.toolCalls.length;
      for (const tc of turn.toolCalls) {
        if (tc.status === ToolCallStatus.Success) successCalls++;
      }
    }
  }

  // If no tool calls, cannot assess
  if (totalCalls === 0) return null;

  // Success rate
  const successRate = successCalls / totalCalls;
  const successScore = linearScore(successRate, 0.95, 0.5);

  // Calls per turn
  const callsPerTurn = totalTurns > 0 ? totalCalls / totalTurns : 0;
  const callsPerTurnScore = linearScore(callsPerTurn, 2, 8);

  // Thrashing episodes
  const thrashingFindings = diagnostics.findings.filter(
    (f) => f.pathology === Pathology.ToolThrashing,
  );
  const thrashingEpisodes = thrashingFindings.length;
  const thrashingScore = linearScore(thrashingEpisodes, 0, 3);

  const components: Record<string, number> = {
    success_rate: Math.round(successScore),
    calls_per_turn: Math.round(callsPerTurnScore),
    thrashing_score: Math.round(thrashingScore),
  };

  const weightedScore = successScore * 0.4 + callsPerTurnScore * 0.3 + thrashingScore * 0.3;
  const score = Math.round(Math.max(0, Math.min(100, weightedScore)));

  const flags: string[] = [];
  if (successScore < 50) flags.push(`Low tool success rate (${Math.round(successRate * 100)}%)`);
  if (callsPerTurnScore < 50)
    flags.push(`High calls-per-turn (${callsPerTurn.toFixed(1)} avg)`);
  if (thrashingScore < 50)
    flags.push(`${thrashingEpisodes} tool thrashing episode(s) detected`);

  return {
    name: "Tool Reliability",
    score,
    grade: gradeFromScore(score),
    summary: generateSummary(score, flags),
    components,
    flags,
  };
}

function generateSummary(score: number, flags: string[]): string {
  if (score >= 90) return "Tools are operating reliably with high success rates.";
  if (score >= 70) return "Tool reliability is acceptable. " + flags.join(". ") + ".";
  if (score >= 50) return "Tool reliability is concerning. " + flags.join(". ") + ".";
  return "Tool reliability is critical. " + flags.join(". ") + ". Immediate attention needed.";
}
