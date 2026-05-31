# web-lua

## OVERVIEW

Main-thread WASM runtime. wasm-bindgen wrapper that exposes `WebSession` to the browser's main thread.

## STRUCTURE

```
.
├── src/
│   ├── lib.rs              # Re-export (122 bytes)
│   └── session.rs          # WebSession wasm-bindgen wrapper (51KB)
├── js/
│   ├── index.ts            # JS package entry point
│   ├── package.json        # @pi-oxide/web-lua
│   ├── tsconfig.json       # NodeNext resolution
│   ├── web_lua.d.ts        # Generated types (gitignored but present)
│   └── web_lua.js          # Generated wasm-bindgen glue (11MB, gitignored)
├── Cargo.toml              # cdylib + rlib
└── pkg/                    # wasm-bindgen output (gitignored)
```

## WHERE TO LOOK

| Task | Location |
|------|----------|
| Modify main-thread WASM bindings | `src/session.rs` |
| Modify JS package entry | `js/index.ts` |
| Modify browser APIs exposed to Lua | `crates/web-lua-core/src/web/` |

## ANTI-PATTERNS

- **Generated files in working tree**: `js/web_lua.js` (11MB) and `js/web_lua.d.ts` are gitignored but present in working tree
- **No npm workspace inclusion**: `js/package.json` is not part of root npm workspaces
- **Vite aliases bypass package**: `web/vite.config.ts` resolves `@pi-oxide/web-lua` to `../crates/web-lua/js/index.ts`

## NOTES

- `lib.rs` is intentionally minimal (re-export only)
- `session.rs` is the wasm-bindgen bridge between `BaseSession` and browser JS
- Build output goes to `pkg/` then processed by `scripts/bundle-wasm.js` for base64 embedding
