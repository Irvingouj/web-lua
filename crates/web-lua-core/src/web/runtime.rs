use crate::json::json_value_to_lua;
use crate::state::HostState;
use piccolo::{Callback, CallbackReturn, Context, String as LuaString, Table, Value};
use std::cell::RefCell;
use std::rc::Rc;

pub(crate) fn register<'a>(ctx: Context<'a>, _host_state: Rc<RefCell<HostState>>) {
    let _runtime_table = Table::new(&ctx);

    // ── runtime.inspect() — returns a table of all globals with type/value/keys ──
    let runtime_table = Table::new(&ctx);

    let inspect_cb = Callback::from_fn(&ctx, move |ctx, _exec, mut stack| {
        let globals = ctx.globals();
        let result_table = Table::new(&ctx);
        let mut idx = 1;

        let mut entries: Vec<(String, Value)> = Vec::new();
        for entry in globals.iter() {
            let (k, v) = entry;
            if let Value::String(s) = k {
                let name = String::from_utf8_lossy(s.as_bytes()).to_string();
                entries.push((name, v));
            }
        }

        for (name, val) in entries {
            let type_name = match val {
                Value::Nil => "nil",
                Value::Boolean(_) => "boolean",
                Value::Integer(_) | Value::Number(_) => "number",
                Value::String(_) => "string",
                Value::Table(_) => "table",
                Value::Function(_) => "function",
                Value::Thread(_) => "thread",
                _ => "unknown",
            };

            let entry_table = Table::new(&ctx);
            entry_table.set_field(ctx, "name", LuaString::from_slice(&ctx, name.as_bytes()));
            entry_table.set_field(
                ctx,
                "type",
                LuaString::from_slice(&ctx, type_name.as_bytes()),
            );

            // For primitives, include value
            if type_name == "table" {
                if let Value::Table(t) = val {
                    let keys_table = Table::new(&ctx);
                    for (ki, entry) in (1..).zip(t.iter()) {
                        let (k, _) = entry;
                        let key_str = match k {
                            Value::Integer(i) => i.to_string(),
                            Value::String(s) => String::from_utf8_lossy(s.as_bytes()).to_string(),
                            other => format!("{:?}", other),
                        };
                        keys_table
                            .set(ctx, ki, LuaString::from_slice(&ctx, key_str.as_bytes()))
                            .unwrap();
                    }
                    entry_table.set_field(ctx, "keys", keys_table);
                }
            } else if type_name != "function" && type_name != "nil" && type_name != "unknown" {
                let formatted = match val {
                    Value::Boolean(b) => b.to_string(),
                    Value::Integer(i) => i.to_string(),
                    Value::Number(f) => {
                        if f == f.floor() && f.is_finite() {
                            format!("{:.1}", f)
                        } else {
                            format!("{}", f)
                        }
                    }
                    Value::String(s) => {
                        let s = String::from_utf8_lossy(s.as_bytes()).to_string();
                        if s.len() > 200 {
                            format!("{}...", &s[..200])
                        } else {
                            s
                        }
                    }
                    _ => format!("{:?}", val),
                };
                entry_table.set_field(
                    ctx,
                    "value",
                    LuaString::from_slice(&ctx, formatted.as_bytes()),
                );
            }

            result_table.set(ctx, idx, entry_table).unwrap();
            idx += 1;
        }

        stack.clear();
        stack.push_back(result_table.into());
        Ok(CallbackReturn::Return)
    });

    lua_api_custom!(ctx, runtime_table, name: "inspect", callback: inspect_cb,

        namespace: "runtime",

        action: "runtime_inspect",

        doc: "Inspect all global variables in the Lua state.",

        params: [

        ],

        returns: "table" => "Array of global variable descriptors: name, type, keys, value",

    );

    let hs_docs = _host_state.clone();
    let docs_cb = Callback::from_fn(&ctx, move |ctx, _exec, mut stack| {
        let has_provider = hs_docs.borrow().has_js_doc_provider;
        if has_provider {
            let mut hs = hs_docs.borrow_mut();
            hs.async_call_counter += 1;
            let call_id = hs.async_call_counter;
            let command = crate::types::AsyncCommand {
                call_id,
                action: "__runtime_docs".to_string(),
                params: serde_json::json!({}),
            };
            hs.pending_async_command = Some(command);
            stack.clear();
            Ok(CallbackReturn::Yield {
                to_thread: None,
                then: None,
            })
        } else {
            let docs = crate::api_docs::all_as_json_value();
            stack.clear();
            stack.push_back(json_value_to_lua(ctx, &docs));
            Ok(CallbackReturn::Return)
        }
    });

    lua_api_custom!(ctx, runtime_table, name: "docs", callback: docs_cb,

        namespace: "runtime",

        action: "runtime_docs",

        doc: "Return documentation for all registered Lua APIs.",

        params: [

        ],

        returns: "table" => "Array of API documentation records",

    );

    let hs_get_doc = _host_state.clone();
    let get_doc_cb = Callback::from_fn(&ctx, move |ctx, _exec, mut stack| {
        let query = if !stack.is_empty() {
            match stack.get(0) {
                Value::String(s) => String::from_utf8_lossy(s.as_bytes()).to_string(),
                other => {
                    let msg = format!(
                        "runtime.get_doc expects an API name or action string, got {}",
                        other.type_name()
                    );
                    return Err(piccolo::IntoValue::into_value(msg, ctx).into());
                }
            }
        } else {
            return Err(piccolo::IntoValue::into_value(
                "runtime.get_doc requires an API name or action string",
                ctx,
            )
            .into());
        };

        let has_provider = hs_get_doc.borrow().has_js_doc_provider;
        if has_provider {
            let mut hs = hs_get_doc.borrow_mut();
            hs.async_call_counter += 1;
            let call_id = hs.async_call_counter;
            let command = crate::types::AsyncCommand {
                call_id,
                action: "__runtime_get_doc".to_string(),
                params: serde_json::json!({ "query": query }),
            };
            hs.pending_async_command = Some(command);
            stack.clear();
            Ok(CallbackReturn::Yield {
                to_thread: None,
                then: None,
            })
        } else {
            stack.clear();
            if let Some(doc) = crate::api_docs::find_as_json_value(&query) {
                stack.push_back(json_value_to_lua(ctx, &doc));
            } else {
                stack.push_back(Value::Nil);
            }
            Ok(CallbackReturn::Return)
        }
    });

    lua_api_custom!(ctx, runtime_table, name: "get_doc", callback: get_doc_cb,

        namespace: "runtime",

        action: "runtime_get_doc",

        doc: "Return documentation for one API by `namespace.name` or action string.",

        params: [

        query: "string", required, "API name such as `page.click` or action such as `page_click`",

        ],

        returns: "table | nil" => "API documentation record, or nil when not found",

    );

    let hs_search = _host_state.clone();
    let search_docs_cb = Callback::from_fn(&ctx, move |ctx, _exec, mut stack| {
        let query = if !stack.is_empty() {
            match stack.get(0) {
                Value::String(s) => String::from_utf8_lossy(s.as_bytes()).to_string(),
                other => {
                    let msg = format!(
                        "runtime.search_docs expects a query string, got {}",
                        other.type_name()
                    );
                    return Err(piccolo::IntoValue::into_value(msg, ctx).into());
                }
            }
        } else {
            return Err(piccolo::IntoValue::into_value(
                "runtime.search_docs requires a query string",
                ctx,
            )
            .into());
        };

        let has_provider = hs_search.borrow().has_js_doc_provider;
        if has_provider {
            let mut hs = hs_search.borrow_mut();
            hs.async_call_counter += 1;
            let call_id = hs.async_call_counter;
            let command = crate::types::AsyncCommand {
                call_id,
                action: "__runtime_search_docs".to_string(),
                params: serde_json::json!({ "query": query }),
            };
            hs.pending_async_command = Some(command);
            stack.clear();
            Ok(CallbackReturn::Yield {
                to_thread: None,
                then: None,
            })
        } else {
            let docs = crate::api_docs::search_as_json_value(&query);
            stack.clear();
            stack.push_back(json_value_to_lua(ctx, &docs));
            Ok(CallbackReturn::Return)
        }
    });

    lua_api_custom!(ctx, runtime_table, name: "search_docs", callback: search_docs_cb,

        namespace: "runtime",

        action: "runtime_search_docs",

        doc: "Search documentation for APIs matching a query string.",

        params: [

        query: "string", required, "Search query such as `click` or `snapshot`",

        ],

        returns: "table" => "Array of matching API documentation records",

    );
    set_protected_global!(ctx, "runtime", runtime_table, "runtime");
}
