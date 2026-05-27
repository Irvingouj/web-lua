use crate::state::HostState;
use piccolo::{Context, Table};
use std::cell::RefCell;
use std::rc::Rc;

pub(crate) fn register<'a>(ctx: Context<'a>, host_state: Rc<RefCell<HostState>>) -> Table<'a> {
    let _tab_table = Table::new(&ctx);

    let tab_table = Table::new(&ctx);
    lua_api!(ctx, tab_table,
    name: "query",
    action: "tab_query",
    host_state: host_state,
    namespace: "web.tab",
    doc: "Query Chrome tabs matching given criteria.",
    params: [
    query_info: "table", optional, "Query filter: active, currentWindow, url, etc.",
    ],
    returns: "table" => "Array of matching tab objects",
    );
    lua_api!(ctx, tab_table,
    name: "create",
    action: "tab_create",
    host_state: host_state,
    namespace: "web.tab",
    doc: "Create a new tab.",
    params: [
    create_properties: "table", optional, "URL, windowId, active, etc.",
    ],
    returns: "table" => "Created tab object",
    );
    lua_api!(ctx, tab_table,
    name: "activate",
    action: "tab_activate",
    host_state: host_state,
    namespace: "web.tab",
    doc: "Activate (focus) a tab.",
    params: [
    tab_id: "number", required, "Tab ID to activate",
    ],
    returns: "boolean" => "Whether activation succeeded",
    );
    lua_api!(ctx, tab_table,
    name: "close",
    action: "tab_close",
    host_state: host_state,
    namespace: "web.tab",
    doc: "Close a tab.",
    params: [
    tab_id: "number", required, "Tab ID to close",
    ],
    returns: "boolean" => "Whether close succeeded",
    );
    lua_api!(ctx, tab_table,
    name: "execute_script",
    action: "tab_execute_script",
    host_state: host_state,
    namespace: "web.tab",
    doc: "Execute JavaScript in a target tab.",
    params: [
    tab_id: "number", required, "Target tab ID",
    script: "string | table", required, "Script code or injection details",
    ],
    returns: "table" => "Injection results",
    );
    lua_api!(ctx, tab_table,
        name: "click",
        action: "tab_click",
        host_state: host_state,
        namespace: "web.tab",
        doc: "Click an element by refId in the target tab.",
        params: [
            tab_id: "number", required, "Target tab ID",
            ref_id: "number", required, "Element refId from snapshot",
        ],
        returns: "boolean" => "Whether the click succeeded",
    );
    lua_api!(ctx, tab_table,
    name: "fill",
    action: "tab_fill",
    host_state: host_state,
    namespace: "web.tab",
    doc: "Fill an input element by refId in the target tab.",
    params: [
    tab_id: "number", required, "Target tab ID",
    ref_id: "number", required, "Element refId from snapshot",
    value: "string", required, "Text to fill",
    ],
    returns: "boolean" => "Whether fill succeeded",
    );
    lua_api!(ctx, tab_table,
        name: "snapshot",
        action: "tab_snapshot",
        host_state: host_state,
        namespace: "web.tab",
        doc: "Take a DOM snapshot of the target tab and return readable text. Defaults to active tab.",
        params: [
            tab_id: "number", optional, "Target tab ID (defaults to active tab)",
        ],
        returns: "string" => "Human-readable accessibility tree with refIds",
    );
    lua_api!(ctx, tab_table,
        name: "snapshot_text",
        action: "tab_snapshot_text",
        host_state: host_state,
        namespace: "web.tab",
        doc: "Take a DOM snapshot and return readable text (explicit alias). Defaults to active tab.",
        params: [
            tab_id: "number", optional, "Target tab ID (defaults to active tab)",
        ],
        returns: "string" => "Human-readable accessibility tree with refIds",
    );
    lua_api!(ctx, tab_table,
        name: "snapshot_data",
        action: "tab_snapshot_data",
        host_state: host_state,
        namespace: "web.tab",
        doc: "Take a DOM snapshot and return structured data. Defaults to active tab.",
        params: [
            tab_id: "number", optional, "Target tab ID (defaults to active tab)",
        ],
        returns: "table" => "Structured snapshot with nodes, url, title, viewport",
    );
    lua_api!(ctx, tab_table,
    name: "scroll_to",
    action: "tab_scroll_to",
    host_state: host_state,
    namespace: "web.tab",
    doc: "Scroll to an element by refId in the target tab.",
    params: [
    tab_id: "number", required, "Target tab ID",
    ref_id: "number", required, "Element refId from snapshot",
    ],
    returns: "boolean" => "Whether scroll succeeded",
    );
    lua_api!(ctx, tab_table,
    name: "evaluate",
    action: "tab_evaluate",
    host_state: host_state,
    namespace: "web.tab",
    doc: "Evaluate JavaScript in a target tab and return the result.",
    params: [
    tab_id: "number", required, "Target tab ID",
    script: "string", required, "JavaScript code to evaluate",
    ],
    returns: "any" => "Evaluation result",
    );
    lua_api!(ctx, tab_table,
    name: "back",
    action: "tab_back",
    host_state: host_state,
    namespace: "web.tab",
    doc: "Navigate back in a target tab.",
    params: [
    tab_id: "number", required, "Target tab ID",
    ],
    returns: "boolean" => "Whether navigation succeeded",
    );
    lua_api!(ctx, tab_table,
    name: "wait_for_load",
    action: "tab_wait_for_load",
    host_state: host_state,
    namespace: "web.tab",
    doc: "Wait for a tab to finish loading.",
    params: [
    tab_id: "number", required, "Target tab ID",
    timeout: "number", optional, "Timeout in milliseconds (default 30000)",
    ],
    returns: "boolean" => "Whether the tab loaded",
    );
    lua_api!(ctx, tab_table,
        name: "type",
        action: "tab_type",
        host_state: host_state,
        namespace: "web.tab",
        doc: "Type text into an input element by refId in the target tab (appends).",
        params: [
            tab_id: "number", required, "Target tab ID",
            ref_id: "number", required, "Element refId from snapshot",
            text: "string", required, "Text to type",
        ],
        returns: "boolean" => "Whether type succeeded",
    );
    lua_api!(ctx, tab_table,
        name: "press",
        action: "tab_press",
        host_state: host_state,
        namespace: "web.tab",
        doc: "Dispatch a keyboard key press in the target tab.",
        params: [
            tab_id: "number", required, "Target tab ID",
            key: "string", required, "Key to press (e.g. 'Enter', 'Escape')",
        ],
        returns: "boolean" => "Whether press succeeded",
    );
    lua_api!(ctx, tab_table,
        name: "select",
        action: "tab_select",
        host_state: host_state,
        namespace: "web.tab",
        doc: "Select an option in a dropdown by refId in the target tab.",
        params: [
            tab_id: "number", required, "Target tab ID",
            ref_id: "number", required, "Element refId from snapshot",
            value: "string", required, "Option value to select",
        ],
        returns: "boolean" => "Whether select succeeded",
    );
    lua_api!(ctx, tab_table,
        name: "check",
        action: "tab_check",
        host_state: host_state,
        namespace: "web.tab",
        doc: "Toggle a checkbox by refId in the target tab.",
        params: [
            tab_id: "number", required, "Target tab ID",
            ref_id: "number", required, "Element refId from snapshot",
            checked: "boolean", optional, "Desired checked state (default true)",
        ],
        returns: "boolean" => "Whether check succeeded",
    );
    lua_api!(ctx, tab_table,
        name: "hover",
        action: "tab_hover",
        host_state: host_state,
        namespace: "web.tab",
        doc: "Hover over an element by refId in the target tab.",
        params: [
            tab_id: "number", required, "Target tab ID",
            ref_id: "number", required, "Element refId from snapshot",
        ],
        returns: "boolean" => "Whether hover succeeded",
    );
    lua_api!(ctx, tab_table,
        name: "unhover",
        action: "tab_unhover",
        host_state: host_state,
        namespace: "web.tab",
        doc: "Unhover (mouseleave) an element by refId in the target tab.",
        params: [
            tab_id: "number", required, "Target tab ID",
        ],
        returns: "boolean" => "Whether unhover succeeded",
    );
    lua_api!(ctx, tab_table,
        name: "scroll",
        action: "tab_scroll",
        host_state: host_state,
        namespace: "web.tab",
        doc: "Scroll the target tab page.",
        params: [
            tab_id: "number", required, "Target tab ID",
            direction: "string", optional, "Scroll direction: up or down (default down)",
            amount: "number", optional, "Scroll amount in pixels (default 300)",
        ],
        returns: "boolean" => "Whether scroll succeeded",
    );
    lua_api!(ctx, tab_table,
        name: "dblclick",
        action: "tab_dblclick",
        host_state: host_state,
        namespace: "web.tab",
        doc: "Double-click an element by refId in the target tab.",
        params: [
            tab_id: "number", required, "Target tab ID",
            ref_id: "number", required, "Element refId from snapshot",
        ],
        returns: "boolean" => "Whether dblclick succeeded",
    );
    lua_api!(ctx, tab_table,
    name: "fetch",
    action: "tab_fetch",
    host_state: host_state,
    namespace: "web.tab",
    doc: "Perform an HTTP fetch inside a target tab origin.",
    params: [
    tab_id: "number", required, "Target tab ID",
    url: "string", required, "URL to fetch",
    opts: "table | nil", optional, "Options: method, body, headers, timeout",
    ],
    returns: "table" => "{ status, ok, body, headers }",
    );

    tab_table
}
