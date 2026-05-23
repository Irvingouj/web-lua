import './styles.css';
import { Cell, Notebook, createCell, createNotebook, serializeNotebook, deserializeNotebook } from './notebook';

// ─── State ───────────────────────────────────────────────────────
let notebook: Notebook = createNotebook();
let worker: Worker | null = null;
let kernelStatus: 'ready' | 'running' | 'stopped' | 'error' = 'ready';
let pendingCellId: string | null = null;
let runAllQueue: string[] = [];
let globalExecutionCount = 0;

// ─── Worker Management ──────────────────────────────────────────
function createWorker(): Worker {
  const w = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });
  w.onmessage = (e: MessageEvent) => {
    const msg = e.data;
    switch (msg.type) {
      case 'ready':
        setKernelStatus('ready');
        break;
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
    }
  };
  w.onerror = (e: ErrorEvent) => {
    handleKernelError(e.message);
  };
  return w;
}

function ensureWorker(): Worker {
  if (!worker) {
    worker = createWorker();
  }
  return worker;
}

function terminateWorker() {
  if (worker) {
    worker.terminate();
    worker = null;
  }
  setKernelStatus('stopped');
}

function setKernelStatus(status: typeof kernelStatus) {
  kernelStatus = status;
  updateKernelStatusUI();
}

function handleCellResult(cellId: string, data: any) {
  const cell = notebook.cells.find(c => c.id === cellId);
  if (!cell) return;

  cell.outputs = data.stdout || [];
  cell.errors = data.stderr || [];
  if (data.error) {
    cell.errors.push(data.error);
    cell.status = 'error';
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
function runSingleCell(cellId: string) {
  const cell = notebook.cells.find(c => c.id === cellId);
  if (!cell) return;

  cell.status = 'running';
  cell.outputs = [];
  cell.errors = [];
  pendingCellId = cellId;
  renderCells();
  setKernelStatus('running');

  const stdin = (document.getElementById(`stdin-${cellId}`) as HTMLTextAreaElement)?.value || '';
  const w = ensureWorker();
  w.postMessage({ type: 'runCell', id: cellId, code: cell.source, stdin });
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
  // Clear execution counts but keep source code
  notebook.cells.forEach(c => {
    c.executionCount = null;
    c.status = 'idle';
    c.outputs = [];
    c.errors = [];
  });
  renderCells();
  worker = createWorker();
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
  const container = document.getElementById('cells-container')!;
  container.innerHTML = '';

  notebook.cells.forEach((cell, idx) => {
    const el = document.createElement('div');
    el.className = `cell cell-${cell.status}`;
    el.dataset.cellId = cell.id;

    const execLabel = cell.executionCount !== null ? `In [${cell.executionCount}]` : `In [ ]`;
    const statusClass = `status-${cell.status}`;
    const statusText = cell.status;

    el.innerHTML = `
      <div class="cell-header">
        <span class="exec-label">${execLabel}</span>
        <span class="cell-status ${statusClass}">${statusText}</span>
        <div class="cell-actions">
          <button class="btn btn-run" data-action="run" data-cell-id="${cell.id}" title="Run cell (Ctrl+Enter)">▶ Run</button>
          <button class="btn btn-sm" data-action="add" data-cell-id="${cell.id}" title="Add cell below">+ Add</button>
          <button class="btn btn-sm" data-action="up" data-cell-id="${cell.id}" title="Move up" ${idx === 0 ? 'disabled' : ''}>↑</button>
          <button class="btn btn-sm" data-action="down" data-cell-id="${cell.id}" title="Move down" ${idx === notebook.cells.length - 1 ? 'disabled' : ''}>↓</button>
          <button class="btn btn-sm btn-danger" data-action="delete" data-cell-id="${cell.id}" title="Delete cell" ${notebook.cells.length <= 1 ? 'disabled' : ''}>✕</button>
        </div>
      </div>
      <div class="cell-body">
        <textarea class="cell-editor" id="editor-${cell.id}" spellcheck="false" placeholder="Enter Lua code here...">${escapeHtml(cell.source)}</textarea>
      </div>
      <div class="cell-outputs" id="outputs-${cell.id}">
        ${cell.outputs.map(o => `<div class="output-line">${escapeHtml(o)}</div>`).join('')}
        ${cell.errors.map(e => `<div class="output-error">${escapeHtml(e)}</div>`).join('')}
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

// ─── Event Wiring ───────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
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

  // Initial render
  renderCells();
  updateKernelStatusUI();
});
