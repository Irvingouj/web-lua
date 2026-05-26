#!/usr/bin/env python3
"""Bulk-replace register_ext_api! with lua_api! and add lua_api_doc! for custom callbacks."""

import re
import sys

WEB_RS = "/Users/oujunyi/code/web-lua/crates/web-lua-core/src/web.rs"

# Mapping from action string to (doc, params, returns)
# params: list of (name, type, required, desc)
# returns: (type, desc)
ACTION_DOCS = {
    # web.tab
    "tab_query": (
        "Query Chrome tabs matching given criteria.",
        [("query_info", "table", "optional", "Query filter: active, currentWindow, url, etc.")],
        ("table", "Array of matching tab objects"),
    ),
    "tab_create": (
        "Create a new tab.",
        [("create_properties", "table", "optional", "URL, windowId, active, etc.")],
        ("table", "Created tab object"),
    ),
    "tab_activate": (
        "Activate (focus) a tab.",
        [("tab_id", "number", "required", "Tab ID to activate")],
        ("boolean", "Whether activation succeeded"),
    ),
    "tab_close": (
        "Close a tab.",
        [("tab_id", "number", "required", "Tab ID to close")],
        ("boolean", "Whether close succeeded"),
    ),
    "tab_execute_script": (
        "Execute JavaScript in a target tab.",
        [("tab_id", "number", "required", "Target tab ID"), ("script", "string | table", "required", "Script code or injection details")],
        ("table", "Injection results"),
    ),
    "tab_fill": (
        "Fill an input element by refId in the target tab.",
        [("tab_id", "number", "required", "Target tab ID"), ("ref_id", "number", "required", "Element refId from snapshot"), ("value", "string", "required", "Text to fill")],
        ("boolean", "Whether fill succeeded"),
    ),
    "tab_scroll_to": (
        "Scroll to an element by refId in the target tab.",
        [("tab_id", "number", "required", "Target tab ID"), ("ref_id", "number", "required", "Element refId from snapshot")],
        ("boolean", "Whether scroll succeeded"),
    ),
    "tab_evaluate": (
        "Evaluate JavaScript in a target tab and return the result.",
        [("tab_id", "number", "required", "Target tab ID"), ("script", "string", "required", "JavaScript code to evaluate")],
        ("any", "Evaluation result"),
    ),
    "tab_back": (
        "Navigate back in a target tab.",
        [("tab_id", "number", "required", "Target tab ID")],
        ("boolean", "Whether navigation succeeded"),
    ),
    "tab_wait_for_load": (
        "Wait for a tab to finish loading.",
        [("tab_id", "number", "required", "Target tab ID")],
        ("boolean", "Whether the tab loaded"),
    ),
    "tab_fetch": (
        "Perform an HTTP fetch inside a target tab origin.",
        [("tab_id", "number", "required", "Target tab ID"), ("url", "string", "required", "URL to fetch"), ("opts", "table | nil", "optional", "Options: method, body, headers, timeout")],
        ("table", "{ status, ok, body, headers }"),
    ),
    # web.cookies
    "cookies_get": (
        "Get a cookie by name and URL.",
        [("details", "table", "required", "Cookie query: name, url, storeId")],
        ("table | nil", "Cookie object or nil if not found"),
    ),
    "cookies_set": (
        "Set a cookie.",
        [("details", "table", "required", "Cookie to set: name, value, url, etc.")],
        ("table", "Set cookie object"),
    ),
    "cookies_delete": (
        "Delete a cookie.",
        [("details", "table", "required", "Cookie to delete: name, url")],
        ("boolean", "Whether deletion succeeded"),
    ),
    "cookies_list": (
        "List cookies matching a filter.",
        [("filter", "table", "optional", "Filter: url, name, domain, etc.")],
        ("table", "Array of cookie objects"),
    ),
    # web.history
    "history_search": (
        "Search browser history.",
        [("query", "table", "required", "Search query: text, startTime, endTime, maxResults")],
        ("table", "Array of history items"),
    ),
    "history_delete": (
        "Delete a URL from browser history.",
        [("url", "string", "required", "URL to remove from history")],
        ("boolean", "Whether deletion succeeded"),
    ),
    # web.bookmarks
    "bookmarks_search": (
        "Search bookmarks.",
        [("query", "string | table", "required", "Search string or query object")],
        ("table", "Array of bookmark nodes"),
    ),
    "bookmarks_create": (
        "Create a bookmark or folder.",
        [("bookmark", "table", "required", "Bookmark properties: parentId, title, url")],
        ("table", "Created bookmark node"),
    ),
    "bookmarks_delete": (
        "Delete a bookmark.",
        [("id", "string", "required", "Bookmark node ID to delete")],
        ("boolean", "Whether deletion succeeded"),
    ),
    # web.notifications
    "notifications_create": (
        "Create a browser notification.",
        [("id", "string | nil", "optional", "Notification ID (nil for auto-generated)"), ("options", "table", "required", "Notification options: type, title, message, iconUrl")],
        ("string", "Notification ID"),
    ),
    # web.clipboard
    "clipboard_read": (
        "Read text from the system clipboard.",
        [],
        ("string | nil", "Clipboard text or nil"),
    ),
    "clipboard_write": (
        "Write text to the system clipboard.",
        [("text", "string", "required", "Text to write")],
        ("boolean", "Whether write succeeded"),
    ),
    # chrome.runtime
    "chrome_runtime_sendMessage": (
        "Send a message to the extension background script or another extension.",
        [("message", "any", "required", "Message payload"), ("options", "table | nil", "optional", "Options: to, includeTlsChannelId")],
        ("any", "Response from the recipient"),
    ),
    # chrome.tabs
    "chrome_tabs_query": (
        "Query Chrome tabs matching given criteria.",
        [("query_info", "table", "required", "Query filter: active, currentWindow, url, etc.")],
        ("table", "Array of matching tab objects"),
    ),
    "chrome_tabs_create": (
        "Create a new Chrome tab.",
        [("create_properties", "table", "optional", "URL, windowId, active, etc.")],
        ("table", "Created tab object"),
    ),
    "chrome_tabs_update": (
        "Update properties of a tab.",
        [("tab_id", "number | nil", "optional", "Tab ID (nil for active tab)"), ("update_properties", "table", "required", "Properties: url, active, muted, etc.")],
        ("table", "Updated tab object"),
    ),
    "chrome_tabs_remove": (
        "Close one or more tabs.",
        [("tab_ids", "number | table", "required", "Tab ID or array of tab IDs")],
        ("boolean", "Whether removal succeeded"),
    ),
    "chrome_tabs_get": (
        "Get a tab by ID.",
        [("tab_id", "number", "required", "Tab ID")],
        ("table", "Tab object"),
    ),
    "chrome_tabs_reload": (
        "Reload a tab.",
        [("tab_id", "number | nil", "optional", "Tab ID (nil for active tab)"), ("reload_properties", "table | nil", "optional", "bypassCache")],
        ("boolean", "Whether reload succeeded"),
    ),
    "chrome_tabs_sendMessage": (
        "Send a message to a specific tab.",
        [("tab_id", "number", "required", "Target tab ID"), ("message", "any", "required", "Message payload"), ("options", "table | nil", "optional", "Options: frameId")],
        ("any", "Response from the tab"),
    ),
    # chrome.alarms
    "chrome_alarms_create": (
        "Create an alarm.",
        [("name", "string | nil", "optional", "Alarm name"), ("alarm_info", "table", "required", "When: delayInMinutes, periodInMinutes")],
        ("boolean", "Whether creation succeeded"),
    ),
    "chrome_alarms_clear": (
        "Clear an alarm.",
        [("name", "string | nil", "optional", "Alarm name (nil clears all)")],
        ("boolean", "Whether any alarm was cleared"),
    ),
    # chrome.action
    "chrome_action_setBadgeText": (
        "Set the badge text on the extension action icon.",
        [("details", "table", "required", "text, tabId")],
        ("boolean", "Whether set succeeded"),
    ),
    "chrome_action_setBadgeBackgroundColor": (
        "Set the badge background color.",
        [("details", "table", "required", "color, tabId")],
        ("boolean", "Whether set succeeded"),
    ),
    "chrome_action_setTitle": (
        "Set the title of the extension action.",
        [("details", "table", "required", "title, tabId")],
        ("boolean", "Whether set succeeded"),
    ),
    "chrome_action_setIcon": (
        "Set the icon of the extension action.",
        [("details", "table", "required", "imageData, path, tabId")],
        ("boolean", "Whether set succeeded"),
    ),
    # chrome.contextMenus
    "chrome_contextMenus_create": (
        "Create a context menu item.",
        [("create_properties", "table", "required", "id, title, contexts, onclick")],
        ("string | number", "Created item ID"),
    ),
    "chrome_contextMenus_remove": (
        "Remove a context menu item.",
        [("menuItemId", "string | number", "required", "Item ID to remove")],
        ("boolean", "Whether removal succeeded"),
    ),
    # chrome.windows
    "chrome_windows_getAll": (
        "Get all browser windows.",
        [("get_info", "table | nil", "optional", "populate, windowTypes")],
        ("table", "Array of window objects"),
    ),
    "chrome_windows_create": (
        "Create a new browser window.",
        [("create_data", "table | nil", "optional", "url, type, focused, etc.")],
        ("table", "Created window object"),
    ),
    "chrome_windows_update": (
        "Update a browser window.",
        [("window_id", "number", "required", "Window ID"), ("update_info", "table", "required", "focused, state, etc.")],
        ("table", "Updated window object"),
    ),
    "chrome_windows_remove": (
        "Close a browser window.",
        [("window_id", "number", "required", "Window ID to close")],
        ("boolean", "Whether close succeeded"),
    ),
    # chrome.sidePanel
    "chrome_sidePanel_setOptions": (
        "Configure the side panel behavior.",
        [("options", "table", "required", "enabled, path")],
        ("boolean", "Whether options were set"),
    ),
    # chrome.cookies
    "chrome_cookies_get": (
        "Get a cookie by details.",
        [("details", "table", "required", "name, url, storeId")],
        ("table | nil", "Cookie object or nil"),
    ),
    "chrome_cookies_set": (
        "Set a cookie.",
        [("details", "table", "required", "name, value, url, etc.")],
        ("table", "Set cookie object"),
    ),
    "chrome_cookies_remove": (
        "Remove a cookie.",
        [("details", "table", "required", "name, url")],
        ("boolean", "Whether removal succeeded"),
    ),
    "chrome_cookies_getAll": (
        "Get all cookies matching a filter.",
        [("details", "table", "optional", "url, name, domain, etc.")],
        ("table", "Array of cookie objects"),
    ),
    # chrome.bookmarks
    "chrome_bookmarks_search": (
        "Search bookmarks.",
        [("query", "string | table", "required", "Search string or query object")],
        ("table", "Array of bookmark nodes"),
    ),
    "chrome_bookmarks_create": (
        "Create a bookmark.",
        [("bookmark", "table", "required", "parentId, title, url, index")],
        ("table", "Created bookmark node"),
    ),
    "chrome_bookmarks_remove": (
        "Remove a bookmark.",
        [("id", "string", "required", "Bookmark node ID")],
        ("boolean", "Whether removal succeeded"),
    ),
    # chrome.history
    "chrome_history_search": (
        "Search browser history.",
        [("query", "table", "required", "text, startTime, endTime, maxResults")],
        ("table", "Array of history items"),
    ),
    "chrome_history_deleteUrl": (
        "Delete a URL from history.",
        [("url", "string", "required", "URL to remove")],
        ("boolean", "Whether deletion succeeded"),
    ),
    # chrome.notifications
    "chrome_notifications_create": (
        "Create a notification.",
        [("id", "string | nil", "optional", "Notification ID"), ("options", "table", "required", "type, title, message, iconUrl")],
        ("string", "Notification ID"),
    ),
    "chrome_notifications_clear": (
        "Clear a notification.",
        [("id", "string", "required", "Notification ID to clear")],
        ("boolean", "Whether notification was cleared"),
    ),
    # chrome.scripting
    "chrome_scripting_executeScript": (
        "Inject JavaScript into a page.",
        [("target", "table", "required", "tabId, frameIds, allFrames"), ("func", "string | table | nil", "optional", "Function or script to inject")],
        ("table", "Array of injection results"),
    ),
}

# Custom callbacks that need lua_api_doc!
# Mapping from (namespace, name) to (action, doc, params, returns)
CUSTOM_CALLBACK_DOCS = {
    ("web", "mock_async"): (
        "mock_async",
        "Yield for testing, resumes with provided value.",
        [("label", "string | nil", "optional", "Test label")],
        ("string", "Test label echoed back"),
    ),
    ("web.url", "parse"): (
        "url_parse",
        "Parse a URL string into components.",
        [("url", "string", "required", "URL string to parse")],
        ("table", "Parsed URL components: protocol, host, pathname, search, hash"),
    ),
    ("web.url", "encode"): (
        "url_encode",
        "Encode a table into a query string.",
        [("params", "table", "required", "Key-value pairs to encode")],
        ("string", "URL-encoded query string"),
    ),
    ("web", "log"): (
        "web_log",
        "Log a message to the browser console.",
        [("message", "any", "required", "Value to log")],
        ("nil", "None"),
    ),
    ("web", "sleep"): (
        "sleep",
        "Pause execution for a duration.",
        [("ms", "number", "optional", "Milliseconds to sleep (default 1000)")],
        ("nil", "None"),
    ),
    ("web.storage", "get"): (
        "storage_get",
        "Get a value from web storage.",
        [("key", "string", "required", "Storage key")],
        ("string | nil", "Stored value or nil"),
    ),
    ("web.storage", "set"): (
        "storage_set",
        "Set a value in web storage.",
        [("key", "string", "required", "Storage key"), ("value", "string", "required", "Value to store")],
        ("boolean", "Whether set succeeded"),
    ),
    ("web.storage", "delete"): (
        "storage_delete",
        "Remove a key from web storage.",
        [("key", "string", "required", "Storage key to remove")],
        ("boolean", "Whether deletion succeeded"),
    ),
    ("web.storage", "list"): (
        "storage_list",
        "List all keys in web storage.",
        [],
        ("table", "Array of key strings"),
    ),
    ("dom", "format"): (
        "dom_format",
        "Format a DOM snapshot into a text representation.",
        [("snapshot", "table", "required", "DOM snapshot object"), ("format", "string | nil", "optional", "Output format: compact-text, markdown, etc.")],
        ("string", "Formatted text representation"),
    ),
    ("page", "dblclick"): (
        "page_dblclick",
        "Double-click an element by refId.",
        [("ref_id", "string", "required", "Element refId from snapshot")],
        ("nil", "None"),
    ),
    ("page", "fill"): (
        "page_fill",
        "Fill an input element by refId with a value.",
        [("ref_id", "string", "required", "Element refId from snapshot"), ("value", "string", "required", "Text to fill")],
        ("nil", "None"),
    ),
    ("page", "type"): (
        "page_type",
        "Append text to an input element by refId.",
        [("ref_id", "string", "required", "Element refId from snapshot"), ("text", "string", "required", "Text to append")],
        ("nil", "None"),
    ),
    ("page", "press"): (
        "page_press",
        "Press a keyboard key.",
        [("key", "string", "required", "Key name: Enter, Escape, ArrowDown, etc.")],
        ("nil", "None"),
    ),
    ("page", "select"): (
        "page_select",
        "Select an option in a dropdown by refId and value.",
        [("ref_id", "string", "required", "Element refId from snapshot"), ("value", "string", "required", "Option value to select")],
        ("nil", "None"),
    ),
    ("page", "check"): (
        "page_check",
        "Check or uncheck a checkbox by refId.",
        [("ref_id", "string", "required", "Element refId from snapshot"), ("checked", "boolean", "optional", "Checked state (default true)")],
        ("nil", "None"),
    ),
    ("page", "hover"): (
        "page_hover",
        "Hover over an element by refId.",
        [("ref_id", "string", "required", "Element refId from snapshot")],
        ("nil", "None"),
    ),
    ("page", "unhover"): (
        "page_unhover",
        "Move mouse away from any hovered element.",
        [],
        ("nil", "None"),
    ),
    ("page", "scroll"): (
        "page_scroll",
        "Scroll the page by direction and amount.",
        [("direction", "string", "optional", "up, down, left, right (default down)"), ("amount", "number", "optional", "Pixels to scroll (default 300)")],
        ("nil", "None"),
    ),
    ("page", "scroll_to"): (
        "page_scroll_to",
        "Scroll to an element by refId.",
        [("ref_id", "string", "required", "Element refId from snapshot")],
        ("nil", "None"),
    ),
    ("page", "url"): (
        "page_url",
        "Get the current page URL.",
        [],
        ("string", "Current URL"),
    ),
    ("page", "title"): (
        "page_title",
        "Get the current page title.",
        [],
        ("string", "Current page title"),
    ),
    ("page", "screenshot"): (
        "page_screenshot",
        "Take a screenshot of the current page.",
        [],
        ("string", "Base64-encoded screenshot image"),
    ),
    ("page", "goto"): (
        "page_goto",
        "Navigate to a URL.",
        [("url", "string", "required", "URL to navigate to")],
        ("nil", "None"),
    ),
    ("page", "back"): (
        "page_back",
        "Navigate back in history.",
        [],
        ("nil", "None"),
    ),
    ("page", "forward"): (
        "page_forward",
        "Navigate forward in history.",
        [],
        ("nil", "None"),
    ),
    ("page", "reload"): (
        "page_reload",
        "Reload the current page.",
        [],
        ("nil", "None"),
    ),
    ("page", "wait"): (
        "page_wait",
        "Wait for a duration.",
        [("ms", "number", "optional", "Milliseconds to wait (default 1000)")],
        ("nil", "None"),
    ),
    ("page", "tabs"): (
        "page_tabs",
        "Get all tabs in the current window (extension mode).",
        [],
        ("table", "Array of tab objects"),
    ),
    ("page", "switch"): (
        "page_switch",
        "Switch to a tab by ID.",
        [("tab_id", "number", "required", "Tab ID to switch to")],
        ("nil", "None"),
    ),
    ("page", "new_tab"): (
        "page_new_tab",
        "Open a new tab (optionally with a URL).",
        [("url", "string | nil", "optional", "URL to open in the new tab")],
        ("table", "Created tab object"),
    ),
    ("page", "close"): (
        "page_close",
        "Close a tab by ID.",
        [("tab_id", "number", "required", "Tab ID to close")],
        ("boolean", "Whether close succeeded"),
    ),
    ("page", "active_tab"): (
        "page_active_tab",
        "Get the currently active tab ID.",
        [],
        ("number | nil", "Active tab ID or nil"),
    ),
    ("host", "call"): (
        "host_call",
        "Call a registered host handler by name.",
        [("action", "string", "required", "Handler action name"), ("params", "table | nil", "optional", "Parameters to pass to handler")],
        ("any", "Handler response"),
    ),
    ("runtime", "inspect"): (
        "runtime_inspect",
        "Inspect all global variables in the Lua state.",
        [],
        ("table", "Array of global variable descriptors: name, type, keys, value"),
    ),
}

# Already-documented custom callbacks (skip these)
ALREADY_DOCUMENTED = {
    ("web", "fetch"),
    ("dom", "snapshot"),
    ("page", "click"),
}


def format_lua_api_call(table, name, action, host_state, namespace, doc, params, returns):
    lines = [f'    lua_api!({table},']
    lines.append(f'        name: "{name}",')
    lines.append(f'        action: "{action}",')
    lines.append(f'        host_state: {host_state},')
    lines.append(f'        namespace: "{namespace}",')
    lines.append(f'        doc: "{doc}",')
    lines.append('        params: [')
    for pname, ptype, preq, pdesc in params:
        lines.append(f'            {pname}: "{ptype}", {preq}, "{pdesc}",')
    lines.append('        ],')
    lines.append(f'        returns: "{returns[0]}" => "{returns[1]}",')
    lines.append('    );')
    return '\n'.join(lines)


def format_lua_api_doc(namespace, name, action, doc, params, returns):
    lines = [f'    crate::lua_api_doc!(']
    lines.append(f'        namespace: "{namespace}",')
    lines.append(f'        name: "{name}",')
    lines.append(f'        action: "{action}",')
    lines.append(f'        doc: "{doc}",')
    lines.append('        params: [')
    for pname, ptype, preq, pdesc in params:
        lines.append(f'            {pname}: "{ptype}", {preq}, "{pdesc}",')
    lines.append('        ],')
    lines.append(f'        returns: "{returns[0]}" => "{returns[1]}",')
    lines.append('    );')
    return '\n'.join(lines)


def main():
    with open(WEB_RS, 'r') as f:
        content = f.read()

    # 1. Replace register_ext_api! calls
    pattern = re.compile(
        r'^\s*register_ext_api!\(([^,]+),\s*"([^"]+)",\s*"([^"]+)",\s*([^)]+)\);',
        re.MULTILINE
    )

    # Track whether we're in the chrome section
    in_chrome_section = False
    def replace_register(match):
        nonlocal in_chrome_section
        table = match.group(1).strip()
        method = match.group(2)
        action = match.group(3)
        hs = match.group(4).strip()

        # Determine namespace from table name and section
        if table == 'tab_table':
            namespace = 'web.tab'
        elif table == 'runtime_table':
            namespace = 'chrome.runtime'
        elif table == 'tabs_table':
            namespace = 'chrome.tabs'
        elif table == 'alarms_table':
            namespace = 'chrome.alarms'
        elif table == 'action_table':
            namespace = 'chrome.action'
        elif table == 'context_menus_table':
            namespace = 'chrome.contextMenus'
        elif table == 'windows_table':
            namespace = 'chrome.windows'
        elif table == 'side_panel_table':
            namespace = 'chrome.sidePanel'
        elif table == 'scripting_table':
            namespace = 'chrome.scripting'
        elif table in ('cookies_table', 'history_table', 'bookmarks_table', 'notifications_table', 'clipboard_table'):
            # Determine web vs chrome by checking if we're in chrome section
            # We use a heuristic: look at the action prefix
            if action.startswith('chrome_'):
                # Map to chrome namespace
                parts = action.split('_')
                if len(parts) >= 2:
                    namespace = f'chrome.{parts[1]}'
                else:
                    namespace = 'chrome'
            else:
                namespace = f'web.{table.replace("_table", "")}'
        else:
            namespace = 'web'

        doc_info = ACTION_DOCS.get(action)
        if doc_info is None:
            print(f"WARNING: No doc info for action {action}, keeping register_ext_api!", file=sys.stderr)
            return match.group(0)

        doc, params, returns = doc_info
        return format_lua_api_call(table, method, action, hs, namespace, doc, params, returns)

    # We need to track chrome section state, but re.sub doesn't let us easily do that
    # So let's do a line-by-line approach
    lines = content.split('\n')
    new_lines = []
    in_chrome = False
    i = 0
    while i < len(lines):
        line = lines[i]
        # Check if we're entering chrome section
        if 'let chrome_table = Table::new(&ctx);' in line:
            in_chrome = True

        # Check for register_ext_api!
        m = re.match(r'^(\s*)register_ext_api!\(([^,]+),\s*"([^"]+)",\s*"([^"]+)",\s*([^)]+)\);', line)
        if m:
            indent = m.group(1)
            table = m.group(2).strip()
            method = m.group(3)
            action = m.group(4)
            hs = m.group(5).strip()

            # Determine namespace
            if table == 'tab_table':
                namespace = 'web.tab'
            elif table == 'runtime_table':
                namespace = 'chrome.runtime'
            elif table == 'tabs_table':
                namespace = 'chrome.tabs'
            elif table == 'alarms_table':
                namespace = 'chrome.alarms'
            elif table == 'action_table':
                namespace = 'chrome.action'
            elif table == 'context_menus_table':
                namespace = 'chrome.contextMenus'
            elif table == 'windows_table':
                namespace = 'chrome.windows'
            elif table == 'side_panel_table':
                namespace = 'chrome.sidePanel'
            elif table == 'scripting_table':
                namespace = 'chrome.scripting'
            elif table in ('cookies_table', 'history_table', 'bookmarks_table', 'notifications_table', 'clipboard_table'):
                if action.startswith('chrome_'):
                    parts = action.split('_')
                    if len(parts) >= 2:
                        namespace = f'chrome.{parts[1]}'
                    else:
                        namespace = 'chrome'
                else:
                    namespace = f'web.{table.replace("_table", "")}'
            else:
                namespace = 'web'

            doc_info = ACTION_DOCS.get(action)
            if doc_info:
                doc, params, returns = doc_info
                replacement = format_lua_api_call(table, method, action, hs, namespace, doc, params, returns)
                for rline in replacement.split('\n'):
                    new_lines.append(indent + rline.lstrip())
            else:
                print(f"WARNING: No doc for action {action}, keeping as-is", file=sys.stderr)
                new_lines.append(line)
            i += 1
            continue

        # Check for multi-line register_ext_api!
        m = re.match(r'^(\s*)register_ext_api!\(', line)
        if m:
            # Collect the full macro call
            indent = m.group(1)
            j = i
            macro_lines = []
            while j < len(lines) and ');' not in lines[j]:
                macro_lines.append(lines[j])
                j += 1
            if j < len(lines):
                macro_lines.append(lines[j])
                j += 1

            # Try to parse
            macro_text = ' '.join(macro_lines)
            mm = re.search(r'register_ext_api!\(([^,]+),\s*"([^"]+)",\s*"([^"]+)",\s*([^)]+)\);', macro_text)
            if mm:
                table = mm.group(1).strip()
                method = mm.group(2)
                action = mm.group(3)
                hs = mm.group(4).strip()

                # Determine namespace (same logic as above)
                if table == 'tab_table':
                    namespace = 'web.tab'
                elif table == 'runtime_table':
                    namespace = 'chrome.runtime'
                elif table == 'tabs_table':
                    namespace = 'chrome.tabs'
                elif table == 'alarms_table':
                    namespace = 'chrome.alarms'
                elif table == 'action_table':
                    namespace = 'chrome.action'
                elif table == 'context_menus_table':
                    namespace = 'chrome.contextMenus'
                elif table == 'windows_table':
                    namespace = 'chrome.windows'
                elif table == 'side_panel_table':
                    namespace = 'chrome.sidePanel'
                elif table == 'scripting_table':
                    namespace = 'chrome.scripting'
                elif table in ('cookies_table', 'history_table', 'bookmarks_table', 'notifications_table', 'clipboard_table'):
                    if action.startswith('chrome_'):
                        parts = action.split('_')
                        if len(parts) >= 2:
                            namespace = f'chrome.{parts[1]}'
                        else:
                            namespace = 'chrome'
                    else:
                        namespace = f'web.{table.replace("_table", "")}'
                else:
                    namespace = 'web'

                doc_info = ACTION_DOCS.get(action)
                if doc_info:
                    doc, params, returns = doc_info
                    replacement = format_lua_api_call(table, method, action, hs, namespace, doc, params, returns)
                    for rline in replacement.split('\n'):
                        new_lines.append(indent + rline.lstrip())
                else:
                    print(f"WARNING: No doc for action {action}, keeping as-is", file=sys.stderr)
                    new_lines.extend(macro_lines)
                i = j
                continue
            else:
                new_lines.extend(macro_lines)
                i = j
                continue

        # Check for set_field custom callbacks that need lua_api_doc!
        # Pattern: table.set_field(ctx, "name", cb_name);
        m2 = re.match(r'^(\s*)(\w+_table)\.set_field\(ctx,\s*"([^"]+)",\s*(\w+)\);', line)
        if m2:
            indent = m2.group(1)
            table_name = m2.group(2)
            method_name = m2.group(3)
            cb_name = m2.group(4)

            # Determine namespace from table_name
            if table_name == 'web_table':
                ns = 'web'
            elif table_name == 'tab_table':
                ns = 'web.tab'
            elif table_name == 'url_table':
                ns = 'web.url'
            elif table_name == 'storage_table':
                ns = 'web.storage'
            elif table_name == 'dom_table':
                ns = 'dom'
            elif table_name == 'page_table':
                ns = 'page'
            elif table_name == 'host_table':
                ns = 'host'
            elif table_name == 'runtime_table':
                ns = 'runtime'
            else:
                ns = 'web'

            key = (ns, method_name)
            if key in ALREADY_DOCUMENTED:
                new_lines.append(line)
                i += 1
                continue

            doc_info = CUSTOM_CALLBACK_DOCS.get(key)
            if doc_info:
                action, doc, params, returns = doc_info
                doc_block = format_lua_api_doc(ns, method_name, action, doc, params, returns)
                new_lines.append(line)
                for dline in doc_block.split('\n'):
                    new_lines.append(indent + dline.lstrip())
            else:
                new_lines.append(line)
        else:
            new_lines.append(line)

        i += 1

    new_content = '\n'.join(new_lines)
    with open(WEB_RS, 'w') as f:
        f.write(new_content)

    print(f"Processed {len(lines)} lines. Wrote {len(new_lines)} lines.")


if __name__ == '__main__':
    main()
