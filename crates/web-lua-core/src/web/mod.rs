use crate::state::HostState;
use piccolo::{Context, Table};
use std::cell::RefCell;
use std::rc::Rc;

macro_rules! lua_api {
    (
        $ctx:expr,
        $table:expr,
        name: $name:expr,
        action: $action:expr,
        host_state: $hs:expr,
        namespace: $ns:expr,
        doc: $desc:expr,
        params: [$($pname:ident: $ptype:expr, $preq:ident, $pdesc:expr),* $(,)?],
        returns: $rtype:expr => $rdesc:expr $(,)?
    ) => {
        {
            let hs_ext = $hs.clone();
            let cb = piccolo::Callback::from_fn(&$ctx, move |ctx, _exec, mut stack| {
                let params = if stack.is_empty() {
                    serde_json::json!({})
                } else if stack.len() == 1 {
                    crate::json::lua_value_to_json(ctx, stack.get(0)).unwrap_or(serde_json::Value::Null)
                } else {
                    let args: Vec<serde_json::Value> = (0..stack.len())
                        .map(|i| {
                            crate::json::lua_value_to_json(ctx, stack.get(i)).unwrap_or(serde_json::Value::Null)
                        })
                        .collect();
                    serde_json::Value::Array(args)
                };

                let mut hs = hs_ext.borrow_mut();
                hs.async_call_counter += 1;
                let call_id = hs.async_call_counter;
                let command = crate::types::AsyncCommand {
                    call_id,
                    action: $action.to_string(),
                    params,
                };
                hs.pending_async_command = Some(command);

                stack.clear();
                Ok(piccolo::CallbackReturn::Yield {
                    to_thread: None,
                    then: None,
                })
            });
            $table.set_field($ctx, $name, cb);

            crate::api_docs::register(crate::api_docs::LuaApiDoc {
                namespace: $ns.to_string(),
                name: $name.to_string(),
                public_name: format!("{}.{}", $ns, $name),
                action: {
                    let a = $action.to_string();
                    if a.is_empty() { None } else { Some(a) }
                },
                local_name: None,
                source: crate::api_docs::ToolSource::RustCore,
                transport: crate::api_docs::ToolTransport::HostAsync,
                description: $desc.to_string(),
                params: vec![$(
                    crate::api_docs::ParamDoc {
                        name: stringify!($pname).to_string(),
                        lua_type: $ptype.to_string(),
                        required: stringify!($preq) == "required",
                        description: $pdesc.to_string(),
                    }
                ),*],
                returns: crate::api_docs::ReturnDoc {
                    lua_type: $rtype.to_string(),
                    description: $rdesc.to_string(),
                },
            });
        }
    };
}

/// Register a Lua tool with full metadata, position-args mapping, and
/// serde-defaults filling.
///
/// Expands to two effects:
/// 1. A `piccolo::Callback` that converts Lua arguments (positional or table)
///    into a JSON object, validates them against `$args_type`, fills serde
///    defaults, and yields an `AsyncCommand`.
/// 2. A call to `api_docs::register()` with the full `LuaApiDoc` shape.
#[macro_export]
macro_rules! register_lua_tool {
    // Full form with explicit local_name
    (
        $ctx:expr,
        $table:expr,
        name: $name:expr,
        action: $action:expr,
        host_state: $hs:expr,
        public_name: $public_name:expr,
        transport: $transport:expr,
        source: $source:expr,
        local_name: $local_name:expr,
        args: $args_type:ty,
        arg_names: [$($arg_name:expr),* $(,)?],
        returns: $rtype:expr => $rdesc:expr,
        doc: $desc:expr,
        params: [$($pname:ident: $ptype:expr, $preq:ident, $pdesc:expr),* $(,)?] $(,)?
    ) => {
        {
            let hs_ext = $hs.clone();
            let cb = piccolo::Callback::from_fn(&$ctx, move |ctx, _exec, mut stack| {
                // 1. Convert Lua stack to JSON
                let raw_params = if stack.is_empty() {
                    serde_json::json!({})
                } else if stack.len() == 1 {
                    let val = stack.get(0);
                    match val {
                        piccolo::Value::Table(_) => {
                            $crate::json::lua_value_to_json(ctx, val)
                                .unwrap_or(serde_json::Value::Null)
                        }
                        _ => {
                            // Single non-table arg: treat as positional
                            let arg = $crate::json::lua_value_to_json(ctx, val)
                                .unwrap_or(serde_json::Value::Null);
                            serde_json::Value::Array(vec![arg])
                        }
                    }
                } else {
                    let args: Vec<serde_json::Value> = (0..stack.len())
                        .map(|i| {
                            $crate::json::lua_value_to_json(ctx, stack.get(i))
                                .unwrap_or(serde_json::Value::Null)
                        })
                        .collect();
                    serde_json::Value::Array(args)
                };

                // 2. Map positional args to a named object
                let fields: &[&str] = &[$($arg_name),*];
                let normalized = $crate::command_params::normalize_array_params(raw_params, fields);

                // 3. Deserialize into the typed struct (applies serde defaults)
                let _validated: $args_type = match serde_json::from_value(normalized.clone()) {
                    Ok(v) => v,
                    Err(e) => {
                        let ns = $public_name.rsplitn(2, '.').nth(1).unwrap_or("");
                        let msg = $crate::utils::format_param_error(ns, $name, &e);
                        return Err(piccolo::IntoValue::into_value(msg, ctx).into());
                    }
                };

                // 4. Re-serialize so missing fields get their defaults
                let params = match serde_json::to_value(&_validated) {
                    Ok(v) => v,
                    Err(e) => {
                        let msg = format!("Failed to serialize parameters for {}: {}", $name, e);
                        return Err(piccolo::IntoValue::into_value(msg, ctx).into());
                    }
                };

                // 5. Yield an AsyncCommand
                let mut hs = hs_ext.borrow_mut();
                hs.async_call_counter += 1;
                let call_id = hs.async_call_counter;
                let command = $crate::types::AsyncCommand {
                    call_id,
                    action: $action.to_string(),
                    params,
                };
                hs.pending_async_command = Some(command);

                stack.clear();
                Ok(piccolo::CallbackReturn::Yield {
                    to_thread: None,
                    then: None,
                })
            });
            $table.set_field($ctx, $name, cb);

            // 6. Register API documentation
            $crate::api_docs::register($crate::api_docs::LuaApiDoc {
                namespace: $public_name.rsplitn(2, '.').nth(1).unwrap_or("").to_string(),
                name: $name.to_string(),
                public_name: $public_name.to_string(),
                action: {
                    let a = $action.to_string();
                    if a.is_empty() { None } else { Some(a) }
                },
                local_name: $local_name,
                source: $source,
                transport: $transport,
                description: $desc.to_string(),
                params: vec![$(
                    $crate::api_docs::ParamDoc {
                        name: stringify!($pname).to_string(),
                        lua_type: $ptype.to_string(),
                        required: stringify!($preq) == "required",
                        description: $pdesc.to_string(),
                    }
                ),*],
                returns: $crate::api_docs::ReturnDoc {
                    lua_type: $rtype.to_string(),
                    description: $rdesc.to_string(),
                },
            });
        }
    };

    // Shorthand: local_name defaults to None
    (
        $ctx:expr,
        $table:expr,
        name: $name:expr,
        action: $action:expr,
        host_state: $hs:expr,
        public_name: $public_name:expr,
        transport: $transport:expr,
        source: $source:expr,
        args: $args_type:ty,
        arg_names: [$($arg_name:expr),* $(,)?],
        returns: $rtype:expr => $rdesc:expr,
        doc: $desc:expr,
        params: [$($pname:ident: $ptype:expr, $preq:ident, $pdesc:expr),* $(,)?] $(,)?
    ) => {
        $crate::register_lua_tool!(
            $ctx,
            $table,
            name: $name,
            action: $action,
            host_state: $hs,
            public_name: $public_name,
            transport: $transport,
            source: $source,
            local_name: None,
            args: $args_type,
            arg_names: [$($arg_name),*],
            returns: $rtype => $rdesc,
            doc: $desc,
            params: [$($pname: $ptype, $preq, $pdesc),*],
        )
    };
}

/// Register a custom Lua callback and its API documentation in one call.
///
/// Use this when the callback is built manually (e.g. `Callback::from_fn` or
/// a helper closure) rather than via the generic `lua_api!` async-yield
/// pattern.
#[macro_export]
macro_rules! lua_api_custom {
    (
        $ctx:expr,
        $table:expr,
        name: $name:expr,
        callback: $cb:expr,
        namespace: $ns:expr,
        action: $action:expr,
        doc: $desc:expr,
        params: [$($pname:ident: $ptype:expr, $preq:ident, $pdesc:expr),* $(,)?],
        returns: $rtype:expr => $rdesc:expr $(,)?
    ) => {
        {
            $table.set_field($ctx, $name, $cb);
            $crate::lua_api_doc!(
                namespace: $ns,
                name: $name,
                action: $action,
                doc: $desc,
                params: [$($pname: $ptype, $preq, $pdesc),*],
                returns: $rtype => $rdesc,
            );
        }
    };
}

/// Wrap `$table` with the API protector and attach it to `$parent` under `$name`.
///
/// **Note:** The macro shadows `$table` — the original unprotected table is
/// replaced by the protected one, so the caller can only access the wrapped
/// version after this call.
///
/// Usage:
/// ```ignore
/// let tab_table = tab::register(ctx, host_state.clone());
/// set_protected!(ctx, web_table, "tab", tab_table, "web.tab");
/// ```
macro_rules! set_protected {
    ($ctx:expr, $parent:expr, $name:expr, $table:ident, $ns:expr) => {
        let $table = crate::web::protector::protect_api_table($ctx, $table, $ns);
        $parent.set_field($ctx, $name, $table);
    };
}

/// Wrap `$table` with the API protector and register it as a global.
///
/// **Note:** The macro shadows `$table` — the original unprotected table is
/// replaced by the protected one, so the caller can only access the wrapped
/// version after this call.
///
/// Usage:
/// ```ignore
/// let page_table = Table::new(&ctx);
/// // ... populate page_table ...
/// set_protected_global!(ctx, "page", page_table, "page");
/// ```
macro_rules! set_protected_global {
    ($ctx:expr, $name:expr, $table:ident, $ns:expr) => {
        let $table = crate::web::protector::protect_api_table($ctx, $table, $ns);
        $ctx.set_global($name, $table);
    };
}

mod bookmarks;
mod chrome;
mod clipboard;
mod cookies;
mod dom;
mod fetch;
mod fs;
mod history;
mod host;
mod log;
mod notifications;
mod page;
mod path;
mod protector;
mod runtime;
mod sidepanel;
mod storage;
mod tab;

pub(crate) fn register_web_module(ctx: Context, host_state: Rc<RefCell<HostState>>) {
    let web_table = Table::new(&ctx);

    fetch::register(ctx, &web_table, host_state.clone());

    log::register(ctx, &web_table, host_state.clone());

    let storage_table = storage::register(ctx, host_state.clone());
    set_protected!(ctx, web_table, "storage", storage_table, "web.storage");

    let tab_table = tab::register(ctx, host_state.clone());
    set_protected!(ctx, web_table, "tab", tab_table, "web.tab");

    let cookies_table = cookies::register(ctx, host_state.clone());
    set_protected!(ctx, web_table, "cookies", cookies_table, "web.cookies");

    let history_table = history::register(ctx, host_state.clone());
    set_protected!(ctx, web_table, "history", history_table, "web.history");

    let bookmarks_table = bookmarks::register(ctx, host_state.clone());
    set_protected!(
        ctx,
        web_table,
        "bookmarks",
        bookmarks_table,
        "web.bookmarks"
    );

    let notifications_table = notifications::register(ctx, host_state.clone());
    set_protected!(
        ctx,
        web_table,
        "notifications",
        notifications_table,
        "web.notifications"
    );

    let clipboard_table = clipboard::register(ctx, host_state.clone());
    set_protected!(
        ctx,
        web_table,
        "clipboard",
        clipboard_table,
        "web.clipboard"
    );

    let fs_table = fs::register(ctx, host_state.clone());
    web_table.set_field(ctx, "fs", fs_table);
    ctx.set_global("fs", fs_table);

    chrome::register(ctx, host_state.clone());
    dom::register(ctx, host_state.clone());
    page::register(ctx, host_state.clone());
    path::register(ctx);
    sidepanel::register(ctx, host_state.clone());
    host::register(ctx, host_state.clone());
    runtime::register(ctx, host_state.clone());

    set_protected_global!(ctx, "web", web_table, "web");
}

#[cfg(test)]
mod tests {
    use std::cell::RefCell;
    use std::rc::Rc;

    struct RegisterLuaToolTestPlugin;

    impl crate::plugin::LuaPlugin for RegisterLuaToolTestPlugin {
        fn name(&self) -> &str {
            "register_lua_tool_test"
        }
        fn register(&self, ctx: piccolo::Context, hs: Rc<RefCell<crate::state::HostState>>) {
            let globals = ctx.globals();

            crate::register_lua_tool!(
                ctx,
                globals,
                name: "test_click",
                action: "test_click_action",
                host_state: hs,
                public_name: "test.test_click",
                transport: crate::api_docs::ToolTransport::HostAsync,
                source: crate::api_docs::ToolSource::RustCore,
                local_name: Some("click".to_string()),
                args: crate::command_params::PageClickParams,
                arg_names: ["refId"],
                returns: "boolean" => "Whether click succeeded",
                doc: "Test click with position args mapping.",
                params: [
                    ref_id: "string", required, "Element refId",
                ],
            );
        }
    }

    #[test]
    fn test_register_lua_tool_position_args() {
        let mut session = crate::session::NotebookSession::build()
            .plugin(Box::new(RegisterLuaToolTestPlugin))
            .finish();

        let result = session.run_cell(
            r#"
            local result = test_click("abc")
            print(result)
        "#,
            "",
        );

        assert_eq!(result.status, crate::types::CellStatus::AsyncPending);
        let cmd = result.pending_command.unwrap();
        assert_eq!(cmd.action.as_str(), "test_click_action");

        let params = cmd.params.as_object().unwrap();
        assert_eq!(params.get("refId").unwrap().as_str(), Some("abc"));
        // Verify serde default was filled
        assert_eq!(params.get("label").unwrap().as_str(), Some(""));
    }

    #[test]
    fn test_register_lua_tool_table_args() {
        let mut session = crate::session::NotebookSession::build()
            .plugin(Box::new(RegisterLuaToolTestPlugin))
            .finish();

        let result = session.run_cell(
            r#"
            local result = test_click({ refId = "xyz" })
            print(result)
        "#,
            "",
        );

        assert_eq!(result.status, crate::types::CellStatus::AsyncPending);
        let cmd = result.pending_command.unwrap();
        let params = cmd.params.as_object().unwrap();
        assert_eq!(params.get("refId").unwrap().as_str(), Some("xyz"));
        assert_eq!(params.get("label").unwrap().as_str(), Some(""));
    }

    #[test]
    fn test_register_lua_tool_registry_fields() {
        let _session = crate::session::NotebookSession::build()
            .plugin(Box::new(RegisterLuaToolTestPlugin))
            .finish();

        let registry = crate::api_docs::REGISTRY.lock().unwrap();
        let doc = registry
            .iter()
            .find(|d| d.name == "test_click" && d.namespace == "test")
            .expect("test_click should be in registry");

        assert_eq!(doc.public_name, "test.test_click");
        assert_eq!(doc.transport, crate::api_docs::ToolTransport::HostAsync);
        assert_eq!(doc.source, crate::api_docs::ToolSource::RustCore);
        assert_eq!(doc.local_name, Some("click".to_string()));
        assert_eq!(doc.action, Some("test_click_action".to_string()));
        assert_eq!(doc.name, "test_click");
        assert_eq!(doc.namespace, "test");
    }

    #[test]
    fn test_register_lua_tool_defaults_to_none_local_name() {
        let mut lua = piccolo::Lua::core();
        lua.enter(|ctx| {
            let hs = Rc::new(RefCell::new(crate::state::HostState::default()));
            let globals = ctx.globals();

            crate::register_lua_tool!(
                ctx,
                globals,
                name: "test_tool_none",
                action: "test_tool_none_action",
                host_state: hs,
                public_name: "test2.test_tool_none",
                transport: crate::api_docs::ToolTransport::RustSync,
                source: crate::api_docs::ToolSource::MainThread,
                args: crate::command_params::DomSnapshotParams,
                arg_names: [],
                returns: "table" => "Snapshot data",
                doc: "Test tool with default local_name.",
                params: [],
            );

            let registry = crate::api_docs::REGISTRY.lock().unwrap();
            let doc = registry
                .iter()
                .find(|d| d.name == "test_tool_none" && d.namespace == "test2")
                .expect("test_tool_none should be in registry");

            assert_eq!(doc.local_name, None);
            assert_eq!(doc.transport, crate::api_docs::ToolTransport::RustSync);
            assert_eq!(doc.source, crate::api_docs::ToolSource::MainThread);
        });
    }
}
