import { z } from "zod";
import { registerTool } from "../../../shared/tool-registry.js";
import { registerChromePassthrough } from "./aliases.js";
import {
  TabActivateParamsSchema,
  TabCloseParamsSchema,
  TabCreateParamsSchema,
  TabExecuteScriptParamsSchema,
  TabFetchParamsSchema,
  TabQueryParamsSchema,
  TabScrollToParamsSchema,
} from "../../../shared/schemas.js";
import { extractTabId } from "../runtime.js";
import { bridgeToTab } from "../tab/messaging.js";
import { executeInTab } from "../tab/execute.js";
import { throwToolError } from "../../../shared/errors.js";

function runTabFetch(
  urlArg: unknown,
  methodArg: unknown,
  headersArg: unknown,
  bodyArg: unknown,
  timeoutArg: unknown,
): Promise<{ status: number; ok: boolean; headers: Record<string, string>; body: string }> {
  const urlStr = typeof urlArg === "string" ? urlArg : "";
  const methodStr = typeof methodArg === "string" ? methodArg : "GET";
  const headersRec =
    typeof headersArg === "object" && headersArg !== null
      ? (headersArg as Record<string, string>)
      : {};
  const bodyStr =
    bodyArg !== null && bodyArg !== undefined ? String(bodyArg) : null;
  const timeoutNum = typeof timeoutArg === "number" && Number.isFinite(timeoutArg) && timeoutArg > 0 ? timeoutArg : 30_000;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutNum);
  const fetchOpts: RequestInit = {
    method: methodStr || "GET",
    headers: headersRec,
    signal: controller.signal,
  };
  if (bodyStr !== null) {
    fetchOpts.body = bodyStr;
  }
  return fetch(urlStr, fetchOpts)
    .then(async (resp) => {
      const text = await resp.text();
      clearTimeout(timeoutId);
      return {
        status: resp.status,
        ok: resp.ok,
        headers: Object.fromEntries(resp.headers.entries()),
        body: text,
      };
    })
    .catch((e) => {
      clearTimeout(timeoutId);
      if (e instanceof Error && e.name === "AbortError") {
        throw new Error(`Request timed out after ${timeoutNum}ms`);
      }
      throw e;
    });
}

registerChromePassthrough({
  action: "tab_query",
  namespace: "tab",
  description: "Query Chrome tabs matching given criteria",
  chromeAction: "chrome_tabs_query",
  paramsSchema: TabQueryParamsSchema,
  paramTypes: [
    {
      name: "query_info",
      type: "object",
      required: true,
      description: "Query filter: active, currentWindow, url, etc.",
    },
  ],
  paramDocs: { query_info: "Query filter" },
  transport: "chrome_api",
});

registerChromePassthrough({
  action: "tab_create",
  namespace: "tab",
  description: "Create a new Chrome tab",
  chromeAction: "chrome_tabs_create",
  paramsSchema: TabCreateParamsSchema,
  paramTypes: [
    {
      name: "create_properties",
      type: "object",
      required: false,
      description: "URL, windowId, active, etc.",
    },
  ],
  paramDocs: { create_properties: "Create properties" },
  transport: "chrome_api",
});

registerChromePassthrough({
  action: "tab_activate",
  namespace: "tab",
  description: "Activate a tab",
  chromeAction: "chrome_tabs_update",
  paramsSchema: TabActivateParamsSchema,
  paramTypes: [
    {
      name: "tabId",
      type: "number",
      required: false,
      description: "Tab ID to activate",
    },
  ],
  paramDocs: { tabId: "Tab ID to activate" },
  paramTransform: (params) => {
    const tabId = extractTabId(params);
    if (tabId == null) {
      throw new Error("tabId is required");
    }
    return { tabId, update: { active: true } };
  },
  transport: "chrome_api",
});

registerChromePassthrough({
  action: "tab_close",
  namespace: "tab",
  description: "Close one or more tabs",
  chromeAction: "chrome_tabs_remove",
  paramsSchema: TabCloseParamsSchema,
  paramTypes: [
    {
      name: "tabId",
      type: "number",
      required: false,
      description: "Tab ID or array of tab IDs",
    },
  ],
  paramDocs: { tabId: "Tab ID to close" },
  paramTransform: (params) => {
    const tabId = extractTabId(params);
    if (tabId == null) {
      throw new Error("tabId is required");
    }
    return tabId;
  },
  transport: "chrome_api",
});

registerChromePassthrough({
  action: "tab_execute_script",
  namespace: "tab",
  description: "Execute JavaScript in a target tab",
  chromeAction: "chrome_scripting_executeScript",
  paramsSchema: TabExecuteScriptParamsSchema,
  paramTypes: [
    {
      name: "target",
      type: "object",
      required: false,
      description: "Target: tabId",
    },
    {
      name: "func",
      type: "function",
      required: false,
      description: "Function to execute",
    },
    {
      name: "args",
      type: "array",
      required: false,
      description: "Function arguments",
    },
    {
      name: "world",
      type: "string",
      required: false,
      description: "Execution world: MAIN or ISOLATED",
    },
    {
      name: "files",
      type: "string[]",
      required: false,
      description: "Script files to inject",
    },
  ],
  paramDocs: {
    target: "Target",
    func: "Function",
    args: "Arguments",
    world: "Execution world",
    files: "Script files",
  },
  transport: "chrome_api",
});

registerTool({
  action: "tab_scroll_to",
  namespace: "tab",
  name: "scrollTo",
  localName: "scrollTo",
  description: "Scroll to coordinates or an element in a target tab",
  params: TabScrollToParamsSchema,
  paramTypes: [
    {
      name: "tabId",
      type: "number",
      required: true,
      description: "Target tab ID",
    },
    {
      name: "x",
      type: "number",
      required: false,
      description: "X coordinate",
    },
    {
      name: "y",
      type: "number",
      required: false,
      description: "Y coordinate",
    },
    {
      name: "refId",
      type: "string",
      required: false,
      description: "Element refId to scroll to",
    },
  ],
  returns: z.boolean(),
  returnDoc: "boolean",
  errorCode: "ETAB",
  errorCategory: "tab",
  paramDocs: {
    tabId: "Target tab ID",
    x: "X coordinate",
    y: "Y coordinate",
    refId: "Element refId to scroll to",
  },
  handler: async (params) => {
    return bridgeToTab(Number(params.tabId), "page_scroll_to", {
      x: params.x,
      y: params.y,
      refId: params.refId,
    });
  },
});

registerTool({
  action: "tab_fetch",
  namespace: "tab",
  description: "Perform an HTTP fetch inside a target tab origin",
  params: TabFetchParamsSchema,
  paramTypes: [
    {
      name: "tabId",
      type: "number",
      required: true,
      description: "Target tab ID",
    },
    {
      name: "url",
      type: "string",
      required: true,
      description: "URL to fetch",
    },
    {
      name: "method",
      type: "string",
      required: false,
      description: "HTTP method",
    },
    {
      name: "headers",
      type: "object",
      required: false,
      description: "Request headers",
    },
    {
      name: "body",
      type: "string | null",
      required: false,
      description: "Request body",
    },
    {
      name: "timeout",
      type: "number",
      required: false,
      description: "Timeout in milliseconds",
    },
  ],
  returns: z.object({
    status: z.number(),
    ok: z.boolean(),
    headers: z.record(z.string()),
    body: z.string(),
  }),
  returnDoc: "FetchValue",
  errorCode: "ETAB",
  errorCategory: "tab",
  paramDocs: {
    tabId: "Target tab ID",
    url: "URL to fetch",
    method: "HTTP method",
    headers: "Request headers",
    body: "Request body",
    timeout: "Timeout in milliseconds",
  },
  handler: async (params) => {
    const targetTab = Number(params.tabId);
    if (!Number.isFinite(targetTab) || targetTab <= 0 || !Number.isInteger(targetTab)) {
      throw new Error("tabId is required and must be a positive integer tab ID");
    }
    const url = params.url;
    const method = params.method ?? "GET";
    const headers = params.headers ?? {};
    const body = params.body ?? null;
    const timeout = params.timeout ?? 30_000;
    const result = await executeInTab(
      targetTab,
      runTabFetch,
      [url, method, headers, body, timeout],
    );
    if (!result.ok) {
      throwToolError(result);
    }
    return result.value;
  },
});


