// JS wrapper for @pi-oxide/extension-lua
// Provides init() / stop_with() lifecycle API as specified in API_REFACTOR_PLAN.md.
// ExtensionSession.init() spawns the Worker internally, starts the main-thread
// runner loop, and returns a proxy + runner promise.

import type { CellResult, WasmGlobalsSnapshot } from "../../extension_lua.js";
import { logger } from "../shared/logger.js";
import { toErrorMessage } from "../shared/errors.js";
import { generateId } from "../shared/id.js";
import { initExtensionListeners, removeExtensionListeners } from "./runner.js";
import {
  dispatchTool,
  freezeRegistry,
  isRegistryFrozen,
  listTools,
  registerHostHandler,
  registerHostHandlers,
  registerTool,
  type Command,
} from "../shared/tool-registry.js";
import type { WorkerMessage, WorkerOutgoingMessage } from "../worker/worker.js";

export type {
  CellResult as LuaRunResult,
  WasmGlobalsSnapshot as LuaGlobalsSnapshot,
};
export { freezeRegistry, listTools, registerHostHandler, registerHostHandlers, registerTool };

/**
 * ExtensionSession proxy that lives on the main thread.
 * The actual WASM ExtensionSession runs inside a Web Worker;
 * this proxy forwards calls via postMessage and awaits responses.
 */
export class ExtensionSession {
  private worker: Worker | null = null;
  private pendingCalls = new Map<
    string,
    { resolve: (v: unknown) => void; reject: (e: Error | unknown) => void }
  >();
  private disposed = false;
  private onCleanupComplete: (() => void) | null = null;
  private drainPending: (() => void) | null = null;

  private constructor() {}

  /**
   * Initialize the extension-lua runtime.
   * Automatically detects extension context, spawns the Worker,
   * starts the main-thread runner loop, and returns [session, runner].
   *
   * The spawned Worker uses `new Worker(..., { type: "module" })`. Your bundler
   * must support emitting module Workers as separate chunks.
   */
  static async init(): Promise<[ExtensionSession, Promise<void>]> {
    const session = new ExtensionSession();
    const [ready, runner] = session.startWorker();
    await ready;
    initExtensionListeners();
    session.setJsDocProviderAvailable(true);
    // Freeze the registry after all built-in tools are registered
    // and before any external code runs cells.
    if (!isRegistryFrozen()) {
      freezeRegistry();
    }
    return [session, runner];
  }

  private startWorker(): [Promise<void>, Promise<void>] {
    let readyResolve: () => void;
    let readyReject: (e: Error) => void;
    const readyPromise = new Promise<void>((resolve, reject) => {
      readyResolve = resolve;
      readyReject = reject;
    });

    let cleanupDone: () => void = () => {};
    const runnerPromise = new Promise<void>((resolve) => {
      cleanupDone = resolve;
    });
    this.onCleanupComplete = cleanupDone;

    const w = new Worker(new URL("../../worker.ts", import.meta.url), {
      type: "module",
    });
    this.worker = w;

    w.onerror = (e: ErrorEvent) => {
      readyReject(new Error(e.message));
    };

    w.onmessageerror = (e: MessageEvent) => {
      readyReject(new Error(`Worker message deserialization error: ${e.data}`));
    };

    w.onmessage = async (e: MessageEvent<WorkerOutgoingMessage>) => {
      const msg = e.data;
      switch (msg.type) {
        case "ready": {
          // Bind the permanent message handler
          w.onmessage = this.handleWorkerMessage.bind(this);
          // Replace error handlers so runtime errors after init are logged and reject pending calls
          w.onerror = (err: ErrorEvent) => {
            logger.error("[extension-lua worker] runtime error:", err.message);
            for (const [, pending] of this.pendingCalls) {
              pending.reject(new Error(`Worker runtime error: ${err.message}`));
            }
            this.pendingCalls.clear();
          };
          w.onmessageerror = (err: MessageEvent) => {
            logger.error("[extension-lua worker] message deserialization error:", err.data);
            for (const [, pending] of this.pendingCalls) {
              pending.reject(new Error(`Worker message deserialization error: ${err.data}`));
            }
            this.pendingCalls.clear();
          };
          readyResolve();
          break;
        }
        case "error": {
          readyReject(new Error(msg.error || "Worker init error"));
          break;
        }
      }
    };

    return [readyPromise, runnerPromise];
  }

  private maybeDrainPending() {
    if (this.pendingCalls.size === 0 && this.drainPending) {
      this.drainPending();
      this.drainPending = null;
    }
  }

  private handleWorkerMessage(e: MessageEvent<WorkerOutgoingMessage>) {
    const msg = e.data;
    switch (msg.type) {
      case "result": {
        const callId = msg.id;
        if (!callId) break;
        const pending = this.pendingCalls.get(callId);
        if (pending) {
          this.pendingCalls.delete(callId);
          pending.resolve(msg.data);
        }
        this.maybeDrainPending();
        break;
      }
      case "error": {
        const callId = msg.id;
        if (callId) {
          const pending = this.pendingCalls.get(callId);
          if (pending) {
            this.pendingCalls.delete(callId);
            pending.reject(new Error(msg.error || "Worker error"));
            this.maybeDrainPending();
            break;
          }
        }
        this.maybeDrainPending();
        // Global worker errors without a matching call
        logger.error("[extension-lua worker]", msg.error);
        break;
      }
      case "asyncRelay": {
        const worker = this.worker;
        if (!msg.id || !msg.command) {
          if (worker) {
            worker.postMessage({
              type: "asyncRelayResult",
              id: msg.id || "unknown",
              result: {
                ok: false,
                error: { message: "Malformed asyncRelay message", code: "E_RUNNER" },
              },
            });
          }
          break;
        }
        if (!worker) break;
        const action = (msg.command as Record<string, unknown>)?.action;
        logger.debug("[MAIN asyncRelay] action:", action, "id:", msg.id, "cmd:", JSON.stringify(msg.command));
        dispatchTool((msg.command as Command).action, (msg.command as Command).params)
          .then((result) => {
            logger.debug("[MAIN asyncRelayResult] action:", action, "id:", msg.id, "result:", JSON.stringify(result));
            try {
              worker.postMessage({
                type: "asyncRelayResult",
                id: msg.id,
                result,
              });
            } catch {
              // Worker terminated before relay result could be posted
            }
          })
          .catch((err: Error | unknown) => {
            const message = toErrorMessage(err);
            logger.error("[MAIN asyncRelay error] action:", action, "msg:", message);
            try {
              worker.postMessage({
                type: "asyncRelayResult",
                id: msg.id,
                result: {
                  ok: false,
                  error: { message, code: "E_RUNNER" },
                },
              });
            } catch {
              // Worker terminated before relay error could be posted
            }
          });
        break;
      }
    }
  }

  private postAndWait<T>(msg: WorkerMessage & { id: string }): Promise<T> {
    const worker = this.worker;
    if (!worker || this.disposed) {
      return Promise.reject(
        new Error("ExtensionSession is not initialized or has been stopped"),
      );
    }
    return new Promise<T>((resolve, reject) => {
      this.pendingCalls.set(msg.id, {
        resolve: resolve as (v: unknown) => void,
        reject,
      });
      worker.postMessage(msg);
    });
  }

  async runCellAsync(
    code: string,
    stdin?: string,
    timeoutMs?: number,
  ): Promise<CellResult> {
    const id = generateId();
    return this.postAndWait({ type: "runCell", id, code, stdin: stdin || "", timeoutMs });
  }

  cancel(): void {
    if (!this.worker || this.disposed) return;
    this.worker.postMessage({ type: "stop" });
  }

  reset(): Promise<void> {
    const id = generateId();
    return this.postAndWait({ type: "reset", id });
  }

  inspectGlobals(): Promise<WasmGlobalsSnapshot> {
    const id = generateId();
    return this.postAndWait({ type: "inspectGlobals", id });
  }

  setFuelLimit(limit: number): void {
    if (!this.worker || this.disposed) return;
    this.worker.postMessage({ type: "setFuelLimit", limit });
  }

  loadLibrary(source: string): Promise<CellResult> {
    const id = generateId();
    return this.postAndWait({ type: "loadLibrary", id, source });
  }

  /**
   * Set the relay timeout for async commands.
   */
  setRelayTimeoutMs(ms: number): void {
    if (!this.worker || this.disposed) return;
    this.worker.postMessage({ type: "setRelayTimeoutMs", ms });
  }

  /**
   * Enable or disable the JS doc provider.
   * When enabled, runtime.docs() and runtime.get_doc() emit async commands
   * that resolve through the merged doc registry.
   */
  setJsDocProviderAvailable(available: boolean): void {
    if (!this.worker || this.disposed) return;
    this.worker.postMessage({ type: "setJsDocProviderAvailable", available });
  }

  /**
   * Clean up the session, terminate the Worker, and release resources.
   * Accepts the runner Promise returned by init() so it can be awaited
   * for graceful shutdown.
   *
   * Sends a stop message to the Worker so it cancels the session, then waits
   * for pending calls to finish before terminating. Only falls back to
   * forceful terminate() after a timeout.
   */
  async stopWith(runner: Promise<void>): Promise<void> {
    if (this.disposed) return;
    this.disposed = true;

    // Send stop to the Worker so it cancels the session
    if (this.worker) {
      try {
        this.worker.postMessage({ type: "stop" });
      } catch {
        // Worker already terminated; proceed with cleanup
      }
    }

    // Remove Chrome listeners registered in runner.ts
    removeExtensionListeners();

    // Wait for pending calls to finish (or timeout)
    const pendingTimeout = 5000;
    if (this.pendingCalls.size > 0) {
      const drainPromise = new Promise<void>((resolve) => {
        this.drainPending = resolve;
      });
      // Re-check: if the last pending call finished while we were setting up the Promise,
      // maybeDrainPending already fired but drainPending was still null.
      if (this.pendingCalls.size === 0 && this.drainPending) {
        this.drainPending();
        this.drainPending = null;
      }
      await Promise.race([
        drainPromise,
        new Promise<void>((_, reject) =>
          setTimeout(() => reject(new Error("Timeout waiting for pending calls")), pendingTimeout),
        ),
      ]).catch(() => {});
      this.drainPending = null;
    }

    // Reject any remaining pending calls
    for (const [, pending] of this.pendingCalls) {
      pending.reject(new Error("ExtensionSession stopped"));
    }
    this.pendingCalls.clear();

    // Terminate worker
    if (this.worker) {
      this.worker.terminate();
      this.worker = null;
    }

    // Signal that cleanup is complete so the runner naturally resolves
    if (this.onCleanupComplete) {
      this.onCleanupComplete();
      this.onCleanupComplete = null;
    }

    // Wait for the runner to settle (catches rejection if any)
    try {
      await runner;
    } catch (e) {
      logger.warn("ExtensionSession runner rejected during stop:", e);
    }
  }
}
