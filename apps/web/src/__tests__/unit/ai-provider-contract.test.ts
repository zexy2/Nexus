// @vitest-environment node
/**
 * AI provider contract tests.
 *
 * Unlike the route tests, nothing from `ai` or `@ai-sdk/*` is mocked here: the
 * app's real model factory (`getUserModelConfig`), the real AI SDK and the real
 * provider packages run end to end. Only the network is replaced: provider
 * requests are routed to a local HTTP server that records them and replays
 * provider-shaped responses (handcrafted from the public wire formats).
 *
 * So an SDK/provider bump that changes the request we send (URL, model id,
 * system instruction, tool schema), cannot parse the provider's response, or
 * rejects the model object (e.g. `AI_UnsupportedModelVersionError`) fails here
 * instead of in production. No API keys, no external network.
 *
 * The app does not stream LLM output (no `streamText` callers), so only
 * `generateText` (plain and multi-step tool calling) is covered.
 */
import http from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { getRealFetch } from "../setup";

const state = vi.hoisted(() => ({
  defaultModel: "gemini-2.5-flash",
  // Rows the trace writer would insert into ai_traces.
  traceRows: [] as Record<string, unknown>[],
}));

// The model factory reads the user's preferred model from the database; the
// trace writer inserts ai_traces rows (captured, not sent anywhere).
vi.mock("@/lib/db", () => ({
  db: {
    insert: () => ({
      values: async (row: Record<string, unknown>) => {
        state.traceRows.push(row);
      },
    }),
    query: {
      userSettings: {
        findFirst: async () => ({ userId: "user-1", defaultModel: state.defaultModel }),
      },
    },
  },
}));

// Tool executors that would touch the database / web search.
const getRAGContext = vi.fn();
vi.mock("@/lib/ai/chat-rag", () => ({ getRAGContext: (...a: unknown[]) => getRAGContext(...a) }));
vi.mock("@/lib/ai/tavily", () => ({ searchWeb: vi.fn(async () => ({ answer: "", results: [] })) }));
vi.mock("@/lib/ai/chat-actions", () => ({
  createDocument: vi.fn(async () => ({ success: false })),
  createTask: vi.fn(async () => ({ success: false })),
}));

import { getUserModelConfig } from "@/lib/ai/model-config";
import { runAgent } from "@/lib/ai/agent";
import { generateTextTraced } from "@/lib/ai/traced-generate";
import { isAiQuotaError } from "@/lib/ai/quota";
import { cleanupTraces, getAllTraces } from "@/lib/observability";

// ---------------------------------------------------------------------------
// Fake provider server
// ---------------------------------------------------------------------------

const PROVIDER_HOSTS = new Set(["generativelanguage.googleapis.com", "api.openai.com"]);

interface RecordedRequest {
  host: string;
  method: string;
  path: string;
  headers: http.IncomingHttpHeaders;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  body: any;
}

interface FakeResponse {
  status?: number;
  json: unknown;
}

const recorded: RecordedRequest[] = [];
let replies: FakeResponse[] = [];
let server: http.Server;
let baseUrl = "";
let mockedFetch: typeof fetch;

beforeAll(async () => {
  server = http.createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on("data", (c: Buffer) => chunks.push(c));
    req.on("end", () => {
      const [, host, ...rest] = (req.url ?? "/").split("/");
      const raw = Buffer.concat(chunks).toString("utf8");
      recorded.push({
        host,
        method: req.method ?? "GET",
        path: `/${rest.join("/")}`,
        headers: req.headers,
        body: raw ? JSON.parse(raw) : null,
      });
      const reply = replies.shift();
      if (!reply) {
        res.writeHead(500, { "content-type": "application/json" });
        res.end(JSON.stringify({ error: { message: "fake provider: no reply queued" } }));
        return;
      }
      res.writeHead(reply.status ?? 200, { "content-type": "application/json" });
      res.end(JSON.stringify(reply.json));
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

beforeEach(() => {
  recorded.length = 0;
  replies = [];
  state.traceRows.length = 0;
  cleanupTraces(0);
  getRAGContext.mockResolvedValue("Roadmap doc: the Q3 launch moved to September.");
  mockedFetch = globalThis.fetch;
  const realFetch = getRealFetch();
  // Route provider hosts to the fake server, keeping the SDK's real path and
  // query. Anything else is a bug in the test (or an unexpected call).
  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(input instanceof Request ? input.url : String(input));
    if (url.protocol !== "https:" || !PROVIDER_HOSTS.has(url.host)) {
      throw new Error(`unexpected network call in contract test: ${url.href}`);
    }
    return realFetch(`${baseUrl}/${url.host}${url.pathname}${url.search}`, init);
  }) as typeof fetch;
});

afterEach(() => {
  globalThis.fetch = mockedFetch;
});

function useModel(defaultModel: string) {
  state.defaultModel = defaultModel;
  return getUserModelConfig("user-1");
}

const SYSTEM = "You are a contract-test assistant.";
const traceMeta = { name: "contract.test", agentType: "chat", userId: "user-1", workspaceId: "ws-1" };

// ---------------------------------------------------------------------------
// Gemini (default provider) — Generative Language API v1beta
// ---------------------------------------------------------------------------

function geminiText(text: string, usage = { prompt: 12, output: 7 }) {
  return {
    candidates: [
      { content: { role: "model", parts: [{ text }] }, finishReason: "STOP", index: 0 },
    ],
    usageMetadata: {
      promptTokenCount: usage.prompt,
      candidatesTokenCount: usage.output,
      totalTokenCount: usage.prompt + usage.output,
    },
    modelVersion: "gemini-2.5-flash",
    responseId: "gemini-resp-1",
  };
}

function geminiFunctionCall(name: string, args: Record<string, unknown>) {
  return {
    candidates: [
      {
        content: { role: "model", parts: [{ functionCall: { name, args } }] },
        finishReason: "STOP",
        index: 0,
      },
    ],
    usageMetadata: { promptTokenCount: 40, candidatesTokenCount: 6, totalTokenCount: 46 },
    modelVersion: "gemini-2.5-flash",
    responseId: "gemini-resp-0",
  };
}

describe("Gemini contract (default provider)", () => {
  it("model factory resolves the default Gemini model", async () => {
    const cfg = await useModel("gemini-2.5-flash");
    expect(cfg.provider).toBe("gemini");
    expect(cfg.modelName).toBe("gemini-2.5-flash");
    expect(cfg.model.modelId).toBe("gemini-2.5-flash");
  });

  it("plain generateText: request shape and parsed result", async () => {
    const { model, modelName, provider } = await useModel("gemini-2.5-flash");
    replies.push({ json: geminiText("Merhaba! Nasıl yardımcı olabilirim?") });

    const result = await generateTextTraced(
      { model, instructions: SYSTEM, messages: [{ role: "user", content: "Selam" }] },
      { ...traceMeta, modelName, provider }
    );

    expect(recorded).toHaveLength(1);
    const req = recorded[0];
    expect(req.host).toBe("generativelanguage.googleapis.com");
    expect(req.method).toBe("POST");
    expect(req.path).toBe("/v1beta/models/gemini-2.5-flash:generateContent");
    expect(req.headers["x-goog-api-key"]).toBe("test-gemini-key");
    expect(req.body.systemInstruction).toEqual({ parts: [{ text: SYSTEM }] });
    expect(req.body.contents).toEqual([{ role: "user", parts: [{ text: "Selam" }] }]);
    expect(req.body.tools).toBeUndefined();

    expect(result.text).toBe("Merhaba! Nasıl yardımcı olabilirim?");
    expect(result.finishReason).toBe("stop");
    expect(result.usage.inputTokens).toBe(12);
    expect(result.usage.outputTokens).toBe(7);
    expect(result.totalUsage.totalTokens).toBe(19);

    const [trace] = getAllTraces();
    expect(trace).toMatchObject({ status: "completed", tokens: 19 });
    expect(trace.metadata).toMatchObject({ model: "gemini-2.5-flash", provider: "gemini" });
  });

  it("auto agent: 2-step tool-calling loop (tool schema, function call, tool result, final text)", async () => {
    const { model, modelName, provider } = await useModel("gemini-2.5-flash");
    replies.push({ json: geminiFunctionCall("searchWorkspace", { query: "Q3 launch" }) });
    replies.push({ json: geminiText("Q3 lansmanı Eylül'e kaydı.", { prompt: 80, output: 9 }) });

    const result = await runAgent({
      model,
      messages: [{ role: "user", content: "Q3 lansmanı ne zaman?" }],
      context: { userId: "user-1", workspaceId: "ws-1" },
      trace: { modelName, provider },
    });

    expect(recorded).toHaveLength(2);
    const [first, second] = recorded;
    for (const req of recorded) {
      expect(req.path).toBe("/v1beta/models/gemini-2.5-flash:generateContent");
      expect(req.body.systemInstruction.parts[0].text).toContain("Nexus AI");
    }

    // Step 1: the tool schema is sent as Gemini function declarations.
    const declarations = first.body.tools?.[0]?.functionDeclarations;
    expect(declarations.map((d: { name: string }) => d.name).sort()).toEqual(
      ["createDocument", "createTask", "queryTasks", "searchWorkspace", "webSearch"]
    );
    const search = declarations.find((d: { name: string }) => d.name === "searchWorkspace");
    expect(search.description).toMatch(/workspace/i);
    // Gemini accepts the schema as `parametersJsonSchema` (JSON Schema, current
    // SDK) or `parameters` (OpenAPI subset); either is a valid wire format.
    const schemaOf = (d: { parametersJsonSchema?: unknown; parameters?: unknown }) =>
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (d.parametersJsonSchema ?? d.parameters) as any;
    expect(schemaOf(search)).toMatchObject({
      type: "object",
      properties: { query: { type: "string" } },
      required: ["query"],
    });
    const createTask = declarations.find((d: { name: string }) => d.name === "createTask");
    expect(schemaOf(createTask).properties.priority.enum).toEqual(["low", "medium", "high", "urgent"]);

    // The returned function call executed the real tool with the parsed args.
    expect(getRAGContext).toHaveBeenCalledWith("Q3 launch", "ws-1");

    // Step 2: the call and its result are sent back.
    expect(second.body.contents).toHaveLength(3);
    expect(second.body.contents[0]).toEqual({ role: "user", parts: [{ text: "Q3 lansmanı ne zaman?" }] });
    expect(second.body.contents[1]).toMatchObject({
      role: "model",
      parts: [{ functionCall: { name: "searchWorkspace", args: { query: "Q3 launch" } } }],
    });
    expect(second.body.contents[2]).toMatchObject({
      role: "user",
      parts: [
        {
          functionResponse: {
            name: "searchWorkspace",
            response: { name: "searchWorkspace", content: "Roadmap doc: the Q3 launch moved to September." },
          },
        },
      ],
    });

    // What the app consumes.
    expect(result.text).toBe("Q3 lansmanı Eylül'e kaydı.");
    expect(result.toolsUsed).toEqual(["searchWorkspace"]);
    expect(result.steps).toBe(2);
    const [trace] = getAllTraces();
    expect(trace).toMatchObject({ status: "completed", agentType: "agent", tokens: 46 + 89 });

    // The persisted ai_traces row is derived from the real SDK result.
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(state.traceRows).toHaveLength(1);
    expect(state.traceRows[0]).toMatchObject({
      agentType: "agent",
      provider: "gemini",
      model: "gemini-2.5-flash",
      inputTokens: 40 + 80,
      outputTokens: 6 + 9,
      totalTokens: 46 + 89,
      status: "ok",
      toolsUsed: ["searchWorkspace"],
      steps: 2,
    });
  });

  it("quota errors surface in a shape isAiQuotaError recognises", async () => {
    const { model } = await useModel("gemini-2.5-flash");
    replies.push({
      status: 429,
      json: {
        error: {
          code: 429,
          message: "You exceeded your current quota, please check your plan and billing details.",
          status: "RESOURCE_EXHAUSTED",
        },
      },
    });

    const error = await generateTextTraced(
      { model, prompt: "hi", maxRetries: 0 },
      traceMeta
    ).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(Error);
    expect(isAiQuotaError(error)).toBe(true);
    expect(getAllTraces()[0]).toMatchObject({ status: "failed" });
  });
});

// ---------------------------------------------------------------------------
// OpenAI — Responses API (the @ai-sdk/openai default for `openai(modelId)`)
// ---------------------------------------------------------------------------

function openaiUsage(input: number, output: number) {
  return {
    input_tokens: input,
    input_tokens_details: { cached_tokens: 0 },
    output_tokens: output,
    output_tokens_details: { reasoning_tokens: 0 },
    total_tokens: input + output,
  };
}

function openaiResponse(output: unknown[], usage: ReturnType<typeof openaiUsage>, id = "resp_1") {
  return {
    id,
    object: "response",
    created_at: 1764000000,
    status: "completed",
    error: null,
    incomplete_details: null,
    model: "gpt-4o-mini-2024-07-18",
    output,
    usage,
  };
}

function openaiText(text: string, usage = openaiUsage(14, 5)) {
  return openaiResponse(
    [
      {
        type: "message",
        id: "msg_1",
        status: "completed",
        role: "assistant",
        content: [{ type: "output_text", text, annotations: [] }],
      },
    ],
    usage,
    "resp_text"
  );
}

describe("OpenAI contract", () => {
  it("model factory resolves an OpenAI model from the user setting", async () => {
    const cfg = await useModel("gpt-4o-mini");
    expect(cfg.provider).toBe("openai");
    expect(cfg.model.modelId).toBe("gpt-4o-mini");
  });

  it("plain generateText: request shape and parsed result", async () => {
    const { model, modelName, provider } = await useModel("gpt-4o-mini");
    replies.push({ json: openaiText("Hello there!") });

    const result = await generateTextTraced(
      { model, instructions: SYSTEM, messages: [{ role: "user", content: "Hi" }] },
      { ...traceMeta, modelName, provider }
    );

    expect(recorded).toHaveLength(1);
    const req = recorded[0];
    expect(req.host).toBe("api.openai.com");
    expect(req.method).toBe("POST");
    expect(req.path).toBe("/v1/responses");
    expect(req.headers.authorization).toBe("Bearer sk-test-openai-key");
    expect(req.body.model).toBe("gpt-4o-mini");
    expect(req.body.input[0]).toMatchObject({ role: "system", content: SYSTEM });
    expect(req.body.input[1]).toMatchObject({
      role: "user",
      content: [{ type: "input_text", text: "Hi" }],
    });
    expect(req.body.tools).toBeUndefined();

    expect(result.text).toBe("Hello there!");
    expect(result.finishReason).toBe("stop");
    expect(result.usage.inputTokens).toBe(14);
    expect(result.usage.outputTokens).toBe(5);
    expect(result.totalUsage.totalTokens).toBe(19);
    expect(getAllTraces()[0]).toMatchObject({ status: "completed", tokens: 19 });
  });

  it("auto agent: 2-step tool-calling loop (tool schema, function call, tool result, final text)", async () => {
    const { model, modelName, provider } = await useModel("gpt-4o-mini");
    replies.push({
      json: openaiResponse(
        [
          {
            type: "function_call",
            id: "fc_1",
            call_id: "call_1",
            name: "searchWorkspace",
            arguments: JSON.stringify({ query: "Q3 launch" }),
            status: "completed",
          },
        ],
        openaiUsage(60, 10),
        "resp_tool"
      ),
    });
    replies.push({ json: openaiText("The Q3 launch moved to September.", openaiUsage(90, 8)) });

    const result = await runAgent({
      model,
      messages: [{ role: "user", content: "When is the Q3 launch?" }],
      context: { userId: "user-1", workspaceId: "ws-1" },
      trace: { modelName, provider },
    });

    expect(recorded).toHaveLength(2);
    const [first, second] = recorded;
    for (const req of recorded) {
      expect(req.path).toBe("/v1/responses");
      expect(req.body.model).toBe("gpt-4o-mini");
      expect(req.body.input[0].role).toBe("system");
      expect(req.body.input[0].content).toContain("Nexus AI");
    }

    // Step 1: tools are sent as Responses API function tools.
    const tools = first.body.tools as Array<{ type: string; name: string; parameters: Record<string, unknown> }>;
    expect(tools.every((t) => t.type === "function")).toBe(true);
    expect(tools.map((t) => t.name).sort()).toEqual(["createDocument", "createTask", "queryTasks", "searchWorkspace", "webSearch"]);
    expect(tools.find((t) => t.name === "searchWorkspace")!.parameters).toMatchObject({
      type: "object",
      properties: { query: { type: "string" } },
      required: ["query"],
    });

    expect(getRAGContext).toHaveBeenCalledWith("Q3 launch", "ws-1");

    // Step 2: the call is referenced and its output sent back by call_id.
    const input = second.body.input as Array<Record<string, unknown>>;
    expect(input[1]).toMatchObject({ role: "user", content: [{ type: "input_text", text: "When is the Q3 launch?" }] });
    const callItem = input.find((i) => i.type === "function_call" || i.type === "item_reference");
    expect(callItem).toBeDefined();
    if (callItem!.type === "function_call") {
      expect(callItem).toMatchObject({ call_id: "call_1", name: "searchWorkspace" });
    } else {
      expect(callItem).toMatchObject({ id: "fc_1" });
    }
    expect(input.find((i) => i.type === "function_call_output")).toMatchObject({
      call_id: "call_1",
      output: "Roadmap doc: the Q3 launch moved to September.",
    });

    expect(result.text).toBe("The Q3 launch moved to September.");
    expect(result.toolsUsed).toEqual(["searchWorkspace"]);
    expect(result.steps).toBe(2);
    expect(getAllTraces()[0]).toMatchObject({ status: "completed", tokens: 70 + 98 });
  });
});
