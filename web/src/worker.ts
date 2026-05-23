// Web Worker kernel for piccolo notebook runtime
// This worker loads WASM, manages a Session, and handles messages from the main thread.

import init, { WasmSession } from '../pkg/piccolo_notebook.js';

let session: WasmSession | null = null;
let initialized = false;

async function initWasm() {
  if (initialized) return;
  // Resolve WASM path relative to the pkg directory
  const wasmUrl = new URL('../pkg/piccolo_notebook_bg.wasm', import.meta.url);
  await init(wasmUrl);
  session = new WasmSession();
  initialized = true;
}

// Initialize on load
initWasm()
  .then(() => {
    self.postMessage({ type: 'ready' });
  })
  .catch((err: Error) => {
    self.postMessage({ type: 'error', error: err.message });
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
        const data = JSON.parse(jsonStr);
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
