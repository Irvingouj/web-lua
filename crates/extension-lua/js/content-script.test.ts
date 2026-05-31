import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

describe("content-script", () => {
  let listener: (
    request: unknown,
    sender: unknown,
    sendResponse: (response: unknown) => void,
  ) => boolean;
  let sendResponseMock: ReturnType<typeof vi.fn>;
  let chromeMock: {
    runtime: {
      onMessage: {
        addListener: (
          fn: (
            request: unknown,
            sender: unknown,
            sendResponse: (response: unknown) => void,
          ) => boolean,
        ) => void;
      };
    };
  };

  beforeEach(async () => {
    vi.resetModules();

    sendResponseMock = vi.fn();

    // Mock chrome.runtime.onMessage to capture the listener
    chromeMock = {
      runtime: {
        onMessage: {
          addListener: vi.fn((fn) => {
            listener = fn;
          }),
        },
      },
    };
    vi.stubGlobal("chrome", chromeMock);

    // Mock window for content script injection guard
    vi.stubGlobal("window", {
      __luaNotebookContentScriptInjected: false,
      __luaNotebookSetLogLevel: undefined,
      getComputedStyle: vi.fn(() => ({ overflow: "auto" })),
    });

    // Mock CSS.escape for getElementByRefId
    vi.stubGlobal("CSS", { escape: (s: string) => s });

    // Mock DOM element constructors used by handlers
    class MockHTMLInputElement {}
    class MockHTMLTextAreaElement {}
    class MockInputEvent {}
    vi.stubGlobal("HTMLInputElement", MockHTMLInputElement);
    vi.stubGlobal("HTMLTextAreaElement", MockHTMLTextAreaElement);
    vi.stubGlobal("InputEvent", MockInputEvent);

    // Mock document for DOM handlers
    vi.stubGlobal("document", {
      querySelector: vi.fn(),
      querySelectorAll: vi.fn(() => []),
      getElementById: vi.fn(),
      title: "Test Page",
      body: {
        scrollBy: vi.fn(),
        dispatchEvent: vi.fn(),
        style: {},
        children: [],
        tagName: "BODY",
        getAttribute: vi.fn(),
        setAttribute: vi.fn(),
      },
      dispatchEvent: vi.fn(),
    });

    // Import the module fresh so the listener is registered with our mocks
    await import("./content-script.js");
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe("registry", () => {
    it("has all 18 migrated handlers registered", async () => {
      const { csRegistry } = await import("./content-script.js");
      const expectedActions = [
        "click",
        "fill",
        "type",
        "append",
        "press",
        "select",
        "check",
        "hover",
        "unhover",
        "scroll",
        "scrollTo",
        "dblclick",
        "forward",
        "reload",
        "evaluate",
        "back",
        "ping",
        "snapshot",
        "fetch",
      ];
      for (const action of expectedActions) {
        expect(csRegistry.has(action)).toBe(true);
      }
    });

    it("allows registering and retrieving a new tool", async () => {
      const { csRegistry, registerContentScriptTool } = await import(
        "./content-script.js"
      );
      const { z } = await import("zod");

      registerContentScriptTool({
        action: "test_echo",
        description: "Echo test",
        params: z.object({ msg: z.string() }),
        handler: (params) => params.msg,
      });

      const tool = csRegistry.get("test_echo");
      expect(tool).toBeDefined();
      expect(tool?.action).toBe("test_echo");
    });
  });

  describe("message listener", () => {
    it("handles valid action with valid params", () => {
      listener({ action: "ping", params: {} }, {}, sendResponseMock);
      expect(sendResponseMock).toHaveBeenCalledTimes(1);
      expect(sendResponseMock).toHaveBeenCalledWith({ ok: true });
    });

    it("handles ping without params (defaults to empty object)", () => {
      listener({ action: "ping" }, {}, sendResponseMock);
      expect(sendResponseMock).toHaveBeenCalledTimes(1);
      expect(sendResponseMock).toHaveBeenCalledWith({ ok: true });
    });

    it("returns error for unknown action", () => {
      listener(
        { action: "unknown_action_xyz", params: {} },
        {},
        sendResponseMock,
      );
      expect(sendResponseMock).toHaveBeenCalledTimes(1);
      expect(sendResponseMock).toHaveBeenCalledWith({
        ok: false,
        error: "Unknown content script action: unknown_action_xyz",
      });
    });

    it("returns error for invalid params", () => {
      listener(
        { action: "click", params: { refId: 123 } },
        {},
        sendResponseMock,
      );
      expect(sendResponseMock).toHaveBeenCalledTimes(1);
      expect(sendResponseMock).toHaveBeenCalledWith(
        expect.objectContaining({
          ok: false,
          error: expect.stringContaining("Invalid params"),
        }),
      );
    });

    it("catches sync handler errors and returns error via sendResponse", async () => {
      const { registerContentScriptTool } = await import("./content-script.js");
      const { z } = await import("zod");

      registerContentScriptTool({
        action: "test_sync_throw",
        description: "Throws sync",
        params: z.object({}),
        handler: () => {
          throw new Error("Sync error");
        },
      });

      listener({ action: "test_sync_throw", params: {} }, {}, sendResponseMock);
      expect(sendResponseMock).toHaveBeenCalledTimes(1);
      expect(sendResponseMock).toHaveBeenCalledWith({
        ok: false,
        error: "Sync error",
      });
    });

    it("catches async handler rejections and returns error via sendResponse", async () => {
      const { registerContentScriptTool } = await import("./content-script.js");
      const { z } = await import("zod");

      registerContentScriptTool({
        action: "test_async_reject",
        description: "Rejects async",
        params: z.object({}),
        handler: async () => {
          throw new Error("Async error");
        },
      });

      const result = listener(
        { action: "test_async_reject", params: {} },
        {},
        sendResponseMock,
      );
      // Async handlers return true to keep channel open
      expect(result).toBe(true);

      // Wait for the promise chain to resolve
      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(sendResponseMock).toHaveBeenCalledTimes(1);
      expect(sendResponseMock).toHaveBeenCalledWith({
        ok: false,
        error: "Async error",
      });
    });

    it("returns true for async handlers and false for sync handlers", async () => {
      const { registerContentScriptTool } = await import("./content-script.js");
      const { z } = await import("zod");

      registerContentScriptTool({
        action: "test_sync",
        description: "Sync handler",
        params: z.object({}),
        handler: () => "sync result",
      });

      registerContentScriptTool({
        action: "test_async",
        description: "Async handler",
        params: z.object({}),
        handler: async () => "async result",
      });

      const syncResult = listener(
        { action: "test_sync", params: {} },
        {},
        sendResponseMock,
      );
      expect(syncResult).toBe(false);

      const asyncResult = listener(
        { action: "test_async", params: {} },
        {},
        sendResponseMock,
      );
      expect(asyncResult).toBe(true);
    });
  });

  describe("zod schema validation", () => {
    it("click schema accepts empty params but handler catches missing element", () => {
      listener({ action: "click", params: {} }, {}, sendResponseMock);
      expect(sendResponseMock).toHaveBeenCalledTimes(1);
      // Schema accepts {} (both fields optional), but handler throws when element not found
      expect(sendResponseMock).toHaveBeenCalledWith(
        expect.objectContaining({
          ok: false,
          error: expect.stringContaining("Element not found"),
        }),
      );
    });

    it("fill schema accepts valid params", () => {
      // Mock document.querySelector to return an input element
      const doc = globalThis.document as unknown as {
        querySelector: ReturnType<typeof vi.fn>;
      };
      const inputEl = Object.create(globalThis.HTMLInputElement.prototype);
      Object.assign(inputEl, {
        tagName: "INPUT",
        value: "",
        dispatchEvent: vi.fn(),
      });
      doc.querySelector.mockReturnValue(inputEl);

      listener(
        { action: "fill", params: { refId: "1", value: "x" } },
        {},
        sendResponseMock,
      );
      expect(sendResponseMock).toHaveBeenCalledTimes(1);
      // Should succeed (null return from handler)
      expect(sendResponseMock).toHaveBeenCalledWith(null);
    });

    it("check schema rejects non-boolean checked value", () => {
      listener(
        { action: "check", params: { refId: "1", checked: "yes" } },
        {},
        sendResponseMock,
      );
      expect(sendResponseMock).toHaveBeenCalledTimes(1);
      expect(sendResponseMock).toHaveBeenCalledWith(
        expect.objectContaining({
          ok: false,
          error: expect.stringContaining("Invalid params"),
        }),
      );
    });

    it("ping schema accepts empty object", () => {
      listener({ action: "ping", params: {} }, {}, sendResponseMock);
      expect(sendResponseMock).toHaveBeenCalledWith({ ok: true });
    });

    it("async handler returns result via sendResponse", async () => {
      const { registerContentScriptTool } = await import("./content-script.js");
      const { z } = await import("zod");

      registerContentScriptTool({
        action: "test_async_ok",
        description: "Async success",
        params: z.object({}),
        handler: async () => ({ result: "async-ok" }),
      });

      const keepOpen = listener(
        { action: "test_async_ok", params: {} },
        {},
        sendResponseMock,
      );
      expect(keepOpen).toBe(true);

      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(sendResponseMock).toHaveBeenCalledTimes(1);
      expect(sendResponseMock).toHaveBeenCalledWith({ result: "async-ok" });
    });
  });
});
