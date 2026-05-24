#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

echo "🔨 Building Lua notebook WASM..."
PATH="$HOME/.rustup/toolchains/stable-aarch64-apple-darwin/bin:$PATH" \
  wasm-pack build crates/piccolo-notebook-wasm --target web --out-dir ../../web/pkg

echo "🔨 Building dom-snapshot WASM..."
PATH="$HOME/.rustup/toolchains/stable-aarch64-apple-darwin/bin:$PATH" \
  wasm-pack build crates/dom-snapshot-wasm --target bundler --out-dir ../../web/pkg-dom

echo "📦 Building web app (extension mode)..."
cd web
npm run build

# Copy dom-snapshot WASM into dist for extension packaging
echo "📦 Copying dom-snapshot WASM into dist..."
cp -r ../web/pkg-dom/dom_snapshot_wasm.js ../web/pkg-dom/dom_snapshot_wasm_bg.js ../web/pkg-dom/dom_snapshot_wasm_bg.wasm dist/ 2>/dev/null || true

echo "✅ Extension built at web/dist/"
echo ""
echo "To load as unpacked extension:"
echo "  1. Open chrome://extensions/"
echo "  2. Enable 'Developer mode'"
echo "  3. Click 'Load unpacked'"
echo "  4. Select the web/dist/ directory"
