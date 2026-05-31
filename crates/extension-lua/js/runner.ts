/// <reference types="chrome" />
// Main-thread command executor for extension-lua runner
// Handles all commands relayed from the extension Worker.

import {
  collectDocument,
  formatSnapshot,
  init as initDomSnapshot,
} from "@pi-oxide/dom-semantic-tree";

import { z } from "zod";
import { getContentScriptAction } from "./content-script-bridge.js";
import {
  type AsyncError,
  type AsyncResponse,
  type Command,
  dispatchTool,
  getTool,
  registerTool,
} from "./tool-registry.js";

let domSnapshotReady: Promise<void> | null = null;

function ensureDomSnapshot(): Promise<void> {
  if (!domSnapshotReady) {
    domSnapshotReady = initDomSnapshot();
  }
  return domSnapshotReady;
}

// ─── Generated types from Rust ts-rs ───────────────────────────

import type {
  DomSnapshotParams,
  FetchDomParams,
  FetchParams,
  PageExtractParams,
  SleepParams,
  StorageDeleteParams,
  StorageGetParams,
  StorageSetParams,
} from "./generated.js";

import {
  BookmarksCreateParamsSchema,
  BookmarksDeleteParamsSchema,
  BookmarksSearchParamsSchema,
  ClipboardReadParamsSchema,
  ClipboardWriteParamsSchema,
  CookiesDeleteParamsSchema,
  CookiesGetParamsSchema,
  CookiesListParamsSchema,
  CookiesSetParamsSchema,
  FetchDomParamsSchema,
  FetchParamsSchema,
  HistoryDeleteParamsSchema,
  HistorySearchParamsSchema,
  NotificationsClearParamsSchema,
  NotificationsCreateParamsSchema,
  PageActiveTabParamsSchema,
  PageAppendParamsSchema,
  PageBackParamsSchema,
  PageCheckParamsSchema,
  PageClickParamsSchema,
  PageCloseParamsSchema,
  PageDblClickParamsSchema,
  PageFillParamsSchema,
  PageFindParamsSchema,
  PageForwardParamsSchema,
  PageGotoParamsSchema,
  PageHoverParamsSchema,
  PagePressParamsSchema,
  PageReloadParamsSchema,
  PageScrollParamsSchema,
  PageScrollToParamsSchema,
  PageSelectParamsSchema,
  PageTypeParamsSchema,
  PageUnhoverParamsSchema,
  PageWaitForParamsSchema,
  PageWaitParamsSchema,
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
  SleepParamsSchema,
  StorageDeleteParamsSchema,
  StorageGetParamsSchema,
  StorageListParamsSchema,
  StorageSetParamsSchema,
  TabActivateParamsSchema,
  TabBackParamsSchema,
  TabCheckParamsSchema,
  TabClickParamsSchema,
  TabCloseParamsSchema,
  TabCreateParamsSchema,
  TabDblClickParamsSchema,
  TabFillParamsSchema,
  TabHoverParamsSchema,
  TabPressParamsSchema,
  TabQueryParamsSchema,
  TabScrollParamsSchema,
  TabSelectParamsSchema,
  TabTypeParamsSchema,
  TabUnhoverParamsSchema,
  TabWaitForLoadParamsSchema,
} from "./schemas.js";

declare global {
  interface Window {
    __hostHandlers?: Record<string, HostHandler>;
  }
}

// ─── Types ─────────────────────────────────────────────────────

type HostHandler<T = unknown, R = unknown> = (params: T) => Promise<R>;

// ─── Shared response types ─────────────────────────────────────
// AsyncResponse, AsyncError, and Command are imported from tool-registry.js

type FetchValue = {
  status: number;
  ok: boolean;
  headers: Record<string, string>;
  body: string;
};

type FetchDomValue = {
  status: number;
  ok: boolean;
  headers: Record<string, string>;
  body: string;
  matches: Array<{ tag: string; text: string }>;
};

type DomSnapshotValue = {
  data: unknown;
  text: string;
};

type TabMessage = {
  action: string;
  params: Record<string, unknown>;
};

type DomNode = {
  refId: number;
  role: string;
  tag: string;
  name?: string;
};

type SnapshotFormat = "compact-text" | "json" | "json-pretty";

type DomFormatParams = {
  snapshot: unknown;
  format?: SnapshotFormat;
};

// ─── Host handler registry ─────────────────────────────────────

const hostHandlers: Record<string, HostHandler> = {};

export function registerHostHandler<T, R>(
  action: string,
  handler: (params: T) => Promise<R>,
) {
  hostHandlers[action] = handler as HostHandler;
}

export function registerHostHandlers(handlers: Record<string, HostHandler>) {
  Object.assign(hostHandlers, handlers);
}

// ─── Typed params helper ───────────────────────────────────────

function expectParams<T>(params: unknown): T {
  if (typeof params !== "object" || params === null || Array.isArray(params)) {
    throw new Error(
      `Expected params object, got ${params === null ? "null" : Array.isArray(params) ? "array" : typeof params}`,
    );
  }
  return params as T;
}

// ─── Helpers for extracting values from unknown params ─────────

function asRecord(params: unknown): Record<string, unknown> {
  return typeof params === "object" && params !== null && !Array.isArray(params)
    ? (params as Record<string, unknown>)
    : {};
}

function extractTabId(params: unknown): number | null {
  if (Array.isArray(params)) {
    const first = params[0];
    if (typeof first === "number") return first;
    const firstObj = asRecord(first);
    if (typeof firstObj.id === "number") return firstObj.id;
    if (typeof firstObj.tabId === "number") return firstObj.tabId;
    if (typeof firstObj.tab_id === "number") return firstObj.tab_id;
    return null;
  }
  if (typeof params === "number") return params;
  const obj = asRecord(params);
  if (typeof obj.id === "number") return obj.id;
  const tabId = obj.tabId ?? obj.tab_id;
  return typeof tabId === "number" ? tabId : null;
}

function extractArg<T>(params: unknown, index: number, fallback?: T): T {
  if (Array.isArray(params)) return (params[index] ?? fallback) as T;
  if (typeof params === "object" && params !== null) return fallback as T;
  if (index === 0) return params as T;
  return fallback as T;
}

function _getStringParam(params: unknown, key: string): string {
  const val = asRecord(params)[key];
  return typeof val === "string" ? val : "";
}

function _getNumberParam(
  params: unknown,
  key: string,
  fallback: number,
): number {
  const val = asRecord(params)[key];
  return typeof val === "number" ? val : fallback;
}

// ─── Main command dispatcher ─────────────────────────────────────

async function legacyExecuteMainThreadCommand(
  command: Command,
): Promise<AsyncResponse> {
  const params = command.params;
  switch (command.action) {
    case "page_url": {
      const activeTab = getActiveTabId();
      if (activeTab === null) {
        return {
          ok: false,
          error: { message: "No active tab", code: "E_NO_TAB" },
        };
      }
      return executeInTab(activeTab, () => window.location.href, []);
    }
    case "page_title": {
      const activeTab = getActiveTabId();
      if (activeTab === null) {
        return {
          ok: false,
          error: { message: "No active tab", code: "E_NO_TAB" },
        };
      }
      return executeInTab(activeTab, () => document.title, []);
    }

    case "page_extract": {
      const activeTab = getActiveTabId();
      if (activeTab === null) {
        return {
          ok: false,
          error: { message: "No active tab", code: "E_NO_TAB" },
        };
      }
      const { fields, max_text, max_headings, max_links } =
        expectParams<PageExtractParams>(params);
      const maxTextNum = Number(max_text ?? 500);
      const maxHeadingsNum = Number(max_headings ?? 200);
      const maxLinksNum = Number(max_links ?? 100);
      return executeInTab(
        activeTab,
        (
          fieldsArg: unknown,
          maxTextArg: unknown,
          maxHeadingsArg: unknown,
          maxLinksArg: unknown,
        ) => {
          const fieldList = Array.isArray(fieldsArg) ? fieldsArg : [];
          const maxText = typeof maxTextArg === "number" ? maxTextArg : 500;
          const maxHeadings =
            typeof maxHeadingsArg === "number" ? maxHeadingsArg : 200;
          const maxLinks = typeof maxLinksArg === "number" ? maxLinksArg : 100;
          const result: Record<string, unknown> = {};
          for (const field of fieldList) {
            switch (field) {
              case "title":
                result.title = document.title;
                break;
              case "url":
                result.url = window.location.href;
                break;
              case "headings": {
                const headings = Array.from(
                  document.querySelectorAll("h1, h2, h3, h4, h5, h6"),
                );
                result.headings = headings.map((el) => ({
                  tag: el.tagName,
                  text: el.textContent?.trim().slice(0, maxHeadings) || "",
                }));
                break;
              }
              case "links": {
                const links = Array.from(document.querySelectorAll("a[href]"));
                result.links = links.map((el) => ({
                  href: el.getAttribute("href"),
                  text: el.textContent?.trim().slice(0, maxLinks) || "",
                }));
                break;
              }
              case "text":
                result.text =
                  document.body?.textContent?.trim().slice(0, maxText) || "";
                break;
            }
          }
          return result;
        },
        [fields, maxTextNum, maxHeadingsNum, maxLinksNum],
      );
    }
    case "page_snapshot":
    case "page_snapshot_text": {
      const activeTab = getActiveTabId();
      if (activeTab === null) {
        return {
          ok: false,
          error: { message: "No active tab", code: "E_NO_TAB" },
        };
      }
      const obj = asRecord(params);
      const maxNodes = typeof obj.max_nodes === "number" ? obj.max_nodes : 500;
      const result = await executeInTab(
        activeTab,
        (maxNodesArg: unknown) => {
          const maxNodesNum =
            typeof maxNodesArg === "number" ? maxNodesArg : 500;
          // inlineSnapshot is injected into content-script.ts
          // but executeInTab runs in MAIN world where it may not exist.
          // We inline a minimal snapshot here.
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
            if (style.display === "none" || style.visibility === "hidden")
              return false;
            return true;
          }
          type DomNode = {
            refId: number;
            role: string;
            tag: string;
            name?: string;
          };
          const nodes: DomNode[] = [];
          const lines: string[] = [];
          let nextRefId = 1;
          function traverse(el: Element, depth: number) {
            if (nodes.length >= maxNodesNum) return;
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
              const node: DomNode = { refId, role, tag };
              if (name) node.name = name;
              nodes.push(node);
              const indent = "  ".repeat(depth);
              const parts: string[] = [`${indent}- ${role}`];
              if (name) parts.push(`"${name.replace(/"/g, '\\"')}"`);
              parts.push(`[ref=${refId}]`);
              lines.push(parts.join(" "));
              currentDepth = depth + 1;
            }
            for (const child of el.children) {
              traverse(child, currentDepth);
            }
          }
          if (document.body) traverse(document.body, 0);
          const header = [
            `URL: ${window.location.href}`,
            `Title: ${document.title}`,
            "",
          ];
          const text = header.concat(lines).join("\n");
          return {
            text,
            nodes,
            url: window.location.href,
            title: document.title,
            viewport: { width: window.innerWidth, height: window.innerHeight },
          };
        },
        [maxNodes],
      );
      if (result.ok && result.value && typeof result.value === "object") {
        const val = result.value as Record<string, unknown>;
        return { ok: true, value: val.text };
      }
      return {
        ok: false,
        error: { message: "Failed to get page snapshot", code: "E_SNAPSHOT" },
      };
    }
    case "page_snapshot_data": {
      const activeTab = getActiveTabId();
      if (activeTab === null) {
        return {
          ok: false,
          error: { message: "No active tab", code: "E_NO_TAB" },
        };
      }
      const obj = asRecord(params);
      const maxNodes = typeof obj.max_nodes === "number" ? obj.max_nodes : 500;
      return executeInTab(
        activeTab,
        (maxNodesArg: unknown) => {
          const maxNodesNum =
            typeof maxNodesArg === "number" ? maxNodesArg : 500;
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
            if (style.display === "none" || style.visibility === "hidden")
              return false;
            return true;
          }
          type DomNode = {
            refId: number;
            role: string;
            tag: string;
            name?: string;
          };
          const nodes: DomNode[] = [];
          const lines: string[] = [];
          let nextRefId = 1;
          function traverse(el: Element, depth: number) {
            if (nodes.length >= maxNodesNum) return;
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
              const node: DomNode = { refId, role, tag };
              if (name) node.name = name;
              nodes.push(node);
              const indent = "  ".repeat(depth);
              const parts: string[] = [`${indent}- ${role}`];
              if (name) parts.push(`"${name.replace(/"/g, '\\"')}"`);
              parts.push(`[ref=${refId}]`);
              lines.push(parts.join(" "));
              currentDepth = depth + 1;
            }
            for (const child of el.children) {
              traverse(child, currentDepth);
            }
          }
          if (document.body) traverse(document.body, 0);
          const header = [
            `URL: ${window.location.href}`,
            `Title: ${document.title}`,
            "",
          ];
          const text = header.concat(lines).join("\n");
          return {
            text,
            nodes,
            url: window.location.href,
            title: document.title,
            viewport: {
              width: window.innerWidth,
              height: window.innerHeight,
            },
            version: "1.0",
          };
        },
        [maxNodes],
      );
    }
    case "dom_snapshot": {
      return handleDomSnapshot(expectParams<DomSnapshotParams>(params));
    }
    case "dom_format": {
      return handleDomFormat(expectParams<DomFormatParams>(params));
    }
    case "tab_execute_script":
      return handleChromeApi({
        action: "chrome_scripting_executeScript",
        params,
      });
    case "tab_scroll_to": {
      const tabId = extractTabId(params);
      const obj = asRecord(params);
      const x = Number(extractArg(params, 1, obj.x ?? 0));
      const y = Number(extractArg(params, 2, obj.y ?? 0));
      const refId = extractArg(params, 3, obj.refId ?? obj.ref_id);
      return sendBridgeMessageToTab(tabId, "tab_scroll_to", {
        x,
        y,
        refId: refId ? String(refId) : undefined,
      });
    }
    case "tab_evaluate": {
      const tabId = extractTabId(params);
      const obj = asRecord(params);
      const script = extractArg(
        params,
        1,
        obj.script ?? obj.code ?? obj.js ?? "",
      );
      const targetTab = typeof tabId === "number" ? tabId : getActiveTabId();
      if (targetTab === null) {
        return {
          ok: false,
          error: {
            message: "No active tab available",
            code: "E_NO_TAB",
            category: "resource",
          },
        };
      }
      const codeStr = String(script);
      const evalFunc = (code: string) => {
        // biome-ignore lint/security/noGlobalEval: Chrome executeScript context only supports eval, not new Function()
        return eval(code);
      };
      try {
        const results = await chrome.scripting.executeScript({
          target: { tabId: targetTab },
          func: evalFunc,
          args: [codeStr],
          world: "MAIN",
        });
        if (results?.[0]) {
          const first = results[0] as (typeof results)[0] & { error?: unknown };
          if (first.error) {
            return {
              ok: false,
              error: {
                message: String(first.error),
                code: "E_SCRIPT_EXECUTION",
                category: "script",
              },
            };
          }
          return { ok: true, value: first.result };
        }
        return { ok: true, value: null };
      } catch (err: unknown) {
        return normalizeChromeError(err);
      }
    }
    case "tab_fetch": {
      const tabId = extractTabId(params);
      const obj = asRecord(params);
      const url = extractArg(params, 1, obj.url);
      const opts = extractArg(params, 2, obj);
      const optsRec = asRecord(opts);
      const method = (optsRec.method as string) ?? "GET";
      const headers = optsRec.headers ?? {};
      const body = optsRec.body ?? null;
      const timeout =
        typeof optsRec.timeout === "number" ? optsRec.timeout : 30_000;
      return executeInTab(
        tabId,
        (
          urlArg: unknown,
          methodArg: unknown,
          headersArg: unknown,
          bodyArg: unknown,
          timeoutArg: unknown,
        ) => {
          const urlStr = typeof urlArg === "string" ? urlArg : "";
          const methodStr = typeof methodArg === "string" ? methodArg : "GET";
          const headersRec =
            typeof headersArg === "object" && headersArg !== null
              ? (headersArg as Record<string, string>)
              : {};
          const bodyStr =
            bodyArg !== null && bodyArg !== undefined ? String(bodyArg) : null;
          const timeoutNum =
            typeof timeoutArg === "number" ? timeoutArg : 30_000;

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
              clearTimeout(timeoutId);
              const text = await resp.text();
              return {
                status: resp.status,
                ok: resp.ok,
                headers: Object.fromEntries(resp.headers.entries()),
                body: text,
              };
            })
            .catch((e) => {
              clearTimeout(timeoutId);
              throw e;
            });
        },
        [url, method, headers, body, timeout],
      );
    }
    case "tab_snapshot": {
      const tabId = extractTabId(params);
      const obj = asRecord(params);
      const opts = extractArg(params, 1, obj.options ?? obj);
      const optRec = asRecord(opts);
      const maxNodes =
        typeof optRec.max_nodes === "number" ? optRec.max_nodes : 500;
      const result = await executeInTab(
        tabId,
        (maxNodesArg: unknown) => {
          const maxNodesNum =
            typeof maxNodesArg === "number" ? maxNodesArg : 500;

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
            if (style.display === "none" || style.visibility === "hidden")
              return false;
            return true;
          }

          function inlineSnapshot(maxNodes: number) {
            let nextRefId = 1;
            const nodes: DomNode[] = [];
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
                const node: DomNode = { refId, role, tag };
                if (name) node.name = name;
                nodes.push(node);

                const indent = "  ".repeat(depth);
                const parts: string[] = [`${indent}- ${role}`];
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

          return inlineSnapshot(maxNodesNum);
        },
        [maxNodes],
      );
      if (result.ok && result.value && typeof result.value === "object") {
        return {
          ok: true,
          value: (result.value as Record<string, unknown>).text,
        };
      }
      return result;
    }
    case "tab_snapshot_text": {
      const tabId = extractTabId(params);
      const obj = asRecord(params);
      const opts = extractArg(params, 1, obj.options ?? obj);
      const optRec = asRecord(opts);
      const maxNodes =
        typeof optRec.max_nodes === "number" ? optRec.max_nodes : 500;
      const result = await executeInTab(
        tabId,
        (maxNodesArg: unknown) => {
          const maxNodesNum =
            typeof maxNodesArg === "number" ? maxNodesArg : 500;

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
            if (style.display === "none" || style.visibility === "hidden")
              return false;
            return true;
          }

          function inlineSnapshot(maxNodes: number) {
            let nextRefId = 1;
            const nodes: DomNode[] = [];
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
                const node: DomNode = { refId, role, tag };
                if (name) node.name = name;
                nodes.push(node);

                const indent = "  ".repeat(depth);
                const parts: string[] = [`${indent}- ${role}`];
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

          return inlineSnapshot(maxNodesNum);
        },
        [maxNodes],
      );
      if (result.ok && result.value && typeof result.value === "object") {
        return {
          ok: true,
          value: (result.value as Record<string, unknown>).text,
        };
      }
      return result;
    }
    case "tab_snapshot_data": {
      const tabId = extractTabId(params);
      const obj = asRecord(params);
      const opts = extractArg(params, 1, obj.options ?? obj);
      const optRec = asRecord(opts);
      const maxNodes =
        typeof optRec.max_nodes === "number" ? optRec.max_nodes : 500;
      return executeInTab(
        tabId,
        (maxNodesArg: unknown) => {
          const maxNodesNum =
            typeof maxNodesArg === "number" ? maxNodesArg : 500;

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
            if (style.display === "none" || style.visibility === "hidden")
              return false;
            return true;
          }

          function inlineSnapshot(maxNodes: number) {
            let nextRefId = 1;
            const nodes: DomNode[] = [];
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
                const node: DomNode = { refId, role, tag };
                if (name) node.name = name;
                nodes.push(node);

                const indent = "  ".repeat(depth);
                const parts: string[] = [`${indent}- ${role}`];
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
              elements: nodes,
              url: window.location.href,
              title: document.title,
              viewport: {
                width: window.innerWidth,
                height: window.innerHeight,
              },
            };
          }

          return inlineSnapshot(maxNodesNum);
        },
        [maxNodes],
      );
    }
    default:
      if (command.action.startsWith("chrome_")) {
        return handleChromeApi(command);
      }
      if (command.action.startsWith("host_")) {
        return handleHostCallAction(command.action.slice(5), params);
      }
      return {
        ok: false,
        error: {
          message: `Unknown main-thread action: ${command.action}`,
          code: "EUNKNOWN",
          category: "unknown",
        },
      };
  }
}

function normalizeParams(action: string, params: unknown): unknown {
  if (typeof params === "number" || typeof params === "bigint") {
    if (
      action === "tab_back" ||
      action === "tab_unhover" ||
      action === "tab_wait_for_load" ||
      action === "tab_scroll"
    ) {
      return { tabId: params };
    }
  }
  if (Array.isArray(params)) {
    switch (action) {
      case "tab_click":
        return { tabId: params[0], refId: params[1] };
      case "tab_fill":
        return { tabId: params[0], refId: params[1], value: params[2] };
      case "tab_type":
        return { tabId: params[0], refId: params[1], text: params[2] };
      case "tab_press":
        return { tabId: params[0], key: params[1] };
      case "tab_select":
        return { tabId: params[0], refId: params[1], value: params[2] };
      case "tab_check":
        return {
          tabId: params[0],
          refId: params[1],
          checked: params[2] ?? true,
        };
      case "tab_hover":
        return { tabId: params[0], refId: params[1] };
      case "tab_unhover":
        return { tabId: params[0] };
      case "tab_scroll":
        return {
          tabId: params[0],
          direction: params[1] ?? "down",
          amount: params[2] ?? 300,
        };
      case "tab_dblclick":
        return { tabId: params[0], refId: params[1] };
      case "tab_back":
        return { tabId: params[0] };
      case "tab_wait_for_load":
        return { tabId: params[0], timeout: params[1] ?? 30000n };
    }
  }
  return params;
}

export async function executeMainThreadCommand(
  command: Command,
): Promise<AsyncResponse> {
  const tool = getTool(command.action);
  if (tool) {
    const normalizedParams = normalizeParams(command.action, command.params);
    return dispatchTool(command.action, normalizedParams);
  }
  return legacyExecuteMainThreadCommand(command);
}

// ─── Fetch helpers ───────────────────────────────────────────────

function formatFetchError(
  err: unknown,
  timeoutMs: number,
): AsyncResponse<never> {
  if (err instanceof Error && err.name === "AbortError") {
    return {
      ok: false,
      error: {
        message: `Request timed out after ${timeoutMs}ms`,
        code: "ETIMEDOUT",
        category: "timeout",
      },
    };
  }
  const message = err instanceof Error ? err.message : String(err);
  return {
    ok: false,
    error: {
      message: message || String(err),
      code: "EUNKNOWN",
      category: "network",
    },
  };
}

async function performFetch(
  url: string,
  init: RequestInit,
  timeoutMs: number,
): Promise<{
  response: Response;
  body: string;
  headers: Record<string, string>;
}> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  const response = await fetch(url, { ...init, signal: controller.signal });
  clearTimeout(timeoutId);
  const body = await response.text();
  const headers: Record<string, string> = {};
  response.headers.forEach((value, key) => {
    headers[key] = value;
  });
  return { response, body, headers };
}

// ─── Fetch handler ───────────────────────────────────────────────

async function handleFetch(
  params: FetchParams,
): Promise<AsyncResponse<FetchValue>> {
  const { url, method, headers, body, timeout } = params;
  const timeoutMs = Number(timeout) || 30_000;
  try {
    const {
      response,
      body: responseBody,
      headers: responseHeaders,
    } = await performFetch(
      url,
      {
        method: method || "GET",
        headers:
          typeof headers === "object" && headers !== null
            ? (headers as Record<string, string>)
            : {},
        body:
          body !== null && body !== undefined
            ? typeof body === "string"
              ? body
              : String(body)
            : undefined,
      },
      timeoutMs,
    );
    return {
      ok: true,
      value: {
        status: response.status,
        ok: response.ok,
        headers: responseHeaders,
        body: responseBody,
      },
    };
  } catch (err) {
    return formatFetchError(err, timeoutMs);
  }
}

async function handleFetchDom(
  params: FetchDomParams,
): Promise<AsyncResponse<FetchDomValue>> {
  const { url, selector, max_text } = params;
  const maxTextNum = Number(max_text ?? 500);
  try {
    const {
      response,
      body: responseBody,
      headers: responseHeaders,
    } = await performFetch(url, {}, 30_000);
    const parser = new DOMParser();
    const doc = parser.parseFromString(responseBody, "text/html");
    const matches: Array<{ tag: string; text: string }> = [];
    if (selector) {
      const elements = doc.querySelectorAll(selector);
      elements.forEach((el) => {
        const text = el.textContent?.trim().slice(0, maxTextNum) || "";
        matches.push({ tag: el.tagName.toLowerCase(), text });
      });
    }
    return {
      ok: true,
      value: {
        status: response.status,
        ok: response.ok,
        headers: responseHeaders,
        body: responseBody,
        matches,
      },
    };
  } catch (err) {
    return formatFetchError(err, 30_000);
  }
}

// ─── Storage handlers ────────────────────────────────────────────

async function handleStorageGet(
  params: StorageGetParams,
): Promise<string | null> {
  return localStorage.getItem(params.key);
}

async function handleStorageSet(params: StorageSetParams): Promise<null> {
  localStorage.setItem(params.key, params.value);
  return null;
}

async function handleStorageDelete(params: StorageDeleteParams): Promise<null> {
  localStorage.removeItem(params.key);
  return null;
}

async function handleStorageList(): Promise<string[]> {
  const keys: string[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key) keys.push(key);
  }
  return keys;
}

// ─── Clipboard handlers ──────────────────────────────────────────

async function handleClipboardRead(): Promise<string> {
  return navigator.clipboard.readText();
}

async function handleClipboardWrite(
  params: { text: string } | { value: string } | [string],
): Promise<null> {
  const text = Array.isArray(params)
    ? params[0]
    : "text" in params
      ? params.text
      : params.value;
  await navigator.clipboard.writeText(text);
  return null;
}

// ─── Sleep handler ───────────────────────────────────────────────

async function handleSleep(params: SleepParams): Promise<null> {
  await new Promise((resolve) => setTimeout(resolve, Number(params.duration)));
  return null;
}

// ─── Fetch wrappers for registry ─────────────────────────────────

async function handleFetchWrapped(params: FetchParams): Promise<FetchValue> {
  const result = await handleFetch(params);
  if (result.ok) {
    return result.value;
  }
  const error = new Error(result.error.message);
  (error as unknown as Record<string, unknown>).code = result.error.code;
  (error as unknown as Record<string, unknown>).category =
    result.error.category;
  throw error;
}

async function handleFetchDomWrapped(
  params: FetchDomParams,
): Promise<FetchDomValue> {
  const result = await handleFetchDom(params);
  if (result.ok) {
    return result.value;
  }
  const error = new Error(result.error.message);
  (error as unknown as Record<string, unknown>).code = result.error.code;
  (error as unknown as Record<string, unknown>).category =
    result.error.category;
  throw error;
}

// ─── Tab script execution ──────────────────────────────────────

async function executeInTab(
  tabId: number | null,
  func: (...args: unknown[]) => unknown,
  args: unknown[],
): Promise<AsyncResponse> {
  const chrome = window.chrome;
  if (!chrome?.runtime?.id) {
    return {
      ok: false,
      error: {
        message: "Not in extension context",
        code: "E_NO_EXTENSION",
        category: "permission",
      },
    };
  }
  try {
    const targetTab = typeof tabId === "number" ? tabId : activeTabId;
    if (targetTab === null) {
      return {
        ok: false,
        error: {
          message: "No active tab available",
          code: "E_NO_TAB",
          category: "resource",
        },
      };
    }
    const results = await chrome.scripting.executeScript({
      target: { tabId: targetTab },
      func,
      args,
      world: "MAIN",
    });
    if (results?.[0]) {
      const first = results[0] as (typeof results)[0] & { error?: unknown };
      if (first.error) {
        return {
          ok: false,
          error: {
            message: String(first.error),
            code: "E_SCRIPT_EXECUTION",
            category: "script",
          },
        };
      }
      return { ok: true, value: first.result };
    }
    return { ok: true, value: null };
  } catch (err: unknown) {
    return normalizeChromeError(err);
  }
}

async function waitForTabLoad(
  tabId: number | null,
  timeoutMs: number = 30_000,
): Promise<AsyncResponse<boolean>> {
  const chrome = window.chrome;
  if (!chrome?.runtime?.id) {
    return {
      ok: false,
      error: {
        message: "Not in extension context",
        code: "E_NO_EXTENSION",
        category: "permission",
      },
    };
  }
  const targetTab = typeof tabId === "number" ? tabId : null;
  if (targetTab === null) {
    return {
      ok: false,
      error: {
        message: "tab_wait_for_load requires a valid tabId",
        code: "E_MISSING_PARAM",
      },
    };
  }
  try {
    const tab = await chrome.tabs.get(targetTab);
    if (tab.status === "complete") {
      return { ok: true, value: true };
    }
    await new Promise<void>((resolve, reject) => {
      const listener = (
        updatedTabId: number,
        changeInfo: { status?: string },
      ) => {
        if (updatedTabId === targetTab && changeInfo.status === "complete") {
          chrome.tabs.onUpdated.removeListener(listener);
          resolve();
        }
      };
      chrome.tabs.onUpdated.addListener(listener);
      setTimeout(() => {
        chrome.tabs.onUpdated.removeListener(listener);
        reject(new Error("Timeout waiting for tab load"));
      }, timeoutMs);
    });
    return { ok: true, value: true };
  } catch (err: unknown) {
    return normalizeChromeError(err);
  }
}

// ─── Active tab cache & persistent content-script communication ──

let activeTabId: number | null = null;

const onActivatedListener = ({ tabId }: { tabId: number }) => {
  activeTabId = tabId;
};

const onUpdatedListener = (tabId: number, changeInfo: { status?: string }) => {
  const chrome = window.chrome;
  if (!chrome?.runtime?.id) return;
  if (changeInfo.status === "complete") {
    chrome.tabs.sendMessage(tabId, { action: "ping" }).catch(() => {
      // Content script not present; injection happens automatically
      // via manifest content_scripts matches for new navigations.
      // For SPA navigations within same document, no injection needed
      // because content script persists.
    });
  }
};

export function getActiveTabId(): number | null {
  return activeTabId;
}

export function initExtensionListeners(): void {
  const chrome = window.chrome;
  if (!chrome?.runtime?.id) return;

  chrome.tabs.onActivated.addListener(onActivatedListener);
  chrome.tabs.onUpdated.addListener(onUpdatedListener);

  // Initialize activeTabId from current state
  chrome.tabs
    .query({ active: true, currentWindow: true })
    .then((tabs: chrome.tabs.Tab[]) => {
      const t = Array.isArray(tabs) ? tabs : [];
      const first = t[0] as chrome.tabs.Tab | undefined;
      if (first && typeof first.id === "number") {
        activeTabId = first.id;
      }
    })
    .catch(() => {
      // ignore query errors
    });
}

export function removeExtensionListeners(): void {
  const chrome = window.chrome;
  if (!chrome?.runtime?.id) return;
  chrome.tabs.onActivated.removeListener(onActivatedListener);
  chrome.tabs.onUpdated.removeListener(onUpdatedListener);
}

async function sendBridgeMessageToTab(
  tabId: number | null,
  runnerAction: string,
  params: Record<string, unknown>,
): Promise<AsyncResponse> {
  const csAction = getContentScriptAction(runnerAction);
  if (!csAction) {
    return {
      ok: false,
      error: {
        message: `No content script bridge mapping for ${runnerAction}`,
        code: "E_BRIDGE",
      },
    };
  }
  return sendMessageToTab(tabId, { action: csAction, params });
}

/**
 * Bridge helper for registerTool handlers.
 * Calls sendBridgeMessageToTab and unwraps the AsyncResponse,
 * throwing an error with the right code/category on failure.
 */
async function bridgeToTab(
  tabId: number | null,
  runnerAction: string,
  params: Record<string, unknown>,
): Promise<unknown> {
  const response = await sendBridgeMessageToTab(tabId, runnerAction, params);
  if (!response.ok) {
    const error = new Error(response.error.message);
    (error as unknown as Record<string, unknown>).code = response.error.code;
    (error as unknown as Record<string, unknown>).category =
      response.error.category;
    throw error;
  }
  return response.value;
}

async function sendMessageToTab(
  tabId: number | null,
  message: TabMessage,
): Promise<AsyncResponse> {
  const chrome = window.chrome;
  if (!chrome?.runtime?.id) {
    return {
      ok: false,
      error: {
        message: "Not in extension context",
        code: "E_NO_EXTENSION",
        category: "permission",
      },
    };
  }
  const targetTab = typeof tabId === "number" ? tabId : activeTabId;
  if (targetTab === null) {
    return {
      ok: false,
      error: {
        message: "No active tab available",
        code: "E_NO_TAB",
        category: "resource",
      },
    };
  }
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      const result = await chrome.tabs.sendMessage(targetTab, message);
      // Content-script handlers may return { ok: false, error: msg } on failure.
      // Flatten that so Lua consumers always see a single error shape.
      if (
        result &&
        typeof result === "object" &&
        (result as Record<string, unknown>).ok === false
      ) {
        const raw = (result as Record<string, unknown>).error;
        const msg = typeof raw === "string" ? raw : String(raw);
        return {
          ok: false,
          error: {
            message: msg || "Content script error",
            code: "E_CONTENT_SCRIPT",
          },
        };
      }
      return { ok: true, value: result };
    } catch (err: unknown) {
      const msg = (err instanceof Error ? err.message : String(err)) || "";
      if (msg.includes("Receiving end does not exist") && attempt < 4) {
        if (attempt === 0) {
          try {
            await chrome.scripting.executeScript({
              target: { tabId: targetTab },
              files: ["content-script.js"],
              world: "ISOLATED",
            });
            await new Promise((resolve) => setTimeout(resolve, 300));
          } catch (injectErr: unknown) {
            return normalizeChromeError(injectErr);
          }
        }
        await new Promise((resolve) => setTimeout(resolve, 500));
        continue;
      }
      return normalizeChromeError(err);
    }
  }
  return {
    ok: false,
    error: {
      message: "Failed to send message to tab after retries",
      code: "E_TAB_MESSAGE",
      category: "resource",
    },
  };
}

// ─── Sidepanel actions (side panel / main document) ─────────────
//
// IMPORTANT: sidepanel.* actions operate on the extension popup/sidepanel
// DOM, NOT the active browser tab. To interact with the active tab, use
// page.* APIs which relay commands to the content script via sendMessageToTab.

function getElementByRefId(refId: string): Element | null {
  return document.querySelector(`[data-ref-id='${CSS.escape(refId)}']`);
}

function extractRefId(params: unknown): string | undefined {
  if (typeof params === "string") return params;
  const obj = asRecord(params);
  return typeof obj.refId === "string" ? obj.refId : undefined;
}

// ─── Sidepanel tool registry ─────────────────────────────────────

interface SidepanelTool<P, R> {
  action: string;
  params: z.ZodSchema<P>;
  handler: (params: P) => R | Promise<R>;
}

const sidepanelRegistry = new Map<string, SidepanelTool<unknown, unknown>>();

function registerSidepanelTool<P, R>(tool: SidepanelTool<P, R>): void {
  sidepanelRegistry.set(tool.action, tool as SidepanelTool<unknown, unknown>);
}

async function dispatchSidepanelTool<T>(
  action: string,
  params: unknown,
): Promise<T> {
  const tool = sidepanelRegistry.get(action);
  if (!tool) {
    const error = new Error(`Sidepanel action "${action}" not found`);
    (error as unknown as Record<string, unknown>).code = "EUNKNOWN";
    throw error;
  }
  const parsed = tool.params.safeParse(params);
  if (!parsed.success) {
    const error = new Error("Invalid parameters");
    (error as unknown as Record<string, unknown>).code = "EINVALID_PARAMS";
    throw error;
  }
  const value = await tool.handler(parsed.data);
  return value as T;
}

// ─── Register sidepanel tools ────────────────────────────────────

registerSidepanelTool({
  action: "sidepanel_click",
  params: SidepanelClickParamsSchema,
  handler: (params) => {
    const refId = extractRefId(params);
    const element = refId ? getElementByRefId(refId) : null;
    if (!element) throw new Error(`Element ${refId} not found`);
    (element as HTMLElement).click();
    return null;
  },
});

registerSidepanelTool({
  action: "sidepanel_dblclick",
  params: SidepanelDblClickParamsSchema,
  handler: (params) => {
    const refId = extractRefId(params);
    const element = refId ? getElementByRefId(refId) : null;
    if (!element) throw new Error(`Element ${refId} not found`);
    const ev = new MouseEvent("dblclick", { bubbles: true });
    element.dispatchEvent(ev);
    return null;
  },
});

registerSidepanelTool({
  action: "sidepanel_fill",
  params: SidepanelFillParamsSchema,
  handler: (params) => {
    const refId = extractRefId(params);
    const element = refId ? getElementByRefId(refId) : null;
    if (!element) throw new Error(`Element ${refId} not found`);
    const obj = params as Record<string, unknown>;
    const value = typeof obj.value === "string" ? obj.value : "";
    if (
      element instanceof HTMLInputElement ||
      element instanceof HTMLTextAreaElement
    ) {
      element.value = value;
    } else {
      throw new Error("Element is not an input");
    }
    const ev = new InputEvent("input", { bubbles: true });
    element.dispatchEvent(ev);
    return null;
  },
});

registerSidepanelTool({
  action: "sidepanel_type",
  params: SidepanelTypeParamsSchema,
  handler: (params) => {
    const refId = extractRefId(params);
    const element = refId ? getElementByRefId(refId) : null;
    if (!element) throw new Error(`Element ${refId} not found`);
    const obj = params as Record<string, unknown>;
    const text = typeof obj.text === "string" ? obj.text : "";
    if (
      element instanceof HTMLInputElement ||
      element instanceof HTMLTextAreaElement
    ) {
      element.value = text;
    }
    const ev = new InputEvent("input", { bubbles: true });
    element.dispatchEvent(ev);
    return null;
  },
});

registerSidepanelTool({
  action: "sidepanel_append",
  params: SidepanelAppendParamsSchema,
  handler: (params) => {
    const refId = extractRefId(params);
    const element = refId ? getElementByRefId(refId) : null;
    if (!element) throw new Error(`Element ${refId} not found`);
    const obj = params as Record<string, unknown>;
    const text = typeof obj.text === "string" ? obj.text : "";
    if (
      element instanceof HTMLInputElement ||
      element instanceof HTMLTextAreaElement
    ) {
      element.value += text;
    } else {
      throw new Error("Element is not an input");
    }
    const ev = new InputEvent("input", { bubbles: true });
    element.dispatchEvent(ev);
    return null;
  },
});

registerSidepanelTool({
  action: "sidepanel_press",
  params: SidepanelPressParamsSchema,
  handler: (params) => {
    const obj = params as Record<string, unknown>;
    const key = typeof obj.key === "string" ? obj.key : "";
    const evDown = new KeyboardEvent("keydown", { key, bubbles: true });
    document.dispatchEvent(evDown);
    const evUp = new KeyboardEvent("keyup", { key, bubbles: true });
    document.dispatchEvent(evUp);
    return null;
  },
});

registerSidepanelTool({
  action: "sidepanel_select",
  params: SidepanelSelectParamsSchema,
  handler: (params) => {
    const refId = extractRefId(params);
    const element = refId ? getElementByRefId(refId) : null;
    if (!element) throw new Error(`Element ${refId} not found`);
    const obj = params as Record<string, unknown>;
    const value = typeof obj.value === "string" ? obj.value : "";
    if (element instanceof HTMLSelectElement) {
      element.value = value;
    } else {
      throw new Error("Element is not a select");
    }
    return null;
  },
});

registerSidepanelTool({
  action: "sidepanel_check",
  params: SidepanelCheckParamsSchema,
  handler: (params) => {
    const refId = extractRefId(params);
    const element = refId ? getElementByRefId(refId) : null;
    if (!element) throw new Error(`Element ${refId} not found`);
    const obj = params as Record<string, unknown>;
    const checked = typeof obj.checked === "boolean" ? obj.checked : true;
    if (element instanceof HTMLInputElement && element.type === "checkbox") {
      element.checked = checked;
    } else {
      throw new Error("Element is not a checkbox");
    }
    return null;
  },
});

registerSidepanelTool({
  action: "sidepanel_hover",
  params: SidepanelHoverParamsSchema,
  handler: (params) => {
    const refId = extractRefId(params);
    const element = refId ? getElementByRefId(refId) : null;
    if (!element) throw new Error(`Element ${refId} not found`);
    const ev = new MouseEvent("mouseenter", { bubbles: true });
    element.dispatchEvent(ev);
    return null;
  },
});

registerSidepanelTool({
  action: "sidepanel_unhover",
  params: SidepanelUnhoverParamsSchema,
  handler: (params) => {
    const refId = extractRefId(params);
    const element = refId ? getElementByRefId(refId) : null;
    if (!element) throw new Error(`Element ${refId} not found`);
    const ev = new MouseEvent("mouseleave", { bubbles: true });
    element.dispatchEvent(ev);
    return null;
  },
});

registerSidepanelTool({
  action: "sidepanel_scroll",
  params: SidepanelScrollParamsSchema,
  handler: (params) => {
    const obj = params as Record<string, unknown>;
    const direction =
      typeof obj.direction === "string" ? obj.direction : "down";
    const amount = typeof obj.amount === "number" ? obj.amount : 300;
    window.scrollBy({
      top: direction === "down" ? amount : -amount,
      behavior: "smooth",
    });
    return null;
  },
});

registerSidepanelTool({
  action: "sidepanel_scroll_to",
  params: SidepanelScrollToParamsSchema,
  handler: (params) => {
    const refId = extractRefId(params);
    const element = refId ? getElementByRefId(refId) : null;
    if (!element) throw new Error(`Element ${refId} not found`);
    element.scrollIntoView({ behavior: "smooth" });
    return null;
  },
});

registerSidepanelTool({
  action: "sidepanel_url",
  params: SidepanelUrlParamsSchema,
  handler: () => window.location.href,
});

registerSidepanelTool({
  action: "sidepanel_title",
  params: SidepanelTitleParamsSchema,
  handler: () => document.title,
});

registerSidepanelTool({
  action: "sidepanel_wait",
  params: SidepanelWaitParamsSchema,
  handler: async (params) => {
    await new Promise((resolve) =>
      setTimeout(resolve, Number(params.duration)),
    );
    return true;
  },
});

registerSidepanelTool({
  action: "sidepanel_snapshot",
  params: SidepanelSnapshotParamsSchema,
  handler: async (params) => {
    const result = await handleDomSnapshot({
      max_nodes: params.max_nodes ?? 500n,
      interactive_only: params.interactive_only ?? false,
    });
    if (!result.ok) {
      const error = new Error(result.error.message);
      (error as unknown as Record<string, unknown>).code = result.error.code;
      throw error;
    }
    return (result.value as Record<string, unknown>).text as string;
  },
});

registerSidepanelTool({
  action: "sidepanel_snapshot_text",
  params: SidepanelSnapshotTextParamsSchema,
  handler: async (params) => {
    const result = await handleDomSnapshot({
      max_nodes: params.max_nodes ?? 500n,
      interactive_only: params.interactive_only ?? false,
    });
    if (!result.ok) {
      const error = new Error(result.error.message);
      (error as unknown as Record<string, unknown>).code = result.error.code;
      throw error;
    }
    return (result.value as Record<string, unknown>).text as string;
  },
});

registerSidepanelTool({
  action: "sidepanel_snapshot_data",
  params: SidepanelSnapshotDataParamsSchema,
  handler: async (params) => {
    const result = await handleDomSnapshot({
      max_nodes: params.max_nodes ?? 500n,
      interactive_only: params.interactive_only ?? false,
    });
    if (!result.ok) {
      const error = new Error(result.error.message);
      (error as unknown as Record<string, unknown>).code = result.error.code;
      throw error;
    }
    return result.value;
  },
});

// ─── DOM snapshot ──────────────────────────────────────────────

async function handleDomSnapshot(
  params: DomSnapshotParams,
): Promise<AsyncResponse<DomSnapshotValue>> {
  try {
    await ensureDomSnapshot();
    const { max_nodes, interactive_only } = params;
    const options = {
      maxNodes: Number(max_nodes),
      interactiveOnly: interactive_only,
    };
    const snap = collectDocument(options);
    const text = formatSnapshot(snap, "compact-text");
    return {
      ok: true,
      value: { data: snap, text },
    };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      ok: false,
      error: { message: message || String(err), code: "E_SNAPSHOT" },
    };
  }
}

async function handleDomFormat(
  params: DomFormatParams,
): Promise<AsyncResponse<string>> {
  try {
    await ensureDomSnapshot();
    const { snapshot, format } = params;
    const text = formatSnapshot(snapshot, format);
    return { ok: true, value: text };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      ok: false,
      error: { message: message || String(err), code: "E_FORMAT" },
    };
  }
}

function _getElementRole(el: Element): string {
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
  if (tag === "h1" || tag === "h2" || tag === "h3" || tag === "h4")
    return "heading";
  return "generic";
}

// ─── Host call handler ───────────────────────────────────────────

async function handleHostCallAction(
  action: string,
  params: unknown,
): Promise<AsyncResponse> {
  const handler = hostHandlers[action] ?? window.__hostHandlers?.[action];
  if (!handler) {
    return {
      ok: false,
      error: {
        message: `No handler registered for "${action}"`,
        code: "ENOHANDLER",
        category: "host",
      },
    };
  }
  try {
    const value = await handler(params);
    return { ok: true, value };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      ok: false,
      error: {
        message: message || String(err),
        code: "EHOSTCALL",
        category: "host",
      },
    };
  }
}

// ─── Chrome error normalizer ───────────────────────────────────

function normalizeChromeError(err: unknown): { ok: false; error: AsyncError } {
  const msg = (err instanceof Error ? err.message : String(err)) || "";
  if (msg.includes("permission") || msg.includes("Permission")) {
    return {
      ok: false,
      error: {
        message: msg,
        code: "E_PERMISSION_DENIED",
        category: "permission",
      },
    };
  }
  if (
    msg.includes("not found") ||
    msg.includes("No tab") ||
    msg.includes("No window")
  ) {
    return {
      ok: false,
      error: { message: msg, code: "E_NOT_FOUND", category: "resource" },
    };
  }
  return {
    ok: false,
    error: { message: msg, code: "E_EXTENSION", category: "extension" },
  };
}

// ─── Chrome API dispatcher ─────────────────────────────────────

async function handleChromeApi(command: Command): Promise<AsyncResponse> {
  const chrome = window.chrome;
  if (!chrome?.runtime?.id) {
    return {
      ok: false,
      error: {
        message: `${command.action} is only available in a browser extension context`,
        code: "E_NO_EXTENSION",
        category: "permission",
      },
    };
  }

  const p = command.params;
  const first = Array.isArray(p)
    ? p[0]
    : typeof p === "object" && p !== null
      ? p
      : p;
  const second = Array.isArray(p) ? p[1] : undefined;
  const firstRec = asRecord(first);

  try {
    let result: unknown;
    switch (command.action) {
      case "chrome_runtime_sendMessage": {
        result = await chrome.runtime.sendMessage(firstRec || {});
        break;
      }
      case "chrome_tabs_query": {
        result = await chrome.tabs.query(firstRec || {});
        break;
      }
      case "chrome_tabs_create": {
        result = await chrome.tabs.create(firstRec || {});
        break;
      }
      case "chrome_tabs_update": {
        const tabId = firstRec.tabId || first;
        const updateProps = firstRec.update || second || {};
        result = await chrome.tabs.update(
          typeof tabId === "number" ? tabId : (null as unknown as number),
          // biome-ignore lint/suspicious/noExplicitAny: bridging dynamic params to typed Chrome API
          updateProps as any,
        );
        break;
      }
      case "chrome_tabs_remove": {
        const tabId = firstRec.tabId || firstRec.id || first;
        await chrome.tabs.remove(tabId as number);
        result = null;
        break;
      }
      case "chrome_tabs_get": {
        const tabId = firstRec.tabId || firstRec.id || first;
        result = await chrome.tabs.get(tabId as number);
        break;
      }
      case "chrome_tabs_reload": {
        const tabId = firstRec.tabId || first;
        const reloadProps = firstRec.reload || second || {};
        await chrome.tabs.reload(
          typeof tabId === "number" ? tabId : (undefined as unknown as number),
          // biome-ignore lint/suspicious/noExplicitAny: bridging dynamic params to typed Chrome API
          reloadProps as any,
        );
        result = null;
        break;
      }
      case "chrome_tabs_sendMessage": {
        const tabId = firstRec.tabId || first;
        const message = firstRec.message || second || {};
        result = await chrome.tabs.sendMessage(tabId as number, message);
        break;
      }
      case "chrome_alarms_create": {
        const name =
          firstRec.name || (typeof first === "string" ? first : "") || "";
        const alarmInfo = firstRec.alarmInfo || second || firstRec || {};
        await chrome.alarms.create(name as string, alarmInfo);
        result = null;
        break;
      }
      case "chrome_alarms_clear": {
        const alarmName =
          firstRec.name || (typeof first === "string" ? first : "") || "";
        result = await chrome.alarms.clear(alarmName as string);
        break;
      }
      case "chrome_action_setBadgeText": {
        // biome-ignore lint/suspicious/noExplicitAny: bridging dynamic params to typed Chrome API
        await chrome.action.setBadgeText((firstRec || {}) as any);
        result = null;
        break;
      }
      case "chrome_action_setBadgeBackgroundColor": {
        // biome-ignore lint/suspicious/noExplicitAny: bridging dynamic params to typed Chrome API
        await chrome.action.setBadgeBackgroundColor((firstRec || {}) as any);
        result = null;
        break;
      }
      case "chrome_action_setTitle": {
        // biome-ignore lint/suspicious/noExplicitAny: bridging dynamic params to typed Chrome API
        await chrome.action.setTitle((firstRec || {}) as any);
        result = null;
        break;
      }
      case "chrome_action_setIcon": {
        // biome-ignore lint/suspicious/noExplicitAny: bridging dynamic params to typed Chrome API
        result = await chrome.action.setIcon((firstRec || {}) as any);
        break;
      }
      case "chrome_contextMenus_create": {
        result = await chrome.contextMenus.create(firstRec || {});
        break;
      }
      case "chrome_contextMenus_remove": {
        const menuId = firstRec.menuItemId || firstRec.id || first;
        await chrome.contextMenus.remove(menuId);
        result = null;
        break;
      }
      case "chrome_windows_getAll": {
        result = await chrome.windows.getAll(firstRec || {});
        break;
      }
      case "chrome_windows_create": {
        result = await chrome.windows.create(firstRec || {});
        break;
      }
      case "chrome_windows_update": {
        const windowId = firstRec.windowId || first;
        const updateInfo = firstRec.update || second || {};
        result = await chrome.windows.update(windowId, updateInfo);
        break;
      }
      case "chrome_windows_remove": {
        const windowId = firstRec.windowId || first;
        await chrome.windows.remove(windowId);
        result = null;
        break;
      }
      case "chrome_sidePanel_setOptions": {
        await chrome.sidePanel.setOptions(firstRec || {});
        result = null;
        break;
      }
      case "chrome_cookies_get": {
        // biome-ignore lint/suspicious/noExplicitAny: bridging dynamic params to typed Chrome API
        result = await chrome.cookies.get((firstRec || {}) as any);
        break;
      }
      case "chrome_cookies_set": {
        // biome-ignore lint/suspicious/noExplicitAny: bridging dynamic params to typed Chrome API
        result = await chrome.cookies.set((firstRec || {}) as any);
        break;
      }
      case "chrome_cookies_remove": {
        // biome-ignore lint/suspicious/noExplicitAny: bridging dynamic params to typed Chrome API
        result = await chrome.cookies.remove((firstRec || {}) as any);
        break;
      }
      case "chrome_cookies_getAll": {
        // biome-ignore lint/suspicious/noExplicitAny: bridging dynamic params to typed Chrome API
        result = await chrome.cookies.getAll((firstRec || {}) as any);
        break;
      }
      case "chrome_bookmarks_search": {
        const query =
          firstRec.query || (typeof first === "string" ? first : "") || "";
        result = await chrome.bookmarks.search(query);
        break;
      }
      case "chrome_bookmarks_create": {
        result = await chrome.bookmarks.create(firstRec || {});
        break;
      }
      case "chrome_bookmarks_remove": {
        const bookmarkId = firstRec.id || first;
        await chrome.bookmarks.remove(bookmarkId);
        result = null;
        break;
      }
      case "chrome_history_search": {
        // biome-ignore lint/suspicious/noExplicitAny: bridging dynamic params to typed Chrome API
        result = await chrome.history.search((firstRec || {}) as any);
        break;
      }
      case "chrome_history_deleteUrl": {
        await chrome.history.deleteUrl(firstRec.url || first);
        result = null;
        break;
      }
      case "chrome_notifications_create": {
        const notifId =
          firstRec.id || (typeof first === "string" ? first : "") || "";
        const options = firstRec.options || second || {};
        result = await chrome.notifications.create(notifId as string, options);
        break;
      }
      case "chrome_notifications_clear": {
        const notifId =
          firstRec.id || (typeof first === "string" ? first : "") || "";
        result = await chrome.notifications.clear(notifId as string);
        break;
      }
      case "chrome_scripting_executeScript": {
        // biome-ignore lint/suspicious/noExplicitAny: bridging dynamic params to typed Chrome API
        result = await chrome.scripting.executeScript((firstRec || {}) as any);
        break;
      }
      default:
        return {
          ok: false,
          error: {
            message: `Unimplemented chrome action: ${command.action}`,
            code: "E_UNKNOWN",
            category: "unknown",
          },
        };
    }
    return { ok: true, value: result };
  } catch (err: unknown) {
    return normalizeChromeError(err);
  }
}

// ─── Tool registrations ──────────────────────────────────────────

registerTool({
  action: "storage_get",
  namespace: "storage",
  description: "Get a value from local storage by key",
  params: StorageGetParamsSchema,
  paramTypes: [
    {
      name: "key",
      type: "string",
      required: true,
      description: "Storage key",
    },
  ],
  returns: z.any(),
  returnDoc: "string | null",
  errorCode: "ESTORAGE",
  errorCategory: "storage",
  paramDocs: { key: "Storage key" },
  handler: handleStorageGet,
});

registerTool({
  action: "storage_set",
  namespace: "storage",
  description: "Set a value in local storage",
  params: StorageSetParamsSchema,
  paramTypes: [
    {
      name: "key",
      type: "string",
      required: true,
      description: "Storage key",
    },
    {
      name: "value",
      type: "string",
      required: true,
      description: "Value to store",
    },
  ],
  returns: z.null(),
  returnDoc: "null",
  errorCode: "ESTORAGE",
  errorCategory: "storage",
  paramDocs: { key: "Storage key", value: "Value to store" },
  handler: handleStorageSet,
});

registerTool({
  action: "storage_delete",
  namespace: "storage",
  description: "Delete a key from local storage",
  params: StorageDeleteParamsSchema,
  paramTypes: [
    {
      name: "key",
      type: "string",
      required: true,
      description: "Storage key",
    },
  ],
  returns: z.null(),
  returnDoc: "null",
  errorCode: "ESTORAGE",
  errorCategory: "storage",
  paramDocs: { key: "Storage key" },
  handler: handleStorageDelete,
});

registerTool({
  action: "storage_list",
  namespace: "storage",
  description: "List all keys in local storage",
  params: StorageListParamsSchema,
  paramTypes: [],
  returns: z.array(z.string()),
  returnDoc: "string[]",
  errorCode: "ESTORAGE",
  errorCategory: "storage",
  paramDocs: {},
  handler: handleStorageList,
});

registerTool({
  action: "clipboard_read",
  namespace: "clipboard",
  description: "Read text from the clipboard",
  params: ClipboardReadParamsSchema,
  paramTypes: [],
  returns: z.string(),
  returnDoc: "string",
  errorCode: "ECLIPBOARD",
  errorCategory: "permission",
  paramDocs: {},
  handler: handleClipboardRead,
});

registerTool({
  action: "clipboard_write",
  namespace: "clipboard",
  description: "Write text to the clipboard",
  params: ClipboardWriteParamsSchema,
  paramTypes: [
    {
      name: "text",
      type: "string",
      required: true,
      description: "Text to write",
    },
  ],
  returns: z.null(),
  returnDoc: "null",
  errorCode: "ECLIPBOARD",
  errorCategory: "permission",
  paramDocs: { text: "Text to write" },
  handler: handleClipboardWrite,
});

registerTool({
  action: "sleep",
  namespace: "runtime",
  description: "Sleep for a specified duration",
  params: SleepParamsSchema,
  paramTypes: [
    {
      name: "duration",
      type: "bigint",
      required: true,
      description: "Duration in milliseconds",
    },
  ],
  returns: z.null(),
  returnDoc: "null",
  errorCode: "ESLEEP",
  errorCategory: "runtime",
  paramDocs: { duration: "Duration in milliseconds" },
  handler: handleSleep,
});

registerTool({
  action: "fetch",
  namespace: "network",
  description: "Fetch a URL",
  params: FetchParamsSchema as unknown as z.ZodSchema<FetchParams>,
  paramTypes: [
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
      required: true,
      description: "Request body",
    },
    {
      name: "timeout",
      type: "bigint",
      required: false,
      description: "Timeout in milliseconds",
    },
  ],
  returns: z.any(),
  returnDoc: "FetchValue",
  errorCode: "EFETCH",
  errorCategory: "network",
  paramDocs: {
    url: "URL to fetch",
    method: "HTTP method",
    headers: "Request headers",
    body: "Request body",
    timeout: "Timeout in milliseconds",
  },
  handler: handleFetchWrapped,
});

registerTool({
  action: "fetch_dom",
  namespace: "network",
  description: "Fetch a URL and extract DOM elements",
  params: FetchDomParamsSchema,
  paramTypes: [
    {
      name: "url",
      type: "string",
      required: true,
      description: "URL to fetch",
    },
    {
      name: "selector",
      type: "string",
      required: true,
      description: "CSS selector",
    },
    {
      name: "max_text",
      type: "bigint",
      required: true,
      description: "Max text length per match",
    },
  ],
  returns: z.any(),
  returnDoc: "FetchDomValue",
  errorCode: "EFETCH",
  errorCategory: "network",
  paramDocs: {
    url: "URL to fetch",
    selector: "CSS selector",
    max_text: "Max text length per match",
  },
  handler: handleFetchDomWrapped,
});

// ─── Page action registrations ─────────────────────────────────

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
  returns: z.any(),
  returnDoc: "boolean",
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
  returns: z.any(),
  returnDoc: "boolean",
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
  returns: z.any(),
  returnDoc: "boolean",
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
  returns: z.any(),
  returnDoc: "boolean",
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
  returns: z.any(),
  returnDoc: "boolean",
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
  returns: z.any(),
  returnDoc: "boolean",
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
  returns: z.any(),
  returnDoc: "boolean",
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
  returns: z.any(),
  returnDoc: "boolean",
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
  returns: z.any(),
  returnDoc: "boolean",
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
  returns: z.any(),
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
    const bridgeParams: Record<string, unknown> = {
      direction: params.direction,
      amount: params.amount,
    };
    if (params.refId !== null) {
      bridgeParams.refId = params.refId;
    }
    return bridgeToTab(tabId, "page_scroll", bridgeParams);
  },
});

registerTool({
  action: "page_scroll_to",
  namespace: "page",
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
  returns: z.any(),
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
  returns: z.any(),
  returnDoc: "boolean",
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
  returns: z.any(),
  returnDoc: "boolean",
  errorCode: "EPAGE",
  errorCategory: "page",
  paramDocs: { url: "URL to navigate to" },
  handler: async (params) => {
    const tabId = getActiveTabId();
    if (tabId === null) throw new Error("No active tab");
    const result = await handleChromeApi({
      action: "chrome_tabs_update",
      params: { tabId, update: { url: params.url } },
    });
    if (!result.ok) {
      const error = new Error(result.error.message);
      (error as unknown as Record<string, unknown>).code = result.error.code;
      (error as unknown as Record<string, unknown>).category =
        result.error.category;
      throw error;
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
  returns: z.any(),
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
  returns: z.any(),
  returnDoc: "boolean",
  errorCode: "EPAGE",
  errorCategory: "page",
  paramDocs: {},
  handler: async () => {
    const tabId = getActiveTabId();
    if (tabId === null) throw new Error("No active tab");
    const result = await executeInTab(tabId, () => {
      window.history.forward();
      return true;
    }, []);
    if (!result.ok) {
      const error = new Error(result.error.message);
      (error as unknown as Record<string, unknown>).code = result.error.code;
      (error as unknown as Record<string, unknown>).category =
        result.error.category;
      throw error;
    }
    return result.value;
  },
});

registerTool({
  action: "page_reload",
  namespace: "page",
  description: "Reload the active tab",
  params: PageReloadParamsSchema,
  paramTypes: [],
  returns: z.any(),
  returnDoc: "boolean",
  errorCode: "EPAGE",
  errorCategory: "page",
  paramDocs: {},
  handler: async () => {
    const tabId = getActiveTabId();
    if (tabId === null) throw new Error("No active tab");
    const result = await handleChromeApi({
      action: "chrome_tabs_reload",
      params: { tabId },
    });
    if (!result.ok) {
      const error = new Error(result.error.message);
      (error as unknown as Record<string, unknown>).code = result.error.code;
      (error as unknown as Record<string, unknown>).category =
        result.error.category;
      throw error;
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
      type: "bigint",
      required: false,
      description: "Milliseconds to wait (default 1000)",
    },
  ],
  returns: z.boolean(),
  returnDoc: "true",
  errorCode: "EPAGE",
  errorCategory: "page",
  paramDocs: { duration: "Milliseconds to wait (default 1000)" },
  handler: async (params) => {
    await new Promise((resolve) =>
      setTimeout(resolve, Number(params.duration)),
    );
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
  returns: z.any(),
  returnDoc: "Array<{ tag, refId, text }>",
  errorCode: "EPAGE",
  errorCategory: "page",
  paramDocs: { selector: "CSS selector" },
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
      const error = new Error(result.error.message);
      (error as unknown as Record<string, unknown>).code = result.error.code;
      (error as unknown as Record<string, unknown>).category =
        result.error.category;
      throw error;
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
      type: "bigint",
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
  handler: async (params) => {
    const tabId = getActiveTabId();
    if (tabId === null) throw new Error("No active tab");
    const timeoutMs = Number(params.timeout) || 30_000;
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
        const error = new Error(
          `Timeout waiting for selector: ${params.selector}`,
        );
        (error as unknown as Record<string, unknown>).code = "E_TIMEOUT";
        (error as unknown as Record<string, unknown>).category = "timeout";
        throw error;
      }
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  },
});

// ─── Tab action registrations ──────────────────────────────────

registerTool({
  action: "tab_click",
  namespace: "tab",
  description: "Click an element in a target tab",
  params: TabClickParamsSchema,
  paramTypes: [
    {
      name: "tabId",
      type: "bigint",
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
  returns: z.any(),
  returnDoc: "boolean",
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
      type: "bigint",
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
  returns: z.any(),
  returnDoc: "boolean",
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
      type: "bigint",
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
  returns: z.any(),
  returnDoc: "boolean",
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
      type: "bigint",
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
  returns: z.any(),
  returnDoc: "boolean",
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
      type: "bigint",
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
  returns: z.any(),
  returnDoc: "boolean",
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
      type: "bigint",
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
  returns: z.any(),
  returnDoc: "boolean",
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
      type: "bigint",
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
  returns: z.any(),
  returnDoc: "boolean",
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
      type: "bigint",
      required: true,
      description: "Target tab ID",
    },
  ],
  returns: z.any(),
  returnDoc: "boolean",
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
      type: "bigint",
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
  returns: z.any(),
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
      type: "bigint",
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
  returns: z.any(),
  returnDoc: "boolean",
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
      type: "bigint",
      required: true,
      description: "Target tab ID",
    },
  ],
  returns: z.any(),
  returnDoc: "boolean",
  errorCode: "ETAB",
  errorCategory: "tab",
  paramDocs: { tabId: "Target tab ID" },
  handler: async (params) => {
    return bridgeToTab(Number(params.tabId), "tab_back", {});
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
      type: "bigint",
      required: true,
      description: "Target tab ID",
    },
    {
      name: "timeout",
      type: "bigint",
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
  handler: async (params) => {
    const result = await waitForTabLoad(
      Number(params.tabId),
      Number(params.timeout),
    );
    if (!result.ok) {
      const error = new Error(result.error.message);
      (error as unknown as Record<string, unknown>).code = result.error.code;
      (error as unknown as Record<string, unknown>).category =
        result.error.category;
      throw error;
    }
    return result.value;
  },
});

// ─── Chrome passthrough helpers ────────────────────────────────

function registerChromePassthrough<P>(
  action: string,
  namespace: string,
  description: string,
  chromeAction: string,
  paramsSchema: z.ZodSchema<P>,
  paramTypes: {
    name: string;
    type: string;
    required: boolean;
    description: string;
  }[],
  paramDocs: Record<string, string>,
  paramTransform?: (params: P) => unknown,
) {
  registerTool({
    action,
    namespace,
    description,
    params: paramsSchema,
    paramTypes,
    returns: z.any(),
    returnDoc: "any",
    errorCode: "ECHROME",
    errorCategory: "extension",
    paramDocs,
    handler: async (params) => {
      const transformedParams = paramTransform
        ? paramTransform(params)
        : params;
      const result = await handleChromeApi({
        action: chromeAction,
        params: transformedParams,
      });
      if (!result.ok) {
        const error = new Error(result.error.message);
        (error as unknown as Record<string, unknown>).code = result.error.code;
        (error as unknown as Record<string, unknown>).category =
          result.error.category;
        throw error;
      }
      return result.value;
    },
  });
}

// ─── Chrome passthrough registrations ────────────────────────────

registerChromePassthrough(
  "cookies_get",
  "cookies",
  "Get a cookie by details",
  "chrome_cookies_get",
  CookiesGetParamsSchema,
  [
    {
      name: "details",
      type: "object",
      required: true,
      description: "Cookie details: name, url, storeId",
    },
  ],
  { details: "Cookie details" },
);

registerChromePassthrough(
  "cookies_set",
  "cookies",
  "Set a cookie",
  "chrome_cookies_set",
  CookiesSetParamsSchema,
  [
    {
      name: "details",
      type: "object",
      required: true,
      description: "Cookie details: name, value, url, etc.",
    },
  ],
  { details: "Cookie details" },
);

registerChromePassthrough(
  "cookies_delete",
  "cookies",
  "Remove a cookie",
  "chrome_cookies_remove",
  CookiesDeleteParamsSchema,
  [
    {
      name: "details",
      type: "object",
      required: true,
      description: "Cookie details: name, url",
    },
  ],
  { details: "Cookie details" },
);

registerChromePassthrough(
  "cookies_list",
  "cookies",
  "Get all cookies matching a filter",
  "chrome_cookies_getAll",
  CookiesListParamsSchema,
  [
    {
      name: "details",
      type: "object",
      required: false,
      description: "Filter: url, name, domain, etc.",
    },
  ],
  { details: "Filter details" },
);

registerChromePassthrough(
  "history_search",
  "history",
  "Search browser history",
  "chrome_history_search",
  HistorySearchParamsSchema,
  [
    {
      name: "query",
      type: "object",
      required: true,
      description: "Query: text, startTime, endTime, maxResults",
    },
  ],
  { query: "Query object" },
);

registerChromePassthrough(
  "history_delete",
  "history",
  "Delete a URL from history",
  "chrome_history_deleteUrl",
  HistoryDeleteParamsSchema,
  [
    {
      name: "url",
      type: "string",
      required: true,
      description: "URL to remove",
    },
  ],
  { url: "URL to remove" },
  (params) => {
    if (typeof params === "string") return { url: params };
    const obj = params as Record<string, unknown>;
    return { url: obj.url ?? "" };
  },
);

registerChromePassthrough(
  "bookmarks_search",
  "bookmarks",
  "Search bookmarks",
  "chrome_bookmarks_search",
  BookmarksSearchParamsSchema,
  [
    {
      name: "query",
      type: "string | object",
      required: true,
      description: "Search string or query object",
    },
  ],
  { query: "Search query" },
  (params) => {
    if (typeof params === "string") return params;
    const obj = params as Record<string, unknown>;
    return obj.query ?? "";
  },
);

registerChromePassthrough(
  "bookmarks_create",
  "bookmarks",
  "Create a bookmark",
  "chrome_bookmarks_create",
  BookmarksCreateParamsSchema,
  [
    {
      name: "bookmark",
      type: "object",
      required: true,
      description: "Bookmark details: parentId, title, url, index",
    },
  ],
  { bookmark: "Bookmark details" },
);

registerChromePassthrough(
  "bookmarks_delete",
  "bookmarks",
  "Remove a bookmark",
  "chrome_bookmarks_remove",
  BookmarksDeleteParamsSchema,
  [
    {
      name: "id",
      type: "string",
      required: true,
      description: "Bookmark node ID",
    },
  ],
  { id: "Bookmark node ID" },
  (params) => {
    if (typeof params === "string") return params;
    const obj = params as Record<string, unknown>;
    return obj.id ?? "";
  },
);

registerChromePassthrough(
  "tab_query",
  "tab",
  "Query Chrome tabs matching given criteria",
  "chrome_tabs_query",
  TabQueryParamsSchema,
  [
    {
      name: "query_info",
      type: "object",
      required: true,
      description: "Query filter: active, currentWindow, url, etc.",
    },
  ],
  { query_info: "Query filter" },
);

registerChromePassthrough(
  "tab_create",
  "tab",
  "Create a new Chrome tab",
  "chrome_tabs_create",
  TabCreateParamsSchema,
  [
    {
      name: "create_properties",
      type: "object",
      required: false,
      description: "URL, windowId, active, etc.",
    },
  ],
  { create_properties: "Create properties" },
);

registerChromePassthrough(
  "tab_activate",
  "tab",
  "Activate a tab",
  "chrome_tabs_update",
  TabActivateParamsSchema,
  [
    {
      name: "tabId",
      type: "number",
      required: true,
      description: "Tab ID to activate",
    },
  ],
  { tabId: "Tab ID to activate" },
  (params) => {
    if (typeof params === "number")
      return { tabId: params, update: { active: true } };
    const obj = params as Record<string, unknown>;
    return { tabId: obj.tabId ?? obj.id, update: { active: true } };
  },
);

registerChromePassthrough(
  "tab_close",
  "tab",
  "Close one or more tabs",
  "chrome_tabs_remove",
  TabCloseParamsSchema,
  [
    {
      name: "tabId",
      type: "number",
      required: true,
      description: "Tab ID or array of tab IDs",
    },
  ],
  { tabId: "Tab ID to close" },
  (params) => {
    if (typeof params === "number") return params;
    const obj = params as Record<string, unknown>;
    return obj.tabId ?? obj.id ?? extractTabId(params);
  },
);

registerChromePassthrough(
  "page_close",
  "page",
  "Close the active tab",
  "chrome_tabs_remove",
  PageCloseParamsSchema,
  [
    {
      name: "tabId",
      type: "number",
      required: false,
      description: "Tab ID to close (defaults to active tab)",
    },
  ],
  { tabId: "Tab ID to close" },
  (params) => {
    if (typeof params === "number") return params;
    const obj = params as Record<string, unknown>;
    return obj.tabId ?? obj.id ?? extractTabId(params) ?? getActiveTabId();
  },
);

registerChromePassthrough(
  "page_active_tab",
  "page",
  "Get the active tab",
  "chrome_tabs_query",
  PageActiveTabParamsSchema,
  [],
  {},
  () => ({ active: true, currentWindow: true }),
);

registerChromePassthrough(
  "notifications_create",
  "notifications",
  "Create a notification",
  "chrome_notifications_create",
  NotificationsCreateParamsSchema,
  [
    {
      name: "id",
      type: "string",
      required: false,
      description: "Notification ID",
    },
    {
      name: "options",
      type: "object",
      required: true,
      description: "Notification options: type, title, message, iconUrl",
    },
  ],
  { id: "Notification ID", options: "Notification options" },
  (params) => {
    const obj = params as Record<string, unknown>;
    const id = obj.id ?? "";
    const options = obj.options ?? obj ?? {};
    return { id, options };
  },
);

registerChromePassthrough(
  "notifications_clear",
  "notifications",
  "Clear a notification",
  "chrome_notifications_clear",
  NotificationsClearParamsSchema,
  [
    {
      name: "id",
      type: "string",
      required: true,
      description: "Notification ID to clear",
    },
  ],
  { id: "Notification ID" },
  (params) => {
    if (typeof params === "string") return params;
    const obj = params as Record<string, unknown>;
    return obj.id ?? "";
  },
);

// ─── Sidepanel action registrations ──────────────────────────────

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
  handler: async (params) => dispatchSidepanelTool("sidepanel_click", params),
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
  handler: async (params) =>
    dispatchSidepanelTool("sidepanel_dblclick", params),
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
      required: true,
      description: "Text to fill",
    },
  ],
  returns: z.null(),
  returnDoc: "null",
  errorCode: "ESIDEPANEL",
  errorCategory: "sidepanel",
  paramDocs: { refId: "Element refId", value: "Text to fill" },
  handler: async (params) => dispatchSidepanelTool("sidepanel_fill", params),
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
      required: true,
      description: "Text to type",
    },
  ],
  returns: z.null(),
  returnDoc: "null",
  errorCode: "ESIDEPANEL",
  errorCategory: "sidepanel",
  paramDocs: { refId: "Element refId", text: "Text to type" },
  handler: async (params) => dispatchSidepanelTool("sidepanel_type", params),
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
      required: true,
      description: "Key to press",
    },
  ],
  returns: z.null(),
  returnDoc: "null",
  errorCode: "ESIDEPANEL",
  errorCategory: "sidepanel",
  paramDocs: { key: "Key to press" },
  handler: async (params) => dispatchSidepanelTool("sidepanel_press", params),
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
      required: true,
      description: "Option value to select",
    },
  ],
  returns: z.null(),
  returnDoc: "null",
  errorCode: "ESIDEPANEL",
  errorCategory: "sidepanel",
  paramDocs: { refId: "Element refId", value: "Option value" },
  handler: async (params) => dispatchSidepanelTool("sidepanel_select", params),
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
  handler: async (params) => dispatchSidepanelTool("sidepanel_check", params),
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
  handler: async (params) => dispatchSidepanelTool("sidepanel_hover", params),
});

registerTool({
  action: "sidepanel_unhover",
  namespace: "sidepanel",
  description: "Unhover in the sidepanel",
  params: SidepanelUnhoverParamsSchema,
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
  handler: async (params) => dispatchSidepanelTool("sidepanel_unhover", params),
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
  handler: async (params) => dispatchSidepanelTool("sidepanel_scroll", params),
});

registerTool({
  action: "sidepanel_scroll_to",
  namespace: "sidepanel",
  description: "Scroll to an element in the sidepanel",
  params: SidepanelScrollToParamsSchema,
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
  handler: async (params) =>
    dispatchSidepanelTool("sidepanel_scroll_to", params),
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
      required: true,
      description: "Text to append",
    },
  ],
  returns: z.null(),
  returnDoc: "null",
  errorCode: "ESIDEPANEL",
  errorCategory: "sidepanel",
  paramDocs: { refId: "Element refId", text: "Text to append" },
  handler: async (params) => dispatchSidepanelTool("sidepanel_append", params),
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
  handler: async (params) => dispatchSidepanelTool("sidepanel_url", params),
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
  handler: async (params) => dispatchSidepanelTool("sidepanel_title", params),
});

registerTool({
  action: "sidepanel_wait",
  namespace: "sidepanel",
  description: "Wait for a duration in the sidepanel",
  params: SidepanelWaitParamsSchema,
  paramTypes: [
    {
      name: "duration",
      type: "bigint",
      required: false,
      description: "Milliseconds to wait (default 1000)",
    },
  ],
  returns: z.boolean(),
  returnDoc: "true",
  errorCode: "ESIDEPANEL",
  errorCategory: "sidepanel",
  paramDocs: { duration: "Milliseconds to wait" },
  handler: async (params) => dispatchSidepanelTool("sidepanel_wait", params),
});

registerTool({
  action: "sidepanel_snapshot",
  namespace: "sidepanel",
  description: "Take a DOM snapshot of the sidepanel and return text",
  params: SidepanelSnapshotParamsSchema,
  paramTypes: [
    {
      name: "max_nodes",
      type: "bigint",
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
  handler: async (params) =>
    dispatchSidepanelTool("sidepanel_snapshot", params),
});

registerTool({
  action: "sidepanel_snapshot_text",
  namespace: "sidepanel",
  description: "Take a DOM snapshot of the sidepanel and return text",
  params: SidepanelSnapshotTextParamsSchema,
  paramTypes: [
    {
      name: "max_nodes",
      type: "bigint",
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
  handler: async (params) =>
    dispatchSidepanelTool("sidepanel_snapshot_text", params),
});

registerTool({
  action: "sidepanel_snapshot_data",
  namespace: "sidepanel",
  description: "Take a DOM snapshot of the sidepanel and return full data",
  params: SidepanelSnapshotDataParamsSchema,
  paramTypes: [
    {
      name: "max_nodes",
      type: "bigint",
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
  returns: z.any(),
  returnDoc: "DomSnapshotValue",
  errorCode: "ESIDEPANEL",
  errorCategory: "sidepanel",
  paramDocs: {
    max_nodes: "Maximum nodes",
    interactive_only: "Interactive only",
  },
  handler: async (params) =>
    dispatchSidepanelTool("sidepanel_snapshot_data", params),
});

initExtensionListeners();
