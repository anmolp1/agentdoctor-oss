# Recovery Blindness

## What It Is

Recovery blindness occurs when an agent fails to properly handle tool errors.
Instead of adapting its strategy when a tool call fails, the agent either
ignores the error entirely, blindly retries with the same inputs, or
accumulates a high error rate for specific tools.

## Detection Rules

### 1. Unhandled Failures (Critical)

Fires when a tool call fails and the agent does not acknowledge the failure in
its subsequent response.

- **Severity:** Critical

### 2. Blind Retry (Warning)

Fires when the agent retries a failed tool call with identical or very similar
inputs without modifying its approach.

- **Threshold:** `maxRetriesBeforeFlag` (default: 3) consecutive retries
- **Severity:** Warning

### 3. Per-Tool Error Rate (Warning)

Fires when a specific tool has a high failure rate across the session.

- **Threshold:** `errorRateThreshold` (default: 0.5) — 50% failure rate
- **Minimum calls:** `minToolCallsForRate` (default: 3)
- **Severity:** Warning

## Configuration

```json
{
  "recoveryBlindness": {
    "maxRetriesBeforeFlag": 3,
    "errorRateThreshold": 0.5,
    "minToolCallsForRate": 3
  }
}
```

## Remediation

- Implement error handling logic in agent prompts
- Add fallback strategies for common tool failures
- Set maximum retry limits with exponential backoff
- Log and monitor per-tool error rates
