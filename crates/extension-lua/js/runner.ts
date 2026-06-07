/// <reference types="chrome" />
// Main-thread command executor for extension-lua runner
// Handles all commands relayed from the extension Worker.

import {
  collectDocument,
  formatSnapshot,
  init as initDomSnapshot,
} from "@pi-oxide/dom-semantic-tree";

import { z } from "zod";

import {
  type AsyncError,
  type AsyncResponse,
  type Command,
  dispatchTool,
  getTool,
  listTools,
  MergedDocRegistry,
  registerTool,
  type ToolDoc,
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
  SleepParams,
  StorageDeleteParams,
  StorageGetParams,
  StorageSetParams,
} from "./generated.js";

import {
  BookmarksCreateParamsSchema,
  BookmarksDeleteParamsSchema,
  BookmarksSearchParamsSchema,
  ChromeActionSetBadgeBackgroundColorParamsSchema,
  ChromeActionSetBadgeTextParamsSchema,
  ChromeActionSetIconParamsSchema,
  ChromeActionSetTitleParamsSchema,
  ChromeAlarmsClearParamsSchema,
  ChromeAlarmsCreateParamsSchema,
  ChromeContextMenusCreateParamsSchema,
  ChromeContextMenusRemoveParamsSchema,
  ChromeRuntimeSendMessageParamsSchema,
  ChromeScriptingExecuteScriptParamsSchema,
  ChromeSidePanelSetOptionsParamsSchema,
  ChromeTabsCreateParamsSchema,
  ChromeTabsGetParamsSchema,
  ChromeTabsQueryParamsSchema,
  ChromeTabsReloadParamsSchema,
  ChromeTabsRemoveParamsSchema,
  ChromeTabsSendMessageParamsSchema,
  ChromeTabsUpdateParamsSchema,
  ChromeWindowsCreateParamsSchema,
  ChromeWindowsGetAllParamsSchema,
  ChromeWindowsRemoveParamsSchema,
  ChromeWindowsUpdateParamsSchema,
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
  TabEvaluateParamsSchema,
  TabExecuteScriptParamsSchema,
  TabFetchParamsSchema,
  TabFillParamsSchema,
  TabHoverParamsSchema,
  TabPressParamsSchema,
  TabQueryParamsSchema,
  TabScrollParamsSchema,
  TabScrollToParamsSchema,
  TabSelectParamsSchema,
  TabSnapshotDataParamsSchema,
  TabSnapshotParamsSchema,
  TabSnapshotTextParamsSchema,
  TabTypeParamsSchema,
  TabUnhoverParamsSchema,
  TabWaitForLoadParamsSchema,
  ToolDocSchema,
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

// ─── Main command dispatcher ─────────────────────────────────────

export async function executeMainThreadCommand(
  command: Command,
): Promise<AsyncResponse> {
  console.log(
    "[RUNNER execute] action:",
    command.action,
    "params:",
    JSON.stringify(command.params),
  );
  const result = await dispatchTool(command.action, command.params);
  console.log("[RUNNER execute] result:", JSON.stringify(result));
  return result;
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

// ─── Inline snapshot helper for executeInTab ───────────────────

function createInlineSnapshotFunc(): (maxNodesArg: unknown) => unknown {
  return (maxNodesArg: unknown) => {
    const maxNodesNum = typeof maxNodesArg === "number" ? maxNodesArg : 500;

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
      const nodes: Array<{
        refId: number;
        role: string;
        tag: string;
        name?: string;
      }> = [];
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
          const node: {
            refId: number;
            role: string;
            tag: string;
            name?: string;
          } = {
            refId,
            role,
            tag,
          };
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
  };
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

export async function ensureContentScript(tabId: number | null): Promise<void> {
  const chrome = window.chrome;
  if (!chrome?.runtime?.id) {
    const error = new Error("Not in extension context");
    (error as unknown as Record<string, unknown>).code = "E_NO_EXTENSION";
    (error as unknown as Record<string, unknown>).category = "permission";
    throw error;
  }

  const targetTab = typeof tabId === "number" ? tabId : activeTabId;
  if (targetTab === null) {
    const error = new Error("No active tab available");
    (error as unknown as Record<string, unknown>).code = "E_NO_TAB";
    (error as unknown as Record<string, unknown>).category = "resource";
    throw error;
  }

  // Always verify content script is alive — it may have been lost after navigation
  let injected = false;

  for (let attempt = 0; attempt < 6; attempt++) {
    try {
      const pingResult = await chrome.tabs.sendMessage(targetTab, {
        channel: "piccolo-tool",
        version: 1,
        requestId: crypto.randomUUID(),
        action: "__content_script_ping",
        params: {},
      });

      if (
        pingResult &&
        typeof pingResult === "object" &&
        (pingResult as Record<string, unknown>).error !== undefined
      ) {
        throw new Error(String((pingResult as Record<string, unknown>).error));
      }

      try {
        const docsResult = await chrome.tabs.sendMessage(targetTab, {
          channel: "piccolo-tool",
          version: 1,
          requestId: crypto.randomUUID(),
          action: "__content_script_tool_docs",
          params: {},
        });
        if (
          docsResult &&
          typeof docsResult === "object" &&
          (docsResult as Record<string, unknown>).value !== undefined
        ) {
          const docs = (docsResult as Record<string, unknown>).value;
          if (Array.isArray(docs)) {
            mergedDocRegistry.mergeRuntimeDocs(docs as ToolDoc[]);
          }
        }
      } catch (_e) {
        // Ignore docs fetch errors — ping succeeded, content script is ready
      }

      return;
    } catch (err: unknown) {
      const msg = (err instanceof Error ? err.message : String(err)) || "";
      if (msg.includes("Receiving end does not exist") && attempt < 5) {
        if (!injected) {
          try {
            await chrome.scripting.executeScript({
              target: { tabId: targetTab, frameIds: [0] },
              files: ["content-script.js"],
              world: "ISOLATED",
            });
            injected = true;
            await new Promise((resolve) => setTimeout(resolve, 300));
          } catch (_injectErr: unknown) {
            const error = new Error("Content script not ready after injection");
            (error as unknown as Record<string, unknown>).code =
              "E_CONTENT_SCRIPT_NOT_READY";
            (error as unknown as Record<string, unknown>).category =
              "content_script";
            throw error;
          }
        }
        await new Promise((resolve) => setTimeout(resolve, 500));
        continue;
      }
      const error = new Error("Content script not ready after injection");
      (error as unknown as Record<string, unknown>).code =
        "E_CONTENT_SCRIPT_NOT_READY";
      (error as unknown as Record<string, unknown>).category = "content_script";
      throw error;
    }
  }

  const error = new Error("Content script not ready after injection");
  (error as unknown as Record<string, unknown>).code =
    "E_CONTENT_SCRIPT_NOT_READY";
  (error as unknown as Record<string, unknown>).category = "content_script";
  throw error;
}

async function sendBridgeMessageToTab(
  tabId: number | null,
  runnerAction: string,
  params: Record<string, unknown>,
): Promise<AsyncResponse> {
  const tool = getTool(runnerAction);
  if (!tool) {
    return {
      ok: false,
      error: {
        message: `Tool not found: ${runnerAction}`,
        code: "E_TOOL_NOT_FOUND",
      },
    };
  }
  const csAction = tool.localName;
  if (!csAction) {
    return {
      ok: false,
      error: {
        message: `Tool ${runnerAction} has no localName for content script dispatch`,
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

  try {
    await ensureContentScript(targetTab);
  } catch (err: unknown) {
    const code =
      (err as { code?: string }).code ?? "E_CONTENT_SCRIPT_NOT_READY";
    const category =
      (err as { category?: string }).category ?? "content_script";
    const msg = err instanceof Error ? err.message : String(err);
    return {
      ok: false,
      error: { message: msg, code, category },
    };
  }

  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      const result = await chrome.tabs.sendMessage(targetTab, {
        channel: "piccolo-tool",
        version: 1,
        requestId: crypto.randomUUID(),
        action: message.action,
        params: message.params,
      });

      if (result && typeof result === "object") {
        const obj = result as Record<string, unknown>;
        if (obj.error !== undefined) {
          const msg =
            typeof obj.error === "string" ? obj.error : String(obj.error);
          return {
            ok: false,
            error: {
              message: msg || "Content script error",
              code: "E_CONTENT_SCRIPT",
            },
          };
        }
        if (obj.value !== undefined) {
          return { ok: true, value: obj.value };
        }
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
      max_nodes: params.max_nodes ?? 500,
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
      max_nodes: params.max_nodes ?? 500,
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
      max_nodes: params.max_nodes ?? 500,
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

// ─── Host call handler ───────────────────────────────────────────

async function _handleHostCallAction(
  action: string,
  params: unknown,
): Promise<AsyncResponse<unknown>> {
  const result = await chromeApiCall(
    chrome.runtime.sendMessage({ action, params }),
  );
  return { ok: true, value: result };
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

// ─── Chrome API helpers ────────────────────────────────────────

function assertExtensionContext(action: string): void {
  const chrome = window.chrome;
  if (!chrome?.runtime?.id) {
    const error = new Error(
      `${action} is only available in a browser extension context`,
    );
    (error as unknown as Record<string, unknown>).code = "E_NO_EXTENSION";
    (error as unknown as Record<string, unknown>).category = "permission";
    throw error;
  }
}

async function chromeApiCall<T>(promise: Promise<T>): Promise<T> {
  try {
    return await promise;
  } catch (err: unknown) {
    const normalized = normalizeChromeError(err);
    const error = new Error(normalized.error.message);
    (error as unknown as Record<string, unknown>).code = normalized.error.code;
    (error as unknown as Record<string, unknown>).category =
      normalized.error.category;
    throw error;
  }
}

// ─── Chrome API handlers ───────────────────────────────────────

async function handleChromeRuntimeSendMessage(
  params: z.infer<typeof ChromeRuntimeSendMessageParamsSchema>,
): Promise<unknown> {
  assertExtensionContext("chrome_runtime_sendMessage");
  return chromeApiCall(chrome.runtime.sendMessage(params));
}

async function handleChromeTabsQuery(
  params: z.infer<typeof ChromeTabsQueryParamsSchema>,
): Promise<chrome.tabs.Tab[]> {
  assertExtensionContext("chrome_tabs_query");
  return chromeApiCall(chrome.tabs.query(params as chrome.tabs.QueryInfo));
}

async function handleChromeTabsCreate(
  params: z.infer<typeof ChromeTabsCreateParamsSchema>,
): Promise<chrome.tabs.Tab> {
  assertExtensionContext("chrome_tabs_create");
  // Handle string URL shorthand: tab.open("https://example.com")
  const createProps =
    typeof params === "string"
      ? { url: params }
      : (params as chrome.tabs.CreateProperties);
  return chromeApiCall(chrome.tabs.create(createProps));
}

async function handleChromeTabsUpdate(
  params: z.infer<typeof ChromeTabsUpdateParamsSchema>,
): Promise<chrome.tabs.Tab> {
  assertExtensionContext("chrome_tabs_update");
  const tabId = params.tabId ?? null;
  const updateProps = params.update ?? {};
  return chromeApiCall(
    chrome.tabs.update(
      typeof tabId === "number" ? tabId : (null as unknown as number),
      updateProps as chrome.tabs.UpdateProperties,
    ),
  );
}

async function handleChromeTabsRemove(
  params: z.infer<typeof ChromeTabsRemoveParamsSchema>,
): Promise<null> {
  assertExtensionContext("chrome_tabs_remove");
  const tabId =
    typeof params === "number"
      ? params
      : Array.isArray(params)
        ? params
        : (params.tabId ?? params.id);
  if (Array.isArray(tabId)) {
    await chromeApiCall(chrome.tabs.remove(tabId));
  } else {
    await chromeApiCall(chrome.tabs.remove(tabId as number));
  }
  return null;
}

async function handleChromeTabsGet(
  params: z.infer<typeof ChromeTabsGetParamsSchema>,
): Promise<chrome.tabs.Tab> {
  assertExtensionContext("chrome_tabs_get");
  const tabId =
    typeof params === "number" ? params : (params.tabId ?? params.id);
  return chromeApiCall(chrome.tabs.get(tabId as number));
}

async function handleChromeTabsReload(
  params: z.infer<typeof ChromeTabsReloadParamsSchema>,
): Promise<null> {
  assertExtensionContext("chrome_tabs_reload");
  const tabId = params.tabId;
  const reloadProps = params.reload ?? {};
  await chromeApiCall(
    chrome.tabs.reload(
      typeof tabId === "number" ? tabId : (undefined as unknown as number),
      reloadProps as chrome.tabs.ReloadProperties,
    ),
  );
  return null;
}

async function handleChromeTabsSendMessage(
  params: z.infer<typeof ChromeTabsSendMessageParamsSchema>,
): Promise<unknown> {
  assertExtensionContext("chrome_tabs_sendMessage");
  const tabId = params.tabId;
  const message = params.message;
  return chromeApiCall(chrome.tabs.sendMessage(tabId as number, message));
}

async function handleChromeAlarmsCreate(
  params: z.infer<typeof ChromeAlarmsCreateParamsSchema>,
): Promise<null> {
  assertExtensionContext("chrome_alarms_create");
  const name = params.name ?? "";
  const alarmInfo = params.alarmInfo ?? {};
  await chromeApiCall(chrome.alarms.create(name, alarmInfo));
  return null;
}

async function handleChromeAlarmsClear(
  params: z.infer<typeof ChromeAlarmsClearParamsSchema>,
): Promise<boolean> {
  assertExtensionContext("chrome_alarms_clear");
  const alarmName = typeof params === "string" ? params : (params.name ?? "");
  return chromeApiCall(chrome.alarms.clear(alarmName));
}

async function handleChromeActionSetBadgeText(
  params: z.infer<typeof ChromeActionSetBadgeTextParamsSchema>,
): Promise<null> {
  assertExtensionContext("chrome_action_setBadgeText");
  await chromeApiCall(
    chrome.action.setBadgeText(
      params as unknown as chrome.action.BadgeTextDetails,
    ),
  );
  return null;
}

async function handleChromeActionSetBadgeBackgroundColor(
  params: z.infer<typeof ChromeActionSetBadgeBackgroundColorParamsSchema>,
): Promise<null> {
  assertExtensionContext("chrome_action_setBadgeBackgroundColor");
  await chromeApiCall(
    chrome.action.setBadgeBackgroundColor(
      params as unknown as chrome.action.BadgeBackgroundColorDetails,
    ),
  );
  return null;
}

async function handleChromeActionSetTitle(
  params: z.infer<typeof ChromeActionSetTitleParamsSchema>,
): Promise<null> {
  assertExtensionContext("chrome_action_setTitle");
  await chromeApiCall(
    chrome.action.setTitle(params as unknown as chrome.action.TitleDetails),
  );
  return null;
}

async function handleChromeActionSetIcon(
  params: z.infer<typeof ChromeActionSetIconParamsSchema>,
): Promise<unknown> {
  assertExtensionContext("chrome_action_setIcon");
  return chromeApiCall(
    chrome.action.setIcon(params as unknown as chrome.action.TabIconDetails),
  );
}

async function handleChromeContextMenusCreate(
  params: z.infer<typeof ChromeContextMenusCreateParamsSchema>,
): Promise<unknown> {
  assertExtensionContext("chrome_contextMenus_create");
  return new Promise((resolve, reject) => {
    chrome.contextMenus.create(params, () => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
      } else {
        resolve(undefined);
      }
    });
  });
}

async function handleChromeContextMenusRemove(
  params: z.infer<typeof ChromeContextMenusRemoveParamsSchema>,
): Promise<null> {
  assertExtensionContext("chrome_contextMenus_remove");
  const menuId =
    typeof params === "number" || typeof params === "string"
      ? params
      : (params.menuItemId ?? params.id);
  await chrome.contextMenus.remove(menuId as string | number);
  return null;
}

async function handleChromeWindowsGetAll(
  params: z.infer<typeof ChromeWindowsGetAllParamsSchema>,
): Promise<chrome.windows.Window[]> {
  assertExtensionContext("chrome_windows_getAll");
  return chromeApiCall(
    chrome.windows.getAll(params as chrome.windows.QueryOptions),
  );
}

async function handleChromeWindowsCreate(
  params: z.infer<typeof ChromeWindowsCreateParamsSchema>,
): Promise<chrome.windows.Window> {
  assertExtensionContext("chrome_windows_create");
  return chromeApiCall(chrome.windows.create(params));
}

async function handleChromeWindowsUpdate(
  params: z.infer<typeof ChromeWindowsUpdateParamsSchema>,
): Promise<chrome.windows.Window> {
  assertExtensionContext("chrome_windows_update");
  const windowId = params.windowId;
  const updateInfo = params.update ?? {};
  return chromeApiCall(chrome.windows.update(windowId as number, updateInfo));
}

async function handleChromeWindowsRemove(
  params: z.infer<typeof ChromeWindowsRemoveParamsSchema>,
): Promise<null> {
  assertExtensionContext("chrome_windows_remove");
  const windowId = typeof params === "number" ? params : params.windowId;
  await chromeApiCall(chrome.windows.remove(windowId as number));
  return null;
}

async function handleChromeSidePanelSetOptions(
  params: z.infer<typeof ChromeSidePanelSetOptionsParamsSchema>,
): Promise<null> {
  assertExtensionContext("chrome_sidePanel_setOptions");
  await chromeApiCall(chrome.sidePanel.setOptions(params));
  return null;
}

async function handleChromeCookiesGet(
  params: z.infer<typeof CookiesGetParamsSchema>,
): Promise<chrome.cookies.Cookie | null> {
  assertExtensionContext("chrome_cookies_get");
  return chromeApiCall(chrome.cookies.get(params as chrome.cookies.Details));
}

async function handleChromeCookiesSet(
  params: z.infer<typeof CookiesSetParamsSchema>,
): Promise<chrome.cookies.Cookie | null> {
  assertExtensionContext("chrome_cookies_set");
  return chromeApiCall(chrome.cookies.set(params as chrome.cookies.SetDetails));
}

async function handleChromeCookiesRemove(
  params: z.infer<typeof CookiesDeleteParamsSchema>,
): Promise<chrome.cookies.Details> {
  assertExtensionContext("chrome_cookies_remove");
  return chromeApiCall(chrome.cookies.remove(params as chrome.cookies.Details));
}

async function handleChromeCookiesGetAll(
  params: z.infer<typeof CookiesListParamsSchema>,
): Promise<chrome.cookies.Cookie[]> {
  assertExtensionContext("chrome_cookies_getAll");
  return chromeApiCall(chrome.cookies.getAll(params as chrome.cookies.Details));
}

async function handleChromeBookmarksSearch(
  params: z.infer<typeof BookmarksSearchParamsSchema>,
): Promise<chrome.bookmarks.BookmarkTreeNode[]> {
  assertExtensionContext("chrome_bookmarks_search");
  const query = typeof params === "string" ? params : (params.query ?? "");
  return chromeApiCall(chrome.bookmarks.search(query));
}

async function handleChromeBookmarksCreate(
  params: z.infer<typeof BookmarksCreateParamsSchema>,
): Promise<chrome.bookmarks.BookmarkTreeNode> {
  assertExtensionContext("chrome_bookmarks_create");
  return chromeApiCall(chrome.bookmarks.create(params));
}

async function handleChromeBookmarksRemove(
  params: z.infer<typeof BookmarksDeleteParamsSchema>,
): Promise<null> {
  assertExtensionContext("chrome_bookmarks_remove");
  const bookmarkId = typeof params === "string" ? params : (params.id ?? "");
  await chromeApiCall(chrome.bookmarks.remove(bookmarkId));
  return null;
}

async function handleChromeHistorySearch(
  params: z.infer<typeof HistorySearchParamsSchema>,
): Promise<chrome.history.HistoryItem[]> {
  assertExtensionContext("chrome_history_search");
  return chromeApiCall(
    chrome.history.search(params as chrome.history.HistoryQuery),
  );
}

async function handleChromeHistoryDeleteUrl(
  params: z.infer<typeof HistoryDeleteParamsSchema>,
): Promise<null> {
  assertExtensionContext("chrome_history_deleteUrl");
  const url = typeof params === "string" ? params : (params.url ?? "");
  await chromeApiCall(
    chrome.history.deleteUrl(url as unknown as chrome.history.Url),
  );
  return null;
}

async function handleChromeNotificationsCreate(
  params: z.infer<typeof NotificationsCreateParamsSchema>,
): Promise<string> {
  assertExtensionContext("chrome_notifications_create");
  const obj =
    typeof params === "string"
      ? { id: params, options: {} }
      : { id: params.id ?? "", options: params.options ?? params };
  return new Promise((resolve, reject) => {
    chrome.notifications.create(
      obj.id,
      obj.options as unknown as chrome.notifications.NotificationOptions<true>,
      (notificationId) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
        } else {
          resolve(notificationId ?? "");
        }
      },
    );
  });
}

async function handleChromeNotificationsClear(
  params: z.infer<typeof NotificationsClearParamsSchema>,
): Promise<boolean> {
  assertExtensionContext("chrome_notifications_clear");
  const notifId = typeof params === "string" ? params : (params.id ?? "");
  return new Promise((resolve, reject) => {
    chrome.notifications.clear(notifId, (wasCleared) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
      } else {
        resolve(wasCleared ?? false);
      }
    });
  });
}

async function handleChromeScriptingExecuteScript(
  params: z.infer<typeof ChromeScriptingExecuteScriptParamsSchema>,
): Promise<unknown> {
  assertExtensionContext("chrome_scripting_executeScript");
  return chromeApiCall(
    chrome.scripting.executeScript(
      params as chrome.scripting.ScriptInjection<unknown[], unknown>,
    ),
  );
}

// ─── Tool registrations ──────────────────────────────────────────

// ─── Chrome API tool registrations ───────────────────────────────

registerTool({
  action: "chrome_runtime_sendMessage",
  namespace: "chrome",
  name: "runtime.sendMessage",
  publicName: "chrome.runtime.sendMessage",
  source: "main_thread",
  transport: "chrome_api",
  description:
    "Send a message to the extension background script or another extension",
  params: ChromeRuntimeSendMessageParamsSchema,
  paramTypes: [
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
      description: "Options: to, includeTlsChannelId",
    },
  ],
  returns: z.unknown(),
  returnDoc: "any",
  errorCode: "ECHROME",
  errorCategory: "extension",
  paramDocs: { message: "Message payload", options: "Options" },
  handler: handleChromeRuntimeSendMessage,
});

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
      required: true,
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
      required: true,
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
      required: true,
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

registerTool({
  action: "chrome_alarms_create",
  namespace: "chrome",
  name: "alarms.create",
  publicName: "chrome.alarms.create",
  source: "main_thread",
  transport: "chrome_api",
  description: "Create an alarm",
  params: ChromeAlarmsCreateParamsSchema,
  paramTypes: [
    {
      name: "name",
      type: "string",
      required: false,
      description: "Alarm name",
    },
    {
      name: "alarmInfo",
      type: "object",
      required: false,
      description: "When: delayInMinutes, periodInMinutes",
    },
  ],
  returns: z.null(),
  returnDoc: "null",
  errorCode: "ECHROME",
  errorCategory: "extension",
  paramDocs: { name: "Alarm name", alarmInfo: "Alarm info" },
  handler: handleChromeAlarmsCreate,
});

registerTool({
  action: "chrome_alarms_clear",
  namespace: "chrome",
  name: "alarms.clear",
  publicName: "chrome.alarms.clear",
  source: "main_thread",
  transport: "chrome_api",
  description: "Clear an alarm",
  params: ChromeAlarmsClearParamsSchema,
  paramTypes: [
    {
      name: "name",
      type: "string",
      required: false,
      description: "Alarm name (omit clears all)",
    },
  ],
  returns: z.boolean(),
  returnDoc: "boolean",
  errorCode: "ECHROME",
  errorCategory: "extension",
  paramDocs: { name: "Alarm name" },
  handler: handleChromeAlarmsClear,
});

registerTool({
  action: "chrome_action_setBadgeText",
  namespace: "chrome",
  name: "action.setBadgeText",
  publicName: "chrome.action.setBadgeText",
  source: "main_thread",
  transport: "chrome_api",
  description: "Set the badge text on the extension action icon",
  params: ChromeActionSetBadgeTextParamsSchema,
  paramTypes: [
    {
      name: "details",
      type: "object",
      required: true,
      description: "text, tabId",
    },
  ],
  returns: z.null(),
  returnDoc: "null",
  errorCode: "ECHROME",
  errorCategory: "extension",
  paramDocs: { details: "Badge text details" },
  handler: handleChromeActionSetBadgeText,
});

registerTool({
  action: "chrome_action_setBadgeBackgroundColor",
  namespace: "chrome",
  name: "action.setBadgeBackgroundColor",
  publicName: "chrome.action.setBadgeBackgroundColor",
  source: "main_thread",
  transport: "chrome_api",
  description: "Set the badge background color",
  params: ChromeActionSetBadgeBackgroundColorParamsSchema,
  paramTypes: [
    {
      name: "details",
      type: "object",
      required: true,
      description: "color, tabId",
    },
  ],
  returns: z.null(),
  returnDoc: "null",
  errorCode: "ECHROME",
  errorCategory: "extension",
  paramDocs: { details: "Color details" },
  handler: handleChromeActionSetBadgeBackgroundColor,
});

registerTool({
  action: "chrome_action_setTitle",
  namespace: "chrome",
  name: "action.setTitle",
  publicName: "chrome.action.setTitle",
  source: "main_thread",
  transport: "chrome_api",
  description: "Set the title of the extension action",
  params: ChromeActionSetTitleParamsSchema,
  paramTypes: [
    {
      name: "details",
      type: "object",
      required: true,
      description: "title, tabId",
    },
  ],
  returns: z.null(),
  returnDoc: "null",
  errorCode: "ECHROME",
  errorCategory: "extension",
  paramDocs: { details: "Title details" },
  handler: handleChromeActionSetTitle,
});

registerTool({
  action: "chrome_action_setIcon",
  namespace: "chrome",
  name: "action.setIcon",
  publicName: "chrome.action.setIcon",
  source: "main_thread",
  transport: "chrome_api",
  description: "Set the icon of the extension action",
  params: ChromeActionSetIconParamsSchema,
  paramTypes: [
    {
      name: "details",
      type: "object",
      required: true,
      description: "imageData, path, tabId",
    },
  ],
  returns: z.unknown(),
  returnDoc: "any",
  errorCode: "ECHROME",
  errorCategory: "extension",
  paramDocs: { details: "Icon details" },
  handler: handleChromeActionSetIcon,
});

registerTool({
  action: "chrome_contextMenus_create",
  namespace: "chrome",
  name: "contextMenus.create",
  publicName: "chrome.contextMenus.create",
  source: "main_thread",
  transport: "chrome_api",
  description: "Create a context menu item",
  params: ChromeContextMenusCreateParamsSchema,
  paramTypes: [
    {
      name: "details",
      type: "object",
      required: true,
      description: "Menu item properties",
    },
  ],
  returns: z.unknown(),
  returnDoc: "string | number",
  errorCode: "ECHROME",
  errorCategory: "extension",
  paramDocs: { details: "Menu item properties" },
  handler: handleChromeContextMenusCreate,
});

registerTool({
  action: "chrome_contextMenus_remove",
  namespace: "chrome",
  name: "contextMenus.remove",
  publicName: "chrome.contextMenus.remove",
  source: "main_thread",
  transport: "chrome_api",
  description: "Remove a context menu item",
  params: ChromeContextMenusRemoveParamsSchema,
  paramTypes: [
    {
      name: "menuItemId",
      type: "string | number",
      required: true,
      description: "Menu item ID",
    },
  ],
  returns: z.null(),
  returnDoc: "null",
  errorCode: "ECHROME",
  errorCategory: "extension",
  paramDocs: { menuItemId: "Menu item ID" },
  handler: handleChromeContextMenusRemove,
});

registerTool({
  action: "chrome_windows_getAll",
  namespace: "chrome",
  name: "windows.getAll",
  publicName: "chrome.windows.getAll",
  source: "main_thread",
  transport: "chrome_api",
  description: "Get all windows",
  params: ChromeWindowsGetAllParamsSchema,
  paramTypes: [
    {
      name: "populate",
      type: "boolean",
      required: false,
      description: "Whether to populate tabs",
    },
    {
      name: "windowTypes",
      type: "string[]",
      required: false,
      description: "Window types to filter",
    },
  ],
  returns: z.array(z.unknown()),
  returnDoc: "Window[]",
  errorCode: "ECHROME",
  errorCategory: "extension",
  paramDocs: { populate: "Populate tabs", windowTypes: "Window types" },
  handler: handleChromeWindowsGetAll,
});

registerTool({
  action: "chrome_windows_create",
  namespace: "chrome",
  name: "windows.create",
  publicName: "chrome.windows.create",
  source: "main_thread",
  transport: "chrome_api",
  description: "Create a new window",
  params: ChromeWindowsCreateParamsSchema,
  paramTypes: [
    {
      name: "createData",
      type: "object",
      required: false,
      description: "Window properties",
    },
  ],
  returns: z.unknown(),
  returnDoc: "Window",
  errorCode: "ECHROME",
  errorCategory: "extension",
  paramDocs: { createData: "Window properties" },
  handler: handleChromeWindowsCreate,
});

registerTool({
  action: "chrome_windows_update",
  namespace: "chrome",
  name: "windows.update",
  publicName: "chrome.windows.update",
  source: "main_thread",
  transport: "chrome_api",
  description: "Update a window",
  params: ChromeWindowsUpdateParamsSchema,
  paramTypes: [
    {
      name: "windowId",
      type: "number",
      required: false,
      description: "Window ID",
    },
    {
      name: "update",
      type: "object",
      required: false,
      description: "Update properties",
    },
  ],
  returns: z.unknown(),
  returnDoc: "Window",
  errorCode: "ECHROME",
  errorCategory: "extension",
  paramDocs: { windowId: "Window ID", update: "Update properties" },
  handler: handleChromeWindowsUpdate,
});

registerTool({
  action: "chrome_windows_remove",
  namespace: "chrome",
  name: "windows.remove",
  publicName: "chrome.windows.remove",
  source: "main_thread",
  transport: "chrome_api",
  description: "Remove a window",
  params: ChromeWindowsRemoveParamsSchema,
  paramTypes: [
    {
      name: "windowId",
      type: "number",
      required: true,
      description: "Window ID",
    },
  ],
  returns: z.null(),
  returnDoc: "null",
  errorCode: "ECHROME",
  errorCategory: "extension",
  paramDocs: { windowId: "Window ID" },
  handler: handleChromeWindowsRemove,
});

registerTool({
  action: "chrome_sidePanel_setOptions",
  namespace: "chrome",
  name: "sidePanel.setOptions",
  publicName: "chrome.sidePanel.setOptions",
  source: "main_thread",
  transport: "chrome_api",
  description: "Set side panel options",
  params: ChromeSidePanelSetOptionsParamsSchema,
  paramTypes: [
    {
      name: "options",
      type: "object",
      required: true,
      description: "Side panel options",
    },
  ],
  returns: z.null(),
  returnDoc: "null",
  errorCode: "ECHROME",
  errorCategory: "extension",
  paramDocs: { options: "Side panel options" },
  handler: handleChromeSidePanelSetOptions,
});

registerTool({
  action: "chrome_cookies_get",
  namespace: "chrome",
  name: "cookies.get",
  publicName: "chrome.cookies.get",
  source: "main_thread",
  transport: "chrome_api",
  description: "Get a cookie by details",
  params: CookiesGetParamsSchema,
  paramTypes: [
    {
      name: "details",
      type: "object",
      required: true,
      description: "Cookie details: name, url, storeId",
    },
  ],
  returns: z.unknown(),
  returnDoc: "Cookie | null",
  errorCode: "ECHROME",
  errorCategory: "extension",
  paramDocs: { details: "Cookie details" },
  handler: handleChromeCookiesGet,
});

registerTool({
  action: "chrome_cookies_set",
  namespace: "chrome",
  name: "cookies.set",
  publicName: "chrome.cookies.set",
  source: "main_thread",
  transport: "chrome_api",
  description: "Set a cookie",
  params: CookiesSetParamsSchema,
  paramTypes: [
    {
      name: "details",
      type: "object",
      required: true,
      description: "Cookie details: name, value, url, etc.",
    },
  ],
  returns: z.unknown(),
  returnDoc: "Cookie | null",
  errorCode: "ECHROME",
  errorCategory: "extension",
  paramDocs: { details: "Cookie details" },
  handler: handleChromeCookiesSet,
});

registerTool({
  action: "chrome_cookies_remove",
  namespace: "chrome",
  name: "cookies.remove",
  publicName: "chrome.cookies.remove",
  source: "main_thread",
  transport: "chrome_api",
  description: "Remove a cookie",
  params: CookiesDeleteParamsSchema,
  paramTypes: [
    {
      name: "details",
      type: "object",
      required: true,
      description: "Cookie details: name, url",
    },
  ],
  returns: z.unknown(),
  returnDoc: "Details",
  errorCode: "ECHROME",
  errorCategory: "extension",
  paramDocs: { details: "Cookie details" },
  handler: handleChromeCookiesRemove,
});

registerTool({
  action: "chrome_cookies_getAll",
  namespace: "chrome",
  name: "cookies.getAll",
  publicName: "chrome.cookies.getAll",
  source: "main_thread",
  transport: "chrome_api",
  description: "Get all cookies matching a filter",
  params: CookiesListParamsSchema,
  paramTypes: [
    {
      name: "details",
      type: "object",
      required: false,
      description: "Filter: url, name, domain, etc.",
    },
  ],
  returns: z.array(z.unknown()),
  returnDoc: "Cookie[]",
  errorCode: "ECHROME",
  errorCategory: "extension",
  paramDocs: { details: "Filter details" },
  handler: handleChromeCookiesGetAll,
});

registerTool({
  action: "chrome_bookmarks_search",
  namespace: "chrome",
  name: "bookmarks.search",
  publicName: "chrome.bookmarks.search",
  source: "main_thread",
  transport: "chrome_api",
  description: "Search bookmarks",
  params: BookmarksSearchParamsSchema,
  paramTypes: [
    {
      name: "query",
      type: "string | object",
      required: true,
      description: "Search string or query object",
    },
  ],
  returns: z.array(z.unknown()),
  returnDoc: "BookmarkTreeNode[]",
  errorCode: "ECHROME",
  errorCategory: "extension",
  paramDocs: { query: "Search query" },
  handler: handleChromeBookmarksSearch,
});

registerTool({
  action: "chrome_bookmarks_create",
  namespace: "chrome",
  name: "bookmarks.create",
  publicName: "chrome.bookmarks.create",
  source: "main_thread",
  transport: "chrome_api",
  description: "Create a bookmark",
  params: BookmarksCreateParamsSchema,
  paramTypes: [
    {
      name: "bookmark",
      type: "object",
      required: true,
      description: "Bookmark details: parentId, title, url, index",
    },
  ],
  returns: z.unknown(),
  returnDoc: "BookmarkTreeNode",
  errorCode: "ECHROME",
  errorCategory: "extension",
  paramDocs: { bookmark: "Bookmark details" },
  handler: handleChromeBookmarksCreate,
});

registerTool({
  action: "chrome_bookmarks_remove",
  namespace: "chrome",
  name: "bookmarks.remove",
  publicName: "chrome.bookmarks.remove",
  source: "main_thread",
  transport: "chrome_api",
  description: "Remove a bookmark",
  params: BookmarksDeleteParamsSchema,
  paramTypes: [
    {
      name: "id",
      type: "string",
      required: true,
      description: "Bookmark node ID",
    },
  ],
  returns: z.null(),
  returnDoc: "null",
  errorCode: "ECHROME",
  errorCategory: "extension",
  paramDocs: { id: "Bookmark node ID" },
  handler: handleChromeBookmarksRemove,
});

registerTool({
  action: "chrome_history_search",
  namespace: "chrome",
  name: "history.search",
  publicName: "chrome.history.search",
  source: "main_thread",
  transport: "chrome_api",
  description: "Search browser history",
  params: HistorySearchParamsSchema,
  paramTypes: [
    {
      name: "query",
      type: "object",
      required: true,
      description: "Query: text, startTime, endTime, maxResults",
    },
  ],
  returns: z.array(z.unknown()),
  returnDoc: "HistoryItem[]",
  errorCode: "ECHROME",
  errorCategory: "extension",
  paramDocs: { query: "Query object" },
  handler: handleChromeHistorySearch,
});

registerTool({
  action: "chrome_history_deleteUrl",
  namespace: "chrome",
  name: "history.deleteUrl",
  publicName: "chrome.history.deleteUrl",
  source: "main_thread",
  transport: "chrome_api",
  description: "Delete a URL from history",
  params: HistoryDeleteParamsSchema,
  paramTypes: [
    {
      name: "url",
      type: "string",
      required: true,
      description: "URL to remove",
    },
  ],
  returns: z.null(),
  returnDoc: "null",
  errorCode: "ECHROME",
  errorCategory: "extension",
  paramDocs: { url: "URL to remove" },
  handler: handleChromeHistoryDeleteUrl,
});

registerTool({
  action: "chrome_notifications_create",
  namespace: "chrome",
  name: "notifications.create",
  publicName: "chrome.notifications.create",
  source: "main_thread",
  transport: "chrome_api",
  description: "Create a notification",
  params: NotificationsCreateParamsSchema,
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
      required: true,
      description: "Notification options: type, title, message, iconUrl",
    },
  ],
  returns: z.string(),
  returnDoc: "string",
  errorCode: "ECHROME",
  errorCategory: "extension",
  paramDocs: { id: "Notification ID", options: "Notification options" },
  handler: handleChromeNotificationsCreate,
});

registerTool({
  action: "chrome_notifications_clear",
  namespace: "chrome",
  name: "notifications.clear",
  publicName: "chrome.notifications.clear",
  source: "main_thread",
  transport: "chrome_api",
  description: "Clear a notification",
  params: NotificationsClearParamsSchema,
  paramTypes: [
    {
      name: "id",
      type: "string",
      required: true,
      description: "Notification ID to clear",
    },
  ],
  returns: z.boolean(),
  returnDoc: "boolean",
  errorCode: "ECHROME",
  errorCategory: "extension",
  paramDocs: { id: "Notification ID" },
  handler: handleChromeNotificationsClear,
});

registerTool({
  action: "chrome_scripting_executeScript",
  namespace: "chrome",
  name: "scripting.executeScript",
  publicName: "chrome.scripting.executeScript",
  source: "main_thread",
  transport: "chrome_api",
  description: "Execute a script in a tab",
  params: ChromeScriptingExecuteScriptParamsSchema,
  paramTypes: [
    {
      name: "target",
      type: "object",
      required: false,
      description: "Target: tabId",
    },
    {
      name: "func",
      type: "function",
      required: false,
      description: "Function to execute",
    },
    {
      name: "args",
      type: "array",
      required: false,
      description: "Function arguments",
    },
    {
      name: "world",
      type: "string",
      required: false,
      description: "Execution world: MAIN or ISOLATED",
    },
    {
      name: "files",
      type: "string[]",
      required: false,
      description: "Script files to inject",
    },
  ],
  returns: z.array(z.unknown()),
  returnDoc: "InjectionResult[]",
  errorCode: "ECHROME",
  errorCategory: "extension",
  paramDocs: {
    target: "Target",
    func: "Function",
    args: "Arguments",
    world: "Execution world",
    files: "Script files",
  },
  handler: handleChromeScriptingExecuteScript,
});

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
  returns: z.string().nullable(),
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
  params: FetchParamsSchema,
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
  returns: z.object({
    status: z.number(),
    ok: z.boolean(),
    headers: z.record(z.string()),
    body: z.string(),
  }),
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
  returns: z.object({
    status: z.number(),
    ok: z.boolean(),
    headers: z.record(z.string()),
    body: z.string(),
    matches: z.array(z.object({ tag: z.string(), text: z.string() })),
  }),
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
  returns: z.null(),
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
  returns: z.null(),
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
  returns: z.null(),
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
  returns: z.null(),
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
  returns: z.null(),
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
  returns: z.null(),
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
  returns: z.null(),
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
  returns: z.null(),
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
  returns: z.null(),
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
  returns: z.unknown(),
  returnDoc: "boolean",
  errorCode: "EPAGE",
  errorCategory: "page",
  paramDocs: { url: "URL to navigate to" },
  handler: async (params) => {
    const tabId = getActiveTabId();
    if (tabId === null) throw new Error("No active tab");
    const result = await dispatchTool("chrome_tabs_update", {
      tabId,
      update: { url: params.url },
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
  returns: z.unknown(),
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
  returns: z.unknown(),
  returnDoc: "boolean",
  errorCode: "EPAGE",
  errorCategory: "page",
  paramDocs: {},
  handler: async () => {
    const tabId = getActiveTabId();
    if (tabId === null) throw new Error("No active tab");
    const result = await dispatchTool("chrome_tabs_reload", { tabId });
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
  returns: z.null(),
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
  returns: z.null(),
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
  returns: z.null(),
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
  returns: z.null(),
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
  returns: z.null(),
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
  returns: z.null(),
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
  returns: z.null(),
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
  returns: z.null(),
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
  returns: z.null(),
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

registerTool({
  action: "tab_evaluate",
  namespace: "tab",
  description: "Evaluate JavaScript in a target tab",
  params: TabEvaluateParamsSchema,
  paramTypes: [
    {
      name: "tabId",
      type: "bigint",
      required: true,
      description: "Target tab ID",
    },
    {
      name: "script",
      type: "string",
      required: true,
      description: "JavaScript code to evaluate",
    },
  ],
  returns: z.unknown(),
  returnDoc: "any",
  errorCode: "ETAB",
  errorCategory: "tab",
  paramDocs: {
    tabId: "Target tab ID",
    script: "JavaScript code to evaluate",
  },
  handler: async (params) => {
    const targetTab = Number(params.tabId);
    const codeStr = String(params.script);
    const evalFunc = (code: string) => {
      // biome-ignore lint/security/noGlobalEval: Chrome executeScript context only supports eval, not new Function()
      return eval(code);
    };
    const results = await chrome.scripting.executeScript({
      target: { tabId: targetTab },
      func: evalFunc,
      args: [codeStr],
      world: "MAIN",
    });
    if (results?.[0]) {
      const first = results[0] as (typeof results)[0] & { error?: unknown };
      if (first.error) {
        const error = new Error(String(first.error));
        (error as unknown as Record<string, unknown>).code =
          "E_SCRIPT_EXECUTION";
        (error as unknown as Record<string, unknown>).category = "script";
        throw error;
      }
      return first.result;
    }
    return null;
  },
});

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
  "tab_execute_script",
  "tab",
  "Execute JavaScript in a target tab",
  "chrome_scripting_executeScript",
  TabExecuteScriptParamsSchema,
  [
    {
      name: "target",
      type: "object",
      required: false,
      description: "Target: tabId",
    },
    {
      name: "func",
      type: "function",
      required: false,
      description: "Function to execute",
    },
    {
      name: "args",
      type: "array",
      required: false,
      description: "Function arguments",
    },
    {
      name: "world",
      type: "string",
      required: false,
      description: "Execution world: MAIN or ISOLATED",
    },
    {
      name: "files",
      type: "string[]",
      required: false,
      description: "Script files to inject",
    },
  ],
  {
    target: "Target",
    func: "Function",
    args: "Arguments",
    world: "Execution world",
    files: "Script files",
  },
);

registerTool({
  action: "tab_scroll_to",
  namespace: "tab",
  description: "Scroll to coordinates or an element in a target tab",
  params: TabScrollToParamsSchema,
  paramTypes: [
    {
      name: "tabId",
      type: "bigint",
      required: true,
      description: "Target tab ID",
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
    {
      name: "refId",
      type: "string",
      required: false,
      description: "Element refId to scroll to",
    },
  ],
  returns: z.boolean(),
  returnDoc: "boolean",
  errorCode: "ETAB",
  errorCategory: "tab",
  paramDocs: {
    tabId: "Target tab ID",
    x: "X coordinate",
    y: "Y coordinate",
    refId: "Element refId to scroll to",
  },
  handler: async (params) => {
    return bridgeToTab(Number(params.tabId), "page_scroll_to", {
      x: params.x,
      y: params.y,
      refId: params.refId,
    });
  },
});

registerTool({
  action: "tab_fetch",
  namespace: "tab",
  description: "Perform an HTTP fetch inside a target tab origin",
  params: TabFetchParamsSchema,
  paramTypes: [
    {
      name: "tabId",
      type: "bigint",
      required: true,
      description: "Target tab ID",
    },
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
  returns: z.object({
    status: z.number(),
    ok: z.boolean(),
    headers: z.record(z.string()),
    body: z.string(),
  }),
  returnDoc: "FetchValue",
  errorCode: "ETAB",
  errorCategory: "tab",
  paramDocs: {
    tabId: "Target tab ID",
    url: "URL to fetch",
    method: "HTTP method",
    headers: "Request headers",
    body: "Request body",
    timeout: "Timeout in milliseconds",
  },
  handler: async (params) => {
    const targetTab = Number(params.tabId);
    const url = params.url;
    const method = params.method ?? "GET";
    const headers = params.headers ?? {};
    const body = params.body ?? null;
    const timeout = params.timeout ?? 30_000;
    const result = await executeInTab(
      targetTab,
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
        const timeoutNum = typeof timeoutArg === "number" ? timeoutArg : 30_000;

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
  action: "tab_snapshot",
  namespace: "tab",
  description: "Take a DOM snapshot of the target tab and return readable text",
  params: TabSnapshotParamsSchema,
  paramTypes: [
    {
      name: "tabId",
      type: "bigint",
      required: true,
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
  ],
  returns: z.string(),
  returnDoc: "string",
  errorCode: "ETAB",
  errorCategory: "tab",
  paramDocs: {
    tabId: "Target tab ID",
    max_nodes: "Maximum nodes to include",
    interactive_only: "Only interactive elements",
  },
  handler: async (params) => {
    const targetTab = Number(params.tabId);
    const maxNodes = params.max_nodes ?? 500;
    const result = await executeInTab(targetTab, createInlineSnapshotFunc(), [
      maxNodes,
    ]);
    if (!result.ok) {
      const error = new Error(result.error.message);
      (error as unknown as Record<string, unknown>).code = result.error.code;
      (error as unknown as Record<string, unknown>).category =
        result.error.category;
      throw error;
    }
    if (result.value && typeof result.value === "object") {
      return (result.value as Record<string, unknown>).text as string;
    }
    return String(result.value);
  },
});

registerTool({
  action: "tab_snapshot_text",
  namespace: "tab",
  description: "Take a DOM snapshot and return readable text (explicit alias)",
  params: TabSnapshotTextParamsSchema,
  paramTypes: [
    {
      name: "tabId",
      type: "bigint",
      required: true,
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
  ],
  returns: z.string(),
  returnDoc: "string",
  errorCode: "ETAB",
  errorCategory: "tab",
  paramDocs: {
    tabId: "Target tab ID",
    max_nodes: "Maximum nodes to include",
    interactive_only: "Only interactive elements",
  },
  handler: async (params) => {
    const targetTab = Number(params.tabId);
    const maxNodes = params.max_nodes ?? 500;
    const result = await executeInTab(targetTab, createInlineSnapshotFunc(), [
      maxNodes,
    ]);
    if (!result.ok) {
      const error = new Error(result.error.message);
      (error as unknown as Record<string, unknown>).code = result.error.code;
      (error as unknown as Record<string, unknown>).category =
        result.error.category;
      throw error;
    }
    if (result.value && typeof result.value === "object") {
      return (result.value as Record<string, unknown>).text as string;
    }
    return String(result.value);
  },
});

registerTool({
  action: "tab_snapshot_data",
  namespace: "tab",
  description: "Take a DOM snapshot and return structured data",
  params: TabSnapshotDataParamsSchema,
  paramTypes: [
    {
      name: "tabId",
      type: "bigint",
      required: true,
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
  ],
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
  errorCode: "ETAB",
  errorCategory: "tab",
  paramDocs: {
    tabId: "Target tab ID",
    max_nodes: "Maximum nodes to include",
    interactive_only: "Only interactive elements",
  },
  handler: async (params) => {
    const targetTab = Number(params.tabId);
    const maxNodes = params.max_nodes ?? 500;
    const result = await executeInTab(targetTab, createInlineSnapshotFunc(), [
      maxNodes,
    ]);
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

function registerChromePassthrough<P, R>(
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
    returns: z.unknown(),
    returnDoc: "any",
    errorCode: "ECHROME",
    errorCategory: "extension",
    paramDocs,
    handler: async (params) => {
      const transformedParams = paramTransform
        ? paramTransform(params)
        : params;
      const result = await dispatchTool(chromeAction, transformedParams);
      if (!result.ok) {
        const error = new Error(result.error.message);
        (error as unknown as Record<string, unknown>).code = result.error.code;
        (error as unknown as Record<string, unknown>).category =
          result.error.category;
        throw error;
      }
      return result.value as R;
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
  handler: async (params) =>
    dispatchSidepanelTool("sidepanel_snapshot_data", params),
});

const mergedDocRegistry = new MergedDocRegistry();

registerTool({
  action: "__runtime_docs",
  namespace: "runtime",
  name: "docs",
  publicName: "runtime.docs",
  source: "main_thread",
  transport: "extension_worker",
  description: "List all available tools",
  params: z.object({}),
  paramTypes: [],
  returns: z.array(ToolDocSchema),
  returnDoc: "ToolDoc[]",
  errorCode: "ERUNTIME",
  errorCategory: "runtime",
  paramDocs: {},
  handler: async () => mergedDocRegistry.list(),
});

registerTool({
  action: "__runtime_get_doc",
  namespace: "runtime",
  name: "get_doc",
  publicName: "runtime.get_doc",
  source: "main_thread",
  transport: "extension_worker",
  description: "Get a tool doc by public name or action",
  params: z.object({ query: z.string() }),
  paramTypes: [
    {
      name: "query",
      type: "string",
      required: true,
      description: "Public name or action to look up",
    },
  ],
  returns: ToolDocSchema.nullable(),
  returnDoc: "ToolDoc | null",
  errorCode: "ERUNTIME",
  errorCategory: "runtime",
  paramDocs: { query: "Public name or action to look up" },
  handler: async (params) => mergedDocRegistry.get(params.query) ?? null,
});

registerTool({
  action: "__runtime_search_docs",
  namespace: "runtime",
  name: "search_docs",
  publicName: "runtime.search_docs",
  source: "main_thread",
  transport: "extension_worker",
  description: "Search tool docs by keyword",
  params: z.object({ query: z.string() }),
  paramTypes: [
    {
      name: "query",
      type: "string",
      required: true,
      description: "Search keyword",
    },
  ],
  returns: z.array(ToolDocSchema),
  returnDoc: "ToolDoc[]",
  errorCode: "ERUNTIME",
  errorCategory: "runtime",
  paramDocs: { query: "Search keyword" },
  handler: async (params) => mergedDocRegistry.search(params.query),
});

mergedDocRegistry.setStaticDocs(listTools());

initExtensionListeners();
