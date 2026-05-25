import type { Notebook } from "./notebook";
import { createCell } from "./notebook";

/**
 * Creates a showcase notebook demonstrating all notebook features.
 * Activated via ?showcase=true query parameter.
 */
export function createShowcaseNotebook(): Notebook {
  return {
    version: 1,
    cells: [
      // ─── Section 1: Welcome ─────────────────────────────────────
      createCell(
        "# 🌙 Lua Notebook\n\n" +
          "An interactive Lua environment running entirely in the browser via **WebAssembly**.\n\n" +
          "### What you can do\n" +
          "- Write and execute **Lua code** in code cells\n" +
          "- Add **Markdown** cells for documentation\n" +
          "- Use built-in APIs: `json`, `web.fetch`, `web.storage`, `crypto`\n" +
          "- Everything runs client-side — **no server required**\n\n" +
          "Press `Ctrl+Enter` to run a code cell. Double-click this text to edit the markdown.",
        "markdown",
      ),

      // ─── Section 2: Basic Lua ───────────────────────────────────
      createCell(
        "## Variables & Control Flow\n\n" +
          "Lua basics: variables, loops, conditionals.",
        "markdown",
      ),
      createCell(
        "-- Variables\n" +
          'local name = "Lua"\n' +
          "local version = 5.4\n" +
          'print("Hello from " .. name .. " " .. version .. "!")\n\n' +
          "-- Loop\n" +
          "for i = 1, 5 do\n" +
          '  print("  count: " .. i)\n' +
          "end",
      ),

      // ─── Section 3: Functions ───────────────────────────────────
      createCell(
        "## Functions & Recursion\n\n" +
          "Lua has first-class functions with closures.",
        "markdown",
      ),
      createCell(
        "-- Recursive fibonacci\n" +
          "function fib(n)\n" +
          "  if n <= 1 then return n end\n" +
          "  return fib(n - 1) + fib(n - 2)\n" +
          "end\n\n" +
          "for i = 0, 10 do\n" +
          '  print("fib(" .. i .. ") = " .. fib(i))\n' +
          "end",
      ),

      // ─── Section 4: Tables ──────────────────────────────────────
      createCell(
        "## Tables\n\n" +
          "Tables are Lua's only data structure — they work as arrays, dictionaries, and objects.",
        "markdown",
      ),
      createCell(
        "-- Table as dictionary\n" +
          "local person = {\n" +
          '  name = "Ada",\n' +
          "  age = 36,\n" +
          '  skills = { "math", "programming", "poetry" }\n' +
          "}\n\n" +
          'print(person.name .. " is " .. person.age .. " years old")\n' +
          'print("Skills:")\n' +
          "for i, skill in ipairs(person.skills) do\n" +
          '  print("  " .. i .. ". " .. skill)\n' +
          "end",
      ),

      // ─── Section 5: JSON ────────────────────────────────────────
      createCell(
        "## JSON Encoding & Decoding\n\n" +
          "Built-in `json` module for working with structured data.",
        "markdown",
      ),
      createCell(
        "local data = {\n" +
          '  name = "web-lua",\n' +
          '  version = "0.1.0",\n' +
          '  features = { "notebook", "wasm", "async" }\n' +
          "}\n\n" +
          "-- Encode to JSON\n" +
          "local encoded = json.encode(data)\n" +
          'print("JSON: " .. encoded)\n\n' +
          "-- Decode back\n" +
          "local decoded = json.decode(encoded)\n" +
          'print("Decoded name: " .. decoded.name)\n' +
          'print("Features: " .. table.concat(decoded.features, ", "))',
      ),

      // ─── Section 6: HTTP Fetch ──────────────────────────────────
      createCell(
        "## 🌐 HTTP Requests\n\n" +
          "Fetch data from any public API using `web.fetch`.\n\n" +
          "> **Note:** This runs in a sandboxed environment. Some APIs may block cross-origin requests.",
        "markdown",
      ),
      createCell(
        "-- Fetch a public API\n" +
          "local ok, result = pcall(function()\n" +
          "  return web.fetch({\n" +
          '    url = "https://httpbin.org/get",\n' +
          '    method = "GET"\n' +
          "  })\n" +
          "end)\n\n" +
          "if ok then\n" +
          '  print("Status: " .. result.status)\n' +
          "  local body = json.decode(result.body)\n" +
          '  print("Origin: " .. (body.origin or "unknown"))\n' +
          '  print("User-Agent: " .. (body.headers["User-Agent"] or "unknown"))\n' +
          "else\n" +
          '  print("Fetch blocked (CORS): " .. tostring(result))\n' +
          '  print("This is expected in sandboxed environments!")\n' +
          "end",
      ),

      // ─── Section 7: Storage ─────────────────────────────────────
      createCell(
        "## 💾 Local Storage\n\n" +
          "Persist data across cells using `web.storage`.\n\n" +
          "Data is stored in the browser's `localStorage`.",
        "markdown",
      ),
      createCell(
        "-- Set a value\n" +
          'web.storage.set("demo_key", "Hello from Lua!")\n' +
          'web.storage.set("counter", "42")\n\n' +
          "-- Get it back\n" +
          'local val = web.storage.get("demo_key")\n' +
          'print("Stored value: " .. tostring(val))\n\n' +
          "-- List all keys\n" +
          "local keys = web.storage.list()\n" +
          'print("Storage keys: " .. table.concat(keys, ", "))',
      ),

      // ─── Section 8: Crypto ──────────────────────────────────────
      createCell(
        "## 🔐 Cryptography\n\n" +
          "Built-in `crypto` module for hashing and encoding.",
        "markdown",
      ),
      createCell(
        "-- SHA-256 hash\n" +
          "print(\"SHA-256 of 'hello':\")\n" +
          'print("  " .. crypto.sha256("hello"))\n\n' +
          "-- MD5 hash\n" +
          "print(\"MD5 of 'hello':\")\n" +
          'print("  " .. crypto.md5("hello"))\n\n' +
          "-- HMAC-SHA256\n" +
          'print("HMAC-SHA256(key, message):")\n' +
          'print("  " .. crypto.hmac_sha256("secret", "message"))\n\n' +
          "-- Hex encode/decode\n" +
          'local hex = crypto.hex_encode("Hello, Lua!")\n' +
          'print("Hex encoded: " .. hex)\n' +
          'print("Decoded back: " .. crypto.hex_decode(hex))',
      ),

      // ─── Section 9: URL utilities ───────────────────────────────
      createCell(
        "## 🔗 URL Utilities\n\n" + "Parse and construct URLs with `web.url`.",
        "markdown",
      ),
      createCell(
        "-- Parse a URL\n" +
          'local parsed = web.url.parse("https://example.com:8080/path?q=lua&sort=asc#section")\n' +
          'print("Protocol: " .. tostring(parsed.scheme))\n' +
          'print("Host: " .. tostring(parsed.host))\n' +
          'print("Port: " .. tostring(parsed.port))\n' +
          'print("Path: " .. tostring(parsed.path))\n' +
          'print("Query: " .. tostring(parsed.query))\n' +
          'print("Fragment: " .. tostring(parsed.fragment))',
      ),

      // ─── Section 10: Async & Sleep ──────────────────────────────
      createCell(
        "## ⏱ Async Operations\n\n" +
          "Built-in `web.sleep` for async delays. The notebook handles async yield/resume transparently.",
        "markdown",
      ),
      createCell(
        "-- Async sleep\n" +
          'print("Starting...")\n' +
          "web.sleep(500)  -- 500ms pause\n" +
          'print("Halfway there...")\n' +
          "web.sleep(500)  -- another 500ms\n" +
          'print("Done! Total: ~1 second")',
      ),

      // ─── Footer ─────────────────────────────────────────────────
      createCell(
        "---\n\n" +
          "### 🚀 What next?\n\n" +
          "- Edit any cell above and re-run it\n" +
          "- Add new cells with **+ Code** or **+ Markdown**\n" +
          "- Click **↻ Restart** to reset the Lua state\n" +
          "- Use **↓ Save** to download your notebook as JSON\n\n" +
          "Built with [piccolo](https://github.com/kyren/piccolo) (Lua VM in Rust → WebAssembly)",
        "markdown",
      ),
    ],
    metadata: {
      runtime: "piccolo",
      language: "lua-like",
    },
  };
}
