/** Context Health scoring layer. */

import type { AgentLogBundle } from "../models/canonical.js";
import type { AgentDoctorConfig } from "../models/config.js";
import type { LayerScore } from "../models/scores.js";
import { gradeFromScore } from "../models/scores.js";
import { isMonotonic, linearScore, average } from "../utils/statistics.js";
import { estimateTokenCount } from "../utils/tokens.js";

/**
 * Compute Context Health layer score.
 * Returns null if insufficient data (no token counts).
 *
 * Components:
 * - Growth management (0.35): Context plateaus or is pruned = 100; Monotonic growth = 0
 * - Instruction share (0.35): >15% of context = 100; <2% of context = 0
 * - Stale content (0.30): <20% stale = 100; >80% stale = 0
 */
export function computeContextHealth(
  bundle: AgentLogBundle,
  config: AgentDoctorConfig,
): LayerScore | null {
  const cfg = config.contextErosion;
  const allTokenSeries: number[][] = [];
  const instructionShares: number[] = [];
  const staleRatios: number[] = [];

  for (const session of bundle.sessions) {
    const tokenSeries = session.turns
      .filter((t) => t.contextTokenCount != null && t.contextTokenCount > 0)
      .map((t) => t.contextTokenCount!);

    if (tokenSeries.length < 2) continue;
    allTokenSeries.push(tokenSeries);

    // Instruction share
    if (session.systemPrompt) {
      const promptTokens = estimateTokenCount(session.systemPrompt);
      const lastContext = tokenSeries[tokenSeries.length - 1]!;
      if (lastContext > 0) {
        instructionShares.push(promptTokens / lastContext);
      }
    }

    // Stale content estimation — only flag if context never decreases (no summarization)
    if (tokenSeries.length >= cfg.staleTurnLookback) {
      let neverDecreases = true;
      for (let i = 1; i < tokenSeries.length; i++) {
        if (tokenSeries[i]! < tokenSeries[i - 1]!) {
          neverDecreases = false;
          break;
        }
      }
      if (neverDecreases) {
        const lookbackIdx = Math.max(0, tokenSeries.length - cfg.staleTurnLookback);
        const tokensAtLookback = tokenSeries[lookbackIdx] ?? 0;
        const totalTokens = tokenSeries[tokenSeries.length - 1]!;
        if (totalTokens > 0) {
          staleRatios.push(tokensAtLookback / totalTokens);
        }
      }
    }
  }

  // If no token data at all, cannot assess
  if (allTokenSeries.length === 0) return null;

  // Growth management score
  let growthScore = 100;
  for (const series of allTokenSeries) {
    if (isMonotonic(series, cfg.monotonicThreshold)) {
      const firstTokens = series[0]!;
      const lastTokens = series[series.length - 1]!;
      const avgGrowth = (lastTokens - firstTokens) / (series.length - 1);
      // Linear: 0 growth = 100, >2000 growth = 0
      const s = linearScore(avgGrowth, 0, cfg.growthRateCritical);
      growthScore = Math.min(growthScore, s);
    }
  }

  // Instruction share score
  let instructionScore = 100;
  if (instructionShares.length > 0) {
    const avgShare = average(instructionShares);
    // >15% = 100, <2% = 0
    instructionScore = linearScore(avgShare, 0.15, 0.02);
  }

  // Stale content score
  let staleScore = 100;
  if (staleRatios.length > 0) {
    const avgStale = average(staleRatios);
    // <20% stale = 100, >80% stale = 0
    staleScore = linearScore(avgStale, 0.2, 0.8);
  }

  const components: Record<string, number> = {
    growth_management: Math.round(growthScore),
    instruction_share: Math.round(instructionScore),
    stale_content: Math.round(staleScore),
  };

  const weightedScore = growthScore * 0.35 + instructionScore * 0.35 + staleScore * 0.3;
  const score = Math.round(Math.max(0, Math.min(100, weightedScore)));

  const flags: string[] = [];
  if (growthScore < 50) flags.push("Context growing without management");
  if (instructionScore < 50) flags.push("Instruction share declining");
  if (staleScore < 50) flags.push("High stale content ratio");

  return {
    name: "Context Health",
    score,
    grade: gradeFromScore(score),
    summary: generateSummary(score, flags),
    components,
    flags,
  };
}

function generateSummary(score: number, flags: string[]): string {
  if (score >= 90) return "Context management is healthy. Instructions are well-preserved.";
  if (score >= 70) return "Context health is acceptable but could be improved. " + flags.join(". ") + ".";
  if (score >= 50) return "Context health is concerning. " + flags.join(". ") + ".";
  return "Context health is critical. " + flags.join(". ") + ". Immediate attention needed.";
}
