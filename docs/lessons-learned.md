# Lessons Learned: Building a Rust + mlua → WASM Playground

A no-bullshit account of everything that broke, why it broke, and what actually works. If you're trying to compile Rust + a C library to WASM via Emscripten, read this first.

---

## The Stack

| Component | Version / Choice |
|-----------|-----------------|
| Rust toolchain | stable via rustup (1.95.0) |
| Emscripten | **3.1.74** (NOT latest) |
| Lua binding | mlua 0.10 with `lua54` + `vendored` |
| Crate type | `bin` (NOT `cdylib`) |
| Panic strategy | `abort` |
| Web bundler | Vite 6 + TypeScript |
| Execution model | Web Worker |

---

## Lesson 1: Emscripten 5.x Is Incompatible with Rust's emscripten Target

### What happened

The first `emsdk install latest` gave us **Emscripten 5.0.7**. It broke in three different ways:

1. `DISABLE_EXCEPTION_CATCHING=0` → `"not compatible with -fwasm-exceptions"`
2. `EXCEPTION_HANDLING` → `"Attempt to set a non-existent setting"`
3. The `invoke_` function assertion fires unconditionally

Emscripten 5.x completely reworked exception handling. Rust's `wasm32-unknown-emscripten` target was built and tested against the **3.x line**. The 5.x line changed the contract.

### The fix

```bash
cd ~/emsdk
./emsdk install 3.1.74
./emsdk activate 3.1.74
source ~/emsdk/emsdk_env.sh
```

Pin your Emscripten version. Do not use "latest." Rust CI tests against a specific version and you should too.

### How to detect this

If you see any of these errors with emsdk 4.x or 5.x:
- `DISABLE_EXCEPTION_CATCHING=0 is not compatible with -fwasm-exceptions`
- `Attempt to set a non-existent setting: 'EXCEPTION_HANDLING'`
- `invoke_ functions exported but exceptions and longjmp are both disabled`

...downgrade Emscripten to 3.1.x.

---

## Lesson 2: `cdylib` Requires PIC — Lua's C Code Doesn't Have It

### What happened

The spec said to expose a C ABI function (`run_lua`), so `crate-type = ["cdylib"]` seemed natural. But the build failed with pages of:

```
wasm-ld: error: relocation R_WASM_MEMORY_ADDR_SLEB cannot be used against symbol `.L.str`;
recompile with -fPIC
```

### Why it broke

When Rust compiles a `cdylib` for Emscripten, Emscripten uses **SIDE_MODULE** mode. This requires all object files — including the Lua C code compiled by the `cc` crate — to be compiled with `-fPIC` (Position Independent Code). The `cc` crate compiles Lua's C files into a static archive without `-fPIC` by default, and `wasm-ld` rejects every relocation.

We tried `CFLAGS_wasm32_unknown_emscripten="-fPIC"` but the `cc` crate's PIC flag didn't propagate correctly into the vendored Lua build pipeline.

### The fix

Switch from `cdylib` to a **`bin` crate**. Emscripten's executable mode (`MAIN_MODULE`) does NOT require PIC. The output is the same `.js` + `.wasm` pair that you'd get from a cdylib.

```toml
# Cargo.toml
[lib]
crate-type = ["lib"]

[[bin]]
name = "lua_wasm"
path = "src/main.rs"
```

The `main.rs` is a stub:

```rust
fn main() {
    let _ = lua_wasm::run_lua as extern "C" fn(*const i8, *const i8) -> *mut i8;
}
```

The `let _ = ...` line forces the linker to include `run_lua` from `lib.rs` (see Lesson 6).

### When to use which

| Crate type | Emscripten mode | PIC required | Works with vendored C? |
|------------|----------------|--------------|----------------------|
| `cdylib` | SIDE_MODULE | Yes | Not easily |
| `bin` | MAIN_MODULE | No | **Yes** |
| `staticlib` | N/A (you link manually) | Up to you | Possible but more work |

---

## Lesson 3: The `invoke_` Function Trap (The Hardest Bug)

### What happened

After fixing the cdylib issue, the build failed with:

```
AssertionError: invoke_ functions exported but exceptions and longjmp are both disabled
```

This error comes from Emscripten's Python linker (`emscripten.py`, `create_module`). It means: "your compiled code contains `invoke_N` wrapper functions, but I'm not generating the JavaScript runtime to support them."

### The root cause

This is a **mismatch between compilation and linking exception models**.

Here's the chain of events:

1. The `cc` crate compiles Lua's C files using `emcc -c` (compile to `.o`, don't link)
2. By default, `emcc` compiles C code with **JavaScript-based** setjmp/longjmp emulation
3. This emulation generates `invoke_N` wrapper functions in the `.o` files
4. Later, Rust passes `-fwasm-exceptions` to the Emscripten linker
5. `-fwasm-exceptions` tells Emscripten: "don't generate JS-based exception handling, the WASM runtime handles it natively"
6. Emscripten's linker sees `invoke_N` functions in the object files but didn't generate the JS runtime to support them
7. **Assertion fails**

The Lua C code uses `setjmp`/`longjmp` heavily for error handling. Every `lua_pcall` involves a setjmp. So `invoke_` functions are everywhere in the compiled Lua objects.

### The fix

Force `emcc` to use `-fwasm-exceptions` during the **C compilation step**, not just the linking step:

```bash
# In build.sh or your shell environment:
export CFLAGS_wasm32_unknown_emscripten="-fwasm-exceptions -fPIC"
export EMCC_CFLAGS="-fwasm-exceptions"
```

- `CFLAGS_wasm32_unknown_emscripten` — the `cc` crate reads this env var when compiling C for this target
- `EMCC_CFLAGS` — `emcc` itself reads this for every invocation (compile AND link)

With `-fwasm-exceptions` during C compilation, `emcc` uses native WASM exceptions for setjmp/longjmp instead of generating JavaScript `invoke_N` wrappers.

### How to detect this

If you see `invoke_ functions exported but exceptions and longjmp are both disabled`, check:
1. Is `-fwasm-exceptions` being passed during **C compilation** (not just linking)?
2. Is the `cc` crate picking up your `CFLAGS_*` environment variable?
3. Add `-v` to the cargo build to see the actual `emcc` commands being run

### Why this was hard

The error message is misleading. It says "exceptions and longjmp are both disabled" but we were explicitly enabling longjmp with `-sSUPPORT_LONGJMP=wasm`. The real issue was that the `invoke_` functions were baked into the compiled `.o` files during the C compilation step, before any linker flags were applied.

---

## Lesson 4: `__cxa_find_matching_catch_3` Is Always Undefined

### What happened

After fixing the `invoke_` issue, the next error:

```
error: undefined symbol: __cxa_find_matching_catch_3
(referenced by root reference (e.g. compiled C/C++ code))
```

This happened with **every** Rust toolchain:
- Stable Rust
- Nightly Rust with `-Z build-std=std,panic_abort`
- With and without `-fwasm-exceptions`

### Why it happens

`__cxa_find_matching_catch_3` is a C++ Itanium ABI function for exception handling. The Rust standard library for `wasm32-unknown-emscripten` was compiled with exception support that references this symbol. Even with `panic=abort`, the pre-built stdlib still contains unwinding paths that reference it.

With `-fwasm-exceptions`, Emscripten expects the WASM runtime (the browser) to provide this function natively. But Emscripten's JavaScript linker still performs an undefined-symbol check and fails.

### The fix

```toml
# .cargo/config.toml
"-C", "link-args=-sERROR_ON_UNDEFINED_SYMBOLS=0",
```

This is safe because:
1. `panic=abort` means Rust will never actually invoke unwinding code
2. `__cxa_find_matching_catch_3` is referenced but never called at runtime
3. The browser's WASM runtime would provide it if it were ever needed

### Alternative approaches that didn't work

| Approach | Why it failed |
|----------|--------------|
| `-sDISABLE_EXCEPTION_CATCHING=0` | Conflicts with `-fwasm-exceptions` |
| Link with `-lc++` | Doesn't resolve the symbol in wasm-exceptions mode |
| `-Z build-std` on nightly | The rebuilt stdlib STILL references the symbol |
| Custom target JSON without exception-model | Didn't prevent `-fwasm-exceptions` from being passed |

---

## Lesson 5: `panic=abort` Is Mandatory

### What happened

Without `panic=abort`, the Rust standard library contains full unwinding support that requires C++ exception handling runtime functions. Combined with Emscripten's exception model, this creates an unsolvable circular dependency:

- Rust needs `__cxa_find_matching_catch_3` from the C++ runtime
- Emscripten's `-fwasm-exceptions` mode doesn't provide it in JS
- The browser's WASM runtime provides it, but the Emscripten linker doesn't know that

### The fix

```toml
# .cargo/config.toml
"-C", "panic=abort",
```

This eliminates Rust's dependency on exception handling infrastructure. Combined with `ERROR_ON_UNDEFINED_SYMBOLS=0` for the one remaining dangling reference, the build succeeds.

### Tradeoff

You lose `std::panic::catch_unwind()`. But for a Lua playground, this is fine — mlua handles Lua errors internally via longjmp, and Rust panics in our glue code should never happen for normal user input.

---

## Lesson 6: The `bin` Crate Symbol Reference Trick

### What happened

After switching from `cdylib` to `bin`, the build succeeded but `wasm-ld` couldn't find the `run_lua` export:

```
wasm-ld: error: symbol exported via --export not found: run_lua
```

### Why

When building a `bin` crate, Rust's linker only includes symbols that are transitively reachable from `main()`. Since `main()` didn't reference `run_lua` (it lives in `lib.rs`), the linker stripped it.

### The fix

```rust
// src/main.rs
fn main() {
    // Force the linker to include run_lua from lib.rs
    let _ = lua_wasm::run_lua as extern "C" fn(*const i8, *const i8) -> *mut i8;
}
```

The `let _ = ...` expression takes a reference to the function without calling it, which is enough to prevent the linker from stripping it. The `as extern "C" fn(...)` cast ensures the reference isn't optimized away.

---

## Lesson 7: Homebrew Rust vs rustup for Cross-Compilation

### What happened

The machine had Homebrew-installed Rust at `/opt/homebrew/bin/cargo`. When we tried `cargo build --target wasm32-unknown-emscripten`, it failed with:

```
error[E0463]: can't find crate for `std`
note: the `wasm32-unknown-emscripten` target may not be installed
```

### Why

Homebrew's Rust is a single-target installation. It only includes `std` for the host platform (`aarch64-apple-darwin`). There's no `rustup target add` equivalent for Homebrew Rust.

### The fix

```bash
brew install rustup
rustup-init -y
rustup target add wasm32-unknown-emscripten
```

Then ensure rustup's cargo is **first** in PATH:

```bash
export PATH="$HOME/.rustup/toolchains/stable-aarch64-apple-darwin/bin:$HOME/.cargo/bin:$PATH"
```

### The gotcha

Both `cargo` binaries exist simultaneously. If you don't manage PATH carefully, the Homebrew one at `/opt/homebrew/bin/cargo` silently wins and cross-compilation fails with a misleading error message.

---

## Lesson 8: Web Workers Are the Only Sane Execution Model

### Why not main thread

Running WASM on the main thread means any infinite loop in Lua code (`while true do end`) freezes the entire browser tab. There is no recovery — the user must close the tab.

### The Worker pattern

```
┌──────────────┐    postMessage     ┌──────────────┐
│  main.ts     │ ───{code,stdin}──▶ │  worker.js   │
│  (main thread│ ◀── {result} ───── │  (WASM runs  │
│   UI)        │                    │   here)      │
└──────────────┘                    └──────────────┘
```

The worker loads the Emscripten module via `importScripts()`:

```javascript
// public/worker.js
importScripts("/build/lua_wasm.js");

let Module = await createLuaModule({
    locateFile: (path) => "/build/" + path
});

self.onmessage = function(e) {
    var json = Module.ccall('run_lua', 'string',
        ['string', 'string'], [e.data.code, e.data.stdin]);
    postMessage({ type: 'result', data: JSON.parse(json) });
};
```

### Stop button implementation

```typescript
function stopWorker() {
    worker.terminate();  // kills the worker, even mid-execution
    worker = null;
    createWorker();      // spawn a fresh one
}
```

`Worker.terminate()` immediately destroys the worker thread. The WASM execution is killed, the memory is freed, and a new clean worker is created.

### Emscripten requirement

The Emscripten module must be built with `-sENVIRONMENT=web,worker` to work in both contexts. Without this, the glue code assumes a `window` object and crashes in a Worker.

---

## The Complete Working Recipe

Every line matters. Remove any one and the build breaks.

### Cargo.toml

```toml
[lib]
crate-type = ["lib"]

[[bin]]
name = "lua_wasm"
path = "src/main.rs"

[dependencies]
mlua = { version = "0.10", features = ["lua54", "vendored", "serialize"] }
serde = { version = "1", features = ["derive"] }
serde_json = "1"
```

### .cargo/config.toml

```toml
[target.wasm32-unknown-emscripten]
linker = "emcc"
rustflags = [
    "-C", "panic=abort",                                        # Lesson 5
    "-C", "link-args=-sMODULARIZE=1",                           # JS module output
    "-C", "link-args=-sEXPORT_NAME=createLuaModule",            # Factory function name
    "-C", "link-args=-sEXPORTED_FUNCTIONS=['_run_lua','_free']",# Exported C funcs
    "-C", "link-args=-sEXPORTED_RUNTIME_METHODS=['ccall',...]",# JS API surface
    "-C", "link-args=-sALLOW_MEMORY_GROWTH=1",                  # Lua allocates dynamically
    "-C", "link-args=-sENVIRONMENT=web,worker",                 # Lesson 8
    "-C", "link-args=-sSUPPORT_LONGJMP=wasm",                   # Lua needs longjmp
    "-C", "link-args=-sERROR_ON_UNDEFINED_SYMBOLS=0",           # Lesson 4
    "-C", "link-args=-O2",                                      # Size + speed
]
```

### build.sh environment

```bash
export CC_wasm32_unknown_emscripten=emcc
export CXX_wasm32_unknown_emscripten=em++
export AR_wasm32_unknown_emscripten=emar
export CFLAGS_wasm32_unknown_emscripten="-fwasm-exceptions -fPIC"  # Lesson 3
export EMCC_CFLAGS="-fwasm-exceptions"                              # Lesson 3
```

### Build command

```bash
cargo build --target wasm32-unknown-emscripten --release --bin lua_wasm
```

### Output

```
target/wasm32-unknown-emscripten/release/deps/lua_wasm.js    (~67 KB)
target/wasm32-unknown-emscripten/release/deps/lua_wasm.wasm  (~464 KB)
```

---

## Failure Map

A timeline of every failed approach, in order:

```
Attempt 1: emsdk latest (5.0.7) + cdylib + default flags
  → PIC relocation errors (Lesson 2)

Attempt 2: emsdk latest + cdylib + CFLAGS="-fPIC"
  → PIC still not picked up by cc crate (Lesson 2)

Attempt 3: emsdk latest + bin + default flags
  → __cxa_find_matching_catch_3 undefined (Lesson 4)

Attempt 4: emsdk latest + bin + DISABLE_EXCEPTION_CATCHING=0
  → "not compatible with -fwasm-exceptions" (Lesson 1)

Attempt 5: emsdk latest + bin + SUPPORT_LONGJMP=wasm
  → "FileSystemService=0: No such file or directory" (bad flag format)

Attempt 6: emsdk latest + bin + panic=abort
  → invoke_ assertion (Lesson 3)

Attempt 7: emsdk latest + bin + panic=abort + ERROR_ON_UNDEFINED_SYMBOLS=0
  → invoke_ assertion still fires (Lesson 3)

Attempt 8: nightly + build-std + panic_abort + SUPPORT_LONGJMP=wasm
  → invoke_ assertion (Lesson 3)

Attempt 9: emsdk 3.1.74 + bin + default flags
  → invoke_ assertion (Lesson 3)

Attempt 10: emsdk 3.1.74 + EMCC_CFLAGS="-fwasm-exceptions" ✅ BUILD SUCCEEDS
```

9 failed attempts. Each taught us something. The final working configuration required understanding all of them simultaneously.

---

## Things We Did NOT Try

For completeness, here are approaches that might also work but we didn't pursue:

1. **`wasm32-unknown-unknown` + wasm-pack**: Requires compiling Lua's C code without a libc (needs wasi-sdk or similar). The `cc` crate can't easily do this.

2. **`wasm32-wasip1` target**: Uses WASI instead of Emscripten. Would need WASI SDK for C compilation and a WASI-capable browser runtime. More complex setup.

3. **Pure Rust Lua interpreter** (e.g., `piccolo` crate): Would avoid all C compilation issues. But it's less mature than mlua and might not support all Lua 5.4 features.

4. **Custom Rust target JSON**: Override the exception model by creating a custom target specification. Potentially cleaner but requires nightly Rust and more maintenance.

5. **Pre-compiled Lua WASM**: Use someone else's pre-built Lua WASM binary and write a Rust wrapper. Loses the "vendored from source" guarantee.

---

## Quick Reference: Error → Fix

| Error | Fix |
|-------|-----|
| `can't find crate for 'std'` | Use rustup's cargo, not Homebrew's |
| `relocation R_WASM_MEMORY_ADDR_SLEB ... recompile with -fPIC` | Use `bin` crate type, not `cdylib` |
| `invoke_ functions exported but exceptions and longjmp are both disabled` | `EMCC_CFLAGS="-fwasm-exceptions"` |
| `undefined symbol: __cxa_find_matching_catch_3` | `-sERROR_ON_UNDEFINED_SYMBOLS=0` + `panic=abort` |
| `DISABLE_EXCEPTION_CATCHING=0 is not compatible with -fwasm-exceptions` | Downgrade to Emscripten 3.1.x |
| `symbol exported via --export not found: run_lua` | Reference the fn from `main()` |
| `AssertionError: invoke_ functions...` with ERROR_ON_UNDEFINED_SYMBOLS=0 | You forgot `EMCC_CFLAGS="-fwasm-exceptions"` |
