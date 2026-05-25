// Main-thread command executor for extension-lua runner
// Handles all commands relayed from the extension Worker.

import {
  init as initDomSnapshot,
  collectDocument,
  formatSnapshot,
} from "@pi-oxide/dom-semantic-tree";

let domSnapshotReady: Promise<void> | null = null;

function ensureDomSnapshot(): Promise<void> {
  if (!domSnapshotReady) {
    domSnapshotReady = initDomSnapshot();
  }
  return domSnapshotReady;
}

// ─── Runner lifecycle abort signal ───────────────────────────────

let runnerAbortController: AbortController | null = null;

export function setRunnerAbortController(controller: AbortController | null) {
  runnerAbortController = controller;
}

function getRunnerSignal(): AbortSignal | undefined {
  return runnerAbortController?.signal;
}

function throwIfAborted(): void {
  const signal = getRunnerSignal();
  if (signal?.aborted) {
    throw new Error("Runner aborted: ExtensionSession stopped");
  }
}

// ─── Minimal Chrome API types to avoid `any` ───────────────────

interface ChromeRuntime {
  id?: string;
  sendMessage: (message: unknown) => Promise<unknown>;
}

interface ChromeTabs {
  get: (tabId: number) => Promise<{ status: string }>;
  query: (queryInfo: unknown) => Promise<unknown>;
  create: (createProperties: unknown) => Promise<unknown>;
  update: (tabId: number | null, updateProperties: unknown) => Promise<unknown>;
  remove: (tabId: unknown) => Promise<void>;
  reload: (
    tabId: number | undefined,
    reloadProperties: unknown,
  ) => Promise<void>;
  sendMessage: (tabId: unknown, message: unknown) => Promise<unknown>;
  onUpdated: {
    addListener: (
      callback: (tabId: number, changeInfo: { status?: string }) => void,
    ) => void;
    removeListener: (
      callback: (tabId: number, changeInfo: { status?: string }) => void,
    ) => void;
  };
}

interface ChromeScripting {
  executeScript: (details: unknown) => Promise<{ result?: unknown }[]>;
}

interface ChromeAction {
  setBadgeText: (details: unknown) => Promise<void>;
  setBadgeBackgroundColor: (details: unknown) => Promise<void>;
  setTitle: (details: unknown) => Promise<void>;
  setIcon: (details: unknown) => Promise<unknown>;
}

interface ChromeContextMenus {
  create: (createProperties: unknown) => Promise<unknown>;
  remove: (menuItemId: unknown) => Promise<void>;
}

interface ChromeWindows {
  getAll: (getInfo: unknown) => Promise<unknown>;
  create: (createData: unknown) => Promise<unknown>;
  update: (windowId: unknown, updateInfo: unknown) => Promise<unknown>;
  remove: (windowId: unknown) => Promise<void>;
}

interface ChromeSidePanel {
  setOptions: (options: unknown) => Promise<void>;
}

interface ChromeCookies {
  get: (details: unknown) => Promise<unknown>;
  set: (details: unknown) => Promise<unknown>;
  remove: (details: unknown) => Promise<unknown>;
  getAll: (details: unknown) => Promise<unknown>;
}

interface ChromeBookmarks {
  search: (query: unknown) => Promise<unknown>;
  create: (bookmark: unknown) => Promise<unknown>;
  remove: (id: unknown) => Promise<void>;
}

interface ChromeHistory {
  search: (query: unknown) => Promise<unknown>;
  deleteUrl: (details: unknown) => Promise<void>;
}

interface ChromeNotifications {
  create: (notificationId: string, options: unknown) => Promise<unknown>;
  clear: (notificationId: string) => Promise<unknown>;
}

interface ChromeAlarms {
  create: (name: string, alarmInfo: unknown) => Promise<void>;
  clear: (name: string) => Promise<boolean>;
}

interface ChromeApi {
  runtime: ChromeRuntime;
  tabs: ChromeTabs;
  scripting: ChromeScripting;
  action: ChromeAction;
  contextMenus: ChromeContextMenus;
  windows: ChromeWindows;
  sidePanel: ChromeSidePanel;
  cookies: ChromeCookies;
  bookmarks: ChromeBookmarks;
  history: ChromeHistory;
  notifications: ChromeNotifications;
  alarms: ChromeAlarms;
}

declare global {
  interface Window {
    chrome?: ChromeApi;
    __hostHandlers?: Record<string, (params: unknown) => Promise<unknown>>;
  }
}

// ─── Types ─────────────────────────────────────────────────────

type HostHandler = (params: unknown) => Promise<unknown>;

interface Command {
  action: string;
  params: unknown;
}

// ─── Host handler registry ─────────────────────────────────────

const hostHandlers: Record<string, HostHandler> = {};

export function registerHostHandler(action: string, handler: HostHandler) {
  hostHandlers[action] = handler;
}

export function registerHostHandlers(handlers: Record<string, HostHandler>) {
  Object.assign(hostHandlers, handlers);
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

function extractArg(
  params: unknown,
  index: number,
  fallback?: unknown,
): unknown {
  if (Array.isArray(params)) return params[index] ?? fallback;
  if (typeof params === "object" && params !== null) return fallback;
  if (index === 0) return params;
  return fallback;
}

function getStringParam(params: unknown, key: string): string {
  const val = asRecord(params)[key];
  return typeof val === "string" ? val : "";
}

function getNumberParam(
  params: unknown,
  key: string,
  fallback: number,
): number {
  const val = asRecord(params)[key];
  return typeof val === "number" ? val : fallback;
}

// ─── Main command dispatcher ─────────────────────────────────────

export async function executeMainThreadCommand(
  command: Command,
): Promise<unknown> {
  const params = command.params;
  switch (command.action) {
    case "storage_get": {
      try {
        const key = getStringParam(params, "key");
        const value = localStorage.getItem(key);
        return { ok: true, value };
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        return {
          ok: false,
          error: { message, code: "ESTORAGE", category: "storage" },
        };
      }
    }
    case "storage_set": {
      try {
        const key = getStringParam(params, "key");
        const value = getStringParam(params, "value");
        localStorage.setItem(key, value);
        return { ok: true, value: null };
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        return {
          ok: false,
          error: { message, code: "ESTORAGE", category: "storage" },
        };
      }
    }
    case "storage_delete": {
      try {
        const key = getStringParam(params, "key");
        localStorage.removeItem(key);
        return { ok: true, value: null };
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        return {
          ok: false,
          error: { message, code: "ESTORAGE", category: "storage" },
        };
      }
    }
    case "storage_list": {
      try {
        const keys: string[] = [];
        for (let i = 0; i < localStorage.length; i++) {
          const key = localStorage.key(i);
          if (key) keys.push(key);
        }
        return { ok: true, value: keys };
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        return {
          ok: false,
          error: { message, code: "ESTORAGE", category: "storage" },
        };
      }
    }
    case "clipboard_read": {
      try {
        const text = await navigator.clipboard.readText();
        return { ok: true, value: text };
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        return {
          ok: false,
          error: { message, code: "ECLIPBOARD", category: "permission" },
        };
      }
    }
    case "clipboard_write": {
      try {
        let text = "";
        if (Array.isArray(params)) {
          const first = params[0];
          if (typeof first === "object" && first !== null) {
            text = String((first as Record<string, unknown>).text ?? first);
          } else {
            text = String(first);
          }
        } else {
          const obj = asRecord(params);
          text = (obj.text as string) || (obj.value as string) || "";
        }
        await navigator.clipboard.writeText(text);
        return { ok: true, value: null };
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        return {
          ok: false,
          error: { message, code: "ECLIPBOARD", category: "permission" },
        };
      }
    }
    case "fetch": {
      return handleFetch(params);
    }
    case "sleep": {
      const duration = getNumberParam(params, "duration", 0);
      await new Promise((resolve) => setTimeout(resolve, duration));
      return { ok: true, value: null };
    }
    case "page_url": {
      return { ok: true, value: window.location.href };
    }
    case "page_title": {
      return { ok: true, value: document.title };
    }
    case "page_goto": {
      const url = getStringParam(params, "url");
      window.location.href = url;
      return { ok: true, value: true };
    }
    case "page_back": {
      window.history.back();
      return { ok: true, value: true };
    }
    case "page_forward": {
      window.history.forward();
      return { ok: true, value: true };
    }
    case "page_reload": {
      window.location.reload();
      return { ok: true, value: true };
    }
    case "page_wait": {
      const obj = asRecord(params);
      const ms =
        typeof obj.ms === "number"
          ? obj.ms
          : typeof obj.duration === "number"
            ? obj.duration
            : 1000;
      await new Promise((resolve) => setTimeout(resolve, ms));
      return { ok: true, value: true };
    }
    case "page_click":
    case "page_fill":
    case "page_type":
    case "page_press":
    case "page_select":
    case "page_check":
    case "page_hover":
    case "page_unhover":
    case "page_scroll":
    case "page_scroll_to":
    case "page_dblclick": {
      return handlePageAction(command.action, params);
    }
    case "page_snapshot":
    case "dom_snapshot": {
      return handleDomSnapshot(params);
    }
    case "dom_format": {
      return handleDomFormat(params);
    }
    case "page_close": {
      const obj = asRecord(params);
      const tabId = extractTabId(params);
      return handleChromeApi({
        action: "chrome_tabs_remove",
        params: tabId,
      });
    }
    case "page_active_tab": {
      return handleChromeApi({
        action: "chrome_tabs_query",
        params: { active: true, currentWindow: true },
      });
    }
    case "tab_query":
      return handleChromeApi({ action: "chrome_tabs_query", params });
    case "tab_create":
      return handleChromeApi({ action: "chrome_tabs_create", params });
    case "tab_activate": {
      const obj = asRecord(params);
      const tabId = obj.tabId ?? params;
      return handleChromeApi({
        action: "chrome_tabs_update",
        params: { tabId, update: { active: true } },
      });
    }
    case "tab_close": {
      const obj = asRecord(params);
      const tabId = obj.tabId ?? params;
      return handleChromeApi({ action: "chrome_tabs_remove", params: tabId });
    }
    case "tab_execute_script":
      return handleChromeApi({
        action: "chrome_scripting_executeScript",
        params,
      });
    case "tab_click": {
      const tabId = extractTabId(params);
      const obj = asRecord(params);
      const refId = extractArg(params, 1, obj.refId ?? obj.ref_id);
      if (!refId)
        return {
          ok: false,
          error: {
            message: "tab_click requires refId",
            code: "E_MISSING_PARAM",
          },
        };
      return sendMessageToTab(tabId, {
        action: "click",
        params: { refId: String(refId) },
      });
    }
    case "tab_fill": {
      const tabId = extractTabId(params);
      const obj = asRecord(params);
      const refId = extractArg(params, 1, obj.refId ?? obj.ref_id);
      const value = extractArg(params, 2, obj.value ?? "");
      if (!refId)
        return {
          ok: false,
          error: {
            message: "tab_fill requires refId",
            code: "E_MISSING_PARAM",
          },
        };
      return sendMessageToTab(tabId, {
        action: "fill",
        params: { refId: String(refId), value: String(value) },
      });
    }
    case "tab_scroll_to": {
      const tabId = extractTabId(params);
      const obj = asRecord(params);
      const x = extractArg(params, 1, obj.x ?? 0);
      const y = extractArg(params, 2, obj.y ?? 0);
      const refId = extractArg(params, 3, obj.refId ?? obj.ref_id);
      return sendMessageToTab(tabId, {
        action: "scrollTo",
        params: { x, y, refId: refId ? String(refId) : undefined },
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
      return executeInTab(
        tabId,
        (code: string) => {
          // biome-ignore lint/security/noGlobalEval: intentional eval for tab.evaluate API
          return eval(code);
        },
        [String(script)],
      );
    }
    case "tab_back": {
      const tabId = extractTabId(params);
      return sendMessageToTab(tabId, {
        action: "back",
        params: {},
      });
    }
    case "tab_wait_for_load": {
      const tabId = extractTabId(params);
      return waitForTabLoad(tabId);
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
      return sendMessageToTab(tabId, {
        action: "fetch",
        params: {
          url,
          method,
          headers,
          body,
          timeout,
        },
      });
    }
    case "tab_snapshot": {
      const tabId = extractTabId(params);
      const obj = asRecord(params);
      const opts = extractArg(params, 1, obj.options ?? obj);
      const optRec = asRecord(opts);
      const maxNodes =
        typeof optRec.max_nodes === "number" ? optRec.max_nodes : 500;
      console.log("[runner] tab_snapshot → tabId:", tabId, "maxNodes:", maxNodes);
      const r = await sendMessageToTab(tabId, {
        action: "snapshot",
        params: { max_nodes: maxNodes },
      });
      console.log("[runner] tab_snapshot ← result:", r);
      return r;
    }
    case "cookies_get":
      return handleChromeApi({ action: "chrome_cookies_get", params });
    case "cookies_set":
      return handleChromeApi({ action: "chrome_cookies_set", params });
    case "cookies_delete":
      return handleChromeApi({ action: "chrome_cookies_remove", params });
    case "cookies_list":
      return handleChromeApi({ action: "chrome_cookies_getAll", params });
    case "history_search":
      return handleChromeApi({ action: "chrome_history_search", params });
    case "history_delete": {
      const obj = asRecord(params);
      const url = obj.url ?? params;
      return handleChromeApi({
        action: "chrome_history_deleteUrl",
        params: { url },
      });
    }
    case "bookmarks_search": {
      const obj = asRecord(params);
      const query =
        obj.query ?? (typeof params === "string" ? params : "") ?? "";
      return handleChromeApi({
        action: "chrome_bookmarks_search",
        params: query,
      });
    }
    case "bookmarks_create":
      return handleChromeApi({ action: "chrome_bookmarks_create", params });
    case "bookmarks_delete": {
      const obj = asRecord(params);
      const id = obj.id ?? params;
      return handleChromeApi({ action: "chrome_bookmarks_remove", params: id });
    }
    case "notifications_create": {
      const obj = asRecord(params);
      const id = obj.id ?? (typeof params === "string" ? params : "") ?? "";
      const options = obj.options ?? obj ?? {};
      return handleChromeApi({
        action: "chrome_notifications_create",
        params: { id, options },
      });
    }
    case "notifications_clear": {
      const obj = asRecord(params);
      const id = obj.id ?? (typeof params === "string" ? params : "") ?? "";
      return handleChromeApi({
        action: "chrome_notifications_clear",
        params: id,
      });
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

// ─── Fetch handler ───────────────────────────────────────────────

async function handleFetch(params: unknown): Promise<unknown> {
  throwIfAborted();
  const obj = asRecord(params);
  const url = obj.url as string;
  const method = (obj.method as string) || "GET";
  const headers = obj.headers ?? {};
  const body = obj.body ?? null;
  const timeout = typeof obj.timeout === "number" ? obj.timeout : 30_000;

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout || 30_000);
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
    const response = await fetch(url, fetchOpts);
    clearTimeout(timeoutId);
    const responseBody = await response.text();
    const responseHeaders: Record<string, string> = {};
    response.headers.forEach((value, key) => {
      responseHeaders[key] = value;
    });
    return {
      ok: true,
      value: {
        status: response.status,
        ok: response.ok,
        headers: responseHeaders,
        body: responseBody,
      },
    };
  } catch (err: unknown) {
    if (err instanceof Error && err.name === "AbortError") {
      return {
        ok: false,
        error: {
          message: `Request timed out after ${timeout || 30_000}ms`,
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
}

// ─── Tab script execution ──────────────────────────────────────

async function executeInTab(
  tabId: unknown,
  func: (...args: unknown[]) => unknown,
  args: unknown[],
): Promise<unknown> {
  throwIfAborted();
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
    const targetTab = typeof tabId === "number" ? tabId : null;
    const results = await chrome.scripting.executeScript({
      target: { tabId: targetTab },
      func,
      args,
      world: "MAIN",
    });
    if (results?.[0]) {
      return { ok: true, value: results[0].result };
    }
    return { ok: true, value: null };
  } catch (err: unknown) {
    return normalizeChromeError(err);
  }
}

async function waitForTabLoad(tabId: unknown): Promise<unknown> {
  throwIfAborted();
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
      }, 30_000);
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
    .then((tabs: unknown) => {
      const t = Array.isArray(tabs) ? tabs : [];
      const first = t[0] as Record<string, unknown> | undefined;
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

async function sendMessageToTab(
  tabId: unknown,
  message: Record<string, unknown>,
): Promise<unknown> {
  throwIfAborted();
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
  console.log("[sendMessageToTab] targetTab:", targetTab, "message:", message);
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      const result = await chrome.tabs.sendMessage(targetTab, message);
      console.log("[sendMessageToTab] raw result:", result);
      // Content-script handlers may return { ok: false, error: msg } on failure.
      // Flatten that so Lua consumers always see a single error shape.
      if (
        result &&
        typeof result === "object" &&
        (result as Record<string, unknown>).ok === false
      ) {
        const raw = (result as Record<string, unknown>).error;
        const msg = typeof raw === "string" ? raw : String(raw);
        console.log("[sendMessageToTab] content-script error:", msg);
        return {
          ok: false,
          error: {
            message: msg || "Content script error",
            code: "E_CONTENT_SCRIPT",
          },
        };
      }
      console.log("[sendMessageToTab] success, result:", result);
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

// ─── Page actions (side panel / main document) ─────────────────
//
// IMPORTANT: page.* actions operate on the extension popup/sidepanel DOM,
// NOT the active browser tab. To interact with the active tab, use tab.*
// APIs which relay commands to the content script via sendMessageToTab.

function getElementByRefId(refId: string): Element | null {
  return document.querySelector(`[data-ref-id='${refId}']`);
}

function extractRefId(params: unknown): string | undefined {
  if (typeof params === "string") return params;
  const obj = asRecord(params);
  return typeof obj.refId === "string" ? obj.refId : undefined;
}

async function handlePageAction(
  action: string,
  params: unknown,
): Promise<unknown> {
  const obj = asRecord(params);
  const refId = extractRefId(params);
  const element = refId ? getElementByRefId(refId) : null;

  switch (action) {
    case "page_click": {
      if (!element)
        return {
          ok: false,
          error: { message: `Element ${refId} not found`, code: "ENOTFOUND" },
        };
      (element as HTMLElement).click();
      return { ok: true, value: null };
    }
    case "page_dblclick": {
      if (!element)
        return {
          ok: false,
          error: { message: `Element ${refId} not found`, code: "ENOTFOUND" },
        };
      const ev = new MouseEvent("dblclick", { bubbles: true });
      element.dispatchEvent(ev);
      return { ok: true, value: null };
    }
    case "page_fill": {
      if (!element)
        return {
          ok: false,
          error: { message: `Element ${refId} not found`, code: "ENOTFOUND" },
        };
      const value = (obj.value as string) || "";
      if (
        element instanceof HTMLInputElement ||
        element instanceof HTMLTextAreaElement
      ) {
        element.value = value;
      } else {
        return {
          ok: false,
          error: { message: "Element is not an input", code: "EINPUT" },
        };
      }
      const ev = new InputEvent("input", { bubbles: true });
      element.dispatchEvent(ev);
      return { ok: true, value: null };
    }
    case "page_type": {
      if (!element)
        return {
          ok: false,
          error: { message: `Element ${refId} not found`, code: "ENOTFOUND" },
        };
      const text = (obj.text as string) || "";
      if (
        element instanceof HTMLInputElement ||
        element instanceof HTMLTextAreaElement
      ) {
        element.value = text;
      }
      const ev = new InputEvent("input", { bubbles: true });
      element.dispatchEvent(ev);
      return { ok: true, value: null };
    }
    case "page_press": {
      const key = (obj.key as string) || "";
      const ev = new KeyboardEvent("keydown", { key, bubbles: true });
      document.dispatchEvent(ev);
      const evUp = new KeyboardEvent("keyup", { key, bubbles: true });
      document.dispatchEvent(evUp);
      return { ok: true, value: null };
    }
    case "page_select": {
      if (!element)
        return {
          ok: false,
          error: { message: `Element ${refId} not found`, code: "ENOTFOUND" },
        };
      const value = (obj.value as string) || "";
      if (element instanceof HTMLSelectElement) {
        element.value = value;
      } else {
        return {
          ok: false,
          error: { message: "Element is not a select", code: "ESELECT" },
        };
      }
      return { ok: true, value: null };
    }
    case "page_check": {
      if (!element)
        return {
          ok: false,
          error: { message: `Element ${refId} not found`, code: "ENOTFOUND" },
        };
      const checked = typeof obj.checked === "boolean" ? obj.checked : true;
      if (element instanceof HTMLInputElement && element.type === "checkbox") {
        element.checked = checked;
      } else {
        return {
          ok: false,
          error: { message: "Element is not a checkbox", code: "ECHECKBOX" },
        };
      }
      return { ok: true, value: null };
    }
    case "page_hover": {
      if (!element)
        return {
          ok: false,
          error: { message: `Element ${refId} not found`, code: "ENOTFOUND" },
        };
      const ev = new MouseEvent("mouseenter", { bubbles: true });
      element.dispatchEvent(ev);
      return { ok: true, value: null };
    }
    case "page_unhover": {
      if (!element)
        return {
          ok: false,
          error: { message: `Element ${refId} not found`, code: "ENOTFOUND" },
        };
      const ev = new MouseEvent("mouseleave", { bubbles: true });
      element.dispatchEvent(ev);
      return { ok: true, value: null };
    }
    case "page_scroll": {
      const direction = (obj.direction as string) || "down";
      const amount = typeof obj.amount === "number" ? obj.amount : 300;
      window.scrollBy({
        top: direction === "down" ? amount : -amount,
        behavior: "smooth",
      });
      return { ok: true, value: null };
    }
    case "page_scroll_to": {
      if (!element)
        return {
          ok: false,
          error: { message: `Element ${refId} not found`, code: "ENOTFOUND" },
        };
      element.scrollIntoView({ behavior: "smooth" });
      return { ok: true, value: null };
    }
    default:
      return {
        ok: false,
        error: { message: `Unknown page action: ${action}`, code: "EUNKNOWN" },
      };
  }
}

// ─── DOM snapshot ──────────────────────────────────────────────

async function handleDomSnapshot(params: unknown): Promise<unknown> {
  try {
    ensureDomSnapshot();
    const obj = asRecord(params);
    const options = {
      max_nodes: typeof obj.max_nodes === "number" ? obj.max_nodes : 500,
      interactive_only:
        typeof obj.interactive_only === "boolean"
          ? obj.interactive_only
          : false,
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

async function handleDomFormat(params: unknown): Promise<unknown> {
  try {
    ensureDomSnapshot();
    const obj = asRecord(params);
    const snapshot = obj.snapshot;
    const format = typeof obj.format === "string" ? obj.format : "compact-text";
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

function getElementRole(el: Element): string {
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
): Promise<unknown> {
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

function normalizeChromeError(err: unknown): {
  ok: false;
  error: { message: string; code: string; category: string };
} {
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

async function handleChromeApi(command: Command): Promise<unknown> {
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
          typeof tabId === "number" ? tabId : null,
          updateProps,
        );
        break;
      }
      case "chrome_tabs_remove": {
        const tabId = firstRec.tabId || firstRec.id || first;
        await chrome.tabs.remove(tabId);
        result = null;
        break;
      }
      case "chrome_tabs_get": {
        const tabId = firstRec.tabId || firstRec.id || first;
        result = await chrome.tabs.get(tabId);
        break;
      }
      case "chrome_tabs_reload": {
        const tabId = firstRec.tabId || first;
        const reloadProps = firstRec.reload || second || {};
        await chrome.tabs.reload(
          typeof tabId === "number" ? tabId : undefined,
          reloadProps,
        );
        result = null;
        break;
      }
      case "chrome_tabs_sendMessage": {
        const tabId = firstRec.tabId || first;
        const message = firstRec.message || second || {};
        result = await chrome.tabs.sendMessage(tabId, message);
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
        await chrome.action.setBadgeText(firstRec || {});
        result = null;
        break;
      }
      case "chrome_action_setBadgeBackgroundColor": {
        await chrome.action.setBadgeBackgroundColor(firstRec || {});
        result = null;
        break;
      }
      case "chrome_action_setTitle": {
        await chrome.action.setTitle(firstRec || {});
        result = null;
        break;
      }
      case "chrome_action_setIcon": {
        result = await chrome.action.setIcon(firstRec || {});
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
        result = await chrome.cookies.get(firstRec || {});
        break;
      }
      case "chrome_cookies_set": {
        result = await chrome.cookies.set(firstRec || {});
        break;
      }
      case "chrome_cookies_remove": {
        result = await chrome.cookies.remove(firstRec || {});
        break;
      }
      case "chrome_cookies_getAll": {
        result = await chrome.cookies.getAll(firstRec || {});
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
        result = await chrome.history.search(firstRec || {});
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
        result = await chrome.scripting.executeScript(firstRec || {});
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

initExtensionListeners();
