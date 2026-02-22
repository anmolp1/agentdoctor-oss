/** Base parser interface. All parsers implement this. */

import type { AgentSession } from "../models/canonical.js";

export interface BaseParser {
  /** Check if this parser can handle the file. `sample` is first 2KB. */
  canParse(filePath: string, sample: string): boolean;
  /** Parse file content into AgentSession objects. */
  parse(filePath: string, content: string): AgentSession[];
  /** Framework name for display/logging. */
  readonly frameworkName: string;
}
