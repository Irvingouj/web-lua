#!/usr/bin/env node
/**
 * Post-process wasm-pack output to create a self-contained JS module.
 * Base64-embeds the .wasm binary and auto-calls initSync() so consumers
 * don't need to handle a separate file or initialization.
 */

import fs from 'fs';
import path from 'path';

const pkgDir = process.argv[2] || 'web/pkg';
const wasmPath = path.join(pkgDir, 'piccolo_notebook_wasm_bg.wasm');
const jsPath = path.join(pkgDir, 'piccolo_notebook_wasm.js');

if (!fs.existsSync(wasmPath)) {
    console.error('WASM file not found:', wasmPath);
    process.exit(1);
}

const wasmBytes = fs.readFileSync(wasmPath);
const base64 = wasmBytes.toString('base64');

// Chunk base64 to avoid extremely long lines
const chunkSize = 120;
const chunks = [];
for (let i = 0; i < base64.length; i += chunkSize) {
    chunks.push(base64.slice(i, i + chunkSize));
}

let js = fs.readFileSync(jsPath, 'utf-8');

// Remove the default URL fallback that tries to fetch the separate .wasm file.
// Replace:
//   module_or_path = new URL('piccolo_notebook_wasm_bg.wasm', import.meta.url);
// with inline base64 bytes.
js = js.replace(
    /if \(module_or_path === undefined\) \{\s*module_or_path = new URL\('piccolo_notebook_wasm_bg\.wasm', import\.meta\.url\);\s*\}/,
    `// Self-contained: WASM is base64-embedded below`
);

// Append base64 payload + auto-init at the very end
const embedBlock = `

// ─── Self-contained WASM payload ──────────────────────────────

const WASM_BASE64 = [
${chunks.map(c => `    "${c}"`).join(',\n')}
].join("");

const WASM_BYTES = Uint8Array.from(atob(WASM_BASE64), c => c.charCodeAt(0));
initSync(WASM_BYTES);
`;

fs.writeFileSync(jsPath, js + embedBlock);

// Update package.json: scoped name, correct files, no side effects
const pkgJsonPath = path.join(pkgDir, 'package.json');
const pkg = JSON.parse(fs.readFileSync(pkgJsonPath, 'utf-8'));
pkg.name = '@pi-oxide/piccolo-notebook-wasm';
pkg.version = process.argv[3] || pkg.version;
pkg.description = 'Self-contained WebAssembly Lua notebook engine with typed TypeScript APIs';
pkg.files = ['piccolo_notebook_wasm.js', 'piccolo_notebook_wasm.d.ts', 'README.md'];
pkg.main = 'piccolo_notebook_wasm.js';
pkg.types = 'piccolo_notebook_wasm.d.ts';
pkg.sideEffects = [];
delete pkg.repository;
delete pkg.license;

fs.writeFileSync(pkgJsonPath, JSON.stringify(pkg, null, 2) + '\n');

// Remove the separate .wasm file so it can't accidentally be referenced
fs.unlinkSync(wasmPath);
fs.unlinkSync(wasmPath + '.d.ts');

console.log(`Self-contained build ready at ${pkgDir}`);
console.log(`  JS size: ${(fs.statSync(jsPath).size / 1024 / 1024).toFixed(2)} MB`);
