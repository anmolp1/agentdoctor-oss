/** Test factories and shared utilities. */

import type { AgentSession, Turn, Message, ToolCall, AgentLogBundle, ToolSchema } from "../src/models/canonical.js";
import { Role, ToolCallStatus } from "../src/models/canonical.js";
import type { Finding, DiagnosticResult } from "../src/models/findings.js";
import { Pathology, Severity } from "../src/models/findings.js";

/** Create a basic message. */
export function makeMessage(overrides: Partial<Message> = {}): Message {
  return {
    role: Role.User,
    content: "Test message",
    ...overrides,
  };
}

/** Create a basic tool call. */
export function makeToolCall(overrides: Partial<ToolCall> = {}): ToolCall {
  return {
    toolName: "test_tool",
    toolInput: { key: "value" },
    toolOutput: "output",
    status: ToolCallStatus.Success,
    retryCount: 0,
    ...overrides,
  };
}

/** Create a basic turn. */
export function makeTurn(overrides: Partial<Turn> & { turnIndex?: number } = {}): Turn {
  return {
    messages: [makeMessage({ role: Role.User }), makeMessage({ role: Role.Assistant, content: "Response" })],
    toolCalls: [],
    turnIndex: 0,
    ...overrides,
  };
}

/** Create a session with configurable turns. */
export function makeSession(overrides: Partial<AgentSession> = {}): AgentSession {
  return {
    sessionId: "test-session-001",
    turns: [makeTurn()],
    systemPrompt: "You are a test assistant. Use the `test_tool` to help users.",
    toolSchemas: [{ name: "test_tool", description: "A test tool" }],
    ...overrides,
  };
}

/** Create a log bundle. */
export function makeBundle(sessions?: AgentSession[]): AgentLogBundle {
  return {
    sessions: sessions ?? [makeSession()],
    sourceFiles: ["test-file.json"],
  };
}

/** Create a healthy session with stable metrics. */
export function makeHealthySession(numTurns = 10): AgentSession {
  const turns: Turn[] = [];
  let tokens = 2000;

  for (let i = 0; i < numTurns; i++) {
    tokens += 50 + Math.floor(i * 10);
    if (i % 4 === 3) tokens -= 30; // Occasional plateau

    turns.push({
      messages: [
        { role: Role.User, content: `Question ${i}` },
        { role: Role.Assistant, content: `Answer ${i}` },
      ],
      toolCalls: [
        {
          toolName: i % 2 === 0 ? "search" : "read_file",
          toolInput: { query: `q${i}` },
          toolOutput: `Result ${i}`,
          status: ToolCallStatus.Success,
          retryCount: 0,
        },
      ],
      turnIndex: i,
      contextTokenCount: tokens,
    });
  }

  return {
    sessionId: "healthy-001",
    turns,
    systemPrompt:
      "You are a helpful assistant. Use the `search` tool to find information and `read_file` to read files.",
    toolSchemas: [
      { name: "search", description: "Search" },
      { name: "read_file", description: "Read files" },
    ],
  };
}

/** Create a finding. */
export function makeFinding(overrides: Partial<Finding> = {}): Finding {
  return {
    pathology: Pathology.ContextErosion,
    severity: Severity.Warning,
    title: "Test finding",
    description: "Test description",
    evidence: [{ description: "Evidence" }],
    recommendation: "Fix it",
    affectedSessions: ["test-session-001"],
    confidence: 0.8,
    ...overrides,
  };
}

/** Create a diagnostic result. */
export function makeDiagnosticResult(
  findings: Finding[] = [],
  overrides: Partial<DiagnosticResult> = {},
): DiagnosticResult {
  return {
    findings,
    sessionsAnalyzed: 1,
    turnsAnalyzed: 10,
    toolCallsAnalyzed: 10,
    analysisTimestamp: "2026-02-22T10:00:00Z",
    configUsed: {},
    ...overrides,
  };
}
