// DOM handler implementations for content-script tools

import { register } from "./registry.js";
import {
  getElementByRefId,
  findElementByLabel,
  findCandidateLabels,
} from "./dom-utils.js";
import { inlineSnapshot } from "./snapshot.js";
import { logger } from "../shared/logger.js";
import {
  CsClickParamsSchema,
  CsFillParamsSchema,
  CsTypeParamsSchema,
  CsAppendParamsSchema,
  CsPressParamsSchema,
  CsSelectParamsSchema,
  CsCheckParamsSchema,
  CsHoverParamsSchema,
  CsUnhoverParamsSchema,
  CsScrollParamsSchema,
  CsScrollToParamsSchema,
  CsDblClickParamsSchema,
  CsForwardParamsSchema,
  CsReloadParamsSchema,
  CsEvaluateParamsSchema,
  CsBackParamsSchema,
  CsPingParamsSchema,
  CsPingReturnSchema,
  CsSnapshotParamsSchema,
  CsSnapshotReturnSchema,
  CsFetchParamsSchema,
  CsFetchReturnSchema,
  CsInternalPingParamsSchema,
  CsInternalPingReturnSchema,
  CsToolDocsParamsSchema,
  CsToolDocsReturnSchema,
} from "./schemas.js";
import { z } from "zod";
import { computeToolsHash, listLocalToolDocs } from "./registry.js";

const CONTENT_SCRIPT_VERSION = "1.0.0";

const csDocBase = {
  source: "content_script" as const,
  transport: "active_tab_content_script" as const,
  errorCode: "E_CONTENT_SCRIPT",
  errorCategory: "content_script",
};

function setInputValue(el: HTMLInputElement | HTMLTextAreaElement, value: string, mode: "set" | "append"): void {
  el.value = mode === "append" ? el.value + value : value;
  const ev = new InputEvent("input", { bubbles: true });
  el.dispatchEvent(ev);
}

// ─── Page handlers ───────────────────────────────────────────────

register(
  "page_click",
  CsClickParamsSchema,
  z.null(),
  {
    namespace: "page",
    name: "click",
    publicName: "page.click",
    localName: "click",
    description: "Click a DOM element",
    params: [
      { name: "refId", type: "string", required: false, description: "Element refId" },
      { name: "label", type: "string", required: false, description: "Element label" },
    ],
    returnType: "null",
    returnDoc: "None",
    ...csDocBase,
  },
  (params) => {
    const { refId, label } = params;
    let el = refId ? getElementByRefId(refId) : null;
    if (!el && label) {
      el = findElementByLabel(label);
    }
    if (!el) {
      const query = label || refId;
      const candidates = query ? findCandidateLabels(query) : [];
      throw new Error(
        `Element not found${query ? ` by label: "${query}"` : ""}. Candidates: ${candidates.join(", ") || "none"}`,
      );
    }
    (el as HTMLElement).click();
    return null;
  },
);

register(
  "page_fill",
  CsFillParamsSchema,
  z.null(),
  {
    namespace: "page",
    name: "fill",
    publicName: "page.fill",
    localName: "fill",
    description: "Fill a DOM input",
    params: [
      { name: "refId", type: "string", required: false, description: "Element refId" },
      { name: "label", type: "string", required: false, description: "Element label" },
      { name: "value", type: "string", required: false, description: "Value to fill" },
    ],
    returnType: "null",
    returnDoc: "None",
    ...csDocBase,
  },
  (params) => {
    const { refId, label, value = "" } = params;
    let el = refId ? getElementByRefId(refId) : null;
    if (!el && label) {
      el = findElementByLabel(label);
    }
    if (!el) {
      const query = label || refId;
      const candidates = query ? findCandidateLabels(query) : [];
      throw new Error(
        `Element not found${query ? ` by label: "${query}"` : ""}. Candidates: ${candidates.join(", ") || "none"}`,
      );
    }
    if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
      setInputValue(el, value, "set");
      return null;
    }
    throw new Error("Element is not an input");
  },
);

register(
  "page_type",
  CsTypeParamsSchema,
  z.null(),
  {
    namespace: "page",
    name: "type",
    publicName: "page.type",
    localName: "type",
    description: "Type text into a DOM input",
    params: [
      { name: "refId", type: "string", required: false, description: "Element refId" },
      { name: "label", type: "string", required: false, description: "Element label" },
      { name: "text", type: "string", required: false, description: "Text to type" },
    ],
    returnType: "null",
    returnDoc: "None",
    ...csDocBase,
  },
  (params) => {
    const { refId, label, text = "" } = params;
    let el = refId ? getElementByRefId(refId) : null;
    if (!el && label) {
      el = findElementByLabel(label);
    }
    if (!el) {
      const query = label || refId;
      const candidates = query ? findCandidateLabels(query) : [];
      throw new Error(
        `Element not found${query ? ` by label: "${query}"` : ""}. Candidates: ${candidates.join(", ") || "none"}`,
      );
    }
    if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
      setInputValue(el, text, "append");
      return null;
    }
    throw new Error("Element is not an input");
  },
);

register(
  "page_append",
  CsAppendParamsSchema,
  z.null(),
  {
    namespace: "page",
    name: "append",
    publicName: "page.append",
    localName: "append",
    description: "Append text to a DOM input",
    params: [
      { name: "refId", type: "string", required: false, description: "Element refId" },
      { name: "label", type: "string", required: false, description: "Element label" },
      { name: "text", type: "string", required: false, description: "Text to append" },
    ],
    returnType: "null",
    returnDoc: "None",
    ...csDocBase,
  },
  (params) => {
    const { refId, label, text = "" } = params;
    let el = refId ? getElementByRefId(refId) : null;
    if (!el && label) {
      el = findElementByLabel(label);
    }
    if (!el) {
      const query = label || refId;
      const candidates = query ? findCandidateLabels(query) : [];
      throw new Error(
        `Element not found${query ? ` by label: "${query}"` : ""}. Candidates: ${candidates.join(", ") || "none"}`,
      );
    }
    if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
      setInputValue(el, text, "append");
      return null;
    }
    throw new Error("Element is not an input");
  },
);

register(
  "page_press",
  CsPressParamsSchema,
  z.null(),
  {
    namespace: "page",
    name: "press",
    publicName: "page.press",
    localName: "press",
    description: "Press a keyboard key",
    params: [
      { name: "key", type: "string", required: true, description: "Key to press" },
    ],
    returnType: "null",
    returnDoc: "None",
    ...csDocBase,
  },
  (params) => {
    const { key = "" } = params;
    const target = document.activeElement || document.body || document.documentElement;
    const evDown = new KeyboardEvent("keydown", { key, bubbles: true });
    target.dispatchEvent(evDown);
    const evUp = new KeyboardEvent("keyup", { key, bubbles: true });
    target.dispatchEvent(evUp);
    return null;
  },
);

register(
  "page_select",
  CsSelectParamsSchema,
  z.null(),
  {
    namespace: "page",
    name: "select",
    publicName: "page.select",
    localName: "select",
    description: "Select an option in a DOM select",
    params: [
      { name: "refId", type: "string", required: false, description: "Element refId" },
      { name: "value", type: "string", required: false, description: "Option value to select" },
    ],
    returnType: "null",
    returnDoc: "None",
    ...csDocBase,
  },
  (params) => {
    const { refId, value = "" } = params;
    const el = refId ? getElementByRefId(refId) : null;
    if (!el) throw new Error(`Element ${refId} not found`);
    if (el instanceof HTMLSelectElement) {
      el.value = value;
      el.dispatchEvent(new Event("change", { bubbles: true }));
      return null;
    }
    throw new Error("Element is not a select");
  },
);

register(
  "page_check",
  CsCheckParamsSchema,
  z.null(),
  {
    namespace: "page",
    name: "check",
    publicName: "page.check",
    localName: "check",
    description: "Check or uncheck a checkbox",
    params: [
      { name: "refId", type: "string", required: false, description: "Element refId" },
      { name: "checked", type: "boolean", required: false, description: "Whether to check the checkbox" },
    ],
    returnType: "null",
    returnDoc: "None",
    ...csDocBase,
  },
  (params) => {
    const { refId, checked = true } = params;
    const el = refId ? getElementByRefId(refId) : null;
    if (!el) throw new Error(`Element ${refId} not found`);
    if (el instanceof HTMLInputElement && el.type === "checkbox") {
      el.checked = checked;
      el.dispatchEvent(new Event("change", { bubbles: true }));
      return null;
    }
    throw new Error("Element is not a checkbox");
  },
);

register(
  "page_hover",
  CsHoverParamsSchema,
  z.null(),
  {
    namespace: "page",
    name: "hover",
    publicName: "page.hover",
    localName: "hover",
    description: "Hover over a DOM element",
    params: [
      { name: "refId", type: "string", required: false, description: "Element refId" },
    ],
    returnType: "null",
    returnDoc: "None",
    ...csDocBase,
  },
  (params) => {
    const { refId } = params;
    const el = refId ? getElementByRefId(refId) : null;
    if (!el) throw new Error(`Element ${refId} not found`);
    const ev = new MouseEvent("mouseenter", { bubbles: true });
    el.dispatchEvent(ev);
    return null;
  },
);

register(
  "page_unhover",
  CsUnhoverParamsSchema,
  z.null(),
  {
    namespace: "page",
    name: "unhover",
    publicName: "page.unhover",
    localName: "unhover",
    description: "Unhover from the document body",
    params: [],
    returnType: "null",
    returnDoc: "None",
    ...csDocBase,
  },
  () => {
    const target = document.body || document.documentElement;
    if (target) {
      const ev = new MouseEvent("mouseleave", { bubbles: true });
      target.dispatchEvent(ev);
    }
    return null;
  },
);

register(
  "page_scroll",
  CsScrollParamsSchema,
  z.boolean(),
  {
    namespace: "page",
    name: "scroll",
    publicName: "page.scroll",
    localName: "scroll",
    description: "Scroll the page or an element",
    params: [
      { name: "direction", type: "string", required: false, description: "Scroll direction (up or down)" },
      { name: "amount", type: "number", required: false, description: "Pixels to scroll" },
      { name: "refId", type: "string", required: false, description: "Element refId to scroll within" },
    ],
    returnType: "boolean",
    returnDoc: "true if scrolled",
    ...csDocBase,
  },
  (params) => {
    const { direction = "down", amount = 300, refId } = params;
    if (refId) {
      const el = getElementByRefId(refId);
      if (!el) {
        throw new Error(`Element ${refId} not found`);
      }
      let scrollable: HTMLElement | null = el as HTMLElement;
      while (scrollable && scrollable !== document.body) {
        const style = window.getComputedStyle(scrollable);
        if (
          style.overflow === "auto" ||
          style.overflow === "scroll" ||
          style.overflow === "overlay" ||
          style.overflowY === "auto" ||
          style.overflowY === "scroll" ||
          style.overflowY === "overlay"
        ) {
          break;
        }
        scrollable = scrollable.parentElement;
      }
      if (scrollable && scrollable !== document.body) {
        scrollable.scrollBy({
          top: direction === "down" ? amount : -amount,
          behavior: "smooth",
        });
        return true;
      }
      if (scrollable === document.body) {
        const style = window.getComputedStyle(document.body);
        if (
          style.overflow === "auto" ||
          style.overflow === "scroll" ||
          style.overflow === "overlay" ||
          style.overflowY === "auto" ||
          style.overflowY === "scroll" ||
          style.overflowY === "overlay"
        ) {
          document.body.scrollBy({
            top: direction === "down" ? amount : -amount,
            behavior: "smooth",
          });
          return true;
        }
      }
    }
    window.scrollBy({
      top: direction === "down" ? amount : -amount,
      behavior: "smooth",
    });
    return true;
  },
);

register(
  "page_scroll_to",
  CsScrollToParamsSchema,
  z.boolean(),
  {
    namespace: "page",
    name: "scrollTo",
    publicName: "page.scrollTo",
    localName: "scrollTo",
    description: "Scroll to coordinates or an element",
    params: [
      { name: "refId", type: "string", required: false, description: "Element refId to scroll to" },
      { name: "x", type: "number", required: false, description: "X coordinate" },
      { name: "y", type: "number", required: false, description: "Y coordinate" },
    ],
    returnType: "boolean",
    returnDoc: "true if scrolled",
    ...csDocBase,
  },
  (params) => {
    const { refId, x = 0, y = 0 } = params;
    if (refId) {
      const el = getElementByRefId(refId);
      if (!el) {
        throw new Error(`Element ${refId} not found`);
      }
      el.scrollIntoView({ behavior: "smooth" });
      return true;
    }
    window.scrollTo({ top: y, left: x, behavior: "smooth" });
    return true;
  },
);

register(
  "page_dblclick",
  CsDblClickParamsSchema,
  z.null(),
  {
    namespace: "page",
    name: "dblclick",
    publicName: "page.dblclick",
    localName: "dblclick",
    description: "Double-click a DOM element",
    params: [
      { name: "refId", type: "string", required: false, description: "Element refId" },
    ],
    returnType: "null",
    returnDoc: "None",
    ...csDocBase,
  },
  (params) => {
    const { refId } = params;
    const el = refId ? getElementByRefId(refId) : null;
    if (!el) throw new Error(`Element ${refId} not found`);
    const ev = new MouseEvent("dblclick", { bubbles: true });
    el.dispatchEvent(ev);
    return null;
  },
);

register(
  "page_forward",
  CsForwardParamsSchema,
  z.boolean(),
  {
    namespace: "page",
    name: "forward",
    publicName: "page.forward",
    localName: "forward",
    description: "Navigate forward in history",
    params: [],
    returnType: "boolean",
    returnDoc: "true if navigated",
    ...csDocBase,
  },
  () => {
    window.history.forward();
    return true;
  },
);

register(
  "page_reload",
  CsReloadParamsSchema,
  z.boolean(),
  {
    namespace: "page",
    name: "reload",
    publicName: "page.reload",
    localName: "reload",
    description: "Reload the page",
    params: [],
    returnType: "boolean",
    returnDoc: "true if reloaded",
    ...csDocBase,
  },
  () => {
    window.location.reload();
    return true;
  },
);

register(
  "page_evaluate",
  CsEvaluateParamsSchema,
  z.unknown(),
  {
    namespace: "page",
    name: "evaluate",
    publicName: "page.evaluate",
    localName: "evaluate",
    description: "Evaluate JavaScript in the page context",
    params: [
      { name: "code", type: "string", required: false, description: "JavaScript code to evaluate" },
    ],
    returnType: "unknown",
    returnDoc: "Result of evaluated JavaScript",
    ...csDocBase,
  },
  (params) => {
    const { code = "" } = params;
    if (typeof code !== "string") {
      throw new Error("evaluate requires a string argument");
    }
    return new Function(code)();
  },
);

register(
  "page_back",
  CsBackParamsSchema,
  z.boolean(),
  {
    namespace: "page",
    name: "back",
    publicName: "page.back",
    localName: "back",
    description: "Navigate back in history",
    params: [],
    returnType: "boolean",
    returnDoc: "true if navigated",
    ...csDocBase,
  },
  () => {
    window.history.back();
    return true;
  },
);

register(
  "page_ping",
  CsPingParamsSchema,
  CsPingReturnSchema,
  {
    namespace: "page",
    name: "ping",
    publicName: "page.ping",
    localName: "ping",
    description: "Ping the content script",
    params: [],
    returnType: "object",
    returnDoc: "Ping response",
    ...csDocBase,
  },
  () => {
    return { ok: true as const };
  },
);

register(
  "page_snapshot",
  CsSnapshotParamsSchema,
  CsSnapshotReturnSchema,
  {
    namespace: "page",
    name: "snapshot",
    publicName: "page.snapshot",
    localName: "snapshot",
    description: "Take a DOM snapshot",
    params: [
      { name: "max_nodes", type: "number", required: false, description: "Maximum number of nodes to include" },
    ],
    returnType: "object",
    returnDoc: "DOM snapshot result",
    ...csDocBase,
  },
  async (params) => {
    const { max_nodes = 500 } = params;
    logger.debug(
      "[content-script] snapshot called, maxNodes:",
      max_nodes,
      "document.body:",
      !!document.body,
    );
    const r = inlineSnapshot(max_nodes);
    logger.debug("[content-script] snapshot result nodes:", r.nodes.length);
    return r;
  },
);

register(
  "page_fetch",
  CsFetchParamsSchema,
  CsFetchReturnSchema,
  {
    namespace: "page",
    name: "fetch",
    publicName: "page.fetch",
    localName: "fetch",
    description: "Fetch a URL from the page context",
    params: [
      { name: "url", type: "string", required: true, description: "URL to fetch" },
      { name: "method", type: "string", required: false, description: "HTTP method" },
      { name: "headers", type: "object", required: false, description: "Request headers" },
      { name: "body", type: "any", required: false, description: "Request body" },
      { name: "timeout", type: "number", required: false, description: "Timeout in milliseconds" },
    ],
    returnType: "object",
    returnDoc: "HTTP response",
    ...csDocBase,
  },
  async (params) => {
    const {
      url = "",
      method = "GET",
      headers = {},
      body = null,
      timeout = 30_000,
    } = params;

    const controller = new AbortController();
    const effectiveTimeout = Number.isFinite(timeout) && timeout > 0 ? timeout : 30_000;
    const timeoutId = setTimeout(() => controller.abort(), effectiveTimeout);
    try {
      const fetchOpts: RequestInit = {
        method: method || "GET",
        headers:
          typeof headers === "object" && headers !== null
            ? (headers as Record<string, string>)
            : {},
        signal: controller.signal,
      };
      if (body !== null && body !== undefined) {
        fetchOpts.body = typeof body === "string" ? body : String(body);
      }
      const resp = await fetch(url, fetchOpts);
      const text = await resp.text();
      clearTimeout(timeoutId);
      return {
        status: resp.status,
        ok: resp.ok,
        headers: Object.fromEntries(resp.headers.entries()),
        body: text,
      };
    } catch (e) {
      clearTimeout(timeoutId);
      throw e;
    }
  },
);

// ─── Internal handlers ───────────────────────────────────────────

register(
  "__ping",
  CsInternalPingParamsSchema,
  CsInternalPingReturnSchema,
  {
    namespace: "__internal",
    name: "ping",
    publicName: "__internal.content_script.ping",
    localName: "__ping",
    description: "Ping the content script for readiness",
    params: [],
    returnType: "object",
    returnDoc: "Readiness metadata with version and tools hash",
    ...csDocBase,
  },
  () => {
    return {
      ready: true as const,
      version: CONTENT_SCRIPT_VERSION,
      toolsHash: computeToolsHash(),
    };
  },
);

register(
  "__content_script_tool_docs",
  CsToolDocsParamsSchema,
  CsToolDocsReturnSchema,
  {
    namespace: "__internal",
    name: "tool_docs",
    publicName: "__internal.content_script.tool_docs",
    localName: "__tool_docs",
    description: "List all content script tool documentation",
    params: [],
    returnType: "array",
    returnDoc: "Array of ToolDoc for all registered content script tools",
    ...csDocBase,
  },
  () => {
    return listLocalToolDocs();
  },
);
