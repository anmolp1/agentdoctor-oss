/** Generic JSON parser — fallback for custom/proprietary formats. */

import type { BaseParser } from "./base.js";
import type { AgentSession, Turn, Message, ToolCall, ToolSchema } from "../models/canonical.js";
import { Role, ToolCallStatus } from "../models/canonical.js";
import { estimateTokenCount } from "../utils/tokens.js";

export class GenericParser implements BaseParser {
  readonly frameworkName = "Generic";

  canParse(_filePath: string, sample: string): boolean {
    // Fallback: requires JSON with "messages", "turns", or "events" array
    return (
      sample.includes('"messages"') ||
      sample.includes('"turns"') ||
      sample.includes('"events"')
    );
  }

  parse(filePath: string, content: string): AgentSession[] {
    const trimmed = content.trim();
    if (!trimmed) throw new Error(`Empty content in ${filePath}`);

    let parsed: unknown;
    try {
      parsed = JSON.parse(trimmed);
    } catch {
      throw new Error(`Malformed JSON in ${filePath}`);
    }

    if (Array.isArray(parsed)) {
      // Array of sessions
      if (
        parsed.length > 0 &&
        parsed[0] &&
        typeof parsed[0] === "object" &&
        ("turns" in parsed[0] || "messages" in parsed[0])
      ) {
        return parsed.map((s, i) =>
          this.buildSession(s as Record<string, unknown>, filePath, i),
        );
      }
      // Single session with messages array
      return [
        this.buildSession({ messages: parsed }, filePath, 0),
      ];
    }

    if (parsed && typeof parsed === "object") {
      const obj = parsed as Record<string, unknown>;
      // { sessions: [...] }
      if (Array.isArray(obj.sessions)) {
        return (obj.sessions as Record<string, unknown>[]).map((s, i) =>
          this.buildSession(s, filePath, i),
        );
      }
      // Single session
      return [this.buildSession(obj, filePath, 0)];
    }

    throw new Error(`Unexpected format in ${filePath}`);
  }

  private buildSession(
    data: Record<string, unknown>,
    filePath: string,
    sessionIndex: number,
  ): AgentSession {
    const sessionId =
      (data.session_id as string) ??
      (data.sessionId as string) ??
      `generic-${sessionIndex}`;

    let systemPrompt: string | undefined;
    const toolSchemas: ToolSchema[] = [];
    let turns: Turn[];

    if (Array.isArray(data.turns)) {
      turns = this.parseTurns(data.turns as Record<string, unknown>[]);
    } else if (Array.isArray(data.messages)) {
      // Convert flat messages array into turns
      const result = this.messagesToTurns(data.messages as Record<string, unknown>[]);
      turns = result.turns;
      systemPrompt = result.systemPrompt;
    } else if (Array.isArray(data.events)) {
      turns = this.eventsToturn(data.events as Record<string, unknown>[]);
    } else {
      turns = [];
    }

    // Extract system prompt if not found yet
    if (!systemPrompt) {
      systemPrompt =
        (data.system_prompt as string) ??
        (data.systemPrompt as string) ??
        undefined;
    }

    // Extract tool schemas
    if (Array.isArray(data.tool_schemas)) {
      for (const ts of data.tool_schemas as Record<string, unknown>[]) {
        if (ts.name) {
          toolSchemas.push({
            name: String(ts.name),
            description: ts.description as string | undefined,
            parameters: ts.parameters as Record<string, unknown> | undefined,
          });
        }
      }
    }

    // Also extract from tool_calls in data
    if (Array.isArray(data.tool_calls)) {
      for (const tc of data.tool_calls as Record<string, unknown>[]) {
        const name = String(tc.name ?? tc.toolName ?? "");
        if (name && !toolSchemas.some((s) => s.name === name)) {
          toolSchemas.push({ name });
        }
      }
    }

    return {
      sessionId,
      turns,
      systemPrompt,
      toolSchemas,
      framework: (data.framework as string) ?? "generic",
      agentName: (data.agent_name as string) ?? (data.agentName as string),
      startTime: (data.start_time as string) ?? (data.startTime as string),
      endTime: (data.end_time as string) ?? (data.endTime as string),
      metadata: { sourceFile: filePath },
    };
  }

  private parseTurns(turnsData: Record<string, unknown>[]): Turn[] {
    const turns: Turn[] = [];
    let cumulativeTokens = 0;

    for (let i = 0; i < turnsData.length; i++) {
      const td = turnsData[i]!;
      const messages: Message[] = [];
      const toolCalls: ToolCall[] = [];

      // Parse messages
      if (Array.isArray(td.messages)) {
        for (const msg of td.messages as Record<string, unknown>[]) {
          messages.push({
            role: this.mapRole(msg.role),
            content: String(msg.content ?? ""),
            timestamp: msg.timestamp as string | undefined,
            tokenCount: msg.tokenCount as number | undefined,
          });
        }
      }

      // Parse tool calls
      if (Array.isArray(td.tool_calls ?? td.toolCalls)) {
        const tcs = (td.tool_calls ?? td.toolCalls) as Record<string, unknown>[];
        for (const tc of tcs) {
          toolCalls.push(this.parseToolCall(tc));
        }
      }

      const turnText = messages.map((m) => m.content).join(" ");
      cumulativeTokens += estimateTokenCount(turnText);

      turns.push({
        messages,
        toolCalls,
        turnIndex: (td.turnIndex as number) ?? (td.turn_index as number) ?? i,
        contextTokenCount: (td.contextTokenCount as number) ?? (td.context_token_count as number) ?? cumulativeTokens,
        timestamp: td.timestamp as string | undefined,
      });
    }

    return turns;
  }

  private messagesToTurns(
    messagesData: Record<string, unknown>[],
  ): { turns: Turn[]; systemPrompt?: string } {
    const turns: Turn[] = [];
    let systemPrompt: string | undefined;
    let currentTurnMessages: Message[] = [];
    let currentToolCalls: ToolCall[] = [];
    let turnIndex = 0;
    let cumulativeTokens = 0;

    for (const msg of messagesData) {
      const role = this.mapRole(msg.role);

      if (role === Role.System) {
        systemPrompt = String(msg.content ?? "");
        continue;
      }

      // Tool messages go into tool calls
      if (role === Role.Tool) {
        currentToolCalls.push({
          toolName: String(msg.name ?? msg.tool_name ?? "unknown"),
          toolInput: (msg.input as Record<string, unknown>) ?? {},
          toolOutput: String(msg.content ?? ""),
          status: this.mapToolStatus(msg.status),
          retryCount: 0,
        });
        continue;
      }

      // User message starts a new turn (if we have accumulated messages)
      if (role === Role.User && currentTurnMessages.length > 0) {
        const turnText = currentTurnMessages.map((m) => m.content).join(" ");
        cumulativeTokens += estimateTokenCount(turnText);
        turns.push({
          messages: currentTurnMessages,
          toolCalls: currentToolCalls,
          turnIndex: turnIndex++,
          contextTokenCount: cumulativeTokens,
        });
        currentTurnMessages = [];
        currentToolCalls = [];
      }

      currentTurnMessages.push({
        role,
        content: String(msg.content ?? ""),
        timestamp: msg.timestamp as string | undefined,
      });
    }

    // Final turn
    if (currentTurnMessages.length > 0) {
      const turnText = currentTurnMessages.map((m) => m.content).join(" ");
      cumulativeTokens += estimateTokenCount(turnText);
      turns.push({
        messages: currentTurnMessages,
        toolCalls: currentToolCalls,
        turnIndex: turnIndex,
        contextTokenCount: cumulativeTokens,
      });
    }

    return { turns, systemPrompt };
  }

  private eventsToturn(events: Record<string, unknown>[]): Turn[] {
    const turns: Turn[] = [];
    let turnIndex = 0;
    let cumulativeTokens = 0;

    for (const event of events) {
      const messages: Message[] = [];
      const toolCalls: ToolCall[] = [];

      if (event.message && typeof event.message === "object") {
        const msg = event.message as Record<string, unknown>;
        messages.push({
          role: this.mapRole(msg.role),
          content: String(msg.content ?? ""),
        });
      } else if (event.content) {
        messages.push({
          role: this.mapRole(event.role ?? event.type),
          content: String(event.content),
        });
      }

      if (event.tool_call && typeof event.tool_call === "object") {
        toolCalls.push(this.parseToolCall(event.tool_call as Record<string, unknown>));
      }

      if (messages.length > 0 || toolCalls.length > 0) {
        const turnText = messages.map((m) => m.content).join(" ");
        cumulativeTokens += estimateTokenCount(turnText);
        turns.push({
          messages,
          toolCalls,
          turnIndex: turnIndex++,
          contextTokenCount: cumulativeTokens,
        });
      }
    }

    return turns;
  }

  private parseToolCall(tc: Record<string, unknown>): ToolCall {
    return {
      toolName: String(tc.name ?? tc.toolName ?? tc.tool_name ?? "unknown"),
      toolInput: (tc.input ?? tc.toolInput ?? tc.tool_input ?? tc.args ?? {}) as Record<
        string,
        unknown
      >,
      toolOutput: tc.output != null ? String(tc.output ?? tc.toolOutput ?? tc.tool_output) : undefined,
      status: this.mapToolStatus(tc.status),
      errorMessage: tc.error as string | undefined,
      retryCount: (tc.retryCount as number) ?? (tc.retry_count as number) ?? 0,
      latencyMs: tc.latencyMs as number | undefined,
    };
  }

  private mapRole(role: unknown): Role {
    const r = String(role ?? "user").toLowerCase();
    switch (r) {
      case "system":
        return Role.System;
      case "user":
      case "human":
        return Role.User;
      case "assistant":
      case "ai":
      case "agent":
        return Role.Assistant;
      case "tool":
      case "function":
        return Role.Tool;
      default:
        return Role.User;
    }
  }

  private mapToolStatus(status: unknown): ToolCallStatus {
    const s = String(status ?? "success").toLowerCase();
    switch (s) {
      case "success":
      case "ok":
        return ToolCallStatus.Success;
      case "error":
      case "failed":
      case "failure":
        return ToolCallStatus.Error;
      case "timeout":
        return ToolCallStatus.Timeout;
      case "partial":
        return ToolCallStatus.Partial;
      default:
        return ToolCallStatus.Unknown;
    }
  }
}
