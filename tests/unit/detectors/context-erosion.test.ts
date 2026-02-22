import { ContextErosionDetector } from "../../../src/detectors/context-erosion.js";
import { getDefaultConfig } from "../../../src/models/config.js";
import { makeSession, makeBundle, makeTurn } from "../../helpers.js";
import { Pathology, Severity } from "../../../src/models/findings.js";
import { loadConfig } from "../../../src/models/config.js";

describe("ContextErosionDetector", () => {
  const detector = new ContextErosionDetector();
  const config = getDefaultConfig();

  it("detects monotonic growth", () => {
    const turns = Array.from({ length: 10 }, (_, i) =>
      makeTurn({
        turnIndex: i,
        contextTokenCount: 3000 + Math.round((47000 / 9) * i),
      }),
    );

    const bundle = makeBundle([
      makeSession({
        sessionId: "growth-session",
        turns,
        systemPrompt: "You are a helpful assistant.",
        toolSchemas: [],
      }),
    ]);

    const findings = detector.detect(bundle, config);

    expect(findings.length).toBeGreaterThan(0);
    const growthFinding = findings.find(
      (f) => f.pathology === Pathology.ContextErosion && f.title.includes("growing unchecked"),
    );
    expect(growthFinding).toBeDefined();
    expect(growthFinding!.severity).toBe(Severity.Critical);
  });

  it("detects instruction share dilution", () => {
    // System prompt needs to be long enough so startShare >= instructionShareStartMin (0.15)
    // With estimateTokenCount = ceil(text.length / 4), we need promptTokens/firstContext >= 0.15
    // If firstContext=1000, promptTokens >= 150, so text.length >= 600
    const longPrompt = "You are a helpful assistant. ".repeat(25); // ~700 chars => ~175 tokens
    // startShare = 175/1000 = 0.175 >= 0.15  OK
    // endShare = 175/100000 = 0.00175 < 0.02 (instructionShareCritical)  => Critical

    const turns = Array.from({ length: 10 }, (_, i) =>
      makeTurn({
        turnIndex: i,
        contextTokenCount: 1000 + i * 11000,
      }),
    );

    const bundle = makeBundle([
      makeSession({
        sessionId: "dilution-session",
        turns,
        systemPrompt: longPrompt,
        toolSchemas: [],
      }),
    ]);

    const findings = detector.detect(bundle, config);

    const dilutionFinding = findings.find(
      (f) => f.pathology === Pathology.ContextErosion && f.title.includes("Instruction share"),
    );
    expect(dilutionFinding).toBeDefined();
    expect(dilutionFinding!.severity).toBe(Severity.Critical);
  });

  it("returns no findings on healthy logs", () => {
    // Stable context with moderate growth, occasional decreases simulate summarization.
    // Decreases make neverDecreases=false, preventing stale content detection.
    // Non-monotonic pattern prevents monotonic growth detection.
    const tokenCounts = [2000, 2100, 2200, 2150, 2250, 2350, 2300, 2400, 2500, 2450];
    const turns = tokenCounts.map((tokens, i) =>
      makeTurn({ turnIndex: i, contextTokenCount: tokens }),
    );

    const bundle = makeBundle([
      makeSession({
        sessionId: "healthy-session",
        turns,
        systemPrompt: "Short prompt.",
        toolSchemas: [],
      }),
    ]);

    const findings = detector.detect(bundle, config);
    expect(findings.length).toBe(0);
  });

  it("does not flag growth that plateaus", () => {
    // Growth that plateaus means non-monotonic => isMonotonic returns false
    const tokenCounts = [3000, 4000, 5000, 6000, 6000, 5900, 5800, 5900, 6000, 6100];
    const turns = tokenCounts.map((tokens, i) =>
      makeTurn({ turnIndex: i, contextTokenCount: tokens }),
    );

    const bundle = makeBundle([
      makeSession({
        sessionId: "plateau-session",
        turns,
        systemPrompt: "You are a helpful assistant.",
        toolSchemas: [],
      }),
    ]);

    const findings = detector.detect(bundle, config);

    // Should not have monotonic growth finding (growth plateaus/decreases)
    const growthFinding = findings.find((f) => f.title.includes("growing unchecked"));
    expect(growthFinding).toBeUndefined();
  });

  it("returns Critical for extreme growth rate (>2000 tokens/turn)", () => {
    // growthRateCritical = 2000, so avg growth must be > 2000
    // 10 turns: 3000 -> 3000 + 9*3000 = 30000, avg growth = 3000 > 2000
    const turns = Array.from({ length: 10 }, (_, i) =>
      makeTurn({
        turnIndex: i,
        contextTokenCount: 3000 + i * 3000,
      }),
    );

    const bundle = makeBundle([
      makeSession({
        sessionId: "extreme-session",
        turns,
        systemPrompt: "Short.",
        toolSchemas: [],
      }),
    ]);

    const findings = detector.detect(bundle, config);

    const growthFinding = findings.find((f) => f.title.includes("growing unchecked"));
    expect(growthFinding).toBeDefined();
    expect(growthFinding!.severity).toBe(Severity.Critical);
  });

  it("returns Warning for moderate growth rate (500-2000)", () => {
    // growthRateWarning = 500, growthRateCritical = 2000
    // avg growth = 1000 tokens/turn: above warning, below critical
    const turns = Array.from({ length: 10 }, (_, i) =>
      makeTurn({
        turnIndex: i,
        contextTokenCount: 3000 + i * 1000,
      }),
    );

    const bundle = makeBundle([
      makeSession({
        sessionId: "moderate-session",
        turns,
        systemPrompt: "Short.",
        toolSchemas: [],
      }),
    ]);

    const findings = detector.detect(bundle, config);

    const growthFinding = findings.find((f) => f.title.includes("growing unchecked"));
    expect(growthFinding).toBeDefined();
    expect(growthFinding!.severity).toBe(Severity.Warning);
  });

  it("returns empty when no token counts available", () => {
    const turns = Array.from({ length: 10 }, (_, i) => makeTurn({ turnIndex: i }));

    const bundle = makeBundle([
      makeSession({
        sessionId: "no-tokens-session",
        turns,
        systemPrompt: "You are a helpful assistant.",
        toolSchemas: [],
      }),
    ]);

    const findings = detector.detect(bundle, config);
    expect(findings.length).toBe(0);
  });

  it("respects custom thresholds from config", () => {
    // Set very low thresholds so even moderate growth triggers Critical
    const customConfig = loadConfig({
      contextErosion: {
        growthRateWarning: 50,
        growthRateCritical: 100,
        monotonicThreshold: 0.8,
        windowPctCritical: 0.8,
        assumedWindowSize: 128000,
        instructionShareCritical: 0.02,
        instructionShareWarning: 0.05,
        instructionShareStartMin: 0.15,
        staleContentThreshold: 0.6,
        staleTurnLookback: 10,
      },
    });

    // 200 tokens/turn average growth - normally Warning at defaults, Critical with custom
    const turns = Array.from({ length: 10 }, (_, i) =>
      makeTurn({
        turnIndex: i,
        contextTokenCount: 3000 + i * 200,
      }),
    );

    const bundle = makeBundle([
      makeSession({
        sessionId: "custom-session",
        turns,
        systemPrompt: "Short.",
        toolSchemas: [],
      }),
    ]);

    const findings = detector.detect(bundle, customConfig);

    const growthFinding = findings.find((f) => f.title.includes("growing unchecked"));
    expect(growthFinding).toBeDefined();
    expect(growthFinding!.severity).toBe(Severity.Critical);
  });

  it("includes evidence with turn indices and token counts", () => {
    const turns = Array.from({ length: 10 }, (_, i) =>
      makeTurn({
        turnIndex: i,
        contextTokenCount: 3000 + i * 3000,
      }),
    );

    const bundle = makeBundle([
      makeSession({
        sessionId: "evidence-session",
        turns,
        systemPrompt: "Short.",
        toolSchemas: [],
      }),
    ]);

    const findings = detector.detect(bundle, config);
    const growthFinding = findings.find((f) => f.title.includes("growing unchecked"));
    expect(growthFinding).toBeDefined();
    expect(growthFinding!.evidence.length).toBeGreaterThan(0);

    const evidence = growthFinding!.evidence[0]!;
    expect(evidence.turnIndex).toBeDefined();
    expect(evidence.rawData).toBeDefined();
    expect(evidence.rawData!.firstTokens).toBeDefined();
    expect(evidence.rawData!.lastTokens).toBeDefined();
    expect(evidence.rawData!.tokenSeries).toBeDefined();
  });

  it("includes recommendation text", () => {
    const turns = Array.from({ length: 10 }, (_, i) =>
      makeTurn({
        turnIndex: i,
        contextTokenCount: 3000 + i * 3000,
      }),
    );

    const bundle = makeBundle([
      makeSession({
        sessionId: "rec-session",
        turns,
        systemPrompt: "Short.",
        toolSchemas: [],
      }),
    ]);

    const findings = detector.detect(bundle, config);
    const growthFinding = findings.find((f) => f.title.includes("growing unchecked"));
    expect(growthFinding).toBeDefined();
    expect(growthFinding!.recommendation).toBeTruthy();
    expect(growthFinding!.recommendation.length).toBeGreaterThan(10);
  });

  it("requires minimum 5 turns with token counts", () => {
    // Only 4 turns with token data - should not detect anything
    const turns = Array.from({ length: 4 }, (_, i) =>
      makeTurn({
        turnIndex: i,
        contextTokenCount: 3000 + i * 5000,
      }),
    );

    const bundle = makeBundle([
      makeSession({
        sessionId: "few-turns-session",
        turns,
        systemPrompt: "Short.",
        toolSchemas: [],
      }),
    ]);

    const findings = detector.detect(bundle, config);
    expect(findings.length).toBe(0);

    // 5 turns should work
    const turnsEnough = Array.from({ length: 5 }, (_, i) =>
      makeTurn({
        turnIndex: i,
        contextTokenCount: 3000 + i * 5000,
      }),
    );

    const bundleEnough = makeBundle([
      makeSession({
        sessionId: "enough-turns-session",
        turns: turnsEnough,
        systemPrompt: "Short.",
        toolSchemas: [],
      }),
    ]);

    const findingsEnough = detector.detect(bundleEnough, config);
    expect(findingsEnough.length).toBeGreaterThan(0);
  });
});
