import { computeToolReliability } from "../../../src/scoring/tool-reliability.js";
import { makeDiagnosticResult, makeBundle, makeSession, makeTurn, makeToolCall } from "../../helpers.js";
import { ToolCallStatus } from "../../../src/models/canonical.js";

describe("computeToolReliability", () => {
  it("returns null when no tool calls", () => {
    const session = makeSession({
      turns: [
        makeTurn({ turnIndex: 0, toolCalls: [] }),
        makeTurn({ turnIndex: 1, toolCalls: [] }),
      ],
    });
    const bundle = makeBundle([session]);
    const diagnostics = makeDiagnosticResult([]);
    const result = computeToolReliability(bundle, diagnostics);
    expect(result).toBeNull();
  });

  it("scores high for all-success tools", () => {
    const turns = [];
    for (let i = 0; i < 10; i++) {
      turns.push(
        makeTurn({
          turnIndex: i,
          toolCalls: [
            makeToolCall({
              toolName: "search",
              status: ToolCallStatus.Success,
            }),
          ],
        }),
      );
    }

    const session = makeSession({ turns });
    const bundle = makeBundle([session]);
    const diagnostics = makeDiagnosticResult([]);
    const result = computeToolReliability(bundle, diagnostics);

    expect(result).not.toBeNull();
    expect(result!.score).toBeGreaterThanOrEqual(85);
    expect(result!.name).toBe("Tool Reliability");
  });

  it("scores low for high error rate", () => {
    const turns = [];
    for (let i = 0; i < 10; i++) {
      turns.push(
        makeTurn({
          turnIndex: i,
          toolCalls: [
            makeToolCall({
              toolName: "flaky_tool",
              status: ToolCallStatus.Error,
            }),
            makeToolCall({
              toolName: "flaky_tool",
              status: ToolCallStatus.Error,
            }),
            makeToolCall({
              toolName: "flaky_tool",
              status: ToolCallStatus.Error,
            }),
            makeToolCall({
              toolName: "flaky_tool",
              status: ToolCallStatus.Error,
            }),
            makeToolCall({
              toolName: "ok_tool",
              status: ToolCallStatus.Success,
            }),
          ],
        }),
      );
    }

    const session = makeSession({ turns });
    const bundle = makeBundle([session]);
    const diagnostics = makeDiagnosticResult([]);
    const result = computeToolReliability(bundle, diagnostics);

    expect(result).not.toBeNull();
    // 80% error rate, 5 calls per turn -> both success_rate and calls_per_turn bad
    expect(result!.score).toBeLessThan(50);
  });
});
