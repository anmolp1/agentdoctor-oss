# Tool Thrashing

## What It Is

Tool thrashing occurs when an agent repeatedly calls tools unproductively -
either calling the same tool multiple times in succession with similar inputs,
oscillating between two tools, or making an excessive number of tool calls per
turn without making progress.

## Detection Rules

### 1. Repetitive Same-Tool Calls (Critical)

Fires when the same tool is called repeatedly within a sliding window of
consecutive calls.

- **Window:** `repetitionWindowSize` (default: 5)
- **Threshold:** `repetitionThreshold` (default: 3) calls of the same tool
- **Severity:** Critical

### 2. Tool Oscillation (Warning)

Fires when the agent alternates between two tools in an A-B-A-B pattern.

- **Threshold:** `oscillationMinCycles` (default: 3) complete cycles
- **Severity:** Warning

### 3. High Calls Per Turn (Warning)

Fires when a single turn contains an unusually high number of tool calls.

- **Threshold:** `highCallsPerTurnThreshold` (default: 5)
- **Severity:** Warning

## Configuration

```json
{
  "toolThrashing": {
    "repetitionWindowSize": 5,
    "repetitionThreshold": 3,
    "oscillationMinCycles": 3,
    "highCallsPerTurnThreshold": 5
  }
}
```

## Remediation

- Add retry limits and backoff logic to tool calling
- Implement deduplication of identical tool calls
- Review agent prompts to reduce ambiguity about tool selection
- Consider adding tool call budgets per turn
