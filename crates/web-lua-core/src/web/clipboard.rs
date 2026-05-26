use crate::state::HostState;
use piccolo::{Context, Table};
use std::cell::RefCell;
use std::rc::Rc;

pub(crate) fn register<'a>(ctx: Context<'a>, host_state: Rc<RefCell<HostState>>) -> Table<'a> {
    let _clipboard_table = Table::new(&ctx);

    // web.clipboard sub-module
    let clipboard_table = Table::new(&ctx);
    lua_api!(ctx, clipboard_table,
    name: "read",
    action: "clipboard_read",
    host_state: host_state,
    namespace: "web.clipboard",
    doc: "Read text from the system clipboard.",
    params: [
    ],
    returns: "string | nil" => "Clipboard text or nil",
    );
    lua_api!(ctx, clipboard_table,
    name: "write",
    action: "clipboard_write",
    host_state: host_state,
    namespace: "web.clipboard",
    doc: "Write text to the system clipboard.",
    params: [
    text: "string", required, "Text to write",
    ],
    returns: "boolean" => "Whether write succeeded",
    );

    clipboard_table
}
