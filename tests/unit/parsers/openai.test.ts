import * as fs from "node:fs";
import * as path from "node:path";
import { OpenAIParser } from "../../../src/parsers/openai.js";
import { Role, ToolCallStatus } from "../../../src/models/canonical.js";

const FIXTURES_DIR = path.join(__dirname, "../../fixtures/logs");

/**
 * Build a multi-line JSONL string in the direct format (no request/response wrapper)
 * so the parser's JSONL path is taken.
 */
function buildOpenAIJSONL(count: number): string {
  const lines: string[] = [];
  const toolNames = ["search", "read_file", "write_file"];

  for (let i = 0; i < count; i++) {
    const entry: Record<string, unknown> = {
      model: "gpt-4",
      messages: [
        ...(i === 0
          ? [
              {
                role: "system",
                content:
                  "You are a helpful assistant. Use the `search` tool to find information, `read_file` to read files, and `write_file` to write files. Always verify your results before responding.",
              },
            ]
          : []),
        { role: "user", content: `User message for turn ${i}: Can you help me with task ${i}?` },
      ],
      tools: [
        { type: "function", function: { name: "search", description: "Search for information", parameters: { type: "object", properties: {} } } },
        { type: "function", function: { name: "read_file", description: "Read a file", parameters: { type: "object", properties: {} } } },
        { type: "function", function: { name: "write_file", description: "Write a file", parameters: { type: "object", properties: {} } } },
      ],
      choices: [
        {
          message: {
            role: "assistant",
            content: `Sure, I'll help you with task ${i}. Let me use the appropriate tool.`,
            tool_calls: [
              {
                id: `call_${i}_0`,
                type: "function",
                function: {
                  name: toolNames[i % 3],
                  arguments: JSON.stringify({ query: `task ${i} data`, path: `/file${i}.txt` }),
                },
              },
            ],
          },
          finish_reason: "tool_calls",
        },
      ],
      usage: {
        prompt_tokens: 1560 + i * 100,
        completion_tokens: 200,
        total_tokens: 2229 + i * 145,
      },
    };
    lines.push(JSON.stringify(entry));
  }
  return lines.join("\n");
}

describe("OpenAIParser", () => {
  const parser = new OpenAIParser();

  describe("canParse", () => {
    it("identifies valid OpenAI JSONL logs with model, messages, and choices", () => {
      const sample = JSON.stringify({
        model: "gpt-4",
        messages: [{ role: "user", content: "hello" }],
        choices: [{ message: { role: "assistant", content: "hi" } }],
        usage: { total_tokens: 100 },
      });
      expect(parser.canParse("test.jsonl", sample)).toBe(true);
    });

    it("identifies OpenAI logs with request/response wrapper", () => {
      const sample = JSON.stringify({
        request: {
          model: "gpt-4",
          messages: [{ role: "user", content: "hello" }],
        },
        response: {
          choices: [{ message: { role: "assistant", content: "hi" } }],
          usage: { total_tokens: 100 },
          model: "gpt-4",
        },
      });
      expect(parser.canParse("test.jsonl", sample)).toBe(true);
    });

    it("identifies OpenAI logs with model and choices plus usage", () => {
      const sample = JSON.stringify({
        model: "gpt-4",
        choices: [{ message: { role: "assistant", content: "hi" } }],
        usage: { total_tokens: 100 },
      });
      expect(parser.canParse("test.json", sample)).toBe(true);
    });

    it("rejects non-OpenAI logs", () => {
      const sample = JSON.stringify({
        run_id: "abc",
        parent_run_id: null,
        type: "chain",
      });
      expect(parser.canParse("test.json", sample)).toBe(false);
    });

    it("rejects logs with only model field (needs messages or choices)", () => {
      const sample = JSON.stringify({
        model: "gpt-4",
        data: "random",
      });
      expect(parser.canParse("test.json", sample)).toBe(false);
    });
  });

  describe("parse", () => {
    it("parses healthy session JSONL with correct turn count", () => {
      const content = buildOpenAIJSONL(15);
      const sessions = parser.parse("test.jsonl", content);

      expect(sessions.length).toBe(1);
      const session = sessions[0]!;
      expect(session.turns.length).toBe(15);
    });

    it("sets framework to openai", () => {
      const content = buildOpenAIJSONL(3);
      const sessions = parser.parse("test.jsonl", content);

      expect(sessions[0]!.framework).toBe("openai");
    });

    it("extracts system prompt from first request messages", () => {
      const content = buildOpenAIJSONL(3);
      const sessions = parser.parse("test.jsonl", content);

      const session = sessions[0]!;
      expect(session.systemPrompt).toBeDefined();
      expect(session.systemPrompt).toContain("You are a helpful assistant");
    });

    it("extracts tool calls with name, input, output, and status", () => {
      const content = buildOpenAIJSONL(3);
      const sessions = parser.parse("test.jsonl", content);
      const session = sessions[0]!;

      // First turn should have a tool call (search)
      const turn0 = session.turns[0]!;
      expect(turn0.toolCalls.length).toBe(1);

      const toolCall = turn0.toolCalls[0]!;
      expect(toolCall.toolName).toBe("search");
      expect(toolCall.toolInput).toEqual({ query: "task 0 data", path: "/file0.txt" });
      expect(toolCall.status).toBe(ToolCallStatus.Success);
    });

    it("extracts tool schemas from request tools definitions", () => {
      const content = buildOpenAIJSONL(3);
      const sessions = parser.parse("test.jsonl", content);
      const session = sessions[0]!;

      const schemaNames = session.toolSchemas.map((s) => s.name);
      expect(schemaNames).toContain("search");
      expect(schemaNames).toContain("read_file");
      expect(schemaNames).toContain("write_file");
    });

    it("extracts tool schema descriptions", () => {
      const content = buildOpenAIJSONL(3);
      const sessions = parser.parse("test.jsonl", content);
      const session = sessions[0]!;

      const searchSchema = session.toolSchemas.find((s) => s.name === "search");
      expect(searchSchema).toBeDefined();
      expect(searchSchema!.description).toBe("Search for information");
    });

    it("assigns token counts from usage data", () => {
      const content = buildOpenAIJSONL(3);
      const sessions = parser.parse("test.jsonl", content);
      const session = sessions[0]!;

      // First entry has total_tokens: 2229
      expect(session.turns[0]!.contextTokenCount).toBe(2229);
    });

    it("handles missing optional fields gracefully", () => {
      const data = JSON.stringify({
        model: "gpt-4",
        messages: [{ role: "user", content: "hello" }],
        choices: [{ message: { role: "assistant", content: "hi" } }],
      });
      const sessions = parser.parse("test.json", data);
      const session = sessions[0]!;

      expect(session.turns.length).toBe(1);
      expect(session.systemPrompt).toBeUndefined();
      expect(session.turns[0]!.contextTokenCount).toBeUndefined();
    });

    it("handles tool call with malformed arguments JSON", () => {
      const data = JSON.stringify({
        model: "gpt-4",
        messages: [{ role: "user", content: "hello" }],
        choices: [
          {
            message: {
              role: "assistant",
              content: null,
              tool_calls: [
                {
                  id: "call_1",
                  type: "function",
                  function: {
                    name: "bad_tool",
                    arguments: "not valid json{{{",
                  },
                },
              ],
            },
          },
        ],
        usage: { total_tokens: 50 },
      });
      const sessions = parser.parse("test.json", data);
      const toolCall = sessions[0]!.turns[0]!.toolCalls[0]!;
      expect(toolCall.toolName).toBe("bad_tool");
      expect(toolCall.toolInput).toEqual({ raw: "not valid json{{{" });
    });

    it("parses JSON array format", () => {
      const data = JSON.stringify([
        {
          request: {
            model: "gpt-4",
            messages: [{ role: "user", content: "hello" }],
          },
          response: {
            choices: [{ message: { role: "assistant", content: "hi" } }],
            usage: { total_tokens: 50 },
          },
        },
      ]);
      const sessions = parser.parse("test.json", data);
      expect(sessions.length).toBe(1);
      expect(sessions[0]!.turns.length).toBe(1);
    });

    it("maps message roles correctly", () => {
      const data = JSON.stringify({
        model: "gpt-4",
        messages: [
          { role: "system", content: "You are helpful" },
          { role: "user", content: "hello" },
        ],
        choices: [{ message: { role: "assistant", content: "hi" } }],
        usage: { total_tokens: 50 },
      });
      const sessions = parser.parse("test.json", data);
      const messages = sessions[0]!.turns[0]!.messages;

      // System + user from request, assistant from response
      const roles = messages.map((m) => m.role);
      expect(roles).toContain(Role.System);
      expect(roles).toContain(Role.User);
      expect(roles).toContain(Role.Assistant);
    });

    it("throws on empty content", () => {
      expect(() => parser.parse("test.jsonl", "")).toThrow("Empty content");
      expect(() => parser.parse("test.jsonl", "   ")).toThrow("Empty content");
    });

    it("throws on malformed JSON", () => {
      expect(() => parser.parse("test.json", "not valid json{{{")).toThrow(
        "Malformed JSON",
      );
    });

    it("includes session metadata with source file", () => {
      const data = JSON.stringify({
        model: "gpt-4",
        messages: [{ role: "user", content: "hello" }],
        choices: [{ message: { role: "assistant", content: "hi" } }],
        usage: { total_tokens: 50 },
      });
      const sessions = parser.parse("my-file.jsonl", data);
      expect(sessions[0]!.metadata).toEqual({ sourceFile: "my-file.jsonl" });
    });
  });
});
