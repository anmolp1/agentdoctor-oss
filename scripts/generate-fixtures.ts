/**
 * Generates all test fixture files from canonical data.
 *
 * 1. Define sessions in canonical format using builder functions
 * 2. Serialize to each framework format (LangChain, OpenAI, Generic)
 * 3. Write to tests/fixtures/logs/
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURES_DIR = path.join(__dirname, "..", "tests", "fixtures", "logs");

// ──────────────────────────────────────────────────────────────
// Canonical types (inline to avoid import issues with tsx)
// ──────────────────────────────────────────────────────────────

interface Message {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  timestamp?: string;
  tokenCount?: number;
}

interface ToolCall {
  toolName: string;
  toolInput: Record<string, unknown>;
  toolOutput?: string;
  status: "success" | "error" | "timeout" | "partial" | "unknown";
  latencyMs?: number;
  errorMessage?: string;
  retryCount: number;
}

interface Turn {
  messages: Message[];
  toolCalls: ToolCall[];
  turnIndex: number;
  contextTokenCount?: number;
}

interface ToolSchema {
  name: string;
  description?: string;
  parameters?: Record<string, unknown>;
}

interface AgentSession {
  sessionId: string;
  turns: Turn[];
  systemPrompt?: string;
  toolSchemas: ToolSchema[];
  framework?: string;
  agentName?: string;
}

// ──────────────────────────────────────────────────────────────
// Builder functions
// ──────────────────────────────────────────────────────────────

function buildHealthySession(numTurns: number): AgentSession {
  const turns: Turn[] = [];
  // Start at 1000 tokens — system prompt (~225 tokens) will be >20% share
  let contextTokens = 1000;

  // Varied, non-repeating tool usage pattern (avoids oscillation detection)
  const toolSequence = [
    "search", "search", "read_file", "search", "write_file",
    "read_file", "search", "write_file", "search", "search",
    "read_file", "write_file", "read_file", "search", "read_file",
  ];

  for (let i = 0; i < numTurns; i++) {
    // Healthy: slow growth ~50 tokens/turn, with periodic reductions (summarization)
    contextTokens += 40 + (i * 7) % 30;
    // Periodic reduction simulating context management (every 3rd turn)
    if (i % 3 === 2) contextTokens -= 80 + (i * 11) % 60;

    const toolName = toolSequence[i % toolSequence.length]!;
    turns.push({
      messages: [
        { role: "user", content: `User message for turn ${i}: Can you help me with task ${i}?` },
        {
          role: "assistant",
          content: `Sure, I'll help you with task ${i}. Let me use the appropriate tool.`,
        },
      ],
      toolCalls: [
        {
          toolName,
          toolInput: { query: `task ${i} data`, path: `/file${i}.txt` },
          toolOutput: `Result for task ${i}: data processed successfully.`,
          status: "success",
          latencyMs: 150 + (i * 37) % 200,
          retryCount: 0,
        },
      ],
      turnIndex: i,
      contextTokenCount: contextTokens,
    });
  }

  return {
    sessionId: "healthy-session-001",
    turns,
    systemPrompt:
      "You are a helpful coding assistant that helps users with software engineering tasks. " +
      "You have access to the following tools:\n\n" +
      "- `search`: Use this tool to search for information in the codebase, documentation, " +
      "or external sources. Provide a clear search query.\n" +
      "- `read_file`: Use this tool to read the contents of a file. Provide the file path.\n" +
      "- `write_file`: Use this tool to write content to a file. Provide the file path and content.\n\n" +
      "Guidelines:\n" +
      "1. Always verify your results before responding to the user.\n" +
      "2. When making changes, explain what you are doing and why.\n" +
      "3. If you encounter an error, try an alternative approach before giving up.\n" +
      "4. Be concise but thorough in your responses.\n" +
      "5. Always consider edge cases and error handling.\n" +
      "6. Follow best practices for the programming language being used.\n" +
      "7. When searching, use specific and targeted queries.\n" +
      "8. Always read a file before modifying it to understand context.\n" +
      "9. Provide clear explanations of any changes made.\n" +
      "10. If unsure about something, ask the user for clarification.",
    toolSchemas: [
      { name: "search", description: "Search for information" },
      { name: "read_file", description: "Read a file" },
      { name: "write_file", description: "Write a file" },
    ],
  };
}

function buildContextErosionSession(opts: {
  turns: number;
  startTokens: number;
  endTokens: number;
}): AgentSession {
  const turns: Turn[] = [];
  const growthPerTurn = (opts.endTokens - opts.startTokens) / (opts.turns - 1);

  for (let i = 0; i < opts.turns; i++) {
    const contextTokens = Math.round(opts.startTokens + growthPerTurn * i);
    turns.push({
      messages: [
        { role: "user", content: `Query ${i}: Analyze the dataset for anomalies in section ${i}.` },
        {
          role: "assistant",
          content: `I'll analyze section ${i}. The data shows ${"detailed analysis ".repeat(20)} in this area.`,
        },
      ],
      toolCalls: [
        {
          toolName: "analyze_data",
          toolInput: { section: i, depth: "deep" },
          toolOutput: `Analysis result section ${i}: ${"Lorem ipsum ".repeat(50)}`,
          status: "success",
          retryCount: 0,
        },
      ],
      turnIndex: i,
      contextTokenCount: contextTokens,
    });
  }

  return {
    sessionId: "context-erosion-001",
    turns,
    systemPrompt:
      "You are a data analysis assistant. Use the `analyze_data` tool to examine datasets. " +
      "Always provide thorough analysis with supporting evidence.",
    toolSchemas: [{ name: "analyze_data", description: "Analyze data" }],
  };
}

function buildToolThrashingSession(opts: {
  repetitions: number;
  oscillationCycles: number;
}): AgentSession {
  const turns: Turn[] = [];
  let turnIdx = 0;

  // Normal turns
  for (let i = 0; i < 3; i++) {
    turns.push({
      messages: [
        { role: "user", content: `Task ${i}: Find information about topic ${i}.` },
        { role: "assistant", content: `I'll search for topic ${i}.` },
      ],
      toolCalls: [
        {
          toolName: "search",
          toolInput: { query: `topic ${i}` },
          toolOutput: `Results for topic ${i}`,
          status: "success",
          retryCount: 0,
        },
      ],
      turnIndex: turnIdx++,
      contextTokenCount: 3000 + turnIdx * 300,
    });
  }

  // Repetitive calls (same tool, same input)
  const repToolCalls: ToolCall[] = [];
  for (let i = 0; i < opts.repetitions; i++) {
    repToolCalls.push({
      toolName: "search",
      toolInput: { query: "find the answer", filter: "recent" },
      toolOutput: i < opts.repetitions - 1 ? "No results found" : "Found something",
      status: "success",
      retryCount: 0,
    });
  }
  turns.push({
    messages: [
      { role: "user", content: "Find the answer to the main question." },
      { role: "assistant", content: "Let me search for that." },
    ],
    toolCalls: repToolCalls,
    turnIndex: turnIdx++,
    contextTokenCount: 5000,
  });

  // Oscillation pattern: A→B→A→B
  for (let c = 0; c < opts.oscillationCycles; c++) {
    turns.push({
      messages: [
        { role: "user", content: `Check status ${c}` },
        { role: "assistant", content: `Checking status...` },
      ],
      toolCalls: [
        {
          toolName: "read_file",
          toolInput: { path: "/status.txt" },
          toolOutput: "Status: pending",
          status: "success",
          retryCount: 0,
        },
        {
          toolName: "write_file",
          toolInput: { path: "/status.txt", content: "updated" },
          toolOutput: "Written",
          status: "success",
          retryCount: 0,
        },
      ],
      turnIndex: turnIdx++,
      contextTokenCount: 5500 + c * 500,
    });
  }

  // High calls-per-turn
  const manyToolCalls: ToolCall[] = [];
  for (let i = 0; i < 10; i++) {
    manyToolCalls.push({
      toolName: `tool_${i % 3}`,
      toolInput: { item: i },
      toolOutput: `Result ${i}`,
      status: "success",
      retryCount: 0,
    });
  }
  turns.push({
    messages: [
      { role: "user", content: "Process all items." },
      { role: "assistant", content: "Processing..." },
    ],
    toolCalls: manyToolCalls,
    turnIndex: turnIdx++,
    contextTokenCount: 8000,
  });

  return {
    sessionId: "tool-thrashing-001",
    turns,
    systemPrompt:
      "You are an assistant that helps users find and process information. " +
      "Use `search` to find info, `read_file` to read files, `write_file` to write files.",
    toolSchemas: [
      { name: "search", description: "Search for information" },
      { name: "read_file", description: "Read a file" },
      { name: "write_file", description: "Write a file" },
    ],
  };
}

function buildInstructionDriftSession(): AgentSession {
  // System prompt references tools that don't exist in schemas and vice versa
  return {
    sessionId: "instruction-drift-001",
    turns: Array.from({ length: 10 }, (_, i) => ({
      messages: [
        { role: "user" as const, content: `Request ${i}` },
        { role: "assistant" as const, content: `Response ${i}` },
      ],
      toolCalls: [],
      turnIndex: i,
      contextTokenCount: 2000 + i * 200,
    })),
    systemPrompt:
      "You are a coding assistant. Use the `code_search` tool to find code, " +
      "use the `execute_code` tool to run code, and use the `deploy` tool to deploy. " +
      "Always use `lint_code` before deploying. " +
      "You must always validate inputs. Never skip validation. " +
      "You must never validate inputs manually — always use the validation tool.",
    toolSchemas: [
      { name: "code_search", description: "Search code" },
      { name: "run_tests", description: "Run test suite" },
      { name: "format_code", description: "Format code" },
    ],
  };
}

function buildRecoveryBlindnessSession(): AgentSession {
  const turns: Turn[] = [];

  // Turn 0: Normal success
  turns.push({
    messages: [
      { role: "user", content: "Read the configuration file." },
      { role: "assistant", content: "I'll read the config file for you." },
    ],
    toolCalls: [
      {
        toolName: "read_file",
        toolInput: { path: "/config.json" },
        toolOutput: '{"key": "value"}',
        status: "success",
        retryCount: 0,
      },
    ],
    turnIndex: 0,
    contextTokenCount: 2000,
  });

  // Turn 1-2: Error with no recovery (unhandled)
  turns.push({
    messages: [
      { role: "user", content: "Now read the database config." },
      { role: "assistant", content: "Reading database configuration." },
    ],
    toolCalls: [
      {
        toolName: "read_file",
        toolInput: { path: "/db-config.json" },
        status: "error",
        errorMessage: "File not found",
        retryCount: 0,
      },
    ],
    turnIndex: 1,
    contextTokenCount: 2500,
  });

  turns.push({
    messages: [
      {
        role: "assistant",
        content: "The database configuration shows the connection string is set to localhost:5432.",
      },
    ],
    toolCalls: [],
    turnIndex: 2,
    contextTokenCount: 3000,
  });

  // Turn 3-4: Error with blind retry
  turns.push({
    messages: [
      { role: "user", content: "Deploy the application." },
      { role: "assistant", content: "Deploying now." },
    ],
    toolCalls: [
      {
        toolName: "deploy",
        toolInput: { target: "production" },
        status: "error",
        errorMessage: "Connection refused",
        retryCount: 0,
      },
      {
        toolName: "deploy",
        toolInput: { target: "production" },
        status: "error",
        errorMessage: "Connection refused",
        retryCount: 1,
      },
      {
        toolName: "deploy",
        toolInput: { target: "production" },
        status: "error",
        errorMessage: "Connection refused",
        retryCount: 2,
      },
    ],
    turnIndex: 3,
    contextTokenCount: 3500,
  });

  turns.push({
    messages: [
      { role: "assistant", content: "I encountered an error deploying. Let me try a different approach." },
    ],
    toolCalls: [],
    turnIndex: 4,
    contextTokenCount: 4000,
  });

  // Turn 5-6: Error with proper acknowledgment
  turns.push({
    messages: [
      { role: "user", content: "Check the API status." },
      { role: "assistant", content: "Checking API." },
    ],
    toolCalls: [
      {
        toolName: "api_check",
        toolInput: { endpoint: "/health" },
        status: "timeout",
        errorMessage: "Request timed out",
        retryCount: 0,
      },
    ],
    turnIndex: 5,
    contextTokenCount: 4500,
  });

  turns.push({
    messages: [
      {
        role: "assistant",
        content: "Unfortunately, the API health check timed out. This could indicate the service is down.",
      },
    ],
    toolCalls: [],
    turnIndex: 6,
    contextTokenCount: 5000,
  });

  // Turns 7-11: More tool calls, some with high error rate
  for (let i = 7; i < 12; i++) {
    turns.push({
      messages: [
        { role: "user", content: `Task ${i}` },
        { role: "assistant", content: `Working on task ${i}.` },
      ],
      toolCalls: [
        {
          toolName: "api_check",
          toolInput: { endpoint: `/task/${i}` },
          status: i % 2 === 0 ? "error" : "success",
          errorMessage: i % 2 === 0 ? "Service unavailable" : undefined,
          retryCount: 0,
        },
      ],
      turnIndex: i,
      contextTokenCount: 5000 + (i - 7) * 500,
    });
  }

  return {
    sessionId: "recovery-blindness-001",
    turns,
    systemPrompt:
      "You are a DevOps assistant. Use tools to manage deployments and check system health.",
    toolSchemas: [
      { name: "read_file", description: "Read a file" },
      { name: "deploy", description: "Deploy application" },
      { name: "api_check", description: "Check API status" },
    ],
  };
}

function buildHallucinatedSuccessSession(): AgentSession {
  const turns: Turn[] = [];

  // Turn 0: Normal
  turns.push({
    messages: [
      { role: "user", content: "Search for recent sales data." },
      { role: "assistant", content: "I'll search for recent sales data." },
    ],
    toolCalls: [
      {
        toolName: "search",
        toolInput: { query: "recent sales data" },
        toolOutput: '{"results": [{"item": "Widget", "amount": 1500}]}',
        status: "success",
        retryCount: 0,
      },
    ],
    turnIndex: 0,
    contextTokenCount: 2000,
  });

  // Turn 1: Tool fails but agent doesn't acknowledge
  turns.push({
    messages: [
      { role: "user", content: "Get the quarterly report." },
      {
        role: "assistant",
        content:
          "The quarterly report shows revenue of $2.5M, with a 15% increase from last quarter. " +
          "The top performing product was the Enterprise Suite at $1.2M.",
      },
    ],
    toolCalls: [
      {
        toolName: "get_report",
        toolInput: { type: "quarterly", period: "Q4" },
        status: "error",
        errorMessage: "Report not found",
        retryCount: 0,
      },
    ],
    turnIndex: 1,
    contextTokenCount: 2500,
  });

  // Turn 2: Tool returns empty but agent makes claims
  turns.push({
    messages: [
      { role: "user", content: "Look up customer John Smith." },
      {
        role: "assistant",
        content:
          "John Smith is a premium customer with account #12345. " +
          "His last purchase was on January 15, 2026 for $3,200.",
      },
    ],
    toolCalls: [
      {
        toolName: "search",
        toolInput: { query: "John Smith" },
        toolOutput: "{}",
        status: "success",
        retryCount: 0,
      },
    ],
    turnIndex: 2,
    contextTokenCount: 3000,
  });

  // Turn 3: Partial results treated as complete
  turns.push({
    messages: [
      { role: "user", content: "List all products." },
      {
        role: "assistant",
        content: "Here are all the products: Widget A, Widget B, Widget C. That covers our complete catalog.",
      },
    ],
    toolCalls: [
      {
        toolName: "list_products",
        toolInput: {},
        toolOutput:
          '{"products": ["Widget A", "Widget B", "Widget C"], "note": "Results truncated. More results available. Showing first 3 of 150."}',
        status: "success",
        retryCount: 0,
      },
    ],
    turnIndex: 3,
    contextTokenCount: 3500,
  });

  // Turns 4-9: Normal operation
  for (let i = 4; i < 10; i++) {
    turns.push({
      messages: [
        { role: "user", content: `Question ${i}` },
        { role: "assistant", content: `Answer to question ${i}.` },
      ],
      toolCalls: [
        {
          toolName: "search",
          toolInput: { query: `q${i}` },
          toolOutput: `Result for q${i}`,
          status: "success",
          retryCount: 0,
        },
      ],
      turnIndex: i,
      contextTokenCount: 3500 + (i - 4) * 300,
    });
  }

  return {
    sessionId: "hallucinated-success-001",
    turns,
    systemPrompt:
      "You are a sales analytics assistant. Use `search` to find data, " +
      "`get_report` to get reports, and `list_products` to list products.",
    toolSchemas: [
      { name: "search", description: "Search data" },
      { name: "get_report", description: "Get reports" },
      { name: "list_products", description: "List products" },
    ],
  };
}

function buildSilentDegradationSession(): AgentSession[] {
  // 3 sessions × 10 turns with within-session performance drop
  return Array.from({ length: 3 }, (_, sessionIdx) => {
    const turns: Turn[] = [];

    for (let i = 0; i < 10; i++) {
      // Performance degrades in last third
      const isLastThird = i >= 7;
      const errorChance = isLastThird ? 0.6 : 0.1;
      const hasError = Math.random() < errorChance;

      // Deterministic for testing — use turnIndex
      const isError = isLastThird && i % 2 === 0;

      const toolCallsForTurn: ToolCall[] = [
        {
          toolName: "process_data",
          toolInput: { batch: i, session: sessionIdx },
          toolOutput: isError ? undefined : `Processed batch ${i}`,
          status: isError ? "error" : "success",
          errorMessage: isError ? "Processing failed" : undefined,
          retryCount: 0,
        },
      ];

      // Add extra tool calls in last third (inefficiency)
      if (isLastThird) {
        toolCallsForTurn.push({
          toolName: "retry_process",
          toolInput: { batch: i, attempt: 2 },
          toolOutput: "Retry result",
          status: "success",
          retryCount: 1,
        });
        toolCallsForTurn.push({
          toolName: "validate",
          toolInput: { batch: i },
          toolOutput: "Valid",
          status: "success",
          retryCount: 0,
        });
      }

      turns.push({
        messages: [
          { role: "user", content: `Process batch ${i}` },
          { role: "assistant", content: isError ? "I encountered an error processing this batch." : `Batch ${i} processed.` },
        ],
        toolCalls: toolCallsForTurn,
        turnIndex: i,
        contextTokenCount: 2000 + i * 500,
      });
    }

    return {
      sessionId: `silent-degradation-${sessionIdx + 1}`,
      turns,
      systemPrompt: "You are a data processing assistant. Use `process_data` to process batches.",
      toolSchemas: [
        { name: "process_data", description: "Process data batch" },
        { name: "retry_process", description: "Retry processing" },
        { name: "validate", description: "Validate data" },
      ],
    };
  });
}

function buildMultiPathologySession(): AgentSession {
  const turns: Turn[] = [];
  let turnIdx = 0;

  // Context erosion: monotonic growth from 3000 to 60000
  // Tool thrashing: repetitive search calls
  // Recovery blindness: unhandled errors

  for (let i = 0; i < 25; i++) {
    const contextTokens = 3000 + i * 2400; // 3000 → 60600

    const toolCalls: ToolCall[] = [];

    if (i >= 5 && i <= 10) {
      // Tool thrashing region: repetitive search
      for (let j = 0; j < 4; j++) {
        toolCalls.push({
          toolName: "search",
          toolInput: { query: "important data", filter: "all" },
          toolOutput: "No results",
          status: "success",
          retryCount: 0,
        });
      }
    } else if (i >= 15 && i <= 18) {
      // Recovery blindness region: errors with no fallback
      toolCalls.push({
        toolName: "api_call",
        toolInput: { endpoint: "/data" },
        status: "error",
        errorMessage: "Service unavailable",
        retryCount: 0,
      });
    } else {
      toolCalls.push({
        toolName: i % 2 === 0 ? "search" : "read_file",
        toolInput: { query: `task ${i}` },
        toolOutput: `Result ${i}`,
        status: "success",
        retryCount: 0,
      });
    }

    turns.push({
      messages: [
        { role: "user", content: `Task ${i}: Handle request ${i}.` },
        {
          role: "assistant",
          content:
            i >= 15 && i <= 18
              ? `The API returned the data for request ${i}. Processing complete.`
              : `Completed task ${i}.`,
        },
      ],
      toolCalls,
      turnIndex: turnIdx++,
      contextTokenCount: contextTokens,
    });
  }

  return {
    sessionId: "multi-pathology-001",
    turns,
    systemPrompt:
      "You are a multi-purpose assistant. Use `search`, `read_file`, and `api_call` tools.",
    toolSchemas: [
      { name: "search", description: "Search" },
      { name: "read_file", description: "Read files" },
      { name: "api_call", description: "Call API" },
    ],
  };
}

// ──────────────────────────────────────────────────────────────
// Serializers
// ──────────────────────────────────────────────────────────────

function toLangChainFormat(session: AgentSession): object {
  const runs: object[] = [];
  const chainRunId = `chain-${session.sessionId}`;

  // Top-level chain run
  runs.push({
    run_id: chainRunId,
    parent_run_id: null,
    type: "chain",
    name: "AgentExecutor",
    inputs: {
      input: session.turns[0]?.messages[0]?.content ?? "",
      messages: session.systemPrompt
        ? [{ role: "system", content: session.systemPrompt, type: "system" }]
        : [],
    },
    outputs: {
      output: session.turns[session.turns.length - 1]?.messages[1]?.content ?? "",
    },
    start_time: "2026-02-22T10:00:00Z",
    end_time: "2026-02-22T10:30:00Z",
    tags: ["agent"],
  });

  // LLM runs per turn
  for (const turn of session.turns) {
    const llmRunId = `llm-${session.sessionId}-${turn.turnIndex}`;
    const inputMessages = turn.messages
      .filter((m) => m.role === "user")
      .map((m) => ({ role: m.role, content: m.content }));
    const outputMessages = turn.messages
      .filter((m) => m.role === "assistant")
      .map((m) => ({ role: m.role, content: m.content }));

    runs.push({
      run_id: llmRunId,
      parent_run_id: chainRunId,
      type: "llm",
      name: "ChatOpenAI",
      inputs: { messages: inputMessages },
      outputs: { messages: outputMessages },
      start_time: "2026-02-22T10:00:00Z",
      end_time: "2026-02-22T10:00:05Z",
      extra: {
        usage: {
          prompt_tokens: turn.contextTokenCount ? Math.floor(turn.contextTokenCount * 0.7) : 500,
          completion_tokens: 200,
          total_tokens: turn.contextTokenCount ?? 700,
        },
      },
    });

    // Tool runs
    for (let ci = 0; ci < turn.toolCalls.length; ci++) {
      const tc = turn.toolCalls[ci]!;
      runs.push({
        run_id: `tool-${session.sessionId}-${turn.turnIndex}-${ci}`,
        parent_run_id: llmRunId,
        type: "tool",
        name: tc.toolName,
        inputs: tc.toolInput,
        outputs: tc.toolOutput ? { output: tc.toolOutput } : null,
        error: tc.status === "error" ? tc.errorMessage ?? "Tool error" : null,
        start_time: "2026-02-22T10:00:01Z",
        end_time: "2026-02-22T10:00:02Z",
      });
    }
  }

  return { runs };
}

function toOpenAIFormat(session: AgentSession): string {
  const lines: string[] = [];

  for (const turn of session.turns) {
    const requestMessages: object[] = [];

    // Add system prompt on first turn
    if (turn.turnIndex === 0 && session.systemPrompt) {
      requestMessages.push({ role: "system", content: session.systemPrompt });
    }

    // Add user messages
    for (const msg of turn.messages) {
      if (msg.role === "user") {
        requestMessages.push({ role: "user", content: msg.content });
      }
    }

    // Build response
    const assistantMsg = turn.messages.find((m) => m.role === "assistant");
    const toolCalls = turn.toolCalls.map((tc, i) => ({
      id: `call_${turn.turnIndex}_${i}`,
      type: "function",
      function: {
        name: tc.toolName,
        arguments: JSON.stringify(tc.toolInput),
      },
    }));

    const choice: Record<string, unknown> = {
      message: {
        role: "assistant",
        content: assistantMsg?.content ?? null,
        ...(toolCalls.length > 0 ? { tool_calls: toolCalls } : {}),
      },
      finish_reason: toolCalls.length > 0 ? "tool_calls" : "stop",
    };

    const tools = session.toolSchemas.map((ts) => ({
      type: "function",
      function: {
        name: ts.name,
        description: ts.description,
        parameters: ts.parameters ?? { type: "object", properties: {} },
      },
    }));

    const entry = {
      request: {
        model: "gpt-4",
        messages: requestMessages,
        ...(tools.length > 0 ? { tools } : {}),
      },
      response: {
        choices: [choice],
        usage: {
          prompt_tokens: turn.contextTokenCount ? Math.floor(turn.contextTokenCount * 0.7) : 500,
          completion_tokens: 200,
          total_tokens: turn.contextTokenCount ?? 700,
        },
        model: "gpt-4",
      },
    };

    lines.push(JSON.stringify(entry));
  }

  return lines.join("\n");
}

function toGenericFormat(session: AgentSession | AgentSession[]): object {
  const sessions = Array.isArray(session) ? session : [session];

  return {
    sessions: sessions.map((s) => ({
      session_id: s.sessionId,
      system_prompt: s.systemPrompt,
      tool_schemas: s.toolSchemas,
      framework: "generic",
      turns: s.turns.map((t) => ({
        messages: t.messages.map((m) => ({
          role: m.role,
          content: m.content,
        })),
        tool_calls: t.toolCalls.map((tc) => ({
          name: tc.toolName,
          input: tc.toolInput,
          output: tc.toolOutput,
          status: tc.status,
          error: tc.errorMessage,
        })),
        turnIndex: t.turnIndex,
        contextTokenCount: t.contextTokenCount,
      })),
    })),
  };
}

// ──────────────────────────────────────────────────────────────
// Main
// ──────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  // Ensure directories exist
  const langchainDir = path.join(FIXTURES_DIR, "langchain");
  const openaiDir = path.join(FIXTURES_DIR, "openai");
  const genericDir = path.join(FIXTURES_DIR, "generic");

  for (const dir of [langchainDir, openaiDir, genericDir]) {
    fs.mkdirSync(dir, { recursive: true });
  }

  // Build canonical sessions
  const healthySession = buildHealthySession(15);
  const contextErosionSession = buildContextErosionSession({
    turns: 20,
    startTokens: 3000,
    endTokens: 50000,
  });
  const toolThrashingSession = buildToolThrashingSession({
    repetitions: 6,
    oscillationCycles: 4,
  });
  const instructionDriftSession = buildInstructionDriftSession();
  const recoveryBlindnessSession = buildRecoveryBlindnessSession();
  const hallucinatedSuccessSession = buildHallucinatedSuccessSession();
  const silentDegradationSessions = buildSilentDegradationSession();
  const multiPathologySession = buildMultiPathologySession();

  // LangChain fixtures (8)
  const lcFixtures: Record<string, object> = {
    "healthy-session.json": toLangChainFormat(healthySession),
    "context-erosion.json": toLangChainFormat(contextErosionSession),
    "tool-thrashing.json": toLangChainFormat(toolThrashingSession),
    "instruction-drift.json": toLangChainFormat(instructionDriftSession),
    "recovery-blindness.json": toLangChainFormat(recoveryBlindnessSession),
    "hallucinated-success.json": toLangChainFormat(hallucinatedSuccessSession),
    "silent-degradation.json": toLangChainFormat(silentDegradationSessions[0]!),
    "multi-pathology.json": toLangChainFormat(multiPathologySession),
  };

  for (const [name, data] of Object.entries(lcFixtures)) {
    fs.writeFileSync(path.join(langchainDir, name), JSON.stringify(data, null, 2));
    // eslint-disable-next-line no-console
    console.log(`  Generated: langchain/${name}`);
  }

  // OpenAI fixtures (2)
  fs.writeFileSync(
    path.join(openaiDir, "healthy-session.jsonl"),
    toOpenAIFormat(healthySession),
  );
  // eslint-disable-next-line no-console
  console.log("  Generated: openai/healthy-session.jsonl");

  fs.writeFileSync(
    path.join(openaiDir, "context-erosion.jsonl"),
    toOpenAIFormat(contextErosionSession),
  );
  // eslint-disable-next-line no-console
  console.log("  Generated: openai/context-erosion.jsonl");

  // Generic fixtures (2)
  fs.writeFileSync(
    path.join(genericDir, "healthy-session.json"),
    JSON.stringify(toGenericFormat(healthySession), null, 2),
  );
  // eslint-disable-next-line no-console
  console.log("  Generated: generic/healthy-session.json");

  fs.writeFileSync(
    path.join(genericDir, "mixed-pathologies.json"),
    JSON.stringify(toGenericFormat([multiPathologySession, ...silentDegradationSessions]), null, 2),
  );
  // eslint-disable-next-line no-console
  console.log("  Generated: generic/mixed-pathologies.json");

  // Config fixtures
  const configDir = path.join(FIXTURES_DIR, "..", "configs");
  fs.mkdirSync(configDir, { recursive: true });

  fs.writeFileSync(
    path.join(configDir, "strict.json"),
    JSON.stringify(
      {
        contextErosion: { growthRateWarning: 200, growthRateCritical: 1000 },
        toolThrashing: { repetitionWarning: 2, repetitionCritical: 3 },
        recoveryBlindness: { maxBlindRetries: 2, errorRateWarning: 0.1 },
      },
      null,
      2,
    ),
  );

  fs.writeFileSync(
    path.join(configDir, "relaxed.json"),
    JSON.stringify(
      {
        contextErosion: { growthRateWarning: 1000, growthRateCritical: 5000 },
        toolThrashing: { repetitionWarning: 5, repetitionCritical: 8 },
        recoveryBlindness: { maxBlindRetries: 5, errorRateWarning: 0.4 },
      },
      null,
      2,
    ),
  );

  // eslint-disable-next-line no-console
  console.log("  Generated: configs/strict.json, configs/relaxed.json");

  // Sample logs for examples/
  const examplesDir = path.join(__dirname, "..", "examples", "sample-logs");
  fs.mkdirSync(examplesDir, { recursive: true });

  fs.writeFileSync(
    path.join(examplesDir, "healthy-agent.json"),
    JSON.stringify(toGenericFormat(healthySession), null, 2),
  );

  fs.writeFileSync(
    path.join(examplesDir, "degraded-agent.json"),
    JSON.stringify(toGenericFormat(multiPathologySession), null, 2),
  );

  // eslint-disable-next-line no-console
  console.log("\nFixture generation complete! 12 fixture files + 2 configs + 2 examples generated.");
}

main().catch((err) => {
  console.error("Fixture generation failed:", err);
  process.exit(1);
});
