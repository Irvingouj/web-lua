# Troubleshooting Guide

Quick lookup for common errors when building or running the Lua Playground.

## Build Errors

### `emcc: command not found`

```bash
source ~/emsdk/emsdk_env.sh
```

Add to your shell profile to persist:
```bash
echo 'source "$HOME/emsdk/emsdk_env.sh"' >> ~/.zprofile
```

---

### `can't find crate for 'std'`

You're using Homebrew's `cargo` instead of rustup's.

```bash
# Verify which cargo is being used
which cargo
# Should be: /Users/<you>/.rustup/toolchains/stable-aarch64-apple-darwin/bin/cargo
# NOT: /opt/homebrew/bin/cargo

# Fix:
export PATH="$HOME/.rustup/toolchains/stable-aarch64-apple-darwin/bin:$HOME/.cargo/bin:$PATH"
```

---

### `wasm32-unknown-emscripten target may not be installed`

```bash
rustup target add wasm32-unknown-emscripten
```

If `rustup` isn't found, install it:
```bash
brew install rustup
rustup-init -y
```

---

### `relocation R_WASM_MEMORY_ADDR_SLEB ... recompile with -fPIC`

You're using `crate-type = ["cdylib"]`. Switch to `bin`:

```toml
# Cargo.toml
[lib]
crate-type = ["lib"]

[[bin]]
name = "lua_wasm"
path = "src/main.rs"
```

---

### `invoke_ functions exported but exceptions and longjmp are both disabled`

The Lua C code was compiled without `-fwasm-exceptions`. Set these environment variables before building:

```bash
export CFLAGS_wasm32_unknown_emscripten="-fwasm-exceptions -fPIC"
export EMCC_CFLAGS="-fwasm-exceptions"
```

Or use `build.sh` which sets them automatically.

---

### `undefined symbol: __cxa_find_matching_catch_3`

Add to `.cargo/config.toml`:

```toml
"-C", "link-args=-sERROR_ON_UNDEFINED_SYMBOLS=0",
```

This is safe with `panic=abort`. The symbol is referenced but never called.

---

### `DISABLE_EXCEPTION_CATCHING=0 is not compatible with -fwasm-exceptions`

You're using Emscripten 5.x. Downgrade to 3.1.x:

```bash
cd ~/emsdk
./emsdk install 3.1.74
./emsdk activate 3.1.74
source ~/emsdk/emsdk_env.sh
```

---

### `symbol exported via --export not found: run_lua`

The linker stripped `run_lua` because nothing references it. Make sure `main.rs` contains:

```rust
fn main() {
    let _ = lua_wasm::run_lua as extern "C" fn(*const i8, *const i8) -> *mut i8;
}
```

---

## Runtime Errors

### WASM fails to load in browser (CORS / MIME errors)

Don't open `index.html` directly from the filesystem. Use the Vite dev server:

```bash
npm run dev
# → http://localhost:3000
```

---

### Worker says "WASM init failed"

1. Check browser console for the actual error
2. Verify `public/build/lua_wasm.js` and `lua_wasm.wasm` exist
3. Verify the WASM file is served with `Content-Type: application/wasm`
4. Try rebuilding: `npm run build:rust`

---

### Infinite loop freezes the tab

Click **Stop** — it terminates the Web Worker. If the button is unresponsive, close and reopen the tab.

To test: `while true do end` → should be killable via Stop.

---

### `print(os)` shows `nil` but `require("x")` crashes

Both `os` and `require` are set to `nil`. Printing `nil` is fine. Calling `nil` as a function throws:

```
attempt to call a nil value (global 'require')
```

This is correct behavior — these APIs are intentionally disabled.

---

### Old globals persist between runs

Each run creates a fresh `Lua` state. If you see globals persisting, check that the Rust code isn't caching the Lua state. The `run_lua_inner` function must create a new `Lua::new_with(...)` on every call.

---

## Build Environment

### Verify everything is set up

```bash
# Emscripten
emcc --version
# Should show: emcc 3.1.74

# Rust
rustc --version
# Should show: 1.95.0 or later

# Target
rustup target list --installed | grep emscripten
# Should show: wasm32-unknown-emscripten

# Node
node --version
# Should show: v18+ or v22+
```

### Clean rebuild from scratch

```bash
cd rust
cargo clean
npm run build:rust
npm run dev
```
