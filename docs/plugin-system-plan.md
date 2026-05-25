# Plugin System Design & Implementation Plan

## Status: Complete

## Goal

Let host apps extend the Lua notebook runtime with three layers:

1. **Rust plugins** — high-performance computing compiled into WASM (image, crypto, matrix, etc.)
2. **JS host.call() bridge** — async app-specific APIs (database, weather, internal services)
3. **Lua libraries** — pure Lua code loaded at init (utilities, helpers)

## Motivation

Every host app has its own APIs. We can't build them all into WASM. Lua users also want Rust-speed for things JS can't do.

| Need | Layer | Example |
|------|-------|---------|
| High-perf compute | Rust plugin | `crypto.sha256("hello")`, `matrix.multiply(a, b)` |
| Image processing | Rust plugin | `image.resize(pixels, 100, 100)` |
| Binary parsing | Rust plugin | `binary.unpack(data, "<I2H")` |
| App database | JS host.call | `host.call("db", {query = "SELECT ..."})` |
| Internal API | JS host.call | `host.call("weather", {city = "SF"})` |
| Pure logic | Lua library | `mymath.double(x)` |

## Architecture

```
┌──────────────────────────────────────────────────┐
│  Lua user code                                    │
│                                                    │
│  ── Built-in APIs ──                               │
│  json.encode(t)                                    │
│  web.fetch(url)                                    │
│  web.storage.get(key)                              │
│  web.url.parse(s)                                  │
│                                                    │
│  ── Rust Plugins (high performance, sync) ──       │
│  image.resize(data, 100, 100)                      │
│  crypto.sha256("hello")                            │
│  matrix.multiply(a, b)                             │
│  zlib.compress(data)                               │
│                                                    │
│  ── JS host.call (app integration, async) ──       │
│  host.call("db", {query = "..."})                  │
│  host.call("weather", {...})                       │
│                                                    │
│  ── Lua Libraries (loaded at init, sync) ──        │
│  mymath.double(21)                                 │
└──────────────────────────────────────────────────┘
```

## Three-Layer Comparison

| Layer | Performance | Who writes it | When it runs |
|-------|-------------|---------------|-------------|
| Rust plugin | ⚡ Native speed | Rust dev, compiled into WASM | Sync callback, zero overhead |
| host.call() | 🔄 yield/resume roundtrip | JS dev, registered at runtime | Async, worker executes |
| Lua library | ⚡ Sync execution | Anyone, Lua source string | Sync, loaded at init |

---

## Phase 1: LuaPlugin Trait + Builder Pattern

### What

Define a `LuaPlugin` trait that lets users create Rust crates exposing custom Lua globals.

### Rust Changes

#### `web-lua-core/src/lib.rs`

```rust
/// A plugin that extends the Lua runtime with custom globals.
pub trait LuaPlugin: 'static {
    /// Plugin name (for debugging).
    fn name(&self) -> &str;

    /// Register custom Lua globals.
    /// Called inside Lua::enter(), so you can create Callbacks, Tables, etc.
    fn register(&self, ctx: Context, host_state: Rc<RefCell<HostState>>);
}

/// Configuration for creating a NotebookSession.
pub struct SessionConfig {
    pub fuel_limit: i32,
    pub plugins: Vec<Box<dyn LuaPlugin>>,
    pub lua_libraries: Vec<(String, String)>,
}

pub struct NotebookSession {
    // ... existing fields ...
}

impl NotebookSession {
    /// Create a session with default settings.
    pub fn new() -> Self {
        Self::build().finish()
    }

    /// Start building a session with custom configuration.
    pub fn build() -> SessionBuilder {
        SessionBuilder::default()
    }
}

#[derive(Default)]
pub struct SessionBuilder {
    fuel_limit: Option<i32>,
    plugins: Vec<Box<dyn LuaPlugin>>,
    lua_libraries: Vec<(String, String)>,
}

impl SessionBuilder {
    pub fn fuel_limit(mut self, limit: i32) -> Self {
        self.fuel_limit = Some(limit);
        self
    }

    pub fn plugin(mut self, plugin: Box<dyn LuaPlugin>) -> Self {
        self.plugins.push(plugin);
        self
    }

    pub fn lua_library(mut self, name: &str, source: &str) -> Self {
        self.lua_libraries.push((name.to_string(), source.to_string()));
        self
    }

    pub fn finish(self) -> NotebookSession {
        let fuel_limit = self.fuel_limit.unwrap_or(8192);
        let mut lua = Lua::core();
        let host_state = Rc::new(RefCell::new(HostState::default()));

        lua.enter(|ctx| {
            // 1. Register built-in globals
            register_host_globals(ctx, host_state.clone());

            // 2. Register Rust plugins
            for plugin in &self.plugins {
                plugin.register(ctx, host_state.clone());
            }

            // 3. Load Lua libraries
            for (name, source) in &self.lua_libraries {
                // Compile and run the library source
                // Register result as a global with the given name
            }
        });

        NotebookSession {
            lua,
            executor: None,
            execution_count: 0,
            fuel_limit,
            host_state,
        }
    }
}
```

### Example Plugin Crate

```
web-lua-plugin-crypto/
  Cargo.toml          # depends on web-lua-core, sha2
  src/
    lib.rs            # CryptoPlugin struct + impl LuaPlugin
```

```rust
// web-lua-plugin-crypto/src/lib.rs
use piccolo_notebook_core::LuaPlugin;
use piccolo::{Callback, CallbackReturn, Table, Context};
use std::cell::RefCell;
use std::rc::Rc;

pub struct CryptoPlugin;

impl LuaPlugin for CryptoPlugin {
    fn name(&self) -> &str { "crypto" }

    fn register(&self, ctx: Context, _host_state: Rc<RefCell<HostState>>) {
        let crypto = Table::new(&ctx);

        let sha256_cb = Callback::from_fn(&ctx, move |ctx, _exec, mut stack| {
            let input = match stack.get(0) {
                Value::String(s) => String::from_utf8_lossy(s.as_bytes()).to_string(),
                other => {
                    let msg = format!("crypto.sha256 expects a string, got {}", other.type_name());
                    return Err(msg.into_value(ctx).into());
                }
            };
            use sha2::{Sha256, Digest};
            let hash = Sha256::digest(input.as_bytes());
            let hex = format!("{:x}", hash);
            stack.clear();
            stack.push_back(ctx.intern(hex.as_bytes()).into());
            Ok(CallbackReturn::Return)
        });
        crypto.set_field(ctx, "sha256", sha256_cb);

        // crypto.hmac_sha256(key, data) → hex
        // crypto.md5(data) → hex
        // crypto.base64_encode(data) → string
        // crypto.base64_decode(string) → data

        ctx.set_global("crypto", crypto);
    }
}
```

### Usage

```rust
let session = NotebookSession::build()
    .fuel_limit(8192)
    .plugin(Box::new(CryptoPlugin))
    .plugin(Box::new(ImagePlugin))
    .lua_library("mymath", r#"
        function mymath.double(x) return x * 2 end
    "#)
    .finish();
```

### WASM Wrapper

The WASM wrapper either:
- **Default**: ships without extra plugins (just built-in APIs)
- **Custom**: host app creates their own WASM wrapper that registers plugins

```rust
// Host app's custom WASM wrapper
#[wasm_bindgen]
pub struct WasmSession {
    inner: NotebookSession,
}

#[wasm_bindgen]
impl WasmSession {
    #[wasm_bindgen(constructor)]
    pub fn new() -> Self {
        let inner = NotebookSession::build()
            .fuel_limit(8192)
            .plugin(Box::new(CryptoPlugin))
            .plugin(Box::new(ImagePlugin))
            .finish();
        Self { inner }
    }
}
```

### Rust Unit Tests

```rust
#[test]
fn test_plugin_registration() {
    struct TestPlugin;
    impl LuaPlugin for TestPlugin {
        fn name(&self) -> &str { "test" }
        fn register(&self, ctx: Context, _hs: Rc<RefCell<HostState>>) {
            let t = Table::new(&ctx);
            let cb = Callback::from_fn(&ctx, move |ctx, _exec, mut stack| {
                stack.clear();
                stack.push_back(42_i64.into());
                Ok(CallbackReturn::Return)
            });
            t.set_field(ctx, "answer", cb);
            ctx.set_global("testlib", t);
        }
    }

    let mut session = NotebookSession::build()
        .plugin(Box::new(TestPlugin))
        .finish();

    let result = session.run_cell("print(testlib.answer())", "");
    assert_eq!(result.stdout, vec!["42"]);
}

#[test]
fn test_lua_library_loading() {
    let mut session = NotebookSession::build()
        .lua_library("mymath", "function mymath.double(x) return x * 2 end")
        .finish();

    let result = session.run_cell("print(mymath.double(21))", "");
    assert_eq!(result.stdout, vec!["42"]);
}

#[test]
fn test_plugin_and_builtin_coexist() {
    let mut session = NotebookSession::build()
        .plugin(Box::new(CryptoPlugin))
        .finish();

    // Built-in still works
    let r1 = session.run_cell("print(json.encode({a = 1}))", "");
    assert!(r1.error.is_none());

    // Plugin works
    let r2 = session.run_cell(r#"
        local hash = crypto.sha256("hello")
        print(hash)
    "#, "");
    assert!(r2.error.is_none());
    assert!(r2.stdout[0].len() == 64); // SHA256 hex is 64 chars
}

#[test]
fn test_plugin_async() {
    // Plugin can also yield for async operations
    struct AsyncPlugin;
    impl LuaPlugin for AsyncPlugin {
        fn name(&self) -> &str { "asyncext" }
        fn register(&self, ctx: Context, hs: Rc<RefCell<HostState>>) {
            let hs_async = hs.clone();
            let cb = Callback::from_fn(&ctx, move |ctx, _exec, mut stack| {
                let mut hs = hs_async.borrow_mut();
                hs.async_call_counter += 1;
                let command = AsyncCommand {
                    call_id: hs.async_call_counter,
                    action: "custom_action".to_string(),
                    params: serde_json::json!({"data": "test"}),
                };
                hs.pending_async_command = Some(command);
                stack.clear();
                Ok(CallbackReturn::Yield { to_thread: None, then: None })
            });
            ctx.set_global("custom_async", cb);
        }
    }

    let mut session = NotebookSession::build()
        .plugin(Box::new(AsyncPlugin))
        .finish();

    let result = session.run_cell("local r = custom_async()", "");
    assert_eq!(result.status, CellStatus::AsyncPending);
    assert_eq!(result.pending_command.unwrap().action, "custom_action");
}
```

### Acceptance Criteria

- [ ] `LuaPlugin` trait defined
- [ ] `SessionBuilder` with `.plugin()` and `.lua_library()` methods
- [ ] Existing `NotebookSession::new()` still works (backward compatible)
- [ ] Plugins can register sync callbacks
- [ ] Plugins can register async callbacks (yield)
- [ ] Lua libraries loaded from source strings
- [ ] 4+ Rust unit tests
- [ ] All existing 102 tests still pass

---

## Phase 2: host.call() JS Bridge

### What

Expose `host.call(action, params)` in Lua. Let JS host apps register custom async handlers.

### Rust Changes

Add `host` global table with `host.call(action, params)`:

```rust
fn register_host_globals(ctx: Context, host_state: Rc<RefCell<HostState>>) {
    // ... existing registration ...

    // ── host.call(action, params) ──
    let hs_host = host_state.clone();
    let host_call_cb = Callback::from_fn(&ctx, move |ctx, _exec, mut stack| {
        let action = if stack.len() > 0 {
            match stack.get(0) {
                Value::String(s) => String::from_utf8_lossy(s.as_bytes()).to_string(),
                other => {
                    let msg = format!("host.call expects action name (string), got {}", other.type_name());
                    return Err(msg.into_value(ctx).into());
                }
            }
        } else {
            return Err("host.call requires an action name".into_value(ctx).into());
        };

        let params = if stack.len() > 1 {
            lua_value_to_json(ctx, stack.get(1)).unwrap_or(serde_json::Value::Null)
        } else {
            serde_json::json!({})
        };

        let mut hs = hs_host.borrow_mut();
        hs.async_call_counter += 1;
        let call_id = hs.async_call_counter;
        let command = AsyncCommand {
            call_id,
            action: format!("host_{}", action),  // prefix to avoid collision
            params,
        };
        hs.pending_async_command = Some(command);

        stack.clear();
        Ok(CallbackReturn::Yield { to_thread: None, then: None })
    });

    let host_table = Table::new(&ctx);
    host_table.set_field(ctx, "call", host_call_cb);
    ctx.set_global("host", host_table);
}
```

### Worker Changes

Accept custom handlers during initialization:

```typescript
// worker.ts

let customHandlers: Record<string, (params: any) => Promise<any>> = {};

// New message type
export type WorkerMessage =
    | { type: 'runCell'; id: string; code: string; stdin: string }
    | { type: 'reset' }
    | { type: 'stop' }
    | { type: 'setFuelLimit'; limit: number }
    | { type: 'asyncRelayResult'; id: string; result: string }
    | { type: 'setTestChromeApis'; apis: any }
    | { type: 'registerHandler'; action: string; handler: string }; // serialized handler

// In handleAsyncCommand:
case action.startsWith('host_'):
    const handlerName = action.slice(5); // remove "host_" prefix
    if (customHandlers[handlerName]) {
        try {
            const value = await customHandlers[handlerName](command.params);
            return { ok: true, value };
        } catch (err: any) {
            return { ok: false, error: { message: err.message, code: 'EHOSTCALL', category: 'host' } };
        }
    } else {
        return { ok: false, error: { message: `No handler registered for "${handlerName}"`, code: 'ENOHANDLER', category: 'host' } };
    }
```

### Main Thread / Host App Integration

The host app provides handlers when creating the notebook:

```typescript
// Option A: Direct worker message (for custom setups)
worker.postMessage({
    type: 'registerHandler',
    action: 'database',
    handler: async (params) => {
        const results = await myDb.query(params.query);
        return results;
    }
});

// Option B: Helper function exported from our library
export function createNotebook(config: {
    fuelLimit?: number;
    libraries?: Record<string, string>;
    handlers?: Record<string, (params: any) => Promise<any>>;
}): Promise<{ worker: Worker; session: WasmSession }> {
    // 1. Create worker
    // 2. Wait for ready
    // 3. Register handlers
    // 4. Load libraries
    return { worker, session };
}
```

### Usage Example

Host app:
```typescript
import { createNotebook } from 'web-lua';

const notebook = await createNotebook({
    fuelLimit: 8192,
    libraries: {
        mymath: `function mymath.double(x) return x * 2 end`,
    },
    handlers: {
        database: async (params) => {
            const results = await myAppDb.query(params.query);
            return results;
        },
        weather: async (params) => {
            const resp = await fetch(`https://weather.api/${params.city}`);
            return resp.json();
        },
        user: async (params) => {
            return getCurrentUser();
        },
    },
});
```

Lua user code:
```lua
-- Sync library
print(mymath.double(21))  -- 42

-- Async host call
local user = host.call("user", {})
print("Hello, " .. user.name)

local orders = host.call("database", {
    query = "SELECT * FROM orders WHERE user_id = ?",
    params = {user.id}
})
print("You have " .. #orders .. " orders")

local weather = host.call("weather", {city = user.city})
print("Weather:", weather.temperature, "°C")

-- Error handling
local ok, err = pcall(function()
    host.call("nonexistent", {})
end)
if not ok then print("no such handler") end
```

### Rust Unit Tests

```rust
#[test]
fn test_host_call_yields() {
    let mut session = NotebookSession::new();
    let result = session.run_cell(r#"
        local result = host.call("my_action", {key = "value"})
        print(result)
    "#, "");
    assert_eq!(result.status, CellStatus::AsyncPending);
    let cmd = result.pending_command.unwrap();
    assert_eq!(cmd.action, "host_my_action");
    assert_eq!(cmd.params["key"], "value");
}

#[test]
fn test_host_call_resume() {
    let mut session = NotebookSession::new();
    let result = session.run_cell(r#"
        local result = host.call("my_action", {})
        print(result.status)
    "#, "");
    assert_eq!(result.status, CellStatus::AsyncPending);

    let resume = session.resume_cell(
        r#"{"ok": true, "value": {"status": "ok", "count": 5}}"#
    );
    assert_eq!(resume.status, CellStatus::Done);
    assert!(resume.stdout.iter().any(|s| s.contains("ok")));
}

#[test]
fn test_host_call_error() {
    let mut session = NotebookSession::new();
    let result = session.run_cell(r#"
        local ok, err = pcall(function()
            host.call("missing", {})
        end)
        print("caught:", not ok)
    "#, "");
    assert_eq!(result.status, CellStatus::AsyncPending);

    let resume = session.resume_cell(
        r#"{"ok": false, "error": {"message": "No handler", "code": "ENOHANDLER"}}"#
    );
    assert_eq!(resume.status, CellStatus::Done);
    assert!(resume.stdout[0].contains("true"));
}

#[test]
fn test_host_call_requires_string_action() {
    let mut session = NotebookSession::new();
    let result = session.run_cell(r#"
        host.call(123, {})
    "#, "");
    assert!(result.error.is_some());
}
```

### E2E Tests

```typescript
// web/tests/e2e/host-call.spec.ts
test('host.call routes to custom handler', async ({ page }) => {
    // Inject a custom handler via the worker
    // Execute Lua: host.call("greet", {name = "World"})
    // Expect output: "Hello, World!"
});

test('host.call returns error for missing handler', async ({ page }) => {
    // Execute Lua with pcall: host.call("missing", {})
    // Expect: caught error
});

test('host.call with library combination', async ({ page }) => {
    // Load library + register handler
    // Execute Lua that uses both
});
```

### Acceptance Criteria

- [ ] `host.call(action, params)` available in Lua
- [ ] Action prefixed with `host_` to avoid collision with built-in APIs
- [ ] Worker routes `host_*` actions to custom handlers
- [ ] Error when no handler registered (ENOEXTENSION → ENOHANDLER)
- [ ] Works with pcall for error handling
- [ ] 4+ Rust unit tests
- [ ] 3+ E2E tests
- [ ] All existing tests still pass

---

## Phase 3: Lua Library Loading

### What

Allow loading pure Lua source code as global tables at init time.

### WASM API

```rust
// piccolo-notebook-wasm
impl WasmSession {
    /// Load a Lua library by source code.
    /// The code runs in the session's Lua context.
    /// Any globals defined become available to subsequent cells.
    pub fn load_library(&mut self, source: &str) -> String {
        let result = self.inner.run_cell(source, "");
        serde_json::to_string(&result).unwrap()
    }
}
```

Actually, since libraries are just Lua code, `run_cell` already works. But a dedicated method is cleaner:

```rust
impl NotebookSession {
    /// Load a Lua library. Executes the source code in the current context.
    /// Any globals/variables defined become available to subsequent cells.
    pub fn load_library(&mut self, name: &str, source: &str) -> RunResult {
        // Wrap in a way that the library code defines a table with the given name
        let wrapped = format!(
            "{} = (function()\n{}\nend)()\n",
            name, source
        );
        self.run_cell(&wrapped, "")
    }
}
```

Or even simpler — just expose `run_cell` as `load_library`:

```rust
pub fn load_library(&mut self, source: &str) -> RunResult {
    self.run_cell(source, "")
}
```

### SessionBuilder Integration

```rust
impl SessionBuilder {
    pub fn lua_library(mut self, name: &str, source: &str) -> Self {
        self.lua_libraries.push((name.to_string(), source.to_string()));
        self
    }

    pub fn finish(self) -> NotebookSession {
        // ... create session ...

        lua.enter(|ctx| {
            register_host_globals(ctx, host_state.clone());
            for plugin in &self.plugins {
                plugin.register(ctx, host_state.clone());
            }
        });

        let mut session = NotebookSession { /* ... */ };

        // Load Lua libraries (needs executor, so after session creation)
        for (name, source) in &self.lua_libraries {
            session.load_library(name, source);
        }

        session
    }
}
```

### Acceptance Criteria

- [ ] `load_library(source)` method on WasmSession
- [ ] `.lua_library(name, source)` on SessionBuilder
- [ ] Globals defined in library available in subsequent cells
- [ ] Library loading errors reported properly
- [ ] 2+ Rust unit tests
- [ ] All existing tests still pass

---

## Phase 4: Example Plugins

### What

Create example plugin crates demonstrating how to write Rust plugins.

### Plugin: web-lua-plugin-crypto

```
crates/web-lua-plugin-crypto/
  Cargo.toml
  src/lib.rs
```

API surface:
```lua
crypto.sha256(data)      → hex string
crypto.md5(data)         → hex string
crypto.hmac_sha256(key, data) → hex string
crypto.base64_encode(data)    → string
crypto.base64_decode(str)     → string
```

Dependencies: `sha2`, `md-5`, `hmac`, `base64`

### Plugin: notebook-plugin-image

```
crates/notebook-plugin-image/
  Cargo.toml
  src/lib.rs
```

API surface:
```lua
image.resize(pixels, w, h, new_w, new_h) → pixels
image.grayscale(pixels)                  → pixels
image.flip(pixels, w, h, "horizontal")   → pixels
```

Pure Rust, no external image crate needed for basic ops.

### Plugin: notebook-plugin-binary

```
crates/notebook-plugin-binary/
  Cargo.toml
  src/lib.rs
```

API surface:
```lua
binary.pack("<I2H", 42, 100)       → binary string
binary.unpack("<I2H", data)        → {42, 100}
binary.hex_encode(data)            → hex string
binary.hex_decode("48656c6c6f")    → "Hello"
```

### Acceptance Criteria

- [ ] 2-3 example plugin crates
- [ ] Each with README explaining how to use
- [ ] Each with Rust unit tests
- [ ] Works when compiled into WASM

---

## Implementation Order

```
Phase 1: LuaPlugin trait + SessionBuilder    ← foundation
Phase 2: host.call() JS bridge              ← JS-level extensibility
Phase 3: Lua library loading                ← simplest extension path
Phase 4: Example plugins                    ← documentation by example
```

Phases 1-3 are independent of each other and can be done in parallel.

## Test Totals (Estimated)

| Phase | Rust Tests | E2E Tests | New |
|-------|-----------|-----------|-----|
| Phase 1: Plugin trait | 4+ | 0 | 4 |
| Phase 2: host.call | 4+ | 3+ | 7 |
| Phase 3: Lua libraries | 2+ | 1+ | 3 |
| Phase 4: Example plugins | 6+ | 0 | 6 |
| **Total** | **16+** | **4+** | **20+** |

Combined with existing 102 Rust + 27 E2E = **~150 total tests**.

## File Changes Summary

| File | Phase 1 | Phase 2 | Phase 3 | Phase 4 |
|------|---------|---------|---------|---------|
| `crates/web-lua-core/src/lib.rs` | ✏️ trait, builder | ✏️ host.call | ✏️ load_library | |
| `crates/piccolo-notebook-wasm/src/lib.rs` | ✏️ builder API | | ✏️ load_library | |
| `web/src/worker.ts` | | ✏️ custom handlers | | |
| `web/src/main.ts` | | ✏️ createNotebook | | |
| `crates/web-lua-plugin-crypto/` | 📄 new | | | 📄 new |
| `crates/notebook-plugin-image/` | | | | 📄 new |
| `crates/notebook-plugin-binary/` | | | | 📄 new |
| `web/tests/e2e/host-call.spec.ts` | | 📄 new | | |

## Open Questions

1. **Worker handler registration**: Functions can't cross Worker boundary via `postMessage`. Options:
   - A: Host app creates its own worker.ts with handlers baked in
   - B: We use a shared worker protocol where main thread relays host.call commands
   - C: We expose the worker creation as a factory function

2. **WASM plugin distribution**: Users who want Rust plugins must recompile WASM. Should we:
   - A: Provide a template repo for custom WASM builds
   - B: Support dynamic plugin loading (harder with WASM)
   - C: Ship common plugins in the default WASM build behind feature flags

3. **Plugin versioning**: How do plugins declare compatibility with the runtime version?
