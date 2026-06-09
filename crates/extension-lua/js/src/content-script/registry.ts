// Local content-script tool registry

import { z } from "zod";
import { makeToolDefinition } from "../shared/tool-registry.js";
import type {
  ToolDoc,
  ToolDefinition,
  ToolRegistrationDoc,
} from "../shared/registry/types.js";

export const csRegistry = new Map<string, ToolDefinition<unknown, unknown>>();
export const contentScriptDocsByPublicName = new Map<string, ToolDoc>();
export const contentScriptDocsByAction = new Map<string, ToolDoc>();

function _registerContentScriptTool<P, R>(tool: ToolDefinition<P, R>) {
  const key = tool.localName ?? tool.action;
  csRegistry.set(key, tool as ToolDefinition<unknown, unknown>);
  // Also register by full action name so pings and direct calls work
  if (tool.action !== key) {
    csRegistry.set(tool.action, tool as ToolDefinition<unknown, unknown>);
  }

  const doc: ToolDoc = {
    action: tool.action,
    namespace: tool.namespace,
    name: tool.name,
    publicName: tool.publicName,
    localName: tool.localName,
    source: tool.source,
    transport: tool.transport,
    description: tool.description,
    params: tool.paramTypes,
    returns: {
      type: tool.returnType ?? "unknown",
      description: tool.returnDoc,
    },
    errorCode: tool.errorCode,
    errorCategory: tool.errorCategory,
  };

  contentScriptDocsByPublicName.set(tool.publicName, doc);
  contentScriptDocsByAction.set(tool.action, doc);
}

export function register<P, R>(
  action: string,
  params: z.ZodSchema<P>,
  returns: z.ZodSchema<R>,
  doc: ToolRegistrationDoc,
  handler: (params: P) => R | Promise<R>,
): void {
  const tool = makeToolDefinition(action, params, returns, doc, handler);
  _registerContentScriptTool(tool);
}

export function listLocalToolDocs(): ToolDoc[] {
  return Array.from(contentScriptDocsByAction.values());
}

export function computeToolsHash(): string {
  const names = Array.from(
    new Set(Array.from(csRegistry.values()).map((t) => t.publicName)),
  ).sort();
  let hash = 5381;
  const str = names.join("|");
  for (let i = 0; i < str.length; i++) {
    hash = (hash << 5) + hash + str.charCodeAt(i);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

export function dispatchLocalTool(
  action: string,
  params: unknown,
):
  | { ok: true; tool: ToolDefinition<unknown, unknown>; parsed: unknown }
  | { ok: false; error: string } {
  const tool = csRegistry.get(action);
  if (!tool) {
    return { ok: false, error: `Unknown content script action: ${action}` };
  }
  const parsed = tool.params.safeParse(params ?? {});
  if (!parsed.success) {
    return { ok: false, error: `Invalid params: ${parsed.error.message}` };
  }
  return { ok: true, tool, parsed: parsed.data };
}

export function clearContentScriptRegistry(): void {
  csRegistry.clear();
  contentScriptDocsByPublicName.clear();
  contentScriptDocsByAction.clear();
}
