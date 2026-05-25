// JS wrapper for @pi-oxide/web-lua
// Provides init() / stop_with() lifecycle API.
// WebSession runs on the main thread and handles all browser side-effects
// directly via web_sys.

import type { CellResult, WasmGlobalsSnapshot } from "./web_lua.js";
import wasmInit, { WebSession as RawWebSession, generateApiDocs } from "./web_lua.js";

export type { CellResult as LuaRunResult, WasmGlobalsSnapshot as LuaGlobalsSnapshot };
export { registerHostHandler, registerHostHandlers } from "./registry";
export { generateApiDocs };

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
    } catch {
      // runner may reject; ignore
    }
  }

  async runCellAsync(code: string, stdin?: string): Promise<CellResult> {
    return this.raw.runCellAsync(code, stdin || "");
  }

  reset(): void {
    this.raw.reset();
  }

  inspectGlobals(): WasmGlobalsSnapshot {
    return this.raw.inspectGlobals();
  }

  setFuelLimit(limit: number): void {
    this.raw.set_fuel_limit(limit);
  }

  loadLibrary(source: string): CellResult {
    return this.raw.load_library(source);
  }
}
