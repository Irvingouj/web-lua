use crate::state::HostState;
use crate::types::AsyncCommand;
use crate::utils::format_value;
use piccolo::{Callback, CallbackReturn, Context, IntoValue, Table, Value};
use std::cell::RefCell;
use std::rc::Rc;

pub(crate) fn register<'a>(ctx: Context<'a>, host_state: Rc<RefCell<HostState>>) -> Table<'a> {
    let _storage_table = Table::new(&ctx);

    // ── web.storage sub-module ──
    let storage_table = Table::new(&ctx);

    // Helper: create a storage async callback
    let make_storage_cb = |action: &'static str,
                           hs_storage: Rc<RefCell<HostState>>|
     -> Callback<'_> {
        Callback::from_fn(&ctx, move |ctx, _exec, mut stack| {
            let params = match action {
                "storage_get" => {
                    let key = if !stack.is_empty() {
                        match stack.get(0) {
                            Value::String(s) => String::from_utf8_lossy(s.as_bytes()).to_string(),
                            other => format_value(ctx, other),
                        }
                    } else {
                        let msg = "web.storage.get requires a key argument".to_string();
                        return Err(msg.into_value(ctx).into());
                    };
                    serde_json::json!({ "key": key })
                }
                "storage_set" => {
                    let key = if !stack.is_empty() {
                        match stack.get(0) {
                            Value::String(s) => String::from_utf8_lossy(s.as_bytes()).to_string(),
                            other => format_value(ctx, other),
                        }
                    } else {
                        let msg = "web.storage.set requires key and value arguments".to_string();
                        return Err(msg.into_value(ctx).into());
                    };
                    let value = if stack.len() > 1 {
                        match stack.get(1) {
                            Value::String(s) => String::from_utf8_lossy(s.as_bytes()).to_string(),
                            Value::Integer(i) => i.to_string(),
                            Value::Number(f) => format!("{}", f),
                            Value::Boolean(b) => (if b { "true" } else { "false" }).to_string(),
                            other => format_value(ctx, other),
                        }
                    } else {
                        let msg = "web.storage.set requires a value argument".to_string();
                        return Err(msg.into_value(ctx).into());
                    };
                    serde_json::json!({ "key": key, "value": value })
                }
                "storage_delete" => {
                    let key = if !stack.is_empty() {
                        match stack.get(0) {
                            Value::String(s) => String::from_utf8_lossy(s.as_bytes()).to_string(),
                            other => format_value(ctx, other),
                        }
                    } else {
                        let msg = "web.storage.delete requires a key argument".to_string();
                        return Err(msg.into_value(ctx).into());
                    };
                    serde_json::json!({ "key": key })
                }
                "storage_list" => {
                    serde_json::json!({})
                }
                _ => {
                    serde_json::json!({})
                }
            };

            // Defensive validation of params against typed structs
            match action {
                "storage_get" => {
                    let _validated: crate::command_params::StorageGetParams =
                        match serde_json::from_value(params.clone()) {
                            Ok(v) => v,
                            Err(e) => {
                                let msg =
                                    format!("Invalid storage_get params built from Lua: {}", e);
                                return Err(msg.into_value(ctx).into());
                            }
                        };
                }
                "storage_set" => {
                    let _validated: crate::command_params::StorageSetParams =
                        match serde_json::from_value(params.clone()) {
                            Ok(v) => v,
                            Err(e) => {
                                let msg =
                                    format!("Invalid storage_set params built from Lua: {}", e);
                                return Err(msg.into_value(ctx).into());
                            }
                        };
                }
                "storage_delete" => {
                    let _validated: crate::command_params::StorageDeleteParams =
                        match serde_json::from_value(params.clone()) {
                            Ok(v) => v,
                            Err(e) => {
                                let msg =
                                    format!("Invalid storage_delete params built from Lua: {}", e);
                                return Err(msg.into_value(ctx).into());
                            }
                        };
                }
                _ => {}
            }

            let mut hs = hs_storage.borrow_mut();
            hs.async_call_counter += 1;
            let call_id = hs.async_call_counter;
            let command = AsyncCommand {
                call_id,
                action: crate::action::Action::from(action),
                params,
            };
            hs.pending_async_command = Some(command);

            stack.clear();
            Ok(CallbackReturn::Yield {
                to_thread: None,
                then: None,
            })
        })
    };

    let storage_get_cb = make_storage_cb("storage_get", host_state.clone());
    storage_table.set_field(ctx, "get", storage_get_cb);
    crate::lua_api_doc!(
    namespace: "web.storage",
    name: "get",
    action: "storage_get",
    doc: "Get a value from web storage.",
    params: [
    key: "string", required, "Storage key",
    ],
    returns: "string | nil" => "Stored value or nil",
    );

    let storage_set_cb = make_storage_cb("storage_set", host_state.clone());
    storage_table.set_field(ctx, "set", storage_set_cb);
    crate::lua_api_doc!(
    namespace: "web.storage",
    name: "set",
    action: "storage_set",
    doc: "Set a value in web storage.",
    params: [
    key: "string", required, "Storage key",
    value: "string", required, "Value to store",
    ],
    returns: "boolean" => "Whether set succeeded",
    );

    let storage_delete_cb = make_storage_cb("storage_delete", host_state.clone());
    storage_table.set_field(ctx, "delete", storage_delete_cb);
    crate::lua_api_doc!(
    namespace: "web.storage",
    name: "delete",
    action: "storage_delete",
    doc: "Remove a key from web storage.",
    params: [
    key: "string", required, "Storage key to remove",
    ],
    returns: "boolean" => "Whether deletion succeeded",
    );

    let storage_list_cb = make_storage_cb("storage_list", host_state.clone());
    storage_table.set_field(ctx, "list", storage_list_cb);
    crate::lua_api_doc!(
    namespace: "web.storage",
    name: "list",
    action: "storage_list",
    doc: "List all keys in web storage.",
    params: [
    ],
    returns: "table" => "Array of key strings",
    );

    storage_table
}
