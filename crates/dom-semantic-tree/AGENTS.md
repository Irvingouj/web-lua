# dom-semantic-tree

## OVERVIEW

DOM accessibility tree extractor. Extracts semantic structure from browser DOM for page agent / automation tests.

## STRUCTURE

```
.
├── src/
│   ├── lib.rs              # Public API (989 bytes)
│   ├── collect.rs          # DOM tree collection (15.8KB, #[allow(clippy::too_many_arguments)])
│   ├── model.rs            # Semantic node model
│   ├── format.rs           # Formatting / serialization
│   ├── name.rs             # Accessible name computation (#[allow(clippy::type_complexity)])
│   ├── role.rs             # ARIA role mapping
│   ├── state.rs            # Accessibility state
│   ├── visibility.rs       # Visibility checks
│   ├── refs.rs             # Reference resolution
│   └── geometry.rs         # Bounding box / geometry
├── tests/
│   ├── native_role_tests.rs
│   ├── native_name_tests.rs
│   ├── native_format_tests.rs
│   └── wasm_dom_tests.rs   # WASM browser tests (wasm-bindgen-test)
├── js/
│   ├── index.ts            # JS package entry
│   ├── package.json        # npm package
│   └── ...
├── Cargo.toml              # [dev-dependencies] wasm-bindgen-test = "0.3"
└── pkg/                    # wasm-bindgen output (gitignored)
```

## WHERE TO LOOK

| Task | Location |
|------|----------|
| Modify DOM extraction | `src/collect.rs` |
| Modify semantic model | `src/model.rs` |
| Modify accessible name | `src/name.rs` |
| Modify role mapping | `src/role.rs` |
| Add WASM tests | `tests/wasm_dom_tests.rs` |
| Add native tests | `tests/native_*_tests.rs` |

## CONVENTIONS

- `#[allow(clippy::too_many_arguments)]` in `src/collect.rs`
- `#[allow(clippy::type_complexity)]` in `src/name.rs`
- `wasm-bindgen-test` for browser WASM tests: `#![cfg(target_arch = "wasm32")]` + `wasm_bindgen_test_configure!(run_in_browser)`

## ANTI-PATTERNS

- **Generated files in working tree**: `js/dom_semantic_tree.js` (1.1MB) and `.d.ts` are gitignored but present

## NOTES

- Used by page agent for DOM snapshot / automation tests
- WASM tests only run in browser context (`wasm32` target)
- Native tests run with `cargo test` on host target
