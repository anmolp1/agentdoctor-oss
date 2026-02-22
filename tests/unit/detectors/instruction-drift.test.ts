import { InstructionDriftDetector } from "../../../src/detectors/instruction-drift.js";
import { getDefaultConfig } from "../../../src/models/config.js";
import { makeSession, makeBundle, makeTurn } from "../../helpers.js";
import { Pathology, Severity } from "../../../src/models/findings.js";

describe("InstructionDriftDetector", () => {
  const detector = new InstructionDriftDetector();
  const config = getDefaultConfig();

  it("detects phantom tools (referenced in prompt but not in schemas)", () => {
    // System prompt references `search` and `execute_code` but only `search` is in schemas
    const bundle = makeBundle([
      makeSession({
        sessionId: "phantom-session",
        turns: [makeTurn({ turnIndex: 0 })],
        systemPrompt:
          "You are a helpful assistant. Use the `search` tool to find information and `execute_code` to run code.",
        toolSchemas: [{ name: "search", description: "Search the web" }],
      }),
    ]);

    const findings = detector.detect(bundle, config);

    const phantomFinding = findings.find(
      (f) => f.pathology === Pathology.InstructionDrift && f.title.includes("Phantom"),
    );
    expect(phantomFinding).toBeDefined();
    expect(phantomFinding!.severity).toBe(Severity.Critical);
    expect(phantomFinding!.title).toContain("execute_code");
  });

  it("detects orphaned tools (in schemas but not in prompt)", () => {
    // System prompt only references `search` but schemas include `search` and `calculator`
    const bundle = makeBundle([
      makeSession({
        sessionId: "orphan-session",
        turns: [makeTurn({ turnIndex: 0 })],
        systemPrompt: "You are a helpful assistant. Use the `search` tool to find information.",
        toolSchemas: [
          { name: "search", description: "Search the web" },
          { name: "calculator", description: "Perform calculations" },
        ],
      }),
    ]);

    const findings = detector.detect(bundle, config);

    const orphanFinding = findings.find(
      (f) => f.pathology === Pathology.InstructionDrift && f.title.includes("Orphaned"),
    );
    expect(orphanFinding).toBeDefined();
    expect(orphanFinding!.severity).toBe(Severity.Warning);
    expect(orphanFinding!.title).toContain("calculator");
  });

  it("returns Info for missing system prompt", () => {
    const bundle = makeBundle([
      makeSession({
        sessionId: "no-prompt-session",
        turns: [makeTurn({ turnIndex: 0 })],
        systemPrompt: undefined,
        toolSchemas: [{ name: "search", description: "Search" }],
      }),
    ]);

    const findings = detector.detect(bundle, config);

    expect(findings.length).toBe(1);
    expect(findings[0]!.severity).toBe(Severity.Info);
    expect(findings[0]!.title).toContain("No system prompt");
  });

  it("returns no findings when prompt and schemas are aligned", () => {
    const bundle = makeBundle([
      makeSession({
        sessionId: "aligned-session",
        turns: [makeTurn({ turnIndex: 0 })],
        systemPrompt:
          "You are a helpful assistant. You have access to `search` and `read_file` tools.",
        toolSchemas: [
          { name: "search", description: "Search" },
          { name: "read_file", description: "Read files" },
        ],
      }),
    ]);

    const findings = detector.detect(bundle, config);
    expect(findings.length).toBe(0);
  });
});
