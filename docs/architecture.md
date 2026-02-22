# Architecture

AgentDoctor uses a four-stage pipeline to analyze AI agent logs and produce
health diagnostics.

## Pipeline

```
Log Files → Parse → Detect → Score → Report
```

### 1. Parse

The parser layer auto-detects the log format and converts it into a canonical
`AgentLogBundle` containing one or more `AgentSession` objects.

| Parser    | Format                        | Detection                          |
| --------- | ----------------------------- | ---------------------------------- |
| LangChain | JSON with run_id/parent_run_id| Looks for `run_id` + `type` fields |
| OpenAI    | JSONL or JSON array           | Looks for `model` + `choices`/`usage` |
| Generic   | JSON with sessions/turns      | Looks for `sessions`/`messages`/`events`/`turns` |

The parser registry tries each parser in order. The first one whose `canParse`
method returns `true` is used.

### 2. Detect

Six pathology detectors run independently against the parsed bundle:

- **Context Erosion** — context window grows without management
- **Tool Thrashing** — repetitive or oscillating tool calls
- **Instruction Drift** — behavior diverges from system instructions
- **Recovery Blindness** — failure to handle tool errors
- **Hallucinated Tool Success** — treating failures as successes
- **Silent Degradation** — gradual performance decline

Each detector returns a list of `Finding` objects with severity (Critical,
Warning, Info) and supporting evidence.

### 3. Score

Three scoring layers compute independent scores (0-100):

| Layer                  | Weight | Components                                      |
| ---------------------- | ------ | ----------------------------------------------- |
| Context Health         | 0.40   | Growth management, instruction share, stale content |
| Tool Reliability       | 0.35   | Success rate, calls per turn, thrashing score    |
| Instruction Coherence  | 0.25   | Prompt-schema alignment, consistency, prompt presence |

The composite score is a weighted average, then penalised by findings:

- Critical: -5 per finding (max -25)
- Warning: -2 per finding (max -10)

Grade mapping: A (90+), B (80+), C (70+), D (60+), F (<60).

If a layer returns `null` (insufficient data), its weight is redistributed
proportionally among the remaining layers.

### 4. Report

Reports are generated in Markdown or JSON format. Both include:

- Overall health score and grade
- Per-layer breakdown with component scores
- All findings with severity, evidence, and remediation suggestions
- Session metadata and summary statistics
