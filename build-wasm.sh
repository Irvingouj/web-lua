#!/bin/bash
set -e

echo "🔧 Building piccolo-notebook-wasm for wasm32-unknown-unknown..."

# Ensure we use rustup's cargo (not Homebrew's)
export PATH="/Users/oujunyi/.rustup/toolchains/stable-aarch64-apple-darwin/bin:$PATH"

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR"

# Build release WASM
cargo build --target wasm32-unknown-unknown -p piccolo-notebook-wasm --release --manifest-path "$SCRIPT_DIR/Cargo.toml"

# Generate TypeScript types from Rust
echo "📝 Generating TypeScript types..."
cargo test -p piccolo-notebook-core --manifest-path "$SCRIPT_DIR/Cargo.toml" -- --test-threads=1 > /dev/null 2>&1 || true

# Generate JS bindings
echo "📦 Generating wasm-bindgen output..."
mkdir -p web/pkg
wasm-bindgen \
  --target web \
  --out-dir web/pkg \
  --out-name piccolo_notebook \
  target/wasm32-unknown-unknown/release/piccolo_notebook_wasm.wasm

# Report output
WASM_SIZE=$(wc -c < web/pkg/piccolo_notebook_bg.wasm | tr -d ' ')
JS_SIZE=$(wc -c < web/pkg/piccolo_notebook.js | tr -d ' ')
echo "✅ Built:"
echo "   WASM: $(numfmt --to=iec $WASM_SIZE 2>/dev/null || echo ${WASM_SIZE} bytes)"
echo "   JS:   $(numfmt --to=iec $JS_SIZE 2>/dev/null || echo ${JS_SIZE} bytes)"
