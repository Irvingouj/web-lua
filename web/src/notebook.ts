// Notebook state and logic

export interface Cell {
  id: string;
  kind: 'code';
  source: string;
  outputs: string[];
  errors: string[];
  executionCount: number | null;
  status: 'idle' | 'running' | 'success' | 'error' | 'stopped';
}

export interface Notebook {
  version: number;
  cells: Cell[];
  metadata: {
    runtime: string;
    language: string;
  };
}

export function createCell(source = ''): Cell {
  return {
    id: crypto.randomUUID(),
    kind: 'code',
    source,
    outputs: [],
    errors: [],
    executionCount: null,
    status: 'idle',
  };
}

export function createNotebook(): Notebook {
  return {
    version: 1,
    cells: [createCell()],
    metadata: {
      runtime: 'piccolo',
      language: 'lua-like',
    },
  };
}

export function serializeNotebook(notebook: Notebook): string {
  return JSON.stringify(notebook, null, 2);
}

export function deserializeNotebook(json: string): Notebook | null {
  try {
    const obj = JSON.parse(json);
    if (obj.version === 1 && Array.isArray(obj.cells)) {
      return obj as Notebook;
    }
    return null;
  } catch {
    return null;
  }
}
