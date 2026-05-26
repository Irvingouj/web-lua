use crate::state::HostState;
use crate::utils::format_value;
use piccolo::{Callback, CallbackReturn, Context, Table};
use std::cell::RefCell;
use std::rc::Rc;

pub(crate) fn register<'a>(
    ctx: Context<'a>,
    web_table: &Table<'a>,
    host_state: Rc<RefCell<HostState>>,
) {
    // ── web.log(...) — sync, writes to stderr ──
    let hs_log = host_state.clone();
    let web_log_cb = Callback::from_fn(&ctx, move |ctx, _exec, mut stack| {
        let parts: Vec<String> = (0..stack.len())
            .map(|i| format_value(ctx, stack.get(i)))
            .collect();
        let msg = parts.join("\t");
        // Store as a command so the worker can forward to console.log
        // Also push to stderr for visibility
        let mut hs = hs_log.borrow_mut();
        hs.commands.push(serde_json::json!({
            "action": "log",
            "message": msg,
        }));
        drop(hs);

        stack.clear();
        Ok(CallbackReturn::Return)
    });

    web_table.set_field(ctx, "log", web_log_cb);
    crate::lua_api_doc!(
    namespace: "web",
    name: "log",
    action: "web_log",
    doc: "Log a message to the browser console.",
    params: [
    message: "any", required, "Value to log",
    ],
    returns: "nil" => "None",
    );
}
