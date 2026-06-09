/// <reference types="chrome" />
// Tab script execution helpers — execute JS in tabs and wait for loads.

import { type AsyncResponse } from "../../../shared/tool-registry.js";
import { normalizeChromeError, activeTabId, getActiveTabId } from "../runtime.js";
import { createInlineSnapshotFunc } from "./snapshot.js";

function checkExtensionContext(): AsyncResponse<never> | null {
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
  return null;
}

export async function executeInTab(
  tabId: number | null,
  func: (...args: unknown[]) => unknown,
  args: unknown[],
): Promise<AsyncResponse> {
  const contextError = checkExtensionContext();
  if (contextError) return contextError;

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
    if (results != null && results.length > 0) {
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
    return {
      ok: false,
      error: {
        message: "Script execution returned no results",
        code: "E_SCRIPT_EXECUTION",
        category: "script",
      },
    };
  } catch (err: unknown) {
    return normalizeChromeError(err);
  }
}

export async function waitForTabLoad(
  tabId: number | null,
  timeoutMs: number = 30_000,
): Promise<AsyncResponse<boolean>> {
  const contextError = checkExtensionContext();
  if (contextError) return contextError;

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
  try {
    return await new Promise<AsyncResponse<boolean>>((resolve, reject) => {
      const listener = (
        updatedTabId: number,
        changeInfo: { status?: string },
      ) => {
        if (updatedTabId === targetTab && changeInfo.status === "complete") {
          clearTimeout(timeoutId);
          chrome.tabs.onUpdated.removeListener(listener);
          resolve({ ok: true, value: true });
        }
      };
      chrome.tabs.onUpdated.addListener(listener);
      const timeoutId = setTimeout(() => {
        chrome.tabs.onUpdated.removeListener(listener);
        reject(new Error("Timeout waiting for tab load"));
      }, timeoutMs);

      chrome.tabs.get(targetTab).then((tab) => {
        if (tab.status === "complete") {
          clearTimeout(timeoutId);
          chrome.tabs.onUpdated.removeListener(listener);
          resolve({ ok: true, value: true });
        }
      }).catch((err) => {
        clearTimeout(timeoutId);
        chrome.tabs.onUpdated.removeListener(listener);
        reject(err);
      });
    });
  } catch (err: unknown) {
    if (err instanceof Error && err.message === "Timeout waiting for tab load") {
      return {
        ok: false,
        error: {
          message: err.message,
          code: "ETIMEDOUT",
          category: "timeout",
        },
      };
    }
    return normalizeChromeError(err);
  }
}

export { createInlineSnapshotFunc };
