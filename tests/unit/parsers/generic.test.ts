import * as fs from "node:fs";
import * as path from "node:path";
import { GenericParser } from "../../../src/parsers/generic.js";
import { Role, ToolCallStatus } from "../../../src/models/canonical.js";

const FIXTURES_DIR = path.join(__dirname, "../../fixtures/logs");

describe("GenericParser", () => {
  const parser = new GenericParser();

  describe("canParse", () => {
    it("identifies logs with messages array", () => {
      const sample = JSON.stringify({
        messages: [
          { role: "user", content: "hello" },
          { role: "assistant", content: "hi" },
        ],
      });
      expect(parser.canParse("test.json", sample)).toBe(true);
    });

    it("identifies logs with turns array", () => {
      const sample = JSON.stringify({
        turns: [
          {
            messages: [{ role: "user", content: "hello" }],
            tool_calls: [],
          },
        ],
      });
      expect(parser.canParse("test.json", sample)).toBe(true);
    });

    it("identifies logs with events array", () => {
      const sample = JSON.stringify({
        events: [
          { type: "user", content: "hello" },
          { type: "assistant", content: "hi" },
        ],
      });
      expect(parser.canParse("test.json", sample)).toBe(true);
    });

    it("rejects logs without messages, turns, or events", () => {
      const sample = JSON.stringify({
        id: "some-id",
        data: "random",
        timestamp: "2026-01-01",
      });
      expect(parser.canParse("test.json", sample)).toBe(false);
    });

    it("rejects empty JSON object", () => {
      const sample = JSON.stringify({});
      expect(parser.canParse("test.json", sample)).toBe(false);
    });
  });

  describe("parse", () => {
    it("parses healthy session fixture with correct turn count", () => {
      const fixturePath = path.join(FIXTURES_DIR, "generic/healthy-session.json");
      const content = fs.readFileSync(fixturePath, "utf-8");
      const sessions = parser.parse(fixturePath, content);

      expect(sessions.length).toBeGreaterThanOrEqual(1);
      const session = sessions[0]!;
      // The fixture has 15 turns (indices 0-14)
      expect(session.turns.length).toBe(15);
    });

    it("sets framework to generic", () => {
      const fixturePath = path.join(FIXTURES_DIR, "generic/healthy-session.json");
      const content = fs.readFileSync(fixturePath, "utf-8");
      const sessions = parser.parse(fixturePath, content);

      expect(sessions[0]!.framework).toBe("generic");
    });

    it("extracts system prompt from session data", () => {
      const fixturePath = path.join(FIXTURES_DIR, "generic/healthy-session.json");
      const content = fs.readFileSync(fixturePath, "utf-8");
      const sessions = parser.parse(fixturePath, content);

      const session = sessions[0]!;
      expect(session.systemPrompt).toBeDefined();
      expect(session.systemPrompt).toContain("You are a helpful");
    });

    it("extracts system prompt from system_prompt field", () => {
      const data = JSON.stringify({
        system_prompt: "You are an expert coder.",
        turns: [
          {
            messages: [
              { role: "user", content: "Write code" },
              { role: "assistant", content: "Here is code" },
            ],
          },
        ],
      });
      const sessions = parser.parse("test.json", data);
      expect(sessions[0]!.systemPrompt).toBe("You are an expert coder.");
    });

    it("extracts system prompt from system messages in flat messages array", () => {
      const data = JSON.stringify({
        messages: [
          { role: "system", content: "You are helpful." },
          { role: "user", content: "hello" },
          { role: "assistant", content: "hi" },
        ],
      });
      const sessions = parser.parse("test.json", data);
      expect(sessions[0]!.systemPrompt).toBe("You are helpful.");
    });

    it("extracts tool calls with name, input, output, and status", () => {
      const fixturePath = path.join(FIXTURES_DIR, "generic/healthy-session.json");
      const content = fs.readFileSync(fixturePath, "utf-8");
      const sessions = parser.parse(fixturePath, content);
      const session = sessions[0]!;

      // First turn should have a tool call (search)
      const turn0 = session.turns[0]!;
      expect(turn0.toolCalls.length).toBe(1);

      const toolCall = turn0.toolCalls[0]!;
      expect(toolCall.toolName).toBe("search");
      expect(toolCall.toolInput).toEqual({ query: "task 0 data", path: "/file0.txt" });
      expect(toolCall.toolOutput).toBeDefined();
      expect(toolCall.status).toBe(ToolCallStatus.Success);
    });

    it("extracts tool schemas from tool_schemas field", () => {
      const fixturePath = path.join(FIXTURES_DIR, "generic/healthy-session.json");
      const content = fs.readFileSync(fixturePath, "utf-8");
      const sessions = parser.parse(fixturePath, content);
      const session = sessions[0]!;

      const schemaNames = session.toolSchemas.map((s) => s.name);
      expect(schemaNames).toContain("search");
      expect(schemaNames).toContain("read_file");
      expect(schemaNames).toContain("write_file");
    });

    it("extracts tool schema descriptions", () => {
      const fixturePath = path.join(FIXTURES_DIR, "generic/healthy-session.json");
      const content = fs.readFileSync(fixturePath, "utf-8");
      const sessions = parser.parse(fixturePath, content);
      const session = sessions[0]!;

      const searchSchema = session.toolSchemas.find((s) => s.name === "search");
      expect(searchSchema).toBeDefined();
      expect(searchSchema!.description).toBe("Search for information");
    });

    it("assigns token counts from turn data", () => {
      const fixturePath = path.join(FIXTURES_DIR, "generic/healthy-session.json");
      const content = fs.readFileSync(fixturePath, "utf-8");
      const sessions = parser.parse(fixturePath, content);
      const session = sessions[0]!;

      // First turn has contextTokenCount from the fixture
      expect(session.turns[0]!.contextTokenCount).toBe(1040);
    });

    it("handles missing optional fields gracefully", () => {
      const data = JSON.stringify({
        turns: [
          {
            messages: [
              { role: "user", content: "hello" },
              { role: "assistant", content: "hi" },
            ],
          },
        ],
      });
      const sessions = parser.parse("test.json", data);
      const session = sessions[0]!;

      expect(session.turns.length).toBe(1);
      expect(session.systemPrompt).toBeUndefined();
      expect(session.startTime).toBeUndefined();
      expect(session.endTime).toBeUndefined();
      expect(session.toolSchemas.length).toBe(0);
    });

    it("parses sessions wrapper format", () => {
      const data = JSON.stringify({
        sessions: [
          {
            session_id: "s1",
            turns: [
              {
                messages: [
                  { role: "user", content: "hello" },
                  { role: "assistant", content: "hi" },
                ],
              },
            ],
          },
        ],
      });
      const sessions = parser.parse("test.json", data);
      expect(sessions.length).toBe(1);
      expect(sessions[0]!.sessionId).toBe("s1");
    });

    it("parses flat messages array into turns", () => {
      const data = JSON.stringify({
        messages: [
          { role: "user", content: "first question" },
          { role: "assistant", content: "first answer" },
          { role: "user", content: "second question" },
          { role: "assistant", content: "second answer" },
        ],
      });
      const sessions = parser.parse("test.json", data);
      const session = sessions[0]!;

      // Should group into 2 turns (each starting with user message)
      expect(session.turns.length).toBe(2);
    });

    it("parses events-based format", () => {
      const data = JSON.stringify({
        events: [
          { type: "user", content: "hello" },
          { type: "assistant", content: "hi" },
        ],
      });
      const sessions = parser.parse("test.json", data);
      expect(sessions[0]!.turns.length).toBeGreaterThan(0);
    });

    it("maps role strings correctly including aliases", () => {
      const data = JSON.stringify({
        messages: [
          { role: "human", content: "hello" },
          { role: "ai", content: "hi" },
        ],
      });
      const sessions = parser.parse("test.json", data);
      const messages = sessions[0]!.turns[0]!.messages;

      expect(messages[0]!.role).toBe(Role.User);
      expect(messages[1]!.role).toBe(Role.Assistant);
    });

    it("handles tool status mapping for various status strings", () => {
      const data = JSON.stringify({
        turns: [
          {
            messages: [{ role: "user", content: "test" }],
            tool_calls: [
              { name: "tool_ok", input: {}, status: "ok" },
              { name: "tool_failed", input: {}, status: "failed" },
              { name: "tool_timeout", input: {}, status: "timeout" },
              { name: "tool_unknown", input: {}, status: "weird" },
            ],
          },
        ],
      });
      const sessions = parser.parse("test.json", data);
      const toolCalls = sessions[0]!.turns[0]!.toolCalls;

      expect(toolCalls[0]!.status).toBe(ToolCallStatus.Success);
      expect(toolCalls[1]!.status).toBe(ToolCallStatus.Error);
      expect(toolCalls[2]!.status).toBe(ToolCallStatus.Timeout);
      expect(toolCalls[3]!.status).toBe(ToolCallStatus.Unknown);
    });

    it("throws on empty content", () => {
      expect(() => parser.parse("test.json", "")).toThrow("Empty content");
      expect(() => parser.parse("test.json", "   ")).toThrow("Empty content");
    });

    it("throws on malformed JSON", () => {
      expect(() => parser.parse("test.json", "not valid json{{{")).toThrow(
        "Malformed JSON",
      );
    });

    it("includes session metadata with source file", () => {
      const data = JSON.stringify({
        turns: [
          {
            messages: [{ role: "user", content: "hello" }],
          },
        ],
      });
      const sessions = parser.parse("my-file.json", data);
      expect(sessions[0]!.metadata).toEqual({ sourceFile: "my-file.json" });
    });

    it("preserves session_id from data", () => {
      const data = JSON.stringify({
        session_id: "custom-session-42",
        turns: [
          {
            messages: [
              { role: "user", content: "hello" },
              { role: "assistant", content: "hi" },
            ],
          },
        ],
      });
      const sessions = parser.parse("test.json", data);
      expect(sessions[0]!.sessionId).toBe("custom-session-42");
    });
  });
});
