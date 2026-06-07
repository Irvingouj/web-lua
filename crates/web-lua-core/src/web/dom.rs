use crate::json::lua_value_to_json;
use crate::state::HostState;
use crate::types::AsyncCommand;
use piccolo::{Callback, CallbackReturn, Context, IntoValue, Table, Value};
use std::cell::RefCell;
use std::rc::Rc;

pub(crate) fn register<'a>(ctx: Context<'a>, host_state: Rc<RefCell<HostState>>) {
    let _dom_table = Table::new(&ctx);

    // ── dom module (DOM semantic tree snapshot via dom-semantic-tree) ──
    let dom_table = Table::new(&ctx);

    // dom.snapshot(opts?) — async, yields to main thread for DOM traversal
    {
        let hs_dom = host_state.clone();
        let dom_snapshot_cb = Callback::from_fn(&ctx, move |ctx, _exec, mut stack| {
            let params = if stack.is_empty() {
                serde_json::json!({})
            } else {
                lua_value_to_json(ctx, stack.get(0)).unwrap_or(serde_json::Value::Null)
            };

            let _validated: crate::command_params::DomSnapshotParams =
                match serde_json::from_value(params.clone()) {
                    Ok(v) => v,
                    Err(e) => {
                        let msg = crate::utils::format_param_error("dom", "snapshot", &e);
                        return Err(msg.into_value(ctx).into());
                    }
                };

            let mut hs = hs_dom.borrow_mut();
            hs.async_call_counter += 1;
            let call_id = hs.async_call_counter;
            let command = AsyncCommand {
                call_id,
                action: "dom_snapshot".to_string(),
                params,
            };
            hs.pending_async_command = Some(command);

            stack.clear();
            Ok(CallbackReturn::Yield {
                to_thread: None,
                then: None,
            })
        });
        lua_api_custom!(ctx, dom_table, name: "snapshot", callback: dom_snapshot_cb,
            namespace: "dom",
            action: "dom_snapshot",
            doc: "Take a semantic DOM snapshot of the current page.",
            params: [
            opts: "table | nil", optional, "Options: max_depth, include_hidden, etc.",
            ],
            returns: "table" => "Semantic DOM tree snapshot",
        );
    }

    // dom.format(snapshot, format?) — async, relays to main thread for formatting
    {
        let hs_dom = host_state.clone();
        let dom_format_cb = Callback::from_fn(&ctx, move |ctx, _exec, mut stack| {
            if stack.is_empty() {
                let msg = "dom.format requires a snapshot argument".to_string();
                return Err(msg.into_value(ctx).into());
            }

            let snapshot = lua_value_to_json(ctx, stack.get(0)).unwrap_or(serde_json::Value::Null);
            let format = if stack.len() >= 2 {
                match stack.get(1) {
                    Value::String(s) => String::from_utf8_lossy(s.as_bytes()).to_string(),
                    _ => "compact-text".to_string(),
                }
            } else {
                "compact-text".to_string()
            };

            let params = serde_json::json!({
                "snapshot": snapshot,
                "format": format,
            });
            let _validated: crate::command_params::DomFormatParams =
                match serde_json::from_value(params.clone()) {
                    Ok(v) => v,
                    Err(e) => {
                        let msg = crate::utils::format_param_error("dom", "format", &e);
                        return Err(msg.into_value(ctx).into());
                    }
                };

            let mut hs = hs_dom.borrow_mut();
            hs.async_call_counter += 1;
            let call_id = hs.async_call_counter;
            let command = AsyncCommand {
                call_id,
                action: "dom_format".to_string(),
                params,
            };
            hs.pending_async_command = Some(command);

            stack.clear();
            Ok(CallbackReturn::Yield {
                to_thread: None,
                then: None,
            })
        });
        lua_api_custom!(ctx, dom_table, name: "format", callback: dom_format_cb,
            namespace: "dom",
            action: "dom_format",
            doc: "Format a DOM snapshot into a text representation.",
            params: [
            snapshot: "table", required, "DOM snapshot object",
            format: "string | nil", optional, "Output format: compact-text, markdown, etc.",
            ],
            returns: "string" => "Formatted text representation",
        );
    }

    set_protected_global!(ctx, "dom", dom_table, "dom");
}
