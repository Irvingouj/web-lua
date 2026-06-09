import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import {
  clearRegistry,
  isRegistryFrozen,
  registerHostHandler,
} from "@pi-oxide/extension-lua/shared";
import { WebSession } from "./index.js";

// Mock the WASM module
vi.mock("./web_lua.js", async () => {
  const actual = await vi.importActual<typeof import("./web_lua.js")>("./web_lua.js");
  return {
    ...actual,
    default: vi.fn().mockResolvedValue(undefined),
    getApiDocsJson: vi.fn().mockReturnValue("[]"),
    WebSession: vi.fn(function () {
      return {
        runCellAsync: vi.fn(),
        reset: vi.fn(),
        inspect_globals: vi.fn().mockReturnValue({ globals: [] }),
        set_fuel_limit: vi.fn(),
        load_library: vi.fn().mockReturnValue({ ok: true }),
        stopWith: vi.fn(),
      };
    }),
  };
});

describe("WebSession.init()", () => {
  beforeEach(() => {
    vi.stubGlobal("window", {});
    clearRegistry();
    // Re-register host handlers so syncHostHandlersToWindow has something to mirror.
    registerHostHandler("runtime_docs", async () => []);
    registerHostHandler("runtime_get_doc", async () => null);
    registerHostHandler("runtime_search_docs", async () => []);
  });

  afterEach(() => {
    clearRegistry();
    vi.unstubAllGlobals();
  });

  it("mirrors host handlers to window.__hostHandlers", async () => {
    await WebSession.init();
    const win = window as unknown as Record<string, unknown>;
    expect(win.__hostHandlers).toBeDefined();
    expect(typeof (win.__hostHandlers as Record<string, unknown>).runtime_docs).toBe("function");
    expect(typeof (win.__hostHandlers as Record<string, unknown>).runtime_get_doc).toBe("function");
    expect(typeof (win.__hostHandlers as Record<string, unknown>).runtime_search_docs).toBe("function");
  });

  it("freezes the registry after init", async () => {
    await WebSession.init();
    expect(isRegistryFrozen()).toBe(true);
  });
});
