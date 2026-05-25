# @pi-oxide/extension-lua

Self-contained WebAssembly Lua runtime for Chrome extensions.

## Installation

```bash
npm install @pi-oxide/extension-lua
```

## Usage

```typescript
import { ExtensionSession } from "@pi-oxide/extension-lua";

const [vm, runner] = await ExtensionSession.init();

const result = await vm.runCellAsync(`
  local tabs = tab.query({})
  print(#tabs .. " tabs open")
  tab.click(tabs[1].id, "submit-button")
`, "");

console.log(result.stdout);

await vm.stopWith(runner);
```

## API

- `ExtensionSession.init()` — Returns `[ExtensionSession, Promise<void>]`. Automatically spawns the Web Worker and starts the main-thread runner.
- `vm.runCellAsync(code, stdin?)` — Execute Lua code. Returns `LuaRunResult`.
- `vm.reset()` — Clear all Lua state.
- `vm.stopWith(runner)` — Clean up: abort in-flight operations, remove Chrome listeners, terminate Worker, release resources.
- `vm.inspectGlobals()` — Inspect all global variables.
- `vm.setFuelLimit(limit)` — Set execution fuel limit.
- `vm.loadLibrary(source)` — Load a Lua library.

## Lua APIs available in extension environment

- `tab.*` — Browser tab operations: `tab.open`, `tab.close`, `tab.current`, `tab.focus`, `tab.click`, `tab.fill`, `tab.snapshot`, `tab.evaluate`, `tab.fetch`
- `chrome.*` — Chrome Extension APIs: `chrome.tabs`, `chrome.cookies`, `chrome.bookmarks`, `chrome.history`, `chrome.notifications`, etc.
- `runtime.*` — Extension runtime: `runtime.fetch` (extension origin)
- `page.*` — Side panel / popup self-environment
- `sleep(ms)`
- `host.call(action, params)` — Optional extension point

## Important Gotchas for Extension Developers

### 1. Manifest is not drop-in

The `manifest.json` included in this package is an **example**, not a drop-in configuration. You must merge the following into your own extension manifest:

- `permissions` (see list below)
- `host_permissions`
- `content_scripts` (for content-script injection)
- `content_security_policy`
- `web_accessible_resources`

**Required permissions:**
```json
[
  "tabs",
  "activeTab",
  "scripting",
  "clipboardRead",
  "clipboardWrite"
]
```

**Required CSP directives:**
```
script-src 'self' 'wasm-unsafe-eval'; object-src 'self'; connect-src *;
```

- `'wasm-unsafe-eval'` is mandatory — without it Chrome blocks WebAssembly instantiation.
- `connect-src *` (or specific hosts) is required for `fetch` to work from the popup/side panel.

### 2. Worker bundling requirement

`ExtensionSession` spawns a module Worker via:
```ts
new Worker(new URL("./worker.ts", import.meta.url), { type: "module" })
```

Your bundler **must** support module Workers and emit them as separate chunks. If the bundler inlines or mishandles the Worker, it will fail to load at runtime with a silent error.

### 3. `page.*` vs `tab.*` semantics

| Namespace | Operates on | Use when |
|-----------|-------------|----------|
| `page.*` | The extension popup / side panel DOM | You want to interact with your own extension UI |
| `tab.*` | The active browser tab (via content script) | You want to interact with the web page |

This is a common source of confusion. `page.click("btn-1")` clicks a button **inside your extension popup**, not on the active tab. To interact with the active tab, use `tab.click(tabId, "btn-1")`.

### 4. Content script must be registered

All `tab.*` APIs require the content script (`content-script.js`) to be injected into the target tab. Ensure your manifest includes:

```json
"content_scripts": [
  {
    "matches": ["<all_urls>"],
    "js": ["content-script.js"],
    "run_at": "document_start"
  }
]
```

Without this, `tab.click`, `tab.fill`, `tab.snapshot`, etc. will fail with "Receiving end does not exist".

### 5. Three fetch variants have different origins

| API | Execution context | Subject to |
|-----|-------------------|------------|
| `page.fetch` | Extension popup | Extension CSP (`connect-src`) |
| `tab.fetch` | Target tab's content script | Target page's CSP and CORS |
| `runtime.fetch` | Extension service worker | Extension CSP |

They do not share cookies or credentials. Choose the variant that matches your needs.

### 6. `web.storage` maps to `localStorage`

In the extension environment, `web.storage.get` / `web.storage.set` use the popup page's `localStorage`, not `chrome.storage.local`. Data is scoped to the extension page origin and may be lost when the popup closes. For persistent cross-session storage, use `chrome.storage` directly.

### 7. Clipboard APIs require focus

`clipboard.readText()` only works when the extension page (popup or side panel) has focus. Calling it from a background script or an unfocused panel will fail even with `clipboardRead` permission.

### 8. Error format is unified

All APIs return the same flat error shape:
```ts
{ ok: false, error: { message: string, code: string } }
```

This includes content-script relayed APIs (`tab.click`, `tab.fill`, etc.) which are internally flattened so Lua consumers do not need dual error-handling logic.

### 9. `stopWith` has a 50ms grace period

`stopWith` sends a reset message to the Worker, waits 50ms, then forcefully terminates it. If WASM cleanup takes longer, the Worker is killed mid-operation. Do not rely on `stopWith` for graceful persistence of in-flight side effects.

### 10. Abort signal is global per module

The runner uses a module-level abort controller. If you create multiple concurrent `ExtensionSession`s, the second session's `stopWith` will overwrite the first session's abort controller. **Only one active session per extension page is fully safe.**

### 11. MV3 + Chrome only

This package assumes Chrome Manifest V3 APIs (`chrome.scripting.executeScript`, `chrome.sidePanel`, etc.). It will not work in Firefox or Safari without substantial rewriting.

### 12. Broad permissions trigger store review

Using `host_permissions: ["<all_urls>"]` with `content_scripts.matches: ["<all_urls>"]` is a sensitive combination that often triggers manual review in the Chrome Web Store. Consider narrowing to specific domains if possible.

## License

LicenseRef-PiccoloNotebook-Fair-BYOK-1.0
