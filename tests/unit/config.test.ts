import { loadConfig, getDefaultConfig, AgentDoctorConfigSchema } from "../../src/models/config.js";

// ---------------------------------------------------------------------------
// Default config
// ---------------------------------------------------------------------------
describe("getDefaultConfig", () => {
  it("loads defaults without error", () => {
    const config = getDefaultConfig();
    expect(config).toBeDefined();
    expect(config.contextErosion).toBeDefined();
    expect(config.toolThrashing).toBeDefined();
    expect(config.instructionDrift).toBeDefined();
    expect(config.recoveryBlindness).toBeDefined();
    expect(config.hallucinatedSuccess).toBeDefined();
    expect(config.silentDegradation).toBeDefined();
    expect(config.scoring).toBeDefined();
  });

  it("has expected default values", () => {
    const config = getDefaultConfig();
    expect(config.contextErosion.growthRateWarning).toBe(500);
    expect(config.contextErosion.growthRateCritical).toBe(2000);
    expect(config.contextErosion.monotonicThreshold).toBe(0.8);
    expect(config.toolThrashing.windowSize).toBe(5);
    expect(config.toolThrashing.repetitionWarning).toBe(3);
    expect(config.toolThrashing.repetitionCritical).toBe(5);
    expect(config.recoveryBlindness.maxBlindRetries).toBe(3);
    expect(config.scoring.criticalPenalty).toBe(5);
  });
});

// ---------------------------------------------------------------------------
// loadConfig with overrides
// ---------------------------------------------------------------------------
describe("loadConfig", () => {
  it("applies custom overrides", () => {
    const config = loadConfig({
      contextErosion: {
        growthRateWarning: 300,
        growthRateCritical: 1500,
      },
    });
    expect(config.contextErosion.growthRateWarning).toBe(300);
    expect(config.contextErosion.growthRateCritical).toBe(1500);
  });

  it("falls back to defaults for unspecified values", () => {
    const config = loadConfig({
      contextErosion: {
        growthRateWarning: 300,
      },
    });
    // Overridden value
    expect(config.contextErosion.growthRateWarning).toBe(300);
    // Default values for unspecified fields
    expect(config.contextErosion.growthRateCritical).toBe(2000);
    expect(config.contextErosion.monotonicThreshold).toBe(0.8);
    // Other sections fully default
    expect(config.toolThrashing.windowSize).toBe(5);
    expect(config.recoveryBlindness.maxBlindRetries).toBe(3);
  });

  it("loads with no arguments (empty overrides)", () => {
    const config = loadConfig();
    const defaultConfig = getDefaultConfig();
    expect(config).toEqual(defaultConfig);
  });

  it("rejects negative threshold values", () => {
    expect(() =>
      loadConfig({
        contextErosion: {
          growthRateWarning: -1,
        },
      }),
    ).toThrow();
  });

  it("rejects threshold01 values out of range (> 1)", () => {
    expect(() =>
      loadConfig({
        contextErosion: {
          monotonicThreshold: 1.5,
        },
      }),
    ).toThrow();
  });

  it("rejects threshold01 values out of range (< 0)", () => {
    expect(() =>
      loadConfig({
        contextErosion: {
          monotonicThreshold: -0.1,
        },
      }),
    ).toThrow();
  });

  it("loads from parsed JSON config content (strict)", () => {
    const strictConfig = {
      contextErosion: {
        growthRateWarning: 200,
        growthRateCritical: 1000,
      },
      toolThrashing: {
        repetitionWarning: 2,
        repetitionCritical: 3,
      },
      recoveryBlindness: {
        maxBlindRetries: 2,
        errorRateWarning: 0.1,
      },
    };
    const config = loadConfig(strictConfig);
    expect(config.contextErosion.growthRateWarning).toBe(200);
    expect(config.contextErosion.growthRateCritical).toBe(1000);
    expect(config.toolThrashing.repetitionWarning).toBe(2);
    expect(config.toolThrashing.repetitionCritical).toBe(3);
    expect(config.recoveryBlindness.maxBlindRetries).toBe(2);
    expect(config.recoveryBlindness.errorRateWarning).toBe(0.1);
    // Unspecified fields still get defaults
    expect(config.contextErosion.monotonicThreshold).toBe(0.8);
    expect(config.scoring.criticalPenalty).toBe(5);
  });

  it("loads from parsed JSON config content (relaxed)", () => {
    const relaxedConfig = {
      contextErosion: {
        growthRateWarning: 1000,
        growthRateCritical: 5000,
      },
      toolThrashing: {
        repetitionWarning: 5,
        repetitionCritical: 8,
      },
      recoveryBlindness: {
        maxBlindRetries: 5,
        errorRateWarning: 0.4,
      },
    };
    const config = loadConfig(relaxedConfig);
    expect(config.contextErosion.growthRateWarning).toBe(1000);
    expect(config.contextErosion.growthRateCritical).toBe(5000);
    expect(config.toolThrashing.repetitionWarning).toBe(5);
    expect(config.toolThrashing.repetitionCritical).toBe(8);
    expect(config.recoveryBlindness.maxBlindRetries).toBe(5);
    expect(config.recoveryBlindness.errorRateWarning).toBe(0.4);
  });
});

// ---------------------------------------------------------------------------
// Schema validation
// ---------------------------------------------------------------------------
describe("AgentDoctorConfigSchema", () => {
  it("validates a fully empty object and applies all defaults", () => {
    const result = AgentDoctorConfigSchema.parse({});
    expect(result.contextErosion.growthRateWarning).toBe(500);
    expect(result.scoring.criticalPenalty).toBe(5);
  });

  it("rejects invalid types", () => {
    expect(() =>
      AgentDoctorConfigSchema.parse({
        contextErosion: {
          growthRateWarning: "not-a-number",
        },
      }),
    ).toThrow();
  });
});
