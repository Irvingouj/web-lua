use crate::state::HostState;
use piccolo::{Context, Table};
use std::cell::RefCell;
use std::rc::Rc;

pub(crate) fn register<'a>(ctx: Context<'a>, host_state: Rc<RefCell<HostState>>) -> Table<'a> {
    let _history_table = Table::new(&ctx);

    // web.history sub-module
    let history_table = Table::new(&ctx);
    lua_api!(ctx, history_table,
    name: "search",
    action: "history_search",
    host_state: host_state,
    namespace: "web.history",
    doc: "Search browser history.",
    params: [
    query: "table", required, "Search query: text, startTime, endTime, maxResults",
    ],
    returns: "table" => "Array of history items",
    );
    lua_api!(ctx, history_table,
    name: "delete",
    action: "history_delete",
    host_state: host_state,
    namespace: "web.history",
    doc: "Delete a URL from browser history.",
    params: [
    url: "string", required, "URL to remove from history",
    ],
    returns: "boolean" => "Whether deletion succeeded",
    );

    history_table
}
