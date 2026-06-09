// Page navigation tools — goto, back, forward, reload, wait, find, wait_for

import { z } from "zod";
import { registerTool } from "../../../shared/tool-registry.js";
import {
  PageBackParamsSchema,
  PageFindParamsSchema,
  PageForwardParamsSchema,
  PageGotoParamsSchema,
  PageReloadParamsSchema,
  PageWaitForParamsSchema,
  PageWaitParamsSchema,
} from "../../../shared/schemas.js";
import { getActiveTabId } from "../runtime.js";
import { bridgeToTab } from "../tab/messaging.js";
import { executeInTab } from "../tab/execute.js";
import { dispatchTool } from "../../../shared/tool-registry.js";
import { createError, throwToolError } from "../../../shared/errors.js";

registerTool({
  action: "page_goto",
  namespace: "page",
  description: "Navigate the active tab to a URL",
  params: PageGotoParamsSchema,
  paramTypes: [
    {
      name: "url",
      type: "string",
      required: true,
      description: "URL to navigate to",
    },
  ],
  returns: z.unknown(),
  returnDoc: "Tab",
  errorCode: "EPAGE",
  errorCategory: "page",
  paramDocs: { url: "URL to navigate to" },
  transport: "chrome_api",
  handler: async (params) => {
    const tabId = getActiveTabId();
    if (tabId === null) throw new Error("No active tab");
    const result = await dispatchTool("chrome_tabs_update", {
      tabId,
      update: { url: params.url },
    });
    if (!result.ok) {
      throwToolError(result);
    }
    return result.value;
  },
});

registerTool({
  action: "page_back",
  namespace: "page",
  description: "Navigate back in the active tab",
  params: PageBackParamsSchema,
  paramTypes: [],
  returns: z.boolean(),
  returnDoc: "boolean",
  errorCode: "EPAGE",
  errorCategory: "page",
  paramDocs: {},
  handler: async () => {
    const tabId = getActiveTabId();
    if (tabId === null) throw new Error("No active tab");
    return bridgeToTab(tabId, "page_back", {});
  },
});

registerTool({
  action: "page_forward",
  namespace: "page",
  description: "Navigate forward in the active tab",
  params: PageForwardParamsSchema,
  paramTypes: [],
  returns: z.boolean(),
  returnDoc: "boolean",
  errorCode: "EPAGE",
  errorCategory: "page",
  paramDocs: {},
  handler: async () => {
    const tabId = getActiveTabId();
    if (tabId === null) throw new Error("No active tab");
    return bridgeToTab(tabId, "page_forward", {});
  },
});

registerTool({
  action: "page_reload",
  namespace: "page",
  description: "Reload the active tab",
  params: PageReloadParamsSchema,
  paramTypes: [],
  returns: z.unknown(),
  returnDoc: "Tab",
  errorCode: "EPAGE",
  errorCategory: "page",
  paramDocs: {},
  transport: "chrome_api",
  handler: async () => {
    const tabId = getActiveTabId();
    if (tabId === null) throw new Error("No active tab");
    const result = await dispatchTool("chrome_tabs_reload", { tabId });
    if (!result.ok) {
      throwToolError(result);
    }
    return result.value;
  },
});

registerTool({
  action: "page_wait",
  namespace: "page",
  description: "Wait for a duration",
  params: PageWaitParamsSchema,
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
  errorCode: "EPAGE",
  errorCategory: "page",
  paramDocs: { duration: "Milliseconds to wait (default 1000)" },
  transport: "host_async",
  handler: async (params) => {
    const duration = Number.isFinite(Number(params.duration)) && Number(params.duration) > 0
      ? Number(params.duration)
      : 1000;
    await new Promise((resolve) => setTimeout(resolve, duration));
    return true;
  },
});

registerTool({
  action: "page_find",
  namespace: "page",
  description: "Find elements matching a CSS selector",
  params: PageFindParamsSchema,
  paramTypes: [
    {
      name: "selector",
      type: "string",
      required: true,
      description: "CSS selector",
    },
  ],
  returns: z.array(
    z.object({
      tag: z.string(),
      refId: z.string().nullable(),
      text: z.string(),
    }),
  ),
  returnDoc: "Array<{ tag, refId, text }>",
  errorCode: "EPAGE",
  errorCategory: "page",
  paramDocs: { selector: "CSS selector" },
  transport: "host_async",
  handler: async (params) => {
    const tabId = getActiveTabId();
    if (tabId === null) throw new Error("No active tab");
    const result = await executeInTab(
      tabId,
      (sel: unknown) => {
        const elements = Array.from(document.querySelectorAll(String(sel)));
        return elements.map((el) => ({
          tag: el.tagName,
          refId: el.getAttribute("data-ref-id"),
          text: el.textContent?.slice(0, 100) || "",
        }));
      },
      [params.selector],
    );
    if (!result.ok) {
      throwToolError(result);
    }
    return result.value;
  },
});

registerTool({
  action: "page_wait_for",
  namespace: "page",
  description: "Wait for an element matching a CSS selector",
  params: PageWaitForParamsSchema,
  paramTypes: [
    {
      name: "selector",
      type: "string",
      required: true,
      description: "CSS selector",
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
  errorCode: "EPAGE",
  errorCategory: "page",
  paramDocs: {
    selector: "CSS selector",
    timeout: "Timeout in milliseconds (default 30000)",
  },
  transport: "host_async",
  handler: async (params) => {
    const tabId = getActiveTabId();
    if (tabId === null) throw new Error("No active tab");
    const timeoutMs = Number.isFinite(Number(params.timeout)) && Number(params.timeout) > 0
      ? Number(params.timeout)
      : 30_000;
    const start = Date.now();
    while (true) {
      const result = await executeInTab(
        tabId,
        (sel: unknown) => !!document.querySelector(String(sel)),
        [params.selector],
      );
      if (result.ok && result.value === true) {
        return true;
      }
      if (Date.now() - start >= timeoutMs) {
        throw createError(
          `Timeout waiting for selector: ${params.selector}`,
          "E_TIMEOUT",
          "timeout",
        );
      }
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  },
});

// ─── Tab action registrations ──────────────────────────────────

