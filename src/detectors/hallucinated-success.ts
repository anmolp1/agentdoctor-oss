/** Hallucinated Tool Success detector — agent claims tool succeeded when it failed. */

import type { BaseDetector } from "./base.js";
import type { AgentLogBundle, Turn } from "../models/canonical.js";
import type { AgentDoctorConfig } from "../models/config.js";
import type { Finding } from "../models/findings.js";
import { Pathology, Severity } from "../models/findings.js";
import { ToolCallStatus, Role } from "../models/canonical.js";
import { containsKeywords } from "../utils/text.js";

const TRUNCATION_INDICATORS = [
  "truncated",
  "partial",
  "limit exceeded",
  "more results available",
  "results omitted",
  "showing first",
];

export class HallucinatedSuccessDetector implements BaseDetector {
  readonly pathology = Pathology.HallucinatedToolSuccess;
  readonly name = "Hallucinated Tool Success";

  detect(bundle: AgentLogBundle, config: AgentDoctorConfig): Finding[] {
    const findings: Finding[] = [];
    const cfg = config.hallucinatedSuccess;

    for (const session of bundle.sessions) {
      for (let ti = 0; ti < session.turns.length; ti++) {
        const turn = session.turns[ti]!;

        for (let ci = 0; ci < turn.toolCalls.length; ci++) {
          const call = turn.toolCalls[ci]!;

          // Rule 1: Status/output mismatch
          if (call.status === ToolCallStatus.Error || call.status === ToolCallStatus.Timeout) {
            const nextAssistantMsg = this.getNextAssistantMessage(session.turns, ti, ci);
            if (
              nextAssistantMsg &&
              !containsKeywords(nextAssistantMsg, cfg.errorAcknowledgmentKeywords)
            ) {
              findings.push({
                pathology: Pathology.HallucinatedToolSuccess,
                severity: Severity.Critical,
                title: `"${call.toolName}" failed but agent proceeds without acknowledgment`,
                description:
                  `Tool "${call.toolName}" returned status "${call.status}" but the agent's ` +
                  `next message contains no acknowledgment of the failure.`,
                evidence: [
                  {
                    description: `Tool status: ${call.status}. Next assistant message does not acknowledge failure.`,
                    turnIndex: turn.turnIndex,
                    toolCallIndex: ci,
                    sessionId: session.sessionId,
                    rawData: {
                      toolName: call.toolName,
                      toolStatus: call.status,
                      errorMessage: call.errorMessage,
                      nextMessage: nextAssistantMsg.slice(0, 300),
                    },
                  },
                ],
                recommendation:
                  "Add output validation after every tool call. Verify response schema, " +
                  "check for error indicators, validate critical fields before proceeding.",
                affectedSessions: [session.sessionId],
                confidence: 0.92,
              });
            }
          }

          // Rule 2: Empty output treated as success
          if (
            this.isEmptyOrErrorOutput(call.toolOutput) &&
            call.status === ToolCallStatus.Success
          ) {
            const nextAssistantMsg = this.getNextAssistantMessage(session.turns, ti, ci);
            if (nextAssistantMsg && this.containsSpecificClaims(nextAssistantMsg)) {
              findings.push({
                pathology: Pathology.HallucinatedToolSuccess,
                severity: Severity.Warning,
                title: `"${call.toolName}" returned empty/error output but agent makes specific claims`,
                description:
                  `Tool "${call.toolName}" returned empty or error-containing output, but the agent ` +
                  `makes specific data claims (numbers, URLs, or proper nouns) not present in prior context.`,
                evidence: [
                  {
                    description: `Tool output is empty/null but agent asserts specific facts.`,
                    turnIndex: turn.turnIndex,
                    toolCallIndex: ci,
                    sessionId: session.sessionId,
                    rawData: {
                      toolName: call.toolName,
                      toolOutput: call.toolOutput?.slice(0, 200),
                    },
                  },
                ],
                recommendation:
                  "Add output validation after every tool call. Verify response schema, " +
                  "check for error indicators, validate critical fields before proceeding.",
                affectedSessions: [session.sessionId],
                confidence: 0.65,
              });
            }
          }

          // Rule 3: Partial result acceptance
          if (call.toolOutput && containsKeywords(call.toolOutput, TRUNCATION_INDICATORS)) {
            const nextAssistantMsg = this.getNextAssistantMessage(session.turns, ti, ci);
            if (
              nextAssistantMsg &&
              !nextAssistantMsg.toLowerCase().includes("truncat") &&
              !nextAssistantMsg.toLowerCase().includes("partial") &&
              !nextAssistantMsg.toLowerCase().includes("incomplete")
            ) {
              findings.push({
                pathology: Pathology.HallucinatedToolSuccess,
                severity: Severity.Warning,
                title: `"${call.toolName}" returned partial results — treated as complete`,
                description:
                  `Tool "${call.toolName}" output contains truncation indicators but ` +
                  `the agent treats the results as complete.`,
                evidence: [
                  {
                    description: `Tool output contains truncation indicators.`,
                    turnIndex: turn.turnIndex,
                    toolCallIndex: ci,
                    sessionId: session.sessionId,
                  },
                ],
                recommendation:
                  "Add output validation after every tool call. Verify response schema, " +
                  "check for error indicators, validate critical fields before proceeding.",
                affectedSessions: [session.sessionId],
                confidence: 0.7,
              });
            }
          }
        }
      }
    }

    return findings;
  }

  private getNextAssistantMessage(
    turns: readonly Turn[],
    turnIdx: number,
    _callIdx: number,
  ): string | null {
    const turn = turns[turnIdx]!;

    // Check messages in same turn after the tool call
    for (const msg of turn.messages) {
      if (msg.role === Role.Assistant && msg.content) {
        return msg.content;
      }
    }

    // Check next turn
    const nextTurn = turns[turnIdx + 1];
    if (nextTurn) {
      for (const msg of nextTurn.messages) {
        if (msg.role === Role.Assistant && msg.content) {
          return msg.content;
        }
      }
    }

    return null;
  }

  private isEmptyOrErrorOutput(output: string | undefined): boolean {
    if (!output) return true;
    const trimmed = output.trim();
    if (trimmed === "" || trimmed === "null" || trimmed === "undefined") return true;
    if (trimmed === "{}" || trimmed === "[]") return true;

    // Check if output is an error JSON
    try {
      const parsed = JSON.parse(trimmed);
      if (parsed && typeof parsed === "object" && ("error" in parsed || "Error" in parsed)) {
        return true;
      }
    } catch {
      // Not JSON, that's fine
    }

    return false;
  }

  private containsSpecificClaims(text: string): boolean {
    // Check for numbers
    if (/\d{2,}/.test(text)) return true;
    // Check for URLs
    if (/https?:\/\/\S+/.test(text)) return true;
    // Check for capitalized proper nouns (rough heuristic)
    if (/\b[A-Z][a-z]{2,}\s+[A-Z][a-z]{2,}\b/.test(text)) return true;
    return false;
  }
}
