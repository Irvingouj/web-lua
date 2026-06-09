import { z } from "zod";
import { registerDoctest, registerTool } from "../../../../shared/tool-registry.js";
import {
  ChromeTabsCreateParamsSchema,
  ChromeTabsGetParamsSchema,
  ChromeTabsQueryParamsSchema,
  ChromeTabsReloadParamsSchema,
  ChromeTabsRemoveParamsSchema,
  ChromeTabsSendMessageParamsSchema,
  ChromeTabsUpdateParamsSchema,
} from "../../../../shared/schemas.js";
import {
  handleChromeTabsCreate,
  handleChromeTabsGet,
  handleChromeTabsQuery,
  handleChromeTabsReload,
  handleChromeTabsRemove,
  handleChromeTabsSendMessage,
  handleChromeTabsUpdate,
} from "./handlers.js";

registerDoctest("chrome_tabs_query", `
  const result = await callTool("chrome_tabs_query", { active: true });
  expect(Array.isArray(result)).toBe(true);
`);


registerTool({
  action: "chrome_tabs_query",
  namespace: "chrome",
  name: "tabs.query",
  publicName: "chrome.tabs.query",
  source: "main_thread",
  transport: "chrome_api",
  description: "Query Chrome tabs matching given criteria",
  params: ChromeTabsQueryParamsSchema,
  paramTypes: [
    {
      name: "query_info",
      type: "object",
      required: true,
      description: "Query filter: active, currentWindow, url, etc.",
    },
  ],
  returns: z.array(z.unknown()),
  returnDoc: "Tab[]",
  errorCode: "ECHROME",
  errorCategory: "extension",
  paramDocs: { query_info: "Query filter" },
  handler: handleChromeTabsQuery,
});

registerTool({
  action: "chrome_tabs_create",
  namespace: "chrome",
  name: "tabs.create",
  publicName: "chrome.tabs.create",
  source: "main_thread",
  transport: "chrome_api",
  description: "Create a new Chrome tab",
  params: ChromeTabsCreateParamsSchema,
  paramTypes: [
    {
      name: "create_properties",
      type: "object",
      required: false,
      description: "URL, windowId, active, etc.",
    },
  ],
  returns: z.unknown(),
  returnDoc: "Tab",
  errorCode: "ECHROME",
  errorCategory: "extension",
  paramDocs: { create_properties: "Create properties" },
  handler: handleChromeTabsCreate,
});

registerTool({
  action: "chrome_tabs_update",
  namespace: "chrome",
  name: "tabs.update",
  publicName: "chrome.tabs.update",
  source: "main_thread",
  transport: "chrome_api",
  description: "Update properties of a tab",
  params: ChromeTabsUpdateParamsSchema,
  paramTypes: [
    {
      name: "tabId",
      type: "number",
      required: false,
      description: "Tab ID (omit for active tab)",
    },
    {
      name: "update",
      type: "object",
      required: false,
      description: "Properties: url, active, muted, etc.",
    },
  ],
  returns: z.unknown(),
  returnDoc: "Tab",
  errorCode: "ECHROME",
  errorCategory: "extension",
  paramDocs: { tabId: "Tab ID", update: "Update properties" },
  handler: handleChromeTabsUpdate,
});

registerTool({
  action: "chrome_tabs_remove",
  namespace: "chrome",
  name: "tabs.remove",
  publicName: "chrome.tabs.remove",
  source: "main_thread",
  transport: "chrome_api",
  description: "Close one or more tabs",
  params: ChromeTabsRemoveParamsSchema,
  paramTypes: [
    {
      name: "tabId",
      type: "number",
      required: false,
      description: "Tab ID or array of tab IDs",
    },
  ],
  returns: z.null(),
  returnDoc: "null",
  errorCode: "ECHROME",
  errorCategory: "extension",
  paramDocs: { tabId: "Tab ID to close" },
  handler: handleChromeTabsRemove,
});

registerTool({
  action: "chrome_tabs_get",
  namespace: "chrome",
  name: "tabs.get",
  publicName: "chrome.tabs.get",
  source: "main_thread",
  transport: "chrome_api",
  description: "Get a tab by ID",
  params: ChromeTabsGetParamsSchema,
  paramTypes: [
    {
      name: "tabId",
      type: "number",
      required: false,
      description: "Tab ID",
    },
  ],
  returns: z.unknown(),
  returnDoc: "Tab",
  errorCode: "ECHROME",
  errorCategory: "extension",
  paramDocs: { tabId: "Tab ID" },
  handler: handleChromeTabsGet,
});

registerTool({
  action: "chrome_tabs_reload",
  namespace: "chrome",
  name: "tabs.reload",
  publicName: "chrome.tabs.reload",
  source: "main_thread",
  transport: "chrome_api",
  description: "Reload a tab",
  params: ChromeTabsReloadParamsSchema,
  paramTypes: [
    {
      name: "tabId",
      type: "number",
      required: false,
      description: "Tab ID (omit for active tab)",
    },
    {
      name: "reload",
      type: "object",
      required: false,
      description: "bypassCache",
    },
  ],
  returns: z.null(),
  returnDoc: "null",
  errorCode: "ECHROME",
  errorCategory: "extension",
  paramDocs: { tabId: "Tab ID", reload: "Reload properties" },
  handler: handleChromeTabsReload,
});

registerTool({
  action: "chrome_tabs_sendMessage",
  namespace: "chrome",
  name: "tabs.sendMessage",
  publicName: "chrome.tabs.sendMessage",
  source: "main_thread",
  transport: "chrome_api",
  description: "Send a message to a specific tab",
  params: ChromeTabsSendMessageParamsSchema,
  paramTypes: [
    {
      name: "tabId",
      type: "number",
      required: false,
      description: "Target tab ID",
    },
    {
      name: "message",
      type: "any",
      required: false,
      description: "Message payload",
    },
    {
      name: "options",
      type: "object",
      required: false,
      description: "Options: frameId",
    },
  ],
  returns: z.unknown(),
  returnDoc: "any",
  errorCode: "ECHROME",
  errorCategory: "extension",
  paramDocs: {
    tabId: "Target tab ID",
    message: "Message payload",
    options: "Options",
  },
  handler: handleChromeTabsSendMessage,
});