#!/usr/bin/env bash
set -euo pipefail

echo "🔨 Building WASM..."
PATH="$HOME/.rustup/toolchains/stable-aarch64-apple-darwin/bin:$PATH" \
  wasm-pack build crates/piccolo-notebook-wasm --target web --out-dir ../../web/pkg

echo "📦 Building web app..."
cd web
npm run build

echo "✅ Build complete! Output in web/dist/"
echo ""
echo "To deploy to GitHub Pages:"
echo "  cd web && npx gh-pages -d dist"
echo ""
echo "To preview locally:"
echo "  cd web && npx vite preview"
