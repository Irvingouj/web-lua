// Web Worker for extension-lua
// Loads extension-lua WASM, defines __extension_lua_relay, and communicates with main thread.

import init, { ExtensionSession } from "./extension_lua.js";

let session: ExtensionSession | null = null;
let initialized = false;
const pendingRelays = new Map<string, (result: unknown) => void>();

function generateId(): string {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

interface WorkerSelf extends WorkerGlobalScope {
  __extension_lua_relay?: (cmd: unknown) => Promise<unknown>;
}

const workerSelf = self as unknown as WorkerSelf;

// Define the relay function that extension-lua WASM expects globally
workerSelf.__extension_lua_relay = (cmd: unknown) => {
  return new Promise((resolve) => {
    const relayId = generateId();
    pendingRelays.set(relayId, resolve);
    self.postMessage({ type: "asyncRelay", id: relayId, command: cmd });
  });
};

async function initWasm() {
  if (initialized) return;
  await init();
  session = new ExtensionSession();
  initialized = true;
}

initWasm()
  .then(() => {
    self.postMessage({ type: "ready" });
  })
  .catch((err: unknown) => {
    const message = err instanceof Error ? err.message : String(err);
    self.postMessage({ type: "error", error: `WASM init failed: ${message}` });
  });

export type WorkerMessage =
  | { type: "runCell"; id: string; code: string; stdin: string }
  | { type: "reset"; id: string }
  | { type: "stop"; id: string }
  | { type: "setFuelLimit"; id?: string; limit: number }
  | { type: "inspectGlobals"; id: string }
  | { type: "loadLibrary"; id: string; source: string }
  | { type: "asyncRelayResult"; id: string; result: unknown };

self.onmessage = async (e: MessageEvent<WorkerMessage>) => {
  const msg = e.data;

  if (!initialized || !session) {
    self.postMessage({
      type: "error",
      id: msg.id,
      error: "WASM not initialized",
    });
    return;
  }

  switch (msg.type) {
    case "runCell": {
      try {
        const result = await session.runCellAsync(msg.code, msg.stdin || "");
        // Ensure we send a plain serializable object through postMessage
        const plain = JSON.parse(JSON.stringify(result));
        self.postMessage({ type: "result", id: msg.id, data: plain });
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        self.postMessage({ type: "error", id: msg.id, error: message });
      }
      break;
    }
    case "reset": {
      try {
        session.reset();
        self.postMessage({ type: "result", id: msg.id, data: { ok: true } });
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        self.postMessage({ type: "error", id: msg.id, error: message });
      }
      break;
    }
    case "stop": {
      self.postMessage({ type: "result", id: msg.id, data: { ok: true } });
      break;
    }
    case "setFuelLimit": {
      try {
        session.set_fuel_limit(msg.limit);
        if (msg.id) {
          self.postMessage({ type: "result", id: msg.id, data: { ok: true } });
        }
      } catch (err: unknown) {
        if (msg.id) {
          const message = err instanceof Error ? err.message : String(err);
          self.postMessage({ type: "error", id: msg.id, error: message });
        }
      }
      break;
    }
    case "inspectGlobals": {
      try {
        const snap = session.inspectGlobals();
        self.postMessage({ type: "result", id: msg.id, data: snap });
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        self.postMessage({ type: "error", id: msg.id, error: message });
      }
      break;
    }
    case "loadLibrary": {
      try {
        const result = session.loadLibrary(msg.source);
        self.postMessage({ type: "result", id: msg.id, data: result });
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        self.postMessage({ type: "error", id: msg.id, error: message });
      }
      break;
    }
    case "asyncRelayResult": {
      const resolve = pendingRelays.get(msg.id);
      if (resolve) {
        pendingRelays.delete(msg.id);
        resolve(msg.result);
      }
      break;
    }
  }
};
