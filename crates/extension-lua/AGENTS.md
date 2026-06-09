# extension-lua

## OVERVIEW

Extension-context WASM runtime. wasm-bindgen wrapper for Web Workers and Chrome extension APIs. Contains extension runtime code (content script, background script, worker) inside the JS wrapper package.

## STRUCTURE

```
.
├── src/
│   ├── lib.rs              # Re-export (154 bytes)
│   └── session.rs          # ExtensionSession wasm-bindgen wrapper (29KB)
├── js/
│   ├── src/
│   │   ├── shared/           # Shared registry, schemas, logger
│   │   │   ├── tool-registry.ts      # register(), dispatchTool(), MergedDocRegistry
│   │   │   ├── schemas.ts          # Zod schemas for all tool params/returns
│   │   │   ├── logger.ts
│   │   │   └── registry/
│   │   │       ├── dispatch.ts       # dispatchValidated
│   │   │       ├── routes.ts         # deriveTransport, CONTENT_SCRIPT_ACTIONS
│   │   │       ├── merged-doc.ts     # MergedDocRegistry
│   │   │       ├── freeze.ts         # freezeRegistry()
│   │   │       └── types.ts          # ToolDoc, ToolDefinition, etc.
│   │   ├── main/             # Main thread entry, runner, tools
│   │   │   ├── index.ts              # ExtensionSession proxy, worker lifecycle
│   │   │   ├── runner/
│   │   │   │   ├── index.ts          # Side-effect imports of all tools
│   │   │   │   ├── runtime.ts        # executeMainThreadCommand, listeners
│   │   │   │   ├── tab/
│   │   │   │   │   ├── messaging.ts
│   │   │   │   │   └── execute.ts
│   │   │   │   └── tools/
│   │   │   │       ├── page.ts
│   │   │   │       ├── tab.ts
│   │   │   │       ├── sidepanel.ts
│   │   │   │       ├── storage.ts
│   │   │   │       ├── network.ts
│   │   │   │       ├── clipboard.ts
│   │   │   │       ├── chrome/
│   │   │   │       │   └── index.ts
│   │   │   │       ├── aliases.ts
│   │   │   │       └── runtime-docs.ts
│   │   ├── content-script/   # Content script registry and handlers
│   │   │   ├── index.ts
│   │   │   ├── registry.ts
│   │   │   ├── handlers.ts
│   │   │   ├── message-router.ts
│   │   │   ├── schemas.ts
│   │   │   ├── dom-utils.ts
│   │   │   └── snapshot.ts
│   │   └── worker/
│   │       └── worker.ts
│   ├── index.ts            # Re-export shim → src/main/index.ts
│   ├── runner.ts           # Re-export shim → src/main/runner.ts
│   ├── content-script.ts   # Re-export shim → src/content-script/index.ts
│   ├── tool-registry.ts    # Re-export shim → src/shared/tool-registry.ts
│   ├── schemas.ts          # Re-export shim → src/shared/schemas.ts
│   ├── logger.ts           # Re-export shim → src/shared/logger.ts
│   ├── worker.ts           # Re-export shim → src/worker/worker.ts
│   ├── package.json        # @pi-oxide/extension-lua
│   ├── tsconfig.json       # NodeNext resolution
│   ├── vite.config.ts      # Vite multi-entry build (main + worker)
│   ├── vite.content-script.config.ts  # IIFE content-script build
│   ├── background.js       # Chrome background script
│   ├── manifest.json       # Chrome extension manifest
│   ├── extension_lua.d.ts  # Generated types
│   └── extension_lua.js    # Generated wasm-bindgen glue (10MB)
├── Cargo.toml              # cdylib + rlib
└── pkg/                    # wasm-bindgen output (gitignored)
```

## WHERE TO LOOK

| Task | Location |
|------|----------|
| Modify extension WASM bindings | `src/session.rs` |
| Modify Web Worker | `js/src/worker/worker.ts` |
| Modify extension runner | `js/src/main/runner/` |
| Modify tool registration | `js/src/shared/tool-registry.ts` |
| Modify content script | `js/src/content-script/` |
| Modify background script | `js/background.js` |
| Modify manifest | `js/manifest.json` |
| Add tool schemas | `js/src/shared/schemas.ts` |
| Add registry tests | `js/test/registry/` |

## BUILD SYSTEM

Vite multi-entry build replaces the old tsc + esbuild pipeline:
- `npm run build` — builds main (`dist/index.js`) + worker (`dist/worker.js`) + content-script (`dist/content-script.js`)
- Content-script is built as IIFE (no ESM markers)
- `__DOCTEST__` flag controls doctest inclusion

## ANTI-PATTERNS

- **Extension code inside wasm-bindgen wrapper**: Content scripts, background scripts, and workers should be in `web/src/extension/` or top-level `extension/`, not inside a JS wrapper package
- **Nested `node_modules`**: `js/node_modules/` exists inside a Rust crate — non-standard
- **Generated files in working tree**: `js/extension_lua.js` (10MB) and `js/extension_lua.d.ts` are gitignored but present

## NOTES

- `js/src/main/runner/` contains the split tool modules (was 98KB monolithic `js/runner.ts`)
- `js/src/worker/worker.ts` loads the WASM module in a Web Worker context
- `web/scripts/copy-ext-assets.js` copies built `dist/` assets to `web/public/`
- `web/public/` contains extension assets: `manifest.json`, `background.js`, `content-script.js`
- Shared registry at `js/src/shared/tool-registry.ts` is consumed by both extension-lua and web-lua
