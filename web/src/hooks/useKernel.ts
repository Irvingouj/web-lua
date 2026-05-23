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
    default:
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
