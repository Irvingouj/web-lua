# PROJECT KNOWLEDGE BASE

**Generated:** 2026-05-29
**Commit:** cf6f2bd
**Branch:** main

## OVERVIEW

Piccolo Notebook — a browser-based Jupyter-style notebook for Lua scripting, powered by a pure Rust Lua VM (piccolo) compiled to WebAssembly. Hybrid Rust + TypeScript/Preact project.

## STRUCTURE

```
.
├── crates/
│   ├── piccolo/              # Vendored Lua VM (kyren/piccolo fork)
│   ├── web-lua-core/         # Session, host APIs, fuel system, tsify types
│   ├── web-lua-base/         # BaseSession shared by web-lua and extension-lua
│   ├── web-lua/              # Main-thread WASM runtime
│   ├── extension-lua/        # Extension-context WASM runtime (Web Worker + Chrome APIs)
│   ├── dom-semantic-tree/    # DOM accessibility tree extractor
│   ├── web-fs/               # Origin Private File System wrapper
│   └── web-lua-plugin-crypto/# Crypto plugin (sha2, md5, hmac)
├── web/
│   ├── src/                  # Preact UI, CodeMirror editor, hooks
│   ├── tests/e2e/            # Playwright E2E tests (18 spec files)
│   └── public/               # Extension assets (manifest, background, content-script)
├── scripts/                  # Build scripts (Node.js)
├── docs/                     # Architecture docs, ADRs, troubleshooting
└── packages/                 # EMPTY — lua-types removed, README stale
```

## WHERE TO LOOK

| Task | Location | Notes |
|------|----------|-------|
| Modify Lua runtime / session logic | `crates/web-lua-core/src/` | Fuel system, host APIs, tsify types |
| Modify main-thread WASM bindings | `crates/web-lua/src/` + `crates/web-lua/js/` | wasm-bindgen wrapper, browser APIs |
| Modify extension WASM bindings | `crates/extension-lua/src/` + `crates/extension-lua/js/src/` | Worker, content-script, Chrome APIs |
| Modify extension tool registry | `crates/extension-lua/js/src/shared/` | Shared registry consumed by web-lua |
| Add extension registry tests | `crates/extension-lua/js/test/registry/` | dispatch, routes, integrity tests |
| Modify vendored Lua VM | `crates/piccolo/src/` | Stackless execution, GC arena, fuel |
| Modify UI / notebook | `web/src/` | Preact components, CodeMirror, hooks |
| Add E2E tests | `web/tests/e2e/*.spec.ts` | Numbered test names, use helpers.ts |
| Add Rust unit tests | `crates/web-lua-core/src/tests.rs` | 93KB monolithic test file |
| Build WASM | `scripts/build.js` | Custom pipeline, no wasm-pack |
| Build web app | `cd web && npm run dev` | Vite on port 5173 |
| Run E2E tests | `cd web && npm run test:e2e` | Playwright, Chromium only |

## CODE MAP

| Symbol | Type | Location | Role |
|--------|------|----------|------|
| `NotebookSession` | struct | `crates/web-lua-core/src/session.rs` | Core Lua session, fuel, cell execution |
| `BaseSession` | struct | `crates/web-lua-base/src/session.rs` | Shared session wrapper for web/extension |
| `WebSession` | struct | `crates/web-lua/src/session.rs` | wasm-bindgen main-thread wrapper |
| `ExtensionSession` | struct | `crates/extension-lua/src/session.rs` | wasm-bindgen extension wrapper |
| `App` | component | `web/src/components/App.tsx` | Root Preact component |
| `main.tsx` | entry | `web/src/main.tsx` | Vite app bootstrap |
| `build.js` | script | `scripts/build.js` | WASM build orchestrator |
| `tests.rs` | tests | `crates/web-lua-core/src/tests.rs` | 80+ Rust unit tests (monolithic) |

## CONVENTIONS

- **Biome** (not ESLint/Prettier): 2-space indent, no `any`, no `!` non-null assertions
- **TypeScript strict**: `strict: true`, `isolatedModules: true`, Preact JSX
- **Rust**: `cargo fmt`, `cargo clippy -- -D warnings`, edition 2021
- **Vite aliases**: `@pi-oxide/*` packages resolve to `../crates/*/js/index.ts` (not npm deps)
- **WASM target**: `wasm32-unknown-unknown`, getrandom backend via `.cargo/config.toml`
- **License**: `LicenseRef-PiccoloNotebook-Fair-BYOK-1.0` (custom SPDX)

## ANTI-PATTERNS (THIS PROJECT)

- **`any` type**: Biome `noExplicitAny` = error
- **Non-null assertions (`!`)**: Biome `noNonNullAssertion` = error
- **Storing GC values in registry state**: `crates/piccolo/src/registry.rs` — "Do not do this!" causes permanent leaks
- **Calling `Executor` methods from callbacks**: `crates/piccolo/src/thread/executor.rs` — forbidden
- **Storing registry stashed values in async futures**: `crates/piccolo/src/async_callback.rs` — causes GC issues
- **Editing `web/src/types/generated.ts`**: ts-rs generated, "Do not edit manually"
- **Using `build-wasm.sh`**: Does not exist; use `node scripts/build.js`
- **Committing `.wasm` binaries**: `web/test_wasm.wasm` is tracked (should be gitignored)

## UNIQUE STYLES

- **Custom base64 WASM embedding**: `scripts/bundle-wasm.js` inlines `.wasm` into JS as base64, deletes separate file — no wasm-pack, no standard bundler
- **Python source mutation**: `scripts/bulk_doc.py` regex-patches Rust source files to replace macros — extremely non-standard, should be a proc-macro
- **ESM marker stripping**: `scripts/build.js` strips `export {};` from content-script.js post-tsc — hack for MV3 compatibility
- **Worker URL patching**: `scripts/build-npm.js` regex-patches `new URL("./worker.ts")` to `new URL("./worker.js")` post-tsc
- **WASM doc generation in Node.js**: `scripts/build.js` executes WASM in Node.js to generate `API.md` and `api.json`
- **Numbered E2E tests**: `test("1: app loads", ...)` — sequential ordering via test titles
- **Sequential E2E only**: `fullyParallel: false` — tests run serially
- **Extension assets in web app**: `web/public/` contains Chrome extension files (manifest, background, content-script)
- **Nested npm packages in Rust crates**: `crates/*/js/package.json` with own node_modules (extension-lua has nested node_modules)

## COMMANDS

```bash
# Dev server
cd web && npm install && npm run dev

# Build WASM (from root)
node scripts/build.js

# Rust tests
cargo test --workspace

# E2E tests
cd web && npm run test:e2e
cd web && npm run test:e2e:headed

# Format/lint
npx @biomejs/biome check --write .
cargo fmt
cargo clippy -- -D warnings
```

## NOTES

- **Root `packages/` is empty**: `lua-types` was removed in commit `660ac6d`; README is stale
- **Vendored piccolo has own `Cargo.lock`**: `crates/piccolo/Cargo.lock` exists (should not in workspace)
- **No `main.rs` anywhere**: Pure library project, no binaries
- **Chrome extension code inside WASM wrappers**: `crates/extension-lua/js/` contains content-script.ts, worker.ts, runner.ts — should be in `web/src/extension/` or top-level `extension/`
- **CI uses explicit clippy package list**: `-p web-lua-core -p web-lua-base ...` instead of `--workspace` (skips piccolo and web-fs)
- **CI installs wasm-bindgen-cli on every run**: `cargo install wasm-bindgen-cli` (slow, may cache)
- **`crates/web-lua-core/src/web/` naming inconsistency**: `chrome.rs` (broad) vs `bookmarks.rs`, `clipboard.rs`, `cookies.rs`, etc. (specific)
- **`web/test_wasm.wasm` is tracked**: 1.5MB binary in git, not in `.gitignore`
- **Single global CSS**: `web/src/styles.css` (17KB) instead of modular CSS
- **`web/src/notebook.ts` and `showcase.ts`**: Demo data at `src/` root, could be in `src/data/`
