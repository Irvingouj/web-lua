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
    it("has all 21 migrated handlers registered", async () => {
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
        "__ping",
        "__tool_docs",
      ];
      for (const action of expectedActions) {
        expect(csRegistry.has(action)).toBe(true);
      }
    });

    it("allows registering and retrieving a new tool", async () => {
      const { csRegistry, register } = await import(
        "./content-script.js"
      );
      const { z } = await import("zod");

      register(
      "test_echo",
      z.object({ msg: z.string() }),
      z.string(),
      {
        namespace: "test",
      name: "echo",
      publicName: "test.echo",
      localName: "test_echo",
      source: "content_script",
      transport: "active_tab_content_script",
      description: "Echo test",
      params: [
          { name: "msg", type: "string", required: true, description: "Message to echo" },
        ],
      returnType: "string",
      returnDoc: "Echoed message",
      errorCode: "E_CONTENT_SCRIPT",
      errorCategory: "content_script",
      },
      (params) => params.msg,
    );

      const tool = csRegistry.get("test_echo");
      expect(tool).toBeDefined();
      expect(tool?.action).toBe("test_echo");
      expect(tool?.publicName).toBe("test.echo");
      expect(tool?.returns).toBeDefined();
    });

    it("populates doc registries on registration", async () => {
      const {
        contentScriptDocsByPublicName,
        contentScriptDocsByAction,
        listLocalToolDocs,
      } = await import("./content-script.js");

      const docs = listLocalToolDocs();
      expect(docs.length).toBe(21);

      const clickDoc = contentScriptDocsByPublicName.get("page.click");
      expect(clickDoc).toBeDefined();
      expect(clickDoc?.action).toBe("page_click");
      expect(clickDoc?.localName).toBe("click");
      expect(clickDoc?.source).toBe("content_script");
      expect(clickDoc?.transport).toBe("active_tab_content_script");
      expect(clickDoc?.params.length).toBe(2);

      const clickDocByAction = contentScriptDocsByAction.get("page_click");
      expect(clickDocByAction).toBeDefined();
      expect(clickDocByAction?.publicName).toBe("page.click");
    });
  });

  describe("message listener", () => {
    function makeRequest(
      action: string,
      params?: Record<string, unknown>,
      overrides?: Record<string, unknown>,
    ) {
      return {
        channel: "piccolo-tool",
        version: 1,
        requestId: "test-req-1",
        action,
        params: params ?? {},
        ...overrides,
      };
    }

    it("rejects malformed messages without proper envelope", () => {
      listener({ action: "ping", params: {} }, {}, sendResponseMock);
      expect(sendResponseMock).toHaveBeenCalledTimes(1);
      expect(sendResponseMock).toHaveBeenCalledWith(
        expect.objectContaining({
          channel: "piccolo-tool",
          version: 1,
          error: expect.stringContaining("Malformed message"),
        }),
      );
    });

    it("rejects messages with wrong channel", () => {
      listener(
        makeRequest("ping", {}, { channel: "other-channel" }),
        {},
        sendResponseMock,
      );
      expect(sendResponseMock).toHaveBeenCalledTimes(1);
      expect(sendResponseMock).toHaveBeenCalledWith(
        expect.objectContaining({
          channel: "piccolo-tool",
          version: 1,
          requestId: "test-req-1",
          error: expect.stringContaining("Malformed message"),
        }),
      );
    });

    it("rejects messages with wrong version", () => {
      listener(
        makeRequest("ping", {}, { version: 2 }),
        {},
        sendResponseMock,
      );
      expect(sendResponseMock).toHaveBeenCalledTimes(1);
      expect(sendResponseMock).toHaveBeenCalledWith(
        expect.objectContaining({
          channel: "piccolo-tool",
          version: 1,
          requestId: "test-req-1",
          error: expect.stringContaining("Malformed message"),
        }),
      );
    });

    it("handles valid action with valid params", () => {
      listener(makeRequest("ping", {}), {}, sendResponseMock);
      expect(sendResponseMock).toHaveBeenCalledTimes(1);
      expect(sendResponseMock).toHaveBeenCalledWith({
        channel: "piccolo-tool",
        version: 1,
        requestId: "test-req-1",
        value: { ok: true },
      });
    });

    it("handles ping without params (defaults to empty object)", () => {
      listener(
        { channel: "piccolo-tool", version: 1, requestId: "test-req-1", action: "ping" },
        {},
        sendResponseMock,
      );
      expect(sendResponseMock).toHaveBeenCalledTimes(1);
      expect(sendResponseMock).toHaveBeenCalledWith({
        channel: "piccolo-tool",
        version: 1,
        requestId: "test-req-1",
        value: { ok: true },
      });
    });

    it("returns error for unknown action", () => {
      listener(makeRequest("unknown_action_xyz", {}), {}, sendResponseMock);
      expect(sendResponseMock).toHaveBeenCalledTimes(1);
      expect(sendResponseMock).toHaveBeenCalledWith({
        channel: "piccolo-tool",
        version: 1,
        requestId: "test-req-1",
        error: "Unknown content script action: unknown_action_xyz",
      });
    });

    it("returns error for invalid params", () => {
      listener(makeRequest("click", { refId: 123 }), {}, sendResponseMock);
      expect(sendResponseMock).toHaveBeenCalledTimes(1);
      expect(sendResponseMock).toHaveBeenCalledWith(
        expect.objectContaining({
          channel: "piccolo-tool",
          version: 1,
          requestId: "test-req-1",
          error: expect.stringContaining("Invalid params"),
        }),
      );
    });

    it("includes matching requestId in success responses", () => {
      listener(
        makeRequest("ping", {}, { requestId: "req-abc-123" }),
        {},
        sendResponseMock,
      );
      expect(sendResponseMock).toHaveBeenCalledWith(
        expect.objectContaining({
          channel: "piccolo-tool",
          version: 1,
          requestId: "req-abc-123",
          value: { ok: true },
        }),
      );
    });

    it("includes matching requestId in error responses", () => {
      listener(
        makeRequest("unknown_action_xyz", {}, { requestId: "req-err-456" }),
        {},
        sendResponseMock,
      );
      expect(sendResponseMock).toHaveBeenCalledWith(
        expect.objectContaining({
          channel: "piccolo-tool",
          version: 1,
          requestId: "req-err-456",
          error: expect.stringContaining("Unknown content script action"),
        }),
      );
    });

    it("catches sync handler errors and returns error via sendResponse", async () => {
      const { register } = await import("./content-script.js");
      const { z } = await import("zod");

      register(
      "test_sync_throw",
      z.object({}),
      z.null(),
      {
        namespace: "test",
      name: "sync_throw",
      publicName: "test.sync_throw",
      localName: "test_sync_throw",
      source: "content_script",
      transport: "active_tab_content_script",
      description: "Throws sync",
      params: [],
      returnType: "null",
      returnDoc: "None",
      errorCode: "E_CONTENT_SCRIPT",
      errorCategory: "content_script",
      },
      () => {
          throw new Error("Sync error");
        },
    );

      listener(makeRequest("test_sync_throw", {}), {}, sendResponseMock);
      expect(sendResponseMock).toHaveBeenCalledTimes(1);
      expect(sendResponseMock).toHaveBeenCalledWith({
        channel: "piccolo-tool",
        version: 1,
        requestId: "test-req-1",
        error: "Sync error",
      });
    });

    it("catches async handler rejections and returns error via sendResponse", async () => {
      const { register } = await import("./content-script.js");
      const { z } = await import("zod");

      register(
      "test_async_reject",
      z.object({}),
      z.null(),
      {
        namespace: "test",
      name: "async_reject",
      publicName: "test.async_reject",
      localName: "test_async_reject",
      source: "content_script",
      transport: "active_tab_content_script",
      description: "Rejects async",
      params: [],
      returnType: "null",
      returnDoc: "None",
      errorCode: "E_CONTENT_SCRIPT",
      errorCategory: "content_script",
      },
      async () => {
          throw new Error("Async error");
        },
    );

      const result = listener(
        makeRequest("test_async_reject", {}),
        {},
        sendResponseMock,
      );
      // Async handlers return true to keep channel open
      expect(result).toBe(true);

      // Wait for the promise chain to resolve
      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(sendResponseMock).toHaveBeenCalledTimes(1);
      expect(sendResponseMock).toHaveBeenCalledWith({
        channel: "piccolo-tool",
        version: 1,
        requestId: "test-req-1",
        error: "Async error",
      });
    });

    it("returns true for async handlers and false for sync handlers", async () => {
      const { register } = await import("./content-script.js");
      const { z } = await import("zod");

      register(
      "test_sync",
      z.object({}),
      z.string(),
      {
        namespace: "test",
      name: "sync",
      publicName: "test.sync",
      localName: "test_sync",
      source: "content_script",
      transport: "active_tab_content_script",
      description: "Sync handler",
      params: [],
      returnType: "string",
      returnDoc: "Sync result",
      errorCode: "E_CONTENT_SCRIPT",
      errorCategory: "content_script",
      },
      () => "sync result",
    );

      register(
      "test_async",
      z.object({}),
      z.string(),
      {
        namespace: "test",
      name: "async",
      publicName: "test.async",
      localName: "test_async",
      source: "content_script",
      transport: "active_tab_content_script",
      description: "Async handler",
      params: [],
      returnType: "string",
      returnDoc: "Async result",
      errorCode: "E_CONTENT_SCRIPT",
      errorCategory: "content_script",
      },
      async () => "async result",
    );

      const syncResult = listener(
        makeRequest("test_sync", {}),
        {},
        sendResponseMock,
      );
      expect(syncResult).toBe(false);

      const asyncResult = listener(
        makeRequest("test_async", {}),
        {},
        sendResponseMock,
      );
      expect(asyncResult).toBe(true);
    });
  });

  describe("zod schema validation", () => {
    function makeRequest(
      action: string,
      params?: Record<string, unknown>,
      overrides?: Record<string, unknown>,
    ) {
      return {
        channel: "piccolo-tool",
        version: 1,
        requestId: "test-req-1",
        action,
        params: params ?? {},
        ...overrides,
      };
    }

    it("click schema accepts empty params but handler catches missing element", () => {
      listener(makeRequest("click", {}), {}, sendResponseMock);
      expect(sendResponseMock).toHaveBeenCalledTimes(1);
      // Schema accepts {} (both fields optional), but handler throws when element not found
      expect(sendResponseMock).toHaveBeenCalledWith(
        expect.objectContaining({
          channel: "piccolo-tool",
          version: 1,
          requestId: "test-req-1",
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
        makeRequest("fill", { refId: "1", value: "x" }),
        {},
        sendResponseMock,
      );
      expect(sendResponseMock).toHaveBeenCalledTimes(1);
      // Should succeed (null return from handler)
      expect(sendResponseMock).toHaveBeenCalledWith({
        channel: "piccolo-tool",
        version: 1,
        requestId: "test-req-1",
        value: null,
      });
    });

    it("check schema rejects non-boolean checked value", () => {
      listener(
        makeRequest("check", { refId: "1", checked: "yes" }),
        {},
        sendResponseMock,
      );
      expect(sendResponseMock).toHaveBeenCalledTimes(1);
      expect(sendResponseMock).toHaveBeenCalledWith(
        expect.objectContaining({
          channel: "piccolo-tool",
          version: 1,
          requestId: "test-req-1",
          error: expect.stringContaining("Invalid params"),
        }),
      );
    });

    it("ping schema accepts empty object", () => {
      listener(makeRequest("ping", {}), {}, sendResponseMock);
      expect(sendResponseMock).toHaveBeenCalledWith({
        channel: "piccolo-tool",
        version: 1,
        requestId: "test-req-1",
        value: { ok: true },
      });
    });

    it("async handler returns result via sendResponse", async () => {
      const { register } = await import("./content-script.js");
      const { z } = await import("zod");

      register(
      "test_async_ok",
      z.object({}),
      z.object({ result: z.string() }),
      {
        namespace: "test",
      name: "async_ok",
      publicName: "test.async_ok",
      localName: "test_async_ok",
      source: "content_script",
      transport: "active_tab_content_script",
      description: "Async success",
      params: [],
      returnType: "object",
      returnDoc: "Async result",
      errorCode: "E_CONTENT_SCRIPT",
      errorCategory: "content_script",
      },
      async () => ({ result: "async-ok" }),
    );

      const keepOpen = listener(
        makeRequest("test_async_ok", {}),
        {},
        sendResponseMock,
      );
      expect(keepOpen).toBe(true);

      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(sendResponseMock).toHaveBeenCalledTimes(1);
      expect(sendResponseMock).toHaveBeenCalledWith({
        channel: "piccolo-tool",
        version: 1,
        requestId: "test-req-1",
        value: { result: "async-ok" },
      });
    });
  });
});
