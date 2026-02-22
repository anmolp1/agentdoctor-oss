import { flattenDict, jaccardSimilarity, inputSimilarity } from "../../../src/utils/similarity.js";

// ---------------------------------------------------------------------------
// flattenDict
// ---------------------------------------------------------------------------
describe("flattenDict", () => {
  it("flattens a flat object into key=value pairs", () => {
    const result = flattenDict({ a: 1, b: "hello" });
    expect(result.has("a=1")).toBe(true);
    expect(result.has('b="hello"')).toBe(true);
    expect(result.size).toBe(2);
  });

  it("flattens nested objects with dot notation", () => {
    const result = flattenDict({ a: { b: { c: 42 } } });
    expect(result.has("a.b.c=42")).toBe(true);
    expect(result.size).toBe(1);
  });

  it("handles mixed nesting depths", () => {
    const result = flattenDict({
      top: "val",
      nested: { inner: "deep" },
    });
    expect(result.has('top="val"')).toBe(true);
    expect(result.has('nested.inner="deep"')).toBe(true);
    expect(result.size).toBe(2);
  });

  it("handles arrays as leaf values", () => {
    const result = flattenDict({ arr: [1, 2, 3] });
    expect(result.has("arr=[1,2,3]")).toBe(true);
    expect(result.size).toBe(1);
  });

  it("handles empty object", () => {
    const result = flattenDict({});
    expect(result.size).toBe(0);
  });

  it("uses prefix parameter", () => {
    const result = flattenDict({ key: "value" }, "root");
    expect(result.has('root.key="value"')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// jaccardSimilarity
// ---------------------------------------------------------------------------
describe("jaccardSimilarity", () => {
  it("returns 1.0 for identical sets", () => {
    const a = new Set(["x", "y", "z"]);
    const b = new Set(["x", "y", "z"]);
    expect(jaccardSimilarity(a, b)).toBe(1.0);
  });

  it("returns 0.0 for completely disjoint sets", () => {
    const a = new Set(["a", "b"]);
    const b = new Set(["c", "d"]);
    expect(jaccardSimilarity(a, b)).toBe(0.0);
  });

  it("handles partial overlap correctly", () => {
    const a = new Set(["a", "b", "c"]);
    const b = new Set(["b", "c", "d"]);
    // intersection = {b, c} => size 2
    // union = {a, b, c, d} => size 4
    // jaccard = 2 / 4 = 0.5
    expect(jaccardSimilarity(a, b)).toBe(0.5);
  });

  it("returns 1.0 for two empty sets", () => {
    expect(jaccardSimilarity(new Set(), new Set())).toBe(1.0);
  });

  it("returns 0.0 when one set is empty and the other is not", () => {
    const a = new Set(["a"]);
    const b = new Set<string>();
    expect(jaccardSimilarity(a, b)).toBe(0.0);
  });
});

// ---------------------------------------------------------------------------
// inputSimilarity
// ---------------------------------------------------------------------------
describe("inputSimilarity", () => {
  it("returns 1.0 for identical inputs", () => {
    const input = { query: "hello", limit: 10 };
    expect(inputSimilarity(input, input)).toBe(1.0);
  });

  it("returns 0.0 for completely different inputs", () => {
    const a = { query: "hello" };
    const b = { path: "/file.txt" };
    expect(inputSimilarity(a, b)).toBe(0.0);
  });

  it("returns a value between 0 and 1 for partial overlap", () => {
    const a = { query: "hello", limit: 10 };
    const b = { query: "hello", offset: 5 };
    const sim = inputSimilarity(a, b);
    expect(sim).toBeGreaterThan(0);
    expect(sim).toBeLessThan(1);
  });
});
