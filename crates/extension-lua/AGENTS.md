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
│   ├── index.ts            # JS package entry point
│   ├── package.json        # @pi-oxide/extension-lua
│   ├── tsconfig.json       # NodeNext resolution
│   ├── worker.ts           # Web Worker entry (6KB)
│   ├── runner.ts           # Extension runner (98KB)
│   ├── content-script.ts   # Chrome content script (20KB)
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
| Modify Web Worker | `js/worker.ts` |
| Modify extension runner | `js/runner.ts` |
| Modify content script | `js/content-script.ts` |
| Modify background script | `js/background.js` |
| Modify manifest | `js/manifest.json` |

## ANTI-PATTERNS

- **Extension code inside wasm-bindgen wrapper**: Content scripts, background scripts, and workers should be in `web/src/extension/` or top-level `extension/`, not inside a JS wrapper package
- **Nested `node_modules`**: `js/node_modules/` exists inside a Rust crate — non-standard
- **Generated files in working tree**: `js/extension_lua.js` (10MB) and `js/extension_lua.d.ts` are gitignored but present
- **ESM marker stripped post-build**: `scripts/build.js` regex-strips `export {};` from `content-script.js` for MV3 compatibility

## NOTES

- `js/runner.ts` (98KB) is the main extension orchestration logic
- `js/worker.ts` loads the WASM module in a Web Worker context
- `web/scripts/copy-ext-assets.js` copies `js/` assets to `web/public/` for dev server
- `web/public/` contains extension assets: `manifest.json`, `background.js`, `content-script.js`
