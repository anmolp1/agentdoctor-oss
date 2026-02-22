/** Markdown report renderer using template literals. */

import type { DiagnosticResult } from "../models/findings.js";
import { Severity } from "../models/findings.js";
import type { HealthScore, LayerScore } from "../models/scores.js";

export interface ReportData {
  diagnostics: DiagnosticResult;
  healthScore: HealthScore;
  filesAnalyzed: string[];
}

/** Render a full Markdown diagnostic report. */
export function renderMarkdown(data: ReportData): string {
  const sections = [
    renderHeader(data),
    renderExecutiveSummary(data),
    renderHealthBreakdown(data.healthScore),
    renderFindings(data.diagnostics),
    renderUnassessed(data.healthScore),
    renderRecommendations(data.diagnostics),
    renderAppendix(data),
    renderFooter(),
  ];

  return sections.join("\n\n---\n\n");
}

function renderHeader(data: ReportData): string {
  const { diagnostics } = data;
  return `# Agent Health Report

**Generated:** ${diagnostics.analysisTimestamp}
**Tool:** AgentDoctor v0.1.0
**Files:** ${data.filesAnalyzed.length} | **Sessions:** ${diagnostics.sessionsAnalyzed} | **Turns:** ${diagnostics.turnsAnalyzed} | **Tool Calls:** ${diagnostics.toolCallsAnalyzed}`;
}

function renderExecutiveSummary(data: ReportData): string {
  const { healthScore, diagnostics } = data;
  const criticals = diagnostics.findings.filter((f) => f.severity === Severity.Critical).length;
  const warnings = diagnostics.findings.filter((f) => f.severity === Severity.Warning).length;
  const infos = diagnostics.findings.filter((f) => f.severity === Severity.Info).length;

  return `## Executive Summary

**Health Score: ${healthScore.overallScore}/100 (${healthScore.overallGrade})**

${renderScoreBar(healthScore.overallScore)}

| Severity | Count |
|----------|-------|
| CRITICAL | ${criticals} |
| WARNING | ${warnings} |
| INFO | ${infos} |

${healthScore.summary}

**Assessed Layers:** ${healthScore.assessedLayers} of 5`;
}

function renderHealthBreakdown(healthScore: HealthScore): string {
  let section = `## Health Score Breakdown\n\n`;

  if (healthScore.layers.length > 0) {
    section += `| Layer | Score | Grade |\n|-------|-------|-------|\n`;
    for (const layer of healthScore.layers) {
      section += `| ${layer.name} | ${layer.score}/100 | ${layer.grade} |\n`;
    }

    section += "\n";

    for (const layer of healthScore.layers) {
      section += renderLayerDetail(layer);
    }
  }

  // Unassessed layers
  for (const name of healthScore.unassessedLayers) {
    section += `| ${name} | — | *Not assessed* |\n`;
  }

  return section;
}

function renderLayerDetail(layer: LayerScore): string {
  let detail = `### ${layer.name}: ${layer.score}/100 (${layer.grade})\n\n`;
  detail += `${renderScoreBar(layer.score)}\n\n`;
  detail += `${layer.summary}\n\n`;

  if (Object.keys(layer.components).length > 0) {
    detail += `| Component | Score |\n|-----------|-------|\n`;
    for (const [name, score] of Object.entries(layer.components)) {
      detail += `| ${name.replace(/_/g, " ")} | ${score}/100 |\n`;
    }
    detail += "\n";
  }

  if (layer.flags.length > 0) {
    detail += `**Flags:** ${layer.flags.join(", ")}\n\n`;
  }

  return detail;
}

function renderFindings(diagnostics: DiagnosticResult): string {
  if (diagnostics.findings.length === 0) {
    return `## Findings\n\nNo issues detected. Your agent appears healthy.`;
  }

  // Sort: critical -> warning -> info
  const sorted = [...diagnostics.findings].sort((a, b) => {
    const order = { critical: 0, warning: 1, info: 2 };
    return (order[a.severity] ?? 3) - (order[b.severity] ?? 3);
  });

  let section = `## Findings\n\n`;

  for (const finding of sorted) {
    const badge = severityBadge(finding.severity);
    section += `### ${badge} ${finding.title}\n\n`;
    section += `**Pathology:** ${finding.pathology.replace(/_/g, " ")}\n`;
    section += `**Confidence:** ${finding.confidence.toFixed(2)}\n\n`;
    section += `${finding.description}\n\n`;

    if (finding.evidence.length > 0) {
      section += `<details><summary>Evidence</summary>\n\n`;
      for (const ev of finding.evidence) {
        section += `- ${ev.description}\n`;
      }
      section += `\n</details>\n\n`;
    }

    section += `**Recommendation:** ${finding.recommendation}\n\n`;
  }

  return section;
}

function renderUnassessed(_healthScore: HealthScore): string {
  return `## What This Analysis Could Not Assess

- **Recovery Robustness** — requires simulated tool failures
- **Output Quality Baselines** — requires multiple sessions over time
- **Goal Hijacking** — coming in v0.2.0

For continuous monitoring with all 5 diagnostic layers, auto-remediation, and real-time alerting → [mldeep.systems/agentdoctor](https://mldeep.systems/agentdoctor)`;
}

function renderRecommendations(diagnostics: DiagnosticResult): string {
  if (diagnostics.findings.length === 0) {
    return `## Recommendations\n\nNo recommendations — your agent is healthy.`;
  }

  // Deduplicate and rank by severity
  const seen = new Set<string>();
  const recs: Array<{ priority: string; text: string }> = [];

  const sorted = [...diagnostics.findings].sort((a, b) => {
    const order = { critical: 0, warning: 1, info: 2 };
    return (order[a.severity] ?? 3) - (order[b.severity] ?? 3);
  });

  for (const finding of sorted) {
    if (!seen.has(finding.recommendation)) {
      seen.add(finding.recommendation);
      const priority =
        finding.severity === Severity.Critical
          ? "HIGH"
          : finding.severity === Severity.Warning
            ? "MEDIUM"
            : "LOW";
      recs.push({ priority, text: finding.recommendation });
    }
  }

  let section = `## Recommendations\n\n`;
  recs.forEach((rec, idx) => {
    section += `${idx + 1}. **[${rec.priority}]** ${rec.text}\n`;
  });

  return section;
}

function renderAppendix(data: ReportData): string {
  return `## Appendix

**Files Analyzed:** ${data.filesAnalyzed.join(", ")}
**Sessions:** ${data.diagnostics.sessionsAnalyzed}
**Turns:** ${data.diagnostics.turnsAnalyzed}
**Tool Calls:** ${data.diagnostics.toolCallsAnalyzed}
**Analysis Time:** ${data.diagnostics.analysisTimestamp}`;
}

function renderFooter(): string {
  return `*Generated by [AgentDoctor](https://github.com/mldeep-systems/agentdoctor) v0.1.0 — by [MLDeep Systems](https://mldeep.systems)*`;
}

function severityBadge(severity: Severity): string {
  switch (severity) {
    case Severity.Critical:
      return "🔴 CRITICAL:";
    case Severity.Warning:
      return "🟡 WARNING:";
    case Severity.Info:
      return "🔵 INFO:";
  }
}

function renderScoreBar(score: number): string {
  const filled = Math.round(score / 10);
  const empty = 10 - filled;
  const grade = score >= 90 ? "A" : score >= 80 ? "B" : score >= 70 ? "C" : score >= 60 ? "D" : "F";
  return `${"█".repeat(filled)}${"░".repeat(empty)} ${score}/100 (${grade})`;
}
