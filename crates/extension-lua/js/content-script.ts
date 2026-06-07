// Content script for Lua Notebook extension
// Runs in isolated world, handles tab.* operations via chrome.runtime.onMessage.

import { z } from "zod";

declare global {
  interface Window {
    __luaNotebookSetLogLevel?: (level: string) => void;
    __luaNotebookContentScriptInjected?: boolean;
  }
}

const __LOG_LEVELS = { debug: 0, info: 1, warn: 2, error: 3, none: 4 } as const;
let __logLevel = 3; // default "error"

const logger = {
  debug: (...args: unknown[]) => {
    if (__logLevel <= 0) console.log(...args);
  },
  info: (...args: unknown[]) => {
    if (__logLevel <= 1) console.log(...args);
  },
  warn: (...args: unknown[]) => {
    if (__logLevel <= 2) console.warn(...args);
  },
  error: (...args: unknown[]) => {
    if (__logLevel <= 3) console.error(...args);
  },
};

window.__luaNotebookSetLogLevel = (level: string) => {
  __logLevel = __LOG_LEVELS[level as keyof typeof __LOG_LEVELS] ?? 3;
};

if (window.__luaNotebookContentScriptInjected) {
  throw new Error("Content script already injected");
}
window.__luaNotebookContentScriptInjected = true;

function getElementByRefId(refId: string | number): Element {
  const el = document.querySelector(
    `[data-ref-id='${CSS.escape(String(refId))}']`,
  );
  if (!el) {
    throw new Error(
      `Element with refId=${refId} not found. Handles are scoped to a single snapshot. Call page.snapshot() again to get fresh refIds.`,
    );
  }
  return el;
}

function findElementByLabel(query: string): Element | null {
  const lowerQuery = query.toLowerCase().trim();
  if (!lowerQuery) return null;
  const all = Array.from(
    document.querySelectorAll(
      'input, textarea, select, button, a, [role="button"], [role="link"]',
    ),
  );
  for (const el of all) {
    const ariaLabel = el.getAttribute("aria-label");
    if (ariaLabel && ariaLabel.toLowerCase().trim() === lowerQuery) return el;
    const placeholder = (el as HTMLInputElement).placeholder;
    if (placeholder && placeholder.toLowerCase().trim() === lowerQuery)
      return el;
    const id = el.id;
    if (id) {
      const label = document.querySelector(`label[for='${CSS.escape(id)}']`);
      if (label && label.textContent?.trim().toLowerCase() === lowerQuery)
        return el;
    }
    const parentLabel = el.closest("label");
    if (
      parentLabel &&
      parentLabel.textContent?.trim().toLowerCase() === lowerQuery
    )
      return el;
    const text = el.textContent?.trim().toLowerCase() || "";
    if (text === lowerQuery) return el;
  }
  return null;
}

function findCandidateLabels(query: string): string[] {
  const lowerQuery = query.toLowerCase().trim();
  const candidates = new Set<string>();
  const all = Array.from(
    document.querySelectorAll(
      'input, textarea, select, button, a, [role="button"], [role="link"]',
    ),
  );
  for (const el of all) {
    const ariaLabel = el.getAttribute("aria-label");
    if (ariaLabel) candidates.add(ariaLabel.trim());
    const placeholder = (el as HTMLInputElement).placeholder;
    if (placeholder) candidates.add(placeholder.trim());
    const text = el.textContent?.trim() || "";
    if (text) candidates.add(text);
  }
  return Array.from(candidates)
    .filter((c) => c.toLowerCase().includes(lowerQuery))
    .slice(0, 5);
}

function getAccessibleRole(el: Element): string {
  const tag = el.tagName.toLowerCase();
  const ariaRole = el.getAttribute("role");
  if (ariaRole) return ariaRole;
  if (
    tag === "button" ||
    (tag === "input" && (el as HTMLInputElement).type === "submit")
  )
    return "button";
  if (tag === "a") return "link";
  if (tag === "input") {
    const type = (el as HTMLInputElement).type;
    if (
      type === "text" ||
      type === "email" ||
      type === "password" ||
      type === "search"
    )
      return "textbox";
    if (type === "checkbox") return "checkbox";
    if (type === "radio") return "radio";
    if (type === "submit" || type === "button") return "button";
  }
  if (tag === "textarea") return "textbox";
  if (tag === "select") return "combobox";
  if (tag === "img") return "img";
  if (
    tag === "h1" ||
    tag === "h2" ||
    tag === "h3" ||
    tag === "h4" ||
    tag === "h5" ||
    tag === "h6"
  )
    return "heading";
  if (tag === "li") return "listitem";
  if (tag === "ul" || tag === "ol") return "list";
  if (tag === "table") return "table";
  if (tag === "tr") return "row";
  if (tag === "td" || tag === "th") return "cell";
  if (tag === "nav") return "navigation";
  if (tag === "main") return "main";
  if (tag === "article") return "article";
  if (tag === "section") return "region";
  if (tag === "aside") return "complementary";
  if (tag === "form") return "form";
  if (tag === "dialog" || tag === "modal") return "dialog";
  if (tag === "figure") return "figure";
  if (tag === "figcaption") return "caption";
  if (el.getAttribute("onclick") || (el as HTMLElement).onclick)
    return "button";
  return "generic";
}

function getAccessibleName(el: Element): string {
  const ariaLabel = el.getAttribute("aria-label");
  if (ariaLabel) return ariaLabel;

  const labelledBy = el.getAttribute("aria-labelledby");
  if (labelledBy) {
    const labelEl = document.getElementById(labelledBy);
    if (labelEl) return labelEl.textContent?.slice(0, 60) || "";
  }

  const tag = el.tagName.toLowerCase();
  if (tag === "img") {
    const alt = el.getAttribute("alt");
    if (alt) return alt;
  }

  const title = (el as HTMLElement).title;
  if (title) return title;

  const role = getAccessibleRole(el);
  if (
    role !== "generic" &&
    role !== "list" &&
    role !== "table" &&
    role !== "row" &&
    role !== "region" &&
    role !== "navigation" &&
    role !== "main"
  ) {
    const text = el.textContent?.trim().slice(0, 60) || "";
    return text;
  }
  return "";
}

function shouldInclude(el: Element): boolean {
  const role = getAccessibleRole(el);
  if (role === "generic") return false;
  if (role === "presentation" || role === "none") return false;
  if ((el as HTMLElement).hidden) return false;
  const style = window.getComputedStyle(el);
  if (style.display === "none" || style.visibility === "hidden") return false;
  return true;
}

// ─── DOM snapshot (inline JS fallback) ───────────────────────────

interface SnapshotNode {
  refId: number;
  role: string;
  tag: string;
  name?: string;
}

interface SnapshotResult {
  text: string;
  nodes: SnapshotNode[];
  url: string;
  title: string;
  viewport: { width: number; height: number };
}

function inlineSnapshot(maxNodes: number): SnapshotResult {
  let nextRefId = 1;
  const nodes: SnapshotNode[] = [];
  const lines: string[] = [];

  function traverse(el: Element, depth: number) {
    if (nodes.length >= maxNodes) return;

    const tag = el.tagName.toLowerCase();
    if (
      tag === "script" ||
      tag === "style" ||
      tag === "noscript" ||
      tag === "template"
    )
      return;

    const included = shouldInclude(el);
    let currentDepth = depth;

    if (included) {
      const refId = nextRefId++;
      el.setAttribute("data-ref-id", String(refId));
      const role = getAccessibleRole(el);
      const name = getAccessibleName(el);
      const node: SnapshotNode = { refId, role, tag };
      if (name) node.name = name;
      nodes.push(node);

      const indent = "  ".repeat(depth);
      const parts = [`${indent}- ${role}`];
      if (name) parts.push(`"${name.replace(/"/g, '\\"')}"`);
      parts.push(`[ref=${refId}]`);
      lines.push(parts.join(" "));

      currentDepth = depth + 1;
    }

    for (const child of el.children) {
      traverse(child, currentDepth);
    }
  }

  if (document.body) {
    traverse(document.body, 0);
  }

  const header = [
    `URL: ${window.location.href}`,
    `Title: ${document.title}`,
    "",
  ];
  return {
    text: header.concat(lines).join("\n"),
    nodes,
    url: window.location.href,
    title: document.title,
    viewport: {
      width: window.innerWidth,
      height: window.innerHeight,
    },
  };
}

// ─── Content Script Tool Registry ────────────────────────────────

const CONTENT_SCRIPT_VERSION = "1.0.0";

type ToolSource = "content_script";
type ToolTransport = "active_tab_content_script";

interface ToolDocParam {
  name: string;
  type: string;
  required: boolean;
  description: string;
}

interface ToolReturnDoc {
  type: string;
  description: string;
}

interface ToolDoc {
  action: string;
  namespace: string;
  name: string;
  publicName: string;
  localName?: string;
  source: ToolSource;
  transport: ToolTransport;
  description: string;
  params: ToolDocParam[];
  returns: ToolReturnDoc;
  errorCode: string;
  errorCategory: string;
}

interface ToolDefinition<P, R> {
  action: string;
  namespace: string;
  name: string;
  publicName: string;
  localName?: string;
  source: ToolSource;
  transport: ToolTransport;
  description: string;
  params: z.ZodType<P>;
  returns: z.ZodType<R>;
  handler: (params: P) => R | Promise<R>;
  paramDocs: Record<string, string>;
  paramTypes: ToolDocParam[];
  returnType?: string;
  returnDoc: string;
  errorCode: string;
  errorCategory: string;
}

export const csRegistry = new Map<string, ToolDefinition<unknown, unknown>>();

export const contentScriptDocsByPublicName = new Map<string, ToolDoc>();
export const contentScriptDocsByAction = new Map<string, ToolDoc>();

function _registerContentScriptTool<P, R>(tool: ToolDefinition<P, R>) {
  const key = tool.localName ?? tool.action;
  csRegistry.set(key, tool as ToolDefinition<unknown, unknown>);
  // Also register by full action name so pings and direct calls work
  if (tool.action !== key) {
    csRegistry.set(tool.action, tool as ToolDefinition<unknown, unknown>);
  }

  const doc: ToolDoc = {
    action: tool.action,
    namespace: tool.namespace,
    name: tool.name,
    publicName: tool.publicName,
    localName: tool.localName,
    source: tool.source,
    transport: tool.transport,
    description: tool.description,
    params: tool.paramTypes,
    returns: {
      type: tool.returnType ?? "unknown",
      description: tool.returnDoc,
    },
    errorCode: tool.errorCode,
    errorCategory: tool.errorCategory,
  };

  contentScriptDocsByPublicName.set(tool.publicName, doc);
  contentScriptDocsByAction.set(tool.action, doc);
}

interface ToolRegistrationDoc {
  namespace: string;
  name: string;
  publicName: string;
  localName?: string;
  source: ToolSource;
  transport: ToolTransport;
  description: string;
  params?: ToolDocParam[];
  returnType?: string;
  returnDoc?: string;
  errorCode?: string;
  errorCategory?: string;
}

function makeToolDefinition<P, R>(
  action: string,
  params: z.ZodSchema<P>,
  returns: z.ZodSchema<R>,
  doc: ToolRegistrationDoc,
  handler: (params: P) => R | Promise<R>,
): ToolDefinition<P, R> {
  return {
    action,
    namespace: doc.namespace,
    name: doc.name,
    publicName: doc.publicName,
    localName: doc.localName,
    source: doc.source,
    transport: doc.transport,
    description: doc.description,
    params,
    returns,
    handler,
    paramDocs: Object.fromEntries(
      (doc.params ?? []).map((param) => [param.name, param.description]),
    ),
    paramTypes: doc.params ?? [],
    returnType: doc.returnType,
    returnDoc: doc.returnDoc ?? "",
    errorCode: doc.errorCode ?? "E_CONTENT_SCRIPT",
    errorCategory: doc.errorCategory ?? "content_script",
  };
}

export function register<P, R>(
  action: string,
  params: z.ZodSchema<P>,
  returns: z.ZodSchema<R>,
  doc: ToolRegistrationDoc,
  handler: (params: P) => R | Promise<R>,
): void {
  const tool = makeToolDefinition(action, params, returns, doc, handler);
  _registerContentScriptTool(tool);
}
export function listLocalToolDocs(): ToolDoc[] {
  return Array.from(contentScriptDocsByAction.values());
}

function computeToolsHash(): string {
  const names = Array.from(csRegistry.values())
    .map((t) => t.publicName)
    .sort();
  let hash = 5381;
  const str = names.join("|");
  for (let i = 0; i < str.length; i++) {
    hash = (hash << 5) + hash + str.charCodeAt(i);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

// ─── Register all handlers ───────────────────────────────────────

register(
  "page_click",
  z.object({
    refId: z.string().optional(),
    label: z.string().optional(),
  }),
  z.null(),
  {
    namespace: "page",
    name: "click",
    publicName: "page.click",
    localName: "click",
    source: "content_script",
    transport: "active_tab_content_script",
    description: "Click a DOM element",
    params: [
      {
        name: "refId",
        type: "string",
        required: false,
        description: "Element refId",
      },
      {
        name: "label",
        type: "string",
        required: false,
        description: "Element label",
      },
    ],
    returnType: "null",
    returnDoc: "None",
    errorCode: "E_CONTENT_SCRIPT",
    errorCategory: "content_script",
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
  z.object({
    refId: z.string().optional(),
    label: z.string().optional(),
    value: z.string().optional(),
  }),
  z.null(),
  {
    namespace: "page",
    name: "fill",
    publicName: "page.fill",
    localName: "fill",
    source: "content_script",
    transport: "active_tab_content_script",
    description: "Fill a DOM input",
    params: [
      {
        name: "refId",
        type: "string",
        required: false,
        description: "Element refId",
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
        required: false,
        description: "Value to fill",
      },
    ],
    returnType: "null",
    returnDoc: "None",
    errorCode: "E_CONTENT_SCRIPT",
    errorCategory: "content_script",
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
      el.value = value;
      const ev = new InputEvent("input", { bubbles: true });
      el.dispatchEvent(ev);
      return null;
    }
    throw new Error("Element is not an input");
  },
);

register(
  "page_type",
  z.object({
    refId: z.string().optional(),
    label: z.string().optional(),
    text: z.string().optional(),
  }),
  z.null(),
  {
    namespace: "page",
    name: "type",
    publicName: "page.type",
    localName: "type",
    source: "content_script",
    transport: "active_tab_content_script",
    description: "Type text into a DOM input",
    params: [
      {
        name: "refId",
        type: "string",
        required: false,
        description: "Element refId",
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
        required: false,
        description: "Text to type",
      },
    ],
    returnType: "null",
    returnDoc: "None",
    errorCode: "E_CONTENT_SCRIPT",
    errorCategory: "content_script",
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
      el.value = el.value + text;
      const ev = new InputEvent("input", { bubbles: true });
      el.dispatchEvent(ev);
      return null;
    }
    throw new Error("Element is not an input");
  },
);

register(
  "page_append",
  z.object({
    refId: z.string().optional(),
    label: z.string().optional(),
    text: z.string().optional(),
  }),
  z.null(),
  {
    namespace: "page",
    name: "append",
    publicName: "page.append",
    localName: "append",
    source: "content_script",
    transport: "active_tab_content_script",
    description: "Append text to a DOM input",
    params: [
      {
        name: "refId",
        type: "string",
        required: false,
        description: "Element refId",
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
        required: false,
        description: "Text to append",
      },
    ],
    returnType: "null",
    returnDoc: "None",
    errorCode: "E_CONTENT_SCRIPT",
    errorCategory: "content_script",
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
      el.value += text;
      const ev = new InputEvent("input", { bubbles: true });
      el.dispatchEvent(ev);
      return null;
    }
    throw new Error("Element is not an input");
  },
);

register(
  "page_press",
  z.object({ key: z.string() }),
  z.null(),
  {
    namespace: "page",
    name: "press",
    publicName: "page.press",
    localName: "press",
    source: "content_script",
    transport: "active_tab_content_script",
    description: "Press a keyboard key",
    params: [
      {
        name: "key",
        type: "string",
        required: true,
        description: "Key to press",
      },
    ],
    returnType: "null",
    returnDoc: "None",
    errorCode: "E_CONTENT_SCRIPT",
    errorCategory: "content_script",
  },
  (params) => {
    const { key = "" } = params;
    const evDown = new KeyboardEvent("keydown", { key, bubbles: true });
    document.dispatchEvent(evDown);
    const evUp = new KeyboardEvent("keyup", { key, bubbles: true });
    document.dispatchEvent(evUp);
    return null;
  },
);

register(
  "page_select",
  z.object({
    refId: z.string().optional(),
    value: z.string().optional(),
  }),
  z.null(),
  {
    namespace: "page",
    name: "select",
    publicName: "page.select",
    localName: "select",
    source: "content_script",
    transport: "active_tab_content_script",
    description: "Select an option in a DOM select",
    params: [
      {
        name: "refId",
        type: "string",
        required: false,
        description: "Element refId",
      },
      {
        name: "value",
        type: "string",
        required: false,
        description: "Option value to select",
      },
    ],
    returnType: "null",
    returnDoc: "None",
    errorCode: "E_CONTENT_SCRIPT",
    errorCategory: "content_script",
  },
  (params) => {
    const { refId, value = "" } = params;
    const el = refId ? getElementByRefId(refId) : null;
    if (!el) throw new Error(`Element ${refId} not found`);
    if (el instanceof HTMLSelectElement) {
      el.value = value;
      return null;
    }
    throw new Error("Element is not a select");
  },
);

register(
  "page_check",
  z.object({
    refId: z.string().optional(),
    checked: z.boolean().optional(),
  }),
  z.null(),
  {
    namespace: "page",
    name: "check",
    publicName: "page.check",
    localName: "check",
    source: "content_script",
    transport: "active_tab_content_script",
    description: "Check or uncheck a checkbox",
    params: [
      {
        name: "refId",
        type: "string",
        required: false,
        description: "Element refId",
      },
      {
        name: "checked",
        type: "boolean",
        required: false,
        description: "Whether to check the checkbox",
      },
    ],
    returnType: "null",
    returnDoc: "None",
    errorCode: "E_CONTENT_SCRIPT",
    errorCategory: "content_script",
  },
  (params) => {
    const { refId, checked = true } = params;
    const el = refId ? getElementByRefId(refId) : null;
    if (!el) throw new Error(`Element ${refId} not found`);
    if (el instanceof HTMLInputElement && el.type === "checkbox") {
      el.checked = checked;
      return null;
    }
    throw new Error("Element is not a checkbox");
  },
);

register(
  "page_hover",
  z.object({ refId: z.string().optional() }),
  z.null(),
  {
    namespace: "page",
    name: "hover",
    publicName: "page.hover",
    localName: "hover",
    source: "content_script",
    transport: "active_tab_content_script",
    description: "Hover over a DOM element",
    params: [
      {
        name: "refId",
        type: "string",
        required: false,
        description: "Element refId",
      },
    ],
    returnType: "null",
    returnDoc: "None",
    errorCode: "E_CONTENT_SCRIPT",
    errorCategory: "content_script",
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
  z.object({}),
  z.null(),
  {
    namespace: "page",
    name: "unhover",
    publicName: "page.unhover",
    localName: "unhover",
    source: "content_script",
    transport: "active_tab_content_script",
    description: "Unhover from the document body",
    params: [],
    returnType: "null",
    returnDoc: "None",
    errorCode: "E_CONTENT_SCRIPT",
    errorCategory: "content_script",
  },
  () => {
    const ev = new MouseEvent("mouseleave", { bubbles: true });
    document.body.dispatchEvent(ev);
    return null;
  },
);

register(
  "page_scroll",
  z.object({
    direction: z.string().optional(),
    amount: z.number().optional(),
    refId: z.string().optional(),
  }),
  z.boolean(),
  {
    namespace: "page",
    name: "scroll",
    publicName: "page.scroll",
    localName: "scroll",
    source: "content_script",
    transport: "active_tab_content_script",
    description: "Scroll the page or an element",
    params: [
      {
        name: "direction",
        type: "string",
        required: false,
        description: "Scroll direction (up or down)",
      },
      {
        name: "amount",
        type: "number",
        required: false,
        description: "Pixels to scroll",
      },
      {
        name: "refId",
        type: "string",
        required: false,
        description: "Element refId to scroll within",
      },
    ],
    returnType: "boolean",
    returnDoc: "true if scrolled",
    errorCode: "E_CONTENT_SCRIPT",
    errorCategory: "content_script",
  },
  (params) => {
    const { direction = "down", amount = 300, refId } = params;
    if (refId) {
      const el = getElementByRefId(refId);
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
  "page_dblclick",
  z.object({ refId: z.string().optional() }),
  z.null(),
  {
    namespace: "page",
    name: "dblclick",
    publicName: "page.dblclick",
    localName: "dblclick",
    source: "content_script",
    transport: "active_tab_content_script",
    description: "Double-click a DOM element",
    params: [
      {
        name: "refId",
        type: "string",
        required: false,
        description: "Element refId",
      },
    ],
    returnType: "null",
    returnDoc: "None",
    errorCode: "E_CONTENT_SCRIPT",
    errorCategory: "content_script",
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
  z.object({}),
  z.boolean(),
  {
    namespace: "page",
    name: "forward",
    publicName: "page.forward",
    localName: "forward",
    source: "content_script",
    transport: "active_tab_content_script",
    description: "Navigate forward in history",
    params: [],
    returnType: "boolean",
    returnDoc: "true if navigated",
    errorCode: "E_CONTENT_SCRIPT",
    errorCategory: "content_script",
  },
  () => {
    window.history.forward();
    return true;
  },
);

register(
  "page_reload",
  z.object({}),
  z.boolean(),
  {
    namespace: "page",
    name: "reload",
    publicName: "page.reload",
    localName: "reload",
    source: "content_script",
    transport: "active_tab_content_script",
    description: "Reload the page",
    params: [],
    returnType: "boolean",
    returnDoc: "true if reloaded",
    errorCode: "E_CONTENT_SCRIPT",
    errorCategory: "content_script",
  },
  () => {
    window.location.reload();
    return true;
  },
);

register(
  "page_scroll_to",
  z.object({
    refId: z.string().optional(),
    x: z.number().optional(),
    y: z.number().optional(),
  }),
  z.boolean(),
  {
    namespace: "page",
    name: "scrollTo",
    publicName: "page.scrollTo",
    localName: "scrollTo",
    source: "content_script",
    transport: "active_tab_content_script",
    description: "Scroll to coordinates or an element",
    params: [
      {
        name: "refId",
        type: "string",
        required: false,
        description: "Element refId to scroll to",
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
    ],
    returnType: "boolean",
    returnDoc: "true if scrolled",
    errorCode: "E_CONTENT_SCRIPT",
    errorCategory: "content_script",
  },
  (params) => {
    const { refId, x = 0, y = 0 } = params;
    if (refId) {
      const el = getElementByRefId(refId);
      el.scrollIntoView({ behavior: "smooth" });
      return true;
    }
    window.scrollTo({ top: y, left: x, behavior: "smooth" });
    return true;
  },
);

register(
  "page_evaluate",
  z.object({ code: z.string().optional() }),
  z.unknown(),
  {
    namespace: "page",
    name: "evaluate",
    publicName: "page.evaluate",
    localName: "evaluate",
    source: "content_script",
    transport: "active_tab_content_script",
    description: "Evaluate JavaScript in the page context",
    params: [
      {
        name: "code",
        type: "string",
        required: false,
        description: "JavaScript code to evaluate",
      },
    ],
    returnType: "unknown",
    returnDoc: "Result of evaluated JavaScript",
    errorCode: "E_CONTENT_SCRIPT",
    errorCategory: "content_script",
  },
  (params) => {
    const { code = "" } = params;
    if (typeof code !== "string") {
      throw new Error("evaluate requires a string argument");
    }
    // Use new Function to avoid capturing local scope (marginally safer than eval)
    return new Function(code)();
  },
);

register(
  "page_back",
  z.object({}),
  z.boolean(),
  {
    namespace: "page",
    name: "back",
    publicName: "page.back",
    localName: "back",
    source: "content_script",
    transport: "active_tab_content_script",
    description: "Navigate back in history",
    params: [],
    returnType: "boolean",
    returnDoc: "true if navigated",
    errorCode: "E_CONTENT_SCRIPT",
    errorCategory: "content_script",
  },
  () => {
    window.history.back();
    return true;
  },
);

register(
  "page_ping",
  z.object({}),
  z.object({ ok: z.literal(true) }),
  {
    namespace: "page",
    name: "ping",
    publicName: "page.ping",
    localName: "ping",
    source: "content_script",
    transport: "active_tab_content_script",
    description: "Ping the content script",
    params: [],
    returnType: "object",
    returnDoc: "Ping response",
    errorCode: "E_CONTENT_SCRIPT",
    errorCategory: "content_script",
  },
  () => {
    return { ok: true };
  },
);

register(
  "page_snapshot",
  z.object({ max_nodes: z.number().optional() }),
  z.object({
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
  }),
  {
    namespace: "page",
    name: "snapshot",
    publicName: "page.snapshot",
    localName: "snapshot",
    source: "content_script",
    transport: "active_tab_content_script",
    description: "Take a DOM snapshot",
    params: [
      {
        name: "max_nodes",
        type: "number",
        required: false,
        description: "Maximum number of nodes to include",
      },
    ],
    returnType: "object",
    returnDoc: "DOM snapshot result",
    errorCode: "E_CONTENT_SCRIPT",
    errorCategory: "content_script",
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
  z.object({
    url: z.string(),
    method: z.string().optional(),
    headers: z.record(z.unknown()).optional(),
    body: z.unknown().optional(),
    timeout: z.number().optional(),
  }),
  z.object({
    status: z.number(),
    ok: z.boolean(),
    headers: z.record(z.string()),
    body: z.string(),
  }),
  {
    namespace: "page",
    name: "fetch",
    publicName: "page.fetch",
    localName: "fetch",
    source: "content_script",
    transport: "active_tab_content_script",
    description: "Fetch a URL from the page context",
    params: [
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
        type: "any",
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
    returnType: "object",
    returnDoc: "HTTP response",
    errorCode: "E_CONTENT_SCRIPT",
    errorCategory: "content_script",
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
    const timeoutId = setTimeout(() => controller.abort(), timeout || 30_000);
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
      clearTimeout(timeoutId);
      const text = await resp.text();
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

register(
  "__content_script_ping",
  z.object({}),
  z.object({
    ready: z.literal(true),
    version: z.string(),
    toolsHash: z.string(),
  }),
  {
    namespace: "__internal",
    name: "ping",
    publicName: "__internal.content_script.ping",
    localName: "__ping",
    source: "content_script",
    transport: "active_tab_content_script",
    description: "Ping the content script for readiness",
    params: [],
    returnType: "object",
    returnDoc: "Readiness metadata with version and tools hash",
    errorCode: "E_CONTENT_SCRIPT",
    errorCategory: "content_script",
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
  z.object({}),
  z.array(z.unknown()),
  {
    namespace: "__internal",
    name: "tool_docs",
    publicName: "__internal.content_script.tool_docs",
    localName: "__tool_docs",
    source: "content_script",
    transport: "active_tab_content_script",
    description: "List all content script tool documentation",
    params: [],
    returnType: "array",
    returnDoc: "Array of ToolDoc for all registered content script tools",
    errorCode: "E_CONTENT_SCRIPT",
    errorCategory: "content_script",
  },
  () => {
    return listLocalToolDocs();
  },
);

// ─── Message listener with MANDATORY try-catch ───────────────────

chrome.runtime.onMessage.addListener((request, _sender, sendResponse) => {
  // Validate PiccoloToolRequest envelope
  if (
    typeof request !== "object" ||
    request === null ||
    (request as Record<string, unknown>).channel !== "piccolo-tool" ||
    (request as Record<string, unknown>).version !== 1
  ) {
    const reqId =
      typeof (request as Record<string, unknown>)?.requestId === "string"
        ? (request as Record<string, unknown>).requestId
        : "unknown";
    sendResponse({
      channel: "piccolo-tool",
      version: 1,
      requestId: reqId,
      error:
        "Malformed message: expected PiccoloToolRequest envelope with channel='piccolo-tool' and version=1",
    });
    return true;
  }

  const { requestId, action, params } = request as Record<string, unknown>;

  if (typeof action !== "string" || typeof requestId !== "string") {
    sendResponse({
      channel: "piccolo-tool",
      version: 1,
      requestId: (requestId as string) || "unknown",
      error: "Malformed message: expected action and requestId strings",
    });
    return true;
  }

  logger.debug("[content-script] received action:", action, "params:", params);

  const tool = csRegistry.get(action);
  if (!tool) {
    logger.debug("[content-script] no handler for action:", action);
    sendResponse({
      channel: "piccolo-tool",
      version: 1,
      requestId,
      error: `Unknown content script action: ${action}`,
    });
    return true;
  }

  const parsed = tool.params.safeParse(params ?? {});
  if (!parsed.success) {
    logger.debug(
      "[content-script] invalid params for action:",
      action,
      parsed.error.message,
    );
    sendResponse({
      channel: "piccolo-tool",
      version: 1,
      requestId,
      error: `Invalid params: ${parsed.error.message}`,
    });
    return true;
  }

  // ====== MANDATORY TRY-CATCH ======
  try {
    const result = tool.handler(parsed.data);
    if (result instanceof Promise) {
      result
        .then((value) => {
          logger.debug(
            "[content-script] async response for",
            action,
            ":",
            typeof value,
          );
          sendResponse({
            channel: "piccolo-tool",
            version: 1,
            requestId,
            value,
          });
        })
        .catch((err: unknown) => {
          const msg = err instanceof Error ? err.message : String(err);
          logger.error(`[ContentScript] ${action} failed:`, msg);
          sendResponse({
            channel: "piccolo-tool",
            version: 1,
            requestId,
            error: msg,
          });
        });
      return true;
    }
    logger.debug(
      "[content-script] sync response for",
      action,
      ":",
      typeof result,
    );
    sendResponse({
      channel: "piccolo-tool",
      version: 1,
      requestId,
      value: result,
    });
    return false;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error(`[ContentScript] ${action} failed:`, msg);
    sendResponse({
      channel: "piccolo-tool",
      version: 1,
      requestId,
      error: msg,
    });
    return false;
  }
});
