import { RecoveryBlindnessDetector } from "../../../src/detectors/recovery-blindness.js";
import { getDefaultConfig } from "../../../src/models/config.js";
import { makeSession, makeBundle, makeTurn, makeToolCall, makeMessage } from "../../helpers.js";
import { Pathology, Severity } from "../../../src/models/findings.js";
import { Role, ToolCallStatus } from "../../../src/models/canonical.js";

describe("RecoveryBlindnessDetector", () => {
  const detector = new RecoveryBlindnessDetector();
  const config = getDefaultConfig();

  it("detects unhandled failures (error status, no acknowledgment in next message)", () => {
    // Turn 0: tool call fails with Error status
    // Turn 1: assistant continues without acknowledging the failure, no tool calls
    const turns = [
      makeTurn({
        turnIndex: 0,
        toolCalls: [
          makeToolCall({
            toolName: "fetch_data",
            toolInput: { url: "http://example.com/api" },
            toolOutput: "Connection refused",
            status: ToolCallStatus.Error,
            errorMessage: "Connection refused",
          }),
        ],
        messages: [
          makeMessage({ role: Role.User, content: "Fetch the data from the API." }),
          makeMessage({ role: Role.Assistant, content: "Let me fetch that for you." }),
        ],
      }),
      makeTurn({
        turnIndex: 1,
        toolCalls: [],
        messages: [
          makeMessage({ role: Role.User, content: "What did you find?" }),
          makeMessage({
            role: Role.Assistant,
            content: "Based on the data I retrieved, here are the results.",
          }),
        ],
      }),
    ];

    const bundle = makeBundle([
      makeSession({
        sessionId: "unhandled-session",
        turns,
        systemPrompt: "You are a helpful assistant. Use `fetch_data` to get data.",
        toolSchemas: [{ name: "fetch_data", description: "Fetch data from URL" }],
      }),
    ]);

    const findings = detector.detect(bundle, config);

    const unhandledFinding = findings.find(
      (f) =>
        f.pathology === Pathology.RecoveryBlindness &&
        f.title.includes("fetch_data") &&
        f.title.includes("proceeds as if succeeded"),
    );
    expect(unhandledFinding).toBeDefined();
    expect(unhandledFinding!.severity).toBe(Severity.Critical);
  });

  it("detects blind retry (same inputs >= 3 times)", () => {
    // Same tool called with identical inputs 3+ times in the same turn after failure
    // Default maxBlindRetries = 3
    const turns = [
      makeTurn({
        turnIndex: 0,
        toolCalls: [
          makeToolCall({
            toolName: "search",
            toolInput: { query: "broken query" },
            toolOutput: "Timeout",
            status: ToolCallStatus.Error,
            errorMessage: "Request timed out",
          }),
          // Retried 3 times with identical inputs
          makeToolCall({
            toolName: "search",
            toolInput: { query: "broken query" },
            toolOutput: "Timeout",
            status: ToolCallStatus.Error,
          }),
          makeToolCall({
            toolName: "search",
            toolInput: { query: "broken query" },
            toolOutput: "Timeout",
            status: ToolCallStatus.Error,
          }),
          makeToolCall({
            toolName: "search",
            toolInput: { query: "broken query" },
            toolOutput: "Timeout",
            status: ToolCallStatus.Error,
          }),
        ],
        messages: [
          makeMessage({ role: Role.User, content: "Search for something." }),
          makeMessage({ role: Role.Assistant, content: "Searching..." }),
        ],
      }),
    ];

    const bundle = makeBundle([
      makeSession({
        sessionId: "blind-retry-session",
        turns,
        systemPrompt: "Use the `search` tool.",
        toolSchemas: [{ name: "search", description: "Search" }],
      }),
    ]);

    const findings = detector.detect(bundle, config);

    const blindRetryFinding = findings.find(
      (f) =>
        f.pathology === Pathology.RecoveryBlindness &&
        f.title.includes("retried") &&
        f.title.includes("identical inputs"),
    );
    expect(blindRetryFinding).toBeDefined();
    expect(blindRetryFinding!.severity).toBe(Severity.Warning);
  });

  it("returns Info for untested failure handling (no errors)", () => {
    // All tool calls succeed — no errors to test recovery against
    const turns = [
      makeTurn({
        turnIndex: 0,
        toolCalls: [
          makeToolCall({
            toolName: "search",
            toolInput: { query: "hello" },
            toolOutput: "Results found",
            status: ToolCallStatus.Success,
          }),
        ],
        messages: [
          makeMessage({ role: Role.User, content: "Search for hello." }),
          makeMessage({ role: Role.Assistant, content: "Here are the results." }),
        ],
      }),
      makeTurn({
        turnIndex: 1,
        toolCalls: [
          makeToolCall({
            toolName: "read_file",
            toolInput: { path: "data.json" },
            toolOutput: '{"key": "value"}',
            status: ToolCallStatus.Success,
          }),
        ],
        messages: [
          makeMessage({ role: Role.User, content: "Read the file." }),
          makeMessage({ role: Role.Assistant, content: "File contents retrieved." }),
        ],
      }),
    ];

    const bundle = makeBundle([
      makeSession({
        sessionId: "untested-session",
        turns,
        systemPrompt: "Use `search` and `read_file`.",
        toolSchemas: [
          { name: "search", description: "Search" },
          { name: "read_file", description: "Read file" },
        ],
      }),
    ]);

    const findings = detector.detect(bundle, config);

    const untestedFinding = findings.find(
      (f) => f.pathology === Pathology.RecoveryBlindness && f.title.includes("recovery untested"),
    );
    expect(untestedFinding).toBeDefined();
    expect(untestedFinding!.severity).toBe(Severity.Info);
  });

  it("detects high error rate per tool", () => {
    // Tool "flaky_api" fails 3 out of 4 times = 75% error rate
    // Default errorRateCritical = 0.5, so 75% => Critical
    const turns = [
      makeTurn({
        turnIndex: 0,
        toolCalls: [
          makeToolCall({
            toolName: "flaky_api",
            toolInput: { endpoint: "/data" },
            toolOutput: "Server error",
            status: ToolCallStatus.Error,
            errorMessage: "500 Internal Server Error",
          }),
          // Fallback to different tool after failure (so not flagged as unhandled)
          makeToolCall({
            toolName: "backup_api",
            toolInput: { endpoint: "/data" },
            toolOutput: "OK",
            status: ToolCallStatus.Success,
          }),
        ],
        messages: [
          makeMessage({ role: Role.User, content: "Get data." }),
          makeMessage({ role: Role.Assistant, content: "I encountered an error, trying backup." }),
        ],
      }),
      makeTurn({
        turnIndex: 1,
        toolCalls: [
          makeToolCall({
            toolName: "flaky_api",
            toolInput: { endpoint: "/users" },
            toolOutput: "Timeout",
            status: ToolCallStatus.Error,
            errorMessage: "Request timed out",
          }),
          makeToolCall({
            toolName: "backup_api",
            toolInput: { endpoint: "/users" },
            toolOutput: "OK",
            status: ToolCallStatus.Success,
          }),
        ],
        messages: [
          makeMessage({ role: Role.User, content: "Get users." }),
          makeMessage({
            role: Role.Assistant,
            content: "The API had an error again, using backup.",
          }),
        ],
      }),
      makeTurn({
        turnIndex: 2,
        toolCalls: [
          makeToolCall({
            toolName: "flaky_api",
            toolInput: { endpoint: "/status" },
            toolOutput: "Server error",
            status: ToolCallStatus.Error,
            errorMessage: "503 Service Unavailable",
          }),
          makeToolCall({
            toolName: "backup_api",
            toolInput: { endpoint: "/status" },
            toolOutput: "OK",
            status: ToolCallStatus.Success,
          }),
        ],
        messages: [
          makeMessage({ role: Role.User, content: "Check status." }),
          makeMessage({
            role: Role.Assistant,
            content: "Unfortunately the primary API failed, using fallback.",
          }),
        ],
      }),
      makeTurn({
        turnIndex: 3,
        toolCalls: [
          makeToolCall({
            toolName: "flaky_api",
            toolInput: { endpoint: "/health" },
            toolOutput: "OK",
            status: ToolCallStatus.Success,
          }),
        ],
        messages: [
          makeMessage({ role: Role.User, content: "Health check." }),
          makeMessage({ role: Role.Assistant, content: "Health check passed." }),
        ],
      }),
    ];

    const bundle = makeBundle([
      makeSession({
        sessionId: "high-error-rate-session",
        turns,
        systemPrompt: "Use `flaky_api` and `backup_api`.",
        toolSchemas: [
          { name: "flaky_api", description: "Primary API" },
          { name: "backup_api", description: "Backup API" },
        ],
      }),
    ]);

    const findings = detector.detect(bundle, config);

    const errorRateFinding = findings.find(
      (f) =>
        f.pathology === Pathology.RecoveryBlindness &&
        f.title.includes("flaky_api") &&
        f.title.includes("error rate"),
    );
    expect(errorRateFinding).toBeDefined();
    expect(errorRateFinding!.severity).toBe(Severity.Critical);
  });
});
