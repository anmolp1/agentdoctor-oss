/** Silent Degradation detector — detects gradual performance decline. */

import type { BaseDetector } from "./base.js";
import type { AgentLogBundle, Turn } from "../models/canonical.js";
import type { AgentDoctorConfig } from "../models/config.js";
import type { Finding } from "../models/findings.js";
import { Pathology, Severity } from "../models/findings.js";
import { ToolCallStatus } from "../models/canonical.js";

export class SilentDegradationDetector implements BaseDetector {
  readonly pathology = Pathology.SilentDegradation;
  readonly name = "Silent Degradation";

  detect(bundle: AgentLogBundle, config: AgentDoctorConfig, otherFindings?: Finding[]): Finding[] {
    const findings: Finding[] = [];
    const cfg = config.silentDegradation;

    // Rule 2: Within-session performance drop
    for (const session of bundle.sessions) {
      if (session.turns.length < 3) continue;
      this.detectWithinSessionDrop(session.sessionId, session.turns, cfg, findings);
    }

    // Rule 3: Compounding pathology indicator
    if (otherFindings) {
      this.detectCompoundingPathologies(bundle, otherFindings, findings);
    }

    return findings;
  }

  private detectWithinSessionDrop(
    sessionId: string,
    turns: readonly Turn[],
    cfg: AgentDoctorConfig["silentDegradation"],
    findings: Finding[],
  ): void {
    const thirdSize = Math.floor(turns.length / 3);
    if (thirdSize === 0) return;

    const firstThird = turns.slice(0, thirdSize);
    const lastThird = turns.slice(-thirdSize);

    // Compute quality proxies
    const firstMetrics = this.computeMetrics(firstThird);
    const lastMetrics = this.computeMetrics(lastThird);

    const declines: string[] = [];

    // Tool success rate decline
    if (
      firstMetrics.toolSuccessRate > 0 &&
      lastMetrics.toolSuccessRate < firstMetrics.toolSuccessRate
    ) {
      const drop =
        (firstMetrics.toolSuccessRate - lastMetrics.toolSuccessRate) /
        firstMetrics.toolSuccessRate;
      if (drop > cfg.withinSessionDropThreshold) {
        declines.push(
          `Tool success rate dropped from ${(firstMetrics.toolSuccessRate * 100).toFixed(0)}% to ${(lastMetrics.toolSuccessRate * 100).toFixed(0)}%`,
        );
      }
    }

    // Error rate increase
    if (lastMetrics.errorRate > firstMetrics.errorRate) {
      const increase = lastMetrics.errorRate - firstMetrics.errorRate;
      if (increase > cfg.withinSessionDropThreshold) {
        declines.push(
          `Error rate increased from ${(firstMetrics.errorRate * 100).toFixed(0)}% to ${(lastMetrics.errorRate * 100).toFixed(0)}%`,
        );
      }
    }

    // Avg tool calls per turn increase (inefficiency)
    if (
      firstMetrics.avgToolCallsPerTurn > 0 &&
      lastMetrics.avgToolCallsPerTurn > firstMetrics.avgToolCallsPerTurn
    ) {
      const increase =
        (lastMetrics.avgToolCallsPerTurn - firstMetrics.avgToolCallsPerTurn) /
        firstMetrics.avgToolCallsPerTurn;
      if (increase > cfg.withinSessionDropThreshold) {
        declines.push(
          `Avg tool calls/turn increased from ${firstMetrics.avgToolCallsPerTurn.toFixed(1)} to ${lastMetrics.avgToolCallsPerTurn.toFixed(1)}`,
        );
      }
    }

    if (declines.length > 0) {
      findings.push({
        pathology: Pathology.SilentDegradation,
        severity: Severity.Warning,
        title: `Within-session performance decline detected`,
        description:
          `Comparing the first third vs. last third of the session, ` +
          `${declines.length} quality metric(s) declined significantly: ${declines.join("; ")}.`,
        evidence: [
          {
            description: declines.join("\n"),
            sessionId,
            rawData: {
              firstThirdMetrics: firstMetrics,
              lastThirdMetrics: lastMetrics,
              turnsInThird: thirdSize,
            },
          },
        ],
        recommendation:
          "Establish performance baselines and measure weekly. Use distribution-based " +
          "alerting (current vs. rolling 4-week average) rather than threshold alerts.",
        affectedSessions: [sessionId],
        confidence: 0.75,
      });
    }
  }

  private computeMetrics(turns: readonly Turn[]): {
    toolSuccessRate: number;
    errorRate: number;
    avgToolCallsPerTurn: number;
  } {
    let totalCalls = 0;
    let successCalls = 0;
    let errorCalls = 0;

    for (const turn of turns) {
      totalCalls += turn.toolCalls.length;
      for (const tc of turn.toolCalls) {
        if (tc.status === ToolCallStatus.Success) successCalls++;
        if (tc.status === ToolCallStatus.Error || tc.status === ToolCallStatus.Timeout) {
          errorCalls++;
        }
      }
    }

    return {
      toolSuccessRate: totalCalls > 0 ? successCalls / totalCalls : 1,
      errorRate: totalCalls > 0 ? errorCalls / totalCalls : 0,
      avgToolCallsPerTurn: turns.length > 0 ? totalCalls / turns.length : 0,
    };
  }

  private detectCompoundingPathologies(
    bundle: AgentLogBundle,
    otherFindings: Finding[],
    findings: Finding[],
  ): void {
    const uniquePathologies = new Set(otherFindings.map((f) => f.pathology));

    if (uniquePathologies.size >= 3) {
      findings.push({
        pathology: Pathology.SilentDegradation,
        severity: Severity.Info,
        title: `Compounding pathologies — ${uniquePathologies.size} distinct issues detected`,
        description:
          `${uniquePathologies.size} different pathologies detected in the same analysis: ` +
          `${[...uniquePathologies].join(", ")}. Multiple concurrent issues amplify degradation risk.`,
        evidence: [
          {
            description: `Pathologies detected: ${[...uniquePathologies].join(", ")}`,
            rawData: { pathologyCount: uniquePathologies.size, pathologies: [...uniquePathologies] },
          },
        ],
        recommendation:
          "Establish performance baselines and measure weekly. Use distribution-based " +
          "alerting (current vs. rolling 4-week average) rather than threshold alerts.",
        affectedSessions: bundle.sessions.map((s) => s.sessionId),
        confidence: 0.85,
      });
    }
  }
}
