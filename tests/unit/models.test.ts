import { gradeFromScore } from "../../src/models/scores.js";
import { criticalCount, warningCount, pathologiesDetected, Pathology, Severity } from "../../src/models/findings.js";
import { totalTurns, totalToolCalls, totalMessages } from "../../src/models/canonical.js";
import { makeFinding, makeDiagnosticResult, makeSession, makeTurn, makeToolCall, makeMessage } from "../helpers.js";
import { Role, ToolCallStatus } from "../../src/models/canonical.js";

// ---------------------------------------------------------------------------
// gradeFromScore
// ---------------------------------------------------------------------------
describe("gradeFromScore", () => {
  it("returns A for score >= 90", () => {
    expect(gradeFromScore(90)).toBe("A");
    expect(gradeFromScore(95)).toBe("A");
    expect(gradeFromScore(100)).toBe("A");
  });

  it("returns B for score >= 80 and < 90", () => {
    expect(gradeFromScore(80)).toBe("B");
    expect(gradeFromScore(89)).toBe("B");
  });

  it("returns C for score >= 70 and < 80", () => {
    expect(gradeFromScore(70)).toBe("C");
    expect(gradeFromScore(79)).toBe("C");
  });

  it("returns D for score >= 60 and < 70", () => {
    expect(gradeFromScore(60)).toBe("D");
    expect(gradeFromScore(69)).toBe("D");
  });

  it("returns F for score < 60", () => {
    expect(gradeFromScore(59)).toBe("F");
    expect(gradeFromScore(50)).toBe("F");
    expect(gradeFromScore(1)).toBe("F");
  });

  it("handles boundary value 0", () => {
    expect(gradeFromScore(0)).toBe("F");
  });

  it("handles boundary value 100", () => {
    expect(gradeFromScore(100)).toBe("A");
  });
});

// ---------------------------------------------------------------------------
// criticalCount / warningCount
// ---------------------------------------------------------------------------
describe("criticalCount", () => {
  it("counts critical findings in a mixed-severity set", () => {
    const result = makeDiagnosticResult([
      makeFinding({ severity: Severity.Critical, pathology: Pathology.ContextErosion }),
      makeFinding({ severity: Severity.Warning, pathology: Pathology.ToolThrashing }),
      makeFinding({ severity: Severity.Critical, pathology: Pathology.RecoveryBlindness }),
      makeFinding({ severity: Severity.Info }),
    ]);
    expect(criticalCount(result)).toBe(2);
  });

  it("returns 0 for empty findings", () => {
    const result = makeDiagnosticResult([]);
    expect(criticalCount(result)).toBe(0);
  });
});

describe("warningCount", () => {
  it("counts warning findings in a mixed-severity set", () => {
    const result = makeDiagnosticResult([
      makeFinding({ severity: Severity.Critical }),
      makeFinding({ severity: Severity.Warning }),
      makeFinding({ severity: Severity.Warning }),
      makeFinding({ severity: Severity.Info }),
    ]);
    expect(warningCount(result)).toBe(2);
  });

  it("returns 0 for empty findings", () => {
    const result = makeDiagnosticResult([]);
    expect(warningCount(result)).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// pathologiesDetected
// ---------------------------------------------------------------------------
describe("pathologiesDetected", () => {
  it("returns unique set of pathologies (deduplicates)", () => {
    const result = makeDiagnosticResult([
      makeFinding({ pathology: Pathology.ContextErosion }),
      makeFinding({ pathology: Pathology.ToolThrashing }),
      makeFinding({ pathology: Pathology.ContextErosion }),
      makeFinding({ pathology: Pathology.InstructionDrift }),
    ]);
    const detected = pathologiesDetected(result);
    expect(detected.size).toBe(3);
    expect(detected.has(Pathology.ContextErosion)).toBe(true);
    expect(detected.has(Pathology.ToolThrashing)).toBe(true);
    expect(detected.has(Pathology.InstructionDrift)).toBe(true);
  });

  it("returns empty set for no findings", () => {
    const result = makeDiagnosticResult([]);
    const detected = pathologiesDetected(result);
    expect(detected.size).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// totalTurns / totalToolCalls / totalMessages
// ---------------------------------------------------------------------------
describe("totalTurns", () => {
  it("counts turns in a session", () => {
    const session = makeSession({
      turns: [
        makeTurn({ turnIndex: 0 }),
        makeTurn({ turnIndex: 1 }),
        makeTurn({ turnIndex: 2 }),
      ],
    });
    expect(totalTurns(session)).toBe(3);
  });

  it("returns 0 for session with no turns", () => {
    const session = makeSession({ turns: [] });
    expect(totalTurns(session)).toBe(0);
  });
});

describe("totalToolCalls", () => {
  it("sums tool calls across all turns", () => {
    const session = makeSession({
      turns: [
        makeTurn({
          turnIndex: 0,
          toolCalls: [makeToolCall({ toolName: "a" }), makeToolCall({ toolName: "b" })],
        }),
        makeTurn({
          turnIndex: 1,
          toolCalls: [makeToolCall({ toolName: "c" })],
        }),
        makeTurn({
          turnIndex: 2,
          toolCalls: [],
        }),
      ],
    });
    expect(totalToolCalls(session)).toBe(3);
  });

  it("returns 0 when no turns have tool calls", () => {
    const session = makeSession({
      turns: [makeTurn({ toolCalls: [] }), makeTurn({ toolCalls: [] })],
    });
    expect(totalToolCalls(session)).toBe(0);
  });
});

describe("totalMessages", () => {
  it("sums messages across all turns", () => {
    const session = makeSession({
      turns: [
        makeTurn({
          turnIndex: 0,
          messages: [
            makeMessage({ role: Role.User, content: "Hi" }),
            makeMessage({ role: Role.Assistant, content: "Hello" }),
          ],
        }),
        makeTurn({
          turnIndex: 1,
          messages: [
            makeMessage({ role: Role.User, content: "Question" }),
            makeMessage({ role: Role.Assistant, content: "Answer" }),
            makeMessage({ role: Role.Tool, content: "Result" }),
          ],
        }),
      ],
    });
    expect(totalMessages(session)).toBe(5);
  });

  it("returns 0 for session with no turns", () => {
    const session = makeSession({ turns: [] });
    expect(totalMessages(session)).toBe(0);
  });
});
