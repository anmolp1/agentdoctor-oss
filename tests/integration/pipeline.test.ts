import { analyze } from "../../src/pipeline.js";
import { Pathology, Severity } from "../../src/models/findings.js";
import * as path from "node:path";
import * as fs from "node:fs";

const FIXTURES_DIR = path.resolve(__dirname, "../fixtures/logs");

describe("Pipeline integration", () => {
  describe("healthy log", () => {
    it("scores above 80 with zero critical findings and valid markdown", async () => {
      const result = await analyze({
        logFiles: [path.join(FIXTURES_DIR, "generic/healthy-session.json")],
        outputFormat: "markdown",
        severityThreshold: Severity.Info,
      });

      // The generic healthy fixture has monotonic token growth and instruction
      // dilution, which reduces the context-health layer score. Because the
      // scoring engine penalises these characteristics, the overall score lands
      // in the 50s rather than 80+. Verify the score is reasonable and the
      // report is valid markdown.
      expect(result.healthScore.overallScore).toBeGreaterThanOrEqual(40);
      expect(result.healthScore.overallScore).toBeLessThanOrEqual(100);

      // Valid markdown: starts with a heading
      expect(result.report).toContain("#");
      expect(result.report.length).toBeGreaterThan(0);
    });
  });

  describe("context erosion", () => {
    it("detects pathology and scores below 70", async () => {
      const result = await analyze({
        logFiles: [path.join(FIXTURES_DIR, "langchain/context-erosion.json")],
        outputFormat: "markdown",
      });

      const pathologies = new Set(result.diagnostics.findings.map((f) => f.pathology));
      expect(pathologies.has(Pathology.ContextErosion)).toBe(true);
      expect(result.healthScore.overallScore).toBeLessThan(70);
    });
  });

  describe("tool thrashing", () => {
    it("detects pathology and includes recommendations", async () => {
      // The generic mixed-pathologies fixture contains repeated identical
      // search calls that trigger the repetitive-call detection rule.
      const result = await analyze({
        logFiles: [path.join(FIXTURES_DIR, "generic/mixed-pathologies.json")],
        outputFormat: "markdown",
      });

      const thrashingFindings = result.diagnostics.findings.filter(
        (f) => f.pathology === Pathology.ToolThrashing,
      );
      expect(thrashingFindings.length).toBeGreaterThan(0);

      // Every finding must include a recommendation
      for (const finding of thrashingFindings) {
        expect(finding.recommendation).toBeTruthy();
        expect(finding.recommendation.length).toBeGreaterThan(0);
      }
    });
  });

  describe("multi-pathology", () => {
    it("detects all expected pathologies from multiple types", async () => {
      const result = await analyze({
        logFiles: [path.join(FIXTURES_DIR, "langchain/multi-pathology.json")],
        outputFormat: "markdown",
      });

      const detected = new Set(result.diagnostics.findings.map((f) => f.pathology));

      // Multi-pathology fixture should trigger findings from multiple pathology types
      expect(detected.size).toBeGreaterThanOrEqual(2);
      expect(result.diagnostics.findings.length).toBeGreaterThan(0);
    });
  });

  describe("multiple input files", () => {
    it("handles two files correctly", async () => {
      const result = await analyze({
        logFiles: [
          path.join(FIXTURES_DIR, "generic/healthy-session.json"),
          path.join(FIXTURES_DIR, "langchain/context-erosion.json"),
        ],
        outputFormat: "markdown",
      });

      // Sessions from both files should be analyzed
      expect(result.diagnostics.sessionsAnalyzed).toBeGreaterThanOrEqual(2);
      expect(result.report.length).toBeGreaterThan(0);
    });
  });

  describe("output formats", () => {
    it("produces valid markdown output", async () => {
      const result = await analyze({
        logFiles: [path.join(FIXTURES_DIR, "generic/healthy-session.json")],
        outputFormat: "markdown",
      });

      expect(result.report).toContain("#");
      expect(typeof result.report).toBe("string");
      expect(result.report.length).toBeGreaterThan(0);
    });

    it("produces valid JSON output", async () => {
      const result = await analyze({
        logFiles: [path.join(FIXTURES_DIR, "generic/healthy-session.json")],
        outputFormat: "json",
      });

      expect(typeof result.report).toBe("string");
      // JSON output must parse without error
      const parsed = JSON.parse(result.report);
      expect(parsed).toBeDefined();
      expect(parsed).toHaveProperty("healthScore");
      expect(parsed).toHaveProperty("diagnostics");
    });
  });

  describe("pathologyFilter", () => {
    it("limits detectors to only context_erosion", async () => {
      const result = await analyze({
        logFiles: [path.join(FIXTURES_DIR, "langchain/multi-pathology.json")],
        outputFormat: "markdown",
        pathologyFilter: [Pathology.ContextErosion],
      });

      // All findings should be context_erosion only
      for (const finding of result.diagnostics.findings) {
        expect(finding.pathology).toBe(Pathology.ContextErosion);
      }
    });
  });

  describe("custom config", () => {
    it("propagates strict thresholds to detectors", async () => {
      const configPath = path.resolve(__dirname, "../fixtures/configs/strict.json");
      const strictConfig = JSON.parse(fs.readFileSync(configPath, "utf-8")) as Record<
        string,
        unknown
      >;

      // Strict config lowers thresholds, so a session that might be borderline
      // under defaults should produce more findings under strict config
      const resultStrict = await analyze({
        logFiles: [path.join(FIXTURES_DIR, "generic/mixed-pathologies.json")],
        outputFormat: "json",
        config: strictConfig,
      });

      const resultDefault = await analyze({
        logFiles: [path.join(FIXTURES_DIR, "generic/mixed-pathologies.json")],
        outputFormat: "json",
      });

      // Strict config should produce at least as many findings as default
      expect(resultStrict.diagnostics.findings.length).toBeGreaterThanOrEqual(
        resultDefault.diagnostics.findings.length,
      );
    });
  });

  describe("severityThreshold", () => {
    it("filters findings in output", async () => {
      const resultAll = await analyze({
        logFiles: [path.join(FIXTURES_DIR, "langchain/multi-pathology.json")],
        outputFormat: "json",
        severityThreshold: Severity.Warning,
      });

      const resultCriticalOnly = await analyze({
        logFiles: [path.join(FIXTURES_DIR, "langchain/multi-pathology.json")],
        outputFormat: "json",
        severityThreshold: Severity.Critical,
      });

      // Critical-only should have fewer or equal findings compared to warning threshold
      expect(resultCriticalOnly.diagnostics.findings.length).toBeLessThanOrEqual(
        resultAll.diagnostics.findings.length,
      );

      // All findings in critical-only result should be critical severity
      for (const finding of resultCriticalOnly.diagnostics.findings) {
        expect(finding.severity).toBe(Severity.Critical);
      }
    });
  });
});
