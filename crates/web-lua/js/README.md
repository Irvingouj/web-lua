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

- `WebSession.init()` — Returns `[WebSession, Promise<void>]`.
- `vm.runCellAsync(code, stdin?)` — Execute Lua code. Returns `LuaRunResult` with `stdout`, `stderr`, `result`, `error`.
- `vm.reset()` — Clear all Lua state.
- `vm.stopWith(runner)` — Clean up the session and release resources.
- `vm.inspectGlobals()` — Inspect all global variables.
- `vm.setFuelLimit(limit)` — Set execution fuel limit.
- `vm.loadLibrary(source)` — Load a Lua library.
- `generateApiDocs()` — Generate API documentation as Markdown + JSON from the Rust source.

## Lua APIs available in web environment

### Page interaction

- `page.url()` / `page.title()` / `page.snapshot()`
- `page.click(ref_id)` / `page.dblclick(ref_id)` / `page.fill(ref_id, text)` / `page.type(ref_id, text)`
- `page.press(key)` / `page.select(ref_id, value)` / `page.check(ref_id, checked?)`
- `page.hover(ref_id)` / `page.unhover()`
- `page.scroll(direction, amount)` / `page.scroll_to(ref_id)`
- `page.goto(url)` / `page.back()` / `page.forward()` / `page.reload()`
- `page.screenshot()` / `page.wait(ms)`

### DOM & fetch

- `dom.snapshot(opts?)` — Semantic DOM tree snapshot
- `dom.format(snapshot, format?)` — Format snapshot to text (compact-text, markdown, etc.)
- `page.fetch(url, opts?)` — Fetch from current page origin (alias for `web.fetch`)
- `web.fetch(url, opts?)` — Generic HTTP fetch

### Utilities

- `sleep(ms)` — Global alias for `web.sleep`
- `web.log(...)` — Log to browser console
- `web.url.parse(url)` — Parse URL into components
- `web.url.encode(params)` — Encode table to query string
- `web.storage.get(key)` / `web.storage.set(key, value)` / `web.storage.delete(key)` / `web.storage.list()`
- `runtime.inspect()` — Inspect all Lua globals
- `host.call(action, params?)` — Optional extension point for JS handler registration

## Auto-generated docs

The package includes `API.md` and `api.json` in the crate root, generated automatically from Rust `lua_api_doc!` macros. These list every Lua function with parameter types, return shapes, and source locations.

## License

LicenseRef-PiccoloNotebook-Fair-BYOK-1.0
