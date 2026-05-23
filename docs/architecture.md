# Piccolo Notebook Architecture

## Layer Diagram

```
┌──────────────────────────────────────────────────┐
│  Browser UI (TypeScript / HTML / CSS)            │
│  main.ts, notebook.ts, styles.css                │
│  - Cell management (add/delete/move/run)         │
│  - Save/load notebook JSON                       │
│  - Kernel status display                         │
└──────────────────┬───────────────────────────────┘
                   │ postMessage
                   ▼
┌──────────────────────────────────────────────────┐
│  Web Worker (worker.ts)                          │
│  - Loads WASM module                             │
│  - Holds WasmSession instance                    │
│  - Handles runCell, reset, stop, setFuelLimit    │
│  - Returns structured JSON results               │
└──────────────────┬───────────────────────────────┘
                   │ wasm-bindgen calls
                   ▼
┌──────────────────────────────────────────────────┐
│  wasm-bindgen Wrapper (piccolo-notebook-wasm)    │
│  - WasmSession constructor                       │
│  - run_cell(code, stdin) → JSON string           │
│  - reset()                                       │
│  - set_fuel_limit(limit)                         │
└──────────────────┬───────────────────────────────┘
                   │
                   ▼
┌──────────────────────────────────────────────────┐
│  Core Session (piccolo-notebook-core)            │
│  - NotebookSession: persistent Lua state         │
│  - Host globals: print, input, read, emit        │
│  - Fuel-limited execution loop                   │
│  - Rc<RefCell<HostState>> shared state           │
│  - RunResult: stdout, stderr, result, error,     │
│    commands, fuel_exhausted, execution_count      │
└──────────────────┬───────────────────────────────┘
                   │
                   ▼
┌──────────────────────────────────────────────────┐
│  Vendored Piccolo Runtime (vendor/piccolo)        │
│  - Stackless Lua VM                              │
│  - gc-arena garbage collector                    │
│  - Fuel system (step-limit execution)            │
│  - Callback system (Rust → Lua bridge)           │
│  - Lua compiler + bytecode VM                    │
│  - Partial stdlib (base, coroutine, math, etc.)  │
└──────────────────────────────────────────────────┘
```

## Data Flow: Running a Cell

1. User clicks "Run" or presses Ctrl+Enter in a cell
2. `main.ts` saves textarea content to `cell.source`
3. `main.ts` posts `{type: 'runCell', id, code, stdin}` to worker
4. `worker.ts` calls `session.run_cell(code, stdin)`
5. wasm-bindgen passes call to `NotebookSession::run_cell`
6. Core session:
   a. Resets `HostState` for this run
   b. Increments `execution_count`
   c. Compiles code via `Closure::load_with_env`
   d. Creates `Executor::start(closure, ())`
   e. Runs fuel-limited loop: `Executor::step(ctx, &mut fuel)`
   f. When done, takes result via `Executor::take_result`
   g. Returns `RunResult` struct
7. wasm-bindgen serializes `RunResult` to JSON string
8. Worker parses JSON and posts `{type: 'result', id, data}` back
9. `main.ts` updates cell outputs/errors/status
10. If running "Run All", processes next cell in queue

## Async API Architecture

See [async-api-design.md](./async-api-design.md) for the full design.

Summary: User code runs as a coroutine. Async API calls yield the coroutine, the worker executes the async work (e.g., fetch), then resumes the coroutine with the result. This gives Lua users synchronous-looking code backed by async execution.

```
Lua: web.fetch(url) → yield coroutine → Worker: await fetch() → resume coroutine → Lua continues
```

Error handling flows through three layers: JS (catch + classify) → Rust (inject Lua error) → Lua (pcall to handle).

## Memory Safety

### GC Arena
All Lua values live inside piccolo's `gc_arena::Arena`. The arena is accessed through `Lua::enter()` which provides a branded lifetime `'gc`. No GC pointer can escape the arena.

### Host State
`HostState` is shared between Lua callbacks and the session via `Rc<RefCell<HostState>>`. This is safe because:
- Lua runs single-threaded inside the worker
- `RefCell` provides runtime borrow checking
- The cell is only borrowed briefly during callback execution

### Fuel System
Each `Executor::step` call takes a `Fuel` parameter. Fuel is consumed by:
- VM instructions: ~1 fuel each (in batches of 64)
- Callbacks: 8 fuel
- Sequence steps: 4 fuel

When fuel is exhausted, `step` returns `false` (not done), and the execution loop breaks with `fuel_exhausted = true`.

## Worker Lifecycle

```
Main Thread                    Worker
───────────                    ──────
createWorker()          →      
                        ←      initWasm()
                        ←      postMessage({type: 'ready'})
runCell(...)            →      
                        ←      run_cell() → JSON
                        ←      postMessage({type: 'result'})
stopExecution()         →      terminate()
createWorker()          →      (fresh worker)
```

Stop = terminate + recreate. There is no graceful interrupt mechanism in the current implementation. Fuel exhaustion handles infinite loops gracefully; the Stop button is for user-initiated cancellation.

## Notebook JSON Persistence

The notebook is a plain JSON object with:
- `version: 1` — format version for future compatibility
- `cells[]` — ordered array of cell objects
- Each cell has: `id`, `kind`, `source`, `outputs`, `execution_count`
- `metadata` — runtime info

Save creates a downloadable `.json` file. Load reads it back. Runtime state is NOT saved — only source code and output history.
