// ─── Error Types ────────────────────────────────────────────────

export interface LuaCellError {
  kind: "compile" | "runtime" | "strict_mode" | "fuel_exhausted" | "internal";
  message: string;
  line?: number;
}

// ─── Result Type ──────────────────────────────────────────────────

export interface LuaRunResult {
  stdout: string[];
  stderr: string[];
  result?: string;
  error?: LuaCellError;
  execution_count: number;
  status: "done";
}

// ─── Global Variable Inspection ─────────────────────────────────

export interface LuaGlobalVariable {
  name: string;
  type: string;
  value?: string;
  keys?: string[];
}

export interface LuaGlobalsSnapshot {
  variables: LuaGlobalVariable[];
  execution_count: number;
}

// ─── WebSession Interface ───────────────────────────────────────

export interface WebSession {
  runCellAsync(code: string, stdin?: string): Promise<LuaRunResult>;
  reset(): void;
  setFuelLimit(limit: number): void;
  loadLibrary(source: string): LuaRunResult;
  inspectGlobals(): LuaGlobalsSnapshot;
}

// ─── ExtensionSession Interface ───────────────────────────────────

export interface ExtensionSession {
  runCellAsync(code: string, stdin?: string): Promise<LuaRunResult>;
  reset(): void;
  setFuelLimit(limit: number): void;
  loadLibrary(source: string): LuaRunResult;
  inspectGlobals(): LuaGlobalsSnapshot;
}
