/** Context Erosion detector — detects context window growing unchecked. */

import type { BaseDetector } from "./base.js";
import type { AgentLogBundle } from "../models/canonical.js";
import type { AgentDoctorConfig } from "../models/config.js";
import type { Finding, Evidence } from "../models/findings.js";
import { Pathology, Severity } from "../models/findings.js";
import { isMonotonic } from "../utils/statistics.js";
import { estimateTokenCount } from "../utils/tokens.js";

export class ContextErosionDetector implements BaseDetector {
  readonly pathology = Pathology.ContextErosion;
  readonly name = "Context Erosion";

  detect(bundle: AgentLogBundle, config: AgentDoctorConfig): Finding[] {
    const findings: Finding[] = [];
    const cfg = config.contextErosion;

    for (const session of bundle.sessions) {
      // Get turns with token counts
      const turnsWithTokens = session.turns.filter(
        (t) => t.contextTokenCount != null && t.contextTokenCount > 0,
      );

      // Minimum 5 turns required
      if (turnsWithTokens.length < 5) continue;

      const tokenSeries = turnsWithTokens.map((t) => t.contextTokenCount!);

      // Rule 1: Monotonic growth
      this.detectMonotonicGrowth(session.sessionId, turnsWithTokens, tokenSeries, cfg, findings);

      // Rule 2: Instruction share decline
      if (session.systemPrompt) {
        this.detectInstructionShareDecline(
          session.sessionId,
          session.systemPrompt,
          turnsWithTokens,
          tokenSeries,
          cfg,
          findings,
        );
      }

      // Rule 3: Stale content
      this.detectStaleContent(session.sessionId, turnsWithTokens, tokenSeries, cfg, findings);
    }

    return findings;
  }

  private detectMonotonicGrowth(
    sessionId: string,
    turns: readonly { turnIndex: number; contextTokenCount?: number }[],
    tokenSeries: number[],
    cfg: AgentDoctorConfig["contextErosion"],
    findings: Finding[],
  ): void {
    if (!isMonotonic(tokenSeries, cfg.monotonicThreshold)) return;

    const firstTokens = tokenSeries[0]!;
    const lastTokens = tokenSeries[tokenSeries.length - 1]!;
    const avgGrowth = (lastTokens - firstTokens) / (tokenSeries.length - 1);

    // Check if critical (extreme growth rate or near window limit)
    const windowPct = lastTokens / cfg.assumedWindowSize;

    let severity: Severity;
    if (avgGrowth > cfg.growthRateCritical || windowPct > cfg.windowPctCritical) {
      severity = Severity.Critical;
    } else if (avgGrowth > cfg.growthRateWarning) {
      severity = Severity.Warning;
    } else {
      return; // Growth is within acceptable bounds
    }

    const evidence: Evidence[] = [
      {
        description: `Token count series: ${firstTokens} → ${lastTokens} over ${tokenSeries.length} turns`,
        turnIndex: turns[0]!.turnIndex,
        sessionId,
        rawData: {
          firstTokens,
          lastTokens,
          avgGrowthPerTurn: Math.round(avgGrowth),
          windowPct: Math.round(windowPct * 100) / 100,
          tokenSeries,
        },
      },
    ];

    findings.push({
      pathology: Pathology.ContextErosion,
      severity,
      title: `Context growing unchecked — ${Math.round(avgGrowth)} tokens/turn average growth`,
      description:
        `Context window grew from ${firstTokens.toLocaleString()} to ${lastTokens.toLocaleString()} tokens ` +
        `(${Math.round(avgGrowth)} tokens/turn). ` +
        (windowPct > cfg.windowPctCritical
          ? `Context is at ${Math.round(windowPct * 100)}% of assumed ${cfg.assumedWindowSize.toLocaleString()} token window.`
          : `Growth is monotonically increasing in ${Math.round(
              (tokenSeries.filter((_, i) => i > 0 && tokenSeries[i]! > tokenSeries[i - 1]!).length /
                (tokenSeries.length - 1)) *
                100,
            )}% of turns.`),
      evidence,
      recommendation:
        "Implement context management: summarize tool outputs older than N turns, " +
        "add TTL-based memory pruning, or implement a sliding window with instruction anchoring.",
      affectedSessions: [sessionId],
      confidence: severity === Severity.Critical ? 0.95 : 0.85,
    });
  }

  private detectInstructionShareDecline(
    sessionId: string,
    systemPrompt: string,
    turns: readonly { turnIndex: number; contextTokenCount?: number }[],
    tokenSeries: number[],
    cfg: AgentDoctorConfig["contextErosion"],
    findings: Finding[],
  ): void {
    const promptTokens = estimateTokenCount(systemPrompt);
    const firstContext = tokenSeries[0]!;
    const lastContext = tokenSeries[tokenSeries.length - 1]!;

    const startShare = promptTokens / firstContext;
    const endShare = promptTokens / lastContext;

    // Only flag if it started above the minimum threshold
    if (startShare < cfg.instructionShareStartMin) return;

    let severity: Severity;
    if (endShare < cfg.instructionShareCritical) {
      severity = Severity.Critical;
    } else if (endShare < cfg.instructionShareWarning) {
      severity = Severity.Warning;
    } else {
      return;
    }

    const evidence: Evidence[] = [
      {
        description:
          `Instruction share declined from ${(startShare * 100).toFixed(1)}% to ${(endShare * 100).toFixed(1)}%`,
        turnIndex: turns[turns.length - 1]!.turnIndex,
        sessionId,
        rawData: {
          promptTokens,
          startShare: Math.round(startShare * 1000) / 1000,
          endShare: Math.round(endShare * 1000) / 1000,
          firstContext,
          lastContext,
        },
      },
    ];

    findings.push({
      pathology: Pathology.ContextErosion,
      severity,
      title: `Instruction share at ${(endShare * 100).toFixed(1)}% — instructions being drowned out`,
      description:
        `System prompt represents ${(endShare * 100).toFixed(1)}% of context, ` +
        `down from ${(startShare * 100).toFixed(1)}%. Instructions are being diluted by accumulated content.`,
      evidence,
      recommendation:
        "Implement context management: summarize tool outputs older than N turns, " +
        "add TTL-based memory pruning, or implement a sliding window with instruction anchoring.",
      affectedSessions: [sessionId],
      confidence: 0.9,
    });
  }

  private detectStaleContent(
    sessionId: string,
    turns: readonly { turnIndex: number; contextTokenCount?: number }[],
    tokenSeries: number[],
    cfg: AgentDoctorConfig["contextErosion"],
    findings: Finding[],
  ): void {
    if (turns.length < cfg.staleTurnLookback) return;

    // Check if token count never decreases (no summarization)
    let neverDecreases = true;
    for (let i = 1; i < tokenSeries.length; i++) {
      if (tokenSeries[i]! < tokenSeries[i - 1]!) {
        neverDecreases = false;
        break;
      }
    }
    if (!neverDecreases) return;

    // Estimate stale content: tokens from turns older than lookback
    const lookbackIdx = Math.max(0, turns.length - cfg.staleTurnLookback);
    const tokensAtLookback = tokenSeries[lookbackIdx] ?? 0;
    const totalTokens = tokenSeries[tokenSeries.length - 1]!;

    if (totalTokens === 0) return;
    const staleRatio = tokensAtLookback / totalTokens;

    if (staleRatio < cfg.staleContentThreshold) return;

    findings.push({
      pathology: Pathology.ContextErosion,
      severity: Severity.Warning,
      title: `${Math.round(staleRatio * 100)}% of context is stale content`,
      description:
        `${Math.round(staleRatio * 100)}% of context tokens are from turns older than ${cfg.staleTurnLookback} turns ago, ` +
        `with no evidence of summarization (token count never decreases).`,
      evidence: [
        {
          description: `Stale content ratio: ${(staleRatio * 100).toFixed(1)}%`,
          sessionId,
          rawData: { staleRatio, tokensAtLookback, totalTokens, lookbackTurns: cfg.staleTurnLookback },
        },
      ],
      recommendation:
        "Implement context management: summarize tool outputs older than N turns, " +
        "add TTL-based memory pruning, or implement a sliding window with instruction anchoring.",
      affectedSessions: [sessionId],
      confidence: 0.75,
    });
  }
}
