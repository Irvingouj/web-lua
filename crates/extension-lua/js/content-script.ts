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

interface ContentScriptTool<P, R> {
  action: string;
  params: z.ZodType<P>;
  handler: (params: P) => R | Promise<R>;
  description: string;
}

export const csRegistry = new Map<
  string,
  ContentScriptTool<unknown, unknown>
>();

export function registerContentScriptTool<P, R>(tool: ContentScriptTool<P, R>) {
  csRegistry.set(tool.action, tool as ContentScriptTool<unknown, unknown>);
}

// ─── Register all handlers ───────────────────────────────────────

registerContentScriptTool({
  action: "click",
  description: "Click a DOM element",
  params: z.object({
    refId: z.string().optional(),
    label: z.string().optional(),
  }),
  handler: (params) => {
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
});

registerContentScriptTool({
  action: "fill",
  description: "Fill a DOM input",
  params: z.object({
    refId: z.string().optional(),
    label: z.string().optional(),
    value: z.string().optional(),
  }),
  handler: (params) => {
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
});

registerContentScriptTool({
  action: "type",
  description: "Type text into a DOM input",
  params: z.object({
    refId: z.string().optional(),
    label: z.string().optional(),
    text: z.string().optional(),
  }),
  handler: (params) => {
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
});

registerContentScriptTool({
  action: "append",
  description: "Append text to a DOM input",
  params: z.object({
    refId: z.string().optional(),
    label: z.string().optional(),
    text: z.string().optional(),
  }),
  handler: (params) => {
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
});

registerContentScriptTool({
  action: "press",
  description: "Press a keyboard key",
  params: z.object({ key: z.string() }),
  handler: (params) => {
    const { key = "" } = params;
    const evDown = new KeyboardEvent("keydown", { key, bubbles: true });
    document.dispatchEvent(evDown);
    const evUp = new KeyboardEvent("keyup", { key, bubbles: true });
    document.dispatchEvent(evUp);
    return null;
  },
});

registerContentScriptTool({
  action: "select",
  description: "Select an option in a DOM select",
  params: z.object({
    refId: z.string().optional(),
    value: z.string().optional(),
  }),
  handler: (params) => {
    const { refId, value = "" } = params;
    const el = refId ? getElementByRefId(refId) : null;
    if (!el) throw new Error(`Element ${refId} not found`);
    if (el instanceof HTMLSelectElement) {
      el.value = value;
      return null;
    }
    throw new Error("Element is not a select");
  },
});

registerContentScriptTool({
  action: "check",
  description: "Check or uncheck a checkbox",
  params: z.object({
    refId: z.string().optional(),
    checked: z.boolean().optional(),
  }),
  handler: (params) => {
    const { refId, checked = true } = params;
    const el = refId ? getElementByRefId(refId) : null;
    if (!el) throw new Error(`Element ${refId} not found`);
    if (el instanceof HTMLInputElement && el.type === "checkbox") {
      el.checked = checked;
      return null;
    }
    throw new Error("Element is not a checkbox");
  },
});

registerContentScriptTool({
  action: "hover",
  description: "Hover over a DOM element",
  params: z.object({ refId: z.string().optional() }),
  handler: (params) => {
    const { refId } = params;
    const el = refId ? getElementByRefId(refId) : null;
    if (!el) throw new Error(`Element ${refId} not found`);
    const ev = new MouseEvent("mouseenter", { bubbles: true });
    el.dispatchEvent(ev);
    return null;
  },
});

registerContentScriptTool({
  action: "unhover",
  description: "Unhover from the document body",
  params: z.object({}),
  handler: () => {
    const ev = new MouseEvent("mouseleave", { bubbles: true });
    document.body.dispatchEvent(ev);
    return null;
  },
});

registerContentScriptTool({
  action: "scroll",
  description: "Scroll the page or an element",
  params: z.object({
    direction: z.string().optional(),
    amount: z.number().optional(),
    refId: z.string().optional(),
  }),
  handler: (params) => {
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
});

registerContentScriptTool({
  action: "dblclick",
  description: "Double-click a DOM element",
  params: z.object({ refId: z.string().optional() }),
  handler: (params) => {
    const { refId } = params;
    const el = refId ? getElementByRefId(refId) : null;
    if (!el) throw new Error(`Element ${refId} not found`);
    const ev = new MouseEvent("dblclick", { bubbles: true });
    el.dispatchEvent(ev);
    return null;
  },
});

registerContentScriptTool({
  action: "forward",
  description: "Navigate forward in history",
  params: z.object({}),
  handler: () => {
    window.history.forward();
    return true;
  },
});

registerContentScriptTool({
  action: "reload",
  description: "Reload the page",
  params: z.object({}),
  handler: () => {
    window.location.reload();
    return true;
  },
});

registerContentScriptTool({
  action: "scrollTo",
  description: "Scroll to coordinates or an element",
  params: z.object({
    refId: z.string().optional(),
    x: z.number().optional(),
    y: z.number().optional(),
  }),
  handler: (params) => {
    const { refId, x = 0, y = 0 } = params;
    if (refId) {
      const el = getElementByRefId(refId);
      el.scrollIntoView({ behavior: "smooth" });
      return true;
    }
    window.scrollTo({ top: y, left: x, behavior: "smooth" });
    return true;
  },
});

registerContentScriptTool({
  action: "evaluate",
  description: "Evaluate JavaScript in the page context",
  params: z.object({ code: z.string().optional() }),
  handler: (params) => {
    const { code = "" } = params;
    if (typeof code !== "string") {
      throw new Error("evaluate requires a string argument");
    }
    // Use new Function to avoid capturing local scope (marginally safer than eval)
    return new Function(code)();
  },
});

registerContentScriptTool({
  action: "back",
  description: "Navigate back in history",
  params: z.object({}),
  handler: () => {
    window.history.back();
    return true;
  },
});

registerContentScriptTool({
  action: "ping",
  description: "Ping the content script",
  params: z.object({}),
  handler: () => {
    return { ok: true };
  },
});

registerContentScriptTool({
  action: "snapshot",
  description: "Take a DOM snapshot",
  params: z.object({ max_nodes: z.number().optional() }),
  handler: async (params) => {
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
});

registerContentScriptTool({
  action: "fetch",
  description: "Fetch a URL from the page context",
  params: z.object({
    url: z.string(),
    method: z.string().optional(),
    headers: z.record(z.unknown()).optional(),
    body: z.unknown().optional(),
    timeout: z.number().optional(),
  }),
  handler: async (params) => {
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
});

// ─── Message listener with MANDATORY try-catch ───────────────────

chrome.runtime.onMessage.addListener((request, _sender, sendResponse) => {
  const action = (request as Record<string, unknown>)?.action;
  logger.debug(
    "[content-script] received action:",
    action,
    "params:",
    (request as Record<string, unknown>)?.params,
  );

  const tool = csRegistry.get(action as string);
  if (!tool) {
    logger.debug("[content-script] no handler for action:", action);
    sendResponse({
      ok: false,
      error: `Unknown content script action: ${action}`,
    });
    return true;
  }

  const parsed = tool.params.safeParse(
    (request as Record<string, unknown>)?.params ?? {},
  );
  if (!parsed.success) {
    logger.debug(
      "[content-script] invalid params for action:",
      action,
      parsed.error.message,
    );
    sendResponse({
      ok: false,
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
          sendResponse(value);
        })
        .catch((err: unknown) => {
          const msg = err instanceof Error ? err.message : String(err);
          logger.error(`[ContentScript] ${action} failed:`, msg);
          sendResponse({ ok: false, error: msg });
        });
      return true;
    }
    logger.debug(
      "[content-script] sync response for",
      action,
      ":",
      typeof result,
    );
    sendResponse(result);
    return false;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error(`[ContentScript] ${action} failed:`, msg);
    sendResponse({ ok: false, error: msg });
    return false;
  }
});
