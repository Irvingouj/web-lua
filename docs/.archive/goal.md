# Goal: Piccolo-Based Browser Notebook Runtime

We are moving from the mlua/Emscripten playground to a piccolo-based notebook runtime.

## Goal

Fork piccolo into this project root and build a full browser-based Lua-like Jupyter notebook using piccolo as the execution engine.

## Context

- The previous mlua/Emscripten version works, but the build chain is too fragile.
- Evaluation showed piccolo is the correct runtime direction:
  - pure Rust
  - no Emscripten
  - can compile to wasm32-unknown-unknown
  - supports persistent state
  - supports host/native functions
  - has fuel/step-limit execution
  - suitable for a browser notebook runtime
- We do not need full Lua compatibility.
- We need a Jupyter-style notebook UX for Lua-like scripting.

## Important

Do not delete the existing mlua/Emscripten playground. Keep it as `legacy-mlua-playground` or leave it untouched. Create the piccolo version as the new main project.

## Project Root Target Structure

```
/
  vendor/
    piccolo/                  # forked/copied piccolo source
  crates/
    piccolo-notebook-core/     # Rust wrapper around piccolo
    piccolo-notebook-wasm/     # wasm-bindgen exports
  web/
    package.json
    vite.config.ts
    index.html
    src/
      main.ts
      worker.ts
      notebook.ts
      styles.css
  docs/
    runtime-evaluation.md
    architecture.md
  README.md
```

If the current repo structure differs, adapt but keep this separation:

- vendored piccolo source
- our core wrapper
- wasm wrapper
- web UI

## Primary Objective

Build a browser notebook that behaves like a small Jupyter notebook for Lua-like code.

## Required UX

- Multiple code cells
- Add cell
- Delete cell
- Move cell up/down
- Run cell
- Run all cells
- Stop current execution
- Restart kernel
- Clear outputs
- Save notebook to JSON file
- Load notebook from JSON file
- Each cell has:
  - code editor textarea
  - run button
  - output panel
  - error panel
  - execution count like In [1], In [2]
  - status: idle/running/success/error/stopped
- Global kernel status:
  - ready
  - running
  - stopped
  - error

## Notebook Semantics

- One persistent runtime session per notebook.
- Variables/functions declared in one cell must be visible in later cells.
- Restart kernel clears all runtime state but keeps cell source code.
- Run all should restart from the current kernel state unless the user explicitly clicks Restart Kernel.
- Clear outputs should only clear UI outputs, not runtime state.
- Stop should stop the running cell safely.

## Runtime API

Expose a wasm-bindgen API roughly like:

```rust
Session::new()
Session::run_cell(code: &str, stdin: &str) -> JSON string or JsValue
Session::reset()
Session::set_fuel_limit(limit: u32)
```

### Returned JSON

```json
{
  "stdout": ["string"],
  "stderr": ["string"],
  "result": "string | null",
  "error": "string | null",
  "commands": ["Command"],
  "fuel_exhausted": false,
  "execution_count": 1
}
```

### Command Shape (Future Browser-Agent Use)

```json
{
  "action": "string",
  "args": {}
}
```

For now, commands are only collected and displayed. Do not execute browser actions yet.

## Required Lua-like Features to Verify

- number literals
- string literals
- booleans
- nil
- global variables
- local variables
- assignment
- arithmetic
- comparison
- if/else/end
- while/do/end
- function declarations
- function calls
- recursion
- return values
- table literals (if piccolo supports it easily)
- basic table indexing (if piccolo supports it easily)

## Required Host APIs

Expose only these globals:

- `print(...)`
- `input()`
- `read()`
- `emit(value)`

### Behavior

- `print(...)` appends a formatted line to stdout.
- `input()` returns the full stdin string supplied by the UI.
- `read()` returns stdin one line at a time.
- `emit(value)` appends a structured command/debug value to commands or stdout.
- Do **not** expose `os`, `io`, `debug`, `package`, `require`, filesystem, network, DOM, `window`, `document`, `fetch`, `localStorage`, `cookies`, `chrome` APIs.

## Execution Safety

- Use piccolo's fuel/step-limit system.
- Infinite loops must not freeze the browser.
- Run WASM in a Web Worker.
- Stop button should terminate or interrupt the worker/session safely.
- If graceful fuel interruption is possible, prefer that.
- If worker termination is needed, recreate the worker and mark kernel as restarted/stopped.
- Never run untrusted code on the main UI thread.

---

## Milestone 1: Fork and Compile Piccolo

- Place piccolo source under `vendor/piccolo`.
- Apply the known wasm fixes:
  1. `getrandom` js feature if required.
  2. `SmallRng` seed size fix if required on wasm32.
- Build piccolo for native.
- Build piccolo for wasm32-unknown-unknown.
- Document exact commands.

### Acceptance

- `cargo build` passes.
- `cargo test` passes if feasible.
- `cargo build --target wasm32-unknown-unknown` passes.

---

## Milestone 2: Core Session Wrapper

Create `crates/piccolo-notebook-core`.

Implement:

```rust
pub struct NotebookSession { ... }

impl NotebookSession {
    pub fn new() -> Self;
    pub fn run_cell(&mut self, code: &str, stdin: &str) -> RunResult;
    pub fn reset(&mut self);
}
```

### RunResult

- stdout
- stderr
- result
- error
- commands
- fuel_exhausted

### Acceptance Snippets

**Cell 1:**
```lua
x = 10
```

**Cell 2:**
```lua
print(x + 1)
```

Expected: `11`

**Cell:**
```lua
function fact(n)
  if n <= 1 then
    return 1
  end
  return n * fact(n - 1)
end

print(fact(5))
```

Expected: `120`

**Cell:**
```lua
i = 0
while i < 3 do
  print(i)
  i = i + 1
end
```

Expected:
```
0
1
2
```

**Cell:**
```lua
while true do
end
```

Expected: No browser freeze. Return `fuel_exhausted` or controlled execution error.

---

## Milestone 3: Host API

Register host globals:

- `print`
- `input`
- `read`
- `emit`

### Acceptance

- `print("hello")` outputs `hello`.
- `print(1, 2, 3)` outputs all values.
- `input()` returns full stdin.
- `read()` consumes stdin line by line.
- `emit("hello")` appears in commands/output.
- `os`/`io`/`debug`/`package`/`require` are unavailable or nil.

---

## Milestone 4: wasm-bindgen Wrapper

Create `crates/piccolo-notebook-wasm`.

Expose:

- `WasmSession` constructor
- `run_cell(code, stdin)`
- `reset()`
- `set_fuel_limit(limit)`

Use `wasm-bindgen` and `wasm32-unknown-unknown`.

- Do **not** use Emscripten.
- Do **not** use `wasm32-unknown-emscripten`.
- Do **not** use mlua.

### Acceptance

- `wasm-pack` or equivalent build succeeds.
- TypeScript can create a session.
- TypeScript can call `run_cell`.
- JSON result is parsed correctly.

---

## Milestone 5: Web Worker Kernel

Create `web/src/worker.ts`.

Worker responsibilities:

- load WASM
- create Session
- handle messages: `runCell`, `reset`, `stop`, `setFuelLimit`
- return structured results to main thread.

Main thread should never call WASM directly.

### Acceptance

- Run cell works through Worker.
- Stop does not freeze UI.
- Restart kernel creates a fresh session.
- Runtime state persists across cells until reset.

---

## Milestone 6: Notebook UI

Build the browser notebook UI.

### Features

- add/delete/move cells
- run single cell
- run all
- stop
- restart kernel
- clear outputs
- save notebook JSON
- load notebook JSON
- execution count
- per-cell status
- output/error rendering

### Notebook JSON Format

```json
{
  "version": 1,
  "cells": [
    {
      "id": "uuid",
      "kind": "code",
      "source": "print('hello')",
      "outputs": [],
      "execution_count": null
    }
  ],
  "metadata": {
    "runtime": "piccolo",
    "language": "lua-like"
  }
}
```

---

## Milestone 7: Jupyter-like Behavior Tests

Manual/browser acceptance tests:

1. **Cross-cell state:**
   Add three cells:
   - Cell 1: `x = 10`
   - Cell 2: `function double(n) return n * 2 end`
   - Cell 3: `print(double(x))`
   Expected: `20`

2. **Restart isolation:**
   Restart kernel, then run only Cell 3.
   Expected: error because `x`/`double` are gone.

3. **Run all after restart:**
   Run all after restart.
   Expected: `20`.

4. **Infinite loop:**
   `while true do end`
   Expected: controlled stop/fuel error, UI still responsive.

5. **Save/load:**
   Save notebook, refresh page, load notebook.
   Expected: source cells restored.

6. **Clear outputs:**
   Clear outputs.
   Expected: outputs disappear, source code remains.

7. **Cell reorder:**
   Delete/move cells.
   Expected: run order follows visible cell order.

8. **input/read:**
   stdin:
   ```
   abc
   def
   ```
   code:
   ```lua
   print(read())
   print(read())
   ```
   Expected:
   ```
   abc
   def
   ```

---

## Milestone 8: Documentation

Update README with:

- why piccolo
- why not mlua/Emscripten
- build commands
- dev commands
- known limitations
- supported Lua subset
- unsupported Lua features
- safety model
- how fuel limit works
- how Worker isolation works

Add `docs/architecture.md` explaining:

```
Browser UI
  → Web Worker kernel
    → wasm-bindgen wrapper
      → piccolo-notebook-core
        → vendored piccolo runtime
```

---

## Important Implementation Rules

- Do not expose DOM to Lua.
- Do not expose JS eval.
- Do not expose fetch/network/filesystem.
- Do not expose browser extension APIs.
- The runtime may emit commands, but TypeScript must validate commands before any future execution.
- Keep the notebook runtime separate from future browser-agent automation.

## Definition of Done for This Phase

- Browser page runs locally.
- Multiple cells work.
- Persistent state works.
- Recursive functions work.
- print/input/read work.
- Infinite loops do not freeze the UI.
- Reset kernel works.
- Save/load notebook JSON works.
- Build uses `wasm32-unknown-unknown`, not Emscripten.
- README documents verified commands.
- Final report states exactly what was tested and what was not tested.
