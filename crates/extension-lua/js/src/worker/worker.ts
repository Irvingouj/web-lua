// Web Worker for extension-lua
// Loads extension-lua WASM, defines __extension_lua_relay, and communicates with main thread.

import init, {
  ExtensionSession,
  setLogLevel as setWasmLogLevel,
} from "../../extension_lua.js";
import { logger } from "../shared/logger.js";
import { toErrorMessage } from "../shared/errors.js";
import { generateId } from "../shared/id.js";

function safeStringify(value: unknown): string {
  try {
    return JSON.stringify(value);
  } catch {
    return "[unserializable]";
  }
}

let session: ExtensionSession | null = null;
let initialized = false;
let relayTimeoutMs = 60000;
let runCellLock = Promise.resolve();
const pendingRelays = new Map<
  string,
  { resolve: (result: unknown) => void; timer: number; timeoutMs: number }
>();

function postResult(id: string | undefined, data: unknown) {
  if (id == null) return;
  self.postMessage({ type: "result", id, data });
}
function postError(id: string | undefined, err: unknown) {
  if (id == null) return;
  const message = toErrorMessage(err);
  self.postMessage({ type: "error", id, error: message });
}

function rejectPendingRelays(reason: string) {
  const entries = Array.from(pendingRelays);
  for (const [relayId, entry] of entries) {
    self.clearTimeout(entry.timer);
    entry.resolve({
      ok: false,
      error: { message: reason, code: "E_STOPPED" },
    });
    pendingRelays.delete(relayId);
  }
}

function withSessionSync<T>(id: string | undefined, fn: () => T): void {
  try {
    const result = fn();
    postResult(id, result);
  } catch (err) {
    postError(id, err);
  }
}

async function withSessionAsync<T>(
  id: string | undefined,
  fn: () => Promise<T>,
  onError?: (err: unknown) => void,
): Promise<void> {
  try {
    const result = await fn();
    postResult(id, result);
  } catch (err) {
    if (onError) onError(err);
    postError(id, err);
  }
}

interface WorkerSelf extends WorkerGlobalScope {
  __extension_lua_relay?: (cmd: unknown) => Promise<unknown>;
}

const workerSelf = self as unknown as WorkerSelf;

// Define the relay function that extension-lua WASM expects globally
workerSelf.__extension_lua_relay = (cmd: unknown) => {
  const action = (cmd as Record<string, unknown>)?.action;
  logger.debug("[WORKER RELAY] action:", action, "cmd:", safeStringify(cmd));
  return new Promise((resolve) => {
    const relayId = generateId();
    const timeoutMs = relayTimeoutMs; // capture at creation time
    const timer = self.setTimeout(() => {
      if (pendingRelays.has(relayId)) {
        const entry = pendingRelays.get(relayId)!;
        entry.resolve({
          ok: false,
          error: { message: "Relay timeout", code: "E_TIMEOUT" },
        });
        pendingRelays.delete(relayId);
      }
    }, timeoutMs);
    pendingRelays.set(relayId, { resolve, timer, timeoutMs });
    logger.debug("[WORKER RELAY] posting asyncRelay id:", relayId);
    self.postMessage({ type: "asyncRelay", id: relayId, command: cmd });
  });
};

async function initWasm() {
  if (initialized) return;
  await init();
  session = new ExtensionSession();
  setWasmLogLevel(3); // default "error"
  initialized = true;
}

initWasm()
  .then(() => {
    self.postMessage({ type: "ready" });
  })
  .catch((err: unknown) => {
    const message = toErrorMessage(err);
    self.postMessage({ type: "error", error: `WASM init failed: ${message}` });
    setTimeout(() => self.close(), 100);
  });

export type WorkerMessage =
  | { type: "runCell"; id: string; code: string; stdin: string; timeoutMs?: number }
  | { type: "reset"; id: string }
  | { type: "stop"; id?: string }
  | { type: "setFuelLimit"; id?: string; limit: number }
  | { type: "inspectGlobals"; id: string }
  | { type: "loadLibrary"; id: string; source: string }
  | { type: "setLogLevel"; level: number }
  | { type: "setRelayTimeoutMs"; id?: string; ms: number }
  | { type: "setJsDocProviderAvailable"; id?: string; available: boolean }
  | { type: "asyncRelayResult"; id: string; result: unknown };

export type WorkerOutgoingMessage =
  | { type: "ready" }
  | { type: "error"; error: string; id?: string }
  | { type: "result"; id: string; data: unknown }
  | { type: "asyncRelay"; id: string; command: unknown };

self.onmessage = async (e: MessageEvent<WorkerMessage>) => {
  const msg = e.data;

  if (msg.type === "setLogLevel") {
    setWasmLogLevel(msg.level);
    logger.debug("[worker] WASM log level set to", msg.level);
    return;
  }

  if (!initialized || !session) {
    const id = "id" in msg ? msg.id : undefined;
    self.postMessage({
      type: "error",
      id,
      error: "WASM not initialized",
    });
    return;
  }

  switch (msg.type) {
    case "runCell": {
      const p = runCellLock.catch(() => {}).then(async () => {
        const previousTimeout = relayTimeoutMs;
        if (msg.timeoutMs !== undefined && msg.timeoutMs > 0) {
          relayTimeoutMs = msg.timeoutMs;
        }
        try {
          await withSessionAsync(
            msg.id,
            async () => {
              const result = await session!.runCellAsync(msg.code, msg.stdin || "");
              // Ensure we send a plain serializable object through postMessage
              try {
                return JSON.parse(JSON.stringify(result));
              } catch (err) {
                throw new Error(`Failed to serialize WASM result: ${toErrorMessage(err)}`);
              }
            },
            () => rejectPendingRelays("Lua cell stopped; relay cancelled"),
          );
        } finally {
          relayTimeoutMs = previousTimeout;
        }
      });
      runCellLock = p;
      await p;
      break;
    }
    case "reset": {
      const p = runCellLock.catch(() => {}).then(() => {
        withSessionSync(msg.id, () => {
          session!.reset();
          return { ok: true };
        });
      });
      runCellLock = p;
      await p;
      break;
    }
    case "stop": {
      rejectPendingRelays("Worker stopped");
      withSessionSync(msg.id, () => {
        session!.cancel();
        return { ok: true };
      });
      break;
    }
    case "setFuelLimit": {
      const p = runCellLock.catch(() => {}).then(() => {
        withSessionSync(msg.id, () => {
          session!.set_fuel_limit(msg.limit);
          return { ok: true };
        });
      });
      runCellLock = p;
      await p;
      break;
    }
    case "inspectGlobals": {
      const p = runCellLock.catch(() => {}).then(() => {
        withSessionSync(msg.id, () => session!.inspect_globals());
      });
      runCellLock = p;
      await p;
      break;
    }
    case "loadLibrary": {
      const p = runCellLock.catch(() => {}).then(() => {
        withSessionSync(msg.id, () => session!.load_library(msg.source));
      });
      runCellLock = p;
      await p;
      break;
    }
    case "setRelayTimeoutMs": {
      const ms = Number(msg.ms);
      if (!Number.isFinite(ms) || ms <= 0) {
        postError("id" in msg ? msg.id : undefined, new Error("setRelayTimeoutMs requires a positive finite number"));
        break;
      }
      const p = runCellLock.catch(() => {}).then(() => {
        relayTimeoutMs = ms;
        withSessionSync(msg.id, () => {
          session!.setRelayTimeoutMs(ms);
          return { ok: true };
        });
      });
      runCellLock = p;
      await p;
      break;
    }
    case "setJsDocProviderAvailable": {
      const p = runCellLock.catch(() => {}).then(() => {
        withSessionSync(msg.id, () => {
          session!.setJsDocProviderAvailable(msg.available);
          return { ok: true };
        });
      });
      runCellLock = p;
      await p;
      break;
    }
    case "asyncRelayResult": {
      logger.debug("[WORKER RESULT] id:", msg.id, "result:", safeStringify(msg.result));
      const entry = pendingRelays.get(msg.id);
      if (entry) {
        self.clearTimeout(entry.timer);
        pendingRelays.delete(msg.id);
        entry.resolve(msg.result);
      } else {
        logger.warn("[WORKER RESULT] no pending relay for id:", msg.id);
      }
      break;
    }
  }
};
