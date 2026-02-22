import * as fs from "node:fs";
import * as path from "node:path";
import { detectAndParse, detectFramework } from "../../../src/parsers/index.js";

const FIXTURES_DIR = path.join(__dirname, "../../fixtures/logs");

describe("detectFramework", () => {
  it("selects LangChain for LangChain logs", () => {
    const fixturePath = path.join(FIXTURES_DIR, "langchain/healthy-session.json");
    const content = fs.readFileSync(fixturePath, "utf-8");
    const framework = detectFramework(fixturePath, content);

    expect(framework).toBe("LangChain");
  });

  it("selects OpenAI for OpenAI-style logs", () => {
    const content = JSON.stringify({
      model: "gpt-4",
      messages: [{ role: "user", content: "hello" }],
      choices: [{ message: { role: "assistant", content: "hi" } }],
      usage: { total_tokens: 100 },
    });
    const framework = detectFramework("test.jsonl", content);

    expect(framework).toBe("OpenAI");
  });

  it("selects Generic for generic JSON logs", () => {
    const fixturePath = path.join(FIXTURES_DIR, "generic/healthy-session.json");
    const content = fs.readFileSync(fixturePath, "utf-8");
    const framework = detectFramework(fixturePath, content);

    expect(framework).toBe("Generic");
  });

  it("falls back to generic for unrecognized but parseable format", () => {
    const content = JSON.stringify({
      messages: [
        { role: "user", content: "hello" },
        { role: "assistant", content: "hi" },
      ],
    });
    const framework = detectFramework("unknown.json", content);

    // Generic parser accepts anything with "messages"
    expect(framework).not.toBeNull();
  });

  it("returns null for completely unsupported format", () => {
    const content = JSON.stringify({
      id: "random",
      payload: "unrecognizable data",
      timestamp: "2026-01-01",
    });
    const framework = detectFramework("mystery.json", content);

    expect(framework).toBeNull();
  });

  it("detects LangChain over OpenAI when both markers present (LangChain is more specific)", () => {
    // LangChain is checked first in the registry and is more specific
    const content = JSON.stringify({
      run_id: "abc-123",
      parent_run_id: null,
      type: "chain",
      name: "AgentExecutor",
      model: "gpt-4",
      messages: [{ role: "user", content: "hello" }],
    });
    const framework = detectFramework("test.json", content);

    expect(framework).toBe("LangChain");
  });
});

describe("detectAndParse", () => {
  it("selects LangChain parser for LangChain logs and returns sessions", () => {
    const fixturePath = path.join(FIXTURES_DIR, "langchain/healthy-session.json");
    const content = fs.readFileSync(fixturePath, "utf-8");
    const sessions = detectAndParse(fixturePath, content);

    expect(sessions.length).toBeGreaterThanOrEqual(1);
    expect(sessions[0]!.framework).toBe("langchain");
    // 1 chain run + 15 LLM runs = 16 turns
    expect(sessions[0]!.turns.length).toBe(16);
  });

  it("selects OpenAI parser for OpenAI logs and returns sessions", () => {
    const content = JSON.stringify({
      model: "gpt-4",
      messages: [
        { role: "system", content: "You are a helpful assistant." },
        { role: "user", content: "Hello" },
      ],
      choices: [
        {
          message: {
            role: "assistant",
            content: "Hi there!",
            tool_calls: [
              {
                id: "call_1",
                type: "function",
                function: { name: "search", arguments: '{"query":"test"}' },
              },
            ],
          },
          finish_reason: "tool_calls",
        },
      ],
      usage: { prompt_tokens: 100, completion_tokens: 50, total_tokens: 150 },
    });
    const sessions = detectAndParse("test.jsonl", content);

    expect(sessions.length).toBe(1);
    expect(sessions[0]!.framework).toBe("openai");
    expect(sessions[0]!.turns.length).toBe(1);
  });

  it("falls back to generic parser for generic logs", () => {
    const fixturePath = path.join(FIXTURES_DIR, "generic/healthy-session.json");
    const content = fs.readFileSync(fixturePath, "utf-8");
    const sessions = detectAndParse(fixturePath, content);

    expect(sessions.length).toBeGreaterThanOrEqual(1);
    expect(sessions[0]!.framework).toBe("generic");
  });

  it("throws for unsupported format with helpful message", () => {
    const content = JSON.stringify({
      id: "random",
      payload: "unrecognizable",
      timestamp: "2026-01-01",
    });

    expect(() => detectAndParse("mystery.json", content)).toThrow(/Could not parse mystery\.json/);
    expect(() => detectAndParse("mystery.json", content)).toThrow(/Tried:/);
    expect(() => detectAndParse("mystery.json", content)).toThrow(/supported formats/);
  });

  it("error message lists all tried parsers", () => {
    const content = JSON.stringify({
      id: "random",
      payload: "unrecognizable",
    });

    try {
      detectAndParse("bad.json", content);
      // Should not reach here
      expect(true).toBe(false);
    } catch (err) {
      const message = (err as Error).message;
      expect(message).toContain("LangChain");
      expect(message).toContain("OpenAI");
      expect(message).toContain("Generic");
    }
  });

  it("preserves system prompt through auto-detection", () => {
    const fixturePath = path.join(FIXTURES_DIR, "langchain/healthy-session.json");
    const content = fs.readFileSync(fixturePath, "utf-8");
    const sessions = detectAndParse(fixturePath, content);

    expect(sessions[0]!.systemPrompt).toContain("You are a helpful");
  });

  it("preserves tool calls through auto-detection", () => {
    const content = JSON.stringify({
      model: "gpt-4",
      messages: [{ role: "user", content: "hello" }],
      choices: [
        {
          message: {
            role: "assistant",
            content: "Using search tool.",
            tool_calls: [
              {
                id: "call_1",
                type: "function",
                function: { name: "search", arguments: '{"query":"test"}' },
              },
            ],
          },
          finish_reason: "tool_calls",
        },
      ],
      usage: { total_tokens: 100 },
    });
    const sessions = detectAndParse("test.jsonl", content);

    const turn0 = sessions[0]!.turns[0]!;
    expect(turn0.toolCalls.length).toBeGreaterThan(0);
    expect(turn0.toolCalls[0]!.toolName).toBe("search");
  });
});
