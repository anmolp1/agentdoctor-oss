# Context Erosion

## What It Is

Context erosion occurs when an agent's context window grows without management,
causing system instructions to become diluted and early conversation context to
become stale. As the context fills up, the agent may lose track of its original
instructions and produce increasingly degraded responses.

## Detection Rules

### 1. Monotonic Growth (Critical)

Fires when the context token count increases monotonically across turns without
any summarization or pruning.

- **Threshold:** `monotonicThreshold` (default: 0.9) — ratio of increasing
  steps required to flag
- **Severity:** Critical

### 2. Instruction Share Decline (Warning/Critical)

Fires when the system prompt becomes a shrinking fraction of the total context.

- **Warning:** instruction share < `instructionShareWarning` (default: 5%)
- **Critical:** instruction share < `instructionShareCritical` (default: 2%)

### 3. Stale Content (Warning)

Fires when a large portion of the context consists of content from much earlier
turns that has not been summarized or pruned.

- **Threshold:** `staleTurnLookback` (default: 5) — turns to look back
- **Severity:** Warning

## Configuration

```json
{
  "contextErosion": {
    "monotonicThreshold": 0.9,
    "instructionShareWarning": 0.05,
    "instructionShareCritical": 0.02,
    "staleTurnLookback": 5,
    "growthRateCritical": 2000
  }
}
```

## Remediation

- Implement context summarization to compress older turns
- Use sliding window approaches to manage context size
- Periodically re-inject system instructions
- Monitor instruction share as a key metric
