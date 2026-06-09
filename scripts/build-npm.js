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
    extra: ["README.md"],
  },
  extension: {
    dir: "crates/extension-lua/js",
    wasm: ["extension_lua.js", "extension_lua.d.ts"],
    extra: [
      "content-script.js",
      "background.js",
      "manifest.json",
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
try {
  execSync("tsc", { cwd: absDir, stdio: "inherit" });
} finally {
  // Clean up generated.ts even if tsc fails
  if (generatedPath && fs.existsSync(generatedPath)) {
    fs.unlinkSync(generatedPath);
    console.log("  Cleaned up generated.ts");
  }
}

// Flatten nested tsc output for packages that import from sibling crates.
// When rootDir spans the monorepo, tsc emits files under dist/<pkg.dir>/.
// We hoist the package's own emitted files to the flat dist/ directory.
const nestedPkgDir = path.join(distDir, pkg.dir);
if (fs.existsSync(nestedPkgDir)) {
  const flatten = (srcDir, destDir) => {
    for (const entry of fs.readdirSync(srcDir, { withFileTypes: true })) {
      const src = path.join(srcDir, entry.name);
      const dest = path.join(destDir, entry.name);
      if (entry.isDirectory()) {
        if (!fs.existsSync(dest)) fs.mkdirSync(dest, { recursive: true });
        flatten(src, dest);
      } else {
        if (fs.existsSync(dest)) {
          const srcHash = fs.readFileSync(src);
          const destHash = fs.readFileSync(dest);
          if (!srcHash.equals(destHash)) {
            console.warn(`  Flatten collision: ${path.relative(distDir, dest)} (src differs from dest)`);
          }
        }
        fs.copyFileSync(src, dest);
      }
    }
  };
  flatten(nestedPkgDir, distDir);
  const nestedCratesDir = path.join(distDir, "crates");
  if (fs.existsSync(nestedCratesDir)) {
    fs.rmSync(nestedCratesDir, { recursive: true });
  }
  console.log("  Flattened nested tsc output");
}
// Strip ESM marker from content-script.js so it works as a classic MV3 script
function stripEsmMarker(filePath) {
  if (fs.existsSync(filePath)) {
    let cs = fs.readFileSync(filePath, "utf-8");
    cs = cs.replace(/export\s*\{\s*\};?\s*$/, "");
    fs.writeFileSync(filePath, cs);
    console.log(`  Stripped ESM marker from ${path.basename(filePath)}`);
  }
}
stripEsmMarker(path.join(absDir, "content-script.js"));
stripEsmMarker(path.join(distDir, "content-script.js"));

// Bundle content-script.ts into a single classic script (IIFE) so it
// can be injected by chrome.scripting.executeScript without ESM errors.
const esbuildBin = path.join(rootDir, "web", "node_modules", ".bin", "esbuild");
if (fs.existsSync(esbuildBin)) {
  const bundleCmd = [
    esbuildBin,
    path.join(absDir, "content-script.ts"),
    "--bundle",
    "--platform=browser",
    "--format=iife",
    `--outfile=${path.join(distDir, "content-script.js")}`,
  ].join(" ");
  try {
    execSync(bundleCmd, { cwd: rootDir, stdio: "pipe" });
    console.log("  Bundled content-script.js with esbuild");
  } catch (bundleErr) {
    console.warn("  esbuild bundle failed:", bundleErr.message);
  }
} else {
  console.warn("  esbuild not found, skipping content-script bundle");
}

// Copy WASM bundles and static assets into dist/
for (const file of [...pkg.wasm, ...pkg.extra]) {
  const dest = path.join(distDir, file);
  // Skip if tsc already emitted this file into dist/
  if (fs.existsSync(dest)) {
    console.log(`  Already in dist/: ${file}`);
    continue;
  }
  const src = path.join(absDir, file);
  if (fs.existsSync(src)) {
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.copyFileSync(src, dest);
    console.log(`  Copied ${file} → dist/`);
  } else {
    console.warn(`  Skipped missing file: ${file}`);
  }
}

// Patch worker URL in compiled output: .ts → .js
// NOTE: tsc declaration emit sometimes captures the runtime `new URL(...)`
// expression from our source. This is a pragmatic workaround — the proper fix
// is to restructure Worker construction so the type declaration doesn't inline
// the implementation detail. See maintainability review item 3.4.
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

console.log(`✅ ${target} JS built in ${distDir}`);
