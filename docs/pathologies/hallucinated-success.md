# Hallucinated Tool Success

## What It Is

Hallucinated tool success occurs when an agent treats a failed or incomplete
tool call as if it succeeded. The agent may claim success despite error
indicators in the output, accept empty results, or treat partial data as
complete.

## Detection Rules

### 1. Status/Output Mismatch (Critical)

Fires when a tool call is marked as successful but the output contains error
keywords indicating failure.

- **Keywords:** error, fail, exception, denied, timeout, refused, not found,
  unauthorized, forbidden, invalid
- **Severity:** Critical

### 2. Empty Output Claims (Warning)

Fires when a tool call returns empty or near-empty output but the agent's
response references specific results.

- **Threshold:** `emptyOutputMinLength` (default: 5) — output shorter than
  this is considered empty
- **Severity:** Warning

### 3. Partial Result Acceptance (Warning)

Fires when tool output contains indicators of partial or incomplete results
but the agent treats them as complete.

- **Severity:** Warning

## Configuration

```json
{
  "hallucinatedSuccess": {
    "emptyOutputMinLength": 5,
    "errorKeywords": [
      "error", "fail", "exception", "denied", "timeout",
      "refused", "not found", "unauthorized", "forbidden", "invalid"
    ]
  }
}
```

## Remediation

- Validate tool outputs before using them in responses
- Implement output parsing to detect error patterns
- Add explicit success/failure checks in agent logic
- Train agents to acknowledge and report partial results
