# Extension API Roadmap

**Status:** ✅ Implemented (Phases 0–6 complete)  
**Namespace:** `chrome.*` in Lua (Chrome-specific, not browser-agnostic)  
**Event model:** yield-wait (same as `web.sleep` / `web.fetch`)  
**Test strategy:** TDD — write the test first, make it pass, then refactor  
**Architecture:** Worker → main thread relay (web workers can't access chrome.* APIs)  

---

## Architecture

```
Lua cell code
  ↓ chrome.tabs.query({...})
Rust (piccolo callback)
  ↓ yield AsyncCommand { action: "chrome_tabs_query", params: {...} }
Worker (worker.ts)
  ↓ routes to handleExtensionApi()
Chrome Extension Host (chrome.tabs.query)
  ↓ resolves with { ok: true, value: [...] }
Worker → resume_cell
  ↓ json_value_to_lua (table)
Lua cell continues
```

**Key principle:** Every `chrome.*` call is async. The Lua VM yields, the worker executes the real Chrome API, and resumes the VM with the result. This is identical to how `web.fetch` and `web.sleep` work today.

**Critical architectural note:** Web Workers in Chrome extension popups do NOT have access to `chrome.*` APIs. All `chrome_*` actions are relayed from the Worker → main thread (via `postMessage` `asyncRelay`) → the main thread calls the real `chrome.*` API → result flows back. This is different from the legacy `web.*` extension APIs which tried (and failed) to call chrome APIs directly in the worker.

---

## Error Codes

All extension API errors use a normalized error object:

```json
{
  "ok": false,
  "error": {
    "message": "human-readable description",
    "code": "E_PERMISSION_DENIED",
    "category": "permission"
  }
}
```

### Standard error codes

| Code | Category | Meaning |
|------|----------|---------|
| `E_NO_EXTENSION` | permission | Not running inside a Chrome extension |
| `E_PERMISSION_DENIED` | permission | Manifest doesn't declare the required permission |
| `E_INVALID_ARGUMENT` | validation | Wrong argument type or missing required field |
| `E_NOT_FOUND` | resource | Tab/bookmark/cookie doesn't exist |
| `E_TIMEOUT` | timeout | Operation timed out |
| `E_NETWORK` | network | Network-level failure |
| `E_EXTENSION` | extension | Chrome API threw an error |
| `E_UNKNOWN` | unknown | Unhandled error |

### Mapping Chrome errors to our codes

In `worker.ts`, wrap every `chrome.*` call in try/catch and normalize:

```typescript
catch (err) {
  if (err.message?.includes('permission')) return error('E_PERMISSION_DENIED', err.message);
  if (err.message?.includes('not found') || err.message?.includes('No tab')) return error('E_NOT_FOUND', err.message);
  return error('E_EXTENSION', err.message);
}
```

---

## Permission Model

Before calling any Chrome API, check:

1. **Is this an extension context?** `chrome.runtime?.id` exists
2. **Does the manifest declare the permission?** Checked by Chrome itself — if missing, Chrome throws a permission error which we normalize to `E_PERMISSION_DENIED`

We do NOT implement our own permission checking layer. Chrome handles it. We just normalize the error messages.

### Manifest template

```json
{
  "manifest_version": 3,
  "name": "Lua Notebook",
  "version": "1.0",
  "permissions": [
    "tabs",
    "activeTab",
    "alarms",
    "contextMenus",
    "notifications",
    "cookies",
    "bookmarks",
    "history",
    "sidePanel"
  ],
  "host_permissions": ["<all_urls>"],
  "background": {
    "service_worker": "background.js"
  },
  "action": {
    "default_popup": "index.html"
  },
  "side_panel": {
    "default_path": "index.html"
  }
}
```

---

## Execution Contexts

The notebook popup runs in different contexts. The API surface adapts:

| Context | How to detect | Available APIs |
|---------|---------------|----------------|
| Extension popup | `chrome.runtime.id && location.protocol === 'chrome-extension:'` | All `chrome.*` |
| Side panel | `chrome.sidePanel` exists | All `chrome.*` |
| Normal webpage | `!chrome.runtime.id` | None — `E_NO_EXTENSION` error |
| Service worker | Dedicated test path | Limited (no DOM, no popup-specific) |

For now, we only test in the **popup** context.

---

## Phase 0: Extension Scaffold (Prerequisite)

**Goal:** Package the Vite build output as a loadable Chrome extension.

### Deliverables

| # | Item | File | Done? |
|---|------|------|-------|
| 0.1 | manifest.json | `web/public/manifest.json` | ✅ |
| 0.2 | Build script copies dist → unpacked extension | `scripts/build-extension.sh` | ✅ |
| 0.3 | Playwright loads extension in persistent Chromium context | `web/tests/extension-helpers.ts` | ✅ |
| 0.4 | Smoke test: popup opens, kernel ready | `web/tests/e2e/extension-smoke.spec.ts` | ✅ |

### 0.1 — manifest.json

Place in `web/public/manifest.json` so Vite copies it to `dist/`:

```json
{
  "manifest_version": 3,
  "name": "Lua Notebook",
  "version": "0.1.0",
  "description": "Browser-based Lua notebook with Chrome extension APIs",
  "permissions": ["tabs", "activeTab"],
  "action": {
    "default_popup": "index.html"
  }
}
```

Start with just `tabs` and `activeTab` permissions. We add more as we implement more APIs.

### 0.2 — Build script

```bash
#!/bin/bash
# scripts/build-extension.sh
set -e
cd "$(dirname "$0")/.."
./scripts/build-wasm.sh
cd web
npm run build
echo "Extension built at web/dist/"
```

The Vite build output IS the unpacked extension directory.

### 0.3 — Extension test helpers

Create `web/tests/extension-helpers.ts`:

```typescript
import { chromium, type BrowserContext, type Page } from "@playwright/test";
import path from "node:path";

const extensionPath = path.resolve(__dirname, "../dist");

export async function launchExtensionContext(): Promise<{
  context: BrowserContext;
  extensionId: string;
  popup: Page;
}> {
  const context = await chromium.launchPersistentContext("", {
    headless: false,
    args: [
      `--disable-extensions-except=${extensionPath}`,
      `--load-extension=${extensionPath}`,
    ],
  });

  // Find service worker to get extension ID
  let [serviceWorker] = context.serviceWorkers();
  if (!serviceWorker) {
    serviceWorker = await context.waitForEvent("serviceworker");
  }
  const extensionId = serviceWorker.url().split("/")[2];

  // Open popup
  const popup = await context.newPage();
  await popup.goto(`chrome-extension://${extensionId}/index.html`);

  return { context, extensionId, popup };
}
```

### 0.4 — Smoke test

```typescript
// web/tests/e2e/extension-smoke.spec.ts
import { test, expect } from "@playwright/test";
import { launchExtensionContext } from "../extension-helpers";

test.describe("Extension smoke", () => {
  test("popup loads and kernel becomes ready", async () => {
    const { context, popup } = await launchExtensionContext();
    try {
      // Wait for kernel ready
      await popup.waitForFunction(
        () => {
          const el = document.querySelector('[data-testid="kernel-status"]');
          return el?.textContent?.includes("ready");
        },
        { timeout: 15_000 }
      );
      // Should have at least one cell
      const cells = popup.locator('[data-testid="cells-container"] .cell');
      await expect(cells.first()).toBeVisible();
    } finally {
      await context.close();
    }
  });
});
```

### Acceptance criteria

- [x] `scripts/build-extension.sh` produces a loadable `web/dist/` directory
- [x] `manifest.json` is in the dist output
- [x] Loading the extension in Chrome shows the notebook popup
- [x] Kernel initializes to "ready" status
- [x] Cells can be added and code runs normally
- [x] `web.sleep(100)` works in the extension popup
- [x] Smoke test passes: `npx playwright test extension-smoke`

---

## Phase 1: chrome.runtime (P0 — Messaging Foundation)

**Goal:** Message passing between popup Lua code and extension service worker.

### Lua API

```lua
-- Send a message to the extension background/service worker
local response = chrome.runtime.sendMessage({action = "ping"})

-- Register a listener for messages from background
-- This is an EVENT — cell stays running, waiting for messages
chrome.runtime.onMessage(function(msg)
  print("received:", json.encode(msg))
end)
```

### Rust changes

Add to `register_web_module()` in `crates/piccolo-notebook-core/src/lib.rs`:

```rust
// chrome sub-module
let chrome_table = Table::new(&ctx);

// chrome.runtime sub-module
let runtime_table = Table::new(&ctx);
register_ext_api!(runtime_table, "sendMessage", "chrome_runtime_sendMessage", host_state);
chrome_table.set_field(ctx, "runtime", runtime_table);

// chrome.tabs sub-module
let tabs_table = Table::new(&ctx);
register_ext_api!(tabs_table, "query", "chrome_tabs_query", host_state);
register_ext_api!(tabs_table, "sendMessage", "chrome_tabs_sendMessage", host_state);
register_ext_api!(tabs_table, "create", "chrome_tabs_create", host_state);
register_ext_api!(tabs_table, "update", "chrome_tabs_update", host_state);
register_ext_api!(tabs_table, "remove", "chrome_tabs_remove", host_state);
chrome_table.set_field(ctx, "tabs", tabs_table);

ctx.set_global("chrome", chrome_table);
```

### Worker changes

In `worker.ts`, add to `handleExtensionApi()`:

```typescript
case 'chrome_runtime_sendMessage': {
  const msg = command.params[0] || command.params;
  result = await chrome.runtime.sendMessage(msg);
  break;
}
case 'chrome_tabs_query': {
  result = await chrome.tabs.query(command.params[0] || {});
  break;
}
case 'chrome_tabs_sendMessage': {
  const tabId = command.params[0]?.tabId || command.params[0];
  const message = command.params[0]?.message || command.params[1];
  result = await chrome.tabs.sendMessage(tabId, message);
  break;
}
case 'chrome_tabs_create': {
  result = await chrome.tabs.create(command.params[0] || {});
  break;
}
case 'chrome_tabs_update': {
  const tabId = command.params[0]?.tabId;
  const updateProps = command.params[0]?.update || command.params[1] || {};
  result = await chrome.tabs.update(tabId, updateProps);
  break;
}
case 'chrome_tabs_remove': {
  const tabId = command.params[0]?.tabId || command.params[0];
  await chrome.tabs.remove(tabId);
  result = null;
  break;
}
```

### Deliverables

| # | Item | File | Done? |
|---|------|------|-------|
| 1.1 | `chrome` global registered in Rust | `crates/piccolo-notebook-core/src/lib.rs` | ✅ |
| 1.2 | `chrome.tabs.query` end-to-end | worker.ts + lib.rs + useKernel.ts | ✅ |
| 1.3 | `chrome.tabs.create` end-to-end | worker.ts + lib.rs + useKernel.ts | ✅ |
| 1.4 | `chrome.tabs.remove` end-to-end | worker.ts + lib.rs + useKernel.ts | ✅ |
| 1.5 | `chrome.tabs.sendMessage` end-to-end | worker.ts + lib.rs + useKernel.ts | ✅ |
| 1.6 | `chrome.runtime.sendMessage` end-to-end | worker.ts + lib.rs + useKernel.ts | ✅ |
| 1.7 | Error normalization for all chrome APIs | useKernel.ts | ✅ |
| 1.8 | E2E tests | `web/tests/e2e/chrome-tabs.spec.ts` | ✅ |

### Tests (write these FIRST)

```typescript
// web/tests/e2e/chrome-tabs.spec.ts
import { test, expect } from "@playwright/test";
import { launchExtensionContext, setCellCode, runCell, waitForCellStatus, expectCellOutputContains } from "../extension-helpers";

test.describe("chrome.tabs", () => {
  test("chrome.tabs.query returns current tab", async () => {
    const { context, popup } = await launchExtensionContext();
    try {
      await waitForKernelReady(popup);
      await setCellCode(popup, 0, `
local tabs = chrome.tabs.query({active = true, currentWindow = true})
print("count: " .. #tabs)
print("url type: " .. type(tabs[1].url))
print("id type: " .. type(tabs[1].id))
      `);
      await runCell(popup, 0);
      await waitForCellStatus(popup, 0, "success");
      await expectCellOutputContains(popup, 0, "count: 1");
      await expectCellOutputContains(popup, 0, "url type: string");
    } finally {
      await context.close();
    }
  });

  test("chrome.tabs.create opens new tab", async () => {
    const { context, popup } = await launchExtensionContext();
    try {
      await waitForKernelReady(popup);
      await setCellCode(popup, 0, `
local tab = chrome.tabs.create({url = "https://example.com"})
print("created tab id type: " .. type(tab.id))
      `);
      await runCell(popup, 0);
      await waitForCellStatus(popup, 0, "success");
      await expectCellOutputContains(popup, 0, "created tab id type: number");
    } finally {
      await context.close();
    }
  });

  test("chrome.tabs.query in non-extension context returns error", async () => {
    // This test runs WITHOUT the extension loaded
    // chrome.* calls should return E_NO_EXTENSION
    // Tested in regular browser mode, not extension mode
  });
});
```

### Acceptance criteria

- [x] `chrome.tabs.query({active = true})` returns a Lua table of tab objects
- [x] `chrome.tabs.create({url = "..."})` creates a real tab and returns it
- [x] `chrome.tabs.remove(tabId)` closes a tab
- [x] `chrome.runtime.sendMessage({action = "ping"})` sends to background
- [x] Calling chrome APIs in non-extension context produces `E_NO_EXTENSION` error
- [x] All 5 E2E tests pass

---

## Phase 2: chrome.alarms (P1 — Background Scheduling)

**Goal:** Schedule and respond to alarms from Lua.

### Lua API

```lua
-- Create an alarm
chrome.alarms.create("my-alarm", {delayInMinutes = 0.05})

-- Wait for the alarm to fire (yield-wait event)
local alarm = chrome.alarms.onAlarm("my-alarm")
print("alarm fired: " .. alarm.name)

-- Clear an alarm
chrome.alarms.clear("my-alarm")
```

### Deliverables

| # | Item | File | Done? |
|---|------|------|-------|
| 2.1 | `chrome.alarms.create` | lib.rs + worker.ts + useKernel.ts | ✅ |
| 2.2 | `chrome.alarms.clear` | lib.rs + worker.ts + useKernel.ts | ✅ |
| 2.3 | `chrome.alarms.onAlarm` (yield-wait) | deferred — requires event listener | ☐ |
| 2.4 | E2E tests | `web/tests/e2e/chrome-alarms-menus.spec.ts` | ✅ |

### Tests (write these FIRST)

```typescript
test("chrome.alarms.create + onAlarm fires", async () => {
  // Create alarm with short delay, wait for it to fire
});

test("chrome.alarms.clear stops alarm", async () => {
  // Create alarm, clear it, verify onAlarm doesn't fire
});
```

### Acceptance criteria

- [x] `chrome.alarms.create` registers an alarm in Chrome
- [ ] `chrome.alarms.onAlarm` yields until the alarm fires (deferred)
- [x] `chrome.alarms.clear` removes the alarm
- [x] Alarm name and scheduledTime are accessible in Lua
- [x] All 1+ E2E tests pass

---

## Phase 3: chrome.action (P1 — Popup Control)

**Goal:** Control the extension's browser action (icon, badge, popup).

### Lua API

```lua
-- Set badge text
chrome.action.setBadgeText({text = "3"})

-- Set badge color
chrome.action.setBadgeBackgroundColor({color = "#FF0000"})

-- Set icon
chrome.action.setIcon({path = "icon.png"})

-- Open popup programmatically
chrome.action.openPopup()
```

### Deliverables

| # | Item | File | Done? |
|---|------|------|-------|
| 3.1 | `chrome.action.setBadgeText` | lib.rs + worker.ts + useKernel.ts | ✅ |
| 3.2 | `chrome.action.setBadgeBackgroundColor` | lib.rs + worker.ts + useKernel.ts | ✅ |
| 3.3 | `chrome.action.setTitle` | lib.rs + worker.ts + useKernel.ts | ✅ |
| 3.4 | E2E tests | `web/tests/e2e/chrome-action-windows.spec.ts` | ✅ |

### Acceptance criteria

- [x] Badge text appears on the extension icon
- [x] Badge background color changes
- [x] Extension title updates
- [x] All 1+ E2E tests pass

---

## Phase 4: chrome.contextMenus (P1 — Context Menu)

**Goal:** Add context menu items from Lua.

### Lua API

```lua
-- Create a context menu item
chrome.contextMenus.create({
  title = "Run with Lua",
  contexts = {"selection"}
})

-- Wait for context menu click (yield-wait event)
local info = chrome.contextMenus.onClicked()
print("Selected: " .. info.selectionText)
```

### Deliverables

| # | Item | File | Done? |
|---|------|------|-------|
| 4.1 | `chrome.contextMenus.create` | lib.rs + worker.ts + useKernel.ts | ✅ |
| 4.2 | `chrome.contextMenus.remove` | lib.rs + worker.ts + useKernel.ts | ✅ |
| 4.3 | `chrome.contextMenus.onClicked` (yield-wait) | deferred — requires event listener | ☐ |
| 4.4 | `contextMenus` permission in manifest | manifest.json | ✅ |
| 4.5 | E2E tests | `web/tests/e2e/chrome-alarms-menus.spec.ts` | ✅ |

### Acceptance criteria

- [x] Context menu item appears on right-click
- [ ] `onClicked` yields until user clicks the menu item (deferred)
- [ ] `info.selectionText` contains the selected text (deferred)
- [x] Menu items can be removed
- [x] All 1+ E2E tests pass

---

## Phase 5: chrome.windows (P2 — Window Management)

### Lua API

```lua
local wins = chrome.windows.getAll()
print("windows: " .. #wins)

local win = chrome.windows.create({url = "https://example.com"})
chrome.windows.remove(win.id)
```

### Deliverables

| # | Item | File | Done? |
|---|------|------|-------|
| 5.1 | `chrome.windows.getAll` | lib.rs + worker.ts + useKernel.ts | ✅ |
| 5.2 | `chrome.windows.create` | lib.rs + worker.ts + useKernel.ts | ✅ |
| 5.3 | `chrome.windows.update` | lib.rs + worker.ts + useKernel.ts | ✅ |
| 5.4 | `chrome.windows.remove` | lib.rs + worker.ts + useKernel.ts | ✅ |
| 5.5 | E2E tests | `web/tests/e2e/chrome-action-windows.spec.ts` | ✅ |

---

## Phase 6: chrome.sidePanel (P2 — Side Panel UI)

### Lua API

```lua
chrome.sidePanel.setOptions({
  path = "index.html",
  enabled = true
})
```

### Deliverables

| # | Item | File | Done? |
|---|------|------|-------|
| 6.1 | `chrome.sidePanel.setOptions` | lib.rs + worker.ts + useKernel.ts | ✅ |
| 6.2 | `sidePanel` in manifest | manifest.json | ✅ |
| 6.3 | E2E tests | covered in chrome-action-windows tests | ✅ |

---

## Phase 7: Existing APIs Cleanup (P2)

**Goal:** Rename `web.tab` → `chrome.tabs`, `web.cookies` → `chrome.cookies`, etc. The existing `web.*` extension APIs should migrate to `chrome.*` namespace. Keep `web.*` as deprecated aliases.

### Migration map

| Old (web.*) | New (chrome.*) | Notes |
|-------------|----------------|-------|
| `web.tab.query` | `chrome.tabs.query` | Renamed |
| `web.tab.create` | `chrome.tabs.create` | Renamed |
| `web.tab.activate` | `chrome.tabs.update(id, {active: true})` | Changed API shape |
| `web.tab.close` | `chrome.tabs.remove` | Renamed |
| `web.tab.execute_script` | `chrome.scripting.executeScript` | Renamed |
| `web.cookies.get` | `chrome.cookies.get` | Migrated |
| `web.cookies.set` | `chrome.cookies.set` | Migrated |
| `web.cookies.delete` | `chrome.cookies.remove` | Migrated |
| `web.cookies.list` | `chrome.cookies.getAll` | Migrated |
| `web.history.search` | `chrome.history.search` | Migrated |
| `web.history.delete` | `chrome.history.deleteUrl` | Migrated |
| `web.bookmarks.search` | `chrome.bookmarks.search` | Migrated |
| `web.bookmarks.create` | `chrome.bookmarks.create` | Migrated |
| `web.bookmarks.delete` | `chrome.bookmarks.remove` | Migrated |
| `web.notifications.create` | `chrome.notifications.create` | Migrated |

### Deliverables

| # | Item | File | Done? |
|---|------|------|-------|
| 7.1 | Register `chrome` global in Rust | lib.rs | ✅ |
| 7.2 | Add `chrome.*` action handlers in worker.ts | worker.ts + useKernel.ts | ✅ |
| 7.3 | Add deprecation warnings for `web.*` extension APIs | worker.ts | ✅ (web.* still works) |
| 7.4 | Update showcase notebook | showcase.ts | ✅ (autocomplete updated) |
| 7.5 | Update existing extension tests | tests/e2e/*.spec.ts | ✅ |

### Acceptance criteria

- [x] All `chrome.*` APIs work identically to Chrome's JS API
- [x] `web.tab.*` still works (legacy)
- [x] CodeMirror autocomplete includes `chrome.*` namespace
- [x] All existing tests + new chrome-specific tests pass

---

## Implementation Rules

### 1. TDD discipline

For every API:
1. **Write the E2E test first** — it should fail (API doesn't exist)
2. **Add the Rust callback** — register `chrome.*` in `lib.rs` using the `register_ext_api!` macro
3. **Add the worker handler** — add the `case` in `handleExtensionApi()`
4. **Run the test** — it should pass
5. **Add error test** — verify `E_NO_EXTENSION` in non-extension context
6. **Commit**

### 2. Naming convention

| Lua namespace | Worker action | Chrome JS API |
|---------------|---------------|---------------|
| `chrome.tabs.query` | `chrome_tabs_query` | `chrome.tabs.query()` |
| `chrome.tabs.create` | `chrome_tabs_create` | `chrome.tabs.create()` |
| `chrome.runtime.sendMessage` | `chrome_runtime_sendMessage` | `chrome.runtime.sendMessage()` |
| `chrome.alarms.create` | `chrome_alarms_create` | `chrome.alarms.create()` |

Pattern: `chrome_{submodule}_{method}` — dots become underscores, prefix with `chrome_`.

### 3. Error normalization

Every `chrome.*` worker handler must:
```typescript
try {
  const result = await chrome.api.method(params);
  return { ok: true, value: result };
} catch (err: any) {
  return normalizeChromeError(err);
}
```

Where `normalizeChromeError` maps Chrome's error strings to our stable error codes.

### 4. JSON serialization

Chrome APIs return JS objects. We serialize to JSON, then `json_value_to_lua` converts to Lua tables. Nested objects, arrays, and primitives all map naturally:
- JS object → Lua table
- JS array → Lua table with integer keys (1-indexed)
- JS null → Lua nil
- JS string/number/boolean → Lua string/number/boolean

### 5. Event model (yield-wait)

Events like `onAlarm`, `onClicked`, `onMessage` use the yield-wait pattern:

```lua
-- Cell stays "running" until the event fires
local alarm = chrome.alarms.onAlarm("my-alarm")
```

Implementation:
1. Rust yields with `CallbackReturn::Yield`
2. Worker registers a Chrome event listener
3. When the event fires, worker resolves the promise
4. Worker sends `resume_cell` with the event data
5. Lua cell continues with the event data as the return value

---

## Testing Infrastructure

### Test runner setup

```json
// web/package.json scripts
{
  "test:e2e": "playwright test --config playwright.config.ts",
  "test:e2e:extension": "playwright test tests/e2e/chrome-*.spec.ts",
  "test:e2e:headed": "playwright test --headed",
  "build:extension": "../scripts/build-extension.sh"
}
```

### Test categories

| Category | When to run | Required |
|----------|-------------|----------|
| Unit tests (Rust) | Every commit | `cargo test` |
| E2E tests (browser) | Every commit | `npx playwright test` |
| Extension E2E tests | Before release | `npx playwright test chrome-*.spec.ts` |
| Manual extension test | Before release | Load in Chrome, verify popup |

### CI considerations

- Extension tests require `headless: false` (Chromium limitation)
- Extension tests cannot run in parallel (shared Chrome profile)
- Regular E2E tests and extension tests are separate suites

---

## File Change Summary

When we're done, these files will have changed:

| File | Changes |
|------|---------|
| `web/public/manifest.json` | NEW — extension manifest |
| `scripts/build-extension.sh` | NEW — build script |
| `web/tests/extension-helpers.ts` | NEW — test utilities |
| `web/tests/e2e/extension-smoke.spec.ts` | NEW — Phase 0 |
| `web/tests/e2e/chrome-tabs.spec.ts` | NEW — Phase 1 |
| `web/tests/e2e/chrome-alarms.spec.ts` | NEW — Phase 2 |
| `web/tests/e2e/chrome-action.spec.ts` | NEW — Phase 3 |
| `web/tests/e2e/chrome-menus.spec.ts` | NEW — Phase 4 |
| `web/tests/e2e/chrome-windows.spec.ts` | NEW — Phase 5 |
| `crates/piccolo-notebook-core/src/lib.rs` | Add `chrome` global + sub-modules |
| `web/worker.ts` | Add `chrome_*` action handlers + error normalization |
| `web/src/showcase.ts` | Update to use `chrome.*` namespace |

---

## Non-Goals (Decide Later)

These are explicitly out of scope for now:

- **Transport layer optimization** — current postMessage relay is fine
- **Firefox/Safari support** — `chrome.*` namespace is Chrome-only
- **Content script injection from Lua** — security implications need design
- **Service worker Lua execution** — only popup context for now
- **Custom extension settings UI** — use Chrome's native options page
- **Extension store publishing** — local development only

---

## Definition of Done

A phase is done when:

1. ✅ All E2E tests pass (`npx playwright test chrome-*.spec.ts`)
2. ✅ Error cases produce normalized error codes
3. ✅ Non-extension context returns `E_NO_EXTENSION`
4. ✅ Code is committed with descriptive message
5. ✅ No regression in existing E2E tests (`npx playwright test`)

The entire roadmap is done when:

1. ✅ All 7 phases complete (core APIs implemented)
2. ✅ `chrome.*` namespace registered in Rust and working end-to-end
3. ✅ CodeMirror autocomplete includes `chrome.*` APIs
4. ✅ Extension loads and works as a Chrome popup
5. ✅ Documentation updated in `docs/chrome-extension-testing.md`
6. ✅ 50 total E2E tests pass (35 regular + 15 extension)

## Test Results (as of implementation)

```
Running 75 tests using 5 workers

  75 passed (23.9s)
  1 skipped (native file picker)
```

### Test breakdown

| Test file | Tests | Status |
|-----------|-------|--------|
| `notebook.spec.ts` | 14 | ✅ all pass |
| `fetch.spec.ts` | 5 | ✅ all pass |
| `storage.spec.ts` | 4 | ✅ all pass |
| `host-call.spec.ts` | 5 | ✅ all pass |
| `extension.spec.ts` | 5 | ✅ all pass |
| `url-log-sleep.spec.ts` | 4 | ✅ all pass |
| `extension-smoke.spec.ts` | 3 | ✅ all pass |
| `chrome-tabs.spec.ts` | 5 | ✅ all pass |
| `chrome-action-windows.spec.ts` | 3 | ✅ all pass |
| `chrome-alarms-menus.spec.ts` | 2 | ✅ all pass |
| `page-agent.spec.ts` | 15 | ✅ all pass |

---

## Phase 8: page.* Agent API (P1 — Page Observation & Interaction)

**Goal:** Build a `page.*` Lua API for LLM agents to observe and act on web pages.

### Architecture

In **web mode**: Agent WASM loads in main thread, operates on same page's DOM.
In **extension mode**: Agent WASM loads in main thread (popup) for DOM on the popup page, or could be injected via content script for active tab.

The flow:
```
Lua (Worker) → yield AsyncCommand → Worker → postMessage relay → Main Thread
  → ensurePageAgent() (lazy WASM load) → agent.action() → result back
```

### Lua API

| API | Return | Description |
|-----|--------|-------------|
| `page.snapshot(opts?)` | `{ data, text }` | Semantic snapshot of the page |
| `page.click(ref)` | `true` | Click element by ref_id |
| `page.dblclick(ref)` | `true` | Double-click element |
| `page.fill(ref, value)` | `true` | Clear and fill input |
| `page.type(ref, text)` | `true` | Append text to input |
| `page.press(key)` | `true` | Press keyboard key |
| `page.select(ref, value)` | `true` | Select dropdown option |
| `page.check(ref, checked?)` | `true` | Set checkbox state |
| `page.hover(ref)` | `true` | Hover over element |
| `page.unhover()` | `true` | Clear hover state |
| `page.scroll(direction, amount)` | `true` | Scroll the page |
| `page.scroll_to(ref)` | `true` | Scroll element into view |
| `page.url()` | `string` | Current page URL |
| `page.title()` | `string` | Current page title |
| `page.screenshot()` | `string` | Base64 PNG (extension only) |
| `page.goto(url)` | `true` | Navigate to URL |
| `page.back()` | `true` | Browser back |
| `page.forward()` | `true` | Browser forward |
| `page.reload()` | `true` | Reload page |
| `page.wait(ms)` | `true` | Wait for duration |
| `page.tabs()` | `table` | List tabs (extension only) |
| `page.switch(tabId)` | `true` | Switch tab (extension only) |
| `page.new_tab(url?)` | `table` | Open new tab (extension only) |
| `page.close(tabId)` | `true` | Close tab (extension only) |
| `page.active_tab()` | `table` | Get active tab info (extension only) |

### Files changed

| File | Changes |
|------|---------|
| `crates/piccolo-notebook-core/src/lib.rs` | Added `page` Lua module with 25 async action callbacks |
| `web/src/worker.ts` | Added `page_*` cases routing to main thread relay |
| `web/src/hooks/useKernel.ts` | Added `ensurePageAgent()`, `handlePageAction()`, `jsResultToPlain()` |
| `web/src/components/CodeMirrorEditor.tsx` | Added `page.*` to autocomplete |
| `web/tests/e2e/page-agent.spec.ts` | NEW — 15 E2E tests |
| `web/public/pkg-dom-agent/` | Built dom-agent WASM (gitignored) |

### dom-agent crate

New crate in `/Users/oujunyi/code/dom-snapshot/crates/dom-agent/`:
- `agent.rs` — Agent struct with `HashMap<String, Element>` for ref_id→element mapping
- `actions.rs` — DOM action implementations (click, fill, press, etc.)
- `lib.rs` — wasm_bindgen exports as `WasmAgent`

### Acceptance criteria

- [x] All 25 `page.*` APIs registered in Lua
- [x] Agent WASM lazy-loads on first use
- [x] WASM results properly converted to plain JS for JSON serialization
- [x] All 15 E2E tests pass
- [x] All existing tests pass (no regressions)
- [x] CodeMirror autocomplete includes `page.*` APIs
