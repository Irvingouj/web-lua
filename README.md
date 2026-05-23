# Lua Web Playground

A browser-based Lua playground that executes Lua code via Rust + [mlua](https://crates.io/crates/mlua) compiled to WebAssembly with Emscripten.

## Quick Start (macOS / Linux)

### 1. Install prerequisites

```bash
# Rust (via rustup)
brew install rustup
rustup-init -y
source ~/.cargo/env

# Add the Emscripten target
rustup target add wasm32-unknown-emscripten

# Emscripten SDK
git clone https://github.com/emscripten-core/emsdk.git ~/emsdk
cd ~/emsdk
./emsdk install 3.1.74
./emsdk activate 3.1.74
source ~/emsdk/emsdk_env.sh

# Node.js (already installed via nvm / brew)
node --version  # need >= 18
```

### 2. Build & Run

```bash
cd lua-web-playground

# Install web deps
npm install

# Build Rust → WASM
npm run build:rust

# Start dev server
npm run dev
# → opens http://localhost:3000
```

## Why Emscripten instead of wasm-pack?

`mlua` embeds the C-based Lua interpreter (via `lua-src`). Compiling C to WASM requires a full C toolchain — `wasm-pack` / `wasm32-unknown-unknown` alone cannot link C libraries. Emscripten provides `emcc` (a C/C++ → WASM compiler), a POSIX-compatible C library, `setjmp`/`longjmp` support (required by Lua's error handling), and the JavaScript glue code needed to load WASM in a browser.

## Architecture

```
┌──────────────────────────────────────────────────┐
│  Browser                                         │
│                                                  │
│  ┌──────────┐    postMessage     ┌────────────┐  │
│  │ main.ts  │ ────{code,stdin}──▶│ worker.js  │  │
│  │ (Vite)   │ ◀── {result} ───── │            │  │
│  └──────────┘                    │ emscripten │  │
│                                  │   Module   │  │
│  ┌──────────┐                    │  ┌──────┐  │  │
│  │ DOM UI   │                    │  │ WASM │  │  │
│  │ textarea │                    │  │ mlua │  │  │
│  │ panels   │                    │  └──────┘  │  │
│  └──────────┘                    └────────────┘  │
└──────────────────────────────────────────────────┘
```

## Stdio Mapping

| Lua function   | Behavior                                          |
|----------------|---------------------------------------------------|
| `print(...)`   | Converts args with `tostring`, joins with `\t`, appends to **stdout** panel |
| `input()`      | Returns the full **stdin** textarea content        |
| `read()`       | Returns the next line from stdin. Returns `""` when exhausted |
| `emit(value)`  | Appends a debug representation to stdout           |

## Sandbox

### Enabled globals

- `print`, `input`, `read`, `emit` (custom)
- `tostring`, `tonumber`, `type`, `pairs`, `ipairs`, `next`, `select`
- `error`, `pcall`, `xpcall`, `assert`
- `setmetatable`, `getmetatable`, `rawget`, `rawset`, `rawequal`, `rawlen`
- `table.*`, `string.*`, `math.*`, `coroutine.*`, `utf8.*`

### Disabled globals

| Removed        | Why                                               |
|----------------|---------------------------------------------------|
| `io`           | Filesystem access                                 |
| `os`           | OS access (clock, execute, env, rename, etc.)     |
| `debug`        | Debug library (can inspect internals)             |
| `package`      | Module loading                                    |
| `require`      | Module loading                                    |
| `loadfile`     | Filesystem access                                 |
| `dofile`       | Filesystem access                                 |
| `collectgarbage` | GC control                                     |

### Limitations

- **No execution timeout**: infinite loops (e.g. `while true do end`) will freeze the Web Worker. Use the **Stop** button to terminate and recreate the worker.
- **No instruction limit**: there is no hook-based instruction counter in this prototype.
- **Memory**: the WASM module can grow, but very large allocations may fail in the browser.
- **Not a complete security sandbox**: this is a playground, not a production sandbox. Do not run untrusted code that you haven't reviewed.

## Project Structure

```
├── README.md
├── package.json
├── vite.config.ts
├── tsconfig.json
├── index.html
├── src/
│   ├── main.ts          # UI logic, worker management
│   └── style.css        # Dark-theme styling
├── rust/
│   ├── Cargo.toml       # mlua + serde deps
│   ├── build.sh         # Build Rust → WASM, copy to public/build
│   ├── .cargo/
│   │   └── config.toml  # Emscripten linker flags
│   └── src/
│       ├── lib.rs       # Lua sandbox: state creation, globals, exec
│       └── main.rs      # Emscripten main() entry point
└── public/
    ├── build/
    │   ├── lua_wasm.js    # Emscripten glue code (generated)
    │   └── lua_wasm.wasm  # WASM binary (generated)
    └── worker.js          # Web Worker that loads WASM
```

## JS-facing API

One function is exported from WASM:

```c
char* run_lua(const char* code, const char* stdin_text);
```

Called from JS as:

```javascript
const json = Module.ccall('run_lua', 'string', ['string', 'string'], [code, stdin]);
const result = JSON.parse(json);
```

Returns JSON:

```json
{
  "stdout": ["line1", "line2"],
  "stderr": [],
  "result": "3",
  "error": null
}
```

- `result` is `null` when the Lua chunk returns `nil`.
- `error` is `null` on success; a string on syntax/runtime error.

## Manual Acceptance Tests

| # | Input | Expected |
|---|-------|----------|
| 1 | `print("hello")` | stdout: `hello` |
| 2 | `print(1, 2, 3)` | stdout: `1\t2\t3` |
| 3 | `return 1 + 2` | result: `3` |
| 4 | stdin=`abc\ndef`, code=`print(read())\nprint(read())` | stdout: `abc` then `def` |
| 5 | `print(input())` with stdin | echo full stdin |
| 6 | `print(` | error panel shows syntax error |
| 7 | `error("boom")` | error panel shows runtime error |
| 8 | `print(os)` | stdout: `nil` |
| 9 | `print(require)` | stdout: `nil` |
| 10 | Set `x=42` in one run; `print(x)` in next | stdout: `nil` (fresh state) |

## Troubleshooting

### `emcc not found`

```bash
source ~/emsdk/emsdk_env.sh
```

### `wasm target missing`

```bash
rustup target add wasm32-unknown-emscripten
```

### C++ / Lua build failure

- Ensure Emscripten 3.1.x is activated (not 5.x which has breaking EH changes).
- `EMCC_CFLAGS="-fwasm-exceptions"` must be set during build to avoid `invoke_` function conflicts.

### Browser MIME / CORS issues

- Use `npm run dev` (Vite dev server) to serve files. Opening `index.html` directly from the filesystem will cause CORS errors loading WASM.

### Infinite loop freezes tab

- The **Stop** button terminates and recreates the Web Worker. If the worker is broken, refresh the page.

## Build Configuration Notes

The build requires these specific settings to work correctly with Rust + mlua + Emscripten:

1. **Emscripten 3.1.74** — Rust's `wasm32-unknown-emscripten` target is tested against this version. Emscripten 5.x has breaking exception handling changes.

2. **`EMCC_CFLAGS="-fwasm-exceptions"`** — This tells emcc to use native WASM exception handling when compiling Lua's C code. Without it, Emscripten generates JavaScript `invoke_` wrapper functions that conflict with Rust's wasm-exception-model linking.

3. **`-sSUPPORT_LONGJMP=wasm`** — Lua uses `setjmp`/`longjmp` for error handling. This flag tells Emscripten to use WASM-native longjmp instead of JS-based emulation.

4. **`-sERROR_ON_UNDEFINED_SYMBOLS=0`** — The Rust standard library references `__cxa_find_matching_catch_3` which is a C++ EH symbol not provided by the WASM runtime in this configuration. Since we use `panic=abort` in Rust, this symbol is never actually called at runtime.

5. **Fresh Lua state per run** — A new `mlua::Lua` instance is created for each execution, ensuring no globals leak between runs.
