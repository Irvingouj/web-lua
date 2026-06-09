import type { ToolTransport } from "./types.js";

export const CHROME_PASSTHROUGH_ACTIONS = new Set([
  "cookies_get",
  "cookies_set",
  "cookies_delete",
  "cookies_list",
  "history_search",
  "history_delete",
  "bookmarks_search",
  "bookmarks_create",
  "bookmarks_delete",
  "tab_query",
  "tab_create",
  "tab_activate",
  "tab_close",
  "page_close",
  "page_active_tab",
  "notifications_create",
  "notifications_clear",
]);

export function deriveTransport(action: string): ToolTransport {
  if (action.startsWith("sidepanel_")) return "sidepanel_dom";
  if (action.startsWith("chrome_")) return "chrome_api";
  if (action.startsWith("page_")) return "active_tab_content_script";
  if (action.startsWith("tab_")) return "specific_tab_content_script";
  if (CHROME_PASSTHROUGH_ACTIONS.has(action)) return "chrome_api";
  return "host_async";
}
