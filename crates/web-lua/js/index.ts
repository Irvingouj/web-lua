// JS wrapper for @pi-oxide/web-lua
// Provides init() / stop_with() lifecycle API.
// WebSession runs on the main thread and handles all browser side-effects
// directly via web_sys.

import type { LuaGlobalsSnapshot, LuaRunResult } from "@pi-oxide/lua-types";
import wasmInit, { WebSession as RawWebSession } from "./web_lua.js";

export type { LuaGlobalsSnapshot, LuaRunResult } from "@pi-oxide/lua-types";
export { registerHostHandler, registerHostHandlers } from "./registry";

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

  async runCellAsync(code: string, stdin?: string): Promise<LuaRunResult> {
    return this.raw.runCellAsync(code, stdin || "") as Promise<LuaRunResult>;
  }

  reset(): void {
    this.raw.reset();
  }

  inspectGlobals(): LuaGlobalsSnapshot {
    return this.raw.inspectGlobals() as LuaGlobalsSnapshot;
  }

  setFuelLimit(limit: number): void {
    this.raw.set_fuel_limit(limit);
  }

  loadLibrary(source: string): LuaRunResult {
    return this.raw.load_library(source) as LuaRunResult;
  }
}
