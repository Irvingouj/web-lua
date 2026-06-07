// Unified tool registry for web-lua main thread.
// Matches the register() shape used by extension-lua so both packages share
// the same registration pattern.

import { z } from "zod";

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

export type ToolSource =
  | "rust_core"
  | "extension_worker"
  | "main_thread"
  | "content_script"
  | "sidepanel";

export type ToolTransport =
  | "rust_sync"
  | "host_async"
  | "extension_worker"
  | "chrome_api"
  | "active_tab_content_script"
  | "specific_tab_content_script"
  | "sidepanel_dom";

export interface ToolDocParam {
  name: string;
  type: string;
  required: boolean;
  description: string;
}

export interface ToolReturnDoc {
  type: string;
  description: string;
}

export interface ToolDoc {
  action: string;
  namespace: string;
  name: string;
  publicName: string;
  localName?: string;
  source: ToolSource;
  transport: ToolTransport;
  description: string;
  params: ToolDocParam[];
  returns: ToolReturnDoc;
  errorCode: string;
  errorCategory: string;
}

export interface ToolDefinition<P, R, I = P, O = R> {
  action: string;
  namespace: string;
  name: string;
  publicName: string;
  localName?: string;
  source: ToolSource;
  transport: ToolTransport;
  description: string;
  params: z.ZodType<P, z.ZodTypeDef, I>;
  returns: z.ZodType<R, z.ZodTypeDef, O>;
  handler: (params: P) => Promise<R>;
  paramDocs: Record<string, string>;
  paramTypes: ToolDocParam[];
  returnType?: string;
  returnDoc: string;
  errorCode: string;
  errorCategory: string;
}

export interface ToolRegistrationDoc {
  namespace: string;
  name: string;
  publicName: string;
  localName?: string;
  source: ToolSource;
  transport: ToolTransport;
  description: string;
  params?: ToolDocParam[];
  returnType?: string;
  returnDoc?: string;
  errorCode?: string;
  errorCategory?: string;
}

const toolRegistry = new Map<string, ToolDefinition<unknown, unknown>>();

export function register<P, R, I = P, O = R>(
  action: string,
  params: z.ZodType<P, z.ZodTypeDef, I>,
  returns: z.ZodType<R, z.ZodTypeDef, O>,
  doc: ToolRegistrationDoc,
  handler: (params: P) => Promise<R>,
): void;
export function register<P, R, I = P, O = R>(
  tool: ToolDefinition<P, R, I, O>,
): void;
export function register<P, R, I = P, O = R>(
  actionOrTool: string | ToolDefinition<P, R, I, O>,
  params?: z.ZodType<P, z.ZodTypeDef, I>,
  returns?: z.ZodType<R, z.ZodTypeDef, O>,
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
  toolRegistry.set(tool.action, tool as ToolDefinition<unknown, unknown>);
}

export function registerTool<P, R, I = P, O = R>(
  action: string,
  params: z.ZodType<P, z.ZodTypeDef, I>,
  returns: z.ZodType<R, z.ZodTypeDef, O>,
  doc: ToolRegistrationDoc,
  handler: (params: P) => Promise<R>,
): void;
export function registerTool<P, R, I = P, O = R>(
  tool: ToolDefinition<P, R, I, O>,
): void;
export function registerTool<P, R, I = P, O = R>(
  actionOrTool: string | ToolDefinition<P, R, I, O>,
  params?: z.ZodType<P, z.ZodTypeDef, I>,
  returns?: z.ZodType<R, z.ZodTypeDef, O>,
  doc?: ToolRegistrationDoc,
  handler?: (params: P) => Promise<R>,
): void {
  if (typeof actionOrTool === "string") {
    register(
      actionOrTool,
      params!,
      returns!,
      doc!,
      handler!,
    );
  } else {
    register(actionOrTool);
  }
}

function makeToolDefinition<P, R, I = P, O = R>(
  action: string,
  params: z.ZodType<P, z.ZodTypeDef, I> | undefined,
  returns: z.ZodType<R, z.ZodTypeDef, O> | undefined,
  doc: ToolRegistrationDoc | undefined,
  handler: ((params: P) => Promise<R>) | undefined,
): ToolDefinition<P, R, I, O> {
  if (!params || !returns || !doc || !handler) {
    throw new Error(
      "register(action, params, returns, doc, handler) requires all five arguments",
    );
  }

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
      (doc.params ?? []).map((param) => [param.name, param.description]),
    ),
    paramTypes: doc.params ?? [],
    returnType: doc.returnType,
    returnDoc: doc.returnDoc ?? "",
    errorCode: doc.errorCode ?? "E_TOOL",
    errorCategory: doc.errorCategory ?? "tool",
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
}

/**
 * Dispatch a command to a registered tool.
 * Validates params against the tool's zod schema, calls the handler,
 * validates the return value, and catches errors, returning an AsyncResponse.
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
    const returnResult = tool.returns.safeParse(value);
    if (!returnResult.success) {
      return {
        ok: false,
        error: {
          message: `Tool "${action}" returned invalid data`,
          code: "E_INVALID_RETURN",
          category: "validation",
        },
      };
    }
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

// ─── Backward-compatible host handler API ──────────────────────

const hostHandlers: Record<string, (params: unknown) => Promise<unknown>> = {};

/**
 * Register a host handler using the legacy API.
 * This is a thin wrapper around register() that supplies z.unknown()
 * for both params and returns schemas and sets transport to "host_async".
 */
export function registerHostHandler<T, R>(
  action: string,
  handler: (params: T) => Promise<R>,
) {
  hostHandlers[action] = handler as (params: unknown) => Promise<unknown>;
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
    handler as (params: unknown) => Promise<unknown>,
  );
}

/**
 * Register multiple host handlers at once.
 */
export function registerHostHandlers(
  handlers: Record<string, (params: unknown) => Promise<unknown>>,
) {
  for (const [action, handler] of Object.entries(handlers)) {
    registerHostHandler(action, handler);
  }
}

// ─── Merged documentation registry ─────────────────────────────

/**
 * Merged doc registry that combines static docs (from Rust api_docs::REGISTRY)
 * with runtime docs (from JS-registered tools or content scripts).
 *
 * Static docs are always present. Runtime docs are merged in without
 * replacing static docs — when both exist for the same action/publicName,
 * the static doc wins.
 */
export class MergedDocRegistry {
  byPublicName = new Map<string, ToolDoc>();
  byAction = new Map<string, ToolDoc>();
  private staticDocs = new Map<string, ToolDoc>();
  private runtimeDocs = new Map<string, ToolDoc>();

  /**
   * Populate static docs from `listTools()` output or Rust api_docs.
   * Clears and rebuilds the static doc index.
   */
  setStaticDocs(docs: ToolDoc[]): void {
    this.staticDocs.clear();
    for (const doc of docs) {
      this.staticDocs.set(doc.action, doc);
    }
    this.rebuildIndexes();
  }

  /**
   * Merge runtime docs (e.g. from content script `__tool_docs`).
   * Runtime docs override static docs for the same action/publicName.
   */
  mergeRuntimeDocs(docs: ToolDoc[]): void {
    for (const doc of docs) {
      this.runtimeDocs.set(doc.action, doc);
    }
    this.rebuildIndexes();
  }

  /**
   * Clear only runtime docs. Static docs remain.
   */
  clearRuntimeDocs(): void {
    this.runtimeDocs.clear();
    this.rebuildIndexes();
  }

  /**
   * Get a doc by public Lua API name (e.g. "page.click") or by internal
   * action name (e.g. "page_click"). Returns undefined if not found.
   */
  get(query: string): ToolDoc | undefined {
    return this.byPublicName.get(query) ?? this.byAction.get(query);
  }

  /**
   * List all unique docs (static + runtime), sorted by publicName.
   */
  list(): ToolDoc[] {
    const seen = new Set<string>();
    const docs: ToolDoc[] = [];
    for (const doc of this.byPublicName.values()) {
      if (!seen.has(doc.action)) {
        seen.add(doc.action);
        docs.push(doc);
      }
    }
    docs.sort((a, b) => a.publicName.localeCompare(b.publicName));
    return docs;
  }

  /**
   * Fuzzy search over publicName, namespace, name, action, description,
   * param names, param descriptions, and return description.
   * Returns matching docs sorted by relevance (higher score first).
   */
  search(query: string): ToolDoc[] {
    const q = query.toLowerCase().trim();
    if (!q) {
      return this.list();
    }

    const scored: Array<{ doc: ToolDoc; score: number }> = [];
    for (const doc of this.list()) {
      const score = this.scoreDoc(doc, q);
      if (score > 0) {
        scored.push({ doc, score });
      }
    }

    scored.sort((a, b) => b.score - a.score);
    return scored.map((s) => s.doc);
  }

  private scoreDoc(doc: ToolDoc, q: string): number {
    let score = 0;

    // Exact matches in primary identifiers score highest
    if (doc.publicName.toLowerCase() === q) score += 100;
    if (doc.action.toLowerCase() === q) score += 90;
    if (doc.name.toLowerCase() === q) score += 80;
    if (doc.namespace.toLowerCase() === q) score += 70;

    // Partial matches in primary identifiers
    if (doc.publicName.toLowerCase().includes(q)) score += 50;
    if (doc.action.toLowerCase().includes(q)) score += 40;
    if (doc.name.toLowerCase().includes(q)) score += 30;
    if (doc.namespace.toLowerCase().includes(q)) score += 20;

    // Description match
    if (doc.description.toLowerCase().includes(q)) score += 10;

    // Param names and descriptions
    for (const param of doc.params) {
      if (param.name.toLowerCase().includes(q)) score += 15;
      if (param.description.toLowerCase().includes(q)) score += 5;
    }

    // Return description
    if (doc.returns.description.toLowerCase().includes(q)) score += 5;

    return score;
  }

  private rebuildIndexes(): void {
    this.byPublicName.clear();
    this.byAction.clear();

    // Runtime docs first — static docs override them for the same action/publicName
    for (const doc of this.runtimeDocs.values()) {
      this.byPublicName.set(doc.publicName, doc);
      this.byAction.set(doc.action, doc);
    }

    // Static docs win when both exist
    for (const doc of this.staticDocs.values()) {
      this.byPublicName.set(doc.publicName, doc);
      this.byAction.set(doc.action, doc);
    }
  }
}
