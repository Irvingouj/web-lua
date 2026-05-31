# piccolo

## OVERVIEW

Vendored Lua VM (fork of kyren/piccolo). Pure Rust, stackless execution, gc-arena based garbage collector, built-in fuel system.

## STRUCTURE

```
.
├── src/
│   ├── lib.rs              # Public API exports
│   ├── compiler/           # Lua compiler (8 modules)
│   ├── table/              # Table implementation
│   ├── thread/             # Execution thread + executor
│   ├── async_callback.rs   # Async callback system
│   ├── conversion.rs       # Type conversions (many #[allow] suppressions)
│   ├── error.rs            # Error types
│   ├── fuel.rs             # Fuel system for execution limits
│   ├── gc_arena.rs         # Garbage collector arena
│   ├── opcode.rs           # VM opcodes
│   ├── registry.rs         # Registry (GC leak warnings here)
│   ├── stdlib.rs           # Lua standard library
│   ├── value.rs            # Lua value types
│   └── ...
├── .cargo/                 # Own cargo config (not in workspace)
├── Cargo.lock              # Own lockfile (should not exist in workspace)
├── Cargo.toml              # Standalone crate config
└── target/                 # Own target directory
```

## WHERE TO LOOK

| Task | Location |
|------|----------|
| Modify Lua execution / fuel | `src/fuel.rs`, `src/thread/executor.rs` |
| Modify GC behavior | `src/gc_arena.rs`, `src/registry.rs` |
| Modify Lua compiler | `src/compiler/` |
| Modify table behavior | `src/table/` |
| Add Lua standard library | `src/stdlib.rs` |

## ANTI-PATTERNS

- **Own `.cargo/` and `Cargo.lock`**: A crate inside a workspace should not have its own lockfile or target directory
- **"Do not call methods on this from callbacks!"**: `src/thread/executor.rs` — calling `Executor` methods from callbacks is forbidden
- **"Do not do this!" (registry)**: Storing GC values in registry state causes permanent leaks
- **"Do NOT store registry stashed values within the future"**: `src/async_callback.rs` — causes GC issues
- **Multiple `#[allow(...)]` in `src/conversion.rs`**: `irrefutable_let_patterns`, `unused_variables`, `unused_mut`, `non_snake_case`

## NOTES

- This is a **vendored fork** — do not treat as a standard dependency
- The crate has its own `.cargo/config.toml` and `target/` directory (non-standard for workspace)
- `crates/piccolo/Cargo.lock` exists but should be removed (workspace root lockfile is the single source of truth)
- CI skips this crate in clippy (`cargo clippy` uses explicit `-p` list, not `--workspace`)
- Stackless execution means no C stack for Lua coroutines
