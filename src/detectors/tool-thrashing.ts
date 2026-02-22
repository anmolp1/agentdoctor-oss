/** Tool Thrashing detector — detects repeated/oscillating tool calls. */

import type { BaseDetector } from "./base.js";
import type { AgentLogBundle, ToolCall } from "../models/canonical.js";
import type { AgentDoctorConfig } from "../models/config.js";
import type { Finding, Evidence } from "../models/findings.js";
import { Pathology, Severity } from "../models/findings.js";
import { inputSimilarity } from "../utils/similarity.js";
import { truncate } from "../utils/text.js";

export class ToolThrashingDetector implements BaseDetector {
  readonly pathology = Pathology.ToolThrashing;
  readonly name = "Tool Thrashing";

  detect(bundle: AgentLogBundle, config: AgentDoctorConfig): Finding[] {
    const findings: Finding[] = [];
    const cfg = config.toolThrashing;

    for (const session of bundle.sessions) {
      // Collect all tool calls in order
      const allToolCalls: { call: ToolCall; turnIndex: number }[] = [];
      for (const turn of session.turns) {
        for (const tc of turn.toolCalls) {
          allToolCalls.push({ call: tc, turnIndex: turn.turnIndex });
        }
      }

      // Rule 1: Repetitive same-tool in sliding window
      this.detectRepetitiveCalls(session.sessionId, allToolCalls, cfg, findings);

      // Rule 2: Tool oscillation patterns
      this.detectOscillation(session.sessionId, allToolCalls, cfg, findings);

      // Rule 3: High calls-per-turn
      this.detectHighCallsPerTurn(session.sessionId, session.turns, cfg, findings);
    }

    return findings;
  }

  private detectRepetitiveCalls(
    sessionId: string,
    allCalls: { call: ToolCall; turnIndex: number }[],
    cfg: AgentDoctorConfig["toolThrashing"],
    findings: Finding[],
  ): void {
    if (allCalls.length < cfg.windowSize) return;

    for (let i = 0; i <= allCalls.length - cfg.windowSize; i++) {
      const window = allCalls.slice(i, i + cfg.windowSize);
      const firstName = window[0]!.call.toolName;

      // Count same-tool calls in window
      const sameTool = window.filter((w) => w.call.toolName === firstName);
      if (sameTool.length < cfg.repetitionWarning) continue;

      // Check input similarity among same-tool calls
      let similarCount = 0;
      for (let j = 1; j < sameTool.length; j++) {
        const sim = inputSimilarity(sameTool[0]!.call.toolInput, sameTool[j]!.call.toolInput);
        if (sim >= cfg.inputSimilarityThreshold) similarCount++;
      }

      // Need all subsequent calls to be similar to first
      if (similarCount < sameTool.length - 1) continue;

      const severity =
        sameTool.length >= cfg.repetitionCritical ? Severity.Critical : Severity.Warning;

      const evidence: Evidence[] = sameTool.map((tc) => ({
        description: `${tc.call.toolName}(${truncate(JSON.stringify(tc.call.toolInput), 200)})`,
        turnIndex: tc.turnIndex,
        sessionId,
      }));

      // Avoid duplicate findings for overlapping windows
      const alreadyFound = findings.some(
        (f) =>
          f.pathology === Pathology.ToolThrashing &&
          f.title.includes(firstName) &&
          f.title.includes("repetitive"),
      );
      if (alreadyFound) continue;

      findings.push({
        pathology: Pathology.ToolThrashing,
        severity,
        title: `Repetitive ${firstName} calls — ${sameTool.length} similar calls in ${cfg.windowSize}-call window`,
        description:
          `Tool "${firstName}" called ${sameTool.length} times with similar inputs ` +
          `within a ${cfg.windowSize}-call window. This suggests the agent is retrying ` +
          `without meaningful variation.`,
        evidence,
        recommendation:
          'Review tool descriptions for ambiguity. Add "use when" and "do not use when" ' +
          "clauses. Consider a tool-call budget per task.",
        affectedSessions: [sessionId],
        confidence: severity === Severity.Critical ? 0.92 : 0.82,
      });
    }
  }

  private detectOscillation(
    sessionId: string,
    allCalls: { call: ToolCall; turnIndex: number }[],
    cfg: AgentDoctorConfig["toolThrashing"],
    findings: Finding[],
  ): void {
    if (allCalls.length < 4) return;

    const names = allCalls.map((c) => c.call.toolName);

    // Detect A→B→A→B patterns
    for (let patternLen = 2; patternLen <= 3; patternLen++) {
      for (let i = 0; i <= names.length - patternLen * 2; i++) {
        const pattern = names.slice(i, i + patternLen);

        // Count how many times this pattern repeats consecutively
        let cycles = 1;
        let pos = i + patternLen;
        while (pos + patternLen <= names.length) {
          const next = names.slice(pos, pos + patternLen);
          if (next.every((n, idx) => n === pattern[idx])) {
            cycles++;
            pos += patternLen;
          } else {
            break;
          }
        }

        if (cycles < cfg.oscillationMinCycles) continue;

        const severity =
          cycles >= cfg.oscillationCriticalCycles ? Severity.Critical : Severity.Warning;

        const patternStr = pattern.join(" → ");

        // Avoid duplicates
        const alreadyFound = findings.some(
          (f) => f.pathology === Pathology.ToolThrashing && f.title.includes("oscillation"),
        );
        if (alreadyFound) continue;

        findings.push({
          pathology: Pathology.ToolThrashing,
          severity,
          title: `Tool oscillation detected — ${patternStr} × ${cycles} cycles`,
          description:
            `Tool call pattern "${patternStr}" repeated ${cycles} consecutive times. ` +
            `This oscillating behavior indicates the agent is stuck in a loop.`,
          evidence: [
            {
              description: `Pattern: ${patternStr}, Cycles: ${cycles}, Starting at call index ${i}`,
              turnIndex: allCalls[i]?.turnIndex,
              sessionId,
              rawData: { pattern, cycles, startIndex: i },
            },
          ],
          recommendation:
            'Review tool descriptions for ambiguity. Add "use when" and "do not use when" ' +
            "clauses. Consider a tool-call budget per task.",
          affectedSessions: [sessionId],
          confidence: severity === Severity.Critical ? 0.9 : 0.8,
        });
      }
    }
  }

  private detectHighCallsPerTurn(
    sessionId: string,
    turns: readonly { turnIndex: number; toolCalls: readonly ToolCall[] }[],
    cfg: AgentDoctorConfig["toolThrashing"],
    findings: Finding[],
  ): void {
    for (const turn of turns) {
      if (turn.toolCalls.length > cfg.callsPerTurnWarning) {
        findings.push({
          pathology: Pathology.ToolThrashing,
          severity: Severity.Warning,
          title: `High tool call count — ${turn.toolCalls.length} calls in turn ${turn.turnIndex}`,
          description:
            `Turn ${turn.turnIndex} contains ${turn.toolCalls.length} tool calls ` +
            `(threshold: ${cfg.callsPerTurnWarning}). This may indicate inefficient tool usage.`,
          evidence: [
            {
              description: `${turn.toolCalls.length} tool calls in a single turn`,
              turnIndex: turn.turnIndex,
              sessionId,
              rawData: {
                toolNames: turn.toolCalls.map((tc) => tc.toolName),
                count: turn.toolCalls.length,
              },
            },
          ],
          recommendation:
            'Review tool descriptions for ambiguity. Add "use when" and "do not use when" ' +
            "clauses. Consider a tool-call budget per task.",
          affectedSessions: [sessionId],
          confidence: 0.7,
        });
      }
    }
  }
}
