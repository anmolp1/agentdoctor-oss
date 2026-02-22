# Configuration

AgentDoctor uses sensible defaults for all thresholds. You can override any
threshold with a custom configuration file.

## Usage

```bash
# CLI
agentdoctor check log.json --config agentdoctor.config.json

# Programmatic
import { analyze, loadConfig } from "agentdoctor";

const config = loadConfig("agentdoctor.config.json");
const result = await analyze({
  logFiles: ["log.json"],
  config,
});
```

## Default Configuration

```json
{
  "contextErosion": {
    "monotonicThreshold": 0.9,
    "instructionShareWarning": 0.05,
    "instructionShareCritical": 0.02,
    "staleTurnLookback": 5,
    "growthRateCritical": 2000
  },
  "toolThrashing": {
    "repetitionWindowSize": 5,
    "repetitionThreshold": 3,
    "oscillationMinCycles": 3,
    "highCallsPerTurnThreshold": 5
  },
  "instructionDrift": {
    "phantomToolMinCalls": 2,
    "orphanedToolMaxUsage": 0,
    "directiveSimilarityThreshold": 0.8
  },
  "recoveryBlindness": {
    "maxRetriesBeforeFlag": 3,
    "errorRateThreshold": 0.5,
    "minToolCallsForRate": 3
  },
  "hallucinatedSuccess": {
    "emptyOutputMinLength": 5,
    "errorKeywords": ["error", "fail", "exception", "denied", "timeout", "refused", "not found", "unauthorized", "forbidden", "invalid"]
  },
  "silentDegradation": {
    "degradationWindowSize": 5,
    "degradationThreshold": 0.3,
    "compoundingMinPathologies": 3
  }
}
```

## Threshold Reference

### contextErosion

| Field                    | Default | Description                                    |
| ------------------------ | ------- | ---------------------------------------------- |
| monotonicThreshold       | 0.9     | Ratio of increasing steps to flag monotonic growth |
| instructionShareWarning  | 0.05    | Instruction share below this triggers a warning |
| instructionShareCritical | 0.02    | Instruction share below this triggers critical  |
| staleTurnLookback        | 5       | Number of turns to look back for stale content  |
| growthRateCritical       | 2000    | Avg tokens/turn growth rate for critical score  |

### toolThrashing

| Field                    | Default | Description                                    |
| ------------------------ | ------- | ---------------------------------------------- |
| repetitionWindowSize     | 5       | Window of consecutive calls to check            |
| repetitionThreshold      | 3       | Same-tool calls in window to flag               |
| oscillationMinCycles     | 3       | Minimum A-B-A cycles to flag oscillation        |
| highCallsPerTurnThreshold| 5       | Tool calls per turn to flag                     |

### instructionDrift

| Field                         | Default | Description                              |
| ----------------------------- | ------- | ---------------------------------------- |
| phantomToolMinCalls           | 2       | Min calls to an undeclared tool to flag   |
| orphanedToolMaxUsage          | 0       | Max uses of a declared tool before flagging |
| directiveSimilarityThreshold  | 0.8     | Jaccard similarity for contradictions     |

### recoveryBlindness

| Field                | Default | Description                                    |
| -------------------- | ------- | ---------------------------------------------- |
| maxRetriesBeforeFlag | 3       | Consecutive retries before flagging blind retry |
| errorRateThreshold   | 0.5     | Per-tool error rate to flag                     |
| minToolCallsForRate  | 3       | Minimum calls before computing error rate       |

### hallucinatedSuccess

| Field              | Default | Description                                      |
| ------------------ | ------- | ------------------------------------------------ |
| emptyOutputMinLength | 5     | Min expected output length; below = "empty"       |
| errorKeywords      | [...]   | Keywords in output that indicate hidden failure   |

### silentDegradation

| Field                    | Default | Description                                |
| ------------------------ | ------- | ------------------------------------------ |
| degradationWindowSize    | 5       | Turn window for measuring decline          |
| degradationThreshold     | 0.3     | Performance drop ratio to flag             |
| compoundingMinPathologies| 3       | Number of distinct pathologies to flag     |
