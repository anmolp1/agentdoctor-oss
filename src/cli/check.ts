/** CLI `check` command — full health check. */

import type { Command } from "commander";
import * as fs from "node:fs";
import { analyze } from "../pipeline.js";
import { Pathology, Severity } from "../models/findings.js";
import type { OutputFormat } from "../reporting/engine.js";
import { printSummary } from "./formatters.js";

export function registerCheckCommand(program: Command): void {
  program
    .command("check")
    .description("Run a full health check on agent logs")
    .argument("[files...]", "Log files or directories to analyze")
    .option("--format <format>", "Report format (markdown|json)", "markdown")
    .option("--output <path>", "Write report to file")
    .option("--config <path>", "Path to JSON config file")
    .option("--pathology <name>", "Run single detector only")
    .option(
      "--severity-threshold <level>",
      "Minimum severity to report (warning|critical)",
      "warning",
    )
    .option("--stdin", "Read log from stdin", false)
    .option("-q, --quiet", "Exit code only, no output", false)
    .option("-v, --verbose", "Debug logging", false)
    .option("--json", "Shorthand for --format json", false)
    .action(async (files: string[], opts) => {
      try {
        const format: OutputFormat = opts.json ? "json" : (opts.format as OutputFormat);

        // Load custom config if provided
        let configOverrides: Record<string, unknown> | undefined;
        if (opts.config) {
          const configContent = fs.readFileSync(opts.config, "utf-8");
          configOverrides = JSON.parse(configContent) as Record<string, unknown>;
        }

        // Map pathology name to enum
        let pathologyFilter: Pathology[] | undefined;
        if (opts.pathology) {
          const name = opts.pathology.replace(/-/g, "_");
          const matched = Object.values(Pathology).find((p) => p === name);
          if (!matched) {
            console.error(
              `Unknown pathology: ${opts.pathology}. Available: ${Object.values(Pathology).join(", ")}`,
            );
            process.exit(3);
            return;
          }
          pathologyFilter = [matched];
        }

        // Map severity threshold
        const severityMap: Record<string, Severity> = {
          warning: Severity.Warning,
          critical: Severity.Critical,
        };
        const severityThreshold = severityMap[opts.severityThreshold] ?? Severity.Warning;

        if (!opts.stdin && files.length === 0) {
          console.error("Error: No log files specified. Use --stdin or provide file paths.");
          process.exit(3);
        }

        const result = await analyze({
          logFiles: files,
          config: configOverrides as Partial<Record<string, unknown>> | undefined,
          outputFormat: format,
          outputPath: opts.output,
          pathologyFilter,
          severityThreshold,
          stdin: opts.stdin,
        });

        if (!opts.quiet) {
          if (opts.output) {
            printSummary(result.healthScore, result.diagnostics);
            // eslint-disable-next-line no-console
            console.log(`  Report written to: ${opts.output}\n`);
          } else {
            // eslint-disable-next-line no-console
            console.log(result.report);
          }
        }

        // Exit codes
        const hasCritical = result.diagnostics.findings.some(
          (f) => f.severity === Severity.Critical,
        );
        const hasWarning = result.diagnostics.findings.some(
          (f) => f.severity === Severity.Warning,
        );

        if (hasCritical) {
          process.exit(2);
        } else if (hasWarning) {
          process.exit(1);
        } else {
          process.exit(0);
        }
      } catch (err) {
        if (!opts.quiet) {
          console.error(`Error: ${err instanceof Error ? err.message : String(err)}`);
        }
        process.exit(3);
      }
    });
}
