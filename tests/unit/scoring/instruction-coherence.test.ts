import { computeInstructionCoherence } from "../../../src/scoring/instruction-coherence.js";
import { makeDiagnosticResult, makeBundle, makeSession, makeFinding } from "../../helpers.js";
import { Pathology, Severity } from "../../../src/models/findings.js";

describe("computeInstructionCoherence", () => {
  it("scores 100 for aligned instructions, no drift findings", () => {
    const session = makeSession({
      systemPrompt: "You are a helpful assistant. Use the `test_tool` to help users.",
      toolSchemas: [{ name: "test_tool", description: "A test tool" }],
    });
    const bundle = makeBundle([session]);
    const diagnostics = makeDiagnosticResult([]);
    const result = computeInstructionCoherence(bundle, diagnostics);

    expect(result.score).toBe(100);
    expect(result.name).toBe("Instruction Coherence");
    expect(result.flags).toHaveLength(0);
  });

  it("scores lower when phantom tools detected", () => {
    const session = makeSession({
      systemPrompt: "You are a helpful assistant.",
      toolSchemas: [{ name: "real_tool", description: "A real tool" }],
    });
    const bundle = makeBundle([session]);

    const diagnostics = makeDiagnosticResult([
      makeFinding({
        pathology: Pathology.InstructionDrift,
        severity: Severity.Warning,
        title: "Phantom tool referenced in system prompt",
        description: "System prompt references a tool that does not exist in schemas.",
      }),
      makeFinding({
        pathology: Pathology.InstructionDrift,
        severity: Severity.Warning,
        title: "Phantom tool referenced by agent",
        description: "Agent attempted to call a non-existent tool.",
      }),
    ]);

    const result = computeInstructionCoherence(bundle, diagnostics);

    // 2 phantom findings: alignmentIssues = 2*2 = 4, alignmentScore = max(0, 100 - 4*25) = 0
    // consistencyScore = 100, promptScore = 100
    // weighted = 0*0.5 + 100*0.3 + 100*0.2 = 50
    expect(result.score).toBeLessThan(100);
    expect(result.score).toBeLessThanOrEqual(50);
    expect(result.flags.length).toBeGreaterThan(0);
  });
});
