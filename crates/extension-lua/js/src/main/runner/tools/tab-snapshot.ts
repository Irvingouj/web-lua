import { z } from "zod";
import { registerTool, dispatchTool } from "../../../shared/tool-registry.js";
import {
  TabSnapshotDataParamsSchema,
  TabSnapshotParamsSchema,
  TabSnapshotTextParamsSchema,
} from "../../../shared/schemas.js";
import { executeInTab, createInlineSnapshotFunc } from "../tab/execute.js";
import { throwToolError } from "../../../shared/errors.js";

async function runTabSnapshot(params: {
  tabId: number | string;
  max_nodes?: number;
  interactive_only?: boolean;
}): Promise<string> {
  const targetTab = Number(params.tabId);
  const maxNodes = params.max_nodes ?? 500;
  const interactiveOnly = params.interactive_only ?? false;
  const result = await executeInTab(targetTab, createInlineSnapshotFunc(), [
    maxNodes,
    interactiveOnly,
  ]);
  if (!result.ok) {
    throwToolError(result);
  }
  if (result.value !== null && typeof result.value === "object") {
    return (result.value as Record<string, unknown>).text as string;
  }
  return String(result.value);
}

registerTool({
  action: "tab_snapshot",
  namespace: "tab",
  description: "Take a DOM snapshot of the target tab and return readable text",
  params: TabSnapshotParamsSchema,
  paramTypes: [
    {
      name: "tabId",
      type: "number",
      required: true,
      description: "Target tab ID",
    },
    {
      name: "max_nodes",
      type: "number",
      required: false,
      description: "Maximum nodes to include (default 500)",
    },
    {
      name: "interactive_only",
      type: "boolean",
      required: false,
      description: "Only include interactive elements",
    },
  ],
  returns: z.string(),
  returnDoc: "string",
  errorCode: "ETAB",
  errorCategory: "tab",
  paramDocs: {
    tabId: "Target tab ID",
    max_nodes: "Maximum nodes to include",
    interactive_only: "Only interactive elements",
  },
  transport: "chrome_api",
  handler: async (params) => runTabSnapshot(params),
});

registerTool({
  action: "tab_snapshot_text",
  namespace: "tab",
  description: "Take a DOM snapshot and return readable text (explicit alias)",
  params: TabSnapshotTextParamsSchema,
  paramTypes: [
    {
      name: "tabId",
      type: "number",
      required: true,
      description: "Target tab ID",
    },
    {
      name: "max_nodes",
      type: "number",
      required: false,
      description: "Maximum nodes to include (default 500)",
    },
    {
      name: "interactive_only",
      type: "boolean",
      required: false,
      description: "Only include interactive elements",
    },
  ],
  returns: z.string(),
  returnDoc: "string",
  errorCode: "ETAB",
  errorCategory: "tab",
  paramDocs: {
    tabId: "Target tab ID",
    max_nodes: "Maximum nodes to include",
    interactive_only: "Only interactive elements",
  },
  transport: "chrome_api",
  handler: async (params) => {
    const result = await dispatchTool("tab_snapshot", params);
    if (!result.ok) {
      throwToolError(result);
    }
    return result.value as string;
  },
});

registerTool({
  action: "tab_snapshot_data",
  namespace: "tab",
  description: "Take a DOM snapshot and return structured data",
  params: TabSnapshotDataParamsSchema,
  paramTypes: [
    {
      name: "tabId",
      type: "number",
      required: true,
      description: "Target tab ID",
    },
    {
      name: "max_nodes",
      type: "number",
      required: false,
      description: "Maximum nodes to include (default 500)",
    },
    {
      name: "interactive_only",
      type: "boolean",
      required: false,
      description: "Only include interactive elements",
    },
  ],
  returns: z
    .object({
      text: z.string(),
      nodes: z.array(
        z.object({
          refId: z.number(),
          role: z.string(),
          tag: z.string(),
          name: z.string().optional(),
        }),
      ),
      url: z.string(),
      title: z.string(),
      viewport: z.object({
        width: z.number(),
        height: z.number(),
      }),
    })
    .passthrough(),
  returnDoc: "SnapshotResult",
  errorCode: "ETAB",
  errorCategory: "tab",
  paramDocs: {
    tabId: "Target tab ID",
    max_nodes: "Maximum nodes to include",
    interactive_only: "Only include interactive elements",
  },
  transport: "chrome_api",
  handler: async (params) => {
    const targetTab = Number(params.tabId);
    const maxNodes = params.max_nodes ?? 500;
    const result = await executeInTab(targetTab, createInlineSnapshotFunc(), [
      maxNodes,
      params.interactive_only ?? false,
    ]);
    if (!result.ok) {
      throwToolError(result);
    }
    return result.value;
  },
});
