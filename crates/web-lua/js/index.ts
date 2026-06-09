// JS wrapper for @pi-oxide/web-lua
// Provides init() / stop_with() lifecycle API.
// WebSession runs on the main thread and handles all browser side-effects
// directly via web_sys.

import type { CellResult, WasmGlobalsSnapshot } from "./web_lua.js";
import wasmInit, {
  getApiDocsJson,
  WebSession as RawWebSession,
} from "./web_lua.js";
import {
  MergedDocRegistry,
  registerHostHandler,
  type AsyncError,
  type AsyncResponse,
  type Command,
  type ToolDefinition,
  type ToolDoc,
  type ToolDocParam,
  type ToolRegistrationDoc,
  type ToolReturnDoc,
  type ToolSource,
  type ToolTransport,
  clearRegistry,
  dispatchTool,
  freezeRegistry,
  getTool,
  isRegistryFrozen,
  listTools,
  register,
  registerHostHandlers,
  registerTool,
} from "@pi-oxide/extension-lua/shared";

export type {
  AsyncError,
  AsyncResponse,
  Command,
  ToolDefinition,
  ToolDoc,
  ToolDocParam,
  ToolRegistrationDoc,
  ToolReturnDoc,
  ToolSource,
  ToolTransport,
};
export {
  clearRegistry,
  dispatchTool,
  getTool,
  listTools,
  MergedDocRegistry,
  register,
  registerHostHandler,
  registerHostHandlers,
  registerTool,
};
export type {
  CellResult as LuaRunResult,
  WasmGlobalsSnapshot as LuaGlobalsSnapshot,
};

export interface LuaApiDoc {
  namespace: string;
  name: string;
  public_name: string;
  action: string | null;
  local_name: string | null;
  description: string;
  params: {
    name: string;
    lua_type: string;
    required: boolean;
    description: string;
  }[];
  returns: {
    lua_type: string;
    description: string;
  };
  source: string;
  transport: string;
}

function convertLuaApiDocToToolDoc(doc: LuaApiDoc): ToolDoc {
  return {
    action: doc.action ?? `${doc.namespace}_${doc.name}`,
    namespace: doc.namespace,
    name: doc.name,
    publicName: doc.public_name,
    localName: doc.local_name ?? undefined,
    source: doc.source as ToolSource,
    transport: doc.transport as ToolTransport,
    description: doc.description,
    params: doc.params.map((p) => ({
      name: p.name,
      type: p.lua_type,
      required: p.required,
      description: p.description,
    })),
    returns: {
      type: doc.returns.lua_type,
      description: doc.returns.description,
    },
    errorCode: "E_TOOL",
    errorCategory: "tool",
  };
}

/**
 * Global merged documentation registry for web-lua.
 * Combines static docs from the Rust api_docs::REGISTRY with
 * any runtime docs from JS-registered tools.
 */
export const mergedDocRegistry = new MergedDocRegistry();

// Register runtime doc provider host handlers.
// These are called by the Rust __runtime_* actions via execute_host_call.
function runtimeDocsHandler() {
  return mergedDocRegistry.list();
}

function runtimeGetDocHandler(params: unknown) {
  const { query } = params as { query: string };
  return mergedDocRegistry.get(query) ?? null;
}

function runtimeSearchDocsHandler(params: unknown) {
  const { query } = params as { query: string };
  return mergedDocRegistry.search(query);
}

registerHostHandler("runtime_docs", runtimeDocsHandler);
registerHostHandler("runtime_get_doc", runtimeGetDocHandler);
registerHostHandler("runtime_search_docs", runtimeSearchDocsHandler);

function syncHostHandlersToWindow(): void {
  const win = window as unknown as Record<string, unknown>;
  win.__hostHandlers = {
    runtime_docs: runtimeDocsHandler,
    runtime_get_doc: runtimeGetDocHandler,
    runtime_search_docs: runtimeSearchDocsHandler,
  };
}

export class WebSession {
  private raw: RawWebSession;

  private constructor(raw: RawWebSession) {
    this.raw = raw;
  }

  static async init(): Promise<[WebSession, Promise<void>]> {
    await wasmInit();
    const session = new WebSession(new RawWebSession());

    // Populate merged doc registry with static docs from Rust
    const docsJson = getApiDocsJson();
    const docs: LuaApiDoc[] = JSON.parse(docsJson);
    mergedDocRegistry.setStaticDocs(docs.map(convertLuaApiDocToToolDoc));

    // Mirror JS-registered host handlers to window.__hostHandlers
    // so Rust WASM execute_host_call can find them.
    syncHostHandlersToWindow();

    // Freeze the registry so no further tools can be registered
    // after initialization.
    if (!isRegistryFrozen()) {
      freezeRegistry();
    }

    return [session, Promise.resolve()];
  }

  async stopWith(runner: Promise<void>): Promise<void> {
    this.raw.stopWith();
    try {
      await runner;
    } catch (e) {
      console.warn("WebSession runner rejected during stop:", e);
    }
  }

  async runCellAsync(code: string, stdin?: string): Promise<CellResult> {
    return this.raw.runCellAsync(code, stdin || "");
  }

  reset(): void {
    this.raw.reset();
  }

  inspectGlobals(): WasmGlobalsSnapshot {
    return this.raw.inspect_globals();
  }

  setFuelLimit(limit: number): void {
    this.raw.set_fuel_limit(limit);
  }

  loadLibrary(source: string): CellResult {
    return this.raw.load_library(source);
  }
}
