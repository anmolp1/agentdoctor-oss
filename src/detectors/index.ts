/** Detector registry. */

import type { BaseDetector } from "./base.js";
import type { Pathology } from "../models/findings.js";
import { ContextErosionDetector } from "./context-erosion.js";
import { ToolThrashingDetector } from "./tool-thrashing.js";
import { InstructionDriftDetector } from "./instruction-drift.js";
import { RecoveryBlindnessDetector } from "./recovery-blindness.js";
import { HallucinatedSuccessDetector } from "./hallucinated-success.js";
import { SilentDegradationDetector } from "./silent-degradation.js";

export type { BaseDetector } from "./base.js";

/** Get all available detectors. */
export function getAllDetectors(): BaseDetector[] {
  return [
    new ContextErosionDetector(),
    new ToolThrashingDetector(),
    new InstructionDriftDetector(),
    new RecoveryBlindnessDetector(),
    new HallucinatedSuccessDetector(),
    new SilentDegradationDetector(),
  ];
}

/** Get detectors filtered by pathology type. */
export function getDetectorsByPathology(pathologies: Pathology[]): BaseDetector[] {
  return getAllDetectors().filter((d) => pathologies.includes(d.pathology));
}
