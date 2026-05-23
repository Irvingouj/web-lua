# Architecture

How a Lua script goes from a textarea to executed output and back.

---

## The Big Picture

```
┌─────────────────────────────────────────────────────────────────────┐
│  Browser                                                            │
│                                                                     │
│   ┌─────────────────────────────────┐  ┌────────────────────────┐  │
│   │  Main Thread                    │  │  Web Worker             │  │
│   │                                 │  │                         │  │
│   │  ┌───────────┐  ┌───────────┐  │  │  ┌───────────────────┐  │  │
│   │  │  index.   │  │  main.ts  │  │  │  │  worker.js         │  │  │
│   │  │  html     │  │           │  │  │  │                    │  │  │
│   │  │           │  │  UI logic  │  │  │  │  importScripts()  │  │  │
│   │  │  textarea │◀─┤  events   │  │  │  │       │            │  │  │
│   │  │  buttons  │  │  worker   │──post──▶│  createLuaModule()│  │  │
│   │  │  panels   │◀─┤  mgmt     │──msg───│       │            │  │  │
│   │  └───────────┘  └───────────┘  │  │  │  Module.ccall()   │  │  │
│   │                                 │  │  │       │            │  │  │
│   └─────────────────────────────────┘  │  │       ▼            │  │  │
│                                         │  │  ┌─────────────┐  │  │  │
│                                         │  │  │  lua_wasm   │  │  │  │
│                                         │  │  │  .wasm      │  │  │  │
│                                         │  │  │             │  │  │  │
│                                         │  │  │  mlua/Lua   │  │  │  │
│                                         │  │  │  5.4 VM     │  │  │  │
│                                         │  │  └─────────────┘  │  │  │
│                                         │  └───────────────────┘  │  │
│                                         └────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────┘
```

Three layers:

1. **DOM / UI layer** — `index.html` + `src/main.ts` + `src/style.css`
2. **Worker boundary** — `public/worker.js` (message passing, isolation)
3. **Execution layer** — `rust/src/lib.rs` (Lua VM, sandboxing, JSON result)

---

## Layer 1: The UI (`index.html` + `src/main.ts`)

### What it does

Renders the editor, wires up buttons, manages the worker, displays results.

### File layout

```
src/main.ts          ← All UI logic (worker management, events, rendering)
src/style.css        ← Dark theme, grid layout, panel styling
index.html           ← DOM structure: editor panel + output panel + stdin
```

### DOM structure

```
<body>
  <header>                    ← Title + status indicator ("Ready" / "Running…")
  <div class="main-grid">     ← Two-column layout
    <div class="editor-panel">  ← LEFT
      <select>                    ← Example dropdown (8 presets)
      <textarea id="code">       ← Lua code editor
      <div class="button-bar">   ← Run / Stop / Clear buttons
    <div class="output-panel">   ← RIGHT
      <pre id="stdout">           ← stdout output
      <pre id="result">           ← Return value
      <pre id="errors">           ← Error messages
  <div class="stdin-panel">    ← BOTTOM
    <textarea id="stdin">         ← Simulated stdin content
  <footer>                     ← Warning about infinite loops
```

### Key flows

**Run:**
```
User clicks Run (or Ctrl+Enter)
  → main.ts: runCode()
    → clearOutput()
    → setStatus("Running…")
    → disable Run, enable Stop
    → worker.postMessage({ code, stdin })
```

**Receive result:**
```
Worker posts { type: "result", data: {...} }
  → main.ts: handleWorkerMessage()
    → setOutput(data)     → renders stdout, result, errors
    → setStatus("Done")
    → enable Run, disable Stop
```

**Stop:**
```
User clicks Stop
  → main.ts: stopWorker()
    → worker.terminate()   ← kills the WASM execution instantly
    → createWorker()       ← spawns a fresh worker, re-loads WASM
    → setStatus("Stopped")
```

**Example selection:**
```
User picks from dropdown
  → loadExample(name)
    → codeEl.value = EXAMPLES[name].code
    → stdinEl.value = EXAMPLES[name].stdin
```

### Why main.ts doesn't call WASM directly

If WASM runs on the main thread, an infinite Lua loop (`while true do end`) freezes the entire browser tab. No button clicks register. No rendering happens. The only recovery is closing the tab.

The Web Worker runs WASM on a separate thread. `Worker.terminate()` kills it instantly from the main thread, regardless of what the WASM is doing.

---

## Layer 2: The Worker Boundary (`public/worker.js`)

### What it does

Loads the Emscripten WASM module, receives code+stdin from the main thread, calls `run_lua`, posts the JSON result back.

### Why it's a plain JS file (not TypeScript)

Web Workers loaded by the browser can't use ES modules easily with the `importScripts()` pattern that Emscripten requires. A plain `.js` file in `public/` avoids all bundler complications.

### Initialization

```javascript
importScripts("/build/lua_wasm.js");     // 1. Loads Emscripten glue code
                                          //    Defines createLuaModule globally

Module = await createLuaModule({          // 2. Instantiates WASM
  locateFile: (path) => "/build/" + path  //    Tells it where to find .wasm
});

postMessage({ type: "ready" });           // 3. Tells main thread we're good
```

The `createLuaModule` factory function is the Emscripten MODULARIZE output. It returns a Promise that resolves when the WASM binary is compiled and instantiated.

### Execution

```javascript
self.onmessage = function(e) {
  var resultJson = Module.ccall(
    "run_lua",              // C function name
    "string",               // return type
    ["string", "string"],   // argument types
    [code, stdin]           // argument values
  );
  postMessage({ type: "result", data: JSON.parse(resultJson) });
};
```

`Module.ccall` is Emscripten's JavaScript→C bridge. It:
1. Converts the JS strings to C `char*` pointers in WASM memory
2. Calls the exported `run_lua` function
3. Reads the returned `char*` back as a JS string
4. Frees the temporary allocations

### Message protocol

Main → Worker:
```json
{ "code": "print(\"hello\")", "stdin": "some input" }
```

Worker → Main (ready):
```json
{ "type": "ready" }
```

Worker → Main (result):
```json
{
  "type": "result",
  "data": {
    "stdout": ["hello"],
    "stderr": [],
    "result": null,
    "error": null
  }
}
```

Worker → Main (error):
```json
{ "type": "error", "error": "WASM init failed: ..." }
```

### Isolation guarantee

Each `run_lua` call creates a **fresh Lua state** (see Layer 3). The Worker itself is reused between runs. But if the user clicks Stop, the Worker is terminated and a new one is created, which re-initializes the WASM module from scratch.

---

## Layer 3: The Execution Engine (Rust + mlua)

### File layout

```
rust/src/lib.rs       ← The sandbox: Lua state creation, custom globals, execution
rust/src/main.rs      ← Emscripten main() stub (forces run_lua to be linked)
rust/Cargo.toml       ← Dependencies: mlua, serde, serde_json
rust/.cargo/config.toml ← Emscripten linker flags
rust/build.sh         ← Build pipeline: emcc checks → cargo build → copy artifacts
```

### The call chain

```
Module.ccall("run_lua", ...)
  │
  ▼
run_lua(code_ptr: *const c_char, stdin_ptr: *const c_char) -> *mut c_char
  │  ← C ABI entry point (lib.rs line 221)
  │  ← Converts C strings to Rust Strings
  │
  ▼
run_lua_inner(code: &str, stdin_text: &str) -> RunResult
  │  ← Creates fresh Lua state
  │  ← Sets up custom globals
  │  ← Executes user code
  │  ← Captures stdout + errors
  │
  ├──▶ Lua::new_with(TABLE | STRING | MATH | COROUTINE | UTF8)
  │      Creates VM with only safe standard libraries
  │
  ├──▶ lua.create_function(...) for print, input, read, emit
  │      Registers custom sandboxed globals
  │
  ├──▶ globals.set("io", Nil), globals.set("os", Nil), ...
  │      Belt-and-suspenders removal of dangerous globals
  │
  ├──▶ lua.load(code).eval::<Value>()
  │      Executes the user's Lua code
  │
  └──▶ Returns RunResult { stdout, stderr, result, error }
         Serialized to JSON via serde_json
```

### The RunState

A shared mutable struct wrapped in `Arc<Mutex<...>>` that collects output during execution:

```rust
struct RunState {
    stdout: Vec<String>,        // Lines captured by print()
    stderr: Vec<String>,        // Reserved for future use
    stdin_full: String,         // The complete stdin textarea content
    stdin_lines: Vec<String>,   // stdin split into lines (for read())
    stdin_index: usize,         // Current position for read()
}
```

`Arc<Mutex<RunState>>` is shared between the main execution function and the Lua callback closures. Every time `print()` is called from Lua, it locks the mutex and pushes to `stdout`.

### The custom globals

#### `print(...)`

```lua
print(1, "hello", true)
-- stdout: "1\thello\ttrue"
```

```rust
lua.create_function(move |_lua, args: MultiValue| {
    let parts: Vec<String> = args.into_iter()
        .map(|v| value_to_string(&v))
        .collect();
    let line = parts.join("\t");      // Tab-separated, matching Lua convention
    state.lock().unwrap().stdout.push(line);
    Ok(())
})
```

#### `input()`

```lua
local all = input()   -- Returns the ENTIRE stdin textarea
```

```rust
lua.create_function(move |_lua, ()| {
    Ok(state.lock().unwrap().stdin_full.clone())
})
```

#### `read()`

```lua
local line1 = read()   -- Returns first line of stdin
local line2 = read()   -- Returns second line
local line3 = read()   -- Returns "" when stdin is exhausted
```

```rust
lua.create_function(move |_lua, ()| {
    let mut guard = state.lock().unwrap();
    if guard.stdin_index < guard.stdin_lines.len() {
        let line = guard.stdin_lines[guard.stdin_index].clone();
        guard.stdin_index += 1;
        Ok(line)
    } else {
        Ok(String::new())    // Empty string when exhausted
    }
})
```

Design choice: returns `""` (empty string) when exhausted, not `nil`. This means Lua code can always do `local s = read()` and get a string without needing nil checks. The tradeoff is you can't distinguish between "no more input" and "an empty line in stdin."

#### `emit(value)`

```lua
emit(42)              -- stdout: "42"
emit({1, 2, 3})       -- stdout: "table: {1, 2, 3}"
```

A debug helper that appends a string representation of any Lua value to stdout.

### Value serialization

`value_to_string()` converts Lua values to human-readable strings:

| Lua value | Rust type | String output |
|-----------|-----------|---------------|
| `nil` | `Value::Nil` | `"nil"` |
| `true` | `Value::Boolean(true)` | `"true"` |
| `42` | `Value::Integer(42)` | `"42"` |
| `3.14` | `Value::Number(3.14)` | `"3.14"` |
| `3.0` | `Value::Number(3.0)` | `"3.0"` (always shows decimal for floats) |
| `"hello"` | `Value::String(...)` | `"hello"` |
| `{1, 2}` | `Value::Table(...)` | `"table: {1, 2}"` |
| `function` | `Value::Function(...)` | `"function"` |

For the `result` field in JSON, `nil` maps to `null`:

```rust
match &val {
    Value::Nil => None,        // → JSON null
    other => Some(value_to_string(other)),
}
```

### The sandbox

**Allowed** (loaded via StdLib flags):
```rust
Lua::new_with(
    StdLib::TABLE | StdLib::STRING | StdLib::MATH | StdLib::COROUTINE | StdLib::UTF8,
    ...
)
```

This gives the user: `table.*`, `string.*`, `math.*`, `coroutine.*`, `utf8.*`, plus the base library globals (`tostring`, `tonumber`, `type`, `pairs`, `ipairs`, `pcall`, `error`, `assert`, `setmetatable`, `getmetatable`, etc.)

**Blocked** (set to nil after creation):
```rust
for name in &["io", "os", "debug", "package", "require",
              "loadfile", "dofile", "collectgarbage"] {
    let _ = globals.set(*name, Value::Nil);
}
```

Double-layered: these libraries are never loaded (not in StdLib flags), AND their global names are set to nil. This means:

```lua
print(os)           -- nil (was never loaded)
print(require)      -- nil (package lib not loaded, name also niled)
require("evil")     -- error: attempt to call a nil value
```

### Fresh state guarantee

Every `run_lua` call creates a brand new `Lua` instance:

```rust
fn run_lua_inner(code: &str, stdin_text: &str) -> RunResult {
    let state = Arc::new(Mutex::new(RunState::new(stdin_text)));
    let lua = Lua::new_with(...);    // ← NEW state every time
    // ... set up globals, execute, return
    // lua is dropped here, all memory freed
}
```

No Lua globals survive between runs. `run 1: x = 42` → `run 2: print(x)` → prints `nil`.

---

## Layer 0: The Build Pipeline

### How Rust + C becomes browser-runnable WASM

```
┌─────────────────────────────────────────────────────────────┐
│  build.sh                                                    │
│                                                              │
│  1. Check emcc exists                                        │
│  2. Check wasm32-unknown-emscripten target installed         │
│  3. Set environment variables                                │
│     EMCC_CFLAGS="-fwasm-exceptions"                          │
│     CFLAGS_wasm32_unknown_emscripten="-fwasm-exceptions ..." │
│  4. cargo build --target wasm32-unknown-emscripten           │
│     ┌──────────────────────────────────────────────┐         │
│     │  Rust compiler (rustc)                        │         │
│     │    lib.rs  → lua_wasm.lib.rlib                │         │
│     │    main.rs → lua_wasm.bin                     │         │
│     │                                               │         │
│     │  cc crate (compiles Lua C via emcc)            │         │
│     │    lua-src/*.c → liblua.a                      │         │
│     │                                               │         │
│     │  Emscripten linker (emcc)                      │         │
│     │    .rlib + .a → lua_wasm.js + lua_wasm.wasm    │         │
│     └──────────────────────────────────────────────┘         │
│  5. Copy lua_wasm.js + lua_wasm.wasm to public/build/        │
└─────────────────────────────────────────────────────────────┘
```

### The compilation chain in detail

**Step A: Lua C compilation** (by the `cc` crate, triggered by mlua-sys build.rs)

```
emcc -c -O2 -fwasm-exceptions -fPIC \
     lapi.c lauxlib.c lbaselib.c lcorolib.c ldblib.c \
     ldo.c ldump.c lfunc.c lgc.c llex.c lmem.c lobject.c \
     lopcodes.c lparser.c lstate.c lstring.c ltable.c \
     ltablib.c ltm.c lundump.c lutf8lib.c lvm.c lzio.c
       ↓
  liblua.a   (static archive of WASM object files)
```

The `-fwasm-exceptions` flag is critical here (see `docs/lessons-learned.md` Lesson 3). Without it, emcc generates JavaScript `invoke_N` wrappers for Lua's setjmp/longjmp, which are incompatible with Rust's wasm-exception-model linking.

**Step B: Rust compilation** (by rustc)

```
rustc --target wasm32-unknown-emscripten --crate-type lib
      src/lib.rs
       ↓
  liblua_wasm.rlib    (Rust library, includes serde/mlua glue)

rustc --target wasm32-unknown-emscripten --crate-type bin
      src/main.rs --extern lua_wasm=liblua_wasm.rlib
       ↓
  lua_wasm.bin.o      (Rust binary object, references run_lua)
```

Rust uses `-C panic=abort` (set in `.cargo/config.toml`), which eliminates unwinding infrastructure.

**Step C: Emscripten linking** (by emcc, invoked as the linker by cargo)

```
emcc lua_wasm.bin.o liblua_wasm.rlib liblua.a [Rust stdlib .rlib files]
     -sMODULARIZE=1
     -sEXPORT_NAME=createLuaModule
     -sEXPORTED_FUNCTIONS=['_run_lua','_free']
     -sEXPORTED_RUNTIME_METHODS=['ccall','UTF8ToString',...]
     -sALLOW_MEMORY_GROWTH=1
     -sENVIRONMENT=web,worker
     -sSUPPORT_LONGJMP=wasm
     -sERROR_ON_UNDEFINED_SYMBOLS=0
     -O2
       ↓
  lua_wasm.js    (67 KB — JavaScript glue code)
  lua_wasm.wasm  (464 KB — WASM binary)
```

### What each linker flag does

| Flag | Purpose |
|------|---------|
| `MODULARIZE=1` | Wraps output in a factory function instead of auto-initializing |
| `EXPORT_NAME=createLuaModule` | Name of the factory function |
| `EXPORTED_FUNCTIONS` | C functions to export from WASM (our `run_lua` + `free`) |
| `EXPORTED_RUNTIME_METHODS` | JS helper functions to expose (`ccall` for calling C from JS) |
| `ALLOW_MEMORY_GROWTH=1` | WASM can allocate more memory as needed (Lua's allocator needs this) |
| `ENVIRONMENT=web,worker` | Only generate code for browser + worker contexts (no Node.js) |
| `SUPPORT_LONGJMP=wasm` | Use WASM-native longjmp for Lua's error handling |
| `ERROR_ON_UNDEFINED_SYMBOLS=0` | Suppress `__cxa_find_matching_catch_3` error (never called at runtime) |

### Output artifacts

```
lua_wasm.js    ← 67 KB
  - Defines createLuaModule() factory function
  - Contains JavaScript glue: memory management, string conversion,
    WASM loading, ccall/cwrap bridge
  - Implements Emscripten filesystem (MEMFS) and process emulation
  - Provides the locateFile() hook for finding the .wasm binary

lua_wasm.wasm  ← 464 KB
  - The actual compiled code: Rust logic + Lua VM + standard library
  - Exports: run_lua, free, _emscripten_stack_alloc, etc.
  - WASM linear memory for Lua's allocator
```

---

## Memory lifecycle

### Per-execution

```
run_lua called
  → allocate Rust Strings for code + stdin
  → create Arc<Mutex<RunState>>
  → create Lua::new_with()           ← allocates Lua VM heap (~100KB)
  → register closures (print, input, read, emit)
  → lua.load(code).eval()            ← Lua executes, allocates on its internal heap
  → serialize RunResult to JSON string
  → CString::into_raw(json)          ← LEAK: the JSON string pointer
  → Lua state dropped                ← all Lua heap memory freed
  → RunState dropped                 ← stdout/stderr vectors freed
  → Arc<Mutex> dropped               ← shared state freed
  → return raw pointer to JS

  On JS side:
    ccall reads the string from WASM memory
    JSON.parse creates JS objects
    the leaked CString is never freed (acceptable for a playground)
```

### Per-worker-lifecycle

```
Worker created
  → importScripts("lua_wasm.js")     ← downloads 67KB glue code
  → createLuaModule()                ← fetches + compiles 464KB WASM
  → WASM linear memory initialized (~16MB initial heap)
  → Module ready

  [multiple run_lua calls happen here, each creates + destroys a Lua state]

Worker terminated (Stop button)
  → Worker.terminate()               ← WASM memory freed, thread killed
  → createWorker()                   ← new Worker, re-downloads everything
```

---

## Security model (or lack thereof)

### What's sandboxed

✅ No filesystem access (`io` library not loaded)
✅ No OS access (`os` library not loaded)
✅ No module loading (`package`/`require` not loaded)
✅ No debug introspection (`debug` library not loaded)
✅ No network access (nothing exposed)
✅ No DOM access (nothing exposed)
✅ No JavaScript eval bridge (nothing exposed)
✅ Fresh Lua state per run (no cross-execution state)
✅ Worker isolation (main thread never blocks)

### What's NOT sandboxed

⚠ **No instruction limit** — infinite loops hang the Worker until terminated
⚠ **No memory limit** — a script that allocates huge tables will consume WASM memory until it OOMs
⚠ **No CPU time limit** — no hook-based execution timeout
⚠ **Memory leak in JSON return** — each `run_lua` leaks one CString
⚠ **No content security policy** — WASM is same-origin by default but no CSP headers set

### Threat model

This playground is designed for **educational use by the person running it locally**. It is NOT designed to safely execute arbitrary code from untrusted third parties. The Worker-based isolation prevents UI freezes, but a determined attacker with Lua access could:

1. Consume all WASM memory (`local t = {}; while true do t[#t+1] = string.rep("x", 1000000) end`)
2. Burn CPU indefinitely (`while true do end`)
3. Possibly exploit bugs in mlua or Lua's C implementation (unlikely but theoretically possible)

---

## Data flow: A complete trace

User types `print("hello")` in the editor and clicks Run.

```
1.  main.ts: runCode() fires
2.  main.ts → worker.postMessage({ code: 'print("hello")', stdin: '' })
3.  worker.js: self.onmessage receives the message
4.  worker.js → Module.ccall("run_lua", "string", ["string","string"],
                              ['print("hello")', ''])
5.  Emscripten glue: converts JS strings → C char* in WASM memory
6.  WASM: run_lua(code_ptr=0x10000, stdin_ptr=0x10100) called
7.  Rust: CStr::from_ptr converts C strings → Rust Strings
8.  Rust: run_lua_inner(code='print("hello")', stdin_text='')
9.  Rust: Arc<Mutex<RunState>> created (stdout=[], stdin_lines=[], index=0)
10. Rust: Lua::new_with(TABLE|STRING|MATH|COROUTINE|UTF8) → fresh VM
11. Rust: lua.create_function(closure capturing Arc<Mutex<RunState>>)
12. Rust: globals.set("print", print_closure)
13. Rust: globals.set("input", input_closure)
14. Rust: globals.set("read", read_closure)
15. Rust: globals.set("emit", emit_closure)
16. Rust: globals.set("io", Nil) — and 7 other dangerous globals
17. Rust: lua.load('print("hello")').eval::<Value>()
18. Lua VM: compiles chunk → bytecode
19. Lua VM: executes: calls global "print" with arg "hello"
20. Rust: print_closure fires
    → value_to_string("hello") → "hello"
    → state.lock().unwrap().stdout.push("hello")
21. Lua VM: chunk returns nil (no return statement)
22. Rust: exec_result = Ok(Value::Nil)
23. Rust: result_str = None (nil → null in JSON)
24. Rust: RunResult { stdout: ["hello"], stderr: [], result: null, error: null }
25. Rust: serde_json::to_string → '{"stdout":["hello"],"stderr":[],"result":null,"error":null}'
26. Rust: CString::into_raw(json) → raw pointer returned
27. Emscripten glue: reads C string from WASM memory → JS string
28. worker.js: JSON.parse(resultJson) → { stdout: ["hello"], result: null, error: null }
29. worker.js → postMessage({ type: "result", data: { stdout: ["hello"], ... } })
30. main.ts: handleWorkerMessage receives the message
31. main.ts: setOutput(data)
    → stdoutEl.textContent = "hello"
    → resultEl.textContent = ""
    → errorsEl.textContent = ""
32. main.ts: setStatus("Done")
33. Browser renders: "hello" appears in the stdout panel
```

Total time for this execution: ~1ms (WASM call) + postMessage overhead.
