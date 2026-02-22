# LangSmith Integration Guide

This guide shows how to export agent logs from LangSmith and analyze them with AgentDoctor.

## Prerequisites

- A [LangSmith](https://smith.langchain.com/) account with agent runs
- LangSmith API key
- AgentDoctor installed (`npm install agentdoctor`)

## Exporting Logs from LangSmith

### Option 1: Using the LangSmith SDK

```python
from langsmith import Client

client = Client()

# Get runs from a specific project
runs = client.list_runs(project_name="my-agent-project")

# Export to JSONL format
with open("langsmith_logs.jsonl", "w") as f:
    for run in runs:
        f.write(run.json() + "\n")
```

### Option 2: Using the LangSmith UI

1. Navigate to your project in the LangSmith dashboard
2. Select the runs you want to analyze
3. Click "Export" → "Export as JSONL"
4. Save the file locally

## Analyzing with AgentDoctor

Once you have the exported logs, run AgentDoctor's health check:

```bash
npx agentdoctor check langsmith_logs.jsonl
```

### Example Output

```
🩺 AgentDoctor Health Report
────────────────────────────────
📊 Overall Health: 67/100 (Moderate)

🔍 Detected Pathologies:
  ⚠️  Tool Thrashing (warning)
      - 3 instances of rapid tool switching
      - Recommendation: Review tool selection logic

  🔴 Context Erosion (critical)
      - 12 turns with context loss
      - Recommendation: Implement context compression

💊 Recommendations:
  1. Add context summarization after 10 turns
  2. Review tool permissions and access patterns
  3. Monitor health score trends over time
```

## Continuous Monitoring

For ongoing agent health monitoring, integrate AgentDoctor into your CI/CD pipeline:

```yaml
# .github/workflows/agent-health.yml
name: Agent Health Check

on:
  schedule:
    - cron: '0 0 * * *'  # Daily at midnight
  workflow_dispatch:

jobs:
  health-check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      
      - name: Export LangSmith logs
        env:
          LANGSMITH_API_KEY: ${{ secrets.LANGSMITH_API_KEY }}
        run: |
          python scripts/export_langsmith_logs.py
      
      - name: Run AgentDoctor
        run: |
          npx agentdoctor check logs/latest.jsonl --output report.md
      
      - name: Upload report
        uses: actions/upload-artifact@v4
        with:
          name: health-report
          path: report.md
```

## Interpreting Results

AgentDoctor analyzes LangSmith logs across three dimensions:

1. **Context Health (40%)** - How well the agent maintains conversation context
2. **Tool Reliability (35%)** - Tool call success rates and patterns
3. **Instruction Coherence (25%)** - Alignment with system instructions

### Health Score Ranges

- **80-100**: Excellent - Agent is performing optimally
- **60-79**: Good - Minor issues, monitor trends
- **40-59**: Fair - Requires attention
- **0-39**: Poor - Immediate action needed

## Best Practices

1. **Regular Monitoring**: Run health checks daily or after major deployments
2. **Baseline Tracking**: Establish a baseline health score and track deviations
3. **Log Rotation**: Keep logs manageable by archiving old runs
4. **Threshold Alerts**: Set up alerts for health scores below your acceptable threshold

## Troubleshooting

### "Parser failed to detect format"

Ensure your LangSmith export includes all required fields. The LangChain parser expects:
- `serialized` or `name` fields for tool identification
- Message arrays with `role` and `content`
- Timestamp information

### "No sessions found"

Check that your JSONL file contains actual run data, not just metadata or summaries.

## Next Steps

- Explore [other pathology detectors](../pathologies/)
- Learn about [custom configuration](../configuration.md)
- Set up [automated health checks](./github-actions.md)

## Resources

- [LangSmith Documentation](https://docs.smith.langchain.com/)
- [AgentDoctor CLI Reference](../README.md#cli-usage)
- [Pathology Reference](../pathologies/)
