/** CLI `score` command — quick score output. */

import type { Command } from "commander";
import { analyze } from "../pipeline.js";
import { printScore } from "./formatters.js";

export function registerScoreCommand(program: Command): void {
  program
    .command("score")
    .description("Quick health score — just the number and grade")
    .argument("[files...]", "Log files or directories to analyze")
    .option("--stdin", "Read log from stdin", false)
    .action(async (files: string[], opts) => {
      try {
        if (!opts.stdin && files.length === 0) {
          console.error("Error: No log files specified. Use --stdin or provide file paths.");
          process.exit(3);
        }

        const result = await analyze({
          logFiles: files,
          stdin: opts.stdin,
        });

        printScore(result.healthScore);

        // Exit based on grade
        if (result.healthScore.overallGrade === "F") {
          process.exit(2);
        } else if (result.healthScore.overallGrade === "D") {
          process.exit(1);
        } else {
          process.exit(0);
        }
      } catch (err) {
        console.error(`Error: ${err instanceof Error ? err.message : String(err)}`);
        process.exit(3);
      }
    });
}
