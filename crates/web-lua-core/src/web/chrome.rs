use crate::state::HostState;
use piccolo::{Context, Table};
use std::cell::RefCell;
use std::rc::Rc;

pub(crate) fn register<'a>(ctx: Context<'a>, host_state: Rc<RefCell<HostState>>) {
    let _chrome_table = Table::new(&ctx);

    // ── chrome module (browser extension APIs) ──
    let chrome_table = Table::new(&ctx);

    // chrome.runtime
    let runtime_table = Table::new(&ctx);
    lua_api!(ctx, runtime_table,
    name: "sendMessage",
    action: "chrome_runtime_sendMessage",
    host_state: host_state,
    namespace: "chrome.runtime",
    doc: "Send a message to the extension background script or another extension.",
    params: [
    message: "any", required, "Message payload",
    options: "table | nil", optional, "Options: to, includeTlsChannelId",
    ],
    returns: "any" => "Response from the recipient",
    );
    chrome_table.set_field(ctx, "runtime", runtime_table);

    // chrome.tabs
    let tabs_table = Table::new(&ctx);
    lua_api!(ctx, tabs_table,
        name: "query",
        action: "chrome_tabs_query",
        host_state: host_state,
        namespace: "chrome.tabs",
        doc: "Query Chrome tabs matching given criteria.",
        params: [
            query_info: "table", required, "Query filter: active, currentWindow, url, etc.",
        ],
        returns: "table" => "Array of matching tab objects",
    );
    lua_api!(ctx, tabs_table,
    name: "create",
    action: "chrome_tabs_create",
    host_state: host_state,
    namespace: "chrome.tabs",
    doc: "Create a new Chrome tab.",
    params: [
    create_properties: "table", optional, "URL, windowId, active, etc.",
    ],
    returns: "table" => "Created tab object",
    );
    lua_api!(ctx, tabs_table,
    name: "update",
    action: "chrome_tabs_update",
    host_state: host_state,
    namespace: "chrome.tabs",
    doc: "Update properties of a tab.",
    params: [
    tab_id: "number | nil", optional, "Tab ID (nil for active tab)",
    update_properties: "table", required, "Properties: url, active, muted, etc.",
    ],
    returns: "table" => "Updated tab object",
    );
    lua_api!(ctx, tabs_table,
    name: "remove",
    action: "chrome_tabs_remove",
    host_state: host_state,
    namespace: "chrome.tabs",
    doc: "Close one or more tabs.",
    params: [
    tab_ids: "number | table", required, "Tab ID or array of tab IDs",
    ],
    returns: "boolean" => "Whether removal succeeded",
    );
    lua_api!(ctx, tabs_table,
    name: "get",
    action: "chrome_tabs_get",
    host_state: host_state,
    namespace: "chrome.tabs",
    doc: "Get a tab by ID.",
    params: [
    tab_id: "number", required, "Tab ID",
    ],
    returns: "table" => "Tab object",
    );
    lua_api!(ctx, tabs_table,
    name: "reload",
    action: "chrome_tabs_reload",
    host_state: host_state,
    namespace: "chrome.tabs",
    doc: "Reload a tab.",
    params: [
    tab_id: "number | nil", optional, "Tab ID (nil for active tab)",
    reload_properties: "table | nil", optional, "bypassCache",
    ],
    returns: "boolean" => "Whether reload succeeded",
    );
    lua_api!(ctx, tabs_table,
    name: "sendMessage",
    action: "chrome_tabs_sendMessage",
    host_state: host_state,
    namespace: "chrome.tabs",
    doc: "Send a message to a specific tab.",
    params: [
    tab_id: "number", required, "Target tab ID",
    message: "any", required, "Message payload",
    options: "table | nil", optional, "Options: frameId",
    ],
    returns: "any" => "Response from the tab",
    );
    chrome_table.set_field(ctx, "tabs", tabs_table);

    // chrome.alarms
    let alarms_table = Table::new(&ctx);
    lua_api!(ctx, alarms_table,
    name: "create",
    action: "chrome_alarms_create",
    host_state: host_state,
    namespace: "chrome.alarms",
    doc: "Create an alarm.",
    params: [
    name: "string | nil", optional, "Alarm name",
    alarm_info: "table", required, "When: delayInMinutes, periodInMinutes",
    ],
    returns: "boolean" => "Whether creation succeeded",
    );
    lua_api!(ctx, alarms_table,
    name: "clear",
    action: "chrome_alarms_clear",
    host_state: host_state,
    namespace: "chrome.alarms",
    doc: "Clear an alarm.",
    params: [
    name: "string | nil", optional, "Alarm name (nil clears all)",
    ],
    returns: "boolean" => "Whether any alarm was cleared",
    );
    chrome_table.set_field(ctx, "alarms", alarms_table);

    // chrome.action
    let action_table = Table::new(&ctx);
    lua_api!(ctx, action_table,
    name: "setBadgeText",
    action: "chrome_action_setBadgeText",
    host_state: host_state,
    namespace: "chrome.action",
    doc: "Set the badge text on the extension action icon.",
    params: [
    details: "table", required, "text, tabId",
    ],
    returns: "boolean" => "Whether set succeeded",
    );
    lua_api!(ctx, action_table,
    name: "setBadgeBackgroundColor",
    action: "chrome_action_setBadgeBackgroundColor",
    host_state: host_state,
    namespace: "chrome.action",
    doc: "Set the badge background color.",
    params: [
    details: "table", required, "color, tabId",
    ],
    returns: "boolean" => "Whether set succeeded",
    );
    lua_api!(ctx, action_table,
    name: "setTitle",
    action: "chrome_action_setTitle",
    host_state: host_state,
    namespace: "chrome.action",
    doc: "Set the title of the extension action.",
    params: [
    details: "table", required, "title, tabId",
    ],
    returns: "boolean" => "Whether set succeeded",
    );
    lua_api!(ctx, action_table,
    name: "setIcon",
    action: "chrome_action_setIcon",
    host_state: host_state,
    namespace: "chrome.action",
    doc: "Set the icon of the extension action.",
    params: [
    details: "table", required, "imageData, path, tabId",
    ],
    returns: "boolean" => "Whether set succeeded",
    );
    chrome_table.set_field(ctx, "action", action_table);

    // chrome.contextMenus
    let context_menus_table = Table::new(&ctx);
    lua_api!(ctx, context_menus_table,
    name: "create",
    action: "chrome_contextMenus_create",
    host_state: host_state,
    namespace: "chrome.contextMenus",
    doc: "Create a context menu item.",
    params: [
    create_properties: "table", required, "id, title, contexts, onclick",
    ],
    returns: "string | number" => "Created item ID",
    );
    lua_api!(ctx, context_menus_table,
    name: "remove",
    action: "chrome_contextMenus_remove",
    host_state: host_state,
    namespace: "chrome.contextMenus",
    doc: "Remove a context menu item.",
    params: [
    menuItemId: "string | number", required, "Item ID to remove",
    ],
    returns: "boolean" => "Whether removal succeeded",
    );
    chrome_table.set_field(ctx, "contextMenus", context_menus_table);

    // chrome.windows
    let windows_table = Table::new(&ctx);
    lua_api!(ctx, windows_table,
    name: "getAll",
    action: "chrome_windows_getAll",
    host_state: host_state,
    namespace: "chrome.windows",
    doc: "Get all browser windows.",
    params: [
    get_info: "table | nil", optional, "populate, windowTypes",
    ],
    returns: "table" => "Array of window objects",
    );
    lua_api!(ctx, windows_table,
    name: "create",
    action: "chrome_windows_create",
    host_state: host_state,
    namespace: "chrome.windows",
    doc: "Create a new browser window.",
    params: [
    create_data: "table | nil", optional, "url, type, focused, etc.",
    ],
    returns: "table" => "Created window object",
    );
    lua_api!(ctx, windows_table,
    name: "update",
    action: "chrome_windows_update",
    host_state: host_state,
    namespace: "chrome.windows",
    doc: "Update a browser window.",
    params: [
    window_id: "number", required, "Window ID",
    update_info: "table", required, "focused, state, etc.",
    ],
    returns: "table" => "Updated window object",
    );
    lua_api!(ctx, windows_table,
    name: "remove",
    action: "chrome_windows_remove",
    host_state: host_state,
    namespace: "chrome.windows",
    doc: "Close a browser window.",
    params: [
    window_id: "number", required, "Window ID to close",
    ],
    returns: "boolean" => "Whether close succeeded",
    );
    chrome_table.set_field(ctx, "windows", windows_table);

    // chrome.sidePanel
    let side_panel_table = Table::new(&ctx);
    lua_api!(ctx, side_panel_table,
    name: "setOptions",
    action: "chrome_sidePanel_setOptions",
    host_state: host_state,
    namespace: "chrome.sidePanel",
    doc: "Configure the side panel behavior.",
    params: [
    options: "table", required, "enabled, path",
    ],
    returns: "boolean" => "Whether options were set",
    );
    chrome_table.set_field(ctx, "sidePanel", side_panel_table);

    // chrome.cookies
    let cookies_table = Table::new(&ctx);
    lua_api!(ctx, cookies_table,
    name: "get",
    action: "chrome_cookies_get",
    host_state: host_state,
    namespace: "chrome.cookies",
    doc: "Get a cookie by details.",
    params: [
    details: "table", required, "name, url, storeId",
    ],
    returns: "table | nil" => "Cookie object or nil",
    );
    lua_api!(ctx, cookies_table,
    name: "set",
    action: "chrome_cookies_set",
    host_state: host_state,
    namespace: "chrome.cookies",
    doc: "Set a cookie.",
    params: [
    details: "table", required, "name, value, url, etc.",
    ],
    returns: "table" => "Set cookie object",
    );
    lua_api!(ctx, cookies_table,
    name: "remove",
    action: "chrome_cookies_remove",
    host_state: host_state,
    namespace: "chrome.cookies",
    doc: "Remove a cookie.",
    params: [
    details: "table", required, "name, url",
    ],
    returns: "boolean" => "Whether removal succeeded",
    );
    lua_api!(ctx, cookies_table,
    name: "getAll",
    action: "chrome_cookies_getAll",
    host_state: host_state,
    namespace: "chrome.cookies",
    doc: "Get all cookies matching a filter.",
    params: [
    details: "table", optional, "url, name, domain, etc.",
    ],
    returns: "table" => "Array of cookie objects",
    );
    chrome_table.set_field(ctx, "cookies", cookies_table);

    // chrome.bookmarks
    let bookmarks_table = Table::new(&ctx);
    lua_api!(ctx, bookmarks_table,
    name: "search",
    action: "chrome_bookmarks_search",
    host_state: host_state,
    namespace: "chrome.bookmarks",
    doc: "Search bookmarks.",
    params: [
    query: "string | table", required, "Search string or query object",
    ],
    returns: "table" => "Array of bookmark nodes",
    );
    lua_api!(ctx, bookmarks_table,
    name: "create",
    action: "chrome_bookmarks_create",
    host_state: host_state,
    namespace: "chrome.bookmarks",
    doc: "Create a bookmark.",
    params: [
    bookmark: "table", required, "parentId, title, url, index",
    ],
    returns: "table" => "Created bookmark node",
    );
    lua_api!(ctx, bookmarks_table,
    name: "remove",
    action: "chrome_bookmarks_remove",
    host_state: host_state,
    namespace: "chrome.bookmarks",
    doc: "Remove a bookmark.",
    params: [
    id: "string", required, "Bookmark node ID",
    ],
    returns: "boolean" => "Whether removal succeeded",
    );
    chrome_table.set_field(ctx, "bookmarks", bookmarks_table);

    // chrome.history
    let history_table = Table::new(&ctx);
    lua_api!(ctx, history_table,
    name: "search",
    action: "chrome_history_search",
    host_state: host_state,
    namespace: "chrome.history",
    doc: "Search browser history.",
    params: [
    query: "table", required, "text, startTime, endTime, maxResults",
    ],
    returns: "table" => "Array of history items",
    );
    lua_api!(ctx, history_table,
    name: "deleteUrl",
    action: "chrome_history_deleteUrl",
    host_state: host_state,
    namespace: "chrome.history",
    doc: "Delete a URL from history.",
    params: [
    url: "string", required, "URL to remove",
    ],
    returns: "boolean" => "Whether deletion succeeded",
    );
    chrome_table.set_field(ctx, "history", history_table);

    // chrome.notifications
    let notifications_table = Table::new(&ctx);
    lua_api!(ctx, notifications_table,
    name: "create",
    action: "chrome_notifications_create",
    host_state: host_state,
    namespace: "chrome.notifications",
    doc: "Create a notification.",
    params: [
    id: "string | nil", optional, "Notification ID",
    options: "table", required, "type, title, message, iconUrl",
    ],
    returns: "string" => "Notification ID",
    );
    lua_api!(ctx, notifications_table,
    name: "clear",
    action: "chrome_notifications_clear",
    host_state: host_state,
    namespace: "chrome.notifications",
    doc: "Clear a notification.",
    params: [
    id: "string", required, "Notification ID to clear",
    ],
    returns: "boolean" => "Whether notification was cleared",
    );
    chrome_table.set_field(ctx, "notifications", notifications_table);

    // chrome.scripting
    let scripting_table = Table::new(&ctx);
    lua_api!(ctx, scripting_table,
    name: "executeScript",
    action: "chrome_scripting_executeScript",
    host_state: host_state,
    namespace: "chrome.scripting",
    doc: "Inject JavaScript into a page.",
    params: [
    target: "table", required, "tabId, frameIds, allFrames",
    func: "string | table | nil", optional, "Function or script to inject",
    ],
    returns: "table" => "Array of injection results",
    );
    chrome_table.set_field(ctx, "scripting", scripting_table);

    ctx.set_global("chrome", chrome_table);
}
