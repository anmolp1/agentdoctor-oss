# Silent Degradation

## What It Is

Silent degradation occurs when an agent's performance gradually declines over
the course of a session without any obvious error. This can happen when multiple
minor issues compound, or when response quality drops as the session progresses.

## Detection Rules

### 1. Within-Session Performance Drop (Warning)

Fires when measurable performance metrics (tool success rate, response quality
indicators) decline significantly between the first and second halves of a
session.

- **Window:** `degradationWindowSize` (default: 5) turns
- **Threshold:** `degradationThreshold` (default: 0.3) — 30% decline
- **Severity:** Warning

### 2. Compounding Pathologies (Critical)

Fires when multiple distinct pathologies are detected in the same session,
indicating systemic degradation rather than isolated issues.

- **Threshold:** `compoundingMinPathologies` (default: 3) distinct pathologies
- **Severity:** Critical

## Configuration

```json
{
  "silentDegradation": {
    "degradationWindowSize": 5,
    "degradationThreshold": 0.3,
    "compoundingMinPathologies": 3
  }
}
```

## Remediation

- Implement session health monitoring with early warning thresholds
- Set session length limits and restart with fresh context
- Address individual pathologies to prevent compounding
- Add periodic self-assessment checkpoints in long sessions
