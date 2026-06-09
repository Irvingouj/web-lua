import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { toErrorMessage } from "../src/shared/errors.js";
import type { AsyncResponse, ToolDoc } from "../src/shared/registry/types.js";

function createMockChrome() {
  const sendMessage = vi.fn(
    (_tabId: unknown, message: Record<string, unknown>) => {
      if (message.action === "__ping") {
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

  return {
    chrome: {
      runtime: { id: "test-extension" },
      tabs: {
        onActivated: { addListener: vi.fn(), removeListener: vi.fn() },
        onUpdated: { addListener: vi.fn(), removeListener: vi.fn() },
        sendMessage,
        query: vi.fn().mockResolvedValue([{ id: 1 }]),
        create: vi.fn().mockResolvedValue({ id: 2 }),
      },
      scripting: { executeScript: vi.fn().mockResolvedValue([]) },
    },
    sendMessage,
  };
}

describe("doctest runner", () => {
  let doctestTools: Array<{ action: string; script: string }> = [];
  let dispatchTool: (action: string, params: unknown) => Promise<AsyncResponse>;

  beforeAll(async () => {
    const { chrome } = createMockChrome();

    // Mock DOM for sidepanel tools
    const mockElement = {
      tagName: "BUTTON",
      click: vi.fn(),
      dispatchEvent: vi.fn(),
      setAttribute: vi.fn(),
      getAttribute: vi.fn(),
      style: {},
      classList: {
        add: vi.fn(),
        remove: vi.fn(),
        contains: vi.fn(() => false),
      },
    };

    const mockDocument = {
      querySelector: vi.fn((selector: string) => {
        if (selector.includes("data-ref-id")) {
          return mockElement;
        }
        return null;
      }),
      querySelectorAll: vi.fn(() => []),
      createElement: vi.fn((tag: string) => ({
        tagName: tag.toUpperCase(),
        setAttribute: vi.fn(),
        appendChild: vi.fn(),
        removeChild: vi.fn(),
        style: {},
        classList: {
          add: vi.fn(),
          remove: vi.fn(),
          contains: vi.fn(() => false),
        },
      })),
      body: {
        appendChild: vi.fn(),
        removeChild: vi.fn(),
        querySelector: vi.fn(),
        querySelectorAll: vi.fn(() => []),
      },
      documentElement: {
        scrollTop: 0,
        scrollLeft: 0,
        scrollHeight: 0,
        scrollWidth: 0,
        clientHeight: 0,
        clientWidth: 0,
      },
      title: "Test Page",
    };

    vi.stubGlobal("crypto", { randomUUID: () => "test-request-id" });
    vi.stubGlobal("CSS", { escape: (s: string) => s });
    vi.stubGlobal("document", mockDocument);
    vi.stubGlobal("window", {
      chrome,
      document: mockDocument,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      location: { href: "https://example.com" },
      scrollBy: vi.fn(),
    });
    vi.stubGlobal("chrome", chrome);

    // Reset modules so side-effect registrations in the runner re-execute
    vi.resetModules();

    // Re-import registry so we reference the same instance the runner will populate
    const registry = await import("../src/shared/tool-registry.js");
    registry.clearRegistry();
    doctestTools = registry.doctestTools;
    dispatchTool = registry.dispatchTool;

    // Import runner to trigger all registerTool() and registerDoctest() calls
    await import("../src/main/runner/index.js");

    // Initialize extension listeners so getActiveTabId() returns a tab ID
    const { initExtensionListeners } = await import("../src/main/runner/runtime.js");
    initExtensionListeners();
  });

  afterAll(() => {
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  it("collects at least 3 doctests (page, chrome, sidepanel)", () => {
    if (typeof __DOCTEST__ === "undefined" || !__DOCTEST__) {
      // Skip in non-doctest mode — doctests are only collected when __DOCTEST__ is true
      return;
    }
    expect(doctestTools.length).toBeGreaterThanOrEqual(3);
    const actions = doctestTools.map((t) => t.action);
    expect(actions.some((a) => a.startsWith("page_"))).toBe(true);
    expect(actions.some((a) => a.startsWith("chrome_"))).toBe(true);
    expect(actions.some((a) => a.startsWith("sidepanel_"))).toBe(true);
  });

  it("executes all doctest scripts with callTool helper", async () => {
    if (doctestTools.length === 0) {
      // No doctests to run
      return;
    }

    const callTool = async (
      action: string,
      params: unknown,
    ): Promise<unknown> => {
      const result = await dispatchTool(action, params);
      if (!result.ok) {
        throw new Error(result.error.message);
      }
      return result.value;
    };

    const errors: string[] = [];

    for (const { action, script } of doctestTools) {
      try {
        const AsyncFunction = Object.getPrototypeOf(
          async function () {},
        ).constructor;
        const fn = new AsyncFunction("callTool", "expect", script);
        await fn(callTool, expect);
      } catch (err) {
        const message = toErrorMessage(err);
        errors.push(`Doctest failed for "${action}": ${message}`);
      }
    }

    expect(errors).toEqual([]);
  });
});
