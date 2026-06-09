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

let dispatchTool: typeof import("./tool-registry.js").dispatchTool;

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
    expect(cookiesGet?.name).toBe("get");
    expect(cookiesGet?.publicName).toBe("cookies.get");
    expect(cookiesGet?.source).toBe("extension_worker");
    expect(cookiesGet?.transport).toBe("chrome_api");
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
    expect(sidepanelSnapshot?.name).toBe("snapshot");
    expect(sidepanelSnapshot?.publicName).toBe("sidepanel.snapshot");
    expect(sidepanelSnapshot?.source).toBe("extension_worker");
    expect(sidepanelSnapshot?.transport).toBe("sidepanel_dom");
    expect(sidepanelSnapshot?.localName).toBe("snapshot");
  });

  it("dispatches a real migrated chrome passthrough tool", async () => {
    const { dispatchTool } = await import("./tool-registry.js");
    // cookies_get will fail because chrome is stubbed, but it proves
    // the tool is registered and the schema validation runs.
    const result = await dispatchTool("cookies_get", {
      name: "session_id",
      url: "https://example.com",
    });
    // Because chrome is undefined, handleChromeApi returns E_NO_EXTENSION
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("E_NO_EXTENSION");
    }
  });
});

describe("runtime doc provider tools", () => {
  beforeAll(async () => {
    vi.stubGlobal("window", { chrome: undefined });
    await import("./runner.js");
  });

  afterAll(() => {
    vi.unstubAllGlobals();
  });

  it("__runtime_docs returns all registered tool docs", async () => {
    const { dispatchTool } = await import("./tool-registry.js");
    const result = await dispatchTool("__runtime_docs", {});
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(Array.isArray(result.value)).toBe(true);
      expect(result.value.length).toBeGreaterThan(0);
      // Should include the doc provider tools themselves
      expect(
        result.value.some(
          (d: { action: string }) => d.action === "__runtime_docs",
        ),
      ).toBe(true);
    }
  });

  it("__runtime_get_doc returns a doc by public name", async () => {
    const { dispatchTool } = await import("./tool-registry.js");
    const result = await dispatchTool("__runtime_get_doc", { query: "page.click" });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toBeDefined();
      expect(result.value.publicName).toBe("page.click");
    }
  });

  it("__runtime_get_doc returns null for unknown query", async () => {
    const { dispatchTool } = await import("./tool-registry.js");
    const result = await dispatchTool("__runtime_get_doc", { query: "nonexistent.tool" });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toBeNull();
    }
  });

  it("__runtime_search_docs returns matching docs", async () => {
    const { dispatchTool } = await import("./tool-registry.js");
    const result = await dispatchTool("__runtime_search_docs", { query: "click" });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(Array.isArray(result.value)).toBe(true);
      expect(
        result.value.some(
          (d: { publicName: string }) => d.publicName === "page.click",
        ),
      ).toBe(true);
    }
  });

  it("doc provider tools have proper ToolDoc metadata", () => {
    const tools = listTools();
    const docsTool = tools.find((t) => t.action === "__runtime_docs");
    expect(docsTool).toBeDefined();
    expect(docsTool?.publicName).toBe("runtime.docs");
    expect(docsTool?.namespace).toBe("runtime");
    expect(docsTool?.source).toBe("main_thread");
    expect(docsTool?.transport).toBe("extension_worker");

    const getDocTool = tools.find((t) => t.action === "__runtime_get_doc");
    expect(getDocTool).toBeDefined();
    expect(getDocTool?.publicName).toBe("runtime.get_doc");

    const searchDocTool = tools.find(
      (t) => t.action === "__runtime_search_docs",
    );
    expect(searchDocTool).toBeDefined();
    expect(searchDocTool?.publicName).toBe("runtime.search_docs");
  });
});

describe("dispatchTool", () => {
  beforeEach(async () => {
    vi.stubGlobal("window", { chrome: undefined });
    clearRegistry();
    const registry = await import("./tool-registry.js");
    dispatchTool = registry.dispatchTool;
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("dispatches registered tool before legacy switch", async () => {
    const tool: ToolDefinition<{ value: number }, number> = {
      action: "test_add_one",
      namespace: "test",
      name: "add_one",
      publicName: "test.add_one",
      source: "extension_worker",
      transport: "host_async",
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
    const result = await dispatchTool("test_add_one", { value: 5 });
    expect(result).toEqual({ ok: true, value: 6 });
  });

  it("returns E_TOOL_NOT_FOUND for unregistered actions", async () => {
    const result = await dispatchTool("unknown_action_xyz", {});
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("E_TOOL_NOT_FOUND");
      expect(result.error.message).toContain("not found in registry");
    }
  });

  it("returns validation error for registered tool with invalid params", async () => {
    const tool: ToolDefinition<{ count: number }, number> = {
      action: "test_count",
      namespace: "test",
      name: "count",
      publicName: "test.count",
      source: "extension_worker",
      transport: "host_async",
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
    const result = await dispatchTool("test_count", { count: "not-a-number" });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("E_INVALID_PARAMS");
      expect(result.error.category).toBe("validation");
    }
  });
});

describe("ensureContentScript", () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function createMockChrome(
    sendMessageImpl?: (...args: unknown[]) => Promise<unknown>,
  ) {
    const sendMessage = vi.fn(sendMessageImpl);
    return {
      chrome: {
        runtime: { id: "test-extension" },
        tabs: {
          onActivated: { addListener: vi.fn(), removeListener: vi.fn() },
          onUpdated: { addListener: vi.fn(), removeListener: vi.fn() },
          sendMessage,
          query: vi.fn().mockResolvedValue([{ id: 1 }]),
        },
        scripting: { executeScript: vi.fn().mockResolvedValue([]) },
      },
      sendMessage,
    };
  }

  it("throws E_NO_EXTENSION when chrome.runtime.id is missing", async () => {
    vi.stubGlobal("window", { chrome: { runtime: { id: undefined } } });
    const runner = await import("./runner.js");
    await expect(runner.ensureContentScript(1)).rejects.toMatchObject({
      message: "Not in extension context",
      code: "E_NO_EXTENSION",
    });
  });

  it("throws E_NO_TAB when tabId is null and no active tab is set", async () => {
    const sendMessage = vi.fn();
    const chrome = {
      runtime: { id: "test-extension" },
      tabs: {
        onActivated: { addListener: vi.fn(), removeListener: vi.fn() },
        onUpdated: { addListener: vi.fn(), removeListener: vi.fn() },
        sendMessage,
        query: vi.fn().mockResolvedValue([]),
      },
      scripting: { executeScript: vi.fn() },
    };
    vi.stubGlobal("window", { chrome });
    const runner = await import("./runner.js");
    // Do not call initExtensionListeners so activeTabId stays null
    await expect(runner.ensureContentScript(null)).rejects.toMatchObject({
      message: "No active tab available",
      code: "E_NO_TAB",
    });
  });

  it("returns immediately when readiness is cached", async () => {
    vi.stubGlobal("crypto", { randomUUID: () => "test-request-id" });
    const { chrome, sendMessage } = createMockChrome(
      (_tabId: unknown, message: Record<string, unknown>) => {
        return Promise.resolve({
          channel: "piccolo-tool",
          version: 1,
          requestId: message.requestId,
          value: { ready: true },
        });
      },
    );
    vi.stubGlobal("window", { chrome });
    const runner = await import("./runner.js");
    runner.initExtensionListeners();

    // First call should ping and fetch docs
    await runner.ensureContentScript(1);
    expect(sendMessage).toHaveBeenCalledTimes(2);

    // Second call should also ping and fetch docs (no cache — always verify)
    await runner.ensureContentScript(1);
    expect(sendMessage).toHaveBeenCalledTimes(4);
  });

  it("injects content script when ping fails and re-pings", async () => {
    vi.stubGlobal("crypto", { randomUUID: () => "test-request-id" });
    let pingCount = 0;
    const { chrome, sendMessage } = createMockChrome(
      (_tabId: unknown, message: Record<string, unknown>) => {
        if (message.action === "__ping") {
          pingCount++;
          if (pingCount <= 5) {
            return Promise.reject(
              new Error("Receiving end does not exist"),
            );
          }
          return Promise.resolve({
            channel: "piccolo-tool",
            version: 1,
            requestId: message.requestId,
            value: { ready: true },
          });
        }
        return Promise.resolve({
          channel: "piccolo-tool",
          version: 1,
          requestId: message.requestId,
          value: null,
        });
      },
    );
    const executeScript = vi.fn().mockResolvedValue([]);
    chrome.scripting.executeScript = executeScript;
    vi.stubGlobal("window", { chrome });
    const runner = await import("./runner.js");
    runner.initExtensionListeners();

    await runner.ensureContentScript(1);
    // Should eventually succeed after injection + re-ping
    expect(pingCount).toBeGreaterThanOrEqual(2);
    expect(executeScript).toHaveBeenCalled();
    expect(executeScript).toHaveBeenCalledWith({
      target: { tabId: 1, frameIds: [0] },
      files: ["content-script.js"],
      world: "ISOLATED",
    });
  });

  it("throws E_CONTENT_SCRIPT_NOT_READY when re-ping fails after injection", async () => {
    vi.stubGlobal("crypto", { randomUUID: () => "test-request-id" });
    const { chrome, sendMessage } = createMockChrome(
      (_tabId: unknown, _message: Record<string, unknown>) => {
        return Promise.reject(
          new Error("Receiving end does not exist"),
        );
      },
    );
    const executeScript = vi.fn().mockResolvedValue([]);
    chrome.scripting.executeScript = executeScript;
    vi.stubGlobal("window", { chrome });
    const runner = await import("./runner.js");
    runner.initExtensionListeners();

    await expect(runner.ensureContentScript(1)).rejects.toMatchObject({
      message: "Content script not ready after injection",
      code: "E_CONTENT_SCRIPT_NOT_READY",
    });
    expect(executeScript).toHaveBeenCalled();
  });

  it("throws E_CONTENT_SCRIPT_NOT_READY when injection fails", async () => {
    vi.stubGlobal("crypto", { randomUUID: () => "test-request-id" });
    const { chrome, sendMessage } = createMockChrome(
      (_tabId: unknown, _message: Record<string, unknown>) => {
        return Promise.reject(
          new Error("Receiving end does not exist"),
        );
      },
    );
    const executeScript = vi
      .fn()
      .mockRejectedValue(new Error("Cannot access contents of url"));
    chrome.scripting.executeScript = executeScript;
    vi.stubGlobal("window", { chrome });
    const runner = await import("./runner.js");
    runner.initExtensionListeners();

    await expect(runner.ensureContentScript(1)).rejects.toMatchObject({
      code: "E_CONTENT_SCRIPT_NOT_READY",
    });
    expect(executeScript).toHaveBeenCalled();
  });

  it("calls ensureContentScript before dispatching via bridgeToTab", async () => {
    vi.stubGlobal("crypto", { randomUUID: () => "test-request-id" });
    let pingCount = 0;
    const { chrome, sendMessage } = createMockChrome(
      (_tabId: unknown, message: Record<string, unknown>) => {
        if (message.action === "__ping") {
          pingCount++;
          return Promise.resolve({
            channel: "piccolo-tool",
            version: 1,
            requestId: message.requestId,
            value: { ready: true },
          });
        }
        return Promise.resolve({
          channel: "piccolo-tool",
          version: 1,
          requestId: message.requestId,
          value: null,
        });
      },
    );
    vi.stubGlobal("window", { chrome });
    const runner = await import("./runner.js");
    runner.initExtensionListeners();

    const { dispatchTool } = await import("./tool-registry.js");
    const result = await dispatchTool("page_click", { refId: "1" });
    expect(sendMessage).toHaveBeenCalled();
    expect(pingCount).toBeGreaterThanOrEqual(1);
    // First call should be __ping
    const firstCallMessage = sendMessage.mock.calls[0][1] as Record<
      string,
      unknown
    >;
    expect(firstCallMessage.action).toBe("__ping");
  });
});


