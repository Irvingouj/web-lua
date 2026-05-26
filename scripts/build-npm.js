#!/usr/bin/env node
/**
 * Build JS/TS packages for npm publishing.
 * Compiles .ts sources with tsc, copies WASM bundles and static assets into dist/.
 */

import fs from "fs";
import path from "path";
import { execSync } from "child_process";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");

const packages = {
  dom: {
    dir: "crates/dom-semantic-tree/js",
    wasm: ["dom_semantic_tree.js", "dom_semantic_tree.d.ts"],
    extra: ["README.md"],
  },
  web: {
    dir: "crates/web-lua/js",
    wasm: ["web_lua.js", "web_lua.d.ts"],
    extra: ["API.md", "api.json", "README.md"],
  },
  extension: {
    dir: "crates/extension-lua/js",
    wasm: ["extension_lua.js", "extension_lua.d.ts"],
    extra: [
      "content-script.js",
      "background.js",
      "manifest.json",
      "API.md",
      "api.json",
      "README.md",
    ],
    generated: "../../../web/src/types/generated.ts",
  },
};

const target = process.argv[2];
if (!target || !packages[target]) {
  console.error("Usage: node scripts/build-npm.js [dom|web|extension]");
  process.exit(1);
}

const pkg = packages[target];
const absDir = path.resolve(rootDir, pkg.dir);

// Clean dist/
const distDir = path.join(absDir, "dist");
if (fs.existsSync(distDir)) {
  fs.rmSync(distDir, { recursive: true });
}

// Copy generated.ts for extension-lua before compilation
let generatedPath = null;
if (pkg.generated) {
  const src = path.resolve(absDir, pkg.generated);
  generatedPath = path.join(absDir, "generated.ts");
  if (!fs.existsSync(src)) {
    console.error(`Missing generated types: ${src}`);
    process.exit(1);
  }
  fs.copyFileSync(src, generatedPath);
  console.log("  Copied generated.ts");
}

// Run tsc
execSync("tsc", { cwd: absDir, stdio: "inherit" });

// Copy WASM bundles and static assets into dist/
for (const file of [...pkg.wasm, ...pkg.extra]) {
  const src = path.join(absDir, file);
  const dest = path.join(distDir, file);
  if (fs.existsSync(src)) {
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.copyFileSync(src, dest);
    console.log(`  Copied ${file} → dist/`);
  } else {
    console.warn(`  Skipped missing file: ${file}`);
  }
}

// Patch worker URL in compiled output: .ts → .js
const indexJs = path.join(distDir, "index.js");
const indexDts = path.join(distDir, "index.d.ts");
if (fs.existsSync(indexJs)) {
  let content = fs.readFileSync(indexJs, "utf-8");
  content = content.replace(/new URL\("\.\/worker\.ts"/g, 'new URL("./worker.js"');
  fs.writeFileSync(indexJs, content);
  console.log("  Patched worker URL in dist/index.js");
}
if (fs.existsSync(indexDts)) {
  let content = fs.readFileSync(indexDts, "utf-8");
  content = content.replace(/new URL\("\.\/worker\.ts"/g, 'new URL("./worker.js"');
  fs.writeFileSync(indexDts, content);
  console.log("  Patched worker URL in dist/index.d.ts");
}

// Clean up generated.ts
if (generatedPath && fs.existsSync(generatedPath)) {
  fs.unlinkSync(generatedPath);
  console.log("  Cleaned up generated.ts");
}

console.log(`✅ ${target} JS built in ${distDir}`);
