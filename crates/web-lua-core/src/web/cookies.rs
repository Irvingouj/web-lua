use crate::state::HostState;
use piccolo::{Context, Table};
use std::cell::RefCell;
use std::rc::Rc;

pub(crate) fn register<'a>(ctx: Context<'a>, host_state: Rc<RefCell<HostState>>) -> Table<'a> {
    let _cookies_table = Table::new(&ctx);

    // web.cookies sub-module
    let cookies_table = Table::new(&ctx);
    lua_api!(ctx, cookies_table,
    name: "get",
    action: "cookies_get",
    host_state: host_state,
    namespace: "web.cookies",
    doc: "Get a cookie by name and URL.",
    params: [
    details: "table", required, "Cookie query: name, url, storeId",
    ],
    returns: "table | nil" => "Cookie object or nil if not found",
    );
    lua_api!(ctx, cookies_table,
    name: "set",
    action: "cookies_set",
    host_state: host_state,
    namespace: "web.cookies",
    doc: "Set a cookie.",
    params: [
    details: "table", required, "Cookie to set: name, value, url, etc.",
    ],
    returns: "table" => "Set cookie object",
    );
    lua_api!(ctx, cookies_table,
    name: "delete",
    action: "cookies_delete",
    host_state: host_state,
    namespace: "web.cookies",
    doc: "Delete a cookie.",
    params: [
    details: "table", required, "Cookie to delete: name, url",
    ],
    returns: "boolean" => "Whether deletion succeeded",
    );
    lua_api!(ctx, cookies_table,
    name: "list",
    action: "cookies_list",
    host_state: host_state,
    namespace: "web.cookies",
    doc: "List cookies matching a filter.",
    params: [
    filter: "table", optional, "Filter: url, name, domain, etc.",
    ],
    returns: "table" => "Array of cookie objects",
    );

    cookies_table
}
