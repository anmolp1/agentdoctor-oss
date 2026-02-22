import { ToolThrashingDetector } from "../../../src/detectors/tool-thrashing.js";
import { getDefaultConfig } from "../../../src/models/config.js";
import { makeSession, makeBundle, makeTurn, makeToolCall } from "../../helpers.js";
import { Pathology, Severity } from "../../../src/models/findings.js";
import { ToolCallStatus } from "../../../src/models/canonical.js";

describe("ToolThrashingDetector", () => {
  const detector = new ToolThrashingDetector();
  const config = getDefaultConfig();

  it("detects repetitive same-tool calls", () => {
    // Default windowSize=5, repetitionWarning=3, inputSimilarityThreshold=0.7
    // 5 calls to same tool with identical inputs in a 5-call window
    const turns = [
      makeTurn({
        turnIndex: 0,
        toolCalls: [
          makeToolCall({ toolName: "search", toolInput: { query: "foo" } }),
          makeToolCall({ toolName: "search", toolInput: { query: "foo" } }),
          makeToolCall({ toolName: "search", toolInput: { query: "foo" } }),
          makeToolCall({ toolName: "search", toolInput: { query: "foo" } }),
          makeToolCall({ toolName: "search", toolInput: { query: "foo" } }),
        ],
      }),
    ];

    const bundle = makeBundle([
      makeSession({
        sessionId: "repetitive-session",
        turns,
        systemPrompt: "Use the `search` tool.",
        toolSchemas: [{ name: "search", description: "Search" }],
      }),
    ]);

    const findings = detector.detect(bundle, config);

    const repetitiveFinding = findings.find(
      (f) => f.pathology === Pathology.ToolThrashing && f.title.includes("Repetitive"),
    );
    expect(repetitiveFinding).toBeDefined();
    expect(repetitiveFinding!.title).toContain("search");
  });

  it("detects tool oscillation patterns", () => {
    // Default oscillationMinCycles=3: A->B->A->B->A->B (3 cycles of pattern length 2)
    const turns = [
      makeTurn({
        turnIndex: 0,
        toolCalls: [
          makeToolCall({ toolName: "read_file", toolInput: { path: "a.ts" } }),
          makeToolCall({ toolName: "write_file", toolInput: { path: "a.ts" } }),
          makeToolCall({ toolName: "read_file", toolInput: { path: "a.ts" } }),
          makeToolCall({ toolName: "write_file", toolInput: { path: "a.ts" } }),
          makeToolCall({ toolName: "read_file", toolInput: { path: "a.ts" } }),
          makeToolCall({ toolName: "write_file", toolInput: { path: "a.ts" } }),
        ],
      }),
    ];

    const bundle = makeBundle([
      makeSession({
        sessionId: "oscillation-session",
        turns,
        systemPrompt: "Use `read_file` and `write_file`.",
        toolSchemas: [
          { name: "read_file", description: "Read" },
          { name: "write_file", description: "Write" },
        ],
      }),
    ]);

    const findings = detector.detect(bundle, config);

    const oscillationFinding = findings.find(
      (f) => f.pathology === Pathology.ToolThrashing && f.title.includes("oscillation"),
    );
    expect(oscillationFinding).toBeDefined();
    expect(oscillationFinding!.title).toContain("cycles");
  });

  it("detects high calls per turn", () => {
    // Default callsPerTurnWarning=8, so 10 calls in one turn should trigger
    const toolCalls = Array.from({ length: 10 }, (_, i) =>
      makeToolCall({ toolName: `tool_${i}`, toolInput: { id: i } }),
    );

    const turns = [makeTurn({ turnIndex: 0, toolCalls })];

    const bundle = makeBundle([
      makeSession({
        sessionId: "high-calls-session",
        turns,
        systemPrompt: "Test.",
        toolSchemas: [],
      }),
    ]);

    const findings = detector.detect(bundle, config);

    const highCallsFinding = findings.find(
      (f) => f.pathology === Pathology.ToolThrashing && f.title.includes("High tool call count"),
    );
    expect(highCallsFinding).toBeDefined();
    expect(highCallsFinding!.severity).toBe(Severity.Warning);
    expect(highCallsFinding!.title).toContain("10");
  });

  it("returns no findings for healthy usage", () => {
    // Few diverse tool calls, well under all thresholds
    const turns = [
      makeTurn({
        turnIndex: 0,
        toolCalls: [
          makeToolCall({ toolName: "search", toolInput: { query: "alpha" } }),
          makeToolCall({ toolName: "read_file", toolInput: { path: "a.ts" } }),
        ],
      }),
      makeTurn({
        turnIndex: 1,
        toolCalls: [
          makeToolCall({ toolName: "write_file", toolInput: { path: "b.ts", content: "x" } }),
        ],
      }),
      makeTurn({
        turnIndex: 2,
        toolCalls: [
          makeToolCall({ toolName: "search", toolInput: { query: "beta" } }),
        ],
      }),
    ];

    const bundle = makeBundle([
      makeSession({
        sessionId: "healthy-session",
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
    expect(findings.length).toBe(0);
  });

  it("Critical for >= 5 repetitions", () => {
    // repetitionCritical=5: 5 same-tool same-input calls in window
    const turns = [
      makeTurn({
        turnIndex: 0,
        toolCalls: [
          makeToolCall({ toolName: "fetch", toolInput: { url: "http://example.com" } }),
          makeToolCall({ toolName: "fetch", toolInput: { url: "http://example.com" } }),
          makeToolCall({ toolName: "fetch", toolInput: { url: "http://example.com" } }),
          makeToolCall({ toolName: "fetch", toolInput: { url: "http://example.com" } }),
          makeToolCall({ toolName: "fetch", toolInput: { url: "http://example.com" } }),
        ],
      }),
    ];

    const bundle = makeBundle([
      makeSession({
        sessionId: "critical-rep-session",
        turns,
        systemPrompt: "Use `fetch`.",
        toolSchemas: [{ name: "fetch", description: "Fetch URL" }],
      }),
    ]);

    const findings = detector.detect(bundle, config);

    const repFinding = findings.find(
      (f) => f.pathology === Pathology.ToolThrashing && f.title.includes("Repetitive"),
    );
    expect(repFinding).toBeDefined();
    expect(repFinding!.severity).toBe(Severity.Critical);
  });

  it("Warning for 3-4 repetitions", () => {
    // repetitionWarning=3, repetitionCritical=5
    // 3 same-tool same-input + 2 different calls in a 5-call window
    const turns = [
      makeTurn({
        turnIndex: 0,
        toolCalls: [
          makeToolCall({ toolName: "search", toolInput: { query: "test" } }),
          makeToolCall({ toolName: "search", toolInput: { query: "test" } }),
          makeToolCall({ toolName: "search", toolInput: { query: "test" } }),
          makeToolCall({ toolName: "other_tool", toolInput: { x: 1 } }),
          makeToolCall({ toolName: "another_tool", toolInput: { y: 2 } }),
        ],
      }),
    ];

    const bundle = makeBundle([
      makeSession({
        sessionId: "warning-rep-session",
        turns,
        systemPrompt: "Use `search`.",
        toolSchemas: [{ name: "search", description: "Search" }],
      }),
    ]);

    const findings = detector.detect(bundle, config);

    const repFinding = findings.find(
      (f) => f.pathology === Pathology.ToolThrashing && f.title.includes("Repetitive"),
    );
    expect(repFinding).toBeDefined();
    expect(repFinding!.severity).toBe(Severity.Warning);
  });
});
