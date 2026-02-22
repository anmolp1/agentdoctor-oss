# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.1.0] - 2026-02-22

### Added

- Core diagnostic pipeline with `analyze()` API
- CLI with `check` and `score` commands
- 6 pathology detectors:
  - Context Erosion -- detects unchecked context window growth
  - Tool Thrashing -- detects repetitive and oscillating tool call patterns
  - Instruction Drift -- detects mismatches between system prompts and tool schemas
  - Recovery Blindness -- detects unhandled tool failures and blind retries
  - Hallucinated Tool Success -- detects agents claiming success after tool failure
  - Silent Degradation -- detects gradual within-session performance decline
- 3 scoring layers:
  - Context Health (growth management, instruction share, stale content)
  - Tool Reliability (success rate, calls-per-turn, thrashing episodes)
  - Instruction Coherence (prompt-schema alignment, consistency, prompt presence)
- 3 log parsers with auto-detection:
  - LangChain tracer JSON
  - OpenAI API response logs
  - Generic JSON format
- Markdown and JSON report output formats
- Configurable thresholds via JSON config files with Zod validation
- Exit codes for CI integration (0 = clean, 1 = warnings, 2 = critical, 3 = error)
- Full TypeScript support with ESM and CJS dual-package exports
- stdin support for piping logs directly

[Unreleased]: https://github.com/anmolp1/agentdoctor-oss/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/anmolp1/agentdoctor-oss/releases/tag/v0.1.0
