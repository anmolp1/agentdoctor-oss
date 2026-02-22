#!/usr/bin/env node

/** AgentDoctor CLI entry point. */

import { Command } from "commander";
import { registerCheckCommand } from "./check.js";
import { registerScoreCommand } from "./score.js";

const program = new Command();

program
  .name("agentdoctor")
  .description("Diagnose your AI agents before they silently fail.")
  .version("0.1.0");

registerCheckCommand(program);
registerScoreCommand(program);

program.parse();
