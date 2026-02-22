import { renderJson } from "../../../src/reporting/json-report.js";
import { makeDiagnosticResult, makeFinding } from "../../helpers.js";

describe("renderJson", () => {
  const healthScore = {
    overallScore: 75,
    overallGrade: "C" as const,
    layers: [],
    assessedLayers: 3,
    unassessedLayers: ["Recovery Robustness"],
    summary: "Test summary",
  };

  it("output is valid JSON", () => {
    const diagnostics = makeDiagnosticResult([]);
    const output = renderJson({
      diagnostics,
      healthScore,
      filesAnalyzed: ["file1.json"],
    });

    expect(() => JSON.parse(output)).not.toThrow();
  });

  it("contains diagnostics, healthScore, and metadata", () => {
    const diagnostics = makeDiagnosticResult([]);
    const output = renderJson({
      diagnostics,
      healthScore,
      filesAnalyzed: ["file1.json"],
    });

    const parsed = JSON.parse(output);

    expect(parsed).toHaveProperty("diagnostics");
    expect(parsed).toHaveProperty("healthScore");
    expect(parsed).toHaveProperty("version");
    expect(parsed).toHaveProperty("generatedBy");
    expect(parsed).toHaveProperty("generatedAt");
    expect(parsed).toHaveProperty("filesAnalyzed");

    expect(parsed.healthScore.overallScore).toBe(75);
    expect(parsed.healthScore.overallGrade).toBe("C");
    expect(parsed.healthScore.summary).toBe("Test summary");

    expect(parsed.diagnostics.sessionsAnalyzed).toBe(1);
    expect(parsed.diagnostics.turnsAnalyzed).toBe(10);
    expect(parsed.diagnostics.toolCallsAnalyzed).toBe(10);
  });

  it("findings match DiagnosticResult structure", () => {
    const findings = [
      makeFinding({ title: "Finding A", confidence: 0.9 }),
      makeFinding({ title: "Finding B", confidence: 0.7 }),
    ];
    const diagnostics = makeDiagnosticResult(findings);
    const output = renderJson({
      diagnostics,
      healthScore,
      filesAnalyzed: ["file1.json"],
    });

    const parsed = JSON.parse(output);

    expect(parsed.diagnostics.findings).toHaveLength(2);
    expect(parsed.diagnostics.findings[0].title).toBe("Finding A");
    expect(parsed.diagnostics.findings[0].confidence).toBe(0.9);
    expect(parsed.diagnostics.findings[1].title).toBe("Finding B");
    expect(parsed.diagnostics.findings[1].confidence).toBe(0.7);

    // Verify finding structure matches canonical shape
    for (const finding of parsed.diagnostics.findings) {
      expect(finding).toHaveProperty("pathology");
      expect(finding).toHaveProperty("severity");
      expect(finding).toHaveProperty("title");
      expect(finding).toHaveProperty("description");
      expect(finding).toHaveProperty("evidence");
      expect(finding).toHaveProperty("recommendation");
      expect(finding).toHaveProperty("affectedSessions");
      expect(finding).toHaveProperty("confidence");
    }
  });
});
