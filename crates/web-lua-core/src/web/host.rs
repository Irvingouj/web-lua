use crate::json::lua_value_to_json;
use crate::state::HostState;
use crate::types::AsyncCommand;
use piccolo::{Callback, CallbackReturn, Context, IntoValue, Table, Value};
use std::cell::RefCell;
use std::rc::Rc;

pub(crate) fn register<'a>(ctx: Context<'a>, host_state: Rc<RefCell<HostState>>) {
    let _host_table = Table::new(&ctx);

    // ── host.call(action, params) — generic async bridge for JS handlers ──
    let hs_host = host_state.clone();
    let host_table = Table::new(&ctx);

    let host_call_cb = Callback::from_fn(&ctx, move |ctx, _exec, mut stack| {
        let action = if !stack.is_empty() {
            match stack.get(0) {
                Value::String(s) => String::from_utf8_lossy(s.as_bytes()).to_string(),
                other => {
                    let msg = format!(
                        "host.call expects action name (string), got {}",
                        other.type_name()
                    );
                    return Err(msg.into_value(ctx).into());
                }
            }
        } else {
            return Err("host.call requires an action name".into_value(ctx).into());
        };

        let params = if stack.len() > 1 {
            lua_value_to_json(ctx, stack.get(1)).unwrap_or(serde_json::Value::Null)
        } else {
            serde_json::json!({})
        };

        let mut hs = hs_host.borrow_mut();
        hs.async_call_counter += 1;
        let call_id = hs.async_call_counter;
        let command = AsyncCommand {
            call_id,
            action: crate::action::Action::Host(action),
            params,
        };
        hs.pending_async_command = Some(command);

        stack.clear();
        Ok(CallbackReturn::Yield {
            to_thread: None,
            then: None,
        })
    });

    lua_api_custom!(ctx, host_table, name: "call", callback: host_call_cb,

        namespace: "host",

        action: "host_call",

        doc: "Call a registered host handler by name.",

        params: [

        action: "string", required, "Handler action name",

        params: "table | nil", optional, "Parameters to pass to handler",

        ],

        returns: "any" => "Handler response",

    );
    set_protected_global!(ctx, "host", host_table, "host");
}
