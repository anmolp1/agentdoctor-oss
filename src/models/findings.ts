/** Pathology finding models. */

export enum Pathology {
  ContextErosion = "context_erosion",
  ToolThrashing = "tool_thrashing",
  InstructionDrift = "instruction_drift",
  RecoveryBlindness = "recovery_blindness",
  HallucinatedToolSuccess = "hallucinated_tool_success",
  SilentDegradation = "silent_degradation",
}

export enum Severity {
  Critical = "critical",
  Warning = "warning",
  Info = "info",
}

export interface Evidence {
  readonly description: string;
  readonly turnIndex?: number;
  readonly toolCallIndex?: number;
  readonly sessionId?: string;
  readonly rawData?: Record<string, unknown>;
}

export interface Finding {
  readonly pathology: Pathology;
  readonly severity: Severity;
  readonly title: string;
  readonly description: string;
  readonly evidence: readonly Evidence[];
  readonly recommendation: string;
  readonly affectedSessions: readonly string[];
  readonly confidence: number; // 0.0-1.0
  readonly metadata?: Record<string, unknown>;
}

export interface DiagnosticResult {
  readonly findings: readonly Finding[];
  readonly sessionsAnalyzed: number;
  readonly turnsAnalyzed: number;
  readonly toolCallsAnalyzed: number;
  readonly analysisTimestamp: string;
  readonly configUsed: Record<string, unknown>;
}

/** Count findings with Critical severity. */
export function criticalCount(result: DiagnosticResult): number {
  return result.findings.filter((f) => f.severity === Severity.Critical).length;
}

/** Count findings with Warning severity. */
export function warningCount(result: DiagnosticResult): number {
  return result.findings.filter((f) => f.severity === Severity.Warning).length;
}

/** Get unique set of pathologies detected. */
export function pathologiesDetected(result: DiagnosticResult): Set<Pathology> {
  return new Set(result.findings.map((f) => f.pathology));
}
