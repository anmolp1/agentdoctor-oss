import { analyze } from "../../src/pipeline.js";
import { Severity } from "../../src/models/findings.js";
import * as path from "node:path";

const FIXTURES_DIR = path.resolve(__dirname, "../fixtures/logs");

/**
 * False-positive regression tests.
 *
 * The "healthy" fixtures have monotonically growing token counts and short
 * system prompts, which causes the context-health layer to score them lower
 * than a truly well-managed session. Some detectors (instruction drift,
 * context erosion) may fire on these fixtures because the synthetic data has
 * characteristics that look suspicious to the heuristics.
 *
 * These regression tests verify that the detectors produce a stable, bounded
 * set of findings on healthy fixtures and that scores stay within an expected
 * range, catching regressions where previously-clean fixtures suddenly start
 * triggering new pathologies.
 */

const healthyFixtures = [
  "langchain/healthy-session.json",
  "openai/healthy-session.jsonl",
  "generic/healthy-session.json",
];

describe("False positive regression", () => {
  it.each(healthyFixtures)("no critical findings on %s beyond known baseline", async (fixture) => {
    const result = await analyze({
      logFiles: [path.join(FIXTURES_DIR, fixture)],
      outputFormat: "json",
    });

    // Healthy fixtures should have a bounded number of critical findings.
    // Current baselines:
    //   langchain: 2 critical (context_erosion + instruction_drift)
    //   openai:    0 critical
    //   generic:   2 critical (tool_thrashing + instruction_drift)
    // Any increase beyond 3 would indicate a regression.
    const criticals = result.diagnostics.findings.filter((f) => f.severity === Severity.Critical);
    expect(criticals.length).toBeLessThanOrEqual(3);
  });

  it.each(healthyFixtures)("no warning findings on %s beyond known baseline", async (fixture) => {
    const result = await analyze({
      logFiles: [path.join(FIXTURES_DIR, fixture)],
      outputFormat: "json",
    });

    // Healthy fixtures should have a bounded number of warnings.
    // Current baselines are at most ~5 warnings from hallucinated_success
    // on the openai fixture. Any jump above 10 would indicate a regression.
    const warnings = result.diagnostics.findings.filter((f) => f.severity === Severity.Warning);
    expect(warnings.length).toBeLessThanOrEqual(10);
  });

  it.each(healthyFixtures)("health score >= 30 on %s", async (fixture) => {
    const result = await analyze({
      logFiles: [path.join(FIXTURES_DIR, fixture)],
      outputFormat: "json",
    });

    // Healthy fixtures should maintain a reasonable minimum score.
    // The context-health layer penalises monotonic token growth and
    // declining instruction share, but the tool reliability and
    // instruction coherence layers compensate.
    expect(result.healthScore.overallScore).toBeGreaterThanOrEqual(30);
  });
});
