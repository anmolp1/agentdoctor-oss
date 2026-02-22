/** Recovery Blindness detector — detects tool failures with no fallback. */

import type { BaseDetector } from "./base.js";
import type { AgentLogBundle, ToolCall, Turn } from "../models/canonical.js";
import type { AgentDoctorConfig } from "../models/config.js";
import type { Finding } from "../models/findings.js";
import { Pathology, Severity } from "../models/findings.js";
import { ToolCallStatus, Role } from "../models/canonical.js";
import { containsKeywords } from "../utils/text.js";

const ACKNOWLEDGMENT_KEYWORDS = [
  "failed",
  "error",
  "couldn't",
  "unable",
  "issue",
  "problem",
  "unfortunately",
];

export class RecoveryBlindnessDetector implements BaseDetector {
  readonly pathology = Pathology.RecoveryBlindness;
  readonly name = "Recovery Blindness";

  detect(bundle: AgentLogBundle, config: AgentDoctorConfig): Finding[] {
    const findings: Finding[] = [];
    const cfg = config.recoveryBlindness;

    for (const session of bundle.sessions) {
      const allToolCalls: ToolCall[] = [];
      for (const turn of session.turns) {
        allToolCalls.push(...turn.toolCalls);
      }

      const failedCalls = allToolCalls.filter(
        (tc) => tc.status === ToolCallStatus.Error || tc.status === ToolCallStatus.Timeout,
      );

      // Rule 3: Untested failure handling
      if (failedCalls.length === 0) {
        if (cfg.flagUntested) {
          findings.push({
            pathology: Pathology.RecoveryBlindness,
            severity: Severity.Info,
            title: "No tool failures observed — recovery untested",
            description:
              "Zero tool errors were found in this session. While this is good, " +
              "it means failure handling has not been tested.",
            evidence: [
              {
                description: "No tool failures in session",
                sessionId: session.sessionId,
              },
            ],
            recommendation:
              "Define recovery policies per tool: retry with backoff for transient errors, " +
              "fallback for capability errors, escalate for persistent failures.",
            affectedSessions: [session.sessionId],
            confidence: 0.6,
          });
        }
        continue;
      }

      // Rule 1: Unhandled failures
      this.detectUnhandledFailures(session.sessionId, session.turns, cfg, findings);

      // Rule 2: Per-tool error rate
      this.detectHighErrorRate(session.sessionId, allToolCalls, cfg, findings);
    }

    return findings;
  }

  private detectUnhandledFailures(
    sessionId: string,
    turns: readonly Turn[],
    cfg: AgentDoctorConfig["recoveryBlindness"],
    findings: Finding[],
  ): void {
    for (let ti = 0; ti < turns.length; ti++) {
      const turn = turns[ti]!;

      for (let ci = 0; ci < turn.toolCalls.length; ci++) {
        const call = turn.toolCalls[ci]!;
        if (call.status !== ToolCallStatus.Error && call.status !== ToolCallStatus.Timeout) {
          continue;
        }

        // Check next action: retry, different tool, or acknowledgment
        const recovery = this.analyzeRecovery(turns, ti, ci, call, cfg);

        if (recovery === "unhandled") {
          findings.push({
            pathology: Pathology.RecoveryBlindness,
            severity: Severity.Critical,
            title: `Failed "${call.toolName}" — agent proceeds as if succeeded`,
            description:
              `Tool "${call.toolName}" returned ${call.status} but the agent continued ` +
              `without retry, fallback, or acknowledgment.`,
            evidence: [
              {
                description: `${call.toolName} failed with status "${call.status}"${call.errorMessage ? `: ${call.errorMessage}` : ""}`,
                turnIndex: turn.turnIndex,
                toolCallIndex: ci,
                sessionId,
              },
            ],
            recommendation:
              "Define recovery policies per tool: retry with backoff for transient errors, " +
              "fallback for capability errors, escalate for persistent failures.",
            affectedSessions: [sessionId],
            confidence: 0.9,
          });
        } else if (recovery === "blind_retry") {
          findings.push({
            pathology: Pathology.RecoveryBlindness,
            severity: Severity.Warning,
            title: `"${call.toolName}" retried ≥${cfg.maxBlindRetries} times with identical inputs`,
            description:
              `Tool "${call.toolName}" failed and was retried ${cfg.maxBlindRetries}+ times ` +
              `with identical inputs — no variation in approach.`,
            evidence: [
              {
                description: `Blind retry of ${call.toolName} ≥${cfg.maxBlindRetries} times`,
                turnIndex: turn.turnIndex,
                toolCallIndex: ci,
                sessionId,
              },
            ],
            recommendation:
              "Define recovery policies per tool: retry with backoff for transient errors, " +
              "fallback for capability errors, escalate for persistent failures.",
            affectedSessions: [sessionId],
            confidence: 0.85,
          });
        }
      }
    }
  }

  private analyzeRecovery(
    turns: readonly Turn[],
    turnIdx: number,
    callIdx: number,
    failedCall: ToolCall,
    cfg: AgentDoctorConfig["recoveryBlindness"],
  ): "handled" | "unhandled" | "blind_retry" {
    const turn = turns[turnIdx]!;

    // Check remaining calls in same turn
    const remainingCalls = turn.toolCalls.slice(callIdx + 1);
    if (remainingCalls.length > 0) {
      const nextCall = remainingCalls[0]!;
      if (nextCall.toolName !== failedCall.toolName) {
        return "handled"; // Different tool = fallback
      }
      // Check if retry with same inputs
      const sameInputRetries = remainingCalls.filter(
        (c) =>
          c.toolName === failedCall.toolName &&
          JSON.stringify(c.toolInput) === JSON.stringify(failedCall.toolInput),
      );
      if (sameInputRetries.length >= cfg.maxBlindRetries) {
        return "blind_retry";
      }
      return "handled"; // Retry with different inputs
    }

    // Check next turn
    const nextTurn = turns[turnIdx + 1];
    if (!nextTurn) return "unhandled";

    // Check if next turn has an acknowledgment message
    for (const msg of nextTurn.messages) {
      if (msg.role === Role.Assistant) {
        if (containsKeywords(msg.content, ACKNOWLEDGMENT_KEYWORDS)) {
          return "handled"; // Graceful degradation
        }
      }
    }

    // Check if next turn retries the tool
    if (nextTurn.toolCalls.length > 0) {
      const nextCall = nextTurn.toolCalls[0]!;
      if (nextCall.toolName !== failedCall.toolName) {
        return "handled"; // Different tool = fallback
      }
      // Blind retry check across turns
      const sameInputRetries = nextTurn.toolCalls.filter(
        (c) =>
          c.toolName === failedCall.toolName &&
          JSON.stringify(c.toolInput) === JSON.stringify(failedCall.toolInput),
      );
      if (sameInputRetries.length >= cfg.maxBlindRetries) {
        return "blind_retry";
      }
      return "handled";
    }

    return "unhandled";
  }

  private detectHighErrorRate(
    sessionId: string,
    allToolCalls: ToolCall[],
    cfg: AgentDoctorConfig["recoveryBlindness"],
    findings: Finding[],
  ): void {
    // Group by tool name
    const byTool = new Map<string, ToolCall[]>();
    for (const tc of allToolCalls) {
      const existing = byTool.get(tc.toolName) ?? [];
      existing.push(tc);
      byTool.set(tc.toolName, existing);
    }

    for (const [toolName, calls] of byTool) {
      const errors = calls.filter(
        (c) => c.status === ToolCallStatus.Error || c.status === ToolCallStatus.Timeout,
      );
      if (calls.length === 0) continue;
      const errorRate = errors.length / calls.length;

      let severity: Severity | null = null;
      if (errorRate > cfg.errorRateCritical) {
        severity = Severity.Critical;
      } else if (errorRate > cfg.errorRateWarning) {
        severity = Severity.Warning;
      }

      if (severity) {
        findings.push({
          pathology: Pathology.RecoveryBlindness,
          severity,
          title: `"${toolName}" error rate: ${Math.round(errorRate * 100)}%`,
          description:
            `Tool "${toolName}" has a ${Math.round(errorRate * 100)}% error rate ` +
            `(${errors.length}/${calls.length} calls failed).`,
          evidence: [
            {
              description: `${errors.length}/${calls.length} calls failed`,
              sessionId,
              rawData: { toolName, totalCalls: calls.length, errors: errors.length, errorRate },
            },
          ],
          recommendation:
            "Define recovery policies per tool: retry with backoff for transient errors, " +
            "fallback for capability errors, escalate for persistent failures.",
          affectedSessions: [sessionId],
          confidence: 0.88,
        });
      }
    }
  }
}
