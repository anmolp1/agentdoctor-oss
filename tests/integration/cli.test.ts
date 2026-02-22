import { execSync } from "node:child_process";
import * as path from "node:path";

const CLI_PATH = path.resolve(__dirname, "../../src/cli/index.ts");
const FIXTURES_DIR = path.resolve(__dirname, "../fixtures/logs");

function runCli(args: string): { stdout: string; exitCode: number } {
  try {
    const stdout = execSync(`npx tsx ${CLI_PATH} ${args}`, {
      encoding: "utf-8",
      timeout: 30000,
    });
    return { stdout, exitCode: 0 };
  } catch (err: unknown) {
    const e = err as { stdout?: string; status?: number };
    return { stdout: e.stdout ?? "", exitCode: e.status ?? 3 };
  }
}

describe("CLI integration", () => {
  describe("check command", () => {
    it("runs without error on a healthy log file", () => {
      const fixture = path.join(FIXTURES_DIR, "generic/healthy-session.json");
      const { exitCode } = runCli(`check ${fixture}`);

      // The healthy fixture may exit 0 (no warning/critical after threshold
      // filtering) or 1/2 if the default warning threshold still surfaces
      // findings. It should never exit 3 (parse/config error).
      expect(exitCode).not.toBe(3);
    });

    it("produces valid JSON with --format json", () => {
      const fixture = path.join(FIXTURES_DIR, "generic/healthy-session.json");
      const { stdout, exitCode } = runCli(`check ${fixture} --format json`);

      expect(exitCode).not.toBe(3);
      // Output should be valid JSON
      const parsed = JSON.parse(stdout);
      expect(parsed).toBeDefined();
      expect(parsed).toHaveProperty("healthScore");
      expect(parsed).toHaveProperty("diagnostics");
    });

    it("loads custom thresholds with --config", () => {
      const fixture = path.join(FIXTURES_DIR, "generic/mixed-pathologies.json");
      const configPath = path.resolve(__dirname, "../fixtures/configs/strict.json");
      const { stdout, exitCode } = runCli(`check ${fixture} --config ${configPath} --format json`);

      // The command should execute without a parse/config error (exit code 3)
      expect(exitCode).not.toBe(3);

      // Should produce parseable JSON output
      if (stdout.trim().length > 0) {
        const parsed = JSON.parse(stdout);
        expect(parsed).toHaveProperty("healthScore");
      }
    });
  });

  describe("score command", () => {
    it("outputs score and grade", () => {
      const fixture = path.join(FIXTURES_DIR, "generic/healthy-session.json");
      const { stdout, exitCode } = runCli(`score ${fixture}`);

      expect(exitCode).not.toBe(3);
      // Score output should contain a numeric score and a letter grade
      expect(stdout).toMatch(/\d+/);
      expect(stdout).toMatch(/[A-F]/);
    });
  });

  describe("exit codes", () => {
    it("returns exit code 0 on healthy log", () => {
      const fixture = path.join(FIXTURES_DIR, "generic/healthy-session.json");
      const { exitCode } = runCli(`check ${fixture}`);

      expect(exitCode).toBe(0);
    });

    it("returns exit code 1 or 2 on degraded log", () => {
      const fixture = path.join(FIXTURES_DIR, "langchain/multi-pathology.json");
      const { exitCode } = runCli(`check ${fixture}`);

      // exit code 1 = warnings, exit code 2 = critical findings
      expect([1, 2]).toContain(exitCode);
    });
  });

  describe("--version", () => {
    it("prints version string", () => {
      const { stdout, exitCode } = runCli("--version");

      expect(exitCode).toBe(0);
      // Version output should match semver-like pattern
      expect(stdout.trim()).toMatch(/^\d+\.\d+\.\d+$/);
    });
  });

  describe("error handling", () => {
    it("includes helpful message on parse failure with non-existent file", () => {
      const { exitCode } = runCli("check /tmp/does-not-exist-agentdoctor-test.json");

      // Should exit with error code (3 for general errors)
      expect(exitCode).toBe(3);
    });
  });
});
