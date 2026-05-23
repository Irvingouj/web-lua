import type { CellError as CellErrorType, RunResult as RunResultType } from './generated';

export type CellError = CellErrorType;
export type RunResult = RunResultType;

export interface WorkerRunResult {
  stdout: string[];
  stderr: string[];
  result: string | null;
  error: CellError | null;
  commands: any[];
  fuel_exhausted: boolean;
  execution_count: number;
}
