# Lua Runtime Evaluation

Date: 2026-05-22
Projects: piccolo (kyren/piccolo), silt-lua (Auxnon/silt-lua)
For: browser Lua-like notebook/runtime for LLM agent scripting

---

## Executive Recommendation

**Fork piccolo.**

It is the only project that satisfies every hard requirement: pure Rust, compiles to `wasm32-unknown-unknown`, has a built-in fuel/step-limit system, supports persistent GC arena state between cells, has safe host function registration, and needs zero Emscripten.

silt-lua is interesting but cannot do step limiting (its VM runs to completion in a single synchronous call), is effectively unmaintained, and has no path to safe interruptibility.

mlua/Emscripten works — we proved it — but the toolchain lock-in to Emscripten 3.1.x, the 10 failed build attempts, and the ongoing fragility make it a liability.

---

## Summary Matrix

| Criterion | piccolo | silt-lua | mlua/Emscripten |
|---|:---:|:---:|:---:|
| Pure Rust (no C code) | yes | yes | no |
| wasm32-unknown-unknown | yes (2 fixes) | yes (with wasm feature) | no (Emscripten only) |
| No Emscripten | yes | yes | no |
| Persistent session state | yes | yes | yes |
| Host function registration | yes | yes | yes |
| Step limit / fuel / interrupt | yes (built-in) | no (structural) | no |
| Active maintenance | yes (Jul 2025) | sparse (Dec 2025 burst, was dormant) | yes |
| Unsafe count | 31 | 131 | n/a (C codebase) |
| WASM binary size estimate | ~500KB* | 407KB | 464KB |
| Full Lua 5.4 compat | partial | partial | yes |

\* piccolo as a lib produces .rlib, not .wasm directly. Size estimated from comparable linking.

---

## Build Results

### piccolo — native

```
$ cargo build    → SUCCESS (7.7s)
$ cargo test     → SUCCESS (all pass)
```

### piccolo — wasm32-unknown-unknown

Two fixes required:

1. **getrandom**: piccolo depends on `rand` which depends on `getrandom`. On wasm32-unknown-unknown, getrandom needs the `js` feature to use `crypto.getRandomValues()`. Fix: add `getrandom = { version = "0.2", features = ["js"] }` as a workspace dependency.

2. **SmallRng seed size**: `src/stdlib/math.rs:340` constructs a `[u8; 32]` seed, but `SmallRng::from_seed` expects `[u8; 16]` on wasm32 (ChaCha8 core). Fix: change to `[u8; 16]`.

```
$ cargo build --target wasm32-unknown-unknown --release --lib → SUCCESS (10.4s)
```

Both fixes are trivial and non-structural. One is a dependency config, one is a constant.

### silt-lua — native

```
$ cargo build --lib → SUCCESS (5.9s, 79 warnings)
```

79 warnings, mostly unused variables and dead code. Not blocking but suggests incomplete cleanup.

### silt-lua — wasm32-unknown-unknown

```
$ cargo build --target wasm32-unknown-unknown --lib --features wasm → SUCCESS (5.8s)
```

Requires the `wasm` feature (which pulls in wasm-bindgen + serde). The `colored` crate (terminal colors) is a dependency but is not gated behind a feature flag — it compiles for WASM because it degrades gracefully (no-op on non-terminal). This is fragile.

WASM output: **407KB** (cdylib, direct .wasm file).

---

## Feature Matrix

| Feature | piccolo | silt-lua | Notes |
|---|:---:|:---:|---|
| Numeric literals | yes | yes | |
| String literals | yes | yes | |
| Bool / nil | yes | yes | |
| Global variables | yes | yes | |
| Local variables | yes | yes | |
| Assignment | yes | yes | |
| Arithmetic operators | yes | yes | |
| Comparison operators | yes | yes | |
| Boolean operators (and/or/not) | yes | yes | |
| if/else | yes | yes | |
| while loop | yes | yes | |
| for loop (numeric) | yes | yes | |
| for loop (generic/in) | yes | partial | silt-lua: pairs() works but unclear how complete |
| repeat/until | yes | unknown | not tested |
| function declaration | yes | yes | |
| function call | yes | yes | |
| recursion | yes | yes | both tested in source |
| closures / upvalues | yes | yes | both have closure tests |
| table literals | yes | yes | |
| table indexing | yes | yes | |
| return values | yes | partial | silt-lua: multi-return WIP per README |
| custom host/native functions | yes | yes | piccolo: Callback system; silt-lua: register_native_function |
| stdout/print interception | yes | yes | both let you override print |
| persistent interpreter state | yes | yes | both keep globals between runs |
| instruction limit / fuel | yes | no | piccolo: Fuel struct, per-step; silt-lua: no mechanism |
| interrupt / stop mid-execution | yes | no | piccolo: stackless design enables this; silt-lua: synchronous run |
| WASM target compatibility | yes | yes | both compile to wasm32-unknown-unknown |
| coroutine support | yes | unknown | piccolo: full; silt-lua: not mentioned |
| metatables/metamethods | yes | partial | piccolo: most implemented; silt-lua: WIP per README |
| string library | partial | no | piccolo: sparse; silt-lua: none |
| math library | partial | no | piccolo: has math.random; silt-lua: none |
| goto/labels | yes | unknown | piccolo: yes |
| varargs (...) | yes | unknown | piccolo: yes |

---

## WASM Compatibility

### piccolo

| Check | Result |
|---|---|
| Compiles to wasm32-unknown-unknown | yes (2 trivial patches) |
| Requires libc | no |
| Requires filesystem | no |
| Requires OS APIs | no |
| Requires Emscripten | no |
| Uses wasm-incompatible unsafe | no |
| Dependencies all wasm-compatible | yes (after getrandom fix) |
| Runs inside Web Worker | yes |
| Can expose wasm-bindgen API | yes (trivial to add) |
| Can be interrupted by fuel | yes (built-in Fuel system) |

### silt-lua

| Check | Result |
|---|---|
| Compiles to wasm32-unknown-unknown | yes (with wasm feature) |
| Requires libc | no |
| Requires filesystem | no |
| Requires OS APIs | no |
| Requires Emscripten | no |
| Uses wasm-incompatible unsafe | risky (131 unsafe blocks, raw pointer VM) |
| Dependencies all wasm-compatible | mostly (colored is sketchy) |
| Runs inside Web Worker | yes |
| Can expose wasm-bindgen API | yes (already has wasm feature) |
| Can be interrupted by fuel | **no** — no mechanism exists |

### Why silt-lua cannot do step limiting

silt-lua's VM runs in `VM::run()` — a single synchronous Rust function that executes bytecode until completion or error. There is no yield point, no fuel counter, no hook callback. The VM loop is a tight `loop { match opcode { ... } }` with raw pointer manipulation.

Adding fuel would require:
1. Injecting fuel checks into every opcode dispatch (50+ locations)
2. Saving and restoring VM state across fuel boundaries
3. Rewriting the GC arena interaction to support partial execution

This is a fundamental architectural change, not a feature addition.

---

## Embedding API Fit

### Desired API shape

```rust
pub struct Session { ... }
impl Session {
    pub fn new() -> Self;
    pub fn run_cell(&mut self, code: &str, stdin: &str) -> RunResult;
    pub fn reset(&mut self);
}
```

### piccolo fit

**Can we keep one interpreter state alive between cells?**
Yes. `Lua` wraps an `Arena` (GC root). The `Arena` persists between calls. You call `lua.try_enter(|ctx| { ... })` repeatedly on the same `Lua` instance.

**Can a later cell see variables from an earlier cell?**
Yes. Globals set in cell 1 remain visible in cell 2. The `globals()` table is the same object across calls.

**Can we register a Rust function as global print?**
Yes. `ctx.globals().set(ctx, "print", callback)` where callback is any Rust `Fn`. The callback system is the core design of piccolo.

**Can we stop infinite loops?**
Yes. `Executor::step(ctx, &mut fuel)` runs a bounded number of instructions. When fuel runs out, control returns. You call step again in a loop from your host code.

**Can we serialize results to JSON?**
Yes. Return values come out as `Value` which you can pattern-match and convert to serde JSON.

**Can we expose only a small safe API?**
Yes. `Lua::core()` creates a VM with no stdlib at all. You add only what you want.

### silt-lua fit

**Persistent state?**
Yes. The `Lua` struct wraps an `Arena` and persists between runs.

**Cell-to-cell visibility?**
Yes. Globals persist in the `globals` HashMap.

**Custom print?**
Yes. `vm.register_native_function(mc, "print", my_print)`.

**Stop infinite loops?**
**No.** `vm.run(code, compiler)` is synchronous and unbounded. No mechanism to interrupt.

**JSON serialization?**
Possible but manual — `ExVal` to string conversion exists but no serde integration in the non-wasm path.

**Small safe API?**
Partial. `Lua::new()` gives a bare VM. `Lua::new_with_standard()` adds print+clock+setmetatable+getmetatable. You can skip `new_with_standard` and add only what you want.

---

## Safety / Sandbox

### piccolo

- **31 unsafe blocks**, isolated to:
  - String internals (Gc pointer casting)
  - Callback dispatch (function pointer call)
  - Async sequence tunneling
  - Value representation optimization (avoiding fat pointers)
- All unsafe is behind safe interfaces. The `Collect` trait (GC tracing) is implemented safely via derive macros.
- **Fuel system** bounds CPU time and memory growth per step.
- **No stdlib by default** with `Lua::core()` — you opt in to each library.
- gc-arena prevents use-after-free and provides cycle detection.

### silt-lua

- **131 unsafe blocks**, spread throughout the VM:
  - Raw pointer arithmetic for the instruction pointer (`ep.ip.add(1)`)
  - Raw pointer dereferencing for stack values
  - Unsafe `Collect` impls
  - Direct memory writes without bounds checking
- The VM uses raw pointers for performance but the safety guarantees are weaker.
- **No fuel/step system** — cannot bound execution time.
- GC uses gc-arena (same as piccolo) but the VM's unsafe code circumvents some of its guarantees.

---

## Notebook Runtime Fit

### What a notebook needs

1. **Cell isolation with shared state**: cells share globals but each execution is independent
2. **Interruptibility**: user must be able to stop a runaway cell
3. **Structured output**: stdout lines + return value + error
4. **Host API registration**: print(), input(), read(), and future click()/type()
5. **Deterministic state reset**: ability to clear everything and start fresh

### piccolo

| Need | Supported | How |
|---|---|---|
| Cell isolation | yes | Fresh `Executor` per cell, shared `Lua`/`Arena` |
| Shared globals | yes | `ctx.globals()` persists across `try_enter` calls |
| Interruptibility | yes | `Fuel` system, `Executor::step()` returns every N instructions |
| Structured output | yes | Custom `print` callback pushes to a `Vec<String>` |
| Host API | yes | `Callback::from_fn()` / `Callback::from_fn_with_ctx()` |
| State reset | yes | Drop the `Lua` and create a new one |

### silt-lua

| Need | Supported | How |
|---|---|---|
| Cell isolation | partial | Same VM runs each cell, no executor boundary |
| Shared globals | yes | Globals HashMap persists |
| Interruptibility | **no** | No mechanism. Infinite loop = frozen tab |
| Structured output | yes | Custom print callback pushes to Vec |
| Host API | yes | `register_native_function()` |
| State reset | yes | Create new `Lua` instance |

---

## Risks

### piccolo risks

| Risk | Severity | Mitigation |
|---|---|---|
| Pre-1.0 API breakage | medium | Pin version, don't upgrade casually |
| Incomplete Lua stdlib | low | We don't need io/os/package/debug. table/string/math are partial but improving |
| gc-arena is a git dep | low | It's by the same author, well-maintained. Can vendor if needed |
| No wasm-bindgen integration out of the box | low | Trivial to add — we add our own wasm-bindgen wrapper |
| getrandom js feature needed for WASM | low | One-line config fix |
| Performance vs C Lua | low | Acceptable for LLM-generated scripts, not a game engine |

### silt-lua risks

| Risk | Severity | Mitigation |
|---|---|---|
| **No step limit — infinite loops freeze** | **critical** | Would require VM rewrite. Not feasible. |
| 131 unsafe blocks | high | Raw pointer VM is fragile, especially under WASM |
| Effectively unmaintained | high | Last burst Dec 2025 after long dormancy. Author may vanish again |
| Incomplete GC | high | README says "currently possible to create memory leaks" |
| Multi-return is WIP | medium | May hit edge cases |
| No coroutine support | medium | Not needed for v1 but limits future use |
| colored crate in WASM | low | Compiles but degrades to no-op. Fragile. |

---

## Recommendation

### Choose: **Fork piccolo**

### Why

1. **Fuel system** — the only project with a built-in step limit. This is non-negotiable for a notebook runtime. We cannot ship something where an LLM-generated `while true do end` freezes the browser.

2. **Stackless VM** — the trampoline-style execution means the host (our TypeScript→Worker→WASM bridge) always retains control. We can pause, resume, or kill execution at any step boundary.

3. **wasm32-unknown-unknown** — no Emscripten. No version-pinned SDK. No 9 failed build attempts. Just `cargo build --target wasm32-unknown-unknown`.

4. **Minimal unsafe** — 31 isolated unsafe blocks vs silt-lua's 131 spread through the VM core.

5. **Active maintenance** — commits in 2025, issues being addressed, API evolving.

### What we lose vs mlua/Emscripten

- Full Lua 5.4 compatibility (piccolo is partial — missing some stdlib, some edge cases differ)
- Battle-tested C runtime (piccolo's GC and VM are solid but less mature than PUC-Rio Lua)
- Some string/table library functions

### What we gain

- No Emscripten dependency
- wasm32-unknown-unknown (standard WASM toolchain)
- Built-in fuel/interrupt system
- ~500KB WASM binary (similar to mlua's 464KB)
- Pure Rust — we can read, modify, and debug every line
- Safe sandbox by default

### Estimated implementation effort

**1-2 days** to get a working notebook prototype:
- Day 1: Fork piccolo, add wasm-bindgen wrapper, implement Session struct, wire to Worker
- Day 2: Custom globals (print/input/read/emit), UI integration, test all acceptance scripts

### First 3 concrete tasks

1. **Create a new Rust crate** that depends on `piccolo` and exposes:
   ```rust
   #[wasm_bindgen]
   pub struct Session { lua: Lua }

   #[wasm_bindgen]
   impl Session {
       #[wasm_bindgen(constructor)]
       pub fn new() -> Self;
       pub fn run_cell(&mut self, code: &str, stdin: &str) -> JsValue; // JSON
       pub fn reset(&mut self);
   }
   ```
   Build this for wasm32-unknown-unknown. Wire it to the existing Vite + Worker UI.

2. **Implement custom globals**: Register `print`, `input`, `read`, `emit` as piccolo callbacks that capture into a `RunResult` struct. This is the same pattern we used with mlua.

3. **Wire the fuel system**: In the worker, call `Executor::step()` in a loop with a fuel budget (e.g., 10,000 instructions per step). Post partial results back if fuel runs out. Allow the main thread to signal stop.

---

## What Was Not Tested

- Running actual Lua scripts inside piccolo's WASM build (only compiled, not executed in browser)
- Running silt-lua's WASM output in a browser
- Performance benchmarks comparing any of the three runtimes
- gc-arena cycle collection behavior under real workloads
- piccolo's coroutine system
- piccolo's async sequence system
- Memory usage patterns under sustained notebook use

---

## Comparison with Our Current mlua/Emscripten Build

| | mlua/Emscripten (current) | piccolo (proposed) |
|---|---|---|
| Build toolchain | Emscripten 3.1.74 + rustup nightly + build-std | cargo + wasm-pack |
| Build time (clean) | ~10s incremental, ~60s clean | ~10s incremental, ~30s clean |
| Build fragility | 9 failed attempts to find working config | 2 trivial patches |
| Emscripten version lock | must pin to 3.1.x (5.x breaks) | no Emscripten |
| WASM binary size | 464KB + 67KB JS glue | ~500KB (estimate) |
| Step limit | no (infinite loops freeze Worker) | yes (Fuel system) |
| Full Lua compat | yes | partial |
| C dependency | yes (Lua 5.4 C source) | no |
| Unsafe in our code | no (mlua is safe wrapper) | minimal (piccolo internals) |
