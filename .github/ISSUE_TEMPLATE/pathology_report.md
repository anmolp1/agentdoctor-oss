---
name: Pathology Report
about: Report a new agent pathology pattern you've observed in the wild
title: "[Pathology] "
labels: pathology-report
assignees: ""
---

## Pathology Name

A short, descriptive name for the failure pattern (e.g., "Prompt Echo Loop").

## Description

Describe the agent failure pattern you observed. What goes wrong, and why is it harmful?

## Observable Symptoms

How does this pathology manifest in agent logs? What signals indicate it is occurring?

- [ ] Visible in tool call patterns
- [ ] Visible in message content
- [ ] Visible in token counts / context growth
- [ ] Visible in timing / latency data
- [ ] Other: ...

## Detection Heuristic

Describe a heuristic or algorithm that could detect this pathology from agent logs.

```
Pseudocode or description of the detection logic:
1. ...
2. ...
3. ...
```

## Example Evidence

If possible, provide a sanitized example showing the pathology in action.

```json

```

## Severity Assessment

- **How common is this?** (rare / occasional / frequent)
- **What is the impact?** (minor degradation / significant failure / complete breakdown)
- **Is it recoverable?** (self-correcting / needs intervention / session is lost)

## Affected Frameworks

Which agent frameworks have you observed this in?

- [ ] LangChain / LangGraph
- [ ] OpenAI Assistants API
- [ ] AutoGen
- [ ] CrewAI
- [ ] Custom framework
- [ ] Other: ...

## Related Pathologies

Does this relate to any of AgentDoctor's existing pathologies?

- [ ] Context Erosion
- [ ] Tool Thrashing
- [ ] Instruction Drift
- [ ] Recovery Blindness
- [ ] Hallucinated Tool Success
- [ ] Silent Degradation
- [ ] None / New category

## Additional Context

Any other context, papers, blog posts, or references related to this pattern.
