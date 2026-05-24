/* tslint:disable */
/* eslint-disable */

/**
 * WasmSession wraps NotebookSession for use from JavaScript/TypeScript.
 */
export class WasmSession {
    free(): void;
    [Symbol.dispose](): void;
    /**
     * Load a Lua library by executing its source code.
     * Any globals defined become available to subsequent cells.
     * Returns a JSON string with the result.
     */
    load_library(source: string): string;
    /**
     * Create a new notebook session.
     */
    constructor();
    /**
     * Reset the session, clearing all Lua state.
     */
    reset(): void;
    /**
     * Resume a yielded cell with an async response.
     * Returns a JSON string with the result.
     */
    resume_cell(result_json: string): string;
    /**
     * Run a cell of code with optional stdin.
     * Returns a JSON string with the result.
     */
    run_cell(code: string, stdin: string): string;
    /**
     * Set the fuel limit for execution.
     */
    set_fuel_limit(limit: number): void;
}

export type InitInput = RequestInfo | URL | Response | BufferSource | WebAssembly.Module;

export interface InitOutput {
    readonly memory: WebAssembly.Memory;
    readonly __wbg_wasmsession_free: (a: number, b: number) => void;
    readonly wasmsession_load_library: (a: number, b: number, c: number) => [number, number];
    readonly wasmsession_new: () => number;
    readonly wasmsession_reset: (a: number) => void;
    readonly wasmsession_resume_cell: (a: number, b: number, c: number) => [number, number];
    readonly wasmsession_run_cell: (a: number, b: number, c: number, d: number, e: number) => [number, number];
    readonly wasmsession_set_fuel_limit: (a: number, b: number) => void;
    readonly __wbindgen_exn_store: (a: number) => void;
    readonly __externref_table_alloc: () => number;
    readonly __wbindgen_externrefs: WebAssembly.Table;
    readonly __wbindgen_malloc: (a: number, b: number) => number;
    readonly __wbindgen_realloc: (a: number, b: number, c: number, d: number) => number;
    readonly __wbindgen_free: (a: number, b: number, c: number) => void;
    readonly __wbindgen_start: () => void;
}

export type SyncInitInput = BufferSource | WebAssembly.Module;

/**
 * Instantiates the given `module`, which can either be bytes or
 * a precompiled `WebAssembly.Module`.
 *
 * @param {{ module: SyncInitInput }} module - Passing `SyncInitInput` directly is deprecated.
 *
 * @returns {InitOutput}
 */
export function initSync(module: { module: SyncInitInput } | SyncInitInput): InitOutput;

/**
 * If `module_or_path` is {RequestInfo} or {URL}, makes a request and
 * for everything else, calls `WebAssembly.instantiate` directly.
 *
 * @param {{ module_or_path: InitInput | Promise<InitInput> }} module_or_path - Passing `InitInput` directly is deprecated.
 *
 * @returns {Promise<InitOutput>}
 */
export default function __wbg_init (module_or_path?: { module_or_path: InitInput | Promise<InitInput> } | InitInput | Promise<InitInput>): Promise<InitOutput>;
