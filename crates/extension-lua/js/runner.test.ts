import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { z } from "zod";
import {
  clearRegistry,
  listTools,
  registerTool,
  type ToolDefinition,
} from "./tool-registry.js";

let executeMainThreadCommand: typeof import("./runner.js").executeMainThreadCommand;

describe("real migrated tool registrations", () => {
  beforeAll(async () => {
    vi.stubGlobal("window", { chrome: undefined });
    await import("./runner.js");
  });

  afterAll(() => {
    vi.unstubAllGlobals();
  });

  it("has migrated chrome passthrough tools registered", () => {
    const tools = listTools();
    const cookiesGet = tools.find((t) => t.action === "cookies_get");
    expect(cookiesGet).toBeDefined();
    expect(cookiesGet?.namespace).toBe("cookies");
    expect(cookiesGet?.description).toBe("Get a cookie by details");
    expect(cookiesGet?.params).toHaveLength(1);
    expect(cookiesGet?.params[0].name).toBe("details");
  });

  it("has migrated sidepanel tools registered", () => {
    const tools = listTools();
    const sidepanelSnapshot = tools.find(
      (t) => t.action === "sidepanel_snapshot",
    );
    expect(sidepanelSnapshot).toBeDefined();
    expect(sidepanelSnapshot?.namespace).toBe("sidepanel");
    expect(sidepanelSnapshot?.description).toBe(
      "Take a DOM snapshot of the sidepanel and return text",
    );
    expect(sidepanelSnapshot?.params).toHaveLength(2);
    expect(sidepanelSnapshot?.params[0].name).toBe("max_nodes");
    expect(sidepanelSnapshot?.params[1].name).toBe("interactive_only");
  });

  it("dispatches a real migrated chrome passthrough tool", async () => {
    const runner = await import("./runner.js");
    // cookies_get will fail because chrome is stubbed, but it proves
    // the tool is registered and the schema validation runs.
    const result = await runner.executeMainThreadCommand({
      action: "cookies_get",
      params: { name: "session_id", url: "https://example.com" },
    });
    // Because chrome is undefined, handleChromeApi returns E_NO_EXTENSION
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("E_NO_EXTENSION");
    }
  });
});

describe("executeMainThreadCommand", () => {
  beforeEach(async () => {
    vi.stubGlobal("window", { chrome: undefined });
    clearRegistry();
    const runner = await import("./runner.js");
    executeMainThreadCommand = runner.executeMainThreadCommand;
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("dispatches registered tool before legacy switch", async () => {
    const tool: ToolDefinition<{ value: number }, number> = {
      action: "test_add_one",
      namespace: "test",
      description: "Adds one to a number",
      params: z.object({ value: z.number() }),
      returns: z.number(),
      handler: async (params) => params.value + 1,
      paramDocs: { value: "The number to increment" },
      paramTypes: [
        {
          name: "value",
          type: "number",
          required: true,
          description: "The number to increment",
        },
      ],
      returnDoc: "The incremented number",
      errorCode: "E_TEST",
      errorCategory: "test",
    };

    registerTool(tool);
    const result = await executeMainThreadCommand({
      action: "test_add_one",
      params: { value: 5 },
    });
    expect(result).toEqual({ ok: true, value: 6 });
  });

  it("falls back to legacy switch for unregistered actions", async () => {
    const result = await executeMainThreadCommand({
      action: "unknown_action_xyz",
      params: {},
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("EUNKNOWN");
      expect(result.error.message).toContain("Unknown main-thread action");
    }
  });

  it("returns validation error for registered tool with invalid params", async () => {
    const tool: ToolDefinition<{ count: number }, number> = {
      action: "test_count",
      namespace: "test",
      description: "Returns the count",
      params: z.object({ count: z.number() }),
      returns: z.number(),
      handler: async (params) => params.count,
      paramDocs: { count: "The count" },
      paramTypes: [
        {
          name: "count",
          type: "number",
          required: true,
          description: "The count",
        },
      ],
      returnDoc: "The count",
      errorCode: "E_TEST",
      errorCategory: "test",
    };

    registerTool(tool);
    const result = await executeMainThreadCommand({
      action: "test_count",
      params: { count: "not-a-number" },
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("E_INVALID_PARAMS");
      expect(result.error.category).toBe("validation");
    }
  });
});

describe("normalizeParams", () => {
  beforeEach(async () => {
    vi.stubGlobal("window", { chrome: undefined });
    clearRegistry();
    const runner = await import("./runner.js");
    executeMainThreadCommand = runner.executeMainThreadCommand;
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("converts array params to object for tab_click", async () => {
    const captured: unknown[] = [];
    registerTool({
      action: "tab_click",
      namespace: "test",
      description: "Capture params",
      params: z.object({ tabId: z.coerce.bigint(), refId: z.string() }),
      returns: z.string(),
      handler: async (params) => {
        captured.push(params);
        return "ok";
      },
      paramDocs: { tabId: "Tab ID", refId: "Ref ID" },
      paramTypes: [
        {
          name: "tabId",
          type: "bigint",
          required: true,
          description: "Tab ID",
        },
        {
          name: "refId",
          type: "string",
          required: true,
          description: "Ref ID",
        },
      ],
      returnDoc: "ok",
      errorCode: "E_TEST",
      errorCategory: "test",
    });

    const result = await executeMainThreadCommand({
      action: "tab_click",
      params: [42, "ref-1"],
    });
    expect(result).toEqual({ ok: true, value: "ok" });
    expect(captured).toHaveLength(1);
    expect(captured[0]).toEqual({ tabId: 42n, refId: "ref-1" });
  });

  it("converts array params to object for tab_fill", async () => {
    const captured: unknown[] = [];
    registerTool({
      action: "tab_fill",
      namespace: "test",
      description: "Capture params",
      params: z.object({
        tabId: z.coerce.bigint(),
        refId: z.string(),
        value: z.string(),
      }),
      returns: z.string(),
      handler: async (params) => {
        captured.push(params);
        return "ok";
      },
      paramDocs: { tabId: "Tab ID", refId: "Ref ID", value: "Value" },
      paramTypes: [
        {
          name: "tabId",
          type: "bigint",
          required: true,
          description: "Tab ID",
        },
        {
          name: "refId",
          type: "string",
          required: true,
          description: "Ref ID",
        },
        { name: "value", type: "string", required: true, description: "Value" },
      ],
      returnDoc: "ok",
      errorCode: "E_TEST",
      errorCategory: "test",
    });

    const result = await executeMainThreadCommand({
      action: "tab_fill",
      params: [42, "ref-1", "hello"],
    });
    expect(result).toEqual({ ok: true, value: "ok" });
    expect(captured).toHaveLength(1);
    expect(captured[0]).toEqual({ tabId: 42n, refId: "ref-1", value: "hello" });
  });

  it("converts raw number to object for tab_back", async () => {
    const captured: unknown[] = [];
    registerTool({
      action: "tab_back",
      namespace: "test",
      description: "Capture params",
      params: z.object({ tabId: z.coerce.bigint() }),
      returns: z.string(),
      handler: async (params) => {
        captured.push(params);
        return "ok";
      },
      paramDocs: { tabId: "Tab ID" },
      paramTypes: [
        {
          name: "tabId",
          type: "bigint",
          required: true,
          description: "Tab ID",
        },
      ],
      returnDoc: "ok",
      errorCode: "E_TEST",
      errorCategory: "test",
    });

    const result = await executeMainThreadCommand({
      action: "tab_back",
      params: 42,
    });
    expect(result).toEqual({ ok: true, value: "ok" });
    expect(captured).toHaveLength(1);
    expect(captured[0]).toEqual({ tabId: 42n });
  });

  it("converts array params with defaults for tab_scroll", async () => {
    const captured: unknown[] = [];
    registerTool({
      action: "tab_scroll",
      namespace: "test",
      description: "Capture params",
      params: z.object({
        tabId: z.coerce.bigint(),
        direction: z.string().default("down"),
        amount: z.number().default(300),
      }),
      returns: z.string(),
      handler: async (params) => {
        captured.push(params);
        return "ok";
      },
      paramDocs: { tabId: "Tab ID", direction: "Direction", amount: "Amount" },
      paramTypes: [
        {
          name: "tabId",
          type: "bigint",
          required: true,
          description: "Tab ID",
        },
        {
          name: "direction",
          type: "string",
          required: false,
          description: "Direction",
        },
        {
          name: "amount",
          type: "number",
          required: false,
          description: "Amount",
        },
      ],
      returnDoc: "ok",
      errorCode: "E_TEST",
      errorCategory: "test",
    });

    const result = await executeMainThreadCommand({
      action: "tab_scroll",
      params: [42],
    });
    expect(result).toEqual({ ok: true, value: "ok" });
    expect(captured).toHaveLength(1);
    expect(captured[0]).toEqual({ tabId: 42n, direction: "down", amount: 300 });
  });

  it("converts array params with explicit timeout for tab_wait_for_load", async () => {
    const captured: unknown[] = [];
    registerTool({
      action: "tab_wait_for_load",
      namespace: "test",
      description: "Capture params",
      params: z.object({
        tabId: z.coerce.bigint(),
        timeout: z.coerce.bigint().default(30000n),
      }),
      returns: z.string(),
      handler: async (params) => {
        captured.push(params);
        return "ok";
      },
      paramDocs: { tabId: "Tab ID", timeout: "Timeout" },
      paramTypes: [
        {
          name: "tabId",
          type: "bigint",
          required: true,
          description: "Tab ID",
        },
        {
          name: "timeout",
          type: "bigint",
          required: false,
          description: "Timeout",
        },
      ],
      returnDoc: "ok",
      errorCode: "E_TEST",
      errorCategory: "test",
    });

    const result = await executeMainThreadCommand({
      action: "tab_wait_for_load",
      params: [42, 10000],
    });
    expect(result).toEqual({ ok: true, value: "ok" });
    expect(captured).toHaveLength(1);
    expect(captured[0]).toEqual({ tabId: 42n, timeout: 10000n });
  });

  it("applies default bigint timeout for tab_wait_for_load", async () => {
    const captured: unknown[] = [];
    registerTool({
      action: "tab_wait_for_load",
      namespace: "test",
      description: "Capture params",
      params: z.object({
        tabId: z.coerce.bigint(),
        timeout: z.coerce.bigint().default(30000n),
      }),
      returns: z.string(),
      handler: async (params) => {
        captured.push(params);
        return "ok";
      },
      paramDocs: { tabId: "Tab ID", timeout: "Timeout" },
      paramTypes: [
        {
          name: "tabId",
          type: "bigint",
          required: true,
          description: "Tab ID",
        },
        {
          name: "timeout",
          type: "bigint",
          required: false,
          description: "Timeout",
        },
      ],
      returnDoc: "ok",
      errorCode: "E_TEST",
      errorCategory: "test",
    });

    const result = await executeMainThreadCommand({
      action: "tab_wait_for_load",
      params: [42],
    });
    expect(result).toEqual({ ok: true, value: "ok" });
    expect(captured).toHaveLength(1);
    expect(captured[0]).toEqual({ tabId: 42n, timeout: 30000n });
  });
});
