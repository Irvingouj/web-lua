#!/usr/bin/env node
/**
 * Post-process wasm-bindgen output to create a self-contained JS module.
 * Base64-embeds the .wasm binary and auto-calls initSync() so consumers
 * don't need to handle a separate file or initialization.
 */

import fs from 'fs';
import path from 'path';

const pkgDir = process.argv[2] || 'crates/extension-lua/pkg';
const wasmPath = path.join(pkgDir, 'extension_lua_bg.wasm');
const jsPath = path.join(pkgDir, 'extension_lua.js');
const dtsPath = path.join(pkgDir, 'extension_lua.d.ts');

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
js = js.replace(
    /if \(module_or_path === undefined\) \{\s*module_or_path = new URL\('extension_lua_bg\.wasm', import\.meta\.url\);\s*\}/,
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

// Remove the separate .wasm file so it can't accidentally be referenced
fs.unlinkSync(wasmPath);
if (fs.existsSync(wasmPath + '.d.ts')) {
    fs.unlinkSync(wasmPath + '.d.ts');
}

// Copy bundled JS and .d.ts into js/ directory for self-contained packaging
const jsDir = path.resolve(pkgDir, '../js');
if (fs.existsSync(jsDir)) {
    fs.copyFileSync(jsPath, path.join(jsDir, 'extension_lua.js'));
    if (fs.existsSync(dtsPath)) {
        fs.copyFileSync(dtsPath, path.join(jsDir, 'extension_lua.d.ts'));
    }
    console.log(`Copied bundled files to ${jsDir}`);
}

console.log(`Self-contained build ready at ${pkgDir}`);
console.log(`  JS size: ${(fs.statSync(jsPath).size / 1024 / 1024).toFixed(2)} MB`);
