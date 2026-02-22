/** AgentDoctor — Public API exports. */

// Core pipeline
export { analyze } from "./pipeline.js";
export type { AnalyzeOptions, AnalyzeResult, OutputFormat } from "./pipeline.js";

// Models
export { Role, ToolCallStatus } from "./models/canonical.js";
export type {
  Message,
  ToolCall,
  Turn,
  AgentSession,
  ToolSchema,
  AgentLogBundle,
} from "./models/canonical.js";
export { totalTurns, totalToolCalls, totalMessages } from "./models/canonical.js";

export { Pathology, Severity } from "./models/findings.js";
export type { Finding, Evidence, DiagnosticResult } from "./models/findings.js";
export { criticalCount, warningCount, pathologiesDetected } from "./models/findings.js";

export type { HealthScore, LayerScore, Grade } from "./models/scores.js";
export { gradeFromScore } from "./models/scores.js";

// Parsers (for advanced usage / extension)
export { detectAndParse } from "./parsers/index.js";
export type { BaseParser } from "./parsers/base.js";

// Detectors (for advanced usage / extension)
export { getAllDetectors } from "./detectors/index.js";
export type { BaseDetector } from "./detectors/base.js";

// Scoring
export { computeHealthScore } from "./scoring/engine.js";

// Config
export { getDefaultConfig, loadConfig, AgentDoctorConfigSchema } from "./models/config.js";
export type { AgentDoctorConfig } from "./models/config.js";
