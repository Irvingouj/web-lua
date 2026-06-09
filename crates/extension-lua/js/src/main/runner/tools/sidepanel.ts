// Sidepanel tools — main registry entries that delegate to local handlers

import { z } from "zod";
import { registerDoctest, registerTool } from "../../../shared/tool-registry.js";
import {
  SidepanelAppendParamsSchema,
  SidepanelCheckParamsSchema,
  SidepanelClickParamsSchema,
  SidepanelDblClickParamsSchema,
  SidepanelFillParamsSchema,
  SidepanelHoverParamsSchema,
  SidepanelPressParamsSchema,
  SidepanelScrollParamsSchema,
  SidepanelScrollToParamsSchema,
  SidepanelSelectParamsSchema,
  SidepanelSnapshotDataParamsSchema,
  SidepanelSnapshotParamsSchema,
  SidepanelSnapshotTextParamsSchema,
  SidepanelTitleParamsSchema,
  SidepanelTypeParamsSchema,
  SidepanelUnhoverParamsSchema,
  SidepanelUrlParamsSchema,
  SidepanelWaitParamsSchema,
} from "../../../shared/schemas.js";
import {
  handleSidepanelClick,
  handleSidepanelDblClick,
  handleSidepanelFill,
  handleSidepanelType,
  handleSidepanelPress,
  handleSidepanelSelect,
  handleSidepanelCheck,
  handleSidepanelHover,
  handleSidepanelUnhover,
  handleSidepanelScroll,
  handleSidepanelScrollTo,
  handleSidepanelAppend,
  handleSidepanelUrl,
  handleSidepanelTitle,
  handleSidepanelWait,
  handleSidepanelSnapshot,
  handleSidepanelSnapshotText,
  handleSidepanelSnapshotData,
} from "./sidepanel-handlers.js";

registerDoctest("sidepanel_click", `
  const result = await callTool("sidepanel_click", { refId: "1" });
  expect(result).toBeNull();
`);

// ─── Main registry sidepanel tools ─────────────────────────────

registerTool({
  action: "sidepanel_click",
  namespace: "sidepanel",
  description: "Click an element in the sidepanel",
  params: SidepanelClickParamsSchema,
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
  errorCode: "ESIDEPANEL",
  errorCategory: "sidepanel",
  paramDocs: { refId: "Element refId from snapshot" },
  handler: async (params) => handleSidepanelClick(params),
});

registerTool({
  action: "sidepanel_dblclick",
  namespace: "sidepanel",
  description: "Double-click an element in the sidepanel",
  params: SidepanelDblClickParamsSchema,
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
  errorCode: "ESIDEPANEL",
  errorCategory: "sidepanel",
  paramDocs: { refId: "Element refId from snapshot" },
  handler: async (params) => handleSidepanelDblClick(params),
});

registerTool({
  action: "sidepanel_fill",
  namespace: "sidepanel",
  description: "Fill an input element in the sidepanel",
  params: SidepanelFillParamsSchema,
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
      required: false,
      description: "Text to fill",
    },
  ],
  returns: z.null(),
  returnDoc: "null",
  errorCode: "ESIDEPANEL",
  errorCategory: "sidepanel",
  paramDocs: { refId: "Element refId", value: "Text to fill" },
  handler: async (params) => handleSidepanelFill(params),
});

registerTool({
  action: "sidepanel_type",
  namespace: "sidepanel",
  description: "Type text into an input in the sidepanel",
  params: SidepanelTypeParamsSchema,
  paramTypes: [
    {
      name: "refId",
      type: "string",
      required: true,
      description: "Element refId from snapshot",
    },
    {
      name: "text",
      type: "string",
      required: false,
      description: "Text to type",
    },
  ],
  returns: z.null(),
  returnDoc: "null",
  errorCode: "ESIDEPANEL",
  errorCategory: "sidepanel",
  paramDocs: { refId: "Element refId", text: "Text to type" },
  handler: async (params) => handleSidepanelType(params),
});

registerTool({
  action: "sidepanel_press",
  namespace: "sidepanel",
  description: "Press a key in the sidepanel",
  params: SidepanelPressParamsSchema,
  paramTypes: [
    {
      name: "key",
      type: "string",
      required: false,
      description: "Key to press",
    },
  ],
  returns: z.null(),
  returnDoc: "null",
  errorCode: "ESIDEPANEL",
  errorCategory: "sidepanel",
  paramDocs: { key: "Key to press" },
  handler: async (params) => handleSidepanelPress(params),
});

registerTool({
  action: "sidepanel_select",
  namespace: "sidepanel",
  description: "Select an option in a dropdown in the sidepanel",
  params: SidepanelSelectParamsSchema,
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
      required: false,
      description: "Option value to select",
    },
  ],
  returns: z.null(),
  returnDoc: "null",
  errorCode: "ESIDEPANEL",
  errorCategory: "sidepanel",
  paramDocs: { refId: "Element refId", value: "Option value" },
  handler: async (params) => handleSidepanelSelect(params),
});

registerTool({
  action: "sidepanel_check",
  namespace: "sidepanel",
  description: "Toggle a checkbox in the sidepanel",
  params: SidepanelCheckParamsSchema,
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
  errorCode: "ESIDEPANEL",
  errorCategory: "sidepanel",
  paramDocs: { refId: "Element refId", checked: "Desired checked state" },
  handler: async (params) => handleSidepanelCheck(params),
});

registerTool({
  action: "sidepanel_hover",
  namespace: "sidepanel",
  description: "Hover over an element in the sidepanel",
  params: SidepanelHoverParamsSchema,
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
  errorCode: "ESIDEPANEL",
  errorCategory: "sidepanel",
  paramDocs: { refId: "Element refId" },
  handler: async (params) => handleSidepanelHover(params),
});

registerTool({
  action: "sidepanel_unhover",
  namespace: "sidepanel",
  description: "Unhover in the sidepanel",
  params: SidepanelUnhoverParamsSchema,
  paramTypes: [],
  returns: z.null(),
  returnDoc: "null",
  errorCode: "ESIDEPANEL",
  errorCategory: "sidepanel",
  paramDocs: {},
  handler: async () => handleSidepanelUnhover(),
});

registerTool({
  action: "sidepanel_scroll",
  namespace: "sidepanel",
  description: "Scroll the sidepanel",
  params: SidepanelScrollParamsSchema,
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
  ],
  returns: z.null(),
  returnDoc: "null",
  errorCode: "ESIDEPANEL",
  errorCategory: "sidepanel",
  paramDocs: { direction: "Scroll direction", amount: "Scroll amount" },
  handler: async (params) => handleSidepanelScroll(params),
});

registerTool({
  action: "sidepanel_scroll_to",
  namespace: "sidepanel",
  description: "Scroll to an element or coordinates in the sidepanel",
  params: SidepanelScrollToParamsSchema,
  paramTypes: [
    {
      name: "refId",
      type: "string",
      required: false,
      description: "Element refId from snapshot",
    },
    {
      name: "x",
      type: "number",
      required: false,
      description: "Horizontal scroll position (used when refId is absent)",
    },
    {
      name: "y",
      type: "number",
      required: false,
      description: "Vertical scroll position (used when refId is absent)",
    },
  ],
  returns: z.null(),
  returnDoc: "null",
  errorCode: "ESIDEPANEL",
  errorCategory: "sidepanel",
  paramDocs: { refId: "Element refId", x: "Horizontal scroll position", y: "Vertical scroll position" },
  handler: async (params) => handleSidepanelScrollTo(params),
});

registerTool({
  action: "sidepanel_append",
  namespace: "sidepanel",
  description: "Append text to an input in the sidepanel",
  params: SidepanelAppendParamsSchema,
  paramTypes: [
    {
      name: "refId",
      type: "string",
      required: true,
      description: "Element refId from snapshot",
    },
    {
      name: "text",
      type: "string",
      required: false,
      description: "Text to append",
    },
  ],
  returns: z.null(),
  returnDoc: "null",
  errorCode: "ESIDEPANEL",
  errorCategory: "sidepanel",
  paramDocs: { refId: "Element refId", text: "Text to append" },
  handler: async (params) => handleSidepanelAppend(params),
});

registerTool({
  action: "sidepanel_url",
  namespace: "sidepanel",
  description: "Get the current URL of the sidepanel",
  params: SidepanelUrlParamsSchema,
  paramTypes: [],
  returns: z.string(),
  returnDoc: "string",
  errorCode: "ESIDEPANEL",
  errorCategory: "sidepanel",
  paramDocs: {},
  handler: async () => handleSidepanelUrl(),
});

registerTool({
  action: "sidepanel_title",
  namespace: "sidepanel",
  description: "Get the current title of the sidepanel",
  params: SidepanelTitleParamsSchema,
  paramTypes: [],
  returns: z.string(),
  returnDoc: "string",
  errorCode: "ESIDEPANEL",
  errorCategory: "sidepanel",
  paramDocs: {},
  handler: async () => handleSidepanelTitle(),
});

registerTool({
  action: "sidepanel_wait",
  namespace: "sidepanel",
  description: "Wait for a duration in the sidepanel",
  params: SidepanelWaitParamsSchema,
  paramTypes: [
    {
      name: "duration",
      type: "number",
      required: false,
      description: "Milliseconds to wait (default 1000)",
    },
  ],
  returns: z.boolean(),
  returnDoc: "true",
  errorCode: "ESIDEPANEL",
  errorCategory: "sidepanel",
  paramDocs: { duration: "Milliseconds to wait" },
  handler: async (params) => handleSidepanelWait(params),
});

registerTool({
  action: "sidepanel_snapshot",
  namespace: "sidepanel",
  description: "Take a DOM snapshot of the sidepanel and return text",
  params: SidepanelSnapshotParamsSchema,
  paramTypes: [
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
  errorCode: "ESIDEPANEL",
  errorCategory: "sidepanel",
  paramDocs: {
    max_nodes: "Maximum nodes",
    interactive_only: "Interactive only",
  },
  handler: async (params) => handleSidepanelSnapshot(params),
});

registerTool({
  action: "sidepanel_snapshot_text",
  namespace: "sidepanel",
  description: "Take a DOM snapshot of the sidepanel and return text",
  params: SidepanelSnapshotTextParamsSchema,
  paramTypes: [
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
  errorCode: "ESIDEPANEL",
  errorCategory: "sidepanel",
  paramDocs: {
    max_nodes: "Maximum nodes",
    interactive_only: "Interactive only",
  },
  handler: async (params) => handleSidepanelSnapshotText(params),
});

registerTool({
  action: "sidepanel_snapshot_data",
  namespace: "sidepanel",
  description: "Take a DOM snapshot of the sidepanel and return full data",
  params: SidepanelSnapshotDataParamsSchema,
  paramTypes: [
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
  returns: z.object({
    data: z.unknown(),
    text: z.string(),
  }),
  returnDoc: "DomSnapshotValue",
  errorCode: "ESIDEPANEL",
  errorCategory: "sidepanel",
  paramDocs: {
    max_nodes: "Maximum nodes",
    interactive_only: "Interactive only",
  },
  handler: async (params) => handleSidepanelSnapshotData(params),
});
