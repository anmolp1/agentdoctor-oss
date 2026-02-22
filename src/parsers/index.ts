/** Parser registry and auto-detection. */

import type { BaseParser } from "./base.js";
import type { AgentSession } from "../models/canonical.js";
import { LangChainParser } from "./langchain.js";
import { OpenAIParser } from "./openai.js";
import { GenericParser } from "./generic.js";

export type { BaseParser } from "./base.js";

// Most specific first, generic last
const PARSER_REGISTRY: BaseParser[] = [
  new LangChainParser(),
  new OpenAIParser(),
  new GenericParser(),
];

/** Auto-detect format and parse file content into AgentSession objects. */
export function detectAndParse(filePath: string, content: string): AgentSession[] {
  const sample = content.slice(0, 2048);
  for (const parser of PARSER_REGISTRY) {
    if (parser.canParse(filePath, sample)) {
      return parser.parse(filePath, content);
    }
  }
  const tried = PARSER_REGISTRY.map((p) => p.frameworkName).join(", ");
  throw new Error(
    `Could not parse ${filePath}. Tried: ${tried}. ` +
      `See docs/parsers.md for supported formats, or use the generic JSON format.`,
  );
}

/** Detect which framework a file belongs to without parsing. */
export function detectFramework(filePath: string, content: string): string | null {
  const sample = content.slice(0, 2048);
  for (const parser of PARSER_REGISTRY) {
    if (parser.canParse(filePath, sample)) return parser.frameworkName;
  }
  return null;
}
