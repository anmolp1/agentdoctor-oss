/** Instruction Drift detector — detects contradictions between system prompt and tool schemas. */

import type { BaseDetector } from "./base.js";
import type { AgentLogBundle } from "../models/canonical.js";
import type { AgentDoctorConfig } from "../models/config.js";
import type { Finding, Evidence } from "../models/findings.js";
import { Pathology, Severity } from "../models/findings.js";
import { extractToolReferences, extractDirectives } from "../utils/text.js";

export class InstructionDriftDetector implements BaseDetector {
  readonly pathology = Pathology.InstructionDrift;
  readonly name = "Instruction Drift";

  detect(bundle: AgentLogBundle, config: AgentDoctorConfig): Finding[] {
    const findings: Finding[] = [];
    const cfg = config.instructionDrift;

    for (const session of bundle.sessions) {
      // Rule 3: Missing system prompt
      if (!session.systemPrompt) {
        findings.push({
          pathology: Pathology.InstructionDrift,
          severity: Severity.Info,
          title: "No system prompt found",
          description:
            "No system prompt was detected in this session. Without explicit instructions, " +
            "the agent relies entirely on its default behavior.",
          evidence: [{ description: "System prompt absent", sessionId: session.sessionId }],
          recommendation:
            "Create a unified instruction inventory. Version-control all instruction " +
            "surfaces together. Run behavioral regression tests after changes.",
          affectedSessions: [session.sessionId],
          confidence: 1.0,
        });
        continue;
      }

      // Rule 1: Tool reference mismatch
      if (cfg.checkToolReferences) {
        this.detectToolMismatch(
          session.sessionId,
          session.systemPrompt,
          session.toolSchemas,
          findings,
        );
      }

      // Rule 2: Contradictory directives
      if (cfg.checkContradictions) {
        this.detectContradictions(session.sessionId, session.systemPrompt, findings);
      }
    }

    return findings;
  }

  private detectToolMismatch(
    sessionId: string,
    systemPrompt: string,
    toolSchemas: readonly { name: string }[],
    findings: Finding[],
  ): void {
    const referencedTools = extractToolReferences(systemPrompt);
    const schemaNames = new Set(toolSchemas.map((t) => t.name));

    // Phantom tools: referenced in prompt but not in schemas
    const phantomTools = [...referencedTools].filter((t) => !schemaNames.has(t));
    // Orphaned tools: in schemas but never referenced in prompt
    const orphanedTools = [...schemaNames].filter((t) => !referencedTools.has(t));

    if (phantomTools.length > 0) {
      const evidence: Evidence[] = phantomTools.map((t) => ({
        description: `Tool "${t}" referenced in system prompt but not found in tool schemas`,
        sessionId,
        rawData: { toolName: t, inPrompt: true, inSchemas: false },
      }));

      findings.push({
        pathology: Pathology.InstructionDrift,
        severity: Severity.Critical,
        title: `Phantom tool${phantomTools.length > 1 ? "s" : ""}: ${phantomTools.join(", ")}`,
        description:
          `${phantomTools.length} tool(s) referenced in the system prompt are not available ` +
          `in the tool schemas: ${phantomTools.join(", ")}. The agent may attempt to use ` +
          `tools that don't exist.`,
        evidence,
        recommendation:
          "Create a unified instruction inventory. Version-control all instruction " +
          "surfaces together. Run behavioral regression tests after changes.",
        affectedSessions: [sessionId],
        confidence: 0.95,
      });
    }

    if (orphanedTools.length > 0) {
      const evidence: Evidence[] = orphanedTools.map((t) => ({
        description: `Tool "${t}" in schemas but never referenced in system prompt`,
        sessionId,
        rawData: { toolName: t, inPrompt: false, inSchemas: true },
      }));

      findings.push({
        pathology: Pathology.InstructionDrift,
        severity: Severity.Warning,
        title: `Orphaned tool${orphanedTools.length > 1 ? "s" : ""}: ${orphanedTools.join(", ")}`,
        description:
          `${orphanedTools.length} tool(s) are defined in schemas but never referenced ` +
          `in the system prompt: ${orphanedTools.join(", ")}. The agent may not know when to use them.`,
        evidence,
        recommendation:
          "Create a unified instruction inventory. Version-control all instruction " +
          "surfaces together. Run behavioral regression tests after changes.",
        affectedSessions: [sessionId],
        confidence: 0.8,
      });
    }
  }

  private detectContradictions(sessionId: string, systemPrompt: string, findings: Finding[]): void {
    const directives = extractDirectives(systemPrompt);
    if (directives.length < 2) return;

    const contradictions: Array<{ a: string; b: string }> = [];
    const positiveKeywords = new Set(["always", "must", "shall"]);
    const negativeKeywords = new Set(["never", "must not", "do not", "don't", "shall not"]);

    for (let i = 0; i < directives.length; i++) {
      for (let j = i + 1; j < directives.length; j++) {
        const di = directives[i]!;
        const dj = directives[j]!;

        // Check if one is positive and one is negative about similar subjects
        const iPositive = positiveKeywords.has(di.keyword);
        const iNegative = negativeKeywords.has(di.keyword);
        const jPositive = positiveKeywords.has(dj.keyword);
        const jNegative = negativeKeywords.has(dj.keyword);

        if ((iPositive && jNegative) || (iNegative && jPositive)) {
          // Check subject similarity (simple word overlap)
          const iWords = new Set(di.subject.toLowerCase().split(/\s+/));
          const jWords = new Set(dj.subject.toLowerCase().split(/\s+/));
          const overlap = [...iWords].filter((w) => jWords.has(w));

          if (overlap.length >= 2) {
            contradictions.push({ a: di.directive, b: dj.directive });
          }
        }
      }
    }

    if (contradictions.length > 0) {
      const evidence: Evidence[] = contradictions.map((c) => ({
        description: `Potentially contradictory: "${c.a}" vs "${c.b}"`,
        sessionId,
      }));

      findings.push({
        pathology: Pathology.InstructionDrift,
        severity: Severity.Info,
        title: `${contradictions.length} potentially contradictory directive${contradictions.length > 1 ? "s" : ""} found`,
        description:
          `Detected ${contradictions.length} pairs of directives that may contradict each other. ` +
          `This is a heuristic detection — please review manually.`,
        evidence,
        recommendation:
          "Create a unified instruction inventory. Version-control all instruction " +
          "surfaces together. Run behavioral regression tests after changes.",
        affectedSessions: [sessionId],
        confidence: 0.5,
      });
    }
  }
}
