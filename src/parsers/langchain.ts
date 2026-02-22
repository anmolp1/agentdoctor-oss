/** LangChain log parser — supports Python + JS callback handler formats. */

import type { BaseParser } from "./base.js";
import type { AgentSession, Turn, Message, ToolCall, ToolSchema } from "../models/canonical.js";
import { Role, ToolCallStatus } from "../models/canonical.js";
import { estimateTokenCount } from "../utils/tokens.js";

interface LangChainRun {
  run_id?: string;
  parent_run_id?: string | null;
  type?: string;
  name?: string;
  inputs?: Record<string, unknown>;
  outputs?: Record<string, unknown>;
  start_time?: string;
  end_time?: string;
  extra?: {
    metadata?: Record<string, unknown>;
    usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number };
  };
  error?: string | null;
  tags?: string[];
  child_runs?: LangChainRun[];
}

export class LangChainParser implements BaseParser {
  readonly frameworkName = "LangChain";

  canParse(filePath: string, sample: string): boolean {
    // Check for LangChain-specific fields
    const hasRunId = sample.includes('"run_id"');
    const hasParentRunId = sample.includes('"parent_run_id"');
    const hasSerialized = sample.includes('"serialized"');
    const hasLangChainTypes =
      sample.includes('"type"') &&
      (sample.includes('"llm"') || sample.includes('"chain"') || sample.includes('"tool"'));
    const hasCallbackPattern =
      sample.includes('"name"') &&
      sample.includes('"tags"') &&
      (sample.includes('"inputs"') || sample.includes('"outputs"'));

    return (hasRunId && hasParentRunId) || hasSerialized || hasLangChainTypes || hasCallbackPattern;
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

    // Handle { runs: [...] } or [...] format
    let runs: LangChainRun[];
    if (Array.isArray(parsed)) {
      runs = parsed as LangChainRun[];
    } else if (parsed && typeof parsed === "object" && "runs" in parsed) {
      runs = (parsed as { runs: LangChainRun[] }).runs;
    } else if (parsed && typeof parsed === "object") {
      // Single run
      runs = [parsed as LangChainRun];
    } else {
      throw new Error(`Unexpected LangChain log format in ${filePath}`);
    }

    // Group by run_id for multi-session support
    const sessionGroups = this.groupBySession(runs);
    return sessionGroups.map((group, idx) => this.buildSession(group, filePath, idx));
  }

  private groupBySession(runs: LangChainRun[]): LangChainRun[][] {
    // Find top-level runs (no parent_run_id or parent_run_id is null)
    const topLevel = runs.filter((r) => !r.parent_run_id || r.parent_run_id === null);

    if (topLevel.length === 0) {
      // All runs are one session
      return [runs];
    }

    // Group child runs under their top-level parent
    const groups: Map<string, LangChainRun[]> = new Map();
    for (const run of topLevel) {
      const id = run.run_id ?? `session-${groups.size}`;
      groups.set(id, [run]);
    }

    for (const run of runs) {
      if (run.parent_run_id) {
        const group = groups.get(run.parent_run_id);
        if (group) {
          group.push(run);
        }
      }
    }

    const result = [...groups.values()];
    return result.length > 0 ? result : [runs];
  }

  private buildSession(runs: LangChainRun[], filePath: string, sessionIndex: number): AgentSession {
    const turns: Turn[] = [];
    let systemPrompt: string | undefined;
    const toolSchemas: ToolSchema[] = [];
    let cumulativeTokens = 0;

    // Extract system prompt from first chain/llm input
    for (const run of runs) {
      if (run.type === "chain" || run.type === "llm") {
        const sp = this.extractSystemPrompt(run);
        if (sp) {
          systemPrompt = sp;
          break;
        }
      }
    }

    // Build turns from LLM runs
    const llmRuns = runs.filter((r) => r.type === "llm" || r.type === "chain");
    const toolRuns = runs.filter((r) => r.type === "tool");

    for (let i = 0; i < llmRuns.length; i++) {
      const llmRun = llmRuns[i]!;
      const messages = this.extractMessages(llmRun);
      const toolCalls = this.extractToolCalls(llmRun, toolRuns);

      // Token counting
      const usage = llmRun.extra?.usage;
      if (usage?.total_tokens) {
        cumulativeTokens = usage.total_tokens;
      } else {
        const turnText = messages.map((m) => m.content).join(" ");
        cumulativeTokens += estimateTokenCount(turnText);
      }

      turns.push({
        messages,
        toolCalls,
        turnIndex: i,
        contextTokenCount: cumulativeTokens,
        timestamp: llmRun.start_time,
        metadata: llmRun.extra?.metadata,
      });
    }

    // If no LLM runs found, treat each run as a turn
    if (turns.length === 0) {
      for (let i = 0; i < runs.length; i++) {
        const run = runs[i]!;
        const messages = this.extractMessages(run);
        const toolCalls = this.extractToolCalls(run, []);
        const turnText = messages.map((m) => m.content).join(" ");
        cumulativeTokens += estimateTokenCount(turnText);

        turns.push({
          messages,
          toolCalls,
          turnIndex: i,
          contextTokenCount: cumulativeTokens,
          timestamp: run.start_time,
        });
      }
    }

    // Extract tool schemas from tool definitions if present
    for (const run of runs) {
      if (run.type === "tool" && run.name) {
        if (!toolSchemas.some((s) => s.name === run.name)) {
          toolSchemas.push({ name: run.name });
        }
      }
    }

    return {
      sessionId: runs[0]?.run_id ?? `langchain-${sessionIndex}`,
      turns,
      systemPrompt,
      toolSchemas,
      framework: "langchain",
      startTime: runs[0]?.start_time,
      endTime: runs[runs.length - 1]?.end_time,
      metadata: { sourceFile: filePath },
    };
  }

  private extractSystemPrompt(run: LangChainRun): string | undefined {
    const inputs = run.inputs;
    if (!inputs) return undefined;

    // Check for direct system message
    if (typeof inputs.system === "string") return inputs.system;

    // Check messages array
    const messages = inputs.messages ?? inputs.input;
    if (Array.isArray(messages)) {
      for (const msg of messages) {
        if (
          msg &&
          typeof msg === "object" &&
          "role" in msg &&
          msg.role === "system" &&
          "content" in msg
        ) {
          return String(msg.content);
        }
        // LangChain format: { type: "system", content: "..." }
        if (
          msg &&
          typeof msg === "object" &&
          "type" in msg &&
          msg.type === "system" &&
          "content" in msg
        ) {
          return String(msg.content);
        }
      }
    }

    return undefined;
  }

  private extractMessages(run: LangChainRun): Message[] {
    const messages: Message[] = [];

    // Extract from inputs
    const inputMsgs = this.extractMessagesFromData(run.inputs);
    messages.push(...inputMsgs);

    // Extract from outputs
    const outputMsgs = this.extractMessagesFromData(run.outputs);
    messages.push(...outputMsgs);

    // If no structured messages found, create from run data
    if (messages.length === 0) {
      if (run.inputs) {
        const content =
          typeof run.inputs.input === "string" ? run.inputs.input : JSON.stringify(run.inputs);
        messages.push({
          role: Role.User,
          content,
          timestamp: run.start_time,
        });
      }
      if (run.outputs) {
        const content =
          typeof run.outputs.output === "string" ? run.outputs.output : JSON.stringify(run.outputs);
        messages.push({
          role: Role.Assistant,
          content,
          timestamp: run.end_time,
        });
      }
    }

    return messages;
  }

  private extractMessagesFromData(data: Record<string, unknown> | undefined): Message[] {
    if (!data) return [];
    const messages: Message[] = [];

    const msgArray = data.messages ?? data.input ?? data.output;
    if (Array.isArray(msgArray)) {
      for (const msg of msgArray) {
        if (msg && typeof msg === "object" && "content" in msg) {
          const role = this.mapRole(
            (msg as Record<string, unknown>).role ?? (msg as Record<string, unknown>).type,
          );
          messages.push({
            role,
            content: String((msg as Record<string, unknown>).content),
            timestamp: (msg as Record<string, unknown>).timestamp as string | undefined,
          });
        }
      }
    }

    return messages;
  }

  private extractToolCalls(llmRun: LangChainRun, toolRuns: LangChainRun[]): ToolCall[] {
    const toolCalls: ToolCall[] = [];

    // Get associated tool runs
    const associatedTools = toolRuns.filter((t) => t.parent_run_id === llmRun.run_id);

    for (const toolRun of associatedTools) {
      toolCalls.push({
        toolName: toolRun.name ?? "unknown",
        toolInput: (toolRun.inputs as Record<string, unknown>) ?? {},
        toolOutput: toolRun.outputs ? JSON.stringify(toolRun.outputs) : undefined,
        status: toolRun.error ? ToolCallStatus.Error : ToolCallStatus.Success,
        errorMessage: toolRun.error ?? undefined,
        retryCount: 0,
        timestamp: toolRun.start_time,
        latencyMs: this.computeLatency(toolRun),
      });
    }

    // Also check for tool_calls in the LLM output
    const outputs = llmRun.outputs;
    if (outputs && typeof outputs === "object") {
      const generations = (outputs as Record<string, unknown>).generations;
      if (Array.isArray(generations)) {
        for (const gen of generations) {
          if (Array.isArray(gen)) {
            for (const g of gen) {
              const tc = (g as Record<string, unknown>)?.tool_calls;
              if (Array.isArray(tc)) {
                for (const call of tc) {
                  if (call && typeof call === "object" && "name" in call) {
                    const c = call as Record<string, unknown>;
                    toolCalls.push({
                      toolName: String(c.name),
                      toolInput: (c.args as Record<string, unknown>) ?? {},
                      status: ToolCallStatus.Unknown,
                      retryCount: 0,
                    });
                  }
                }
              }
            }
          }
        }
      }
    }

    return toolCalls;
  }

  private mapRole(role: unknown): Role {
    const r = String(role).toLowerCase();
    switch (r) {
      case "system":
        return Role.System;
      case "user":
      case "human":
        return Role.User;
      case "assistant":
      case "ai":
        return Role.Assistant;
      case "tool":
      case "function":
        return Role.Tool;
      default:
        return Role.User;
    }
  }

  private computeLatency(run: LangChainRun): number | undefined {
    if (run.start_time && run.end_time) {
      const start = new Date(run.start_time).getTime();
      const end = new Date(run.end_time).getTime();
      if (!isNaN(start) && !isNaN(end)) return end - start;
    }
    return undefined;
  }
}
