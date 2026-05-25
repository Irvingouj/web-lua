# @pi-oxide/web-lua

Self-contained WebAssembly Lua runtime for web environments.

## Installation

```bash
npm install @pi-oxide/web-lua
```

## Usage

```typescript
import { WebSession } from "@pi-oxide/web-lua";

const [vm, runner] = await WebSession.init();

const result = await vm.runCellAsync(`
  print(page.url())
  return page.title()
`, "");

console.log(result.stdout);
console.log(result.result);

await vm.stopWith(runner);
```

## API

- `WebSession.init()` — Returns `[WebSession, Promise<void>]`. The runner promise resolves when the session is stopped.
- `vm.runCellAsync(code, stdin?)` — Execute Lua code. Returns `LuaRunResult` with `stdout`, `stderr`, `result`, `error`.
- `vm.reset()` — Clear all Lua state.
- `vm.stopWith(runner)` — Clean up the session and release resources. Sets an internal abort flag; in-flight async operations finish their current step and then exit on the next iteration.
- `vm.inspectGlobals()` — Inspect all global variables.
- `vm.setFuelLimit(limit)` — Set execution fuel limit.
- `vm.loadLibrary(source)` — Load a Lua library.

## Lua APIs available in web environment

- `page.url()` / `page.title()` / `page.snapshot()`
- `page.click(ref_id)` / `page.fill(ref_id, text)` / `page.goto(url)`
- `page.fetch(url, opts)` — Fetch from current page origin
- `sleep(ms)`
- `host.call(action, params)` — Optional extension point

## License

LicenseRef-PiccoloNotebook-Fair-BYOK-1.0
