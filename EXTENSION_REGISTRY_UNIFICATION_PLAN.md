# Extension Registry Unification Plan

**Status:** Draft  
**Reference projects:** `../web-js` (structure), `TOOL_REGISTRATION_TARGET.md` (architecture)  
**Goal:** Reorganize `extension-lua` JS like `extension-js`, unify registry code across `extension-lua` and `web-lua`, and reach the target tool-registration architecture without breaking the WASM/Lua boundary.

---

## Why This Plan

`web-js` solved the same problem with a clear layout:

```text
crates/extension-js/js/src/
├── shared/           # tool-registry, schemas, registry/{dispatch,routes,manifest}
├── main/             # runner/tools/*.ts, session, tab-context
├── content-script/   # registry, handlers, message-router, schemas
└── worker/           # worker entry
```

`web-lua` already has the right *ideas* (`register()` five-tuple, `piccolo-tool` channel, `MergedDocRegistry`, doctests) but the code is monolithic:

| File | Lines | Problem |
|------|-------|---------|
| `crates/extension-lua/js/runner.ts` | ~5400 | All tool registrations + transport in one file |
| `crates/extension-lua/js/content-script.ts` | ~1500 | Handlers + message router + DOM utils inline |
| `crates/extension-lua/js/tool-registry.ts` | ~580 | Good, but duplicated in `web-lua/js/registry.ts` |
| `crates/web-lua/js/registry.ts` | ~490 | Near-duplicate of extension registry |

We **can** do the same as `web-js`. The Rust/WASM session boundary stays unchanged; this is a JS-side structural refactor plus registry consolidation.

---

## Locked Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Canonical registration API | `register(action, params, returns, doc, handler)` per `TOOL_REGISTRATION_TARGET.md` | Already implemented in `tool-registry.ts`; do not adopt web-js `registerJsCall` naming |
| Content-script message envelope | `piccolo-tool` v1 (existing) | Already in runner + content-script; stricter than web-js legacy messages |
| Source layout | Mirror web-js `src/{shared,main,content-script,worker}` | Proven modular structure; 78 files vs 15 flat files |
| Shared registry location | `crates/extension-lua/js/src/shared/` consumed by both `extension-lua` and `web-lua` via Vite/tsconfig path alias | Eliminates `registry.ts` / `tool-registry.ts` duplication |
| Build tool for extension JS | Vite multi-entry (main + worker + content-script), matching web-js | Replaces flat `tsc` + ESM-marker strip hack |
| Migration strategy | Incremental per tool group; runner re-exports during transition | Avoid 5000-line single PR |
| Rust changes | Minimal — only if `generateApiDocs` / manifest export needs new JS paths | JS reorg must not change Lua public API names |

---

## Target File Structure

```text
crates/extension-lua/js/
├── src/
│   ├── shared/
│   │   ├── tool-registry.ts      # register(), dispatch, MergedDocRegistry
│   │   ├── schemas.ts            # Zod schemas (from schemas.ts + generated)
│   │   ├── logger.ts
│   │   └── registry/
│   │       ├── dispatch.ts       # dispatchValidated (extract from tool-registry)
│   │       ├── routes.ts         # transport routing (page→content-script, etc.)
│   │       ├── manifest.ts       # ToolDoc, JsCallSpec types
│   │       └── content-script-actions.ts
│   ├── main/
│   │   ├── index.ts              # ExtensionSession (from index.ts)
│   │   ├── session/
│   │   │   └── extension-session.ts
│   │   ├── runner/
│   │   │   ├── index.ts          # side-effect imports of all tools
│   │   │   ├── runtime.ts        # executeMainThreadCommand, listeners
│   │   │   ├── command.ts
│   │   │   ├── tab/
│   │   │   │   ├── messaging.ts
│   │   │   │   └── execute.ts
│   │   │   └── tools/
│   │   │       ├── page.ts
│   │   │       ├── tab.ts
│   │   │       ├── sidepanel.ts
│   │   │       ├── storage.ts
│   │   │       ├── network.ts
│   │   │       ├── chrome/
│   │   │       │   └── index.ts  # re-exports per-namespace files
│   │   │       ├── aliases.ts
│   │   │       └── runtime-docs.ts  # __runtime_docs, __runtime_get_doc
│   │   └── tab-context.ts
│   ├── content-script/
│   │   ├── index.ts
│   │   ├── registry.ts
│   │   ├── handlers.ts
│   │   ├── message-router.ts
│   │   ├── schemas.ts
│   │   ├── dom-utils.ts
│   │   └── snapshot.ts
│   └── worker/
│       └── worker.ts
├── test/                         # vitest (mirror web-js)
│   ├── registry/
│   ├── runner.test.ts
│   ├── content-script.test.ts
│   └── doctest.test.ts
├── vite.config.ts
├── vite.content-script.config.ts
├── vitest.config.ts
├── manifest.json
└── background.js

crates/web-lua/js/
├── index.ts                      # imports from @extension-lua/shared/tool-registry
└── tools/                        # main-thread-only tools (fs, fetch, dom, page in browser)
    └── ...

web/public/                       # built artifacts only (from vite build → copy)
```

---

## Work Units

### WU-0 — Baseline & Guardrails

**Focus:** Establish green baseline before structural moves.

**Tasks:**
- Run `cargo test --workspace`, `node scripts/build.js`, extension-lua vitest, web e2e smoke.
- Add a CI step for `cd crates/extension-lua/js && npm test` if missing.
- Document current public API surface count (`listTools()`, Rust `api_docs` count).

**Acceptance criteria:**
- [ ] `cargo test --workspace` exits 0
- [ ] `node scripts/build.js` exits 0
- [ ] `cd crates/extension-lua/js && npm test` exits 0
- [ ] `cd web && npm run test:e2e -- extension-smoke.spec.ts` exits 0
- [ ] Baseline tool count recorded in this plan (action names list or count)

---

### WU-1 — Extract `shared/` Registry Module

**Focus:** Split `tool-registry.ts` into shared primitives without moving runner yet.

**Key files:** `tool-registry.ts` → `src/shared/tool-registry.ts`, `src/shared/registry/dispatch.ts`, `src/shared/registry/routes.ts`

**Tasks:**
- Extract `dispatchValidated` into `shared/registry/dispatch.ts` (port from web-js).
- Extract transport routing (`deriveTransport`, tab policy) into `shared/registry/routes.ts`.
- Keep `register()`, `MergedDocRegistry`, `doctestTools` in `shared/tool-registry.ts`.
- Add `test/registry/dispatch.test.ts`, `test/registry/routes.test.ts`.

**Acceptance criteria:**
- [ ] `register()` + `dispatchTool()` behavior unchanged (existing `tool-registry.test.ts` green)
- [ ] New route tests cover `page_*` → content-script, `tab_*` → required tabId
- [ ] No file > 400 lines in `shared/`
- [ ] `npm test` in extension-lua green

---

### WU-2 — Reorganize `src/` Layout (Shell Move)

**Focus:** Create web-js directory skeleton; move files with re-export shims.

**Tasks:**
- Create `src/{shared,main,content-script,worker}` directories.
- Move `worker.ts` → `src/worker/worker.ts`.
- Move `index.ts` → `src/main/index.ts`; add root `index.ts` re-export shim.
- Move `logger.ts` → `src/shared/logger.ts`.
- Update `tsconfig.json` / `package.json` exports:
  ```json
  ".": "./src/main/index.ts",
  "./worker": "./src/worker/worker.ts",
  "./content-script": "./src/content-script/index.ts"
  ```
- Update `scripts/build.js`, `scripts/build-npm.js`, `web/vite.config.ts` aliases.

**Acceptance criteria:**
- [ ] All existing imports resolve (shims at old paths or updated aliases)
- [ ] `node scripts/build.js extension` produces same extension artifacts
- [ ] `web/public/content-script.js` still loads in extension smoke E2E
- [ ] No logic changes in this WU — moves only

---

### WU-3 — Split `runner.ts` Into Tool Modules

**Focus:** Decompose the 5400-line monolith following web-js `main/runner/tools/`.

**Order (dependency-safe):**
1. `runtime-docs.ts` — `__runtime_docs`, `__runtime_get_doc`, `__runtime_search_docs`
2. `storage.ts`, `network.ts`, `clipboard.ts`
3. `sidepanel.ts`
4. `page.ts`, `tab.ts` (content-script transport wrappers)
5. `chrome/index.ts` + per-namespace files
6. `aliases.ts`, `host-call.ts`
7. `runtime.ts` — thin orchestrator (< 300 lines)

**Pattern (from web-js `page.ts`):**
```ts
// src/main/runner/tools/page.ts
import { register } from "../../../shared/tool-registry.js";
register("page_click", PageClickParamsSchema, z.null(), { ...doc }, async (params) => { ... });
```

**Acceptance criteria:**
- [ ] `runner.ts` deleted or < 50 lines (re-export only)
- [ ] `runtime.ts` < 300 lines
- [ ] Each `tools/*.ts` < 500 lines
- [ ] Tool count unchanged vs WU-0 baseline
- [ ] `runner.test.ts` green
- [ ] `extension-smoke.spec.ts` + `chrome-tabs.spec.ts` green

---

### WU-4 — Refactor Content Script

**Focus:** Split `content-script.ts` into registry-driven modules like web-js.

**Key files:**
- `src/content-script/registry.ts` — local `register()`, `dispatchLocalTool()`
- `src/content-script/handlers.ts` — DOM handler implementations
- `src/content-script/message-router.ts` — `piccolo-tool` listener (extract from inline)
- `src/content-script/schemas.ts` — Zod schemas + `buildContentScriptSpecs()`
- `src/content-script/dom-utils.ts`, `snapshot.ts`

**Tasks:**
- Port handler map pattern from web-js `handlers.ts`.
- Keep `__ping`, `__tool_docs` as registered internal tools.
- Content script uses same `register()` from shared (local registry instance).
- Static docs in runner remain canonical; `__tool_docs` is runtime confirmation.

**Acceptance criteria:**
- [ ] `content-script.ts` deleted; `src/content-script/index.ts` < 40 lines
- [ ] `piccolo-tool` envelope unchanged (existing tests pass)
- [ ] `content-script.test.ts` green
- [ ] `page-interactions.spec.ts` or `extension-api-demo.spec.ts` green
- [ ] Async listener always returns `true` for valid requests

---

### WU-5 — Unify `web-lua` Registry

**Focus:** Remove `crates/web-lua/js/registry.ts` duplication.

**Tasks:**
- Point `web-lua/js/index.ts` at `extension-lua/js/src/shared/tool-registry.ts` via alias:
  `@pi-oxide/extension-lua/shared` or relative path in `vite.config.ts`.
- Move main-thread-only tool registrations to `web-lua/js/tools/*.ts`.
- Delete `registry.ts`; migrate `registry.test.ts` to shared or web-lua tools tests.

**Acceptance criteria:**
- [ ] Single source of truth for `register()`, `ToolDoc`, `dispatchTool()`
- [ ] `registry.ts` deleted
- [ ] `registry.test.ts` passes against shared module
- [ ] Browser notebook (`web`) dev + build unchanged
- [ ] `runtime-docs.spec.ts` green if present

---

### WU-6 — Vite Build Pipeline

**Focus:** Replace `tsc`-only extension build with Vite multi-entry (match web-js).

**Tasks:**
- Add `vite.config.ts` (main + worker) and `vite.content-script.config.ts`.
- Output to `crates/extension-lua/js/pkg/` or `dist/`.
- Update `scripts/build-npm.js` to invoke Vite instead of raw `tsc`.
- Remove ESM-marker strip hack if content-script bundles as IIFE/classic script.
- `__DOCTEST__` define flag in Vite config for doctest builds.

**Acceptance criteria:**
- [ ] `npm run build` in extension-lua produces main, worker, content-script bundles
- [ ] `web/public/` copy script uses built artifacts
- [ ] Production bundle contains no `testScript` strings (strip test)
- [ ] Extension loads in Chromium with no console errors on sidepanel open
- [ ] Bundle size within 10% of pre-refactor baseline

---

### WU-7 — Registry & Manifest Integrity Tests

**Focus:** Port web-js freeze/integrity patterns.

**Tasks:**
- Add `freezeRegistry()` after all tool modules import (like web-js `freezeJsRegistry`).
- Validate: every `register()` has handler, every content-script action in `CONTENT_SCRIPT_ACTIONS`.
- Add `test/registry/content-script-registry.test.ts`, `manifest-docs.test.ts`.
- Cross-check Rust `api_docs` public names vs JS merged docs (script or test).

**Acceptance criteria:**
- [ ] `freezeRegistry()` throws on orphan manifest entries
- [ ] Rust + JS public name sets match (or documented intentional diff list empty)
- [ ] `test/registry/*` all green
- [ ] No duplicate `publicName` registrations

---

### WU-8 — Doctest Pipeline

**Focus:** Complete compile-time doctest mechanism per `TOOL_REGISTRATION_TARGET.md`.

**Tasks:**
- Vite `__DOCTEST__: true` build target for vitest.
- `doctest.test.ts` imports all tool modules, runs `doctestTools` via real `dispatchTool`.
- Production strip assertion: grep built `content-script.js` for `testScript` → empty.

**Acceptance criteria:**
- [ ] `DOCTEST=1 npm test` (or `vitest --config vitest.doctest.config.ts`) green
- [ ] Normal build: `rg testScript dist/` returns no matches
- [ ] At least 3 tools have doctests (one page, one chrome, one sidepanel)

---

### WU-9 — Extension Contract E2E (Optional but Recommended)

**Focus:** Single authoritative extension contract spec like web-js `extension-js.contract.spec.ts`.

**Tasks:**
- Add `web/playwright.extension.config.ts` — loads built extension from `web/dist/`, no Vite server.
- Add `web/tests/e2e/extension-lua.contract.spec.ts` with `__EXTENSION_CONTRACT_RESULT__` sentinel.
- Drive Lua cells through sidepanel UI only (no direct `__kernel` access).
- Cover: runtime.docs, page.snapshot, page.click, storage, one chrome API.

**Acceptance criteria:**
- [ ] `npm run test:e2e:extension` (new script) exits 0
- [ ] Spec does not import `crates/extension-lua/js/src/**`
- [ ] Uses real unpacked extension from build artifact
- [ ] ≥ 10 API cases with machine-readable assertions

---

### WU-10 — CI & Docs

**Focus:** Wire new checks into CI; update AGENTS.md.

**Tasks:**
- CI: extension-lua vitest, doctest strip check, optional extension E2E.
- Update `AGENTS.md`, `crates/extension-lua/AGENTS.md`, `crates/extension-lua/js/README.md`.
- Mark `TOOL_REGISTRATION_TARGET.md` sections as implemented where done.

**Acceptance criteria:**
- [ ] `.github/workflows/ci.yml` runs extension-lua `npm test`
- [ ] AGENTS.md reflects new `src/` layout and build commands
- [ ] README documents `register()` pattern with one worked example

---

## Final Gate

All commands must exit 0:

```bash
cargo fmt --all -- --check
cargo clippy -p web-lua-core -p web-lua-base -p web-lua -p extension-lua -p web-lua-plugin-crypto -p dom-semantic-tree --no-deps -- -D warnings
cargo test --workspace
node scripts/build.js
cd crates/extension-lua/js && npm test
cd crates/web-lua/js && npm test 2>/dev/null || true   # if package.json test exists
cd web && npm run build
cd web && npm run test:e2e -- extension-smoke.spec.ts chrome-tabs.spec.ts runtime-docs.spec.ts
```

**Must exist after completion:**
- `crates/extension-lua/js/src/shared/tool-registry.ts`
- `crates/extension-lua/js/src/main/runner/tools/page.ts` (and siblings)
- `crates/extension-lua/js/src/content-script/index.ts`
- `crates/extension-lua/js/vite.config.ts`
- No `crates/extension-lua/js/runner.ts` (or re-export shim only)
- No `crates/web-lua/js/registry.ts`

---

## Out of Scope

- Rewriting Rust `register_lua_tool!` macro (already correct shape)
- Changing Lua public API names (`page.click`, `tab.click`, etc.)
- Moving extension assets out of `web/public/` (separate ADR)
- piccolo VM changes
- npm publishing of `@pi-oxide/extension-lua` to registry.npmjs.org
- Full parity with all 20 existing E2E specs in one pass (migrate incrementally)

---

## Risk & Mitigation

| Risk | Mitigation |
|------|------------|
| 5400-line runner split breaks action routing | WU-0 baseline count; per-group E2E after each split |
| Vite worker URL regression | Keep worker URL patch test; compare web-js vite worker config |
| Duplicate registry during transition | WU-2 shims; delete old files only in WU-5 |
| Content script injection timing | Keep `ensureContentScript` + `__ping`; don't change protocol |
| CI time increase | Run extension vitest in parallel job; E2E optional on PR |

---

## Success Metrics

1. **Structure:** extension-lua JS matches web-js layout (shared/main/content-script/worker).
2. **DRY:** One registry implementation shared by extension-lua and web-lua.
3. **Size:** No source file > 500 lines (except generated).
4. **Tests:** Registry unit tests + doctests + smoke E2E green.
5. **Architecture:** `TOOL_REGISTRATION_TARGET.md` invariants 1–12 satisfied.
