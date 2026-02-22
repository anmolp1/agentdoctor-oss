import { analyze } from "../src/pipeline.js";

async function main() {
  const result = await analyze({
    logFiles: ["tests/fixtures/logs/generic/healthy-session.json"],
    outputFormat: "json",
  });
  // eslint-disable-next-line no-console
  console.log("Score:", result.healthScore.overallScore, result.healthScore.overallGrade);
  // eslint-disable-next-line no-console
  console.log("Findings:", result.diagnostics.findings.length);
  for (const f of result.diagnostics.findings) {
    // eslint-disable-next-line no-console
    console.log(" -", f.severity, f.pathology, f.title);
  }
  // eslint-disable-next-line no-console
  console.log("\nLayers:");
  for (const layer of result.healthScore.layers) {
    // eslint-disable-next-line no-console
    console.log(`  ${layer.name}: ${layer.score} (${layer.grade})`);
    // eslint-disable-next-line no-console
    console.log("    Components:", JSON.stringify(layer.components));
    // eslint-disable-next-line no-console
    console.log("    Flags:", layer.flags);
  }
}

main();
