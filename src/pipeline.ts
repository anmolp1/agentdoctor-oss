/** End-to-end diagnostic pipeline orchestrator. */

import * as fs from "node:fs";
import * as path from "node:path";
import type { AgentLogBundle } from "./models/canonical.js";
import type { DiagnosticResult, Finding } from "./models/findings.js";
import { Pathology, Severity } from "./models/findings.js";
import type { HealthScore } from "./models/scores.js";
import type { AgentDoctorConfig } from "./models/config.js";
import { loadConfig } from "./models/config.js";
import { detectAndParse } from "./parsers/index.js";
import { getAllDetectors, getDetectorsByPathology } from "./detectors/index.js";
import { SilentDegradationDetector } from "./detectors/silent-degradation.js";
import { computeHealthScore } from "./scoring/engine.js";
import { generateReport } from "./reporting/engine.js";
import type { OutputFormat } from "./reporting/engine.js";

export type { OutputFormat } from "./reporting/engine.js";

export interface AnalyzeOptions {
  logFiles: string[];
  config?: Partial<AgentDoctorConfig>;
  outputFormat?: OutputFormat;
  outputPath?: string;
  pathologyFilter?: Pathology[];
  severityThreshold?: Severity;
  stdin?: boolean;
}

export interface AnalyzeResult {
  diagnostics: DiagnosticResult;
  healthScore: HealthScore;
  report: string;
}

/**
 * Run the full diagnostic pipeline.
 *
 * 1. Read log files (or stdin)
 * 2. Auto-detect framework, parse to canonical format
 * 3. Run detectors (all, or filtered subset)
 * 4. Compute health scores from findings + bundle
 * 5. Generate report (markdown or json)
 * 6. Write output if outputPath specified
 */
export async function analyze(options: AnalyzeOptions): Promise<AnalyzeResult> {
  const config = loadConfig(options.config as Record<string, unknown> | undefined);
  const format = options.outputFormat ?? "markdown";
  const severityThreshold = options.severityThreshold ?? Severity.Warning;

  // Step 1: Read and parse log files
  const bundle = await readAndParse(options);

  // Step 2: Run detectors
  const detectors = options.pathologyFilter
    ? getDetectorsByPathology(options.pathologyFilter)
    : getAllDetectors();

  let findings: Finding[] = [];
  for (const detector of detectors) {
    if (detector instanceof SilentDegradationDetector) {
      // Silent degradation needs other findings for compounding check
      findings.push(...detector.detect(bundle, config, findings));
    } else {
      findings.push(...detector.detect(bundle, config));
    }
  }

  // Apply severity threshold filter
  findings = filterBySeverity(findings, severityThreshold);

  // Step 3: Build diagnostic result
  let totalTurns = 0;
  let totalToolCalls = 0;
  for (const session of bundle.sessions) {
    totalTurns += session.turns.length;
    for (const turn of session.turns) {
      totalToolCalls += turn.toolCalls.length;
    }
  }

  const diagnostics: DiagnosticResult = {
    findings,
    sessionsAnalyzed: bundle.sessions.length,
    turnsAnalyzed: totalTurns,
    toolCallsAnalyzed: totalToolCalls,
    analysisTimestamp: new Date().toISOString(),
    configUsed: config as unknown as Record<string, unknown>,
  };

  // Step 4: Compute health score
  const healthScore = computeHealthScore(bundle, diagnostics, config);

  // Step 5: Generate report
  const report = generateReport(
    diagnostics,
    healthScore,
    options.logFiles,
    format,
  );

  // Step 6: Write output if path specified
  if (options.outputPath) {
    const dir = path.dirname(options.outputPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(options.outputPath, report, "utf-8");
  }

  return { diagnostics, healthScore, report };
}

async function readAndParse(options: AnalyzeOptions): Promise<AgentLogBundle> {
  const allSessions: ReturnType<typeof detectAndParse> = [];
  const sourceFiles: string[] = [];

  if (options.stdin) {
    const content = await readStdin();
    const sessions = detectAndParse("stdin", content);
    allSessions.push(...sessions);
    sourceFiles.push("stdin");
  } else {
    for (const filePath of options.logFiles) {
      const resolved = path.resolve(filePath);
      const stat = fs.statSync(resolved);

      if (stat.isDirectory()) {
        // Read all JSON/JSONL files in directory
        const files = fs
          .readdirSync(resolved)
          .filter((f) => f.endsWith(".json") || f.endsWith(".jsonl"))
          .map((f) => path.join(resolved, f));

        for (const file of files) {
          const content = fs.readFileSync(file, "utf-8");
          const sessions = detectAndParse(file, content);
          allSessions.push(...sessions);
          sourceFiles.push(file);
        }
      } else {
        const content = fs.readFileSync(resolved, "utf-8");
        const sessions = detectAndParse(resolved, content);
        allSessions.push(...sessions);
        sourceFiles.push(resolved);
      }
    }
  }

  if (allSessions.length === 0) {
    throw new Error("No sessions found in the provided log files.");
  }

  return {
    sessions: allSessions,
    sourceFiles,
    frameworkDetected: allSessions[0]?.framework,
  };
}

function readStdin(): Promise<string> {
  return new Promise((resolve, reject) => {
    let data = "";
    process.stdin.setEncoding("utf-8");
    process.stdin.on("data", (chunk) => (data += chunk));
    process.stdin.on("end", () => resolve(data));
    process.stdin.on("error", reject);
  });
}

function filterBySeverity(findings: Finding[], threshold: Severity): Finding[] {
  const order: Record<string, number> = {
    critical: 0,
    warning: 1,
    info: 2,
  };
  const thresholdOrder = order[threshold] ?? 1;
  return findings.filter((f) => (order[f.severity] ?? 2) <= thresholdOrder);
}
