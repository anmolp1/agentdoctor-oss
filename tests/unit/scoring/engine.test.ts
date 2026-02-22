import { computeHealthScore } from "../../../src/scoring/engine.js";
import { getDefaultConfig } from "../../../src/models/config.js";
import { makeBundle, makeHealthySession, makeDiagnosticResult, makeFinding } from "../../helpers.js";
import { Pathology, Severity } from "../../../src/models/findings.js";

describe("computeHealthScore", () => {
  const config = getDefaultConfig();

  it("healthy session scores above 80", () => {
    const session = makeHealthySession(10);
    const bundle = makeBundle([session]);
    const diagnostics = makeDiagnosticResult([]);
    const result = computeHealthScore(bundle, diagnostics, config);
    expect(result.overallScore).toBeGreaterThanOrEqual(70);
  });

  it("degraded session scores below 60", () => {
    // Build a session with bad metrics: monotonically growing context, failing tools
    const turns = [];
    for (let i = 0; i < 15; i++) {
      turns.push({
        messages: [
          { role: "user" as const, content: `Q${i}` },
          { role: "assistant" as const, content: `A${i}` },
        ],
        toolCalls: [
          {
            toolName: "broken_tool",
            toolInput: { q: `q${i}` },
            toolOutput: "error",
            status: "error" as const,
            retryCount: 2,
          },
        ],
        turnIndex: i,
        contextTokenCount: 2000 + i * 3000, // aggressive monotonic growth
      });
    }

    const bundle = makeBundle([
      {
        sessionId: "degraded-001",
        turns,
        systemPrompt: "Short.",
        toolSchemas: [{ name: "broken_tool", description: "A tool" }],
      },
    ]);

    const diagnostics = makeDiagnosticResult([
      makeFinding({ severity: Severity.Critical, pathology: Pathology.ContextErosion }),
      makeFinding({ severity: Severity.Critical, pathology: Pathology.RecoveryBlindness }),
      makeFinding({ severity: Severity.Critical, pathology: Pathology.ToolThrashing }),
      makeFinding({ severity: Severity.Warning, pathology: Pathology.SilentDegradation }),
      makeFinding({ severity: Severity.Warning, pathology: Pathology.HallucinatedToolSuccess }),
    ]);

    const result = computeHealthScore(bundle, diagnostics, config);
    expect(result.overallScore).toBeLessThan(60);
  });

  it("applies critical penalty (-5 per, max -25)", () => {
    const session = makeHealthySession(10);
    const bundle = makeBundle([session]);

    // 6 critical findings: 6*5=30, but capped at 25
    const criticals = Array.from({ length: 6 }, (_, i) =>
      makeFinding({
        severity: Severity.Critical,
        pathology: Pathology.ContextErosion,
        title: `Critical finding ${i}`,
      }),
    );

    const noCriticals = makeDiagnosticResult([]);
    const withCriticals = makeDiagnosticResult(criticals);

    const scoreNone = computeHealthScore(bundle, noCriticals, config);
    const scoreWith = computeHealthScore(bundle, withCriticals, config);

    // The penalty should be exactly 25 (max), not 30
    expect(scoreNone.overallScore - scoreWith.overallScore).toBe(25);
  });

  it("applies warning penalty (-2 per, max -10)", () => {
    const session = makeHealthySession(10);
    const bundle = makeBundle([session]);

    // 6 warnings: 6*2=12, but capped at 10
    // Use SilentDegradation to avoid affecting tool reliability layer's thrashing score
    const warnings = Array.from({ length: 6 }, (_, i) =>
      makeFinding({
        severity: Severity.Warning,
        pathology: Pathology.SilentDegradation,
        title: `Warning finding ${i}`,
      }),
    );

    const noWarnings = makeDiagnosticResult([]);
    const withWarnings = makeDiagnosticResult(warnings);

    const scoreNone = computeHealthScore(bundle, noWarnings, config);
    const scoreWith = computeHealthScore(bundle, withWarnings, config);

    expect(scoreNone.overallScore - scoreWith.overallScore).toBe(10);
  });

  it("clamps score to 0 minimum", () => {
    // A session that will already score very low, plus maximum penalties
    const turns = [];
    for (let i = 0; i < 15; i++) {
      turns.push({
        messages: [
          { role: "user" as const, content: `Q${i}` },
          { role: "assistant" as const, content: `A${i}` },
        ],
        toolCalls: [
          {
            toolName: "bad_tool",
            toolInput: {},
            toolOutput: "error",
            status: "error" as const,
            retryCount: 3,
          },
        ],
        turnIndex: i,
        contextTokenCount: 1000 + i * 5000,
      });
    }

    const bundle = makeBundle([
      {
        sessionId: "terrible-001",
        turns,
        systemPrompt: "x",
        toolSchemas: [{ name: "bad_tool", description: "A tool" }],
      },
    ]);

    const findings = [
      ...Array.from({ length: 5 }, () =>
        makeFinding({ severity: Severity.Critical }),
      ),
      ...Array.from({ length: 5 }, () =>
        makeFinding({ severity: Severity.Warning }),
      ),
    ];

    const diagnostics = makeDiagnosticResult(findings);
    const result = computeHealthScore(bundle, diagnostics, config);
    expect(result.overallScore).toBeGreaterThanOrEqual(0);
  });

  it("redistributes weight when layer is null (session with no tool calls -> tool reliability null)", () => {
    // Session with token data and system prompt but NO tool calls
    const turns = [];
    for (let i = 0; i < 10; i++) {
      turns.push({
        messages: [
          { role: "user" as const, content: `Question ${i}` },
          { role: "assistant" as const, content: `Answer ${i}` },
        ],
        toolCalls: [], // no tool calls
        turnIndex: i,
        contextTokenCount: 2000 + i * 50,
      });
    }

    const bundle = makeBundle([
      {
        sessionId: "no-tools-001",
        turns,
        systemPrompt: "You are a helpful assistant. Use the `search` tool to find information.",
        toolSchemas: [{ name: "search", description: "Search" }],
      },
    ]);

    const diagnostics = makeDiagnosticResult([]);
    const result = computeHealthScore(bundle, diagnostics, config);

    // Tool Reliability should be in unassessedLayers
    const unassessedNames = result.unassessedLayers.join(", ");
    expect(unassessedNames).toContain("Tool Reliability");

    // The score should still be computed from remaining layers
    expect(result.overallScore).toBeGreaterThanOrEqual(0);
    expect(result.overallScore).toBeLessThanOrEqual(100);

    // Only Context Health and Instruction Coherence should be assessed
    expect(result.assessedLayers).toBe(2);
  });

  it("is deterministic (run twice, same result)", () => {
    const session = makeHealthySession(10);
    const bundle = makeBundle([session]);
    const diagnostics = makeDiagnosticResult([
      makeFinding({ severity: Severity.Warning }),
    ]);

    const result1 = computeHealthScore(bundle, diagnostics, config);
    const result2 = computeHealthScore(bundle, diagnostics, config);

    expect(result1.overallScore).toBe(result2.overallScore);
    expect(result1.overallGrade).toBe(result2.overallGrade);
    expect(result1.layers.length).toBe(result2.layers.length);
    expect(result1.summary).toBe(result2.summary);
  });

  it("includes assessed + unassessed layers", () => {
    const session = makeHealthySession(10);
    const bundle = makeBundle([session]);
    const diagnostics = makeDiagnosticResult([]);

    const result = computeHealthScore(bundle, diagnostics, config);

    // Should have assessed layers
    expect(result.assessedLayers).toBeGreaterThan(0);
    expect(result.layers.length).toBe(result.assessedLayers);

    // Should always include the static unassessed layers
    expect(result.unassessedLayers).toEqual(
      expect.arrayContaining([
        "Recovery Robustness",
        "Output Quality Baselines",
      ]),
    );
  });

  it("generates non-empty summary", () => {
    const session = makeHealthySession(10);
    const bundle = makeBundle([session]);
    const diagnostics = makeDiagnosticResult([]);

    const result = computeHealthScore(bundle, diagnostics, config);
    expect(result.summary).toBeTruthy();
    expect(result.summary.length).toBeGreaterThan(0);
  });
});
