# web-lua-core

## OVERVIEW

Core Lua session logic: fuel-based execution, host APIs, cell evaluation, and TypeScript type generation via tsify/ts-rs.

## STRUCTURE

```
.
├── src/
│   ├── lib.rs              # Module re-exports
│   ├── session.rs          # NotebookSession (fuel, cell execution, persistence)
│   ├── action.rs           # Action dispatch and host API calls
│   ├── globals.rs          # Lua globals setup (sandboxing)
│   ├── json.rs             # JSON serialization for Lua values
│   ├── types.rs            # Shared types (Cell, Output, etc.)
│   ├── state.rs            # Session state management
│   ├── plugin.rs           # Plugin system entry point
│   ├── api_docs.rs         # API documentation generation
│   ├── command_params.rs   # Command parameter parsing
│   ├── utils.rs            # Shared utilities
│   ├── tests.rs            # 80+ unit tests (93KB, monolithic)
│   ├── path_prelude.lua    # Embedded Lua prelude
│   └── web/                # Chrome extension API wrappers
│       ├── mod.rs          # Re-exports all web modules
│       ├── page.rs          # Page interactions (56KB — very large)
│       ├── fs.rs            # File system API
│       ├── fetch.rs         # HTTP fetch API
│       ├── chrome.rs        # Chrome API namespace (broad naming)
│       ├── bookmarks.rs     # Chrome bookmarks API
│       ├── clipboard.rs     # Clipboard API
│       ├── cookies.rs       # Cookies API
│       ├── dom.rs           # DOM manipulation API
│       ├── history.rs       # History API
│       ├── host.rs          # Host bridge
│       ├── log.rs           # Logging
│       ├── notifications.rs # Notifications API
│       ├── protector.rs     # Permission/validation layer
│       ├── runtime.rs       # Chrome runtime API
│       ├── sidepanel.rs     # Sidepanel API (33KB)
│       ├── storage.rs       # Storage API
│       ├── tab.rs           # Tab API
│       └── url.rs           # URL utilities
```

## WHERE TO LOOK

| Task | Location |
|------|----------|
| Modify cell execution / fuel | `src/session.rs` |
| Add host API | `src/action.rs` + `src/web/` |
| Add Chrome API wrapper | `src/web/<api>.rs` |
| Modify sandbox | `src/globals.rs` |
| Add/modify tests | `src/tests.rs` (currently monolithic) |
| Modify types | `src/types.rs` (affects tsify output) |
| Add plugin | `src/plugin.rs` |

## CONVENTIONS

- `tsify` for TS type generation: `#[derive(Tsify, Serialize, Deserialize)]`
- `serde_json` for Lua value serialization
- `web-sys` features explicitly enumerated per module (no "all" feature)
- `#[allow(clippy::too_many_arguments)]` allowed in DOM semantic tree

## ANTI-PATTERNS

- **Single monolithic test file**: `src/tests.rs` is 93KB. Should split into `tests/` directory or colocate unit tests.
- **Inconsistent naming in `src/web/`**: `chrome.rs` (broad) vs `bookmarks.rs`, `clipboard.rs`, etc. (specific domains)
- **`page.rs` is 56KB**: Consider splitting into submodules.
- **Editing `web/src/types/generated.ts`**: Generated from tsify — do not edit manually.

## NOTES

- `src/path_prelude.lua` is embedded at compile time via `include_str!`
- `web-lua-core` is referenced by both `web-lua` and `extension-lua` via `web-lua-base`
- CI clippy skips this crate (uses explicit `-p` list), but `cargo test --workspace` includes it
