#!/usr/bin/env bash
set -euo pipefail

# ── lua-wasm build script ──────────────────────────────────────────────
# Compiles the Rust+mlua crate to WASM via Emscripten and copies the
# output into the Vite public directory so the web app can load it.

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
BUILD_OUT="$PROJECT_ROOT/public/build"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

info()  { echo -e "${GREEN}[build]${NC} $*"; }
warn()  { echo -e "${YELLOW}[build]${NC} $*"; }
err()   { echo -e "${RED}[build]${NC} $*" >&2; }

# ── 1. Check emcc ──────────────────────────────────────────────────────
if ! command -v emcc &>/dev/null; then
    # Try sourcing emsdk_env.sh
    if [ -f "$HOME/emsdk/emsdk_env.sh" ]; then
        info "Sourcing emsdk_env.sh …"
        source "$HOME/emsdk/emsdk_env.sh"
    else
        err "emcc not found. Install Emscripten SDK first:"
        err "  git clone https://github.com/emscripten-core/emsdk.git ~/emsdk"
        err "  cd ~/emsdk && ./emsdk install latest && ./emsdk activate latest"
        err "  source ~/emsdk/emsdk_env.sh"
        exit 1
    fi
fi
info "emcc: $(emcc --version 2>&1 | head -1)"

# ── 2. Check wasm32-unknown-emscripten target ─────────────────────────
if command -v rustup &>/dev/null; then
    if ! rustup target list --installed | grep -q 'wasm32-unknown-emscripten'; then
        info "Adding wasm32-unknown-emscripten target …"
        rustup target add wasm32-unknown-emscripten
    fi
else
    warn "rustup not found — assuming target is already available"
fi

# ── 3. Set up environment ──────────────────────────────────────────────
# Tell the cc crate (used by mlua/vendored) to use Emscripten tools.
export CC_wasm32_unknown_emscripten="${EMCC:-emcc}"
export CXX_wasm32_unknown_emscripten="${EMXX:-em++}"
export AR_wasm32_unknown_emscripten="${EMAR:-emar}"

# CRITICAL: Lua C code must be compiled with -fwasm-exceptions to avoid
# Emscripten's JavaScript-based invoke_ wrappers (which conflict with
# Rust's wasm-exception-model linking).
export CFLAGS_wasm32_unknown_emscripten="-fwasm-exceptions -fPIC"
export EMCC_CFLAGS="-fwasm-exceptions"

# ── 4. Build ───────────────────────────────────────────────────────────
info "Building lua-wasm for wasm32-unknown-emscripten …"
(cd "$SCRIPT_DIR" && cargo build --target wasm32-unknown-emscripten --release --bin lua_wasm)

# ── 5. Copy outputs ────────────────────────────────────────────────────
mkdir -p "$BUILD_OUT"

TARGET_DIR="$SCRIPT_DIR/target/wasm32-unknown-emscripten/release/deps"

JS_SRC="$TARGET_DIR/lua_wasm.js"
WASM_SRC="$TARGET_DIR/lua_wasm.wasm"

if [ ! -f "$JS_SRC" ]; then
    # Fallback: look for the actual cdylib output name
    JS_SRC="$(find "$TARGET_DIR" -name '*.js' -maxdepth 1 | head -1)"
    WASM_SRC="$(find "$TARGET_DIR" -name '*.wasm' -maxdepth 1 | head -1)"
fi

if [ -z "${JS_SRC:-}" ] || [ ! -f "$JS_SRC" ]; then
    err "Could not find generated .js file in $TARGET_DIR"
    ls -la "$TARGET_DIR"/*.js "$TARGET_DIR"/*.wasm 2>/dev/null || true
    exit 1
fi

cp "$JS_SRC" "$BUILD_OUT/lua_wasm.js"
info "Copied $(basename "$JS_SRC") → $BUILD_OUT/lua_wasm.js"

if [ -n "${WASM_SRC:-}" ] && [ -f "$WASM_SRC" ]; then
    cp "$WASM_SRC" "$BUILD_OUT/lua_wasm.wasm"
    info "Copied $(basename "$WASM_SRC") → $BUILD_OUT/lua_wasm.wasm"
fi

# Also copy any auxiliary files (like .worker.js if generated)
for f in "$TARGET_DIR"/lua_wasm*.worker.js; do
    [ -f "$f" ] && cp "$f" "$BUILD_OUT/" && info "Copied $(basename "$f")"
done

info "Build complete — files in $BUILD_OUT"
ls -lh "$BUILD_OUT"
