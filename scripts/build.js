#!/usr/bin/env node
/**
 * Unified WASM build CLI
 * Builds web-lua and extension-lua WASM targets, bundles them with base64
 * embedded WASM, and copies extension assets to web/public/.
 */

import { execSync } from "child_process";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");

const rustBinDir = path.join(
  process.env.HOME,
  ".rustup/toolchains/stable-aarch64-apple-darwin/bin",
);
const env = {
  ...process.env,
  PATH: `${rustBinDir}:${process.env.PATH}`,
  RUSTC: path.join(rustBinDir, "rustc"),
};

function run(cmd, cwd = rootDir) {
  console.log(`$ ${cmd}`);
  execSync(cmd, { cwd, env, stdio: "inherit" });
}

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

const targets = [
  {
    name: "web-lua",
    crate: "web-lua",
    wasm: "web_lua.wasm",
    outDir: "crates/web-lua/pkg",
    bundleScript: "crates/web-lua/scripts/bundle-wasm.js",
  },
  {
    name: "extension-lua",
    crate: "extension-lua",
    wasm: "extension_lua.wasm",
    outDir: "crates/extension-lua/pkg",
    bundleScript: "crates/extension-lua/scripts/bundle-wasm.js",
  },
  {
    name: "dom-semantic-tree",
    crate: "dom-semantic-tree",
    wasm: "dom_semantic_tree.wasm",
    outDir: "crates/dom-semantic-tree/pkg",
    bundleScript: "crates/dom-semantic-tree/scripts/bundle-wasm.js",
  },
];

async function buildTarget(target) {
  console.log(`\n🔧 Building ${target.name}...`);

  const wasmPath = path.join(
    rootDir,
    "target/wasm32-unknown-unknown/debug",
    target.wasm,
  );
  const outDir = path.join(rootDir, target.outDir);

  run(
    `rustup run stable cargo build --target wasm32-unknown-unknown -p ${target.crate}`,
  );

  ensureDir(outDir);
  run(
    `wasm-bindgen --target web --out-dir ${target.outDir} ${wasmPath}`,
    rootDir,
  );

  const bundleScript = path.join(rootDir, target.bundleScript);
  if (fs.existsSync(bundleScript)) {
    run(`node ${bundleScript} ${target.outDir}`, rootDir);
  }

  // Generate API docs by loading the self-contained WASM module in Node.js
  const jsFile = target.name === "web-lua"
    ? "web_lua.js"
    : target.name === "extension-lua"
      ? "extension_lua.js"
      : null;
  if (jsFile) {
    const jsPath = path.join(outDir, jsFile);
    if (fs.existsSync(jsPath)) {
      try {
        const wasmModule = await import(jsPath);
        if (typeof wasmModule.generateApiDocs === "function") {
          const md = wasmModule.generateApiDocs("markdown");
          const json = wasmModule.generateApiDocs("json");
          const jsDir = path.resolve(target.outDir, "../js");
          if (fs.existsSync(jsDir)) {
            fs.writeFileSync(path.join(jsDir, "API.md"), md);
            fs.writeFileSync(path.join(jsDir, "api.json"), json);
            console.log(`  API.md + api.json generated`);
          }
        }
      } catch (e) {
        console.warn(`  Doc generation skipped: ${e.message}`);
      }
    }
  }

  console.log(`✅ ${target.name} built`);
}

function copyExtensionAssets() {
  console.log("\n📦 Copying extension assets to web/public/...");
  const srcDir = path.join(rootDir, "crates/extension-lua/js");
  const destDir = path.join(rootDir, "web/public");
  ensureDir(destDir);

  for (const file of ["content-script.js", "manifest.json", "background.js"]) {
    const src = path.join(srcDir, file);
    const dest = path.join(destDir, file);
    if (fs.existsSync(src)) {
      fs.copyFileSync(src, dest);
      console.log(`  ${file} → web/public/`);
    }
  }
}

const args = process.argv.slice(2);
const buildAll = args.length === 0;
const buildWeb = buildAll || args.includes("web");
const buildExt = buildAll || args.includes("extension");
const buildDom = buildAll || args.includes("dom");

(async () => {
  if (buildWeb) await buildTarget(targets[0]);
  if (buildExt) await buildTarget(targets[1]);
  if (buildDom) await buildTarget(targets[2]);
  if (buildExt) copyExtensionAssets();

  console.log("\n🎉 All builds complete!");
})();
