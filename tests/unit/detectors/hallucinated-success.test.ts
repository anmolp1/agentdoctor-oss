import { HallucinatedSuccessDetector } from "../../../src/detectors/hallucinated-success.js";
import { getDefaultConfig } from "../../../src/models/config.js";
import { makeSession, makeBundle, makeTurn, makeToolCall, makeMessage } from "../../helpers.js";
import { Pathology, Severity } from "../../../src/models/findings.js";
import { Role, ToolCallStatus } from "../../../src/models/canonical.js";

describe("HallucinatedSuccessDetector", () => {
  const detector = new HallucinatedSuccessDetector();
  const config = getDefaultConfig();

  it("detects error status without acknowledgment", () => {
    // Tool call fails but assistant's next message does not contain any acknowledgment keywords
    const turns = [
      makeTurn({
        turnIndex: 0,
        toolCalls: [
          makeToolCall({
            toolName: "fetch_data",
            toolInput: { url: "http://example.com/api" },
            toolOutput: "Connection refused",
            status: ToolCallStatus.Error,
            errorMessage: "Connection refused",
          }),
        ],
        messages: [
          makeMessage({ role: Role.User, content: "Fetch the data from the API." }),
          makeMessage({
            role: Role.Assistant,
            content:
              "I have successfully retrieved the data. Here are the 42 records from the database.",
          }),
        ],
      }),
    ];

    const bundle = makeBundle([
      makeSession({
        sessionId: "hallucinated-error-session",
        turns,
        systemPrompt: "Use the `fetch_data` tool.",
        toolSchemas: [{ name: "fetch_data", description: "Fetch data" }],
      }),
    ]);

    const findings = detector.detect(bundle, config);

    const hallucinatedFinding = findings.find(
      (f) =>
        f.pathology === Pathology.HallucinatedToolSuccess &&
        f.title.includes("fetch_data") &&
        f.title.includes("without acknowledgment"),
    );
    expect(hallucinatedFinding).toBeDefined();
    expect(hallucinatedFinding!.severity).toBe(Severity.Critical);
  });

  it("detects empty output treated as success with specific claims", () => {
    // Tool returns empty output with Success status, but assistant makes specific data claims
    const turns = [
      makeTurn({
        turnIndex: 0,
        toolCalls: [
          makeToolCall({
            toolName: "query_db",
            toolInput: { sql: "SELECT * FROM users" },
            toolOutput: "",
            status: ToolCallStatus.Success,
          }),
        ],
        messages: [
          makeMessage({ role: Role.User, content: "Query the user database." }),
          makeMessage({
            role: Role.Assistant,
            content:
              "The database returned 1500 users. The most active user is John Smith with 342 login events.",
          }),
        ],
      }),
    ];

    const bundle = makeBundle([
      makeSession({
        sessionId: "empty-output-session",
        turns,
        systemPrompt: "Use the `query_db` tool.",
        toolSchemas: [{ name: "query_db", description: "Query database" }],
      }),
    ]);

    const findings = detector.detect(bundle, config);

    const emptyOutputFinding = findings.find(
      (f) =>
        f.pathology === Pathology.HallucinatedToolSuccess &&
        f.title.includes("query_db") &&
        f.title.includes("empty/error output"),
    );
    expect(emptyOutputFinding).toBeDefined();
    expect(emptyOutputFinding!.severity).toBe(Severity.Warning);
  });

  it("detects partial result acceptance", () => {
    // Tool output contains truncation indicators but assistant treats it as complete
    const turns = [
      makeTurn({
        turnIndex: 0,
        toolCalls: [
          makeToolCall({
            toolName: "list_files",
            toolInput: { path: "/data" },
            toolOutput:
              "file1.txt\nfile2.txt\nfile3.txt\n... truncated, showing first 3 of 500 results. More results available.",
            status: ToolCallStatus.Success,
          }),
        ],
        messages: [
          makeMessage({ role: Role.User, content: "List all files in the data directory." }),
          makeMessage({
            role: Role.Assistant,
            content:
              "The data directory contains 3 files: file1.txt, file2.txt, and file3.txt. That is all the files in the directory.",
          }),
        ],
      }),
    ];

    const bundle = makeBundle([
      makeSession({
        sessionId: "partial-result-session",
        turns,
        systemPrompt: "Use the `list_files` tool.",
        toolSchemas: [{ name: "list_files", description: "List directory contents" }],
      }),
    ]);

    const findings = detector.detect(bundle, config);

    const partialFinding = findings.find(
      (f) =>
        f.pathology === Pathology.HallucinatedToolSuccess &&
        f.title.includes("list_files") &&
        f.title.includes("partial results"),
    );
    expect(partialFinding).toBeDefined();
    expect(partialFinding!.severity).toBe(Severity.Warning);
  });

  it("returns no findings for properly handled tool results", () => {
    // Case 1: Successful tool call with valid output, assistant references it correctly
    // Case 2: Failed tool call where assistant acknowledges the error
    const turns = [
      makeTurn({
        turnIndex: 0,
        toolCalls: [
          makeToolCall({
            toolName: "search",
            toolInput: { query: "weather today" },
            toolOutput: "Sunny, 72F in San Francisco",
            status: ToolCallStatus.Success,
          }),
        ],
        messages: [
          makeMessage({ role: Role.User, content: "What is the weather?" }),
          makeMessage({
            role: Role.Assistant,
            content: "According to my search, it is sunny and 72F in San Francisco today.",
          }),
        ],
      }),
      makeTurn({
        turnIndex: 1,
        toolCalls: [
          makeToolCall({
            toolName: "fetch_data",
            toolInput: { url: "http://example.com/broken" },
            toolOutput: "404 Not Found",
            status: ToolCallStatus.Error,
            errorMessage: "404 Not Found",
          }),
        ],
        messages: [
          makeMessage({ role: Role.User, content: "Get data from the broken endpoint." }),
          makeMessage({
            role: Role.Assistant,
            content:
              "Unfortunately, the request failed with a 404 error. The endpoint was not found. Let me try a different approach.",
          }),
        ],
      }),
    ];

    const bundle = makeBundle([
      makeSession({
        sessionId: "properly-handled-session",
        turns,
        systemPrompt: "Use `search` and `fetch_data`.",
        toolSchemas: [
          { name: "search", description: "Search" },
          { name: "fetch_data", description: "Fetch data" },
        ],
      }),
    ]);

    const findings = detector.detect(bundle, config);
    expect(findings.length).toBe(0);
  });
});
