use crate::state::HostState;
use piccolo::{Context, Table};
use std::cell::RefCell;
use std::rc::Rc;

pub(crate) fn register<'a>(ctx: Context<'a>, host_state: Rc<RefCell<HostState>>) -> Table<'a> {
    let _notifications_table = Table::new(&ctx);

    // web.notifications sub-module
    let notifications_table = Table::new(&ctx);
    lua_api!(ctx, notifications_table,
    name: "create",
    action: "notifications_create",
    host_state: host_state,
    namespace: "web.notifications",
    doc: "Create a browser notification.",
    params: [
    id: "string | nil", optional, "Notification ID (nil for auto-generated)",
    options: "table", required, "Notification options: type, title, message, iconUrl",
    ],
    returns: "string" => "Notification ID",
    );
    lua_api!(ctx, notifications_table,
    name: "clear",
    action: "notifications_clear",
    host_state: host_state,
    namespace: "web.notifications",
    doc: "Clear a browser notification.",
    params: [
    id: "string", required, "Notification ID to clear",
    ],
    returns: "boolean" => "Whether notification was cleared",
    );

    notifications_table
}
