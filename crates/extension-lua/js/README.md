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

## License

LicenseRef-PiccoloNotebook-Fair-BYOK-1.0
