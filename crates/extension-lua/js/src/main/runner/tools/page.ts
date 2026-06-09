// Page tools — relay commands to the active tab content script

import { z } from "zod";
import { registerDoctest, registerTool } from "../../../shared/tool-registry.js";
import {
  PageAppendParamsSchema,
  PageCheckParamsSchema,
  PageClickParamsSchema,
  PageDblClickParamsSchema,
  PageFillParamsSchema,
  PageHoverParamsSchema,
  PagePressParamsSchema,
  PageScrollParamsSchema,
  PageScrollToParamsSchema,
  PageSelectParamsSchema,
  PageTypeParamsSchema,
  PageUnhoverParamsSchema,
} from "../../../shared/schemas.js";
import { getActiveTabId } from "../runtime.js";
import { bridgeToTab } from "../tab/messaging.js";

registerDoctest("page_click", `
  const result = await callTool("page_click", { refId: "1" });
  expect(result).toBeNull();
`);

registerTool({
  action: "page_click",
  namespace: "page",
  description: "Click an element in the active tab",
  params: PageClickParamsSchema,
  paramTypes: [
    {
      name: "refId",
      type: "string",
      required: true,
      description: "Element refId from snapshot",
    },
    {
      name: "label",
      type: "string",
      required: false,
      description: "Element label",
    },
  ],
  returns: z.null(),
  returnDoc: "null",
  errorCode: "EPAGE",
  errorCategory: "page",
  paramDocs: {
    refId: "Element refId from snapshot",
    label: "Element label",
  },
  handler: async (params) => {
    const tabId = getActiveTabId();
    if (tabId === null) throw new Error("No active tab");
    return bridgeToTab(tabId, "page_click", params as Record<string, unknown>);
  },
});

registerTool({
  action: "page_fill",
  namespace: "page",
  description: "Fill an input element in the active tab",
  params: PageFillParamsSchema,
  paramTypes: [
    {
      name: "refId",
      type: "string",
      required: true,
      description: "Element refId from snapshot",
    },
    {
      name: "label",
      type: "string",
      required: false,
      description: "Element label",
    },
    {
      name: "value",
      type: "string",
      required: true,
      description: "Text to fill",
    },
  ],
  returns: z.null(),
  returnDoc: "null",
  errorCode: "EPAGE",
  errorCategory: "page",
  paramDocs: {
    refId: "Element refId from snapshot",
    label: "Element label",
    value: "Text to fill",
  },
  handler: async (params) => {
    const tabId = getActiveTabId();
    if (tabId === null) throw new Error("No active tab");
    return bridgeToTab(tabId, "page_fill", params as Record<string, unknown>);
  },
});

registerTool({
  action: "page_type",
  namespace: "page",
  description: "Type text into an input in the active tab",
  params: PageTypeParamsSchema,
  paramTypes: [
    {
      name: "refId",
      type: "string",
      required: true,
      description: "Element refId from snapshot",
    },
    {
      name: "label",
      type: "string",
      required: false,
      description: "Element label",
    },
    {
      name: "text",
      type: "string",
      required: true,
      description: "Text to type",
    },
  ],
  returns: z.null(),
  returnDoc: "null",
  errorCode: "EPAGE",
  errorCategory: "page",
  paramDocs: {
    refId: "Element refId from snapshot",
    label: "Element label",
    text: "Text to type",
  },
  handler: async (params) => {
    const tabId = getActiveTabId();
    if (tabId === null) throw new Error("No active tab");
    return bridgeToTab(tabId, "page_type", params as Record<string, unknown>);
  },
});

registerTool({
  action: "page_append",
  namespace: "page",
  description: "Append text to an input in the active tab",
  params: PageAppendParamsSchema,
  paramTypes: [
    {
      name: "refId",
      type: "string",
      required: true,
      description: "Element refId from snapshot",
    },
    {
      name: "label",
      type: "string",
      required: false,
      description: "Element label",
    },
    {
      name: "text",
      type: "string",
      required: true,
      description: "Text to append",
    },
  ],
  returns: z.null(),
  returnDoc: "null",
  errorCode: "EPAGE",
  errorCategory: "page",
  paramDocs: {
    refId: "Element refId from snapshot",
    label: "Element label",
    text: "Text to append",
  },
  handler: async (params) => {
    const tabId = getActiveTabId();
    if (tabId === null) throw new Error("No active tab");
    return bridgeToTab(tabId, "page_append", params as Record<string, unknown>);
  },
});

registerTool({
  action: "page_press",
  namespace: "page",
  description: "Press a key in the active tab",
  params: PagePressParamsSchema,
  paramTypes: [
    {
      name: "key",
      type: "string",
      required: true,
      description: "Key to press (e.g. 'Enter', 'Escape')",
    },
  ],
  returns: z.null(),
  returnDoc: "null",
  errorCode: "EPAGE",
  errorCategory: "page",
  paramDocs: { key: "Key to press" },
  handler: async (params) => {
    const tabId = getActiveTabId();
    if (tabId === null) throw new Error("No active tab");
    return bridgeToTab(tabId, "page_press", params as Record<string, unknown>);
  },
});

registerTool({
  action: "page_select",
  namespace: "page",
  description: "Select an option in a dropdown in the active tab",
  params: PageSelectParamsSchema,
  paramTypes: [
    {
      name: "refId",
      type: "string",
      required: true,
      description: "Element refId from snapshot",
    },
    {
      name: "value",
      type: "string",
      required: true,
      description: "Option value to select",
    },
  ],
  returns: z.null(),
  returnDoc: "null",
  errorCode: "EPAGE",
  errorCategory: "page",
  paramDocs: {
    refId: "Element refId from snapshot",
    value: "Option value to select",
  },
  handler: async (params) => {
    const tabId = getActiveTabId();
    if (tabId === null) throw new Error("No active tab");
    return bridgeToTab(tabId, "page_select", params as Record<string, unknown>);
  },
});

registerTool({
  action: "page_check",
  namespace: "page",
  description: "Toggle a checkbox in the active tab",
  params: PageCheckParamsSchema,
  paramTypes: [
    {
      name: "refId",
      type: "string",
      required: true,
      description: "Element refId from snapshot",
    },
    {
      name: "checked",
      type: "boolean",
      required: false,
      description: "Desired checked state (default true)",
    },
  ],
  returns: z.null(),
  returnDoc: "null",
  errorCode: "EPAGE",
  errorCategory: "page",
  paramDocs: {
    refId: "Element refId from snapshot",
    checked: "Desired checked state",
  },
  handler: async (params) => {
    const tabId = getActiveTabId();
    if (tabId === null) throw new Error("No active tab");
    return bridgeToTab(tabId, "page_check", params as Record<string, unknown>);
  },
});

registerTool({
  action: "page_hover",
  namespace: "page",
  description: "Hover over an element in the active tab",
  params: PageHoverParamsSchema,
  paramTypes: [
    {
      name: "refId",
      type: "string",
      required: true,
      description: "Element refId from snapshot",
    },
  ],
  returns: z.null(),
  returnDoc: "null",
  errorCode: "EPAGE",
  errorCategory: "page",
  paramDocs: { refId: "Element refId from snapshot" },
  handler: async (params) => {
    const tabId = getActiveTabId();
    if (tabId === null) throw new Error("No active tab");
    return bridgeToTab(tabId, "page_hover", params as Record<string, unknown>);
  },
});

registerTool({
  action: "page_unhover",
  namespace: "page",
  description: "Unhover in the active tab",
  params: PageUnhoverParamsSchema,
  paramTypes: [],
  returns: z.null(),
  returnDoc: "null",
  errorCode: "EPAGE",
  errorCategory: "page",
  paramDocs: {},
  handler: async () => {
    const tabId = getActiveTabId();
    if (tabId === null) throw new Error("No active tab");
    return bridgeToTab(tabId, "page_unhover", {});
  },
});

registerTool({
  action: "page_scroll",
  namespace: "page",
  description: "Scroll the active tab",
  params: PageScrollParamsSchema,
  paramTypes: [
    {
      name: "direction",
      type: "string",
      required: false,
      description: "Scroll direction: up or down (default down)",
    },
    {
      name: "amount",
      type: "number",
      required: false,
      description: "Scroll amount in pixels (default 300)",
    },
    {
      name: "refId",
      type: "string | null",
      required: false,
      description: "Element refId to scroll to",
    },
  ],
  returns: z.boolean(),
  returnDoc: "boolean",
  errorCode: "EPAGE",
  errorCategory: "page",
  paramDocs: {
    direction: "Scroll direction",
    amount: "Scroll amount in pixels",
    refId: "Element refId to scroll to",
  },
  handler: async (params) => {
    const tabId = getActiveTabId();
    if (tabId === null) throw new Error("No active tab");
    return bridgeToTab(tabId, "page_scroll", params as Record<string, unknown>);
  },
});

registerTool({
  action: "page_scroll_to",
  namespace: "page",
  name: "scrollTo",
  localName: "scrollTo",
  description: "Scroll to an element in the active tab",
  params: PageScrollToParamsSchema,
  paramTypes: [
    {
      name: "refId",
      type: "string",
      required: true,
      description: "Element refId from snapshot",
    },
  ],
  returns: z.boolean(),
  returnDoc: "boolean",
  errorCode: "EPAGE",
  errorCategory: "page",
  paramDocs: { refId: "Element refId from snapshot" },
  handler: async (params) => {
    const tabId = getActiveTabId();
    if (tabId === null) throw new Error("No active tab");
    return bridgeToTab(tabId, "page_scroll_to", {
      x: 0,
      y: 0,
      refId: params.refId,
    });
  },
});

registerTool({
  action: "page_dblclick",
  namespace: "page",
  description: "Double-click an element in the active tab",
  params: PageDblClickParamsSchema,
  paramTypes: [
    {
      name: "refId",
      type: "string",
      required: true,
      description: "Element refId from snapshot",
    },
    {
      name: "label",
      type: "string",
      required: false,
      description: "Element label",
    },
  ],
  returns: z.null(),
  returnDoc: "null",
  errorCode: "EPAGE",
  errorCategory: "page",
  paramDocs: {
    refId: "Element refId from snapshot",
    label: "Element label",
  },
  handler: async (params) => {
    const tabId = getActiveTabId();
    if (tabId === null) throw new Error("No active tab");
    return bridgeToTab(
      tabId,
      "page_dblclick",
      params as Record<string, unknown>,
    );
  },
});

