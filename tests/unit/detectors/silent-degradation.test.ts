import { SilentDegradationDetector } from "../../../src/detectors/silent-degradation.js";
import { getDefaultConfig } from "../../../src/models/config.js";
import { makeSession, makeBundle, makeTurn, makeToolCall, makeMessage } from "../../helpers.js";
import { Pathology, Severity } from "../../../src/models/findings.js";
import { Role, ToolCallStatus } from "../../../src/models/canonical.js";
import type { Finding } from "../../../src/models/findings.js";

describe("SilentDegradationDetector", () => {
  const detector = new SilentDegradationDetector();
  const config = getDefaultConfig();

  it("detects within-session performance drop", () => {
    // Session with 9 turns: first 3 turns all succeed, last 3 turns all fail
    // Tool success rate drops from 100% to 0% (> 20% withinSessionDropThreshold)
    const turns = [
      // First third: all successful
      makeTurn({
        turnIndex: 0,
        toolCalls: [
          makeToolCall({ toolName: "search", status: ToolCallStatus.Success, toolInput: { q: "a" } }),
          makeToolCall({ toolName: "read_file", status: ToolCallStatus.Success, toolInput: { p: "x" } }),
        ],
        messages: [
          makeMessage({ role: Role.User, content: "Do task 1." }),
          makeMessage({ role: Role.Assistant, content: "Done." }),
        ],
      }),
      makeTurn({
        turnIndex: 1,
        toolCalls: [
          makeToolCall({ toolName: "search", status: ToolCallStatus.Success, toolInput: { q: "b" } }),
        ],
        messages: [
          makeMessage({ role: Role.User, content: "Do task 2." }),
          makeMessage({ role: Role.Assistant, content: "Done." }),
        ],
      }),
      makeTurn({
        turnIndex: 2,
        toolCalls: [
          makeToolCall({ toolName: "write_file", status: ToolCallStatus.Success, toolInput: { p: "y" } }),
        ],
        messages: [
          makeMessage({ role: Role.User, content: "Do task 3." }),
          makeMessage({ role: Role.Assistant, content: "Done." }),
        ],
      }),
      // Middle third: mixed
      makeTurn({
        turnIndex: 3,
        toolCalls: [
          makeToolCall({ toolName: "search", status: ToolCallStatus.Success, toolInput: { q: "c" } }),
        ],
        messages: [
          makeMessage({ role: Role.User, content: "Do task 4." }),
          makeMessage({ role: Role.Assistant, content: "Done." }),
        ],
      }),
      makeTurn({
        turnIndex: 4,
        toolCalls: [
          makeToolCall({ toolName: "search", status: ToolCallStatus.Error, toolInput: { q: "d" } }),
        ],
        messages: [
          makeMessage({ role: Role.User, content: "Do task 5." }),
          makeMessage({ role: Role.Assistant, content: "There was an error." }),
        ],
      }),
      makeTurn({
        turnIndex: 5,
        toolCalls: [
          makeToolCall({ toolName: "read_file", status: ToolCallStatus.Error, toolInput: { p: "z" } }),
        ],
        messages: [
          makeMessage({ role: Role.User, content: "Do task 6." }),
          makeMessage({ role: Role.Assistant, content: "There was an error." }),
        ],
      }),
      // Last third: all failures
      makeTurn({
        turnIndex: 6,
        toolCalls: [
          makeToolCall({ toolName: "search", status: ToolCallStatus.Error, toolInput: { q: "e" } }),
          makeToolCall({ toolName: "search", status: ToolCallStatus.Error, toolInput: { q: "f" } }),
        ],
        messages: [
          makeMessage({ role: Role.User, content: "Do task 7." }),
          makeMessage({ role: Role.Assistant, content: "There was an error." }),
        ],
      }),
      makeTurn({
        turnIndex: 7,
        toolCalls: [
          makeToolCall({ toolName: "write_file", status: ToolCallStatus.Error, toolInput: { p: "w" } }),
        ],
        messages: [
          makeMessage({ role: Role.User, content: "Do task 8." }),
          makeMessage({ role: Role.Assistant, content: "There was an error." }),
        ],
      }),
      makeTurn({
        turnIndex: 8,
        toolCalls: [
          makeToolCall({ toolName: "search", status: ToolCallStatus.Error, toolInput: { q: "g" } }),
        ],
        messages: [
          makeMessage({ role: Role.User, content: "Do task 9." }),
          makeMessage({ role: Role.Assistant, content: "There was an error." }),
        ],
      }),
    ];

    const bundle = makeBundle([
      makeSession({
        sessionId: "degradation-session",
        turns,
        systemPrompt: "Use `search`, `read_file`, and `write_file`.",
        toolSchemas: [
          { name: "search", description: "Search" },
          { name: "read_file", description: "Read" },
          { name: "write_file", description: "Write" },
        ],
      }),
    ]);

    const findings = detector.detect(bundle, config);

    const degradationFinding = findings.find(
      (f) =>
        f.pathology === Pathology.SilentDegradation &&
        f.title.includes("Within-session performance decline"),
    );
    expect(degradationFinding).toBeDefined();
    expect(degradationFinding!.severity).toBe(Severity.Warning);
    expect(degradationFinding!.evidence.length).toBeGreaterThan(0);
  });

  it("detects compounding pathologies (>=3)", () => {
    // Provide otherFindings with 3+ distinct pathology types
    const bundle = makeBundle([
      makeSession({
        sessionId: "compound-session",
        turns: [
          makeTurn({ turnIndex: 0 }),
          makeTurn({ turnIndex: 1 }),
        ],
        systemPrompt: "Test.",
        toolSchemas: [],
      }),
    ]);

    const otherFindings: Finding[] = [
      {
        pathology: Pathology.ContextErosion,
        severity: Severity.Warning,
        title: "Context growing",
        description: "Context is growing.",
        evidence: [{ description: "Evidence" }],
        recommendation: "Fix it",
        affectedSessions: ["compound-session"],
        confidence: 0.8,
      },
      {
        pathology: Pathology.ToolThrashing,
        severity: Severity.Warning,
        title: "Tool thrashing",
        description: "Tools are thrashing.",
        evidence: [{ description: "Evidence" }],
        recommendation: "Fix it",
        affectedSessions: ["compound-session"],
        confidence: 0.8,
      },
      {
        pathology: Pathology.InstructionDrift,
        severity: Severity.Critical,
        title: "Instructions drifted",
        description: "Instructions have drifted.",
        evidence: [{ description: "Evidence" }],
        recommendation: "Fix it",
        affectedSessions: ["compound-session"],
        confidence: 0.9,
      },
    ];

    const findings = detector.detect(bundle, config, otherFindings);

    const compoundFinding = findings.find(
      (f) =>
        f.pathology === Pathology.SilentDegradation &&
        f.title.includes("Compounding pathologies"),
    );
    expect(compoundFinding).toBeDefined();
    expect(compoundFinding!.severity).toBe(Severity.Info);
    expect(compoundFinding!.title).toContain("3");
  });

  it("returns no findings for stable performance", () => {
    // All turns have consistent successful tool calls — no degradation
    const turns = Array.from({ length: 9 }, (_, i) =>
      makeTurn({
        turnIndex: i,
        toolCalls: [
          makeToolCall({
            toolName: "search",
            toolInput: { query: `query_${i}` },
            toolOutput: `Result ${i}`,
            status: ToolCallStatus.Success,
          }),
        ],
        messages: [
          makeMessage({ role: Role.User, content: `Question ${i}` }),
          makeMessage({ role: Role.Assistant, content: `Answer ${i}` }),
        ],
      }),
    );

    const bundle = makeBundle([
      makeSession({
        sessionId: "stable-session",
        turns,
        systemPrompt: "Use the `search` tool.",
        toolSchemas: [{ name: "search", description: "Search" }],
      }),
    ]);

    const findings = detector.detect(bundle, config);
    expect(findings.length).toBe(0);
  });
});
