# Contributing to AgentDoctor

Thank you for your interest in contributing to AgentDoctor! This guide will help you get set up and explain how to add new pathology detectors, log parsers, and more.

## Table of Contents

- [Development Setup](#development-setup)
- [Project Structure](#project-structure)
- [Adding a New Parser](#adding-a-new-parser)
- [Adding a New Detector](#adding-a-new-detector)
- [Testing](#testing)
- [Code Style](#code-style)
- [Pull Request Process](#pull-request-process)
- [Wanted List](#wanted-list)

## Development Setup

### Prerequisites

- **Node.js** >= 20
- **pnpm** >= 9

### Getting Started

```bash
# Clone the repository
git clone https://github.com/anmolp1/agentdoctor-oss.git
cd agentdoctor

# Install dependencies
pnpm install

# Run the build
pnpm run build

# Run tests
pnpm test

# Run linting and type checking
pnpm run lint
pnpm run typecheck
pnpm run format:check
```

### Available Scripts

| Command                      | Description                   |
| ---------------------------- | ----------------------------- |
| `pnpm run build`             | Build the project with tsup   |
| `pnpm run dev`               | Build in watch mode           |
| `pnpm run lint`              | Run ESLint on src/ and tests/ |
| `pnpm run lint:fix`          | Run ESLint with auto-fix      |
| `pnpm run format`            | Format code with Prettier     |
| `pnpm run format:check`      | Check code formatting         |
| `pnpm run typecheck`         | Run TypeScript type checking  |
| `pnpm test`                  | Run tests in watch mode       |
| `pnpm run test:ci`           | Run tests once with coverage  |
| `pnpm run test:regression`   | Run regression tests          |
| `pnpm run generate-fixtures` | Generate test fixtures        |

## Project Structure

```
src/
  cli/              # CLI commands (check, score)
  detectors/        # Pathology detectors
    base.ts         # BaseDetector interface
    context-erosion.ts
    tool-thrashing.ts
    instruction-drift.ts
    recovery-blindness.ts
    hallucinated-success.ts
    silent-degradation.ts
    index.ts        # Detector registry
  models/           # Data models (canonical, config, findings, scores)
  parsers/          # Log parsers
    base.ts         # BaseParser interface
    langchain.ts
    openai.ts
    generic.ts
    index.ts        # Parser registry with auto-detection
  reporting/        # Report generation (markdown, JSON)
  scoring/          # Health scoring layers
  utils/            # Shared utilities
  pipeline.ts       # Core analyze() orchestrator
  index.ts          # Public API exports
tests/
  unit/             # Unit tests
  regression/       # Regression tests with golden fixtures
```

## Adding a New Parser

Parsers convert framework-specific log formats into AgentDoctor's canonical data model. To add support for a new framework:

### 1. Implement the `BaseParser` interface

Create a new file in `src/parsers/`:

```typescript
// src/parsers/my-framework.ts
import type { BaseParser } from "./base.js";
import type { AgentSession } from "../models/canonical.js";

export class MyFrameworkParser implements BaseParser {
  readonly frameworkName = "MyFramework";

  canParse(filePath: string, sample: string): boolean {
    // Return true if this file looks like it came from your framework.
    // `sample` is the first 2KB of the file content.
    // Check for distinctive fields, structure, or naming patterns.
    return sample.includes('"my_framework_field"');
  }

  parse(filePath: string, content: string): AgentSession[] {
    // Parse the file content into one or more AgentSession objects.
    // See src/models/canonical.ts for the full data model.
    // ...
  }
}
```

### 2. Register it in the parser index

Add your parser to `src/parsers/index.ts`. Order matters: more specific parsers should come before the generic fallback.

```typescript
import { MyFrameworkParser } from "./my-framework.js";

const PARSER_REGISTRY: BaseParser[] = [
  new LangChainParser(),
  new OpenAIParser(),
  new MyFrameworkParser(), // Add before GenericParser
  new GenericParser(),
];
```

### 3. Add tests

Create test files in `tests/unit/parsers/` with sample log fixtures.

## Adding a New Detector

Detectors analyze the canonical data model to identify pathology patterns. To add a new detector:

### 1. Add the pathology to the enum

Add a new entry to the `Pathology` enum in `src/models/findings.ts`:

```typescript
export enum Pathology {
  // ... existing entries
  MyNewPathology = "my_new_pathology",
}
```

### 2. Implement the `BaseDetector` interface

Create a new file in `src/detectors/`:

```typescript
// src/detectors/my-new-pathology.ts
import type { BaseDetector } from "./base.js";
import type { AgentLogBundle } from "../models/canonical.js";
import type { AgentDoctorConfig } from "../models/config.js";
import type { Finding } from "../models/findings.js";
import { Pathology, Severity } from "../models/findings.js";

export class MyNewPathologyDetector implements BaseDetector {
  readonly pathology = Pathology.MyNewPathology;
  readonly name = "My New Pathology";

  detect(bundle: AgentLogBundle, config: AgentDoctorConfig): Finding[] {
    const findings: Finding[] = [];

    for (const session of bundle.sessions) {
      // Analyze turns, tool calls, messages, etc.
      // Push findings with appropriate severity, evidence, and recommendations.
    }

    return findings;
  }
}
```

### 3. Add configuration (optional)

If your detector needs configurable thresholds, add a new section to `AgentDoctorConfigSchema` in `src/models/config.ts`:

```typescript
myNewPathology: z
  .object({
    someThreshold: thresholdPositive.default(5),
  })
  .default({}),
```

### 4. Register it in the detector index

Add your detector to `src/detectors/index.ts`:

```typescript
import { MyNewPathologyDetector } from "./my-new-pathology.js";

export function getAllDetectors(): BaseDetector[] {
  return [
    // ... existing detectors
    new MyNewPathologyDetector(),
  ];
}
```

### 5. Add tests

Create tests in `tests/unit/detectors/` covering:

- Detection with synthetic sessions that exhibit the pathology
- No false positives on clean sessions
- Severity thresholds (warning vs. critical)
- Edge cases (empty sessions, missing data)

## Testing

### Running Tests

```bash
# Run all tests in watch mode
pnpm test

# Run tests once with coverage
pnpm run test:ci

# Run regression tests only
pnpm run test:regression

# Run a specific test file
pnpm test -- tests/unit/detectors/context-erosion.test.ts
```

### Coverage Requirements

- Lines: 85%
- Branches: 75%
- Functions: 85%
- Statements: 85%

### Regression Tests

Regression tests use golden fixture files to ensure detectors produce consistent results. When adding a new detector, add corresponding regression test fixtures.

## Code Style

- **TypeScript** with strict mode enabled
- **ESLint** for linting
- **Prettier** for formatting
- Use `readonly` for interface properties and arrays
- Prefer `const` assertions and immutable patterns
- Export types separately from runtime values

Run before submitting:

```bash
pnpm run lint
pnpm run format:check
pnpm run typecheck
```

## Pull Request Process

1. Fork the repository and create a feature branch from `main`
2. Make your changes following the guidelines above
3. Add or update tests as needed
4. Ensure all checks pass: `pnpm run lint && pnpm run format:check && pnpm run typecheck && pnpm run test:ci`
5. Update `CHANGELOG.md` under `[Unreleased]` if applicable
6. Submit a pull request using the PR template
7. Wait for review from a maintainer

## Wanted List

We welcome contributions in these areas:

### New Parsers

- **AutoGen** -- Microsoft's multi-agent framework
- **CrewAI** -- Role-based multi-agent orchestration
- **Amazon Bedrock Agents** -- AWS agent logs
- **Anthropic Claude tool-use** -- Direct Claude API tool use logs
- **Custom JSONL** -- Structured JSONL with minimal required fields

### New Detectors / Pathologies

- **Prompt Echo Loop** -- Agent repeats back instructions verbatim instead of acting
- **Goal Decomposition Failure** -- Agent cannot break complex goals into sub-tasks
- **Authority Confusion** -- Multi-agent setups where agents override each other
- **Token Budget Exhaustion** -- Agent runs out of output tokens mid-response

### Scoring Layers

- **Recovery Robustness** -- How well the agent handles and recovers from errors
- **Output Quality Baselines** -- Track output quality metrics over time

### Tooling

- VS Code extension for inline diagnostics
- GitHub Action for automated PR checks
- Dashboard / visualization for health scores over time

### Documentation

- Video tutorials and walkthroughs
- Integration guides for popular observability platforms
- Benchmark datasets for pathology detection accuracy

If you are interested in working on any of these, please open an issue to discuss your approach before starting.
