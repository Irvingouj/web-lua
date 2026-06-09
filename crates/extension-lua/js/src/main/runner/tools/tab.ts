// Tab tools — operate on a specific target tab

import { z } from "zod";
import { registerTool } from "../../../shared/tool-registry.js";
import {
  TabBackParamsSchema,
  TabCheckParamsSchema,
  TabClickParamsSchema,
  TabDblClickParamsSchema,
  TabFillParamsSchema,
  TabForwardParamsSchema,
  TabHoverParamsSchema,
  TabPressParamsSchema,
  TabScrollParamsSchema,
  TabSelectParamsSchema,
  TabTypeParamsSchema,
  TabUnhoverParamsSchema,
  TabWaitForLoadParamsSchema,
} from "../../../shared/schemas.js";
import { bridgeToTab } from "../tab/messaging.js";
import { waitForTabLoad } from "../tab/execute.js";
import { throwToolError } from "../../../shared/errors.js";

registerTool({
  action: "tab_click",
  namespace: "tab",
  description: "Click an element in a target tab",
  params: TabClickParamsSchema,
  paramTypes: [
    {
      name: "tabId",
      type: "number",
      required: true,
      description: "Target tab ID",
    },
    {
      name: "refId",
      type: "string",
      required: true,
      description: "Element refId from snapshot",
    },
  ],
  returns: z.null(),
  returnDoc: "null",
  errorCode: "ETAB",
  errorCategory: "tab",
  paramDocs: {
    tabId: "Target tab ID",
    refId: "Element refId from snapshot",
  },
  handler: async (params) => {
    return bridgeToTab(Number(params.tabId), "tab_click", {
      refId: params.refId,
    });
  },
});

registerTool({
  action: "tab_fill",
  namespace: "tab",
  description: "Fill an input element in a target tab",
  params: TabFillParamsSchema,
  paramTypes: [
    {
      name: "tabId",
      type: "number",
      required: true,
      description: "Target tab ID",
    },
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
      description: "Text to fill",
    },
  ],
  returns: z.null(),
  returnDoc: "null",
  errorCode: "ETAB",
  errorCategory: "tab",
  paramDocs: {
    tabId: "Target tab ID",
    refId: "Element refId from snapshot",
    value: "Text to fill",
  },
  handler: async (params) => {
    return bridgeToTab(Number(params.tabId), "tab_fill", {
      refId: params.refId,
      value: params.value,
    });
  },
});

registerTool({
  action: "tab_type",
  namespace: "tab",
  description: "Type text into an input in a target tab",
  params: TabTypeParamsSchema,
  paramTypes: [
    {
      name: "tabId",
      type: "number",
      required: true,
      description: "Target tab ID",
    },
    {
      name: "refId",
      type: "string",
      required: true,
      description: "Element refId from snapshot",
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
  errorCode: "ETAB",
  errorCategory: "tab",
  paramDocs: {
    tabId: "Target tab ID",
    refId: "Element refId from snapshot",
    text: "Text to type",
  },
  handler: async (params) => {
    return bridgeToTab(Number(params.tabId), "tab_type", {
      refId: params.refId,
      text: params.text,
    });
  },
});

registerTool({
  action: "tab_press",
  namespace: "tab",
  description: "Press a key in a target tab",
  params: TabPressParamsSchema,
  paramTypes: [
    {
      name: "tabId",
      type: "number",
      required: true,
      description: "Target tab ID",
    },
    {
      name: "key",
      type: "string",
      required: true,
      description: "Key to press",
    },
  ],
  returns: z.null(),
  returnDoc: "null",
  errorCode: "ETAB",
  errorCategory: "tab",
  paramDocs: { tabId: "Target tab ID", key: "Key to press" },
  handler: async (params) => {
    return bridgeToTab(Number(params.tabId), "tab_press", {
      key: params.key,
    });
  },
});
registerTool({
  action: "tab_select",
  namespace: "tab",
  description: "Select an option in a dropdown in a target tab",
  params: TabSelectParamsSchema,
  paramTypes: [
    {
      name: "tabId",
      type: "number",
      required: true,
      description: "Target tab ID",
    },
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
  errorCode: "ETAB",
  errorCategory: "tab",
  paramDocs: {
    tabId: "Target tab ID",
    refId: "Element refId from snapshot",
    value: "Option value to select",
  },
  handler: async (params) => {
    return bridgeToTab(Number(params.tabId), "tab_select", {
      refId: params.refId,
      value: params.value,
    });
  },
});
registerTool({
  action: "tab_check",
  namespace: "tab",
  description: "Toggle a checkbox in a target tab",
  params: TabCheckParamsSchema,
  paramTypes: [
    {
      name: "tabId",
      type: "number",
      required: true,
      description: "Target tab ID",
    },
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
  errorCode: "ETAB",
  errorCategory: "tab",
  paramDocs: {
    tabId: "Target tab ID",
    refId: "Element refId from snapshot",
    checked: "Desired checked state",
  },
  handler: async (params) => {
    return bridgeToTab(Number(params.tabId), "tab_check", {
      refId: params.refId,
      checked: params.checked,
    });
  },
});
registerTool({
  action: "tab_hover",
  namespace: "tab",
  description: "Hover over an element in a target tab",
  params: TabHoverParamsSchema,
  paramTypes: [
    {
      name: "tabId",
      type: "number",
      required: true,
      description: "Target tab ID",
    },
    {
      name: "refId",
      type: "string",
      required: true,
      description: "Element refId from snapshot",
    },
  ],
  returns: z.null(),
  returnDoc: "null",
  errorCode: "ETAB",
  errorCategory: "tab",
  paramDocs: {
    tabId: "Target tab ID",
    refId: "Element refId from snapshot",
  },
  handler: async (params) => {
    return bridgeToTab(Number(params.tabId), "tab_hover", {
      refId: params.refId,
    });
  },
});
registerTool({
  action: "tab_unhover",
  namespace: "tab",
  description: "Unhover in a target tab",
  params: TabUnhoverParamsSchema,
  paramTypes: [
    {
      name: "tabId",
      type: "number",
      required: true,
      description: "Target tab ID",
    },
  ],
  returns: z.null(),
  returnDoc: "null",
  errorCode: "ETAB",
  errorCategory: "tab",
  paramDocs: { tabId: "Target tab ID" },
  handler: async (params) => {
    return bridgeToTab(Number(params.tabId), "tab_unhover", {});
  },
});
registerTool({
  action: "tab_scroll",
  namespace: "tab",
  description: "Scroll a target tab",
  params: TabScrollParamsSchema,
  paramTypes: [
    {
      name: "tabId",
      type: "number",
      required: true,
      description: "Target tab ID",
    },
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
  ],
  returns: z.boolean(),
  returnDoc: "boolean",
  errorCode: "ETAB",
  errorCategory: "tab",
  paramDocs: {
    tabId: "Target tab ID",
    direction: "Scroll direction",
    amount: "Scroll amount in pixels",
  },
  handler: async (params) => {
    return bridgeToTab(Number(params.tabId), "tab_scroll", {
      direction: params.direction,
      amount: params.amount,
    });
  },
});
registerTool({
  action: "tab_dblclick",
  namespace: "tab",
  description: "Double-click an element in a target tab",
  params: TabDblClickParamsSchema,
  paramTypes: [
    {
      name: "tabId",
      type: "number",
      required: true,
      description: "Target tab ID",
    },
    {
      name: "refId",
      type: "string",
      required: true,
      description: "Element refId from snapshot",
    },
  ],
  returns: z.null(),
  returnDoc: "null",
  errorCode: "ETAB",
  errorCategory: "tab",
  paramDocs: {
    tabId: "Target tab ID",
    refId: "Element refId from snapshot",
  },
  handler: async (params) => {
    return bridgeToTab(Number(params.tabId), "tab_dblclick", {
      refId: params.refId,
    });
  },
});
registerTool({
  action: "tab_back",
  namespace: "tab",
  description: "Navigate back in a target tab",
  params: TabBackParamsSchema,
  paramTypes: [
    {
      name: "tabId",
      type: "number",
      required: true,
      description: "Target tab ID",
    },
  ],
  returns: z.boolean(),
  returnDoc: "boolean",
  errorCode: "ETAB",
  errorCategory: "tab",
  paramDocs: { tabId: "Target tab ID" },
  handler: async (params) => {
    return bridgeToTab(Number(params.tabId), "tab_back", {});
  },
});
registerTool({
  action: "tab_forward",
  namespace: "tab",
  description: "Navigate forward in a target tab",
  params: TabForwardParamsSchema,
  paramTypes: [
    {
      name: "tabId",
      type: "number",
      required: true,
      description: "Target tab ID",
    },
  ],
  returns: z.boolean(),
  returnDoc: "boolean",
  errorCode: "ETAB",
  errorCategory: "tab",
  paramDocs: { tabId: "Target tab ID" },
  handler: async (params) => {
    return bridgeToTab(Number(params.tabId), "tab_forward", {});
  },
});
registerTool({
  action: "tab_wait_for_load",
  namespace: "tab",
  description: "Wait for a target tab to finish loading",
  params: TabWaitForLoadParamsSchema,
  paramTypes: [
    {
      name: "tabId",
      type: "number",
      required: true,
      description: "Target tab ID",
    },
    {
      name: "timeout",
      type: "number",
      required: false,
      description: "Timeout in milliseconds (default 30000)",
    },
  ],
  returns: z.boolean(),
  returnDoc: "true",
  errorCode: "ETAB",
  errorCategory: "tab",
  paramDocs: {
    tabId: "Target tab ID",
    timeout: "Timeout in milliseconds (default 30000)",
  },
  transport: "host_async",
  handler: async (params) => {
    const timeoutMs = Number.isFinite(Number(params.timeout)) && Number(params.timeout) > 0
      ? Number(params.timeout)
      : 30_000;
    const result = await waitForTabLoad(
      Number(params.tabId),
      timeoutMs,
    );
    if (!result.ok) {
      throwToolError(result);
    }
    return result.value;
  },
});

