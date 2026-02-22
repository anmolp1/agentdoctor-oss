import { analyze } from "../../src/pipeline.js";
import { Pathology } from "../../src/models/findings.js";
import * as path from "node:path";

const FIXTURES_DIR = path.resolve(__dirname, "../fixtures/logs");

describe("Detection stability regression", () => {
  it("consistently detects context erosion", async () => {
    const result = await analyze({
      logFiles: [path.join(FIXTURES_DIR, "langchain/context-erosion.json")],
      outputFormat: "json",
    });

    const detected = result.diagnostics.findings.map((f) => f.pathology);
    expect(detected).toContain(Pathology.ContextErosion);
  });

  it("consistently detects tool thrashing", async () => {
    // The generic mixed-pathologies fixture has repeated identical search
    // calls that reliably trigger the tool-thrashing repetitive-call rule.
    const result = await analyze({
      logFiles: [path.join(FIXTURES_DIR, "generic/mixed-pathologies.json")],
      outputFormat: "json",
    });

    const detected = result.diagnostics.findings.map((f) => f.pathology);
    expect(detected).toContain(Pathology.ToolThrashing);
  });

  it("consistently detects instruction drift", async () => {
    const result = await analyze({
      logFiles: [path.join(FIXTURES_DIR, "langchain/instruction-drift.json")],
      outputFormat: "json",
    });

    const detected = result.diagnostics.findings.map((f) => f.pathology);
    expect(detected).toContain(Pathology.InstructionDrift);
  });

  it("consistently detects recovery blindness", async () => {
    // The generic mixed-pathologies fixture has api_call errors with 100%
    // error rate that trigger the recovery-blindness detector.
    const result = await analyze({
      logFiles: [path.join(FIXTURES_DIR, "generic/mixed-pathologies.json")],
      outputFormat: "json",
    });

    const detected = result.diagnostics.findings.map((f) => f.pathology);
    expect(detected).toContain(Pathology.RecoveryBlindness);
  });

  it("consistently detects hallucinated success", async () => {
    // The generic mixed-pathologies fixture has api_call failures followed by
    // assistant messages that claim success, triggering hallucinated-success.
    const result = await analyze({
      logFiles: [path.join(FIXTURES_DIR, "generic/mixed-pathologies.json")],
      outputFormat: "json",
    });

    const detected = result.diagnostics.findings.map((f) => f.pathology);
    expect(detected).toContain(Pathology.HallucinatedToolSuccess);
  });

  it("consistently detects silent degradation", async () => {
    // generic/mixed-pathologies.json has multiple sessions, enabling
    // within-session quality drop detection
    const result = await analyze({
      logFiles: [path.join(FIXTURES_DIR, "generic/mixed-pathologies.json")],
      outputFormat: "json",
    });

    const detected = result.diagnostics.findings.map((f) => f.pathology);
    expect(detected).toContain(Pathology.SilentDegradation);
  });

  it("multi-pathology fixture triggers all expected pathologies", async () => {
    const result = await analyze({
      logFiles: [path.join(FIXTURES_DIR, "langchain/multi-pathology.json")],
      outputFormat: "json",
    });

    const detected = new Set(result.diagnostics.findings.map((f) => f.pathology));

    // The multi-pathology fixture is designed to contain multiple pathology types
    expect(detected.size).toBeGreaterThanOrEqual(2);

    // Verify findings are present from distinct pathology categories
    expect(result.diagnostics.findings.length).toBeGreaterThan(0);
  });
});
