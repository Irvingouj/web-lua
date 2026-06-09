/// <reference types="chrome" />
// Main-thread runtime orchestration for extension-lua runner
// Shared helpers, command dispatcher, and Chrome listeners.

import {
  type AsyncError,
  type AsyncResponse,
} from "../../shared/tool-registry.js";
import {
  annotateError,
  createError,
  toErrorMessage,
} from "../../shared/errors.js";

// ─── Types ─────────────────────────────────────────────────────

type FetchValue = {
  status: number;
  ok: boolean;
  headers: Record<string, string>;
  body: string;
};

// ─── Active tab cache ──────────────────────────────────────────

let activeTabId: number | null = null;
let listenersInitialized = false;

const onActivatedListener = ({ tabId }: { tabId: number }) => {
  activeTabId = tabId;
};

const onUpdatedListener = (tabId: number, changeInfo: { status?: string }) => {
  const chrome = window.chrome;
  if (!chrome?.runtime?.id) return;
  if (changeInfo.status === "complete") {
    chrome.tabs
      .sendMessage(tabId, {
        channel: "piccolo-tool",
        version: 1,
        requestId: "ping",
        action: "__ping",
        params: {},
      })
      .catch(() => {
        chrome.scripting
          .executeScript({
            target: { tabId },
            files: ["content-script.js"],
            world: "ISOLATED",
          })
          .catch(() => {
            // Ignore injection failures
          });
      });
  }
};

export function getActiveTabId(): number | null {
  return activeTabId;
}

export function initExtensionListeners(): void {
  if (listenersInitialized) return;

  const chrome = window.chrome;
  if (!chrome?.runtime?.id || !chrome?.tabs) return;

  listenersInitialized = true;

  chrome.tabs.onActivated.addListener(onActivatedListener);
  chrome.tabs.onUpdated.addListener(onUpdatedListener);

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
  listenersInitialized = false;
}

// ─── Typed params helpers ──────────────────────────────────────

export function asRecord(params: unknown): Record<string, unknown> {
  return typeof params === "object" && params !== null && !Array.isArray(params)
    ? (params as Record<string, unknown>)
    : {};
}

export function extractTabId(params: unknown): number | null {
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

// ─── Fetch helpers ───────────────────────────────────────────

export function formatFetchError(
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
  const message = toErrorMessage(err);
  return {
    ok: false,
    error: {
      message: message || String(err),
      code: "EUNKNOWN",
      category: "network",
    },
  };
}

export async function performFetch(
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
  try {
    const response = await fetch(url, { ...init, signal: controller.signal });
    const body = await response.text();
    const headers = Object.fromEntries(response.headers.entries());
    clearTimeout(timeoutId);
    return { response, body, headers };
  } catch (err) {
    clearTimeout(timeoutId);
    throw err;
  }
}

// ─── Chrome error normalizer ───────────────────────────────────

export function normalizeChromeError(err: unknown): {
  ok: false;
  error: AsyncError;
} {
  const msg = toErrorMessage(err) || "";
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

// ─── Error helpers ─────────────────────────────────────────────
//
// This module uses two patterns for error handling:
// - throw-based: `throwIfNoExtensionContext` and `chromeApiCall` throw
//   annotated Errors for callers that use try/catch.
// - return-based: `normalizeChromeError` and `formatFetchError` return
//   `AsyncResponse` for callers that check `ok`.
// Keep the naming consistent so callers know which pattern to expect.

export function throwIfNoExtensionContext(action: string): void {
  const chrome = window.chrome;
  if (!chrome?.runtime?.id) {
    throw createError(
      `${action} is only available in a browser extension context`,
      "E_NO_EXTENSION",
      "permission",
    );
  }
}

export async function chromeApiCall<T>(promise: Promise<T>): Promise<T> {
  try {
    return await promise;
  } catch (err: unknown) {
    const normalized = normalizeChromeError(err);
    throw annotateError(
      err,
      normalized.error.code,
      normalized.error.category,
    );
  }
}

export { activeTabId };
export type { FetchValue };
