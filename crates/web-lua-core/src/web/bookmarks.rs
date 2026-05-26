use crate::state::HostState;
use piccolo::{Context, Table};
use std::cell::RefCell;
use std::rc::Rc;

pub(crate) fn register<'a>(ctx: Context<'a>, host_state: Rc<RefCell<HostState>>) -> Table<'a> {
    let _bookmarks_table = Table::new(&ctx);

    // web.bookmarks sub-module
    let bookmarks_table = Table::new(&ctx);
    lua_api!(ctx, bookmarks_table,
    name: "search",
    action: "bookmarks_search",
    host_state: host_state,
    namespace: "web.bookmarks",
    doc: "Search bookmarks.",
    params: [
    query: "string | table", required, "Search string or query object",
    ],
    returns: "table" => "Array of bookmark nodes",
    );
    lua_api!(ctx, bookmarks_table,
    name: "create",
    action: "bookmarks_create",
    host_state: host_state,
    namespace: "web.bookmarks",
    doc: "Create a bookmark or folder.",
    params: [
    bookmark: "table", required, "Bookmark properties: parentId, title, url",
    ],
    returns: "table" => "Created bookmark node",
    );
    lua_api!(ctx, bookmarks_table,
    name: "delete",
    action: "bookmarks_delete",
    host_state: host_state,
    namespace: "web.bookmarks",
    doc: "Delete a bookmark.",
    params: [
    id: "string", required, "Bookmark node ID to delete",
    ],
    returns: "boolean" => "Whether deletion succeeded",
    );

    bookmarks_table
}
