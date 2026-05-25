export interface LuaCellError {
  kind: "compile" | "runtime" | "strict_mode" | "fuel_exhausted" | "internal";
  message: string;
  line?: number;
}
export interface LuaRunResult {
  stdout: string[];
  stderr: string[];
  result?: string;
  error?: LuaCellError;
  commands: unknown[];
  fuel_exhausted: boolean;
  execution_count: number;
  status: "done";
}
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
export interface WebSession {
  runCellAsync(code: string, stdin?: string): Promise<LuaRunResult>;
  reset(): void;
  setFuelLimit(limit: number): void;
  loadLibrary(source: string): LuaRunResult;
  inspectGlobals(): LuaGlobalsSnapshot;
}
export interface ExtensionSession {
  runCellAsync(code: string, stdin?: string): Promise<LuaRunResult>;
  reset(): void;
  setFuelLimit(limit: number): void;
  loadLibrary(source: string): LuaRunResult;
  inspectGlobals(): LuaGlobalsSnapshot;
}
//# sourceMappingURL=index.d.ts.map
