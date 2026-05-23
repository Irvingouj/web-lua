// Web Worker kernel for piccolo notebook runtime
// This worker loads WASM, manages a Session, and handles messages from the main thread.

import init, { WasmSession } from '../pkg/piccolo_notebook.js';
import type { WorkerRunResult } from './types';

let session: WasmSession | null = null;
let initialized = false;

async function initWasm() {
  if (initialized) return;
  try {
    // Use the async init — it resolves the WASM URL relative to the JS module
    await init();
    session = new WasmSession();
    initialized = true;
    console.log('[worker] WASM initialized successfully');
  } catch (e: any) {
    console.error('[worker] WASM init failed:', e);
    throw e;
  }
}

// Initialize on load
initWasm()
  .then(() => {
    self.postMessage({ type: 'ready' });
  })
  .catch((err: Error) => {
    console.error('[worker] Top-level init error:', err);
    self.postMessage({ type: 'error', error: 'WASM init failed: ' + err.message });
  });

export type WorkerMessage =
  | { type: 'runCell'; id: string; code: string; stdin: string }
  | { type: 'reset' }
  | { type: 'stop' }
  | { type: 'setFuelLimit'; limit: number };

export type WorkerResponse =
  | { type: 'ready' }
  | { type: 'result'; id: string; data: any }
  | { type: 'error'; error: string }
  | { type: 'stopped' }
  | { type: 'resetDone' };

self.onmessage = async (e: MessageEvent<WorkerMessage>) => {
  const msg = e.data;

  if (!initialized || !session) {
    self.postMessage({ type: 'error', error: 'WASM not initialized' });
    return;
  }

  switch (msg.type) {
    case 'runCell': {
      try {
        const jsonStr = session.run_cell(msg.code, msg.stdin || '');
        const data: WorkerRunResult = JSON.parse(jsonStr);
        self.postMessage({ type: 'result', id: msg.id, data });
      } catch (err: any) {
        self.postMessage({ type: 'error', error: err.message || String(err) });
      }
      break;
    }

    case 'reset': {
      try {
        session.reset();
        self.postMessage({ type: 'resetDone' });
      } catch (err: any) {
        self.postMessage({ type: 'error', error: err.message || String(err) });
      }
      break;
    }

    case 'stop': {
      // For now, stop means we terminate and recreate the worker.
      // The main thread handles worker termination.
      self.postMessage({ type: 'stopped' });
      break;
    }

    case 'setFuelLimit': {
      try {
        session.set_fuel_limit(msg.limit);
      } catch (err: any) {
        self.postMessage({ type: 'error', error: err.message || String(err) });
      }
      break;
    }
  }
};
