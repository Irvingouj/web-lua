import type {
  CellError as CellErrorType,
  RunResult as RunResultType,
} from "./generated";

export type CellError = CellErrorType;
export type RunResult = RunResultType;

export interface WorkerRunResult {
  stdout: string[];
  stderr: string[];
  result: string | null;
  error: CellError | null;
  commands: unknown[];
  fuel_exhausted: boolean;
  execution_count: number;
  status: "done" | "async_pending";
  pending_command: {
    call_id: number;
    action: string;
    params: unknown;
  } | null;
}
