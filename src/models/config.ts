/** Configuration schema with Zod validation. */

import { z } from "zod";

const threshold01 = z.number().min(0).max(1);
const thresholdPositive = z.number().positive();

export const AgentDoctorConfigSchema = z
  .object({
    contextErosion: z
      .object({
        growthRateWarning: thresholdPositive.default(500),
        growthRateCritical: thresholdPositive.default(2000),
        monotonicThreshold: threshold01.default(0.8),
        windowPctCritical: threshold01.default(0.8),
        assumedWindowSize: thresholdPositive.default(128000),
        instructionShareCritical: threshold01.default(0.02),
        instructionShareWarning: threshold01.default(0.05),
        instructionShareStartMin: threshold01.default(0.15),
        staleContentThreshold: threshold01.default(0.6),
        staleTurnLookback: thresholdPositive.int().default(10),
      })
      .default({}),
    toolThrashing: z
      .object({
        windowSize: thresholdPositive.int().default(5),
        repetitionWarning: thresholdPositive.int().default(3),
        repetitionCritical: thresholdPositive.int().default(5),
        inputSimilarityThreshold: threshold01.default(0.7),
        oscillationMinCycles: thresholdPositive.int().default(3),
        oscillationCriticalCycles: thresholdPositive.int().default(5),
        callsPerTurnWarning: thresholdPositive.int().default(8),
      })
      .default({}),
    instructionDrift: z
      .object({
        checkToolReferences: z.boolean().default(true),
        checkContradictions: z.boolean().default(true),
      })
      .default({}),
    recoveryBlindness: z
      .object({
        maxBlindRetries: thresholdPositive.int().default(3),
        errorRateWarning: threshold01.default(0.2),
        errorRateCritical: threshold01.default(0.5),
        flagUntested: z.boolean().default(true),
      })
      .default({}),
    hallucinatedSuccess: z
      .object({
        errorAcknowledgmentKeywords: z
          .array(z.string())
          .default([
            "failed",
            "error",
            "couldn't",
            "unable",
            "issue",
            "problem",
            "sorry",
            "unfortunately",
          ]),
      })
      .default({}),
    silentDegradation: z
      .object({
        withinSessionDropThreshold: threshold01.default(0.2),
      })
      .default({}),
    scoring: z
      .object({
        criticalPenalty: thresholdPositive.default(5),
        criticalPenaltyMax: thresholdPositive.default(25),
        warningPenalty: thresholdPositive.default(2),
        warningPenaltyMax: thresholdPositive.default(10),
      })
      .default({}),
  })
  .default({});

export type AgentDoctorConfig = z.infer<typeof AgentDoctorConfigSchema>;

/** Parse and validate config, applying defaults for any missing values. */
export function loadConfig(overrides?: Record<string, unknown>): AgentDoctorConfig {
  return AgentDoctorConfigSchema.parse(overrides ?? {});
}

/** Get the default configuration with all defaults applied. */
export function getDefaultConfig(): AgentDoctorConfig {
  return AgentDoctorConfigSchema.parse({});
}
