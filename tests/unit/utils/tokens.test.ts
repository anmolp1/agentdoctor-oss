import { estimateTokenCount } from "../../../src/utils/tokens.js";

describe("estimateTokenCount", () => {
  it("estimates approximately 4 chars per token", () => {
    // 20 chars => ceil(20 / 4) = 5 tokens
    expect(estimateTokenCount("abcdefghijklmnopqrst")).toBe(5);
  });

  it("rounds up for non-exact multiples", () => {
    // 5 chars => ceil(5 / 4) = 2 tokens
    expect(estimateTokenCount("hello")).toBe(2);
  });

  it("handles exact multiples of 4", () => {
    // 8 chars => ceil(8 / 4) = 2 tokens
    expect(estimateTokenCount("abcdefgh")).toBe(2);
  });

  it("returns 1 for empty string", () => {
    // Math.max(1, ceil(0 / 4)) = Math.max(1, 0) = 1
    expect(estimateTokenCount("")).toBe(1);
  });

  it("returns 1 for a single character", () => {
    // ceil(1 / 4) = 1
    expect(estimateTokenCount("a")).toBe(1);
  });

  it("handles longer text", () => {
    const text = "A".repeat(400);
    // 400 chars => ceil(400 / 4) = 100 tokens
    expect(estimateTokenCount(text)).toBe(100);
  });
});
