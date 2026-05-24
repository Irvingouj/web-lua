import { useState, useCallback, useRef } from 'preact/hooks';
import type { WorkerRunResult, CellError } from '../types';

export type KernelStatus = 'ready' | 'running' | 'stopped' | 'error';

export interface KernelHandle {
  status: KernelStatus;
  runCell: (cellId: string, code: string, stdin: string) => void;
  stopExecution: () => void;
  restartKernel: () => void;
}

type ResultHandler = (cellId: string, data: WorkerRunResult) => void;
type ErrorHandler = (error: string) => void;

export function useKernel(
  onResult: ResultHandler,
  onError: ErrorHandler,
): KernelHandle {
  const [status, setStatus] = useState<KernelStatus>('ready');
  const workerRef = useRef<Worker | null>(null);
  const workerReadyRef = useRef<Promise<Worker> | null>(null);
  const onResultRef = useRef(onResult);
  const onErrorRef = useRef(onError);
  onResultRef.current = onResult;
  onErrorRef.current = onError;

  const handleMessage = useCallback((w: Worker) => {
    w.onmessage = (e: MessageEvent) => {
      const msg = e.data;
      switch (msg.type) {
        case 'result':
          onResultRef.current(msg.id, msg.data);
          setStatus('ready');
          break;
        case 'error':
          onErrorRef.current(msg.error);
          break;
        case 'resetDone':
          setStatus('ready');
          break;
        case 'stopped':
          setStatus('stopped');
          break;
        case 'asyncRelay':
          handleAsyncRelay(w, msg.id, msg.command);
          break;
      }
    };
    w.onerror = (e: ErrorEvent) => {
      onErrorRef.current(e.message);
    };
  }, []);

  const ensureWorker = useCallback((): Promise<Worker> => {
    if (!workerReadyRef.current) {
      workerReadyRef.current = new Promise<Worker>((resolve, reject) => {
        const w = new Worker(new URL('../worker.ts', import.meta.url), { type: 'module' });
        const readyHandler = (e: MessageEvent) => {
          const msg = e.data;
          if (msg.type === 'ready') {
            w.removeEventListener('message', readyHandler);
            setStatus('ready');
            handleMessage(w);
            resolve(w);
          } else if (msg.type === 'error') {
            w.removeEventListener('message', readyHandler);
            reject(new Error(msg.error));
          }
        };
        w.addEventListener('message', readyHandler);
        w.onerror = (e: ErrorEvent) => reject(new Error(e.message));
      }).then(w => {
        workerRef.current = w;
        return w;
      });
    }
    return workerReadyRef.current;
  }, [handleMessage]);

  const terminateWorker = useCallback(() => {
    if (workerRef.current) {
      workerRef.current.terminate();
      workerRef.current = null;
    }
    workerReadyRef.current = null;
    setStatus('stopped');
  }, []);

  const runCell = useCallback((cellId: string, code: string, stdin: string) => {
    setStatus('running');
    ensureWorker().then(w => {
      w.postMessage({ type: 'runCell', id: cellId, code, stdin });
    }).catch(err => {
      onErrorRef.current(err.message || String(err));
    });
  }, [ensureWorker]);

  const stopExecution = useCallback(() => {
    terminateWorker();
  }, [terminateWorker]);

  const restartKernel = useCallback(() => {
    terminateWorker();
    ensureWorker(); // pre-create
  }, [terminateWorker, ensureWorker]);

  return { status, runCell, stopExecution, restartKernel };
}

async function handleAsyncRelay(worker: Worker, relayId: string, command: any) {
  const result = await executeMainThreadCommand(command);
  worker.postMessage({ type: 'asyncRelayResult', id: relayId, result: JSON.stringify(result) });
}

async function executeMainThreadCommand(command: any): Promise<any> {
  switch (command.action) {
    case 'storage_get': {
      try {
        const value = localStorage.getItem(command.params.key);
        return { ok: true, value };
      } catch (err: any) {
        return { ok: false, error: { message: err.message, code: 'ESTORAGE', category: 'storage' } };
      }
    }
    case 'storage_set': {
      try {
        localStorage.setItem(command.params.key, command.params.value);
        return { ok: true, value: null };
      } catch (err: any) {
        return { ok: false, error: { message: err.message, code: 'ESTORAGE', category: 'storage' } };
      }
    }
    case 'storage_delete': {
      try {
        localStorage.removeItem(command.params.key);
        return { ok: true, value: null };
      } catch (err: any) {
        return { ok: false, error: { message: err.message, code: 'ESTORAGE', category: 'storage' } };
      }
    }
    case 'storage_list': {
      try {
        const keys: string[] = [];
        for (let i = 0; i < localStorage.length; i++) {
          const key = localStorage.key(i);
          if (key) keys.push(key);
        }
        return { ok: true, value: keys };
      } catch (err: any) {
        return { ok: false, error: { message: err.message, code: 'ESTORAGE', category: 'storage' } };
      }
    }
    case 'clipboard_read': {
      try {
        const text = await navigator.clipboard.readText();
        return { ok: true, value: text };
      } catch (err: any) {
        return { ok: false, error: { message: err.message, code: 'ECLIPBOARD', category: 'permission' } };
      }
    }
    case 'clipboard_write': {
      try {
        const text = command.params[0]?.text || command.params[0] || command.params.value || '';
        await navigator.clipboard.writeText(String(text));
        return { ok: true, value: null };
      } catch (err: any) {
        return { ok: false, error: { message: err.message, code: 'ECLIPBOARD', category: 'permission' } };
      }
    }
    case 'dom_snapshot': {
      return handleDomSnapshot(command.params);
    }
    case 'dom_format': {
      return handleDomFormat(command.params);
    }
    // ── Page Agent actions ──────────────────────────────────────
    case 'page_snapshot':
    case 'page_click':
    case 'page_dblclick':
    case 'page_fill':
    case 'page_type':
    case 'page_press':
    case 'page_select':
    case 'page_check':
    case 'page_hover':
    case 'page_unhover':
    case 'page_scroll':
    case 'page_scroll_to':
    case 'page_url':
    case 'page_title':
    case 'page_screenshot':
    case 'page_goto':
    case 'page_back':
    case 'page_forward':
    case 'page_reload':
    case 'page_wait':
    case 'page_tabs':
    case 'page_switch':
    case 'page_new_tab':
    case 'page_close':
    case 'page_active_tab': {
      return handlePageAction(command.action, command.params);
    }
    default:
      // Chrome extension APIs — route to main thread chrome.* APIs
      if (command.action.startsWith('chrome_')) {
        return handleChromeApi(command);
      }
      if (command.action.startsWith('host_')) {
        return handleHostCallAction(command.action.slice(5), command.params);
      }
      return {
        ok: false,
        error: { message: `Unknown main-thread action: ${command.action}`, code: 'EUNKNOWN', category: 'unknown' },
      };
  }
}

const hostHandlers: Record<string, (params: any) => Promise<any>> = {};

export function registerHostHandler(action: string, handler: (params: any) => Promise<any>) {
  hostHandlers[action] = handler;
}

export function registerHostHandlers(handlers: Record<string, (params: any) => Promise<any>>) {
  Object.assign(hostHandlers, handlers);
}

async function handleHostCallAction(action: string, params: any): Promise<any> {
  const handler = hostHandlers[action] || (window as any).__hostHandlers?.[action];
  if (!handler) {
    return {
      ok: false,
      error: {
        message: `No handler registered for "${action}". Register one with registerHostHandler("${action}", async (params) => { ... })`,
        code: 'ENOHANDLER',
        category: 'host',
      },
    };
  }
  try {
    const value = await handler(params);
    return { ok: true, value };
  } catch (err: any) {
    return {
      ok: false,
      error: { message: err.message || String(err), code: 'EHOSTCALL', category: 'host' },
    };
  }
}

// ── DOM Semantic Tree Snapshot ────────────────────────────────────────

let domSnapshotModule: any = null;

async function ensureDomSnapshotModule(): Promise<any> {
  if (domSnapshotModule) return domSnapshotModule;
  try {
    // Load the glue JS first (it's a regular ES module)
    const glueUrl = new URL('/pkg-dom/dom_snapshot_wasm_bg.js', window.location.origin).href;
    const glue: any = await import(/* @vite-ignore */ glueUrl);

    // Fetch and instantiate the WASM binary
    const wasmUrl = new URL('/pkg-dom/dom_snapshot_wasm_bg.wasm', window.location.origin).href;
    const response = await fetch(wasmUrl);
    const buffer = await response.arrayBuffer();
    const { instance } = await WebAssembly.instantiate(buffer, {
      './dom_snapshot_wasm_bg.js': glue,
    });

    // Wire up the WASM exports to the glue code
    if (glue.__wbg_set_wasm) {
      glue.__wbg_set_wasm(instance.exports);
    }

    domSnapshotModule = glue;
    return glue;
  } catch (err: any) {
    console.warn('[dom-snapshot] Failed to load WASM module:', err?.message);
    return null;
  }
}

async function handleDomSnapshot(params: any): Promise<any> {
  const mod = await ensureDomSnapshotModule();
  if (!mod) {
    return {
      ok: false,
      error: {
        message: 'dom.snapshot requires the dom-semantic-tree WASM module. Make sure pkg-dom/ is built.',
        code: 'E_NO_DOM_MODULE',
        category: 'dom',
      },
    };
  }
  try {
    const opts = params || {};
    const snapshot = mod.collectDocument(opts);

    // Build compact text from the snapshot data in JS
    // (avoids the serde_wasm_bindgen deserialization issue)
    const nodes = snapshot?.nodes || [];
    const lines: string[] = [];
    for (const node of nodes) {
      const parts: string[] = [];
      parts.push(`[${node.refId}]`);
      parts.push(node.role);
      if (node.name) parts.push(`"${node.name.replace(/"/g, '\\"')}"`);

      // States
      const stateKeys = ['disabled', 'checked', 'selected', 'expanded', 'pressed', 'required', 'readonly', 'invalid', 'current'];
      for (const key of stateKeys) {
        if (node.states?.[key] === true) parts.push(key);
      }

      if (node.inputType) parts.push(`inputType="${node.inputType}"`);
      if (node.description) parts.push(`description="${node.description.replace(/"/g, '\\"')}"`);
      if (node.value) parts.push(`value="${node.value.replace(/"/g, '\\"')}"`);
      if (node.placeholder) parts.push(`placeholder="${node.placeholder.replace(/"/g, '\\"')}"`);
      if (node.href) parts.push(`href="${node.href}"`);

      lines.push(parts.join(' '));
    }

    return {
      ok: true,
      value: {
        data: snapshot,
        text: lines.join('\n'),
      },
    };
  } catch (err: any) {
    return {
      ok: false,
      error: { message: err.message || String(err), code: 'E_DOM_SNAPSHOT', category: 'dom' },
    };
  }
}

async function handleDomFormat(params: any): Promise<any> {
  const mod = await ensureDomSnapshotModule();
  if (!mod) {
    return {
      ok: false,
      error: {
        message: 'dom.format requires the dom-semantic-tree WASM module. Make sure pkg-dom/ is built.',
        code: 'E_NO_DOM_MODULE',
        category: 'dom',
      },
    };
  }
  try {
    const snapshot = params?.snapshot;
    const format = params?.format || 'compact-text';

    // Use JSON string for reliable deserialization in WASM
    // (Lua table → JSON roundtrip may corrupt complex nested data)
    const jsonStr = JSON.stringify(snapshot);
    const result = mod.formatSnapshot(jsonStr, format);
    return { ok: true, value: result };
  } catch (err: any) {
    return {
      ok: false,
      error: { message: err.message || String(err), code: 'E_DOM_FORMAT', category: 'dom' },
    };
  }
}

// ── Page Agent (dom-agent WASM) ─────────────────────────────────────

let pageAgentModule: any = null;
let pageAgentInstance: any = null;

async function ensurePageAgent(): Promise<any> {
  if (pageAgentInstance) return pageAgentInstance;
  try {
    const glueUrl = new URL('/pkg-dom-agent/dom_agent_wasm.js', window.location.origin).href;
    const glue: any = await import(/* @vite-ignore */ glueUrl);

    // Use the async init function from the glue code
    // It handles WASM loading and wiring internally
    await glue.default();

    pageAgentModule = glue;
    pageAgentInstance = new glue.WasmAgent();
    return pageAgentInstance;
  } catch (err: any) {
    console.warn('[page-agent] Failed to load Agent WASM module:', err?.message);
    return null;
  }
}

async function handlePageAction(action: string, params: any): Promise<any> {
  // Navigation/meta actions that don't need the agent WASM
  switch (action) {
    case 'page_url': {
      return { ok: true, value: window.location.href };
    }
    case 'page_title': {
      return { ok: true, value: document.title };
    }
    case 'page_screenshot': {
      // Screenshot requires extension API; return placeholder for web mode
      return { ok: false, error: { message: 'page.screenshot() requires extension mode (chrome.tabs.captureVisibleTab)', code: 'E_NO_EXTENSION', category: 'runtime' } };
    }
    case 'page_goto': {
      window.location.href = params.url;
      return { ok: true, value: true };
    }
    case 'page_back': {
      window.history.back();
      return { ok: true, value: true };
    }
    case 'page_forward': {
      window.history.forward();
      return { ok: true, value: true };
    }
    case 'page_reload': {
      window.location.reload();
      return { ok: true, value: true };
    }
    case 'page_wait': {
      const ms = params?.ms || 1000;
      await new Promise(resolve => setTimeout(resolve, ms));
      return { ok: true, value: true };
    }
    case 'page_tabs':
    case 'page_switch':
    case 'page_new_tab':
    case 'page_close':
    case 'page_active_tab': {
      // Tab management requires extension mode
      return handlePageTabAction(action, params);
    }
  }

  // Agent WASM actions
  const agent = await ensurePageAgent();
  if (!agent) {
    return {
      ok: false,
      error: {
        message: 'page.* agent actions require the dom-agent WASM module. Make sure pkg-dom-agent/ is built.',
        code: 'E_AGENT_NOT_READY',
        category: 'runtime',
      },
    };
  }

  try {
    let result: any;
    switch (action) {
      case 'page_snapshot': {
        result = agent.snapshot(params || {});
        // Build compact text from the snapshot data in JS
        // (same approach as handleDomSnapshot)
        if (result?.ok) {
          const nodes = result?.data?.nodes || [];
          const lines: string[] = [];
          for (const node of nodes) {
            const parts: string[] = [];
            parts.push(`[${node.refId}]`);
            parts.push(node.role);
            if (node.name) parts.push(`"${node.name.replace(/"/g, '\\"')}"`);
            const stateKeys = ['disabled', 'checked', 'selected', 'expanded', 'pressed', 'required', 'readonly', 'invalid', 'current'];
            for (const key of stateKeys) {
              if (node.states?.[key] === true) parts.push(key);
            }
            if (node.inputType) parts.push(`inputType="${node.inputType}"`);
            if (node.description) parts.push(`description="${node.description.replace(/"/g, '\\"')}"`);
            if (node.value) parts.push(`value="${node.value.replace(/"/g, '\\"')}"`);
            if (node.placeholder) parts.push(`placeholder="${node.placeholder.replace(/"/g, '\\"')}"`);
            if (node.href) parts.push(`href="${node.href}"`);
            lines.push(parts.join(' '));
          }
          // Deep convert WASM objects to plain JS for JSON serialization
          const plainData = JSON.parse(JSON.stringify(result.data));
          return { ok: true, value: { data: plainData, text: lines.join('\n') } };
        }
        return jsResultToPlain(result);
      }
      case 'page_click': {
        result = agent.click(params.refId);
        return jsResultToPlain(result);
      }
      case 'page_dblclick': {
        result = agent.dblclick(params.refId);
        return jsResultToPlain(result);
      }
      case 'page_fill': {
        result = agent.fill(params.refId, params.value);
        return jsResultToPlain(result);
      }
      case 'page_type': {
        result = agent.typeText(params.refId, params.text);
        return jsResultToPlain(result);
      }
      case 'page_press': {
        result = agent.press(params.key);
        return jsResultToPlain(result);
      }
      case 'page_select': {
        result = agent.select(params.refId, params.value);
        return jsResultToPlain(result);
      }
      case 'page_check': {
        result = agent.check(params.refId, params.checked ?? true);
        return jsResultToPlain(result);
      }
      case 'page_hover': {
        result = agent.hover(params.refId);
        return jsResultToPlain(result);
      }
      case 'page_unhover': {
        result = agent.unhover(params.refId);
        return jsResultToPlain(result);
      }
      case 'page_scroll': {
        result = agent.scroll(params.direction || 'down', params.amount || 300);
        return jsResultToPlain(result);
      }
      case 'page_scroll_to': {
        result = agent.scrollIntoView(params.refId);
        return jsResultToPlain(result);
      }
      default:
        return { ok: false, error: { message: `Unknown page action: ${action}`, code: 'EUNKNOWN', category: 'unknown' } };
    }
  } catch (err: any) {
    return { ok: false, error: { message: err.message || String(err), code: 'E_AGENT_ERROR', category: 'agent' } };
  }
}

/**
 * Convert a WASM JsValue result to a plain JS object for JSON serialization.
 * WASM returned objects don't serialize correctly through JSON.stringify.
 */
function jsResultToPlain(result: any): any {
  if (result === null || result === undefined) {
    return { ok: true };
  }
  // Raw primitives from WASM — wrap into a proper AsyncResponse
  if (typeof result === 'boolean' || typeof result === 'number' || typeof result === 'string') {
    return { ok: true, value: result };
  }

  // Manually construct a plain object from the WASM result
  const ok = result.ok;
  if (ok === true) {
    // Extract the value field if present
    const val = result.value;
    if (val !== undefined && val !== null) {
      // value might itself be a WASM object — try to convert
      if (typeof val === 'object') {
        try { return { ok: true, value: JSON.parse(JSON.stringify(val)) }; } catch { /* fall through */ }
      }
      return { ok: true, value: val };
    }
    return { ok: true };
  }
  if (ok === false && result.error) {
    const err = result.error;
    return {
      ok: false,
      error: {
        message: String(err.message || ''),
        code: String(err.code || ''),
        category: String(err.category || ''),
      },
    };
  }
  // Fallback: try JSON round-trip
  try {
    return JSON.parse(JSON.stringify(result));
  } catch {
    return { ok: false, error: { message: 'Failed to serialize WASM result', code: 'E_SERIALIZE', category: 'agent' } };
  }
}

function handlePageTabAction(action: string, params: any): Promise<any> {
  const chrome = (window as any).chrome;
  if (!chrome?.runtime?.id) {
    return Promise.resolve({
      ok: false,
      error: { message: `${action} requires extension mode`, code: 'E_NO_EXTENSION', category: 'runtime' },
    });
  }

  switch (action) {
    case 'page_tabs': {
      return chrome.tabs.query({}).then((tabs: any[]) => ({
        ok: true,
        value: tabs.map(t => ({ id: t.id, url: t.url, title: t.title, active: t.active })),
      }));
    }
    case 'page_switch': {
      return chrome.tabs.update(params.tabId, { active: true })
        .then(() => ({ ok: true, value: true }))
        .catch((err: any) => normalizeChromeError(err));
    }
    case 'page_new_tab': {
      return chrome.tabs.create(params.url ? { url: params.url } : {})
        .then((tab: any) => ({ ok: true, value: { id: tab.id, url: tab.url, title: tab.title } }))
        .catch((err: any) => normalizeChromeError(err));
    }
    case 'page_close': {
      return chrome.tabs.remove(params.tabId)
        .then(() => ({ ok: true, value: true }))
        .catch((err: any) => normalizeChromeError(err));
    }
    case 'page_active_tab': {
      return chrome.tabs.query({ active: true, currentWindow: true })
        .then((tabs: any[]) => {
          if (tabs.length === 0) return { ok: false, error: { message: 'No active tab', code: 'E_NO_TAB', category: 'tab' } };
          const t = tabs[0];
          return { ok: true, value: { id: t.id, url: t.url, title: t.title, active: true } };
        });
    }
    default:
      return Promise.resolve({ ok: false, error: { message: `Unknown tab action: ${action}`, code: 'EUNKNOWN', category: 'unknown' } });
  }
}

/**
 * Normalize Chrome API errors to stable error codes.
 */
function normalizeChromeError(err: any): any {
  const msg = err?.message || String(err);
  if (msg.includes('permission') || msg.includes('Permission')) {
    return { ok: false, error: { message: msg, code: 'E_PERMISSION_DENIED', category: 'permission' } };
  }
  if (msg.includes('not found') || msg.includes('No tab') || msg.includes('No window')) {
    return { ok: false, error: { message: msg, code: 'E_NOT_FOUND', category: 'resource' } };
  }
  return { ok: false, error: { message: msg, code: 'E_EXTENSION', category: 'extension' } };
}

/**
 * Handle chrome.* extension API commands on the main thread.
 * The main thread (popup page) has access to chrome.* APIs.
 */
async function handleChromeApi(command: any): Promise<any> {
  const chrome = (window as any).chrome;
  if (!chrome?.runtime?.id) {
    return {
      ok: false,
      error: {
        message: `${command.action} is only available in a browser extension context`,
        code: 'E_NO_EXTENSION',
        category: 'permission',
      },
    };
  }

  // Normalize params: from Lua, single table arg comes as object, multiple args as array
  const p = command.params;
  const first = Array.isArray(p) ? p[0] : (typeof p === 'object' && p !== null ? p : p);
  const second = Array.isArray(p) ? p[1] : undefined;

  try {
    let result: any;

    switch (command.action) {
      // ── chrome.runtime ──
      case 'chrome_runtime_sendMessage': {
        result = await chrome.runtime.sendMessage(first || {});
        break;
      }

      // ── chrome.tabs ──
      case 'chrome_tabs_query': {
        result = await chrome.tabs.query(first || {});
        break;
      }
      case 'chrome_tabs_create': {
        result = await chrome.tabs.create(first || {});
        break;
      }
      case 'chrome_tabs_update': {
        const tabId = first?.tabId || first;
        const updateProps = first?.update || second || {};
        result = await chrome.tabs.update(typeof tabId === 'number' ? tabId : null, updateProps);
        break;
      }
      case 'chrome_tabs_remove': {
        const tabId = first?.tabId || first?.id || first;
        await chrome.tabs.remove(tabId);
        result = null;
        break;
      }
      case 'chrome_tabs_sendMessage': {
        const tabId = first?.tabId || first;
        const message = first?.message || second || {};
        result = await chrome.tabs.sendMessage(tabId, message);
        break;
      }

      // ── chrome.alarms ──
      case 'chrome_alarms_create': {
        const name = first?.name || (typeof first === 'string' ? first : '') || '';
        const alarmInfo = first?.alarmInfo || second || (typeof first === 'object' ? first : {}) || {};
        await chrome.alarms.create(name, alarmInfo);
        result = null;
        break;
      }
      case 'chrome_alarms_clear': {
        const alarmName = first?.name || (typeof first === 'string' ? first : '') || '';
        result = await chrome.alarms.clear(alarmName);
        break;
      }

      // ── chrome.action ──
      case 'chrome_action_setBadgeText': {
        await chrome.action.setBadgeText(first || {});
        result = null;
        break;
      }
      case 'chrome_action_setBadgeBackgroundColor': {
        await chrome.action.setBadgeBackgroundColor(first || {});
        result = null;
        break;
      }
      case 'chrome_action_setTitle': {
        await chrome.action.setTitle(first || {});
        result = null;
        break;
      }
      case 'chrome_action_setIcon': {
        result = await chrome.action.setIcon(first || {});
        break;
      }

      // ── chrome.contextMenus ──
      case 'chrome_contextMenus_create': {
        result = await chrome.contextMenus.create(first || {});
        break;
      }
      case 'chrome_contextMenus_remove': {
        const menuId = first?.menuItemId || first?.id || first;
        await chrome.contextMenus.remove(menuId);
        result = null;
        break;
      }

      // ── chrome.windows ──
      case 'chrome_windows_getAll': {
        result = await chrome.windows.getAll(first || {});
        break;
      }
      case 'chrome_windows_create': {
        result = await chrome.windows.create(first || {});
        break;
      }
      case 'chrome_windows_update': {
        const windowId = first?.windowId || first;
        const updateInfo = first?.update || second || {};
        result = await chrome.windows.update(windowId, updateInfo);
        break;
      }
      case 'chrome_windows_remove': {
        const windowId = first?.windowId || first;
        await chrome.windows.remove(windowId);
        result = null;
        break;
      }

      // ── chrome.sidePanel ──
      case 'chrome_sidePanel_setOptions': {
        await chrome.sidePanel.setOptions(first || {});
        result = null;
        break;
      }

      // ── chrome.cookies ──
      case 'chrome_cookies_get': {
        result = await chrome.cookies.get(first || {});
        break;
      }
      case 'chrome_cookies_set': {
        result = await chrome.cookies.set(first || {});
        break;
      }
      case 'chrome_cookies_remove': {
        result = await chrome.cookies.remove(first || {});
        break;
      }
      case 'chrome_cookies_getAll': {
        result = await chrome.cookies.getAll(first || {});
        break;
      }

      // ── chrome.bookmarks ──
      case 'chrome_bookmarks_search': {
        const query = first?.query || (typeof first === 'string' ? first : '') || '';
        result = await chrome.bookmarks.search(query);
        break;
      }
      case 'chrome_bookmarks_create': {
        result = await chrome.bookmarks.create(first || {});
        break;
      }
      case 'chrome_bookmarks_remove': {
        const bookmarkId = first?.id || first;
        await chrome.bookmarks.remove(bookmarkId);
        result = null;
        break;
      }

      // ── chrome.history ──
      case 'chrome_history_search': {
        result = await chrome.history.search(first || {});
        break;
      }
      case 'chrome_history_deleteUrl': {
        await chrome.history.deleteUrl(first?.url || first);
        result = null;
        break;
      }

      // ── chrome.notifications ──
      case 'chrome_notifications_create': {
        const notifId = first?.id || (typeof first === 'string' ? first : '') || '';
        const options = first?.options || second || {};
        result = await chrome.notifications.create(notifId, options);
        break;
      }
      case 'chrome_notifications_clear': {
        const notifId = first?.id || (typeof first === 'string' ? first : '') || '';
        result = await chrome.notifications.clear(notifId);
        break;
      }

      // ── chrome.scripting ──
      case 'chrome_scripting_executeScript': {
        result = await chrome.scripting.executeScript(first || {});
        break;
      }

      default:
        return {
          ok: false,
          error: { message: `Unimplemented chrome action: ${command.action}`, code: 'E_UNKNOWN', category: 'unknown' },
        };
    }

    return { ok: true, value: result };
  } catch (err: any) {
    return normalizeChromeError(err);
  }
}
