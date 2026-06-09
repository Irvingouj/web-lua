// Chrome passthrough alias registrations

import { z } from "zod";
import { registerTool } from "../../../shared/tool-registry.js";
import { dispatchTool } from "../../../shared/tool-registry.js";
import { createError, throwToolError } from "../../../shared/errors.js";
import { chromeApiCall, extractTabId, getActiveTabId } from "../runtime.js";
import {
  BookmarksCreateParamsSchema,
  BookmarksDeleteParamsSchema,
  BookmarksSearchParamsSchema,
  CookiesDeleteParamsSchema,
  CookiesGetParamsSchema,
  CookiesListParamsSchema,
  CookiesSetParamsSchema,
  HistoryDeleteParamsSchema,
  HistorySearchParamsSchema,
  NotificationsClearParamsSchema,
  NotificationsCreateParamsSchema,
  PageActiveTabParamsSchema,
  PageCloseParamsSchema,
  TabSnapshotDataParamsSchema,
  TabSnapshotTextParamsSchema,
} from "../../../shared/schemas.js";

const PageSnapshotTextParamsSchema = TabSnapshotTextParamsSchema.extend({
  tabId: z.number().optional(),
});
const PageSnapshotDataParamsSchema = TabSnapshotDataParamsSchema.extend({
  tabId: z.number().optional(),
});

const PageSnapshotParamTypes = [
  {
    name: "tabId",
    type: "number",
    required: false,
    description: "Target tab ID (defaults to active tab)",
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
];

function extractStringOrField(params: unknown, field: string): string {
  if (typeof params === "string") return params;
  const obj = params as Record<string, unknown>;
  return String(obj[field] ?? "");
}

interface RegisterChromePassthroughOptions<P, R> {
  action: string;
  namespace: string;
  description: string;
  chromeAction: string;
  paramsSchema: z.ZodSchema<P>;
  paramTypes: { name: string; type: string; required: boolean; description: string }[];
  paramDocs: Record<string, string>;
  paramTransform?: (params: P) => unknown;
  transport?: "chrome_api" | "host_async";
}

export function registerChromePassthrough<P, R>(
  options: RegisterChromePassthroughOptions<P, R>,
) {
  registerTool({
    action: options.action,
    namespace: options.namespace,
    description: options.description,
    params: options.paramsSchema,
    paramTypes: options.paramTypes,
    returns: z.unknown(),
    returnDoc: "any",
    errorCode: "ECHROME",
    errorCategory: "extension",
    paramDocs: options.paramDocs,
    transport: options.transport,
    handler: async (params) => {
      const transformedParams = options.paramTransform
        ? options.paramTransform(params)
        : params;
      const result = await dispatchTool(options.chromeAction, transformedParams);
      if (!result.ok) {
        throwToolError(result);
      }
      return result.value as R;
    },
  });
}

// ─── Chrome passthrough registrations ────────────────────────────

registerChromePassthrough({
  action: "cookies_get",
  namespace: "cookies",
  description: "Get a cookie by details",
  chromeAction: "chrome_cookies_get",
  paramsSchema: CookiesGetParamsSchema,
  paramTypes: [
    {
      name: "details",
      type: "object",
      required: true,
      description: "Cookie details: name, url, storeId",
    },
  ],
  paramDocs: { details: "Cookie details" },
});

registerChromePassthrough({
  action: "cookies_set",
  namespace: "cookies",
  description: "Set a cookie",
  chromeAction: "chrome_cookies_set",
  paramsSchema: CookiesSetParamsSchema,
  paramTypes: [
    {
      name: "details",
      type: "object",
      required: true,
      description: "Cookie details: name, value, url, etc.",
    },
  ],
  paramDocs: { details: "Cookie details" },
});

registerChromePassthrough({
  action: "cookies_delete",
  namespace: "cookies",
  description: "Remove a cookie",
  chromeAction: "chrome_cookies_remove",
  paramsSchema: CookiesDeleteParamsSchema,
  paramTypes: [
    {
      name: "details",
      type: "object",
      required: true,
      description: "Cookie details: name, url",
    },
  ],
  paramDocs: { details: "Cookie details" },
});

registerChromePassthrough({
  action: "cookies_list",
  namespace: "cookies",
  description: "Get all cookies matching a filter",
  chromeAction: "chrome_cookies_getAll",
  paramsSchema: CookiesListParamsSchema,
  paramTypes: [
    {
      name: "details",
      type: "object",
      required: false,
      description: "Filter: url, name, domain, etc.",
    },
  ],
  paramDocs: { details: "Filter details" },
});

registerChromePassthrough({
  action: "history_search",
  namespace: "history",
  description: "Search browser history",
  chromeAction: "chrome_history_search",
  paramsSchema: HistorySearchParamsSchema,
  paramTypes: [
    {
      name: "query",
      type: "object",
      required: true,
      description: "Query: text, startTime, endTime, maxResults",
    },
  ],
  paramDocs: { query: "Query object" },
});

registerChromePassthrough({
  action: "history_delete",
  namespace: "history",
  description: "Delete a URL from history",
  chromeAction: "chrome_history_deleteUrl",
  paramsSchema: HistoryDeleteParamsSchema,
  paramTypes: [
    {
      name: "url",
      type: "string",
      required: false,
      description: "URL to remove",
    },
  ],
  paramDocs: { url: "URL to remove" },
  paramTransform: (params) => {
    return { url: extractStringOrField(params, "url") };
  },
});

registerChromePassthrough({
  action: "bookmarks_search",
  namespace: "bookmarks",
  description: "Search bookmarks",
  chromeAction: "chrome_bookmarks_search",
  paramsSchema: BookmarksSearchParamsSchema,
  paramTypes: [
    {
      name: "query",
      type: "string | object",
      required: false,
      description: "Search string or query object",
    },
  ],
  paramDocs: { query: "Search query" },
  paramTransform: (params) => extractStringOrField(params, "query"),
});

registerChromePassthrough({
  action: "bookmarks_create",
  namespace: "bookmarks",
  description: "Create a bookmark",
  chromeAction: "chrome_bookmarks_create",
  paramsSchema: BookmarksCreateParamsSchema,
  paramTypes: [
    {
      name: "bookmark",
      type: "object",
      required: true,
      description: "Bookmark details: parentId, title, url, index",
    },
  ],
  paramDocs: { bookmark: "Bookmark details" },
});

registerChromePassthrough({
  action: "bookmarks_delete",
  namespace: "bookmarks",
  description: "Remove a bookmark",
  chromeAction: "chrome_bookmarks_remove",
  paramsSchema: BookmarksDeleteParamsSchema,
  paramTypes: [
    {
      name: "id",
      type: "string",
      required: false,
      description: "Bookmark node ID",
    },
  ],
  paramDocs: { id: "Bookmark node ID" },
  paramTransform: (params) => extractStringOrField(params, "id"),
});

registerChromePassthrough({
  action: "page_close",
  namespace: "page",
  description: "Close the active tab",
  chromeAction: "chrome_tabs_remove",
  paramsSchema: PageCloseParamsSchema,
  paramTypes: [
    {
      name: "tabId",
      type: "number",
      required: false,
      description: "Tab ID to close (defaults to active tab)",
    },
  ],
  paramDocs: { tabId: "Tab ID to close" },
  paramTransform: (params) => {
    const tabId = extractTabId(params) ?? getActiveTabId();
    if (tabId == null) {
      throw new Error("No active tab available and no tabId provided");
    }
    return tabId;
  },
  transport: "chrome_api",
});

registerChromePassthrough({
  action: "page_active_tab",
  namespace: "page",
  description: "Get the active tab",
  chromeAction: "chrome_tabs_query",
  paramsSchema: PageActiveTabParamsSchema,
  paramTypes: [],
  paramDocs: {},
  paramTransform: () => ({ active: true, currentWindow: true }),
  transport: "chrome_api",
});

registerChromePassthrough({
  action: "notifications_create",
  namespace: "notifications",
  description: "Create a notification",
  chromeAction: "chrome_notifications_create",
  paramsSchema: NotificationsCreateParamsSchema,
  paramTypes: [
    {
      name: "id",
      type: "string",
      required: false,
      description: "Notification ID",
    },
    {
      name: "options",
      type: "object",
      required: false,
      description: "Notification options: type, title, message, iconUrl",
    },
  ],
  paramDocs: { id: "Notification ID", options: "Notification options" },
  paramTransform: (params) => {
    const obj = params as Record<string, unknown>;
    const id = obj.id ?? "";
    const options = obj.options ?? {};
    return { id, options };
  },
});

registerChromePassthrough({
  action: "notifications_clear",
  namespace: "notifications",
  description: "Clear a notification",
  chromeAction: "chrome_notifications_clear",
  paramsSchema: NotificationsClearParamsSchema,
  paramTypes: [
    {
      name: "id",
      type: "string",
      required: false,
      description: "Notification ID to clear",
    },
  ],
  paramDocs: { id: "Notification ID" },
  paramTransform: (params) => extractStringOrField(params, "id"),
});

// Register page_snapshot_text alias (Rust page.snapshot() yields this action)
registerTool({
  action: "page_snapshot_text",
  namespace: "page",
  description: "Take a DOM snapshot of the active page and return readable text",
  params: PageSnapshotTextParamsSchema,
  paramTypes: PageSnapshotParamTypes,
  returns: z.string(),
  returnDoc: "string",
  errorCode: "EPAGE",
  errorCategory: "page",
  paramDocs: {
    tabId: "Target tab ID (defaults to active tab)",
    max_nodes: "Maximum nodes to include",
    interactive_only: "Only interactive elements",
  },
  transport: "chrome_api",
  handler: async (params) => {
    const targetTab = params.tabId != null ? Number(params.tabId) : getActiveTabId();
    if (targetTab == null || Number.isNaN(targetTab)) {
      throw createError("No active tab available and no tabId provided");
    }
    const result = await dispatchTool("tab_snapshot", {
      ...params,
      tabId: targetTab,
    });
    if (!result.ok) {
      throwToolError(result);
    }
    return result.value as string;
  },
});

// Register page_snapshot_data alias (Rust page.snapshot_data() yields this action)
registerTool({
  action: "page_snapshot_data",
  namespace: "page",
  description: "Take a DOM snapshot of the active page and return structured data",
  params: PageSnapshotDataParamsSchema,
  paramTypes: PageSnapshotParamTypes,
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
  errorCode: "EPAGE",
  errorCategory: "page",
  paramDocs: {
    tabId: "Target tab ID (defaults to active tab)",
    max_nodes: "Maximum nodes to include",
    interactive_only: "Only interactive elements",
  },
  transport: "chrome_api",
  handler: async (params) => {
    const targetTab = params.tabId != null ? Number(params.tabId) : getActiveTabId();
    if (targetTab == null || Number.isNaN(targetTab)) {
      throw createError("No active tab available and no tabId provided");
    }
    const result = await dispatchTool("tab_snapshot_data", {
      ...params,
      tabId: targetTab,
    });
    if (!result.ok) {
      throwToolError(result);
    }
    return result.value;
  },
});

