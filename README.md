# AgentDoctor

**Diagnose your AI agents before they silently fail.**

AgentDoctor is a TypeScript library and CLI tool for AI agent health diagnostics. It analyzes agent log files to detect pathologies -- recurring failure patterns that degrade agent performance over time -- and computes a composite health score. It runs entirely locally, requires zero external services, and produces fully deterministic results.

---

## Features

- **6 pathology detectors** that identify the most common agent failure modes
- **3 log format parsers** for LangChain, OpenAI (JSONL), and generic JSON logs
- **3-layer health scoring** with weighted dimensions: Context Health (0.40), Tool Reliability (0.35), Instruction Coherence (0.25)
- **Reports** in Markdown and JSON
- **CLI** with `check` and `score` commands
- **Programmatic API** for integration into CI pipelines, monitoring, and custom tooling
- **Zero external services** -- fully deterministic, local-only analysis

---

## Quick Start

### Installation

```bash
npm install agentdoctor
# or
pnpm add agentdoctor
```

### Run a health check

```bash
npx agentdoctor check path/to/log.json
```

### Get a quick score

```bash
npx agentdoctor score path/to/log.json
```

---

## CLI Usage

AgentDoctor provides two commands: `check` (full diagnostic report) and `score` (quick health score).

### `check` -- Full diagnostic report

```bash
# Analyze a log file and print a Markdown report to stdout
npx agentdoctor check path/to/log.json

# Output as JSON and write to a file
npx agentdoctor check path/to/log.jsonl --format json --output report.json

# Filter by a specific pathology
npx agentdoctor check log.json --pathology context_erosion

# Use a custom configuration file
npx agentdoctor check log.json --config agentdoctor.config.json
```

### `score` -- Quick health score

```bash
npx agentdoctor score path/to/log.json
```

Prints the overall health score and grade without the full diagnostic breakdown.

### Exit Codes

| Code | Meaning                    |
| ---- | -------------------------- |
| `0`  | Healthy (score >= 80)      |
| `1`  | Degraded (score 60--79)    |
| `2`  | Critical (score < 60)      |
| `3`  | Error (invalid input, etc) |

Exit codes make it straightforward to integrate AgentDoctor into CI/CD pipelines and shell scripts.

---

## Library API

Use AgentDoctor programmatically in your own applications:

```typescript
import { analyze } from "agentdoctor";

const result = await analyze({
  logFiles: ["path/to/log.json"],
  outputFormat: "json",
});

// Overall health score (0-100)
console.log(result.healthScore.overallScore);

// Individual findings
console.log(result.diagnostics.findings);
```

### Advanced Exports

AgentDoctor also exports parsers, detectors, scoring functions, and configuration utilities for advanced usage and extension:

```typescript
import {
  detectAndParse,
  getAllDetectors,
  computeHealthScore,
  getDefaultConfig,
  loadConfig,
} from "agentdoctor";
```

---

## Supported Log Formats

AgentDoctor automatically detects the format of your log files. The following formats are supported:

| Format         | File Extension | Description                                      |
| -------------- | -------------- | ------------------------------------------------ |
| LangChain      | `.json`        | LangChain tracer/callback JSON logs              |
| OpenAI (JSONL) | `.jsonl`       | OpenAI API request/response logs in JSONL format |
| Generic JSON   | `.json`        | Any JSON log with message arrays and tool calls  |

The parser auto-detects the format based on the structure of the log data, so no manual format specification is required.

---

## Health Score

AgentDoctor computes a composite health score from 0 to 100 across three weighted layers:

| Layer                     | Weight | What it measures                                                                |
| ------------------------- | ------ | ------------------------------------------------------------------------------- |
| **Context Health**        | 0.40   | Token growth rate, context window utilization, instruction share, stale content |
| **Tool Reliability**      | 0.35   | Tool call success rates, error recovery, thrashing patterns                     |
| **Instruction Coherence** | 0.25   | Instruction drift, contradictions, hallucinated success claims                  |

Each layer starts at 100 and is penalized based on detected pathologies:

- **Critical** findings: `-5` points each (max `-25` per layer)
- **Warning** findings: `-2` points each (max `-10` per layer)

The overall score is the weighted sum of the three layer scores. The grade mapping:

| Grade | Score Range |
| ----- | ----------- |
| A     | 90--100     |
| B     | 80--89      |
| C     | 70--79      |
| D     | 60--69      |
| F     | 0--59       |

---

## Pathologies Detected

AgentDoctor ships with six built-in pathology detectors:

### Context Erosion

Detects when the agent's context window fills up over the course of a session, causing earlier instructions and context to be pushed out. Monitors token growth rate, context window utilization percentage, and the share of the context occupied by the original instructions.

### Tool Thrashing

Identifies patterns where the agent repeatedly calls the same tool with similar or identical inputs, or oscillates between two tools without making progress. Tracks repetition counts, input similarity, and calls-per-turn spikes.

### Instruction Drift

Flags cases where the agent's behavior diverges from its original instructions over time. Checks for contradictions between early and late messages and verifies that tool references in instructions remain valid.

### Recovery Blindness

Detects when the agent fails to recover from errors -- retrying the same failing operation without changing strategy, or ignoring error signals entirely. Monitors blind retry counts and overall error rates.

### Hallucinated Tool Success

Catches cases where the agent claims a tool call succeeded when the underlying tool actually returned an error or failure. Compares the tool call status against the agent's subsequent message for acknowledgment of failure.

### Silent Degradation

Identifies gradual quality decline within a session that may not trigger any single threshold but represents a meaningful drop in output quality over time. Monitors within-session performance trends.

---

## Configuration

AgentDoctor works out of the box with sensible defaults. To customize thresholds, create an `agentdoctor.config.json` file:

```json
{
  "contextErosion": {
    "growthRateWarning": 500,
    "growthRateCritical": 2000,
    "monotonicThreshold": 0.8,
    "windowPctCritical": 0.8,
    "assumedWindowSize": 128000
  },
  "toolThrashing": {
    "windowSize": 5,
    "repetitionWarning": 3,
    "repetitionCritical": 5,
    "inputSimilarityThreshold": 0.7
  },
  "instructionDrift": {
    "checkToolReferences": true,
    "checkContradictions": true
  },
  "recoveryBlindness": {
    "maxBlindRetries": 3,
    "errorRateWarning": 0.2,
    "errorRateCritical": 0.5
  },
  "hallucinatedSuccess": {
    "errorAcknowledgmentKeywords": [
      "failed",
      "error",
      "couldn't",
      "unable",
      "issue",
      "problem",
      "sorry",
      "unfortunately"
    ]
  },
  "silentDegradation": {
    "withinSessionDropThreshold": 0.2
  },
  "scoring": {
    "criticalPenalty": 5,
    "criticalPenaltyMax": 25,
    "warningPenalty": 2,
    "warningPenaltyMax": 10
  }
}
```

Pass it to the CLI with the `--config` flag:

```bash
npx agentdoctor check log.json --config agentdoctor.config.json
```

Or load it programmatically:

```typescript
import { loadConfig } from "agentdoctor";

const config = loadConfig({
  toolThrashing: { repetitionCritical: 10 },
});
```

All fields are optional. Any omitted fields use the built-in defaults shown above.

---

## Tech Stack

- **TypeScript** 5.4+
- **Node.js** 20+
- **pnpm** -- package manager
- **tsup** -- bundler
- **vitest** -- test runner
- **commander** -- CLI framework
- **picocolors** -- terminal colors
- **zod** -- schema validation

---

## Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md) for guidelines on how to contribute to AgentDoctor.

---

## License

Apache-2.0. See [LICENSE](./LICENSE) for details.
