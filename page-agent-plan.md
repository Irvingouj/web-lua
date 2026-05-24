# Page Agent API — Implementation Plan

## Overview

Build a `page.*` Lua API that lets an LLM agent living inside a browser extension
observe and act on web pages. The agent can see the page (semantic snapshot),
click buttons, fill forms, navigate, and manage tabs — all from Lua code.

Two runtime environments must be supported:

1. **Browser extension** (primary) — Agent runs in popup/side panel, operates on the active tab via injected content script
2. **Regular web page** (secondary) — Agent runs on the page itself (e.g. for testing, non-extension use cases)

## Architecture

```
                    BROWSER EXTENSION MODE
 ┌──────────────────────┐       chrome.tabs.sendMessage       ┌───────────────────────┐
 │  Popup / Side Panel  │ ──────────────────────────────────► │  Content Script       │
 │                      │                                      │  (in target tab)      │
 │  Lua:                │                                      │                       │
 │   page.snapshot()  ──┼── relay via worker+main thread ────► │  Agent WASM instance  │
 │   page.click("e5") ──┼── relay via worker+main thread ────► │  agent.click("e5")    │
 │   page.fill(...)   ──┼── relay via worker+main thread ────► │  agent.fill(...)      │
 │                      │  ◄──── result flows back ──────────── │                       │
 └──────────────────────┘                                      └───────────────────────┘

                    REGULAR WEB PAGE MODE
 ┌──────────────────────────────────────────────────────────┐
 │  Web Page                                                │
 │                                                          │
 │  Lua runs in Worker → relay to main thread → Agent WASM  │
 │  operates on the SAME page's DOM (no content script)     │
 └──────────────────────────────────────────────────────────┘
```

## Repository Changes

### `/Users/oujunyi/code/dom-snapshot/` (dom-snapshot repo)

Add a new workspace crate `dom-agent` alongside the existing `dom-semantic-tree`:

```
/Users/oujunyi/code/dom-snapshot/
├── Cargo.toml                          # workspace: add "crates/dom-agent"
├── crates/
│   ├── dom-semantic-tree/              # UNCHANGED — pure observation
│   │   └── src/
│   │       ├── collect.rs
│   │       ├── model.rs
│   │       ├── format.rs
│   │       ├── role.rs
│   │       ├── name.rs
│   │       ├── state.rs
│   │       ├── visibility.rs
│   │       ├── geometry.rs
│   │       ├── refs.rs
│   │       └── lib.rs
│   │
│   └── dom-agent/                      # NEW — agent runtime
│       ├── Cargo.toml
│       └── src/
│           ├── lib.rs                  # wasm_bindgen exports
│           ├── agent.rs                # Agent struct (ref_id→element map + snapshot + actions)
│           └── actions.rs              # DOM action implementations (click, fill, press, ...)
```

**Why in dom-snapshot repo?**
- `dom-agent` depends tightly on `dom-semantic-tree` (same ref_id scheme, same model types)
- Single repo = single version = no version drift
- Anyone who wants the agent runtime also needs the snapshot logic

### `~/code/web-lua/` (this project)

```
~/code/web-lua/
├── Cargo.toml                          # add dom-agent as git dependency
├── crates/
│   └── dom-snapshot-wasm/              # UPDATE — switch from dom-semantic-tree to dom-agent
├── web/
│   ├── public/
│   │   ├── manifest.json               # UPDATE — add content_scripts entry
│   │   └── content-agent.js            # NEW — content script glue (loads Agent WASM)
│   ├── src/
│   │   ├── hooks/useKernel.ts          # UPDATE — add page.* action handlers
│   │   └── worker.ts                   # UPDATE — handle page_* async commands
│   └── tests/
│       └── e2e/
│           └── page-agent.spec.ts      # NEW — integration tests
```

---

## API Specification

### Lua API — `page.*` module

All actions target the **active tab** in extension mode, or the **current page** in web mode.

#### Observation

| API | Return | Description |
|-----|--------|-------------|
| `page.snapshot(opts?)` | `{ data: table, text: string }` | Semantic snapshot of the page. `data` is the full tree, `text` is compact representation for LLM context |
| `page.url()` | `string` | Current page URL |
| `page.title()` | `string` | Current page title |
| `page.screenshot()` | `string` | Base64 PNG screenshot of the visible viewport |

`opts` is an optional table with the same fields as `CollectOptions`:
```lua
page.snapshot({
    include_hidden = false,
    interactive_only = true,
    include_non_interactive = false,
    include_geometry = true,
    include_path = true,
    max_nodes = 1000,
    max_text_length = 120,
})
```

#### Element Actions (target by ref_id from snapshot)

| API | Params | Return | Description |
|-----|--------|--------|-------------|
| `page.click(ref)` | `ref: string` | `true` | Click element. Dispatches full event chain: mouseover→mousedown→mouseup→click |
| `page.dblclick(ref)` | `ref: string` | `true` | Double-click element |
| `page.fill(ref, value)` | `ref: string, value: string` | `true` | Clear input and type new value. Dispatches focus→input→change→blur events so React/Vue detect the change |
| `page.type(ref, text)` | `ref: string, text: string` | `true` | Append text to existing value (does NOT clear first) |
| `page.press(key)` | `key: string` | `true` | Press a keyboard key globally (not on a specific element). Key names: `Enter`, `Tab`, `Escape`, `Backspace`, `Delete`, `ArrowDown`, `ArrowUp`, `ArrowLeft`, `ArrowRight`, `Home`, `End`, `PageDown`, `PageUp`, ` ` (space), or a single character |
| `page.select(ref, value)` | `ref: string, value: string` | `true` | Select option in a `<select>` dropdown by value or visible text |
| `page.check(ref, checked?)` | `ref: string, checked?: bool` | `true` | Set checkbox/radio state. `checked` defaults to `true`. Dispatches input→change events |
| `page.hover(ref)` | `ref: string` | `true` | Hover over element (dispatches mouseover→mouseenter→mousemove). Useful for revealing dropdown menus, tooltips |
| `page.unhover()` | — | `true` | Move mouse out (dispatches mouseout→mouseleave on last hovered element) |

#### Navigation

| API | Params | Return | Description |
|-----|--------|--------|-------------|
| `page.goto(url)` | `url: string` | `true` | Navigate to URL. In extension mode, navigates the active tab. In web mode, sets `window.location.href` |
| `page.back()` | — | `true` | Browser back |
| `page.forward()` | — | `true` | Browser forward |
| `page.reload()` | — | `true` | Reload current page |
| `page.wait(ms)` | `ms: number` | `true` | Wait for a specified duration in milliseconds |

#### Scrolling

| API | Params | Return | Description |
|-----|--------|--------|-------------|
| `page.scroll(direction, amount)` | `direction: string, amount: number` | `true` | Scroll the page. Direction: `"up"` or `"down"`. Amount: number of pixels (e.g., `page.scroll("down", 500)`) |
| `page.scroll_to(ref)` | `ref: string` | `true` | Scroll a specific element into view. Uses `scrollIntoView({ block: "center" })` |

#### Tab Management (extension mode only)

| API | Params | Return | Description |
|-----|--------|--------|-------------|
| `page.tabs()` | — | `table` | List all open tabs: `{{id=1, url="...", title="...", active=true}, ...}` |
| `page.switch(tabId)` | `tabId: number` | `true` | Switch to (activate) a specific tab |
| `page.new_tab(url?)` | `url?: string` | `table` | Open new tab, optionally with URL. Returns `{id=..., url=..., title=...}` |
| `page.close(tabId)` | `tabId: number` | `true` | Close a tab |
| `page.active_tab()` | — | `table` | Get the currently active tab info |

---

## Error Handling

All `page.*` actions return a result through the async relay. Errors are structured:

```lua
-- Success
local ok, result = pcall(page.click, "e5")
-- ok = true, result = true

-- Element not found (ref_id doesn't exist)
local ok, err = pcall(page.click, "e99")
-- ok = false, err = "Element not found: e99"

-- Element gone stale (was in DOM during snapshot but removed since)
local ok, err = pcall(page.click, "e5")
-- ok = false, err = "Element stale: e5 — run page.snapshot() to refresh"

-- Element not interactable (covered, disabled, hidden)
local ok, err = pcall(page.click, "e5")
-- ok = false, err = "Element not interactable: e5 is disabled"

-- No active tab (extension mode)
local ok, err = pcall(page.snapshot)
-- ok = false, err = "No active tab"
```

Error codes for programmatic handling:

| Code | Category | Meaning |
|------|----------|---------|
| `E_NOT_FOUND` | `element` | ref_id not in the mapping table |
| `E_STALE` | `element` | Element was removed from DOM since last snapshot |
| `E_NOT_INTERACTABLE` | `element` | Element is disabled, hidden, or covered |
| `E_WRONG_TYPE` | `element` | Action doesn't match element type (e.g., fill on a button) |
| `E_NO_TAB` | `tab` | No active tab in extension mode |
| `E_NAVIGATION` | `navigation` | Navigation failed or timed out |
| `E_NO_EXTENSION` | `runtime` | Not running in extension context |
| `E_AGENT_NOT_READY` | `runtime` | Content script / Agent WASM not loaded yet |

---

## `dom-agent` Crate Design

### `Agent` struct

```rust
// /Users/oujunyi/code/dom-snapshot/crates/dom-agent/src/agent.rs

use std::collections::HashMap;
use web_sys::Element;

pub struct Agent {
    /// ref_id → DOM element mapping, populated by snapshot()
    elements: HashMap<String, Element>,
    /// Counter for generating ref_ids
    next_ref_id: usize,
}

impl Agent {
    pub fn new() -> Self;
    
    /// Observe: traverse DOM, produce snapshot, update element map
    /// Returns (TreeSnapshot, compact_text_string)
    pub fn snapshot(&mut self, options: &CollectOptions) -> Result<(JsValue, String), String>;
    
    /// Action: click an element
    pub fn click(&self, ref_id: &str) -> Result<(), AgentError>;
    
    /// Action: fill an input
    pub fn fill(&self, ref_id: &str, value: &str) -> Result<(), AgentError>;
    
    /// Action: type text (append)
    pub fn type_text(&self, ref_id: &str, text: &str) -> Result<(), AgentError>;
    
    /// Action: press a key
    pub fn press(&self, key: &str) -> Result<(), AgentError>;
    
    /// Action: select dropdown option
    pub fn select(&self, ref_id: &str, value: &str) -> Result<(), AgentError>;
    
    /// Action: set checkbox state
    pub fn check(&self, ref_id: &str, checked: bool) -> Result<(), AgentError>;
    
    /// Action: hover over element
    pub fn hover(&self, ref_id: &str) -> Result<(), AgentError>;
    
    /// Action: scroll the page
    pub fn scroll(&self, direction: &str, amount: f64) -> Result<(), AgentError>;
    
    /// Action: scroll element into view
    pub fn scroll_into_view(&self, ref_id: &str) -> Result<(), AgentError>;
    
    /// Check if a ref_id's element is still in the DOM
    pub fn is_alive(&self, ref_id: &str) -> bool;
    
    /// Clear all stored elements (force re-snapshot)
    pub fn clear(&mut self);
}
```

### `actions.rs` — DOM event dispatching

Each action function:
1. Retrieves the element from the mapping table
2. Checks `element.is_connected()` (staleness detection)
3. Validates the element type matches the action
4. Scrolls into view if needed
5. Dispatches the correct sequence of DOM events
6. Returns `Ok(())` or a structured error

Key implementation details:

**`fill()`** — Must trigger React/Vue change detection:
```rust
fn fill(element: &Element, value: &str) -> Result<(), AgentError> {
    // 1. Focus the element
    element.focus();
    
    // 2. Select all existing content (simulates user selecting all)
    dispatch_event(element, "select");
    
    // 3. Set the value via property setter
    //    Use Object.getOwnPropertyDescriptor to bypass React's synthetic setter
    //    if the native setter is overridden
    set_native_value(element, value);
    
    // 4. Dispatch input event (React onChange listens for this)
    dispatch_input_event(element);
    
    // 5. Dispatch change event (for native form validation)
    dispatch_event(element, "change");
    
    // 6. Blur
    dispatch_event(element, "blur");
    
    Ok(())
}
```

**`click()`** — Full mouse event chain:
```rust
fn click(element: &Element) -> Result<(), AgentError> {
    scroll_into_view(element);
    dispatch_mouse_event(element, "mouseover");
    dispatch_mouse_event(element, "mouseenter");
    dispatch_mouse_event(element, "mousemove");
    dispatch_mouse_event(element, "mousedown");
    dispatch_mouse_event(element, "mouseup");
    dispatch_mouse_event(element, "click");
    Ok(())
}
```

**`press()`** — Keyboard event chain:
```rust
fn press(key: &str) -> Result<(), AgentError> {
    let (key_val, code, key_code) = parse_key(key); // "Enter" → ("Enter", "Enter", 13)
    dispatch_keyboard_event("keydown", &key_val, &code, key_code);
    dispatch_keyboard_event("keypress", &key_val, &code, key_code);
    dispatch_keyboard_event("keyup", &key_val, &code, key_code);
    Ok(())
}
```

### `lib.rs` — wasm_bindgen exports

```rust
#[wasm_bindgen]
pub struct WasmAgent {
    inner: Agent,
}

#[wasm_bindgen]
impl WasmAgent {
    #[wasm_bindgen(constructor)]
    pub fn new() -> Self;
    
    pub fn snapshot(&mut self, options: JsValue) -> JsValue;
    pub fn click(&self, ref_id: &str) -> JsValue;
    pub fn dblclick(&self, ref_id: &str) -> JsValue;
    pub fn fill(&self, ref_id: &str, value: &str) -> JsValue;
    pub fn r#type(&self, ref_id: &str, text: &str) -> JsValue;
    pub fn press(&self, key: &str) -> JsValue;
    pub fn select(&self, ref_id: &str, value: &str) -> JsValue;
    pub fn check(&self, ref_id: &str, checked: bool) -> JsValue;
    pub fn hover(&self, ref_id: &str) -> JsValue;
    pub fn unhover(&self) -> JsValue;
    pub fn scroll(&self, direction: &str, amount: f64) -> JsValue;
    pub fn scroll_into_view(&self, ref_id: &str) -> JsValue;
    pub fn is_alive(&self, ref_id: &str) -> bool;
    pub fn clear(&mut self);
}
```

All action methods return a JsValue that is either `{ ok: true }` or `{ ok: false, error: { message, code, category } }`.

---

## Communication Flow — Extension Mode

### Step-by-step: `page.click("e5")`

```
  Lua VM (Worker)              Main Thread (Popup)           Content Script (Target Tab)
  ─────────────────            ──────────────────            ─────────────────────────
  page.click("e5")
       │
       ├─ yield async
       │  command:
       │  {action:"page_click",
       │   params:{refId:"e5"}}
       │
       ├──────────────────► handleAsyncRelay
                              │
                              ├─ get active tab
                              │
                              ├─ chrome.tabs.sendMessage(tabId, {type:"click", refId:"e5"})
                              │                               │
                              │                               ├─ agent.click("e5")
                              │                               │  ├─ lookup ref_id → element
                              │                               │  ├─ check is_connected()
                              │                               │  ├─ dispatch mouse events
                              │                               │  │
                              │                               │  └─ return {ok:true}
                              │                               │
                              ├◄──────────────────────────────┘
                              │
                              ├─ return {ok:true, value:true}
                              │
       ├◄─────────────────────┘
       │
  resume_cell({ok:true, value:true})
       │
  Lua receives: true
```

### Content Script — `/Users/oujunyi/code/web-lua/web/public/content-agent.js`

```javascript
// This file is declared in manifest.json as a content_script
// It loads the dom-agent WASM and listens for messages from the popup

import init, { WasmAgent } from './pkg-dom/dom_agent.js';

let agent = null;

async function ensureAgent() {
    if (agent) return agent;
    await init();
    agent = new WasmAgent();
    return agent;
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    ensureAgent().then(agent => {
        switch (message.type) {
            case 'snapshot':
                sendResponse(agent.snapshot(message.options || {}));
                break;
            case 'click':
                sendResponse(agent.click(message.refId));
                break;
            case 'fill':
                sendResponse(agent.fill(message.refId, message.value));
                break;
            case 'press':
                sendResponse(agent.press(message.key));
                break;
            case 'select':
                sendResponse(agent.select(message.refId, message.value));
                break;
            case 'check':
                sendResponse(agent.check(message.refId, message.checked ?? true));
                break;
            case 'hover':
                sendResponse(agent.hover(message.refId));
                break;
            case 'unhover':
                sendResponse(agent.unhover());
                break;
            case 'scroll':
                sendResponse(agent.scroll(message.direction, message.amount));
                break;
            case 'scroll_into_view':
                sendResponse(agent.scroll_into_view(message.refId));
                break;
            case 'url':
                sendResponse({ ok: true, value: window.location.href });
                break;
            case 'title':
                sendResponse({ ok: true, value: document.title });
                break;
            case 'screenshot':
                // Screenshot must be done in the popup via chrome.tabs.captureVisibleTab
                sendResponse({ ok: false, error: { message: 'Use page.screenshot() from popup', code: 'E_POPUP_ONLY' }});
                break;
            default:
                sendResponse({ ok: false, error: { message: `Unknown action: ${message.type}`, code: 'E_UNKNOWN' }});
        }
    }).catch(err => {
        sendResponse({ ok: false, error: { message: err.message, code: 'E_AGENT_ERROR' }});
    });
    return true; // keep channel open for async response
});
```

### Manifest changes

```json
{
  "content_scripts": [{
    "matches": ["<all_urls>"],
    "js": ["content-agent.js"],
    "run_at": "document_idle"
  }]
}
```

**Problem**: Content scripts declared in manifest can't use ES module imports.
**Solution**: Use `chrome.scripting.executeScript` to dynamically inject the content script
only when `page.*` API is first called. This also avoids loading WASM on every page.

The injection flow:
1. First `page.*` call → popup checks if content script is loaded in the active tab
2. If not, inject `content-agent.js` via `chrome.scripting.executeScript({ files: ["content-agent.js"] })`
3. Then send the message

### Communication Flow — Regular Web Mode (non-extension)

In web mode, no content script injection is needed. The Agent WASM is loaded
directly in the main thread (same as current `dom.snapshot()` approach):

```
Lua (Worker) → async relay → Main Thread → Agent WASM on same page's DOM → result back
```

The `useKernel.ts` handler detects the mode:
- Extension mode → inject content script + send message to tab
- Web mode → load Agent WASM in main thread + call directly

---

## Testing Plan

### Unit Tests — Rust (`dom-agent` crate)

Run with `cargo test -p dom-agent` (no browser needed, uses mocks).

| Test | What it verifies |
|------|-----------------|
| `test_agent_new` | Agent initializes with empty element map |
| `test_agent_snapshot_returns_nodes` | Snapshot produces nodes with ref_ids |
| `test_agent_snapshot_populates_elements` | After snapshot, element map has entries |
| `test_agent_click_not_found` | `click("nonexistent")` returns `E_NOT_FOUND` |
| `test_agent_fill_not_found` | `fill("nonexistent", "x")` returns `E_NOT_FOUND` |
| `test_agent_clear` | `clear()` empties the element map |
| `test_agent_is_alive` | `is_alive()` returns correct status |

### Integration Tests — Browser (WASM)

Run with `wasm-pack test --node` or Playwright.

| Test | What it verifies |
|------|-----------------|
| `snapshot_simple_page` | Snapshot a page with buttons, links, inputs |
| `click_button` | Click a button, verify click handler fired |
| `fill_input` | Fill an input, verify value changed |
| `fill_dispatches_events` | Fill triggers input+change events |
| `press_enter` | Press Enter key, verify keydown fired |
| `select_dropdown` | Select option, verify selection changed |
| `check_checkbox` | Toggle checkbox, verify state changed |
| `scroll_page` | Scroll down, verify scroll position changed |
| `stale_element` | Remove element from DOM, verify action returns `E_STALE` |
| `snapshot_after_dom_change` | Add element, re-snapshot, verify new element appears |

### E2E Tests — Playwright (in `web-lua`)

These test the full Lua → Worker → Main Thread → Content Script → WASM → DOM round-trip.

```typescript
// tests/e2e/page-agent.spec.ts
```

| # | Test | What it verifies |
|---|------|-----------------|
| 1 | `page.snapshot returns semantic tree` | Lua gets table with nodes and text |
| 2 | `page.snapshot text contains ref IDs` | Compact text has `[e1]`, `[e2]`, etc. |
| 3 | `page.click clicks a button` | Button click counter increments |
| 4 | `page.fill types into input` | Input value changes to filled text |
| 5 | `page.press sends key` | Enter key submits a form |
| 6 | `page.select picks dropdown option` | Select element shows chosen option |
| 7 | `page.check toggles checkbox` | Checkbox state changes |
| 8 | `page.scroll scrolls viewport` | Page scrolls down |
| 9 | `page.scroll_to scrolls to element` | Target element becomes visible |
| 10 | `page.hover reveals tooltip` | Hovering shows hidden tooltip |
| 11 | `page.url returns current URL` | Correct URL string |
| 12 | `page.title returns page title` | Correct title string |
| 13 | `page.goto navigates` | Page navigates to new URL |
| 14 | `page.tabs lists open tabs` | Returns array of tab objects (extension mode) |
| 15 | `page.switch changes active tab` | Focus switches to specified tab |
| 16 | `page.new_tab opens tab` | New tab appears |
| 17 | `page.close closes tab` | Tab is removed |
| 18 | `stale element returns error` | After DOM change, stale ref_id gives `E_STALE` |
| 19 | `snapshot after action reflects change` | After fill, new snapshot shows updated value |
| 20 | `page.snapshot with options` | `max_nodes`, `interactive_only` work correctly |

### Test Setup

For Playwright E2E tests, we need a **test page** served by the dev server that the agent interacts with:

```
web/public/test-page.html    ← simple page with buttons, inputs, dropdowns, etc.
```

The test page contains elements like:
- A counter button (to verify clicks)
- Text input with displayed value (to verify fill)
- `<select>` dropdown (to verify select)
- Checkbox (to verify check)
- Hidden tooltip that appears on hover (to verify hover)
- Scrollable content (to verify scroll)

Test flow:
1. Launch browser with extension loaded
2. Open test page in a tab
3. Run Lua code in popup that operates on the test page tab
4. Verify the test page's DOM changed as expected

---

## Implementation Order

### Phase 1: `dom-agent` crate foundation
**In `/Users/oujunyi/code/dom-snapshot/`**

1. Create `crates/dom-agent/Cargo.toml` with deps on `dom-semantic-tree`, `wasm-bindgen`, `web-sys`
2. Create `crates/dom-agent/src/lib.rs` with `WasmAgent` struct
3. Create `crates/dom-agent/src/agent.rs` with `Agent` struct and element map
4. Implement `snapshot()` — reuses `dom-semantic-tree::collect` but also stores elements
5. Implement staleness check (`is_alive`, `is_connected`)
6. Write Rust unit tests
7. Build with `wasm-pack build --target bundler`

### Phase 2: Element actions
**In `/Users/oujunyi/code/dom-snapshot/`**

8. Create `crates/dom-agent/src/actions.rs`
9. Implement `click()` — mouse event chain
10. Implement `fill()` — focus, clear, set value, dispatch input/change/blur
11. Implement `press()` — keyboard event chain
12. Implement `select()` — dropdown handling
13. Implement `check()` — checkbox/radio toggle
14. Implement `hover()` / `unhover()` — mouse move events
15. Implement `scroll()` / `scroll_into_view()` — scrolling
16. Implement `dblclick()` — double click event chain
17. Implement `type()` — append text without clearing
18. Write WASM integration tests
19. Build and verify WASM output

### Phase 3: `web-lua` integration
**In `~/code/web-lua/`**

20. Update `Cargo.toml` — add `dom-agent` git dependency
21. Update `crates/dom-snapshot-wasm/` — switch to re-exporting from `dom-agent`
22. Add `page.*` Lua module to `crates/piccolo-notebook-core/src/lib.rs`
23. Add `page_*` async command handlers in `web/src/worker.ts`
24. Add `page.*` action handlers in `web/src/hooks/useKernel.ts`:
    - Extension mode: inject content script + `chrome.tabs.sendMessage`
    - Web mode: call Agent WASM directly in main thread
25. Create `web/public/content-agent.js` — content script glue
26. Update `web/public/manifest.json` — add `scripting` permissions (already have)
27. Update `scripts/build-extension.sh` — build dom-agent WASM
28. Add `page.*` to CodeMirror autocomplete

### Phase 4: Testing
**In `~/code/web-lua/`**

29. Create test page `web/public/test-page.html`
30. Write Playwright E2E tests `web/tests/e2e/page-agent.spec.ts`
31. Test in extension mode (Chromium with extension loaded)
32. Test in web mode (regular browser session)
33. Verify all error paths (stale element, not found, not interactable)

### Phase 5: Polish
**Both repos**

34. Clean up console.log debug statements
35. Update README in dom-snapshot repo
36. Update `extension_api_goal.md` in web-lua repo
37. Verify build from clean clone works (reproducibility check)

---

## Non-Goals (for this iteration)

- **Screenshot capture in content script** — Must use `chrome.tabs.captureVisibleTab()` from popup
- **File upload** — Requires file picker interaction, complex to automate
- **Drag and drop** — Complex event chain, rarely needed for form-based workflows
- **iFrame support** — Cross-origin restrictions make this complex
- **Multi-tab coordination** — Agent operates on one tab at a time
- **Network interception** — Use `chrome.webRequest` separately if needed
- **Visual OCR** — Screenshot is provided as base64, OCR is the LLM's job

---

## Dependencies

### `crates/dom-agent/Cargo.toml`

```toml
[package]
name = "dom-agent"
version.workspace = true
edition.workspace = true

[lib]
crate-type = ["cdylib", "rlib"]

[dependencies]
dom-semantic-tree = { path = "../dom-semantic-tree" }
wasm-bindgen = "0.2"
serde = { version = "1", features = ["derive"] }
serde_json = "1"
serde-wasm-bindgen = "0.6"
js-sys = "0.3"

[dependencies.web-sys]
version = "0.3"
features = [
    "console",
    "Document",
    "Element",
    "HtmlElement",
    "HtmlInputElement",
    "HtmlTextAreaElement",
    "HtmlSelectElement",
    "HtmlOptionElement",
    "HtmlButtonElement",
    "HtmlAnchorElement",
    "Node",
    "Window",
    "DomRect",
    "Event",
    "EventInit",
    "MouseEvent",
    "MouseEventInit",
    "KeyboardEvent",
    "KeyboardEventInit",
    "InputEvent",
    "InputEventInit",
    "EventTarget",
    "CssStyleDeclaration",
    "HtmlCollection",
    "NodeList",
    "CharacterData",
]

[dev-dependencies]
wasm-bindgen-test = "0.3"
```

### `~/code/web-lua/Cargo.toml` change

```toml
[workspace.dependencies]
# ... existing deps ...
dom-agent = { git = "https://github.com/Irvingouj/dom-semantic-tree.git" }
```
