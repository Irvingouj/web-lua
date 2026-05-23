// ── Web Worker for Lua WASM execution ──────────────────────────────────
// Loads the Emscripten module and runs Lua code off the main thread.

/* eslint-disable no-undef */
importScripts("/build/lua_wasm.js");

let Module = null;

(async function init() {
  try {
    Module = await createLuaModule({
      locateFile: function (path) {
        return "/build/" + path;
      },
    });
    postMessage({ type: "ready" });
  } catch (err) {
    postMessage({ type: "error", error: "WASM init failed: " + err });
  }
})();

self.onmessage = function (e) {
  if (!Module) {
    postMessage({ type: "error", error: "Module not ready" });
    return;
  }

  var code = e.data.code;
  var stdin = e.data.stdin;

  try {
    var resultJson = Module.ccall(
      "run_lua",
      "string",
      ["string", "string"],
      [code, stdin]
    );
    var parsed = JSON.parse(resultJson);
    postMessage({ type: "result", data: parsed });
  } catch (err) {
    postMessage({ type: "error", error: String(err) });
  }
};
