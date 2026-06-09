/// <reference types="chrome" />
// Chrome API handlers — direct passthroughs to chrome.* namespaces

import { z } from "zod";
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
  CookiesDeleteParamsSchema,
  CookiesGetParamsSchema,
  CookiesListParamsSchema,
  CookiesSetParamsSchema,
  HistoryDeleteParamsSchema,
  HistorySearchParamsSchema,
  NotificationsClearParamsSchema,
  NotificationsCreateParamsSchema,
} from "../../../../shared/schemas.js";
import { throwIfNoExtensionContext, chromeApiCall } from "../../runtime.js";

export async function handleChromeRuntimeSendMessage(
  params: z.infer<typeof ChromeRuntimeSendMessageParamsSchema>,
): Promise<unknown> {
  throwIfNoExtensionContext("chrome_runtime_sendMessage");
  return chromeApiCall(chrome.runtime.sendMessage(params));
}

export async function handleChromeTabsQuery(
  params: z.infer<typeof ChromeTabsQueryParamsSchema>,
): Promise<chrome.tabs.Tab[]> {
  throwIfNoExtensionContext("chrome_tabs_query");
  return chromeApiCall(chrome.tabs.query(params as chrome.tabs.QueryInfo));
}

export async function handleChromeTabsCreate(
  params: z.infer<typeof ChromeTabsCreateParamsSchema>,
): Promise<chrome.tabs.Tab> {
  throwIfNoExtensionContext("chrome_tabs_create");
  const createProps =
    typeof params === "string"
      ? { url: params }
      : (params as chrome.tabs.CreateProperties);
  return chromeApiCall(chrome.tabs.create(createProps));
}

export async function handleChromeTabsUpdate(
  params: z.infer<typeof ChromeTabsUpdateParamsSchema>,
): Promise<chrome.tabs.Tab> {
  throwIfNoExtensionContext("chrome_tabs_update");
  const tabId = params.tabId ?? null;
  const updateProps = params.update ?? {};
  return chromeApiCall(
    chrome.tabs.update(
      typeof tabId === "number" ? tabId : (null as unknown as number),
      updateProps as chrome.tabs.UpdateProperties,
    ),
  );
}

export async function handleChromeTabsRemove(
  params: z.infer<typeof ChromeTabsRemoveParamsSchema>,
): Promise<null> {
  throwIfNoExtensionContext("chrome_tabs_remove");
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

export async function handleChromeTabsGet(
  params: z.infer<typeof ChromeTabsGetParamsSchema>,
): Promise<chrome.tabs.Tab> {
  throwIfNoExtensionContext("chrome_tabs_get");
  const tabId =
    typeof params === "number" ? params : (params.tabId ?? params.id);
  return chromeApiCall(chrome.tabs.get(tabId as number));
}

export async function handleChromeTabsReload(
  params: z.infer<typeof ChromeTabsReloadParamsSchema>,
): Promise<null> {
  throwIfNoExtensionContext("chrome_tabs_reload");
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

export async function handleChromeTabsSendMessage(
  params: z.infer<typeof ChromeTabsSendMessageParamsSchema>,
): Promise<unknown> {
  throwIfNoExtensionContext("chrome_tabs_sendMessage");
  const tabId = params.tabId;
  const message = params.message;
  return chromeApiCall(chrome.tabs.sendMessage(tabId as number, message));
}

export async function handleChromeAlarmsCreate(
  params: z.infer<typeof ChromeAlarmsCreateParamsSchema>,
): Promise<null> {
  throwIfNoExtensionContext("chrome_alarms_create");
  const name = params.name ?? "";
  const alarmInfo = params.alarmInfo ?? {};
  await chromeApiCall(chrome.alarms.create(name, alarmInfo));
  return null;
}

export async function handleChromeAlarmsClear(
  params: z.infer<typeof ChromeAlarmsClearParamsSchema>,
): Promise<boolean> {
  throwIfNoExtensionContext("chrome_alarms_clear");
  const alarmName = typeof params === "string" ? params : (params.name ?? "");
  return chromeApiCall(chrome.alarms.clear(alarmName));
}

export async function handleChromeActionSetBadgeText(
  params: z.infer<typeof ChromeActionSetBadgeTextParamsSchema>,
): Promise<null> {
  throwIfNoExtensionContext("chrome_action_setBadgeText");
  await chromeApiCall(
    chrome.action.setBadgeText(
      params as unknown as chrome.action.BadgeTextDetails,
    ),
  );
  return null;
}

export async function handleChromeActionSetBadgeBackgroundColor(
  params: z.infer<typeof ChromeActionSetBadgeBackgroundColorParamsSchema>,
): Promise<null> {
  throwIfNoExtensionContext("chrome_action_setBadgeBackgroundColor");
  await chromeApiCall(
    chrome.action.setBadgeBackgroundColor(
      params as unknown as chrome.action.BadgeBackgroundColorDetails,
    ),
  );
  return null;
}

export async function handleChromeActionSetTitle(
  params: z.infer<typeof ChromeActionSetTitleParamsSchema>,
): Promise<null> {
  throwIfNoExtensionContext("chrome_action_setTitle");
  await chromeApiCall(
    chrome.action.setTitle(params as unknown as chrome.action.TitleDetails),
  );
  return null;
}

export async function handleChromeActionSetIcon(
  params: z.infer<typeof ChromeActionSetIconParamsSchema>,
): Promise<unknown> {
  throwIfNoExtensionContext("chrome_action_setIcon");
  return chromeApiCall(
    chrome.action.setIcon(params as unknown as chrome.action.TabIconDetails),
  );
}

export async function handleChromeContextMenusCreate(
  params: z.infer<typeof ChromeContextMenusCreateParamsSchema>,
): Promise<unknown> {
  throwIfNoExtensionContext("chrome_contextMenus_create");
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

export async function handleChromeContextMenusRemove(
  params: z.infer<typeof ChromeContextMenusRemoveParamsSchema>,
): Promise<null> {
  throwIfNoExtensionContext("chrome_contextMenus_remove");
  const menuId =
    typeof params === "number" || typeof params === "string"
      ? params
      : (params.menuItemId ?? params.id);
  await chrome.contextMenus.remove(menuId as string | number);
  return null;
}

export async function handleChromeWindowsGetAll(
  params: z.infer<typeof ChromeWindowsGetAllParamsSchema>,
): Promise<chrome.windows.Window[]> {
  throwIfNoExtensionContext("chrome_windows_getAll");
  return chromeApiCall(
    chrome.windows.getAll(params as chrome.windows.QueryOptions),
  );
}

export async function handleChromeWindowsCreate(
  params: z.infer<typeof ChromeWindowsCreateParamsSchema>,
): Promise<chrome.windows.Window> {
  throwIfNoExtensionContext("chrome_windows_create");
  return chromeApiCall(chrome.windows.create(params));
}

export async function handleChromeWindowsUpdate(
  params: z.infer<typeof ChromeWindowsUpdateParamsSchema>,
): Promise<chrome.windows.Window> {
  throwIfNoExtensionContext("chrome_windows_update");
  const windowId = params.windowId;
  const updateInfo = params.update ?? {};
  return chromeApiCall(chrome.windows.update(windowId as number, updateInfo));
}

export async function handleChromeWindowsRemove(
  params: z.infer<typeof ChromeWindowsRemoveParamsSchema>,
): Promise<null> {
  throwIfNoExtensionContext("chrome_windows_remove");
  const windowId = typeof params === "number" ? params : params.windowId;
  await chromeApiCall(chrome.windows.remove(windowId as number));
  return null;
}

export async function handleChromeSidePanelSetOptions(
  params: z.infer<typeof ChromeSidePanelSetOptionsParamsSchema>,
): Promise<null> {
  throwIfNoExtensionContext("chrome_sidePanel_setOptions");
  await chromeApiCall(chrome.sidePanel.setOptions(params));
  return null;
}

export async function handleChromeCookiesGet(
  params: z.infer<typeof CookiesGetParamsSchema>,
): Promise<chrome.cookies.Cookie | null> {
  throwIfNoExtensionContext("chrome_cookies_get");
  return chromeApiCall(chrome.cookies.get(params as chrome.cookies.Details));
}

export async function handleChromeCookiesSet(
  params: z.infer<typeof CookiesSetParamsSchema>,
): Promise<chrome.cookies.Cookie | null> {
  throwIfNoExtensionContext("chrome_cookies_set");
  return chromeApiCall(chrome.cookies.set(params as chrome.cookies.SetDetails));
}

export async function handleChromeCookiesRemove(
  params: z.infer<typeof CookiesDeleteParamsSchema>,
): Promise<chrome.cookies.Details> {
  throwIfNoExtensionContext("chrome_cookies_remove");
  return chromeApiCall(chrome.cookies.remove(params as chrome.cookies.Details));
}

export async function handleChromeCookiesGetAll(
  params: z.infer<typeof CookiesListParamsSchema>,
): Promise<chrome.cookies.Cookie[]> {
  throwIfNoExtensionContext("chrome_cookies_getAll");
  return chromeApiCall(chrome.cookies.getAll(params as chrome.cookies.Details));
}

export async function handleChromeBookmarksSearch(
  params: z.infer<typeof BookmarksSearchParamsSchema>,
): Promise<chrome.bookmarks.BookmarkTreeNode[]> {
  throwIfNoExtensionContext("chrome_bookmarks_search");
  const query = typeof params === "string" ? params : (params.query ?? "");
  return chromeApiCall(chrome.bookmarks.search(query));
}

export async function handleChromeBookmarksCreate(
  params: z.infer<typeof BookmarksCreateParamsSchema>,
): Promise<chrome.bookmarks.BookmarkTreeNode> {
  throwIfNoExtensionContext("chrome_bookmarks_create");
  return chromeApiCall(chrome.bookmarks.create(params));
}

export async function handleChromeBookmarksRemove(
  params: z.infer<typeof BookmarksDeleteParamsSchema>,
): Promise<null> {
  throwIfNoExtensionContext("chrome_bookmarks_remove");
  const bookmarkId = typeof params === "string" ? params : (params.id ?? "");
  await chromeApiCall(chrome.bookmarks.remove(bookmarkId));
  return null;
}

export async function handleChromeHistorySearch(
  params: z.infer<typeof HistorySearchParamsSchema>,
): Promise<chrome.history.HistoryItem[]> {
  throwIfNoExtensionContext("chrome_history_search");
  return chromeApiCall(
    chrome.history.search(params as chrome.history.HistoryQuery),
  );
}

export async function handleChromeHistoryDeleteUrl(
  params: z.infer<typeof HistoryDeleteParamsSchema>,
): Promise<null> {
  throwIfNoExtensionContext("chrome_history_deleteUrl");
  const url = typeof params === "string" ? params : (params.url ?? "");
  await chromeApiCall(
    chrome.history.deleteUrl(url as unknown as chrome.history.Url),
  );
  return null;
}

export async function handleChromeNotificationsCreate(
  params: z.infer<typeof NotificationsCreateParamsSchema>,
): Promise<string> {
  throwIfNoExtensionContext("chrome_notifications_create");
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

export async function handleChromeNotificationsClear(
  params: z.infer<typeof NotificationsClearParamsSchema>,
): Promise<boolean> {
  throwIfNoExtensionContext("chrome_notifications_clear");
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

export async function handleChromeScriptingExecuteScript(
  params: z.infer<typeof ChromeScriptingExecuteScriptParamsSchema>,
): Promise<unknown> {
  throwIfNoExtensionContext("chrome_scripting_executeScript");
  return chromeApiCall(
    chrome.scripting.executeScript(
      params as chrome.scripting.ScriptInjection<unknown[], unknown>,
    ),
  );
}

