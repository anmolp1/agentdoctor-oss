import { computeContextHealth } from "../../../src/scoring/context-health.js";
import { getDefaultConfig } from "../../../src/models/config.js";
import { makeBundle, makeSession, makeTurn } from "../../helpers.js";

describe("computeContextHealth", () => {
  const config = getDefaultConfig();

  it("returns null when no token data", () => {
    // Turns without contextTokenCount
    const session = makeSession({
      turns: [
        makeTurn({ turnIndex: 0 }),
        makeTurn({ turnIndex: 1 }),
        makeTurn({ turnIndex: 2 }),
      ],
    });
    const bundle = makeBundle([session]);
    const result = computeContextHealth(bundle, config);
    expect(result).toBeNull();
  });

  it("scores high for well-managed context", () => {
    // Context that plateaus and has good instruction share
    const turns = [];
    for (let i = 0; i < 12; i++) {
      // Context grows very slowly and drops periodically (pruning)
      let tokens = 2000 + i * 15;
      if (i % 3 === 2) tokens -= 80; // aggressive periodic pruning breaks monotonicity
      turns.push(
        makeTurn({
          turnIndex: i,
          contextTokenCount: tokens,
        }),
      );
    }

    // Long system prompt to ensure high instruction share (>15% of context)
    const session = makeSession({
      turns,
      systemPrompt: "You are a helpful assistant that helps users with many different tasks across domains. ".repeat(25),
    });
    const bundle = makeBundle([session]);
    const result = computeContextHealth(bundle, config);

    expect(result).not.toBeNull();
    expect(result!.score).toBeGreaterThanOrEqual(70);
    expect(result!.name).toBe("Context Health");
  });

  it("scores low for monotonic growth", () => {
    // Context that grows aggressively without any management
    const turns = [];
    for (let i = 0; i < 15; i++) {
      turns.push(
        makeTurn({
          turnIndex: i,
          contextTokenCount: 2000 + i * 3000, // aggressive growth ~3000 tokens per turn
        }),
      );
    }

    const session = makeSession({
      turns,
      systemPrompt: "Short.", // very short system prompt -> low instruction share
    });
    const bundle = makeBundle([session]);
    const result = computeContextHealth(bundle, config);

    expect(result).not.toBeNull();
    expect(result!.score).toBeLessThan(50);
  });
});
