## `chrome.action` module

### `chrome.action.setBadgeText _(action: `chrome_action_setBadgeText`)_`

Set the badge text on the extension action icon.

**Parameters**

- `details` (`table`, required): text, tabId

**Returns** `boolean`: Whether set succeeded

### `chrome.action.setBadgeBackgroundColor _(action: `chrome_action_setBadgeBackgroundColor`)_`

Set the badge background color.

**Parameters**

- `details` (`table`, required): color, tabId

**Returns** `boolean`: Whether set succeeded

### `chrome.action.setTitle _(action: `chrome_action_setTitle`)_`

Set the title of the extension action.

**Parameters**

- `details` (`table`, required): title, tabId

**Returns** `boolean`: Whether set succeeded

### `chrome.action.setIcon _(action: `chrome_action_setIcon`)_`

Set the icon of the extension action.

**Parameters**

- `details` (`table`, required): imageData, path, tabId

**Returns** `boolean`: Whether set succeeded

## `chrome.alarms` module

### `chrome.alarms.create _(action: `chrome_alarms_create`)_`

Create an alarm.

**Parameters**

- `name` (`string | nil`, optional): Alarm name
- `alarm_info` (`table`, required): When: delayInMinutes, periodInMinutes

**Returns** `boolean`: Whether creation succeeded

### `chrome.alarms.clear _(action: `chrome_alarms_clear`)_`

Clear an alarm.

**Parameters**

- `name` (`string | nil`, optional): Alarm name (nil clears all)

**Returns** `boolean`: Whether any alarm was cleared

## `chrome.bookmarks` module

### `chrome.bookmarks.search _(action: `chrome_bookmarks_search`)_`

Search bookmarks.

**Parameters**

- `query` (`string | table`, required): Search string or query object

**Returns** `table`: Array of bookmark nodes

### `chrome.bookmarks.create _(action: `chrome_bookmarks_create`)_`

Create a bookmark.

**Parameters**

- `bookmark` (`table`, required): parentId, title, url, index

**Returns** `table`: Created bookmark node

### `chrome.bookmarks.remove _(action: `chrome_bookmarks_remove`)_`

Remove a bookmark.

**Parameters**

- `id` (`string`, required): Bookmark node ID

**Returns** `boolean`: Whether removal succeeded

## `chrome.contextMenus` module

### `chrome.contextMenus.create _(action: `chrome_contextMenus_create`)_`

Create a context menu item.

**Parameters**

- `create_properties` (`table`, required): id, title, contexts, onclick

**Returns** `string | number`: Created item ID

### `chrome.contextMenus.remove _(action: `chrome_contextMenus_remove`)_`

Remove a context menu item.

**Parameters**

- `menuItemId` (`string | number`, required): Item ID to remove

**Returns** `boolean`: Whether removal succeeded

## `chrome.cookies` module

### `chrome.cookies.get _(action: `chrome_cookies_get`)_`

Get a cookie by details.

**Parameters**

- `details` (`table`, required): name, url, storeId

**Returns** `table | nil`: Cookie object or nil

### `chrome.cookies.set _(action: `chrome_cookies_set`)_`

Set a cookie.

**Parameters**

- `details` (`table`, required): name, value, url, etc.

**Returns** `table`: Set cookie object

### `chrome.cookies.remove _(action: `chrome_cookies_remove`)_`

Remove a cookie.

**Parameters**

- `details` (`table`, required): name, url

**Returns** `boolean`: Whether removal succeeded

### `chrome.cookies.getAll _(action: `chrome_cookies_getAll`)_`

Get all cookies matching a filter.

**Parameters**

- `details` (`table`, optional): url, name, domain, etc.

**Returns** `table`: Array of cookie objects

## `chrome.history` module

### `chrome.history.search _(action: `chrome_history_search`)_`

Search browser history.

**Parameters**

- `query` (`table`, required): text, startTime, endTime, maxResults

**Returns** `table`: Array of history items

### `chrome.history.deleteUrl _(action: `chrome_history_deleteUrl`)_`

Delete a URL from history.

**Parameters**

- `url` (`string`, required): URL to remove

**Returns** `boolean`: Whether deletion succeeded

## `chrome.notifications` module

### `chrome.notifications.create _(action: `chrome_notifications_create`)_`

Create a notification.

**Parameters**

- `id` (`string | nil`, optional): Notification ID
- `options` (`table`, required): type, title, message, iconUrl

**Returns** `string`: Notification ID

### `chrome.notifications.clear _(action: `chrome_notifications_clear`)_`

Clear a notification.

**Parameters**

- `id` (`string`, required): Notification ID to clear

**Returns** `boolean`: Whether notification was cleared

## `chrome.runtime` module

### `chrome.runtime.sendMessage _(action: `chrome_runtime_sendMessage`)_`

Send a message to the extension background script or another extension.

**Parameters**

- `message` (`any`, required): Message payload
- `options` (`table | nil`, optional): Options: to, includeTlsChannelId

**Returns** `any`: Response from the recipient

## `chrome.scripting` module

### `chrome.scripting.executeScript _(action: `chrome_scripting_executeScript`)_`

Inject JavaScript into a page.

**Parameters**

- `target` (`table`, required): tabId, frameIds, allFrames
- `func` (`string | table | nil`, optional): Function or script to inject

**Returns** `table`: Array of injection results

## `chrome.sidePanel` module

### `chrome.sidePanel.setOptions _(action: `chrome_sidePanel_setOptions`)_`

Configure the side panel behavior.

**Parameters**

- `options` (`table`, required): enabled, path

**Returns** `boolean`: Whether options were set

## `chrome.tabs` module

### `chrome.tabs.query _(action: `chrome_tabs_query`)_`

Query Chrome tabs matching given criteria.

**Parameters**

- `query_info` (`table`, required): Query filter: active, currentWindow, url, etc.

**Returns** `table`: Array of matching tab objects

### `chrome.tabs.create _(action: `chrome_tabs_create`)_`

Create a new Chrome tab.

**Parameters**

- `create_properties` (`table`, optional): URL, windowId, active, etc.

**Returns** `table`: Created tab object

### `chrome.tabs.update _(action: `chrome_tabs_update`)_`

Update properties of a tab.

**Parameters**

- `tab_id` (`number | nil`, optional): Tab ID (nil for active tab)
- `update_properties` (`table`, required): Properties: url, active, muted, etc.

**Returns** `table`: Updated tab object

### `chrome.tabs.remove _(action: `chrome_tabs_remove`)_`

Close one or more tabs.

**Parameters**

- `tab_ids` (`number | table`, required): Tab ID or array of tab IDs

**Returns** `boolean`: Whether removal succeeded

### `chrome.tabs.get _(action: `chrome_tabs_get`)_`

Get a tab by ID.

**Parameters**

- `tab_id` (`number`, required): Tab ID

**Returns** `table`: Tab object

### `chrome.tabs.reload _(action: `chrome_tabs_reload`)_`

Reload a tab.

**Parameters**

- `tab_id` (`number | nil`, optional): Tab ID (nil for active tab)
- `reload_properties` (`table | nil`, optional): bypassCache

**Returns** `boolean`: Whether reload succeeded

### `chrome.tabs.sendMessage _(action: `chrome_tabs_sendMessage`)_`

Send a message to a specific tab.

**Parameters**

- `tab_id` (`number`, required): Target tab ID
- `message` (`any`, required): Message payload
- `options` (`table | nil`, optional): Options: frameId

**Returns** `any`: Response from the tab

## `chrome.windows` module

### `chrome.windows.getAll _(action: `chrome_windows_getAll`)_`

Get all browser windows.

**Parameters**

- `get_info` (`table | nil`, optional): populate, windowTypes

**Returns** `table`: Array of window objects

### `chrome.windows.create _(action: `chrome_windows_create`)_`

Create a new browser window.

**Parameters**

- `create_data` (`table | nil`, optional): url, type, focused, etc.

**Returns** `table`: Created window object

### `chrome.windows.update _(action: `chrome_windows_update`)_`

Update a browser window.

**Parameters**

- `window_id` (`number`, required): Window ID
- `update_info` (`table`, required): focused, state, etc.

**Returns** `table`: Updated window object

### `chrome.windows.remove _(action: `chrome_windows_remove`)_`

Close a browser window.

**Parameters**

- `window_id` (`number`, required): Window ID to close

**Returns** `boolean`: Whether close succeeded

## `dom` module

### `dom.snapshot _(action: `dom_snapshot`)_`

Take a semantic DOM snapshot of the current page.

**Parameters**

- `opts` (`table | nil`, optional): Options: max_depth, include_hidden, etc.

**Returns** `table`: Semantic DOM tree snapshot

### `dom.format _(action: `dom_format`)_`

Format a DOM snapshot into a text representation.

**Parameters**

- `snapshot` (`table`, required): DOM snapshot object
- `format` (`string | nil`, optional): Output format: compact-text, markdown, etc.

**Returns** `string`: Formatted text representation

## `global` module

### `global.sleep`

Pause execution (alias for web.sleep).

**Parameters**

- `ms` (`number`, optional): Milliseconds to sleep (default 1000)

**Returns** `nil`: None

## `host` module

### `host.call _(action: `host_call`)_`

Call a registered host handler by name.

**Parameters**

- `action` (`string`, required): Handler action name
- `params` (`table | nil`, optional): Parameters to pass to handler

**Returns** `any`: Handler response

## `page` module

### `page.snapshot _(action: `page_snapshot_text`)_`

Take a DOM snapshot and return readable text.

**Parameters**

- `opts` (`table | nil`, optional): Options: max_nodes, interactive_only, etc.

**Returns** `string`: Readable accessibility tree with refIds

### `page.snapshot_data _(action: `page_snapshot_data`)_`

Take a DOM snapshot and return structured data.

**Parameters**

- `opts` (`table | nil`, optional): Options: max_nodes, interactive_only, etc.

**Returns** `table`: Structured snapshot with nodes, url, title, viewport

### `page.click _(action: `page_click`)_`

Click an element by refId in the current page.

**Parameters**

- `ref_id` (`string`, required): Element refId from snapshot

**Returns** `nil`: None

### `page.dblclick _(action: `page_dblclick`)_`

Double-click an element by refId.

**Parameters**

- `ref_id` (`string`, required): Element refId from snapshot

**Returns** `nil`: None

### `page.fill _(action: `page_fill`)_`

Fill an input element by refId with a value.

**Parameters**

- `ref_id` (`string`, required): Element refId from snapshot
- `value` (`string`, required): Text to fill

**Returns** `nil`: None

### `page.type _(action: `page_type`)_`

Append text to an input element by refId.

**Parameters**

- `ref_id` (`string`, required): Element refId from snapshot
- `text` (`string`, required): Text to append

**Returns** `nil`: None

### `page.press _(action: `page_press`)_`

Press a keyboard key.

**Parameters**

- `key` (`string`, required): Key name: Enter, Escape, ArrowDown, etc.

**Returns** `nil`: None

### `page.select _(action: `page_select`)_`

Select an option in a dropdown by refId and value.

**Parameters**

- `ref_id` (`string`, required): Element refId from snapshot
- `value` (`string`, required): Option value to select

**Returns** `nil`: None

### `page.check _(action: `page_check`)_`

Check or uncheck a checkbox by refId.

**Parameters**

- `ref_id` (`string`, required): Element refId from snapshot
- `checked` (`boolean`, optional): Checked state (default true)

**Returns** `nil`: None

### `page.hover _(action: `page_hover`)_`

Hover over an element by refId.

**Parameters**

- `ref_id` (`string`, required): Element refId from snapshot

**Returns** `nil`: None

### `page.unhover _(action: `page_unhover`)_`

Move mouse away from any hovered element.

**Returns** `nil`: None

### `page.scroll _(action: `page_scroll`)_`

Scroll the page by direction and amount.

**Parameters**

- `direction` (`string`, optional): up, down, left, right (default down)
- `amount` (`number`, optional): Pixels to scroll (default 300)

**Returns** `nil`: None

### `page.scroll_to _(action: `page_scroll_to`)_`

Scroll to an element by refId.

**Parameters**

- `ref_id` (`string`, required): Element refId from snapshot

**Returns** `nil`: None

### `page.url _(action: `page_url`)_`

Get the current page URL.

**Returns** `string`: Current URL

### `page.title _(action: `page_title`)_`

Get the current page title.

**Returns** `string`: Current page title

### `page.screenshot _(action: `page_screenshot`)_`

Take a screenshot of the current page.

**Returns** `string`: Base64-encoded screenshot image

### `page.goto _(action: `page_goto`)_`

Navigate to a URL.

**Parameters**

- `url` (`string`, required): URL to navigate to

**Returns** `nil`: None

### `page.back _(action: `page_back`)_`

Navigate back in history.

**Returns** `nil`: None

### `page.forward _(action: `page_forward`)_`

Navigate forward in history.

**Returns** `nil`: None

### `page.reload _(action: `page_reload`)_`

Reload the current page.

**Returns** `nil`: None

### `page.wait _(action: `page_wait`)_`

Wait for a duration.

**Parameters**

- `ms` (`number`, optional): Milliseconds to wait (default 1000)

**Returns** `nil`: None

### `page.tabs _(action: `page_tabs`)_`

Get all tabs in the current window (extension mode).

**Returns** `table`: Array of tab objects

### `page.switch _(action: `page_switch`)_`

Switch to a tab by ID.

**Parameters**

- `tab_id` (`number`, required): Tab ID to switch to

**Returns** `nil`: None

### `page.new_tab _(action: `page_new_tab`)_`

Open a new tab (optionally with a URL).

**Parameters**

- `url` (`string | nil`, optional): URL to open in the new tab

**Returns** `table`: Created tab object

### `page.close _(action: `page_close`)_`

Close a tab by ID.

**Parameters**

- `tab_id` (`number`, required): Tab ID to close

**Returns** `boolean`: Whether close succeeded

### `page.active_tab _(action: `page_active_tab`)_`

Get the currently active tab ID.

**Returns** `number | nil`: Active tab ID or nil

### `page.fetch`

Fetch a URL (alias for web.fetch).

**Parameters**

- `url` (`string`, required): URL to fetch
- `opts` (`table | nil`, optional): Options: method, body, headers, timeout

**Returns** `table`: { status, ok, body, headers }

## `runtime` module

### `runtime.inspect _(action: `runtime_inspect`)_`

Inspect all global variables in the Lua state.

**Returns** `table`: Array of global variable descriptors: name, type, keys, value

## `web` module

### `web.mock_async _(action: `mock_async`)_`

Yield for testing, resumes with provided value.

**Parameters**

- `label` (`string | nil`, optional): Test label

**Returns** `string`: Test label echoed back

### `web.fetch _(action: `fetch`)_`

Perform an HTTP fetch request.

**Parameters**

- `url` (`string`, required): URL to fetch
- `opts` (`table | nil`, optional): Options: method, body, headers, timeout

**Returns** `table`: { status, ok, body, headers }

### `web.log _(action: `web_log`)_`

Log a message to the browser console.

**Parameters**

- `message` (`any`, required): Value to log

**Returns** `nil`: None

### `web.sleep _(action: `sleep`)_`

Pause execution for a duration.

**Parameters**

- `ms` (`number`, optional): Milliseconds to sleep (default 1000)

**Returns** `nil`: None

## `web.bookmarks` module

### `web.bookmarks.search _(action: `bookmarks_search`)_`

Search bookmarks.

**Parameters**

- `query` (`string | table`, required): Search string or query object

**Returns** `table`: Array of bookmark nodes

### `web.bookmarks.create _(action: `bookmarks_create`)_`

Create a bookmark or folder.

**Parameters**

- `bookmark` (`table`, required): Bookmark properties: parentId, title, url

**Returns** `table`: Created bookmark node

### `web.bookmarks.delete _(action: `bookmarks_delete`)_`

Delete a bookmark.

**Parameters**

- `id` (`string`, required): Bookmark node ID to delete

**Returns** `boolean`: Whether deletion succeeded

## `web.clipboard` module

### `web.clipboard.read _(action: `clipboard_read`)_`

Read text from the system clipboard.

**Returns** `string | nil`: Clipboard text or nil

### `web.clipboard.write _(action: `clipboard_write`)_`

Write text to the system clipboard.

**Parameters**

- `text` (`string`, required): Text to write

**Returns** `boolean`: Whether write succeeded

## `web.cookies` module

### `web.cookies.get _(action: `cookies_get`)_`

Get a cookie by name and URL.

**Parameters**

- `details` (`table`, required): Cookie query: name, url, storeId

**Returns** `table | nil`: Cookie object or nil if not found

### `web.cookies.set _(action: `cookies_set`)_`

Set a cookie.

**Parameters**

- `details` (`table`, required): Cookie to set: name, value, url, etc.

**Returns** `table`: Set cookie object

### `web.cookies.delete _(action: `cookies_delete`)_`

Delete a cookie.

**Parameters**

- `details` (`table`, required): Cookie to delete: name, url

**Returns** `boolean`: Whether deletion succeeded

### `web.cookies.list _(action: `cookies_list`)_`

List cookies matching a filter.

**Parameters**

- `filter` (`table`, optional): Filter: url, name, domain, etc.

**Returns** `table`: Array of cookie objects

## `web.history` module

### `web.history.search _(action: `history_search`)_`

Search browser history.

**Parameters**

- `query` (`table`, required): Search query: text, startTime, endTime, maxResults

**Returns** `table`: Array of history items

### `web.history.delete _(action: `history_delete`)_`

Delete a URL from browser history.

**Parameters**

- `url` (`string`, required): URL to remove from history

**Returns** `boolean`: Whether deletion succeeded

## `web.notifications` module

### `web.notifications.create _(action: `notifications_create`)_`

Create a browser notification.

**Parameters**

- `id` (`string | nil`, optional): Notification ID (nil for auto-generated)
- `options` (`table`, required): Notification options: type, title, message, iconUrl

**Returns** `string`: Notification ID

### `web.notifications.clear _(action: `notifications_clear`)_`

Clear a browser notification.

**Parameters**

- `id` (`string`, required): Notification ID to clear

**Returns** `boolean`: Whether notification was cleared

## `web.storage` module

### `web.storage.get _(action: `storage_get`)_`

Get a value from web storage.

**Parameters**

- `key` (`string`, required): Storage key

**Returns** `string | nil`: Stored value or nil

### `web.storage.set _(action: `storage_set`)_`

Set a value in web storage.

**Parameters**

- `key` (`string`, required): Storage key
- `value` (`string`, required): Value to store

**Returns** `boolean`: Whether set succeeded

### `web.storage.delete _(action: `storage_delete`)_`

Remove a key from web storage.

**Parameters**

- `key` (`string`, required): Storage key to remove

**Returns** `boolean`: Whether deletion succeeded

### `web.storage.list _(action: `storage_list`)_`

List all keys in web storage.

**Returns** `table`: Array of key strings

## `web.tab` module

### `web.tab.query _(action: `tab_query`)_`

Query Chrome tabs matching given criteria.

**Parameters**

- `query_info` (`table`, optional): Query filter: active, currentWindow, url, etc.

**Returns** `table`: Array of matching tab objects

### `web.tab.create _(action: `tab_create`)_`

Create a new tab.

**Parameters**

- `create_properties` (`table`, optional): URL, windowId, active, etc.

**Returns** `table`: Created tab object

### `web.tab.activate _(action: `tab_activate`)_`

Activate (focus) a tab.

**Parameters**

- `tab_id` (`number`, required): Tab ID to activate

**Returns** `boolean`: Whether activation succeeded

### `web.tab.close _(action: `tab_close`)_`

Close a tab.

**Parameters**

- `tab_id` (`number`, required): Tab ID to close

**Returns** `boolean`: Whether close succeeded

### `web.tab.execute_script _(action: `tab_execute_script`)_`

Execute JavaScript in a target tab.

**Parameters**

- `tab_id` (`number`, required): Target tab ID
- `script` (`string | table`, required): Script code or injection details

**Returns** `table`: Injection results

### `web.tab.click _(action: `tab_click`)_`

Click an element by refId in the target tab.

**Parameters**

- `tab_id` (`number`, required): Target tab ID
- `ref_id` (`number`, required): Element refId from snapshot

**Returns** `boolean`: Whether the click succeeded

### `web.tab.fill _(action: `tab_fill`)_`

Fill an input element by refId in the target tab.

**Parameters**

- `tab_id` (`number`, required): Target tab ID
- `ref_id` (`number`, required): Element refId from snapshot
- `value` (`string`, required): Text to fill

**Returns** `boolean`: Whether fill succeeded

### `web.tab.snapshot _(action: `tab_snapshot`)_`

Take a DOM snapshot of the target tab and return readable text. Defaults to active tab.

**Parameters**

- `tab_id` (`number`, optional): Target tab ID (defaults to active tab)

**Returns** `string`: Human-readable accessibility tree with refIds

### `web.tab.snapshot_text _(action: `tab_snapshot_text`)_`

Take a DOM snapshot and return readable text (explicit alias). Defaults to active tab.

**Parameters**

- `tab_id` (`number`, optional): Target tab ID (defaults to active tab)

**Returns** `string`: Human-readable accessibility tree with refIds

### `web.tab.snapshot_data _(action: `tab_snapshot_data`)_`

Take a DOM snapshot and return structured data. Defaults to active tab.

**Parameters**

- `tab_id` (`number`, optional): Target tab ID (defaults to active tab)

**Returns** `table`: Structured snapshot with nodes, url, title, viewport

### `web.tab.scroll_to _(action: `tab_scroll_to`)_`

Scroll to an element by refId in the target tab.

**Parameters**

- `tab_id` (`number`, required): Target tab ID
- `ref_id` (`number`, required): Element refId from snapshot

**Returns** `boolean`: Whether scroll succeeded

### `web.tab.evaluate _(action: `tab_evaluate`)_`

Evaluate JavaScript in a target tab and return the result.

**Parameters**

- `tab_id` (`number`, required): Target tab ID
- `script` (`string`, required): JavaScript code to evaluate

**Returns** `any`: Evaluation result

### `web.tab.back _(action: `tab_back`)_`

Navigate back in a target tab.

**Parameters**

- `tab_id` (`number`, required): Target tab ID

**Returns** `boolean`: Whether navigation succeeded

### `web.tab.wait_for_load _(action: `tab_wait_for_load`)_`

Wait for a tab to finish loading.

**Parameters**

- `tab_id` (`number`, required): Target tab ID
- `timeout` (`number`, optional): Timeout in milliseconds (default 30000)

**Returns** `boolean`: Whether the tab loaded

### `web.tab.fetch _(action: `tab_fetch`)_`

Perform an HTTP fetch inside a target tab origin.

**Parameters**

- `tab_id` (`number`, required): Target tab ID
- `url` (`string`, required): URL to fetch
- `opts` (`table | nil`, optional): Options: method, body, headers, timeout

**Returns** `table`: { status, ok, body, headers }

## `web.url` module

### `web.url.parse _(action: `url_parse`)_`

Parse a URL string into components.

**Parameters**

- `url` (`string`, required): URL string to parse

**Returns** `table`: Parsed URL components: protocol, host, pathname, search, hash

### `web.url.encode _(action: `url_encode`)_`

Encode a table into a query string.

**Parameters**

- `params` (`table`, required): Key-value pairs to encode

**Returns** `string`: URL-encoded query string

