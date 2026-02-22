import * as fs from "node:fs";
import * as path from "node:path";
import { LangChainParser } from "../../../src/parsers/langchain.js";
import { ToolCallStatus } from "../../../src/models/canonical.js";

const FIXTURES_DIR = path.join(__dirname, "../../fixtures/logs");

describe("LangChainParser", () => {
  const parser = new LangChainParser();

  describe("canParse", () => {
    it("identifies valid LangChain logs with run_id and parent_run_id", () => {
      const sample = JSON.stringify({
        run_id: "abc-123",
        parent_run_id: null,
        type: "chain",
        name: "AgentExecutor",
      });
      expect(parser.canParse("test.json", sample)).toBe(true);
    });

    it("identifies LangChain logs with serialized field", () => {
      const sample = JSON.stringify({
        serialized: { name: "AgentExecutor" },
        inputs: {},
      });
      expect(parser.canParse("test.json", sample)).toBe(true);
    });

    it("identifies LangChain logs with type + llm/chain/tool patterns", () => {
      const sample = JSON.stringify({
        type: "llm",
        name: "ChatOpenAI",
        inputs: { messages: [] },
        outputs: {},
      });
      expect(parser.canParse("test.json", sample)).toBe(true);
    });

    it("identifies LangChain logs with callback pattern (name + tags + inputs)", () => {
      const sample = JSON.stringify({
        name: "AgentExecutor",
        tags: ["agent"],
        inputs: { input: "hello" },
      });
      expect(parser.canParse("test.json", sample)).toBe(true);
    });

    it("rejects non-LangChain logs", () => {
      const sample = JSON.stringify({
        id: "some-id",
        data: "some random data",
        timestamp: "2026-01-01",
      });
      expect(parser.canParse("test.json", sample)).toBe(false);
    });

    it("rejects plain OpenAI-style logs without LangChain markers", () => {
      const sample = JSON.stringify({
        model: "gpt-4",
        messages: [{ role: "user", content: "hello" }],
        choices: [{ message: { role: "assistant", content: "hi" } }],
        usage: { total_tokens: 100 },
      });
      expect(parser.canParse("test.json", sample)).toBe(false);
    });
  });

  describe("parse", () => {
    it("parses healthy session fixture with correct turn count", () => {
      const fixturePath = path.join(FIXTURES_DIR, "langchain/healthy-session.json");
      const content = fs.readFileSync(fixturePath, "utf-8");
      const sessions = parser.parse(fixturePath, content);

      expect(sessions.length).toBeGreaterThanOrEqual(1);
      const session = sessions[0]!;
      // The fixture has 1 chain + 15 LLM runs = 16 llm/chain turns
      expect(session.turns.length).toBe(16);
    });

    it("sets framework to langchain", () => {
      const fixturePath = path.join(FIXTURES_DIR, "langchain/healthy-session.json");
      const content = fs.readFileSync(fixturePath, "utf-8");
      const sessions = parser.parse(fixturePath, content);

      expect(sessions[0]!.framework).toBe("langchain");
    });

    it("extracts system prompt from first chain input messages", () => {
      const fixturePath = path.join(FIXTURES_DIR, "langchain/healthy-session.json");
      const content = fs.readFileSync(fixturePath, "utf-8");
      const sessions = parser.parse(fixturePath, content);

      const session = sessions[0]!;
      expect(session.systemPrompt).toBeDefined();
      expect(session.systemPrompt).toContain("You are a helpful");
    });

    it("extracts system prompt from direct system field in inputs", () => {
      const data = JSON.stringify([
        {
          run_id: "r1",
          parent_run_id: null,
          type: "llm",
          name: "ChatOpenAI",
          inputs: {
            system: "You are a coding assistant.",
            messages: [{ role: "user", content: "Write code" }],
          },
          outputs: {
            messages: [{ role: "assistant", content: "Here is code" }],
          },
        },
      ]);
      const sessions = parser.parse("test.json", data);
      expect(sessions[0]!.systemPrompt).toBe("You are a coding assistant.");
    });

    it("extracts tool calls with name, input, output, and status", () => {
      // Use flat array where all runs are top-level (no parent grouping issues)
      const data = JSON.stringify([
        {
          run_id: "llm-1",
          parent_run_id: null,
          type: "llm",
          name: "ChatOpenAI",
          inputs: { messages: [{ role: "user", content: "help me" }] },
          outputs: { messages: [{ role: "assistant", content: "sure" }] },
        },
        {
          run_id: "tool-1",
          parent_run_id: "llm-1",
          type: "tool",
          name: "search",
          inputs: { query: "task 0 data", path: "/file0.txt" },
          outputs: { output: "Result found" },
          error: null,
          start_time: "2026-02-22T10:00:01Z",
          end_time: "2026-02-22T10:00:02Z",
        },
      ]);
      const sessions = parser.parse("test.json", data);
      const session = sessions[0]!;
      const turn0 = session.turns[0]!;

      expect(turn0.toolCalls.length).toBe(1);

      const toolCall = turn0.toolCalls[0]!;
      expect(toolCall.toolName).toBe("search");
      expect(toolCall.toolInput).toEqual({ query: "task 0 data", path: "/file0.txt" });
      expect(toolCall.toolOutput).toBeDefined();
      expect(toolCall.status).toBe(ToolCallStatus.Success);
    });

    it("marks tool calls with errors as Error status", () => {
      const data = JSON.stringify([
        {
          run_id: "llm-1",
          parent_run_id: null,
          type: "llm",
          name: "ChatOpenAI",
          inputs: { messages: [{ role: "user", content: "Do something" }] },
          outputs: { messages: [{ role: "assistant", content: "Trying" }] },
        },
        {
          run_id: "tool-1",
          parent_run_id: "llm-1",
          type: "tool",
          name: "failing_tool",
          inputs: { query: "test" },
          outputs: null,
          error: "Connection refused",
        },
      ]);
      const sessions = parser.parse("test.json", data);
      const toolCalls = sessions[0]!.turns[0]!.toolCalls;

      expect(toolCalls.length).toBe(1);
      expect(toolCalls[0]!.status).toBe(ToolCallStatus.Error);
      expect(toolCalls[0]!.errorMessage).toBe("Connection refused");
    });

    it("extracts tool schemas from tool runs", () => {
      const data = JSON.stringify([
        {
          run_id: "llm-1",
          parent_run_id: null,
          type: "llm",
          name: "ChatOpenAI",
          inputs: { messages: [{ role: "user", content: "hello" }] },
          outputs: { messages: [{ role: "assistant", content: "hi" }] },
        },
        {
          run_id: "tool-1",
          parent_run_id: "llm-1",
          type: "tool",
          name: "search",
          inputs: { query: "data" },
          outputs: { output: "found" },
          error: null,
        },
        {
          run_id: "tool-2",
          parent_run_id: "llm-1",
          type: "tool",
          name: "read_file",
          inputs: { path: "/f.txt" },
          outputs: { output: "content" },
          error: null,
        },
        {
          run_id: "tool-3",
          parent_run_id: "llm-1",
          type: "tool",
          name: "write_file",
          inputs: { path: "/f.txt", content: "data" },
          outputs: { output: "ok" },
          error: null,
        },
      ]);
      const sessions = parser.parse("test.json", data);
      const session = sessions[0]!;

      const schemaNames = session.toolSchemas.map((s) => s.name);
      expect(schemaNames).toContain("search");
      expect(schemaNames).toContain("read_file");
      expect(schemaNames).toContain("write_file");
    });

    it("computes tool call latency from start_time and end_time", () => {
      const data = JSON.stringify([
        {
          run_id: "llm-1",
          parent_run_id: null,
          type: "llm",
          name: "ChatOpenAI",
          inputs: { messages: [{ role: "user", content: "test" }] },
          outputs: { messages: [{ role: "assistant", content: "ok" }] },
        },
        {
          run_id: "tool-1",
          parent_run_id: "llm-1",
          type: "tool",
          name: "search",
          inputs: { query: "data" },
          outputs: { output: "found" },
          error: null,
          start_time: "2026-02-22T10:00:01Z",
          end_time: "2026-02-22T10:00:02Z",
        },
      ]);
      const sessions = parser.parse("test.json", data);
      const toolCall = sessions[0]!.turns[0]!.toolCalls[0]!;
      expect(toolCall.latencyMs).toBe(1000);
    });

    it("handles missing optional fields gracefully", () => {
      const data = JSON.stringify([
        {
          run_id: "minimal-1",
          parent_run_id: null,
          type: "llm",
          inputs: {
            messages: [{ role: "user", content: "hello" }],
          },
          outputs: {
            messages: [{ role: "assistant", content: "hi" }],
          },
        },
      ]);
      const sessions = parser.parse("test.json", data);
      const session = sessions[0]!;

      expect(session.turns.length).toBe(1);
      expect(session.systemPrompt).toBeUndefined();
      expect(session.startTime).toBeUndefined();
      expect(session.endTime).toBeUndefined();
    });

    it("handles runs without explicit type by treating each as a turn", () => {
      const data = JSON.stringify([
        {
          run_id: "r1",
          parent_run_id: null,
          inputs: { input: "Hello" },
          outputs: { output: "World" },
        },
      ]);
      const sessions = parser.parse("test.json", data);
      expect(sessions[0]!.turns.length).toBeGreaterThan(0);
    });

    it("parses a single run object (not wrapped in array)", () => {
      const data = JSON.stringify({
        run_id: "single-run",
        parent_run_id: null,
        type: "llm",
        inputs: { messages: [{ role: "user", content: "test" }] },
        outputs: { messages: [{ role: "assistant", content: "response" }] },
      });
      const sessions = parser.parse("test.json", data);
      expect(sessions.length).toBeGreaterThanOrEqual(1);
      expect(sessions[0]!.turns.length).toBe(1);
    });

    it("parses { runs: [...] } wrapper format", () => {
      const data = JSON.stringify({
        runs: [
          {
            run_id: "r1",
            parent_run_id: null,
            type: "llm",
            inputs: { messages: [{ role: "user", content: "test" }] },
            outputs: { messages: [{ role: "assistant", content: "resp" }] },
          },
        ],
      });
      const sessions = parser.parse("test.json", data);
      expect(sessions.length).toBeGreaterThanOrEqual(1);
    });

    it("throws on empty content", () => {
      expect(() => parser.parse("test.json", "")).toThrow("Empty content");
      expect(() => parser.parse("test.json", "   ")).toThrow("Empty content");
    });

    it("throws on malformed JSON", () => {
      expect(() => parser.parse("test.json", "not valid json {{{")).toThrow(
        "Malformed JSON",
      );
    });

    it("includes session metadata with source file", () => {
      const data = JSON.stringify([
        {
          run_id: "r1",
          parent_run_id: null,
          type: "llm",
          inputs: { messages: [{ role: "user", content: "hello" }] },
          outputs: { messages: [{ role: "assistant", content: "hi" }] },
        },
      ]);
      const sessions = parser.parse("my-file.json", data);
      expect(sessions[0]!.metadata).toEqual({ sourceFile: "my-file.json" });
    });

    it("assigns token counts from usage data", () => {
      const data = JSON.stringify([
        {
          run_id: "r1",
          parent_run_id: null,
          type: "llm",
          name: "ChatOpenAI",
          inputs: { messages: [{ role: "user", content: "hello" }] },
          outputs: { messages: [{ role: "assistant", content: "hi" }] },
          extra: {
            usage: {
              prompt_tokens: 100,
              completion_tokens: 50,
              total_tokens: 150,
            },
          },
        },
      ]);
      const sessions = parser.parse("test.json", data);
      expect(sessions[0]!.turns[0]!.contextTokenCount).toBe(150);
    });
  });
});
