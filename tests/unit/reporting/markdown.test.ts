import { renderMarkdown } from "../../../src/reporting/markdown.js";
import { makeDiagnosticResult, makeFinding } from "../../helpers.js";
import { Severity, Pathology } from "../../../src/models/findings.js";

describe("renderMarkdown", () => {
  const healthScore = {
    overallScore: 75,
    overallGrade: "C" as const,
    layers: [],
    assessedLayers: 3,
    unassessedLayers: ["Recovery Robustness"],
    summary: "Test summary",
  };

  it("contains all 6 sections", () => {
    const diagnostics = makeDiagnosticResult([makeFinding({ severity: Severity.Warning })]);
    const md = renderMarkdown({
      diagnostics,
      healthScore,
      filesAnalyzed: ["file1.json"],
    });

    expect(md).toContain("## Executive Summary");
    expect(md).toContain("## Health Score Breakdown");
    expect(md).toContain("## Findings");
    expect(md).toContain("## What This Analysis Could Not Assess");
    expect(md).toContain("## Recommendations");
    expect(md).toContain("## Appendix");
  });

  it("displays score and grade", () => {
    const diagnostics = makeDiagnosticResult([]);
    const md = renderMarkdown({
      diagnostics,
      healthScore,
      filesAnalyzed: ["file1.json"],
    });

    expect(md).toContain("75/100");
    expect(md).toContain("(C)");
  });

  it("sorts findings by severity", () => {
    const diagnostics = makeDiagnosticResult([
      makeFinding({
        severity: Severity.Info,
        title: "Info finding",
        pathology: Pathology.SilentDegradation,
      }),
      makeFinding({
        severity: Severity.Critical,
        title: "Critical finding",
        pathology: Pathology.ContextErosion,
      }),
      makeFinding({
        severity: Severity.Warning,
        title: "Warning finding",
        pathology: Pathology.ToolThrashing,
      }),
    ]);

    const md = renderMarkdown({
      diagnostics,
      healthScore,
      filesAnalyzed: ["file1.json"],
    });

    const criticalPos = md.indexOf("Critical finding");
    const warningPos = md.indexOf("Warning finding");
    const infoPos = md.indexOf("Info finding");

    expect(criticalPos).toBeLessThan(warningPos);
    expect(warningPos).toBeLessThan(infoPos);
  });

  it("includes evidence blocks", () => {
    const diagnostics = makeDiagnosticResult([
      makeFinding({
        severity: Severity.Warning,
        evidence: [
          { description: "Token count grew from 2000 to 50000" },
          { description: "No pruning observed" },
        ],
      }),
    ]);

    const md = renderMarkdown({
      diagnostics,
      healthScore,
      filesAnalyzed: ["file1.json"],
    });

    expect(md).toContain("<details><summary>Evidence</summary>");
    expect(md).toContain("Token count grew from 2000 to 50000");
    expect(md).toContain("No pruning observed");
  });

  it("includes unassessed layers section", () => {
    const diagnostics = makeDiagnosticResult([]);
    const md = renderMarkdown({
      diagnostics,
      healthScore,
      filesAnalyzed: ["file1.json"],
    });

    expect(md).toContain("What This Analysis Could Not Assess");
    expect(md).toContain("Recovery Robustness");
    expect(md).toContain("Output Quality Baselines");
  });

  it("includes MLDeep Systems footer", () => {
    const diagnostics = makeDiagnosticResult([]);
    const md = renderMarkdown({
      diagnostics,
      healthScore,
      filesAnalyzed: ["file1.json"],
    });

    expect(md).toContain("MLDeep Systems");
    expect(md).toContain("mldeep.systems");
  });

  it("produces clean report with zero findings", () => {
    const diagnostics = makeDiagnosticResult([]);
    const md = renderMarkdown({
      diagnostics,
      healthScore,
      filesAnalyzed: ["file1.json"],
    });

    expect(md).toContain("No issues detected");
    expect(md).toContain("No recommendations");
    // Should not contain any severity badges
    expect(md).not.toContain("CRITICAL:");
    expect(md).not.toContain("WARNING:");
  });
});
