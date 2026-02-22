/** OpenAI API log parser — supports JSONL and JSON array formats. */

import type { BaseParser } from "./base.js";
import type { AgentSession, Turn, Message, ToolCall, ToolSchema } from "../models/canonical.js";
import { Role, ToolCallStatus } from "../models/canonical.js";

interface OpenAIMessage {
  role?: string;
  content?: string | null;
  tool_calls?: Array<{
    id?: string;
    type?: string;
    function?: {
      name?: string;
      arguments?: string;
    };
  }>;
}

interface OpenAIChoice {
  message?: OpenAIMessage;
  finish_reason?: string;
}

interface OpenAIUsage {
  prompt_tokens?: number;
  completion_tokens?: number;
  total_tokens?: number;
}

interface OpenAIEntry {
  request?: {
    model?: string;
    messages?: OpenAIMessage[];
    tools?: Array<{
      type?: string;
      function?: {
        name?: string;
        description?: string;
        parameters?: Record<string, unknown>;
      };
    }>;
  };
  response?: {
    choices?: OpenAIChoice[];
    usage?: OpenAIUsage;
    model?: string;
  };
  // Direct format (single request/response object)
  model?: string;
  messages?: OpenAIMessage[];
  choices?: OpenAIChoice[];
  usage?: OpenAIUsage;
  tools?: Array<{
    type?: string;
    function?: {
      name?: string;
      description?: string;
      parameters?: Record<string, unknown>;
    };
  }>;
}

export class OpenAIParser implements BaseParser {
  readonly frameworkName = "OpenAI";

  canParse(_filePath: string, sample: string): boolean {
    const hasModel = sample.includes('"model"');
    const hasMessages = sample.includes('"messages"');
    const hasChoices = sample.includes('"choices"');
    const hasUsage = sample.includes('"usage"');

    return hasModel && (hasMessages || hasChoices) && (hasChoices || hasUsage);
  }

  parse(filePath: string, content: string): AgentSession[] {
    const trimmed = content.trim();
    if (!trimmed) throw new Error(`Empty content in ${filePath}`);

    const entries = this.parseEntries(filePath, trimmed);
    if (entries.length === 0) {
      throw new Error(`No valid entries found in ${filePath}`);
    }

    return [this.buildSession(entries, filePath)];
  }

  private parseEntries(filePath: string, content: string): OpenAIEntry[] {
    // Try JSONL first (multiple lines, each a valid JSON object)
    const lines = content.split("\n").filter((l) => l.trim().length > 0);
    if (lines.length > 1) {
      const entries: OpenAIEntry[] = [];
      let allParsed = true;
      for (const line of lines) {
        try {
          entries.push(JSON.parse(line) as OpenAIEntry);
        } catch {
          allParsed = false;
          break;
        }
      }
      if (allParsed && entries.length > 0) return entries;
    }

    // Try JSON (single object or array)
    try {
      const parsed = JSON.parse(content);
      if (Array.isArray(parsed)) return parsed as OpenAIEntry[];
      return [parsed as OpenAIEntry];
    } catch {
      throw new Error(`Malformed JSON in ${filePath}`);
    }
  }

  private buildSession(entries: OpenAIEntry[], filePath: string): AgentSession {
    const turns: Turn[] = [];
    let systemPrompt: string | undefined;
    const toolSchemaMap = new Map<string, ToolSchema>();

    for (let i = 0; i < entries.length; i++) {
      const entry = entries[i]!;
      const req = entry.request ?? entry;
      const resp = entry.response ?? entry;

      // Extract system prompt from first request
      if (!systemPrompt && req.messages) {
        const sysMsg = req.messages.find((m) => m.role === "system");
        if (sysMsg?.content) {
          systemPrompt = sysMsg.content;
        }
      }

      // Extract tool schemas
      const tools = req.tools;
      if (tools) {
        for (const tool of tools) {
          if (tool.function?.name) {
            toolSchemaMap.set(tool.function.name, {
              name: tool.function.name,
              description: tool.function.description,
              parameters: tool.function.parameters,
            });
          }
        }
      }

      // Build messages
      const messages: Message[] = [];
      if (req.messages) {
        for (const msg of req.messages) {
          if (msg.role && msg.content != null) {
            messages.push({
              role: this.mapRole(msg.role),
              content: msg.content,
            });
          }
        }
      }

      // Response messages
      const choices = resp.choices;
      if (choices) {
        for (const choice of choices) {
          if (choice.message?.content) {
            messages.push({
              role: Role.Assistant,
              content: choice.message.content,
            });
          }
        }
      }

      // Extract tool calls from response
      const toolCalls: ToolCall[] = [];
      if (choices) {
        for (const choice of choices) {
          if (choice.message?.tool_calls) {
            for (const tc of choice.message.tool_calls) {
              let toolInput: Record<string, unknown> = {};
              if (tc.function?.arguments) {
                try {
                  toolInput = JSON.parse(tc.function.arguments) as Record<string, unknown>;
                } catch {
                  toolInput = { raw: tc.function.arguments };
                }
              }
              toolCalls.push({
                toolName: tc.function?.name ?? "unknown",
                toolInput,
                status: ToolCallStatus.Success,
                retryCount: 0,
              });
            }
          }
        }
      }

      // Token counts
      const usage = resp.usage;
      const contextTokenCount = usage?.total_tokens;

      turns.push({
        messages,
        toolCalls,
        turnIndex: i,
        contextTokenCount,
        metadata: usage ? { usage } : undefined,
      });
    }

    return {
      sessionId: `openai-${filePath}`,
      turns,
      systemPrompt,
      toolSchemas: [...toolSchemaMap.values()],
      framework: "openai",
      metadata: { sourceFile: filePath },
    };
  }

  private mapRole(role: string): Role {
    switch (role.toLowerCase()) {
      case "system":
        return Role.System;
      case "user":
        return Role.User;
      case "assistant":
        return Role.Assistant;
      case "tool":
      case "function":
        return Role.Tool;
      default:
        return Role.User;
    }
  }
}
