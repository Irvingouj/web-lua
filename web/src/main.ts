import './styles.css';
import { Cell, Notebook, createCell, createNotebook, serializeNotebook, deserializeNotebook } from './notebook';
import type { WorkerRunResult, CellError } from './types';

// ─── IndexedDB Auto-Save ────────────────────────────────────────
const DB_NAME = 'web-lua-notebook';
const DB_VERSION = 1;
const STORE_NAME = 'notebooks';
const NOTEBOOK_KEY = 'default';

let autoSaveTimer: ReturnType<typeof setTimeout> | null = null;

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function saveToIndexedDB(nb: Notebook): Promise<void> {
  try {
    const db = await openDB();
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).put(serializeNotebook(nb), NOTEBOOK_KEY);
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  } catch (e) {
    console.warn('[auto-save] failed:', e);
  }
}

async function loadFromIndexedDB(): Promise<Notebook | null> {
  try {
    const db = await openDB();
    const tx = db.transaction(STORE_NAME, 'readonly');
    const req = tx.objectStore(STORE_NAME).get(NOTEBOOK_KEY);
    const result = await new Promise<string | undefined>((resolve, reject) => {
      req.onsuccess = () => resolve(req.result as string | undefined);
      req.onerror = () => reject(req.error);
    });
    db.close();
    if (result) {
      return deserializeNotebook(result);
    }
    return null;
  } catch (e) {
    console.warn('[auto-load] failed:', e);
    return null;
  }
}

/** Debounced auto-save: saves 500ms after the last call. */
function scheduleAutoSave() {
  if (autoSaveTimer) clearTimeout(autoSaveTimer);
  autoSaveTimer = setTimeout(() => {
    saveToIndexedDB(notebook);
  }, 500);
}

// ─── State ───────────────────────────────────────────────────────
let notebook: Notebook = createNotebook();
let worker: Worker | null = null;
let kernelStatus: 'ready' | 'running' | 'stopped' | 'error' = 'ready';
let pendingCellId: string | null = null;
let runAllQueue: string[] = [];
let globalExecutionCount = 0;

// ─── Worker Management ──────────────────────────────────────────
function createWorker(): Promise<Worker> {
  return new Promise((resolve, reject) => {
    const w = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });
    const readyHandler = (e: MessageEvent) => {
      const msg = e.data;
      if (msg.type === 'ready') {
        w.removeEventListener('message', readyHandler);
        setKernelStatus('ready');
        resolve(w);
      } else if (msg.type === 'error') {
        w.removeEventListener('message', readyHandler);
        reject(new Error(msg.error));
      }
    };
    w.addEventListener('message', readyHandler);
    w.onerror = (e: ErrorEvent) => {
      reject(new Error(e.message));
    };
  });
}

let workerReady: Promise<Worker> | null = null;

async function ensureWorker(): Promise<Worker> {
  if (!workerReady) {
    workerReady = createWorker().then(w => {
      // Set up the permanent message handler
      w.onmessage = (e: MessageEvent) => {
        const msg = e.data;
        switch (msg.type) {
          case 'result':
            handleCellResult(msg.id, msg.data);
            break;
          case 'error':
            handleKernelError(msg.error);
            break;
          case 'resetDone':
            setKernelStatus('ready');
            break;
          case 'stopped':
            setKernelStatus('stopped');
            break;
          case 'asyncRelay':
            handleAsyncRelay(w, msg.id, msg.command);
            break;
        }
      };
      w.onerror = (e: ErrorEvent) => {
        handleKernelError(e.message);
      };
      worker = w;
      return w;
    });
  }
  return workerReady;
}

function terminateWorker() {
  if (worker) {
    worker.terminate();
    worker = null;
  }
  workerReady = null;
  setKernelStatus('stopped');
}

function setKernelStatus(status: typeof kernelStatus) {
  kernelStatus = status;
  updateKernelStatusUI();
}

function handleCellResult(cellId: string, data: WorkerRunResult) {
  const cell = notebook.cells.find(c => c.id === cellId);
  if (!cell) return;

  cell.outputs = data.stdout || [];
  cell.errors = data.stderr || [];
  if (data.error) {
    // Structured CellError from Rust: { kind, message?, line?, variable? }
    const err = data.error;
    const displayMsg = formatCellError(err);
    cell.errors.push(displayMsg);
    if (err.kind === 'fuel_exhausted') {
      cell.status = 'stopped';
    } else {
      cell.status = 'error';
    }
  } else if (data.fuel_exhausted) {
    cell.errors.push('Execution stopped: fuel limit reached (possible infinite loop)');
    cell.status = 'stopped';
  } else {
    cell.status = 'success';
  }
  cell.executionCount = data.execution_count || null;
  globalExecutionCount = Math.max(globalExecutionCount, data.execution_count || 0);

  renderCells();
  setKernelStatus('ready');

  // Continue run-all queue
  if (runAllQueue.length > 0) {
    const nextId = runAllQueue.shift()!;
    runSingleCell(nextId);
  }
}

function formatCellError(err: CellError): string {
  switch (err.kind) {
    case 'compile':
      return err.line
        ? `Compile error (line ${err.line}): ${err.message}`
        : `Compile error: ${err.message}`;
    case 'runtime':
      return `Runtime error: ${err.message}`;
    case 'strict_mode':
      return `Strict mode: undeclared variable '${err.variable}'`;
    case 'fuel_exhausted':
      return 'Execution stopped: fuel limit reached';
    case 'internal':
      return `Internal error: ${err.message}`;
  }
}

function handleKernelError(error: string) {
  if (pendingCellId) {
    const cell = notebook.cells.find(c => c.id === pendingCellId);
    if (cell) {
      cell.errors = [error];
      cell.status = 'error';
      renderCells();
    }
    pendingCellId = null;
  }
  setKernelStatus('error');

  // Continue run-all queue even on error
  if (runAllQueue.length > 0) {
    const nextId = runAllQueue.shift()!;
    runSingleCell(nextId);
  }
}

// ─── Actions ────────────────────────────────────────────────────
async function runSingleCell(cellId: string) {
  const cell = notebook.cells.find(c => c.id === cellId);
  if (!cell) return;

  cell.status = 'running';
  cell.outputs = [];
  cell.errors = [];
  pendingCellId = cellId;
  renderCells();
  setKernelStatus('running');

  try {
    const w = await ensureWorker();
    const stdin = (document.getElementById(`stdin-${cellId}`) as HTMLTextAreaElement)?.value || '';
    w.postMessage({ type: 'runCell', id: cellId, code: cell.source, stdin });
  } catch (err: any) {
    handleKernelError(err.message || String(err));
  }
}

function runAllCells() {
  runAllQueue = notebook.cells.map(c => c.id);
  if (runAllQueue.length > 0) {
    const firstId = runAllQueue.shift()!;
    runSingleCell(firstId);
  }
}

function stopExecution() {
  terminateWorker();
  // Mark any running cell as stopped
  notebook.cells.forEach(c => {
    if (c.status === 'running') {
      c.status = 'stopped';
      c.errors.push('Execution stopped by user');
    }
  });
  runAllQueue = [];
  pendingCellId = null;
  renderCells();
}

function restartKernel() {
  terminateWorker();
  runAllQueue = [];
  pendingCellId = null;
  globalExecutionCount = 0;
  workerReady = null;
  // Clear execution counts but keep source code
  notebook.cells.forEach(c => {
    c.executionCount = null;
    c.status = 'idle';
    c.outputs = [];
    c.errors = [];
  });
  renderCells();
  // Pre-create the worker so kernel becomes ready
  ensureWorker();
}

function clearOutputs() {
  notebook.cells.forEach(c => {
    c.outputs = [];
    c.errors = [];
    c.status = 'idle';
  });
  renderCells();
}

function addCell(afterId?: string) {
  const cell = createCell();
  if (afterId) {
    const idx = notebook.cells.findIndex(c => c.id === afterId);
    notebook.cells.splice(idx + 1, 0, cell);
  } else {
    notebook.cells.push(cell);
  }
  renderCells();
  // Focus the new cell's editor
  setTimeout(() => {
    const editor = document.getElementById(`editor-${cell.id}`) as HTMLTextAreaElement;
    editor?.focus();
  }, 50);
}

function deleteCell(cellId: string) {
  if (notebook.cells.length <= 1) return;
  notebook.cells = notebook.cells.filter(c => c.id !== cellId);
  renderCells();
}

function moveCell(cellId: string, direction: 'up' | 'down') {
  const idx = notebook.cells.findIndex(c => c.id === cellId);
  if (idx < 0) return;
  const newIdx = direction === 'up' ? idx - 1 : idx + 1;
  if (newIdx < 0 || newIdx >= notebook.cells.length) return;
  [notebook.cells[idx], notebook.cells[newIdx]] = [notebook.cells[newIdx], notebook.cells[idx]];
  renderCells();
}

function saveNotebook() {
  const json = serializeNotebook(notebook);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'notebook.json';
  a.click();
  URL.revokeObjectURL(url);
}

function loadNotebook() {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.json';
  input.onchange = () => {
    const file = input.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const nb = deserializeNotebook(reader.result as string);
      if (nb) {
        notebook = nb;
        renderCells();
      } else {
        alert('Invalid notebook file');
      }
    };
    reader.readAsText(file);
  };
  input.click();
}

// ─── UI Rendering ───────────────────────────────────────────────
function renderCells() {
  scheduleAutoSave();
  const container = document.getElementById('cells-container')!;
  container.innerHTML = '';

  notebook.cells.forEach((cell, idx) => {
    const el = document.createElement('div');
    el.className = `cell cell-${cell.status}`;
    el.dataset.cellId = cell.id;
    el.dataset.testid = 'cell';

    const execLabel = cell.executionCount !== null ? `In [${cell.executionCount}]` : `In [ ]`;
    const statusClass = `status-${cell.status}`;
    const statusText = cell.status;

    el.innerHTML = `
      <div class="cell-header">
        <span class="exec-label" data-testid="cell-execution-count">${execLabel}</span>
        <span class="cell-status ${statusClass}" data-testid="cell-status">${statusText}</span>
        <div class="cell-actions">
          <button class="btn btn-run" data-action="run" data-testid="cell-run-button" data-cell-id="${cell.id}" title="Run cell (Ctrl+Enter)">▶ Run</button>
          <button class="btn btn-sm" data-action="add" data-cell-id="${cell.id}" title="Add cell below">+ Add</button>
          <button class="btn btn-sm" data-action="up" data-testid="cell-move-up-button" data-cell-id="${cell.id}" title="Move up" ${idx === 0 ? 'disabled' : ''}>↑</button>
          <button class="btn btn-sm" data-action="down" data-testid="cell-move-down-button" data-cell-id="${cell.id}" title="Move down" ${idx === notebook.cells.length - 1 ? 'disabled' : ''}>↓</button>
          <button class="btn btn-sm btn-danger" data-action="delete" data-testid="cell-delete-button" data-cell-id="${cell.id}" title="Delete cell" ${notebook.cells.length <= 1 ? 'disabled' : ''}>✕</button>
        </div>
      </div>
      <div class="cell-body">
        <textarea class="cell-editor" data-testid="cell-editor" id="editor-${cell.id}" spellcheck="false" placeholder="Enter Lua code here...">${escapeHtml(cell.source)}</textarea>
      </div>
      <div class="cell-outputs" data-testid="cell-output" id="outputs-${cell.id}">
        ${cell.outputs.map(o => `<div class="output-line" data-testid="cell-output-line">${escapeHtml(o)}</div>`).join('')}
        ${cell.errors.map(e => `<div class="output-error" data-testid="cell-error">${escapeHtml(e)}</div>`).join('')}
      </div>
    `;

    container.appendChild(el);

    // Wire up the textarea to update cell.source
    const textarea = el.querySelector(`#editor-${cell.id}`) as HTMLTextAreaElement;
    textarea.addEventListener('input', () => {
      cell.source = textarea.value;
    });

    // Tab key inserts tab
    textarea.addEventListener('keydown', (e: KeyboardEvent) => {
      if (e.key === 'Tab') {
        e.preventDefault();
        const start = textarea.selectionStart;
        const end = textarea.selectionEnd;
        textarea.value = textarea.value.substring(0, start) + '  ' + textarea.value.substring(end);
        textarea.selectionStart = textarea.selectionEnd = start + 2;
        cell.source = textarea.value;
      }
      // Ctrl+Enter runs the cell
      if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        // Save source first
        cell.source = textarea.value;
        runSingleCell(cell.id);
      }
    });
  });
}

function updateKernelStatusUI() {
  const el = document.getElementById('kernel-status')!;
  el.className = `kernel-status kernel-${kernelStatus}`;
  el.textContent = `Kernel: ${kernelStatus}`;
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// ─── Main Thread Relay for Async Commands ─────────────────────────
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
    default:
      // host.call() custom handlers — check registered handlers
      if (command.action.startsWith('host_')) {
        return handleHostCallAction(command.action.slice(5), command.params);
      }
      return {
        ok: false,
        error: { message: `Unknown main-thread action: ${command.action}`, code: 'EUNKNOWN', category: 'unknown' },
      };
  }
}

// ─── Custom host.call() Handlers ─────────────────────────────────

// Host app registers custom handlers by setting this object.
// Example: window.__notebookHostHandlers = { greet: async (params) => "Hello, " + params.name }
const hostHandlers: Record<string, (params: any) => Promise<any>> = {};

/**
 * Register a custom handler for host.call() from Lua.
 * @param action The action name (without "host_" prefix)
 * @param handler Async function that receives params and returns a value
 */
export function registerHostHandler(action: string, handler: (params: any) => Promise<any>) {
  hostHandlers[action] = handler;
}

/**
 * Register multiple handlers at once.
 */
export function registerHostHandlers(handlers: Record<string, (params: any) => Promise<any>>) {
  Object.assign(hostHandlers, handlers);
}

async function handleHostCallAction(action: string, params: any): Promise<any> {
  // Check internal handlers first, then window.__hostHandlers (for testing/dynamic registration)
  const handler = hostHandlers[action]
    || (window as any).__hostHandlers?.[action];
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

// ─── Event Wiring ───────────────────────────────────────────────
async function init() {
  // Toolbar buttons
  document.getElementById('btn-add-cell')!.addEventListener('click', () => addCell());
  document.getElementById('btn-run-all')!.addEventListener('click', runAllCells);
  document.getElementById('btn-stop')!.addEventListener('click', stopExecution);
  document.getElementById('btn-restart')!.addEventListener('click', restartKernel);
  document.getElementById('btn-clear')!.addEventListener('click', clearOutputs);
  document.getElementById('btn-save')!.addEventListener('click', saveNotebook);
  document.getElementById('btn-load')!.addEventListener('click', loadNotebook);

  // Cell action buttons (delegated)
  document.getElementById('cells-container')!.addEventListener('click', (e: Event) => {
    const target = e.target as HTMLElement;
    const action = target.dataset.action;
    const cellId = target.dataset.cellId;
    if (!action || !cellId) return;

    // Save all editors before acting
    notebook.cells.forEach(c => {
      const editor = document.getElementById(`editor-${c.id}`) as HTMLTextAreaElement;
      if (editor) c.source = editor.value;
    });

    switch (action) {
      case 'run': runSingleCell(cellId); break;
      case 'add': addCell(cellId); break;
      case 'up': moveCell(cellId, 'up'); break;
      case 'down': moveCell(cellId, 'down'); break;
      case 'delete': deleteCell(cellId); break;
    }
  });

  // Auto-load from IndexedDB
  const saved = await loadFromIndexedDB();
  if (saved && saved.cells.length > 0) {
    notebook = saved;
    // Reset statuses since the kernel isn't running yet
    notebook.cells.forEach(c => {
      c.status = 'idle';
    });
  }

  // Initial render
  renderCells();
  updateKernelStatusUI();
}

// Use DOMContentLoaded if document not yet ready, otherwise init immediately
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}

// Save on page unload so we don't lose work on tab close/refresh
window.addEventListener('beforeunload', () => {
  // Sync save — beforeunload allows sync IndexedDB in some browsers,
  // but we also save editor contents first
  notebook.cells.forEach(c => {
    const editor = document.getElementById(`editor-${c.id}`) as HTMLTextAreaElement;
    if (editor) c.source = editor.value;
  });
  saveToIndexedDB(notebook);
});
