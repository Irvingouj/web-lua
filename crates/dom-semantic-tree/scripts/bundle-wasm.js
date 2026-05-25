#!/usr/bin/env node
/**
 * Post-process wasm-bindgen output to create a self-contained JS module.
 * Base64-embeds the .wasm binary and auto-calls initSync().
 */

import fs from 'fs';
import path from 'path';

const pkgDir = process.argv[2] || 'crates/dom-semantic-tree/pkg';
const wasmPath = path.join(pkgDir, 'dom_semantic_tree_bg.wasm');
const jsPath = path.join(pkgDir, 'dom_semantic_tree.js');
const dtsPath = path.join(pkgDir, 'dom_semantic_tree.d.ts');

if (!fs.existsSync(wasmPath)) {
    console.error('WASM file not found:', wasmPath);
    process.exit(1);
}

const wasmBytes = fs.readFileSync(wasmPath);
const base64 = wasmBytes.toString('base64');

const chunkSize = 120;
const chunks = [];
for (let i = 0; i < base64.length; i += chunkSize) {
    chunks.push(base64.slice(i, i + chunkSize));
}

let js = fs.readFileSync(jsPath, 'utf-8');

js = js.replace(
    /if \(module_or_path === undefined\) \{\s*module_or_path = new URL\('dom_semantic_tree_bg\.wasm', import\.meta\.url\);\s*\}/,
    `// Self-contained: WASM is base64-embedded below`
);

const embedBlock = `

// Self-contained WASM payload

const WASM_BASE64 = [
${chunks.map(c => `    "${c}"`).join(',\n')}
].join("");

const WASM_BYTES = Uint8Array.from(atob(WASM_BASE64), c => c.charCodeAt(0));
initSync(WASM_BYTES);
`;

fs.writeFileSync(jsPath, js + embedBlock);

fs.unlinkSync(wasmPath);
if (fs.existsSync(wasmPath + '.d.ts')) {
    fs.unlinkSync(wasmPath + '.d.ts');
}

const jsDir = path.resolve(pkgDir, '../js');
if (fs.existsSync(jsDir)) {
    fs.copyFileSync(jsPath, path.join(jsDir, 'dom_semantic_tree.js'));
    if (fs.existsSync(dtsPath)) {
        fs.copyFileSync(dtsPath, path.join(jsDir, 'dom_semantic_tree.d.ts'));
    }
    console.log(`Copied bundled files to ${jsDir}`);
}

console.log(`Self-contained build ready at ${pkgDir}`);
console.log(`  JS size: ${(fs.statSync(jsPath).size / 1024 / 1024).toFixed(2)} MB`);
