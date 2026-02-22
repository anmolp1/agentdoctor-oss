/** Core canonical data model. All parsers convert into this format. All detectors operate on it. */

export enum Role {
  System = "system",
  User = "user",
  Assistant = "assistant",
  Tool = "tool",
}

export enum ToolCallStatus {
  Success = "success",
  Error = "error",
  Timeout = "timeout",
  Partial = "partial",
  Unknown = "unknown",
}

export interface Message {
  readonly role: Role;
  readonly content: string;
  readonly timestamp?: string;
  readonly tokenCount?: number;
  readonly metadata?: Record<string, unknown>;
}

export interface ToolCall {
  readonly toolName: string;
  readonly toolInput: Record<string, unknown>;
  readonly toolOutput?: string;
  readonly toolOutputRaw?: unknown;
  readonly status: ToolCallStatus;
  readonly latencyMs?: number;
  readonly timestamp?: string;
  readonly errorMessage?: string;
  readonly retryCount: number;
  readonly metadata?: Record<string, unknown>;
}

export interface Turn {
  readonly messages: readonly Message[];
  readonly toolCalls: readonly ToolCall[];
  readonly turnIndex: number;
  readonly contextTokenCount?: number;
  readonly timestamp?: string;
  readonly metadata?: Record<string, unknown>;
}

export interface ToolSchema {
  readonly name: string;
  readonly description?: string;
  readonly parameters?: Record<string, unknown>;
}

export interface AgentSession {
  readonly sessionId: string;
  readonly turns: readonly Turn[];
  readonly systemPrompt?: string;
  readonly toolSchemas: readonly ToolSchema[];
  readonly framework?: string;
  readonly agentName?: string;
  readonly startTime?: string;
  readonly endTime?: string;
  readonly metadata?: Record<string, unknown>;
}

export interface AgentLogBundle {
  readonly sessions: readonly AgentSession[];
  readonly sourceFiles: readonly string[];
  readonly frameworkDetected?: string;
}

/** Count total turns in a session. */
export function totalTurns(session: AgentSession): number {
  return session.turns.length;
}

/** Count total tool calls across all turns. */
export function totalToolCalls(session: AgentSession): number {
  return session.turns.reduce((sum, t) => sum + t.toolCalls.length, 0);
}

/** Count total messages across all turns. */
export function totalMessages(session: AgentSession): number {
  return session.turns.reduce((sum, t) => sum + t.messages.length, 0);
}
