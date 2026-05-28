// Notebook state and logic

export type CellKind = "code" | "markdown";

export interface Cell {
  id: string;
  kind: CellKind;
  source: string;
  outputs: Array<{ type: string; line: string }>;
  errors: string[];
  result: string | null;
  executionCount: number | null;
  status: "idle" | "running" | "success" | "error" | "stopped";
}

export interface Notebook {
  version: number;
  cells: Cell[];
  metadata: {
    runtime: string;
    language: string;
  };
}

export function createCell(source = "", kind: CellKind = "code"): Cell {
  return {
    id: crypto.randomUUID(),
    kind,
    source,
    outputs: [],
    errors: [],
    result: null,
    executionCount: null,
    status: "idle",
  };
}

export function createNotebook(): Notebook {
  return {
    version: 1,
    cells: [createCell('print("Hello, Lua! 🌙")')],
    metadata: {
      runtime: "piccolo",
      language: "lua-like",
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
      // Ensure every cell has a kind field (backwards compat)
      for (const cell of obj.cells) {
        if (!cell.kind) cell.kind = "code";
        // Old notebooks stored outputs as plain strings
        if (
          cell.outputs &&
          Array.isArray(cell.outputs) &&
          cell.outputs.length > 0 &&
          typeof cell.outputs[0] === "string"
        ) {
          cell.outputs = cell.outputs.map((line: string) => ({
            type: "stdout",
            line,
          }));
        }
      }
      return obj as Notebook;
    }
    return null;
  } catch {
    return null;
  }
}
