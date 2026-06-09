import { z } from "zod";
import { dispatchValidated } from "./registry/dispatch.js";
import { deriveTransport } from "./registry/routes.js";
import {
  assertRegistryNotFrozen,
  resetFreezeState,
} from "./registry/freeze.js";
import type {
  AsyncResponse,
  DoctestTool,
  ToolDefinition,
  ToolDoc,
  ToolDocParam,
  ToolInput,
  ToolRegistrationDoc,
} from "./registry/types.js";

const toolRegistry = new Map<string, ToolDefinition<unknown, unknown>>();

declare const __DOCTEST__: boolean | undefined;

export const doctestTools: DoctestTool[] = [];
const doctestRegistry = new Map<string, string>();

function isDoctestBuild(): boolean {
  return typeof __DOCTEST__ !== "undefined" && __DOCTEST__ === true;
}

function normalizeToolInput<P, R, I = P, O = R>(
  input: ToolInput<P, R, I, O>,
): ToolDefinition<P, R, I, O> {
  const actionParts = input.action.split("_");
  const derivedName = actionParts.pop() ?? input.action;
  const derivedNamespace = actionParts.join("_") || "default";
  const derivedPublicName = input.action.replace(/_/g, ".");
  return {
    ...input,
    name: input.name ?? derivedName,
    publicName: input.publicName ?? derivedPublicName,
    localName: input.localName ?? input.name ?? derivedName,
    source: input.source ?? "extension_worker",
    transport: input.transport ?? deriveTransport(input.action),
    namespace: input.namespace ?? derivedNamespace,
    description: input.description ?? "",
    paramDocs: input.paramDocs ?? {},
    paramTypes: input.paramTypes ?? [],
    returnDoc: input.returnDoc ?? "",
    errorCode: input.errorCode ?? "E_TOOL",
    errorCategory: input.errorCategory ?? "tool",
    allowShadowing: input.allowShadowing,
    returnType: input.returnType,
  } as ToolDefinition<P, R, I, O>;
}

export function register<P, R, I = P, O = R>(
  action: string,
  params: z.ZodType<P, z.ZodTypeDef, I>,
  returns: z.ZodType<R, z.ZodTypeDef, O>,
  doc: ToolRegistrationDoc,
  handler: (params: P) => R | Promise<R>,
): void;
export function register<P, R, I = P, O = R>(
  tool: ToolDefinition<P, R, I, O>,
): void;
export function register<P, R, I = P, O = R>(
  actionOrTool: string | ToolDefinition<P, R, I, O>,
  params?: z.ZodType<P, z.ZodTypeDef, I>,
  returns?: z.ZodType<R, z.ZodTypeDef, O>,
  doc?: ToolRegistrationDoc,
  handler?: (params: P) => R | Promise<R>,
): void {
  assertRegistryNotFrozen();

  const tool =
    typeof actionOrTool === "string"
      ? makeToolDefinition(actionOrTool, params!, returns!, doc!, handler!)
      : actionOrTool;

  if (toolRegistry.has(tool.action)) {
    throw new Error(`Tool "${tool.action}" is already registered`);
  }
  toolRegistry.set(tool.action, tool as ToolDefinition<unknown, unknown>);
  if (isDoctestBuild()) {
    const script = doctestRegistry.get(tool.action);
    if (typeof script === "string") {
      doctestTools.push({ action: tool.action, script });
    }
  }
}

export function registerDoctest(action: string, script: string): void {
  if (!isDoctestBuild()) {
    return;
  }
  doctestRegistry.set(action, script);
}

export function registerTool<P, R, I = P, O = R>(
  action: string,
  params: z.ZodType<P, z.ZodTypeDef, I>,
  returns: z.ZodType<R, z.ZodTypeDef, O>,
  doc: ToolRegistrationDoc,
  handler: (params: P) => R | Promise<R>,
): void;
export function registerTool<P, R, I = P, O = R>(
  tool: ToolInput<P, R, I, O>,
): void;
export function registerTool<P, R, I = P, O = R>(
  actionOrTool: string | ToolInput<P, R, I, O>,
  params?: z.ZodType<P, z.ZodTypeDef, I>,
  returns?: z.ZodType<R, z.ZodTypeDef, O>,
  doc?: ToolRegistrationDoc,
  handler?: (params: P) => R | Promise<R>,
): void {
  if (typeof actionOrTool === "string") {
    register(actionOrTool, params!, returns!, doc!, handler!);
  } else {
    register(normalizeToolInput(actionOrTool));
  }
}

export function makeToolDefinition<P, R, I = P, O = R>(
  action: string,
  params: z.ZodType<P, z.ZodTypeDef, I>,
  returns: z.ZodType<R, z.ZodTypeDef, O>,
  doc: ToolRegistrationDoc,
  handler: (params: P) => R | Promise<R>,
): ToolDefinition<P, R, I, O> {

  return {
    action,
    namespace: doc.namespace,
    name: doc.name,
    publicName: doc.publicName,
    localName: doc.localName,
    source: doc.source,
    transport: doc.transport,
    description: doc.description,
    params,
    returns,
    handler,
    paramDocs: Object.fromEntries(
      (doc.params ?? []).map((param: ToolDocParam) => [param.name, param.description]),
    ),
    paramTypes: doc.params ?? [],
    returnType: doc.returnType,
    returnDoc: doc.returnDoc ?? "",
    errorCode: doc.errorCode ?? "E_TOOL",
    errorCategory: doc.errorCategory ?? "tool",
    allowShadowing: doc.allowShadowing,
  };
}

// ─── Backward-compatible host handler API ──────────────────────

/**
 * Register a host handler using the legacy API.
 * This is a thin wrapper around register() that supplies z.unknown()
 * for both params and returns schemas and sets transport to "host_async".
 */
export function registerHostHandler(
  action: string,
  handler: (params: unknown) => unknown | Promise<unknown>,
) {
  register(
    action,
    z.unknown(),
    z.unknown(),
    {
      namespace: "host",
      name: action,
      publicName: action,
      source: "main_thread",
      transport: "host_async",
      description: "",
    },
    handler,
  );
}

/**
 * Register multiple host handlers at once.
 */
export function registerHostHandlers(
  handlers: Record<string, (params: unknown) => unknown | Promise<unknown>>,
) {
  for (const [action, handler] of Object.entries(handlers)) {
    registerHostHandler(action, handler);
  }
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
  doctestRegistry.clear();
  // Reset freeze state so tests can re-register tools
  resetFreezeState();
}

/**
 * Dispatch a command to a registered tool.
 * Validates params against the tool's zod schema, calls the handler,
 * and catches errors, returning an AsyncResponse.
 *
 * IMPORTANT: This function does NOT perform authorization, capability,
 * or scope checks. Callers must enforce these at a higher layer
 * (e.g., in the message router or WASM boundary).
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

  return dispatchValidated(tool, params);
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
      name: tool.name,
      publicName: tool.publicName,
      localName: tool.localName,
      source: tool.source,
      transport: tool.transport,
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

export { MergedDocRegistry } from "./registry/merged-doc.js";

// Re-exports from submodules
export { dispatchValidated } from "./registry/dispatch.js";
export {
  CHROME_PASSTHROUGH_ACTIONS,
  deriveTransport,
} from "./registry/routes.js";
export {
  freezeRegistry,
  isRegistryFrozen,
} from "./registry/freeze.js";
export { CONTENT_SCRIPT_ACTIONS } from "./registry/content-script-actions.js";
export type {
  AsyncError,
  AsyncResponse,
  Command,
  DoctestTool,
  ToolDefinition,
  ToolDoc,
  ToolDocParam,
  ToolInput,
  ToolRegistrationDoc,
  ToolReturnDoc,
  ToolSource,
  ToolTransport,
} from "./registry/types.js";
