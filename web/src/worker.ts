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
  | { type: 'setFuelLimit'; limit: number }
  | { type: 'asyncRelayResult'; id: string; result: string }
  | { type: 'setTestChromeApis'; apis: any };

export type WorkerResponse =
  | { type: 'ready' }
  | { type: 'result'; id: string; data: any }
  | { type: 'error'; error: string }
  | { type: 'stopped' }
  | { type: 'resetDone' };

// ─── Async execution engine ────────────────────────────────────────

interface AsyncCommand {
  call_id: number;
  action: string;
  params: any;
}

/**
 * Execute a cell, handling async yield/resume cycles automatically.
 */
async function executeCell(id: string, code: string, stdin: string) {
  try {
    let jsonStr = session!.run_cell(code, stdin);
    let result: WorkerRunResult = JSON.parse(jsonStr);

    while (result.status === 'async_pending' && result.pending_command) {
      const response = await handleAsyncCommand(result.pending_command);
      jsonStr = session!.resume_cell(JSON.stringify(response));
      result = JSON.parse(jsonStr);
    }

    self.postMessage({ type: 'result', id, data: result });
  } catch (err: any) {
    self.postMessage({ type: 'error', error: err.message || String(err) });
  }
}

/**
 * Handle an async command by executing the real operation.
 * Returns an AsyncResponse: { ok: true, value: ... } or { ok: false, error: { message, code, category } }
 */
async function handleAsyncCommand(command: AsyncCommand): Promise<any> {
  switch (command.action) {
    case 'fetch': {
      return handleFetch(command.params);
    }
    case 'sleep': {
      return handleSleep(command.params);
    }
    case 'storage_get':
    case 'storage_set':
    case 'storage_delete':
    case 'storage_list': {
      // Main thread relay needed — handled via postMessage to main thread
      return handleMainThreadRelay(command);
    }
    case 'tab_query':
    case 'tab_create':
    case 'tab_activate':
    case 'tab_close':
    case 'tab_execute_script':
    case 'cookies_get':
    case 'cookies_set':
    case 'cookies_delete':
    case 'cookies_list':
    case 'history_search':
    case 'history_delete':
    case 'bookmarks_search':
    case 'bookmarks_create':
    case 'bookmarks_delete':
    case 'notifications_create':
    case 'clipboard_read':
    case 'clipboard_write': {
      return handleExtensionApi(command);
    }
    default:
      return {
        ok: false,
        error: {
          message: `Unknown async action: ${command.action}`,
          code: 'EUNKNOWN',
          category: 'unknown',
        },
      };
  }
}

/**
 * Real fetch implementation with timeout and error classification.
 */
async function handleFetch(params: {
  url: string;
  method: string;
  headers: Record<string, string>;
  body: string | null;
  timeout: number;
}): Promise<any> {
  const { url, method, headers, body, timeout } = params;

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout || 30_000);

    const fetchOpts: RequestInit = {
      method: method || 'GET',
      headers: headers || {},
      signal: controller.signal,
    };
    if (body !== null && body !== undefined) {
      fetchOpts.body = body;
    }

    const response = await fetch(url, fetchOpts);
    clearTimeout(timeoutId);

    const responseBody = await response.text();
    const responseHeaders: Record<string, string> = {};
    response.headers.forEach((value, key) => {
      responseHeaders[key] = value;
    });

    return {
      ok: true,
      value: {
        status: response.status,
        ok: response.ok,
        headers: responseHeaders,
        body: responseBody,
      },
    };
  } catch (err: any) {
    if (err.name === 'AbortError') {
      return {
        ok: false,
        error: {
          message: `Request timed out after ${timeout || 30_000}ms`,
          code: 'ETIMEDOUT',
          category: 'timeout',
        },
      };
    }
    if (err instanceof TypeError) {
      // Network errors in fetch are TypeError
      return {
        ok: false,
        error: {
          message: err.message,
          code: 'ENETWORK',
          category: 'network',
        },
      };
    }
    return {
      ok: false,
      error: {
        message: err.message || String(err),
        code: 'EUNKNOWN',
        category: 'unknown',
      },
    };
  }
}

/**
 * Sleep: wait for a specified duration.
 */
async function handleSleep(params: { duration: number }): Promise<any> {
  await new Promise(resolve => setTimeout(resolve, params.duration || 0));
  return { ok: true, value: null };
}

/**
 * Relay commands that need the main thread (localStorage, DOM, clipboard).
 * Posts to main thread and waits for response.
 */
function handleMainThreadRelay(command: AsyncCommand): Promise<any> {
  return new Promise((resolve) => {
    const relayId = `relay-${command.call_id}`;

    const handler = (e: MessageEvent) => {
      const msg = e.data;
      if (msg.type === 'asyncRelayResult' && msg.id === relayId) {
        self.removeEventListener('message', handler);
        resolve(JSON.parse(msg.result));
      }
    };
    self.addEventListener('message', handler);
    self.postMessage({ type: 'asyncRelay', id: relayId, command });
  });
}

/**
 * Check if running in browser extension context.
 * Also supports a test mode via self.__testChromeApis.
 */
function isExtensionContext(): boolean {
  if ((self as any).__testChromeApis) return true;
  return !!(globalThis as any).chrome?.runtime?.id;
}

/**
 * Handle browser extension API commands.
 * In non-extension context, returns a clear error.
 */
async function handleExtensionApi(command: AsyncCommand): Promise<any> {
  if (!isExtensionContext()) {
    return {
      ok: false,
      error: {
        message: `${command.action} is only available in a browser extension context`,
        code: 'ENOEXTENSION',
        category: 'permission',
      },
    };
  }

  try {
    // Use real chrome APIs or test mocks
    const chrome = (globalThis as any).chrome || (self as any).__testChromeApis;
    let result: any;

    switch (command.action) {
      case 'tab_query': {
        result = await chrome.tabs.query(command.params[0] || {});
        break;
      }
      case 'tab_create': {
        result = await chrome.tabs.create(command.params[0] || {});
        break;
      }
      case 'tab_activate': {
        const tabId = command.params[0]?.id || command.params[0];
        await chrome.tabs.update(tabId, { active: true });
        result = null;
        break;
      }
      case 'tab_close': {
        const closeTabId = command.params[0]?.id || command.params[0];
        await chrome.tabs.remove(closeTabId);
        result = null;
        break;
      }
      case 'tab_execute_script': {
        const scriptTabId = command.params[0]?.tabId;
        const code = command.params[0]?.code || command.params[1];
        const execResults = await chrome.scripting.executeScript({
          target: { tabId: scriptTabId },
          func: new Function(code),
        });
        result = execResults;
        break;
      }
      case 'cookies_get': {
        result = await chrome.cookies.get(command.params[0] || {});
        break;
      }
      case 'cookies_set': {
        result = await chrome.cookies.set(command.params[0] || {});
        break;
      }
      case 'cookies_delete': {
        result = await chrome.cookies.remove(command.params[0] || {});
        break;
      }
      case 'cookies_list': {
        result = await chrome.cookies.getAll(command.params[0] || {});
        break;
      }
      case 'history_search': {
        result = await chrome.history.search(command.params[0] || {});
        break;
      }
      case 'history_delete': {
        await chrome.history.deleteUrl(command.params[0]?.url || command.params[0]);
        result = null;
        break;
      }
      case 'bookmarks_search': {
        const query = typeof command.params === 'string'
          ? command.params
          : command.params[0]?.query || command.params[0] || '';
        result = await chrome.bookmarks.search(query);
        break;
      }
      case 'bookmarks_create': {
        result = await chrome.bookmarks.create(command.params[0] || {});
        break;
      }
      case 'bookmarks_delete': {
        const bookmarkId = command.params[0]?.id || command.params[0];
        await chrome.bookmarks.remove(bookmarkId);
        result = null;
        break;
      }
      case 'notifications_create': {
        if (chrome.notifications) {
          result = await chrome.notifications.create(command.params[0] || '', command.params[1] || {});
        } else {
          return {
            ok: false,
            error: { message: 'Notifications API not available', code: 'ENOEXTENSION', category: 'permission' },
          };
        }
        break;
      }
      case 'clipboard_read': {
        // Clipboard needs main thread in some contexts
        return handleMainThreadRelay(command);
      }
      case 'clipboard_write': {
        return handleMainThreadRelay(command);
      }
      default:
        return {
          ok: false,
          error: { message: `Unimplemented extension action: ${command.action}`, code: 'EUNKNOWN', category: 'unknown' },
        };
    }

    return { ok: true, value: result };
  } catch (err: any) {
    return {
      ok: false,
      error: {
        message: err.message || String(err),
        code: 'EEXTENSION',
        category: 'extension',
      },
    };
  }
}

self.onmessage = async (e: MessageEvent<WorkerMessage>) => {
  const msg = e.data;

  if (!initialized || !session) {
    self.postMessage({ type: 'error', error: 'WASM not initialized' });
    return;
  }

  switch (msg.type) {
    case 'runCell': {
      await executeCell(msg.id, msg.code, msg.stdin || '');
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

    case 'setTestChromeApis': {
      // Test-only: inject mock chrome APIs into the worker
      (self as any).__testChromeApis = msg.apis;
      break;
    }
  }
};
