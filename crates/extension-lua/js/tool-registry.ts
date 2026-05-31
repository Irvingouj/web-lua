import type { z } from "zod";

export interface Command {
  action: string;
  params: unknown;
}

export type AsyncError = {
  message: string;
  code: string;
  category?: string;
};

export type AsyncResponse<T = unknown> =
  | { ok: true; value: T }
  | { ok: false; error: AsyncError };

export interface ToolDocParam {
  name: string;
  type: string;
  required: boolean;
  description: string;
}

export interface ToolDoc {
  action: string;
  namespace: string;
  description: string;
  params: ToolDocParam[];
  returns: {
    type: string;
    description: string;
  };
  errorCode: string;
  errorCategory: string;
}

export interface ToolDefinition<P, R> {
  action: string;
  namespace: string;
  description: string;
  params: z.ZodSchema<P>;
  returns: z.ZodSchema<R>;
  handler: (params: P) => Promise<R>;
  paramDocs: Record<string, string>;
  paramTypes: ToolDocParam[];
  returnType?: string;
  returnDoc: string;
  errorCode: string;
  errorCategory: string;
  allowShadowing?: boolean;
  testScript?: string;
}

const toolRegistry = new Map<string, ToolDefinition<unknown, unknown>>();
const legacyActions = new Set<string>();

declare const __DOCTEST__: boolean | undefined;

export interface ToolRegistrationDoc {
  namespace: string;
  description: string;
  params?: ToolDocParam[];
  returnType?: string;
  returnDoc?: string;
  errorCode?: string;
  errorCategory?: string;
  allowShadowing?: boolean;
  testScript?: string;
}

export interface DoctestTool {
  action: string;
  testScript: string;
}

export const doctestTools: DoctestTool[] = [];

function isDoctestBuild(): boolean {
  return typeof __DOCTEST__ !== "undefined" && __DOCTEST__ === true;
}

/**
 * Register legacy action names so that registerTool can detect shadowing.
 */
export function registerLegacyActions(actions: string[]): void {
  for (const action of actions) {
    legacyActions.add(action);
  }
}

/**
 * Register a new tool in the global registry.
 * Throws if a tool with the same action is already registered.
 * Warns if the action shadows a legacy built-in command.
 */
export function register<P, R>(
  action: string,
  params: z.ZodSchema<P>,
  returns: z.ZodSchema<R>,
  doc: ToolRegistrationDoc,
  handler: (params: P) => Promise<R>,
): void;
export function register<P, R>(tool: ToolDefinition<P, R>): void;
export function register<P, R>(
  actionOrTool: string | ToolDefinition<P, R>,
  params?: z.ZodSchema<P>,
  returns?: z.ZodSchema<R>,
  doc?: ToolRegistrationDoc,
  handler?: (params: P) => Promise<R>,
): void {
  const tool =
    typeof actionOrTool === "string"
      ? makeToolDefinition(actionOrTool, params, returns, doc, handler)
      : actionOrTool;

  if (toolRegistry.has(tool.action)) {
    throw new Error(`Tool "${tool.action}" is already registered`);
  }
  if (legacyActions.has(tool.action) && !tool.allowShadowing) {
    throw new Error(
      `Tool "${tool.action}" shadows a legacy built-in command. ` +
        `Set allowShadowing: true if this is intentional.`,
    );
  }
  toolRegistry.set(tool.action, tool as ToolDefinition<unknown, unknown>);
  if (isDoctestBuild() && typeof tool.testScript === "string") {
    doctestTools.push({ action: tool.action, testScript: tool.testScript });
  }
}

export function registerTool<P, R>(
  action: string,
  params: z.ZodSchema<P>,
  returns: z.ZodSchema<R>,
  doc: ToolRegistrationDoc,
  handler: (params: P) => Promise<R>,
): void;
export function registerTool<P, R>(tool: ToolDefinition<P, R>): void;
export function registerTool<P, R>(
  actionOrTool: string | ToolDefinition<P, R>,
  params?: z.ZodSchema<P>,
  returns?: z.ZodSchema<R>,
  doc?: ToolRegistrationDoc,
  handler?: (params: P) => Promise<R>,
): void {
  if (typeof actionOrTool === "string") {
    register(
      actionOrTool,
      params as z.ZodSchema<P>,
      returns as z.ZodSchema<R>,
      doc as ToolRegistrationDoc,
      handler as (params: P) => Promise<R>,
    );
  } else {
    register(actionOrTool);
  }
}

function makeToolDefinition<P, R>(
  action: string,
  params: z.ZodSchema<P> | undefined,
  returns: z.ZodSchema<R> | undefined,
  doc: ToolRegistrationDoc | undefined,
  handler: ((params: P) => Promise<R>) | undefined,
): ToolDefinition<P, R> {
  if (!params || !returns || !doc || !handler) {
    throw new Error(
      "registerTool(action, params, returns, doc, handler) requires all five arguments",
    );
  }

  return {
    action,
    namespace: doc.namespace,
    description: doc.description,
    params,
    returns,
    handler,
    paramDocs: Object.fromEntries(
      (doc.params ?? []).map((param) => [param.name, param.description]),
    ),
    paramTypes: doc.params ?? [],
    returnType: doc.returnType,
    returnDoc: doc.returnDoc ?? "",
    errorCode: doc.errorCode ?? "E_TOOL",
    errorCategory: doc.errorCategory ?? "tool",
    allowShadowing: doc.allowShadowing,
    ...(isDoctestBuild() && typeof doc.testScript === "string"
      ? { testScript: doc.testScript }
      : {}),
  };
}

/**
 * Retrieve a registered tool by action name.
 * Returns undefined if no tool is registered for that action.
 */
export function getTool(
  action: string,
): ToolDefinition<unknown, unknown> | undefined {
  return toolRegistry.get(action);
}

/**
 * Remove all tools from the registry.
 * Primarily intended for test teardown.
 */
export function clearRegistry(): void {
  toolRegistry.clear();
  doctestTools.length = 0;
}

/**
 * Dispatch a command to a registered tool.
 * Validates params against the tool's zod schema, calls the handler,
 * and catches errors, returning an AsyncResponse.
 */
export async function dispatchTool(
  action: string,
  params: unknown,
): Promise<AsyncResponse> {
  const tool = toolRegistry.get(action);
  if (!tool) {
    return {
      ok: false,
      error: {
        message: `Tool "${action}" not found in registry`,
        code: "E_TOOL_NOT_FOUND",
        category: "registry",
      },
    };
  }

  const parseResult = tool.params.safeParse(params);
  if (!parseResult.success) {
    return {
      ok: false,
      error: {
        message: "Invalid parameters",
        code: "E_INVALID_PARAMS",
        category: "validation",
      },
    };
  }

  try {
    const value = await tool.handler(parseResult.data);
    return { ok: true, value };
  } catch (err: unknown) {
    const code = (err as { code?: string }).code ?? tool.errorCode;
    const category =
      (err as { category?: string }).category ?? tool.errorCategory;
    const message =
      err instanceof Error ? err.message : "Tool execution failed";
    return {
      ok: false,
      error: {
        message,
        code,
        category,
      },
    };
  }
}

/**
 * List documentation for all registered tools.
 * Uses explicitly provided paramTypes rather than introspecting zod schemas.
 */
export function listTools(): ToolDoc[] {
  const docs: ToolDoc[] = [];
  for (const [action, tool] of toolRegistry) {
    const params = tool.paramTypes.map((pt) => ({
      name: pt.name,
      type: pt.type,
      required: pt.required,
      description: pt.description,
    }));

    docs.push({
      action,
      namespace: tool.namespace,
      description: tool.description,
      params,
      returns: {
        type: tool.returnType ?? "unknown",
        description: tool.returnDoc,
      },
      errorCode: tool.errorCode,
      errorCategory: tool.errorCategory,
    });
  }
  return docs;
}
