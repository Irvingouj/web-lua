# 🧡 Piccolo Notebook

A browser-based Jupyter-style notebook for Lua-like scripting, powered by [piccolo](https://github.com/kyren/piccolo) — a pure Rust Lua VM compiled to WebAssembly.

## Why Piccolo

- **Pure Rust** — no C dependencies, no Emscripten, no fragile cross-compilation
- **Stackless VM** — built-in fuel/step-limit system for safe execution of untrusted code
- **wasm32-unknown-unknown** — standard Rust WASM target, no emscripten toolchain needed
- **GC-safe** — cycle-detecting incremental garbage collector
- **Persistent state** — one session per notebook, variables survive across cells

## Why Not mlua/Emscripten

The previous version used mlua (Lua C bindings) compiled via Emscripten. It worked but:
- Emscripten version pinning was fragile (only 3.1.74 worked)
- Build required C++ exception handling flags, panic=abort workarounds
- Homebrew vs rustup cargo conflicts were constant
- No built-in fuel system — infinite loops required worker termination
- ~500KB WASM + ~70KB JS glue with Emscripten overhead

The piccolo version:
- Standard `cargo build --target wasm32-unknown-unknown`
- Built-in fuel system for graceful infinite loop handling
- ~890KB WASM + ~13KB JS (will shrink with wasm-opt)
- 16 passing tests covering arithmetic, recursion, tables, persistence, fuel limits

## Build Commands

### Prerequisites

```bash
# Install Rust via rustup (not Homebrew)
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh

# Add WASM target
rustup target add wasm32-unknown-unknown

# Install wasm-bindgen CLI
cargo install wasm-bindgen-cli
```

### Build WASM

```bash
./build-wasm.sh
```

### Dev Server

```bash
cd web
npm install
npm run dev
```

### Run Rust Tests

```bash
# Use rustup's cargo, not Homebrew's
export PATH="$(rustup which cargo | xargs dirname):$PATH"
cargo test -p piccolo-notebook-core
```

## Dev Commands Quick Reference

| Command | Description |
|---------|-------------|
| `./build-wasm.sh` | Build WASM + JS bindings |
| `cd web && npm run dev` | Start dev server |
| `cargo test -p piccolo-notebook-core` | Run core tests |

## Supported Lua Subset

### ✅ Working
- Number, string, boolean, nil literals
- Global and local variables
- Assignment
- Arithmetic (`+`, `-`, `*`, `/`, `%`, `^`)
- Comparison (`<`, `>`, `<=`, `>=`, `==`, `~=`)
- `if/elseif/else/end`
- `while/do/end`
- `for i = start, finish, step do/end`
- `for k, v in pairs(t) do/end` (if table library loaded)
- Function declarations (`function name() end`, `local function name() end`)
- Function calls with multiple arguments and returns
- Recursion
- Table literals (`{a = 1, b = 2}`)
- Table indexing (`t.a`, `t["a"]`, `t[1]`)
- String concatenation (`..`)
- `print(...)`, `input()`, `read()`, `emit(value)`

### ⚠️ Partial / Not Tested
- `repeat/until`
- Generic `for` with custom iterators
- Metatables and metamethods
- Coroutines (loaded but not tested in notebook context)
- String library functions
- Math library functions

### ❌ Not Available
- `io` library (disabled)
- `os` library (disabled)
- `debug` library (disabled)
- `package`/`require` (disabled)
- `dofile`/`loadfile` (disabled)
- Filesystem access
- Network access
- DOM/browser APIs

## Safety Model

### Fuel System
Piccolo uses a fuel-based execution model. Each VM instruction consumes fuel, and execution stops when fuel runs out. This prevents infinite loops from freezing the browser.

Default fuel limit: 8192 (adjustable via `set_fuel_limit`).

### Worker Isolation
All Lua code runs in a Web Worker, never on the main UI thread. The Stop button terminates the worker and creates a fresh one.

### Sandbox
Dangerous globals are set to nil: `io`, `os`, `debug`, `package`, `require`, `dofile`, `loadfile`.

Host APIs (`print`, `input`, `read`, `emit`) are the only bridge between Lua and the browser. They only produce output — they cannot access the DOM, network, or filesystem.

### No eval, No DOM, No Network
- Lua code cannot execute JavaScript
- Lua code cannot access `window`, `document`, `fetch`, `localStorage`
- The `emit` function produces commands that are displayed but never executed
- Future browser-agent features must validate commands in TypeScript before execution

## Notebook JSON Format

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

## Architecture

```
Browser UI (TypeScript + HTML)
  → Web Worker kernel
    → wasm-bindgen wrapper (WasmSession)
      → piccolo-notebook-core (NotebookSession)
        → vendored piccolo runtime (Lua VM)
```

See `docs/architecture.md` for full details.

## Project Structure

```
/
  vendor/piccolo/           # Vendored piccolo Lua VM source
  crates/
    piccolo-notebook-core/  # Rust wrapper: session, host APIs, fuel
    piccolo-notebook-wasm/  # wasm-bindgen exports
  web/
    src/                    # UI, worker, styles
    pkg/                    # Generated WASM + JS bindings
    index.html              # Entry point
  docs/                     # Documentation
  build-wasm.sh             # WASM build script
```

## License

The piccolo notebook code is MIT licensed. The vendored piccolo runtime is MIT/CC0 licensed (see `vendor/piccolo/LICENSE-MIT` and `vendor/piccolo/LICENSE-CC0`).
