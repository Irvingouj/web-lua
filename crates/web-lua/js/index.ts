// JS wrapper for @pi-oxide/web-lua
// Provides init() / stop_with() lifecycle API.
// WebSession runs on the main thread and handles all browser side-effects
// directly via web_sys.

import type { CellResult, WasmGlobalsSnapshot } from "./web_lua.js";
import wasmInit, { WebSession as RawWebSession, generateApiDocs } from "./web_lua.js";

export type { CellResult as LuaRunResult, WasmGlobalsSnapshot as LuaGlobalsSnapshot };
export { registerHostHandler, registerHostHandlers } from "./registry.js";
export { generateApiDocs };

export interface LuaApiDoc {
  namespace: string;
  name: string;
  action: string | null;
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
}

/**
 * Generate API documentation as a parsed JSON array.
 * Returns structured docs so callers can filter, search, or
 * transform the registry without manual JSON.parse.
 */
export function generateApiDocsJson(): LuaApiDoc[] {
  return JSON.parse(generateApiDocs("json"));
}

export class WebSession {
  private raw: RawWebSession;

  private constructor(raw: RawWebSession) {
    this.raw = raw;
  }

  static async init(): Promise<[WebSession, Promise<void>]> {
    await wasmInit();
    const session = new WebSession(new RawWebSession());
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
