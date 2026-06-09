// Runtime documentation tools — __runtime_docs, __runtime_get_doc, __runtime_search_docs

import { z } from "zod";
import {
  listTools,
  MergedDocRegistry,
  registerTool,
} from "../../../shared/tool-registry.js";
import { ToolDocSchema } from "../../../shared/schemas.js";

export const mergedDocRegistry = new MergedDocRegistry();

registerTool({
  action: "__runtime_docs",
  namespace: "runtime",
  name: "docs",
  publicName: "runtime.docs",
  source: "main_thread",
  transport: "extension_worker",
  description: "List all available tools",
  params: z.object({}),
  paramTypes: [],
  returns: z.array(ToolDocSchema),
  returnDoc: "ToolDoc[]",
  errorCode: "ERUNTIME",
  errorCategory: "runtime",
  paramDocs: {},
  handler: async () => mergedDocRegistry.list(),
});

registerTool({
  action: "__runtime_get_doc",
  namespace: "runtime",
  name: "get_doc",
  publicName: "runtime.get_doc",
  source: "main_thread",
  transport: "extension_worker",
  description: "Get a tool doc by public name or action",
  params: z.object({ query: z.string() }),
  paramTypes: [
    {
      name: "query",
      type: "string",
      required: true,
      description: "Public name or action to look up",
    },
  ],
  returns: ToolDocSchema.nullable(),
  returnDoc: "ToolDoc | null",
  errorCode: "ERUNTIME",
  errorCategory: "runtime",
  paramDocs: { query: "Public name or action to look up" },
  handler: async (params) => mergedDocRegistry.get(params.query) ?? null,
});

registerTool({
  action: "__runtime_search_docs",
  namespace: "runtime",
  name: "search_docs",
  publicName: "runtime.search_docs",
  source: "main_thread",
  transport: "extension_worker",
  description: "Search tool docs by keyword",
  params: z.object({ query: z.string() }),
  paramTypes: [
    {
      name: "query",
      type: "string",
      required: true,
      description: "Search keyword",
    },
  ],
  returns: z.array(ToolDocSchema),
  returnDoc: "ToolDoc[]",
  errorCode: "ERUNTIME",
  errorCategory: "runtime",
  paramDocs: { query: "Search keyword" },
  handler: async (params) => mergedDocRegistry.search(params.query),
});

export function initRuntimeDocs(): void {
  mergedDocRegistry.setStaticDocs(listTools());
}
