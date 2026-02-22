import {
  isMonotonic,
  monotonicIncreasingRatio,
  trendDirection,
  average,
  linearScore,
} from "../../../src/utils/statistics.js";

// ---------------------------------------------------------------------------
// monotonicIncreasingRatio
// ---------------------------------------------------------------------------
describe("monotonicIncreasingRatio", () => {
  it("returns 1.0 for a strictly increasing sequence", () => {
    expect(monotonicIncreasingRatio([1, 2, 3, 4, 5])).toBe(1.0);
  });

  it("returns 0 for a strictly decreasing sequence", () => {
    expect(monotonicIncreasingRatio([5, 4, 3, 2, 1])).toBe(0);
  });

  it("returns 0 for a sequence with fewer than 2 elements", () => {
    expect(monotonicIncreasingRatio([])).toBe(0);
    expect(monotonicIncreasingRatio([42])).toBe(0);
  });

  it("computes correct ratio for mixed sequence", () => {
    // pairs: (1,3) inc, (3,2) not, (2,5) inc, (5,4) not => 2/4 = 0.5
    expect(monotonicIncreasingRatio([1, 3, 2, 5, 4])).toBe(0.5);
  });
});

// ---------------------------------------------------------------------------
// isMonotonic
// ---------------------------------------------------------------------------
describe("isMonotonic", () => {
  it("detects a fully increasing sequence at threshold 1.0", () => {
    expect(isMonotonic([1, 2, 3, 4, 5], 1.0)).toBe(true);
  });

  it("rejects a non-increasing sequence at threshold 1.0", () => {
    expect(isMonotonic([1, 3, 2, 4, 5], 1.0)).toBe(false);
  });

  it("accepts a mostly increasing sequence when threshold is relaxed", () => {
    // pairs: (1,3) inc, (3,2) not, (2,4) inc, (4,5) inc => 3/4 = 0.75
    expect(isMonotonic([1, 3, 2, 4, 5], 0.7)).toBe(true);
  });

  it("respects tolerance threshold precisely", () => {
    // ratio = 0.75 exactly
    expect(isMonotonic([1, 3, 2, 4, 5], 0.75)).toBe(true);
    expect(isMonotonic([1, 3, 2, 4, 5], 0.76)).toBe(false);
  });

  it("returns false for empty or single-element sequences (ratio is 0)", () => {
    expect(isMonotonic([], 0.5)).toBe(false);
    expect(isMonotonic([1], 0.5)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// trendDirection
// ---------------------------------------------------------------------------
describe("trendDirection", () => {
  it("classifies a strongly increasing sequence as increasing", () => {
    expect(trendDirection([1, 2, 3, 4, 5])).toBe("increasing");
  });

  it("classifies a strongly decreasing sequence as decreasing", () => {
    expect(trendDirection([5, 4, 3, 2, 1])).toBe("decreasing");
  });

  it("classifies a flat sequence as stable", () => {
    expect(trendDirection([3, 3, 3, 3])).toBe("stable");
  });

  it("classifies a mixed sequence as stable when no clear trend", () => {
    // pairs: (1,2) inc, (2,1) dec, (1,2) inc, (2,1) dec => inc ratio 0.5, dec ratio 0.5
    expect(trendDirection([1, 2, 1, 2, 1])).toBe("stable");
  });

  it("returns stable for fewer than 2 elements", () => {
    expect(trendDirection([])).toBe("stable");
    expect(trendDirection([42])).toBe("stable");
  });

  it("classifies a mostly increasing sequence as increasing", () => {
    // pairs: (1,2) inc, (2,3) inc, (3,4) inc, (4,3) dec => inc ratio 3/4 = 0.75 >= 0.6
    expect(trendDirection([1, 2, 3, 4, 3])).toBe("increasing");
  });

  it("classifies a mostly decreasing sequence as decreasing", () => {
    // pairs: (5,4) dec, (4,3) dec, (3,2) dec, (2,3) inc => dec ratio 3/4 = 0.75 >= 0.6
    expect(trendDirection([5, 4, 3, 2, 3])).toBe("decreasing");
  });
});

// ---------------------------------------------------------------------------
// average
// ---------------------------------------------------------------------------
describe("average", () => {
  it("computes the average of numbers", () => {
    expect(average([2, 4, 6])).toBe(4);
  });

  it("returns 0 for an empty array", () => {
    expect(average([])).toBe(0);
  });

  it("handles a single element", () => {
    expect(average([7])).toBe(7);
  });

  it("handles decimal values", () => {
    expect(average([1.5, 2.5])).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// linearScore
// ---------------------------------------------------------------------------
describe("linearScore", () => {
  it("returns 100 when value equals healthyValue", () => {
    expect(linearScore(0, 0, 1)).toBe(100);
  });

  it("returns 0 when value equals criticalValue", () => {
    expect(linearScore(1, 0, 1)).toBe(0);
  });

  it("returns 50 at the midpoint", () => {
    // healthyValue=0, criticalValue=100 => score = ((50 - 100) / (0 - 100)) * 100 = 50
    expect(linearScore(50, 0, 100)).toBe(50);
  });

  it("clamps to 0 when value exceeds criticalValue", () => {
    // healthyValue=0, criticalValue=100, value=200 => would be negative => clamped to 0
    expect(linearScore(200, 0, 100)).toBe(0);
  });

  it("clamps to 100 when value exceeds healthyValue on the healthy side", () => {
    // healthyValue=0, criticalValue=100, value=-50 => would be > 100 => clamped to 100
    expect(linearScore(-50, 0, 100)).toBe(100);
  });

  it("handles healthyValue equal to criticalValue", () => {
    // When healthyValue === criticalValue, returns 100 if value >= healthyValue, else 0
    expect(linearScore(5, 5, 5)).toBe(100);
    expect(linearScore(4, 5, 5)).toBe(0);
  });

  it("works when healthyValue > criticalValue (higher is better)", () => {
    // healthyValue=100, criticalValue=0 => score = ((value - 0) / (100 - 0)) * 100
    expect(linearScore(100, 100, 0)).toBe(100);
    expect(linearScore(0, 100, 0)).toBe(0);
    expect(linearScore(50, 100, 0)).toBe(50);
  });
});
