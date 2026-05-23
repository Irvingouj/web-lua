# Async API Design: Exposing Web APIs to Lua

## Status: Design Phase

## Context

The notebook currently runs Lua in a sandbox with only `print`, `input`, `read`, `emit` as host APIs. Users need access to real web APIs — HTTP requests, storage, browser extension APIs, etc. The challenge: WASM calls are synchronous, but most web APIs are async.

## Architecture: Coroutine Yield/Resume

Following the model proven by OpenResty (Cloudflare, Kong, Alibaba), user code runs as a coroutine. Async API calls yield the coroutine, the worker does the async work, then resumes the coroutine with the result.

### Principle

**Async looks synchronous to the Lua user.**

```lua
local response = web.fetch("https://api.example.com/data")
local data = json.decode(response.body)
print(data.name)
```

### Execution Flow

```
Lua code runs as coroutine inside piccolo
  → hits web.fetch(url)
  → Rust callback yields coroutine, returns command: {action:"fetch", url}
  → run_cell() returns { status: "async_pending", command: {...} }
  → Worker sees async_pending, does the async work itself (workers have fetch!)
  → Worker calls session.resume_cell(result)
  → Coroutine resumes, web.fetch() returns the response
  → Lua continues executing
  → May yield again for another async call
  → Eventually run_cell() returns final RunResult
```

### Multi-step Execution

A single cell execution can yield multiple times:

```
run_cell → AsyncPending → resume_cell → AsyncPending → resume_cell → Done(RunResult)
```

Example:

```lua
local r1 = web.fetch("https://api1.com")     -- yield #1
local r2 = web.fetch("https://api2.com")     -- yield #2
local r3 = web.storage.get("key")            -- yield #3
print(r1.body, r2.body, r3)
```

## WASM API Changes

### Current (sync only)

```rust
pub fn run_cell(&mut self, code: &str, stdin: &str) -> String
```

### New (supports async)

```rust
// May return status: "done" or "async_pending"
pub fn run_cell(&mut self, code: &str, stdin: &str) -> String

// Resume after async work. May return "async_pending" again or "done"
pub fn resume_cell(&mut self, result_json: &str) -> String
```

### RunResult Extensions

```rust
pub struct RunResult {
    // Existing fields
    pub stdout: Vec<String>,
    pub stderr: Vec<String>,
    pub result: Option<String>,
    pub error: Option<CellError>,
    pub commands: Vec<serde_json::Value>,
    pub fuel_exhausted: bool,
    pub execution_count: u32,

    // New fields
    pub status: CellStatus,
    pub pending_command: Option<AsyncCommand>,
}

pub enum CellStatus {
    Done,           // Execution complete
    AsyncPending,   // Yielded, waiting for async result
}

pub struct AsyncCommand {
    pub call_id: String,          // Unique ID to match resume
    pub action: String,           // "fetch", "storage_get", etc.
    pub params: serde_json::Value, // Action-specific parameters
}
```

## Worker State Machine

The worker becomes an async loop instead of a single call:

```typescript
async function executeCell(id: string, code: string, stdin: string) {
    let jsonStr = session.run_cell(code, stdin);
    let result: RunResult = JSON.parse(jsonStr);

    while (result.status === 'async_pending') {
        // Worker executes the async command
        const response = await handleAsyncCommand(result.pending_command);

        // Feed result back to Lua coroutine
        jsonStr = session.resume_cell(JSON.stringify(response));
        result = JSON.parse(jsonStr);
    }

    // Final result
    postMessage({ type: 'result', id, data: result });
}
```

## Error Handling: Three Layers

### Layer 1: JS (Worker) — Catch and Classify

The worker executes async operations, catches all exceptions, and returns a unified result:

```typescript
interface AsyncResponse {
    ok: boolean;
    value?: any;      // Present when ok=true
    error?: AsyncError; // Present when ok=false
}

interface AsyncError {
    message: string;
    code: string;         // "ETIMEDOUT" | "ENETWORK" | "ECORS" | "EHTTP" | "EPERMISSION" | "EUNKNOWN"
    category: string;     // "timeout" | "network" | "http" | "permission" | "unknown"
}

async function handleAsyncCommand(command: AsyncCommand): Promise<string> {
    try {
        const result = await executeCommand(command);
        return JSON.stringify({ ok: true, value: result });
    } catch (err: any) {
        return JSON.stringify({
            ok: false,
            error: {
                message: err.message,
                code: err.code || 'EUNKNOWN',
                category: classifyError(err),
            }
        });
    }
}
```

### Layer 2: Rust (WASM) — Convert to Lua Error

When `resume_cell` receives an error response, it injects a Lua error into the coroutine:

```rust
pub fn resume_cell(&mut self, result_json: &str) -> String {
    let response: AsyncResponse = serde_json::from_str(result_json);

    if response.ok {
        // Resume coroutine normally, value becomes the return of web.fetch()
        coroutine.resume(ctx, response.value)
    } else {
        // Inject error into coroutine — Lua code can catch with pcall
        coroutine.resume_with_error(ctx, &response.error.message)
    }
}
```

### Layer 3: Lua (User Code) — pcall to Handle

```lua
-- Recommended pattern for any async call
local ok, result = pcall(function()
    return web.fetch("https://api.example.com/data", { timeout = 5000 })
end)

if not ok then
    -- result is the error message
    print("Request failed: " .. tostring(result))
else
    -- result is the response object
    print(result.body)
end
```

### Error Classification

| Error Code | Category | Cause | Example |
|-----------|----------|-------|---------|
| `ETIMEDOUT` | timeout | Async operation exceeded time limit | fetch took > 5s |
| `ENETWORK` | network | Network-level failure | DNS failure, no internet |
| `ECORS` | permission | CORS policy blocked the request | Cross-origin without CORS headers |
| `EHTTP` | http | Non-2xx HTTP response | 404, 500 (only if strict mode) |
| `EPERMISSION` | permission | Browser/extension permission denied | Extension API not authorized |
| `EABORTED` | timeout | User cancelled or operation aborted | Cell re-run while fetch in progress |
| `EUNKNOWN` | unknown | Unclassified error | Unexpected exception |

## Important Design Decision: HTTP Errors Are NOT Exceptions

`web.fetch()` returns a response object even for 4xx/5xx. Only **transport-level failures** throw errors:

```lua
-- This does NOT throw: HTTP 404 is a valid response
local response = web.fetch("https://api.example.com/notfound")
print(response.status)   -- 404
print(response.ok)       -- false

-- This DOES throw: network is down
local ok, err = pcall(function()
    return web.fetch("https://nonexistent.invalid")
end)
print(ok)  -- false, err = "dns error: ..."
```

## Protection Limits

### Per-call Timeout

Each async API has a default timeout, overridable by user:

```lua
web.fetch(url, { timeout = 5000 })          -- 5 seconds
web.storage.get(key, { timeout = 1000 })    -- 1 second
```

Default timeouts:

| API | Default Timeout |
|-----|----------------|
| `web.fetch` | 30 seconds |
| `web.storage.*` | 5 seconds |
| `web.cookies.*` | 5 seconds |
| `web.tab.*` | 10 seconds |

### Global Limits

Prevent abuse (e.g., infinite loop of async calls):

```rust
pub struct NotebookSession {
    // Existing
    fuel_limit: i32,

    // New: async call budget
    max_async_calls_per_cell: u32,   // Default: 50
    max_total_async_time_ms: u32,    // Default: 60_000 (60 seconds)
    async_call_count: u32,
    async_elapsed_ms: u32,
}
```

When limits are exceeded, throw `CellError::FuelExhausted` equivalent for async:

```lua
-- Error: "async call limit reached (50 calls in one cell)"
-- Error: "async time limit reached (60s total)"
```

## API Surface (Priority Order)

### Tier 1: Core (implemented first)

| Module | API | Notes |
|--------|-----|-------|
| `json` | `json.encode(table)` → string | Pure WASM, no async |
| `json` | `json.decode(string)` → table | Pure WASM, no async |
| `web` | `web.fetch(url, opts?)` → response | Async, worker has fetch |
| `web.url` | `web.url.parse(s)` → table | Pure WASM |
| `web.url` | `web.url.encode(params)` → string | Pure WASM |

### Tier 2: Webpage APIs

| Module | API | Notes |
|--------|-----|-------|
| `web.storage` | `web.storage.get(key)` | Async (main thread relay) |
| `web.storage` | `web.storage.set(key, value)` | Async (main thread relay) |
| `web.log` | `web.log(...)` | Sync, console.log bridge |
| `web.sleep` | `web.sleep(ms)` | Async, setTimeout |
| `web.dom` | `web.dom.query(selector)` | Async (main thread relay) |

### Tier 3: Browser Extension APIs

| Module | API | Notes |
|--------|-----|-------|
| `web.tab` | `web.tab.query(opts)` | Async, chrome.tabs.query |
| `web.tab` | `web.tab.create(url)` | Async |
| `web.tab` | `web.tab.activate(id)` | Async |
| `web.tab` | `web.tab.execute_script(id, code)` | Async |
| `web.cookies` | `web.cookies.get(opts)` | Async |
| `web.cookies` | `web.cookies.set(opts)` | Async |
| `web.history` | `web.history.search(query)` | Async |
| `web.bookmarks` | `web.bookmarks.search(query)` | Async |
| `web.notifications` | `web.notifications.create(title, opts)` | Async |
| `web.clipboard` | `web.clipboard.read()` | Async |
| `web.clipboard` | `web.clipboard.write(text)` | Async |
| `web.downloads` | `web.downloads.download(url, filename)` | Async |

### Tier 4: Power User

| Module | API | Notes |
|--------|-----|-------|
| `web.websocket` | `web.websocket.connect(url)` | Async, long-lived connection |
| `web.event` | `web.event.on(event, handler)` | Async, event listener |
| `web.menu` | `web.menu.create(opts)` | Async, context menu |

## Async Commands That Need Main Thread Relay

Most APIs can be called from the Worker directly. These require main thread relay:

| API | Why | Mechanism |
|-----|-----|-----------|
| `web.storage.*` | localStorage is main-thread only in some browsers | Worker → main → Worker |
| `web.dom.*` | DOM only exists on main thread | Worker → main → Worker |
| `web.clipboard.*` | Clipboard API is main-thread in some browsers | Worker → main → Worker |

Implementation: Worker posts `{type: 'asyncRelay', command}` to main thread, main thread does the work and posts result back.

## Implementation Order

### Phase 1: Foundation
1. Add `json` module (pure Rust, no async, no architecture changes)
2. Add `CellStatus`, `AsyncCommand` types to Rust
3. Implement coroutine-based run_cell with yield support
4. Add `resume_cell` to WASM API
5. Update worker to async state machine
6. Tests for yield/resume cycle

### Phase 2: First Async API
7. Implement `web.fetch` with error handling
8. Implement timeout mechanism
9. Implement async call limits
10. E2E test: fetch from Lua

### Phase 3: API Expansion
11. `web.url` module
12. `web.storage` with main thread relay
13. `web.log`, `web.sleep`

### Phase 4: Extension APIs
14. Browser extension API bindings
15. `web.tab`, `web.cookies`, `web.history`, etc.

## Open Questions

1. **WebSocket**: Long-lived connections don't fit the yield/resume pattern cleanly. May need a subscription/event model.
2. **Streaming**: `Response.body` as ReadableStream — yield per chunk? Or buffer entire response?
3. **Extension API availability**: How to detect if running in extension context vs regular webpage? Feature flag? Runtime detection?
4. **Main thread relay protocol**: For APIs that need main thread, do we block the worker waiting, or queue and continue later?
