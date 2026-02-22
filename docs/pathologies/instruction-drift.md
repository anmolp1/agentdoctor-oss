# Instruction Drift

## What It Is

Instruction drift occurs when an agent's behavior diverges from its system
instructions. This can manifest as the agent using tools it was never given,
ignoring tools it was provided, or following contradictory directives.

## Detection Rules

### 1. Phantom Tools (Critical)

Fires when the agent calls tools that are not defined in its tool schema.

- **Threshold:** `phantomToolMinCalls` (default: 2) — minimum calls to an
  undeclared tool before flagging
- **Severity:** Critical

### 2. Orphaned Tools (Warning)

Fires when tools defined in the schema are never used during the session.

- **Threshold:** `orphanedToolMaxUsage` (default: 0) — maximum usage count
  for a tool to be considered orphaned
- **Severity:** Warning

### 3. Contradictory Directives (Info)

Fires when the system prompt contains instructions that appear to contradict
each other based on Jaccard similarity of directive phrases.

- **Threshold:** `directiveSimilarityThreshold` (default: 0.8)
- **Severity:** Info

## Configuration

```json
{
  "instructionDrift": {
    "phantomToolMinCalls": 2,
    "orphanedToolMaxUsage": 0,
    "directiveSimilarityThreshold": 0.8
  }
}
```

## Remediation

- Audit tool schemas to ensure all available tools are declared
- Remove unused tool definitions to reduce confusion
- Review system prompts for contradictory instructions
- Validate tool calls against the schema at runtime
