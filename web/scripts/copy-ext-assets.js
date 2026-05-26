#!/usr/bin/env node
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "../..");
const publicDir = path.join(rootDir, "web", "public");

const assets = [
  "crates/extension-lua/js/content-script.js",
  "crates/extension-lua/js/manifest.json",
  "crates/extension-lua/js/background.js",
];

for (const asset of assets) {
  const src = path.join(rootDir, asset);
  const dest = path.join(publicDir, path.basename(asset));
  fs.copyFileSync(src, dest);
  console.log(`Copied ${asset} → public/${path.basename(asset)}`);
}
