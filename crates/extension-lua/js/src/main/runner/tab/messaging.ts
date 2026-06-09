/// <reference types="chrome" />
// Tab messaging helpers — send messages to content scripts and bridge
// tool calls from the main registry to the active tab.

import {
  type AsyncResponse,
  type ToolDoc,
  getTool,
} from "../../../shared/tool-registry.js";
import {
  annotateError,
  createError,
  toErrorMessage,
} from "../../../shared/errors.js";
import {
  activeTabId,
  getActiveTabId,
  normalizeChromeError,
} from "../runtime.js";
import { mergedDocRegistry } from "../tools/runtime-docs.js";

const contentScriptNotReadyError = createError(
  "Content script not ready after injection",
  "E_CONTENT_SCRIPT_NOT_READY",
  "content_script",
);

async function injectContentScript(tabId: number, frameIds?: number[]): Promise<void> {
  const chrome = window.chrome;
  if (!chrome?.runtime?.id) {
    throw createError("Not in extension context", "E_NO_EXTENSION", "permission");
  }
  const target: chrome.scripting.InjectionTarget = { tabId };
  if (frameIds) {
    target.frameIds = frameIds;
  }
  await chrome.scripting.executeScript({
    target,
    files: ["content-script.js"],
    world: "ISOLATED",
  });
  await new Promise((resolve) => setTimeout(resolve, 300));
}

type TabMessage = {
  action: string;
  params: Record<string, unknown>;
};

export async function ensureContentScript(tabId: number | null): Promise<void> {
  const chrome = window.chrome;
  if (!chrome?.runtime?.id) {
    throw createError("Not in extension context", "E_NO_EXTENSION", "permission");
  }

  const targetTab = typeof tabId === "number" ? tabId : activeTabId;
  if (targetTab === null) {
    throw createError("No active tab available", "E_NO_TAB", "resource");
  }

  let injected = false;

  for (let attempt = 0; attempt < 6; attempt++) {
    try {
      const pingResult = await chrome.tabs.sendMessage(targetTab, {
        channel: "piccolo-tool",
        version: 1,
        requestId: crypto.randomUUID(),
        action: "__ping",
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
      const msg = toErrorMessage(err) || "";
      if (msg.includes("Receiving end does not exist") && attempt < 5) {
        if (!injected) {
          try {
            await injectContentScript(targetTab, [0]);
            injected = true;
          } catch {
            throw contentScriptNotReadyError;
          }
        }
        await new Promise((resolve) => setTimeout(resolve, 500));
        continue;
      }
      throw contentScriptNotReadyError;
    }
  }
}

export async function sendBridgeMessageToTab(
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

export async function bridgeToTab(
  tabId: number | null,
  runnerAction: string,
  params: Record<string, unknown>,
): Promise<unknown> {
  const response = await sendBridgeMessageToTab(tabId, runnerAction, params);
  if (!response.ok) {
    throw createError(
      response.error.message,
      response.error.code,
      response.error.category,
    );
  }
  return response.value;
}

export async function sendMessageToTab(
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
    const msg = toErrorMessage(err);
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
        if ("value" in obj) {
          return { ok: true, value: obj.value };
        }
      }

      return { ok: true, value: result };
    } catch (err: unknown) {
      const msg = toErrorMessage(err) || "";
      if (msg.includes("Receiving end does not exist") && attempt < 4) {
        if (attempt === 0) {
          try {
            await injectContentScript(targetTab);
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
