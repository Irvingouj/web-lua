use piccolo::{async_sequence, Callback, CallbackReturn, Context, SequenceReturn, Table, Value};
use std::cell::RefCell;
use std::rc::Rc;
use web_lua_core::HostState;

/// Look up a function in a nested table path (e.g. ["web", "tab", "query"]).
fn get_nested_function<'gc>(
    ctx: Context<'gc>,
    path: &[&'static str],
) -> Result<piccolo::Function<'gc>, piccolo::Error<'gc>> {
    let mut value = ctx.globals().get_value(ctx, path[0]);
    for &key in &path[1..] {
        match value {
            Value::Table(table) => {
                value = table.get_value(ctx, key);
            }
            _ => {
                return Err(piccolo::Error::from(anyhow::anyhow!(
                    "{} is not a table",
                    key
                )))
            }
        }
    }
    match value {
        Value::Function(f) => Ok(f),
        _ => Err(piccolo::Error::from(anyhow::anyhow!(
            "{} is not a function",
            path.last().unwrap()
        ))),
    }
}

/// Create a callback that calls an underlying function with the same arguments.
fn direct_alias_cb<'gc>(ctx: Context<'gc>, path: &[&'static str]) -> Callback<'gc> {
    let f = get_nested_function(ctx, path).unwrap();
    let f_stashed = ctx.stash(f);
    Callback::from_fn(ctx.mutation(), move |ctx, _exec, _stack| {
        let f = ctx.fetch(&f_stashed);
        Ok(CallbackReturn::Call {
            function: f,
            then: None,
        })
    })
}

/// Create a callback that calls an underlying function with specific arguments.
fn call_with_args_alias_cb<'gc>(
    ctx: Context<'gc>,
    path: &[&'static str],
    args: Vec<Value<'gc>>,
) -> Callback<'gc> {
    let f = get_nested_function(ctx, path).unwrap();
    let f_stashed = ctx.stash(f);
    let args_stashed: Vec<piccolo::StashedValue> =
        args.into_iter().map(|v| ctx.stash(v)).collect();
    Callback::from_fn(ctx.mutation(), move |ctx, _exec, mut stack| {
        let f = ctx.fetch(&f_stashed);
        stack.clear();
        for arg_stashed in &args_stashed {
            let arg = ctx.fetch(arg_stashed);
            stack.push_back(arg);
        }
        Ok(CallbackReturn::Call {
            function: f,
            then: None,
        })
    })
}

/// Create a callback that calls a function and extracts a field from the result.
fn extract_field_alias_cb<'gc>(
    ctx: Context<'gc>,
    path: &[&'static str],
    field: &'static str,
) -> Callback<'gc> {
    let f = get_nested_function(ctx, path).unwrap();
    let f_stashed = ctx.stash(f);
    Callback::from_fn(ctx.mutation(), move |ctx, _exec, _stack| {
        let f = ctx.fetch(&f_stashed);
        let then_seq = async_sequence(ctx.mutation(), |_locals, mut seq| {
            async move {
                seq.try_enter(|ctx, _locals, _exec, mut stack| {
                    let result = stack.get(0);
                    let extracted = match result {
                        Value::Table(t) => t.get_value(ctx, field),
                        _ => Value::Nil,
                    };
                    stack.clear();
                    stack.push_back(extracted);
                    Ok(())
                })?;
                Ok(SequenceReturn::Return)
            }
        });
        Ok(CallbackReturn::Call {
            function: f,
            then: Some(then_seq),
        })
    })
}

/// Create a callback that calls a function and returns a specific argument (ignoring the result).
fn ignore_result_alias_cb<'gc>(
    ctx: Context<'gc>,
    path: &[&'static str],
    arg_index: usize,
) -> Callback<'gc> {
    let f = get_nested_function(ctx, path).unwrap();
    let f_stashed = ctx.stash(f);
    Callback::from_fn(ctx.mutation(), move |ctx, _exec, stack| {
        let f = ctx.fetch(&f_stashed);
        let arg = if stack.len() > arg_index {
            stack.get(arg_index)
        } else {
            Value::Nil
        };
        let then_seq = async_sequence(ctx.mutation(), |locals, mut seq| {
            let arg_handle = locals.stash(ctx.mutation(), arg);
            async move {
                seq.try_enter(|_ctx, locals, _exec, mut stack| {
                    stack.clear();
                    let arg = locals.fetch(&arg_handle);
                    stack.push_back(arg);
                    Ok(())
                })?;
                Ok(SequenceReturn::Return)
            }
        });
        Ok(CallbackReturn::Call {
            function: f,
            then: Some(then_seq),
        })
    })
}

/// Create a callback for tab.current: query active tabs and return first tab's id.
fn tab_current_cb<'gc>(ctx: Context<'gc>) -> Callback<'gc> {
    let f = get_nested_function(ctx, &["chrome", "tabs", "query"]).unwrap();
    let f_stashed = ctx.stash(f);
    Callback::from_fn(ctx.mutation(), move |ctx, _exec, mut stack| {
        let f = ctx.fetch(&f_stashed);
        // Push {active = true, currentWindow = true}
        let filter = Table::new(ctx.mutation());
        filter.set_field(ctx, "active", Value::Boolean(true));
        filter.set_field(ctx, "currentWindow", Value::Boolean(true));
        stack.clear();
        stack.push_back(Value::Table(filter));
        let then_seq = async_sequence(ctx.mutation(), |_locals, mut seq| {
            async move {
                seq.try_enter(|ctx, _locals, _exec, mut stack| {
                    let tabs = stack.get(0);
                    let id = match tabs {
                        Value::Table(t) => {
                            let first_tab = t.get_value(ctx, 1);
                            match first_tab {
                                Value::Table(tab) => tab.get_value(ctx, "id"),
                                _ => Value::Nil,
                            }
                        }
                        _ => Value::Nil,
                    };
                    stack.clear();
                    stack.push_back(id);
                    Ok(())
                })?;
                Ok(SequenceReturn::Return)
            }
        });
        Ok(CallbackReturn::Call {
            function: f,
            then: Some(then_seq),
        })
    })
}

/// Create a callback for tab.url: get tab by id and return its url.
fn tab_url_cb<'gc>(ctx: Context<'gc>) -> Callback<'gc> {
    let f = get_nested_function(ctx, &["chrome", "tabs", "get"]).unwrap();
    let f_stashed = ctx.stash(f);
    Callback::from_fn(ctx.mutation(), move |ctx, _exec, stack| {
        let f = ctx.fetch(&f_stashed);
        let arg = if stack.is_empty() { Value::Nil } else { stack.get(0) };
        // If no tab_id provided, return Nil immediately
        if matches!(arg, Value::Nil) {
            return Ok(CallbackReturn::Return);
        }
        let then_seq = async_sequence(ctx.mutation(), |_locals, mut seq| {
            async move {
                seq.try_enter(|ctx, _locals, _exec, mut stack| {
                    let tab = stack.get(0);
                    let url = match tab {
                        Value::Table(t) => t.get_value(ctx, "url"),
                        _ => Value::Nil,
                    };
                    stack.clear();
                    stack.push_back(url);
                    Ok(())
                })?;
                Ok(SequenceReturn::Return)
            }
        });
        Ok(CallbackReturn::Call {
            function: f,
            then: Some(then_seq),
        })
    })
}

/// Create a callback for tab.title: get tab by id and return its title.
fn tab_title_cb<'gc>(ctx: Context<'gc>) -> Callback<'gc> {
    let f = get_nested_function(ctx, &["chrome", "tabs", "get"]).unwrap();
    let f_stashed = ctx.stash(f);
    Callback::from_fn(ctx.mutation(), move |ctx, _exec, stack| {
        let f = ctx.fetch(&f_stashed);
        let arg = if stack.is_empty() { Value::Nil } else { stack.get(0) };
        // If no tab_id provided, return Nil immediately
        if matches!(arg, Value::Nil) {
            return Ok(CallbackReturn::Return);
        }
        let then_seq = async_sequence(ctx.mutation(), |_locals, mut seq| {
            async move {
                seq.try_enter(|ctx, _locals, _exec, mut stack| {
                    let tab = stack.get(0);
                    let title = match tab {
                        Value::Table(t) => t.get_value(ctx, "title"),
                        _ => Value::Nil,
                    };
                    stack.clear();
                    stack.push_back(title);
                    Ok(())
                })?;
                Ok(SequenceReturn::Return)
            }
        });
        Ok(CallbackReturn::Call {
            function: f,
            then: Some(then_seq),
        })
    })
}

/// Create a callback for page.wait_for_load: call tab.current then tab.wait_for_load.
fn page_wait_for_load_cb<'gc>(ctx: Context<'gc>) -> Callback<'gc> {
    let tab_current_fn = get_nested_function(ctx, &["tab", "current"]).unwrap();
    let tab_current_stashed = ctx.stash(tab_current_fn);
    let tab_wait_for_load_fn = get_nested_function(ctx, &["web", "tab", "wait_for_load"]).unwrap();
    let tab_wait_for_load_stashed = ctx.stash(tab_wait_for_load_fn);
    Callback::from_fn(ctx.mutation(), move |ctx, _exec, mut stack| {
        let tab_current_fn = ctx.fetch(&tab_current_stashed);
        let timeout = if stack.is_empty() {
            Value::Nil
        } else {
            stack.get(0)
        };
        let then_seq = async_sequence(ctx.mutation(), |locals, mut seq| {
            let timeout_handle = locals.stash(ctx.mutation(), timeout);
            let tab_wait_for_load_fn = ctx.fetch(&tab_wait_for_load_stashed);
            let tab_wait_for_load_handle = locals.stash(ctx.mutation(), tab_wait_for_load_fn);
            async move {
                seq.try_enter(|_ctx, locals, _exec, mut stack| {
                    let tab_id = stack.get(0);
                    let timeout = locals.fetch(&timeout_handle);
                    stack.clear();
                    stack.push_back(tab_id);
                    stack.push_back(timeout);
                    Ok(())
                })?;
                seq.call(&tab_wait_for_load_handle, 0).await?;
                Ok(SequenceReturn::Return)
            }
        });
        stack.clear();
        Ok(CallbackReturn::Call {
            function: tab_current_fn,
            then: Some(then_seq),
        })
    })
}

/// Create a callback for page.fetch: call tab.current then tab.fetch.
fn page_fetch_cb<'gc>(ctx: Context<'gc>) -> Callback<'gc> {
    let tab_current_fn = get_nested_function(ctx, &["tab", "current"]).unwrap();
    let tab_current_stashed = ctx.stash(tab_current_fn);
    let tab_fetch_fn = get_nested_function(ctx, &["web", "tab", "fetch"]).unwrap();
    let tab_fetch_stashed = ctx.stash(tab_fetch_fn);
    Callback::from_fn(ctx.mutation(), move |ctx, _exec, mut stack| {
        let tab_current_fn = ctx.fetch(&tab_current_stashed);
        let url = if !stack.is_empty() {
            stack.get(0)
        } else {
            Value::Nil
        };
        let opts = if stack.len() > 1 {
            stack.get(1)
        } else {
            Value::Nil
        };
        let then_seq = async_sequence(ctx.mutation(), |locals, mut seq| {
            let url_handle = locals.stash(ctx.mutation(), url);
            let opts_handle = locals.stash(ctx.mutation(), opts);
            let tab_fetch_fn = ctx.fetch(&tab_fetch_stashed);
            let tab_fetch_handle = locals.stash(ctx.mutation(), tab_fetch_fn);
            async move {
                seq.try_enter(|_ctx, locals, _exec, mut stack| {
                    let tab_id = stack.get(0);
                    let url = locals.fetch(&url_handle);
                    let opts = locals.fetch(&opts_handle);
                    stack.clear();
                    stack.push_back(tab_id);
                    stack.push_back(url);
                    stack.push_back(opts);
                    Ok(())
                })?;
                seq.call(&tab_fetch_handle, 0).await?;
                Ok(SequenceReturn::Return)
            }
        });
        stack.clear();
        Ok(CallbackReturn::Call {
            function: tab_current_fn,
            then: Some(then_seq),
        })
    })
}

/// Register all extension aliases.
pub fn register(ctx: Context, _host_state: Rc<RefCell<HostState>>) {
    // ── runtime table ─────────────────────────────────────────────
    let runtime_table = Table::new(ctx.mutation());

    web_lua_core::lua_api_custom!(
        ctx,
        runtime_table,
        name: "fetch",
        callback: direct_alias_cb(ctx, &["web", "fetch"]),
        namespace: "runtime",
        action: "fetch",
        doc: "Alias for web.fetch.",
        params: [
            url: "string", required, "URL",
            opts: "table | nil", optional, "Options",
        ],
        returns: "table" => "{ status, ok, body, headers }",
    );

    web_lua_core::lua_api_custom!(
        ctx,
        runtime_table,
        name: "sleep",
        callback: direct_alias_cb(ctx, &["web", "sleep"]),
        namespace: "runtime",
        action: "sleep",
        doc: "Alias for web.sleep.",
        params: [
            ms: "number", optional, "Milliseconds",
        ],
        returns: "nil" => "None",
    );

    // runtime.storage = web.storage (table alias)
    let web_storage = ctx.globals().get_value(ctx, "web");
    if let Value::Table(web) = web_storage {
        let storage = web.get_value(ctx, "storage");
        runtime_table.set_field(ctx, "storage", storage);
    }
    web_lua_core::api_docs::register(web_lua_core::api_docs::LuaApiDoc {
        namespace: "runtime".to_string(),
        name: "storage".to_string(),
        action: Some("".to_string()),
        description: "Alias for web.storage.".to_string(),
        params: vec![],
        returns: web_lua_core::api_docs::ReturnDoc {
            lua_type: "table".to_string(),
            description: "Storage API table".to_string(),
        },
        source: "rust_core".to_string(),
    });

    // runtime.clipboard = web.clipboard (table alias)
    let web_clipboard = ctx.globals().get_value(ctx, "web");
    if let Value::Table(web) = web_clipboard {
        let clipboard = web.get_value(ctx, "clipboard");
        runtime_table.set_field(ctx, "clipboard", clipboard);
    }
    web_lua_core::api_docs::register(web_lua_core::api_docs::LuaApiDoc {
        namespace: "runtime".to_string(),
        name: "clipboard".to_string(),
        action: Some("".to_string()),
        description: "Alias for web.clipboard.".to_string(),
        params: vec![],
        returns: web_lua_core::api_docs::ReturnDoc {
            lua_type: "table".to_string(),
            description: "Clipboard API table".to_string(),
        },
        source: "rust_core".to_string(),
    });

    // runtime.notifications = web.notifications (table alias)
    let web_notifications = ctx.globals().get_value(ctx, "web");
    if let Value::Table(web) = web_notifications {
        let notifications = web.get_value(ctx, "notifications");
        runtime_table.set_field(ctx, "notifications", notifications);
    }
    web_lua_core::api_docs::register(web_lua_core::api_docs::LuaApiDoc {
        namespace: "runtime".to_string(),
        name: "notifications".to_string(),
        action: Some("".to_string()),
        description: "Alias for web.notifications.".to_string(),
        params: vec![],
        returns: web_lua_core::api_docs::ReturnDoc {
            lua_type: "table".to_string(),
            description: "Notifications API table".to_string(),
        },
        source: "rust_core".to_string(),
    });

    ctx.set_global("runtime", runtime_table);

    // ── tab table ─────────────────────────────────────────────────
    let tab_table = Table::new(ctx.mutation());

    // Direct aliases to web.tab.*
    web_lua_core::lua_api_custom!(
        ctx,
        tab_table,
        name: "query",
        callback: direct_alias_cb(ctx, &["web", "tab", "query"]),
        namespace: "tab",
        action: "tab_query",
        doc: "Alias for web.tab.query.",
        params: [
            query_info: "table", optional, "Query filter",
        ],
        returns: "table" => "Array of matching tabs",
    );

    web_lua_core::lua_api_custom!(
        ctx,
        tab_table,
        name: "create",
        callback: direct_alias_cb(ctx, &["web", "tab", "create"]),
        namespace: "tab",
        action: "tab_create",
        doc: "Alias for web.tab.create.",
        params: [
            create_properties: "table", optional, "Tab properties",
        ],
        returns: "table" => "Created tab object",
    );

    web_lua_core::lua_api_custom!(
        ctx,
        tab_table,
        name: "activate",
        callback: direct_alias_cb(ctx, &["web", "tab", "activate"]),
        namespace: "tab",
        action: "tab_activate",
        doc: "Alias for web.tab.activate.",
        params: [
            tab_id: "number", required, "Tab ID",
        ],
        returns: "boolean" => "Whether activation succeeded",
    );

    web_lua_core::lua_api_custom!(
        ctx,
        tab_table,
        name: "close",
        callback: direct_alias_cb(ctx, &["web", "tab", "close"]),
        namespace: "tab",
        action: "tab_close",
        doc: "Alias for web.tab.close.",
        params: [
            tab_id: "number", required, "Tab ID",
        ],
        returns: "boolean" => "Whether close succeeded",
    );

    web_lua_core::lua_api_custom!(
        ctx,
        tab_table,
        name: "execute_script",
        callback: direct_alias_cb(ctx, &["web", "tab", "execute_script"]),
        namespace: "tab",
        action: "tab_execute_script",
        doc: "Alias for web.tab.execute_script.",
        params: [
            tab_id: "number", required, "Tab ID",
            script: "string | table", required, "Script to inject",
        ],
        returns: "table" => "Injection results",
    );

    web_lua_core::lua_api_custom!(
        ctx,
        tab_table,
        name: "click",
        callback: direct_alias_cb(ctx, &["web", "tab", "click"]),
        namespace: "tab",
        action: "tab_click",
        doc: "Alias for web.tab.click.",
        params: [
            tab_id: "number", required, "Tab ID",
            ref_id: "number", required, "Element refId",
        ],
        returns: "boolean" => "Whether click succeeded",
    );

    web_lua_core::lua_api_custom!(
        ctx,
        tab_table,
        name: "fill",
        callback: direct_alias_cb(ctx, &["web", "tab", "fill"]),
        namespace: "tab",
        action: "tab_fill",
        doc: "Alias for web.tab.fill.",
        params: [
            tab_id: "number", required, "Tab ID",
            ref_id: "number", required, "Element refId",
            value: "string", required, "Text to fill",
        ],
        returns: "boolean" => "Whether fill succeeded",
    );

    web_lua_core::lua_api_custom!(
        ctx,
        tab_table,
        name: "snapshot",
        callback: direct_alias_cb(ctx, &["web", "tab", "snapshot"]),
        namespace: "tab",
        action: "tab_snapshot",
        doc: "Alias for web.tab.snapshot. Defaults to active tab.",
        params: [
            tab_id: "number", optional, "Tab ID (defaults to active tab)",
        ],
        returns: "string" => "Human-readable accessibility tree with refIds",
    );

    web_lua_core::lua_api_custom!(
        ctx,
        tab_table,
        name: "snapshot_text",
        callback: direct_alias_cb(ctx, &["web", "tab", "snapshot_text"]),
        namespace: "tab",
        action: "tab_snapshot_text",
        doc: "Alias for web.tab.snapshot_text. Defaults to active tab.",
        params: [
            tab_id: "number", optional, "Tab ID (defaults to active tab)",
        ],
        returns: "string" => "Human-readable accessibility tree with refIds",
    );

    web_lua_core::lua_api_custom!(
        ctx,
        tab_table,
        name: "snapshot_data",
        callback: direct_alias_cb(ctx, &["web", "tab", "snapshot_data"]),
        namespace: "tab",
        action: "tab_snapshot_data",
        doc: "Alias for web.tab.snapshot_data. Defaults to active tab.",
        params: [
            tab_id: "number", optional, "Tab ID (defaults to active tab)",
        ],
        returns: "table" => "Structured snapshot with nodes, url, title, viewport",
    );

    web_lua_core::lua_api_custom!(
        ctx,
        tab_table,
        name: "scroll_to",
        callback: direct_alias_cb(ctx, &["web", "tab", "scroll_to"]),
        namespace: "tab",
        action: "tab_scroll_to",
        doc: "Alias for web.tab.scroll_to.",
        params: [
            tab_id: "number", required, "Tab ID",
            ref_id: "number", required, "Element refId",
        ],
        returns: "boolean" => "Whether scroll succeeded",
    );

    web_lua_core::lua_api_custom!(
        ctx,
        tab_table,
        name: "evaluate",
        callback: direct_alias_cb(ctx, &["web", "tab", "evaluate"]),
        namespace: "tab",
        action: "tab_evaluate",
        doc: "Alias for web.tab.evaluate.",
        params: [
            tab_id: "number", required, "Tab ID",
            script: "string", required, "JavaScript to evaluate",
        ],
        returns: "any" => "Evaluation result",
    );

    web_lua_core::lua_api_custom!(
        ctx,
        tab_table,
        name: "back",
        callback: direct_alias_cb(ctx, &["web", "tab", "back"]),
        namespace: "tab",
        action: "tab_back",
        doc: "Alias for web.tab.back.",
        params: [
            tab_id: "number", required, "Tab ID",
        ],
        returns: "boolean" => "Whether navigation succeeded",
    );

    web_lua_core::lua_api_custom!(
        ctx,
        tab_table,
        name: "wait_for_load",
        callback: direct_alias_cb(ctx, &["web", "tab", "wait_for_load"]),
        namespace: "tab",
        action: "tab_wait_for_load",
        doc: "Alias for web.tab.wait_for_load.",
        params: [
            tab_id: "number", required, "Tab ID",
        ],
        returns: "boolean" => "Whether tab loaded",
    );

    web_lua_core::lua_api_custom!(
        ctx,
        tab_table,
        name: "fetch",
        callback: direct_alias_cb(ctx, &["web", "tab", "fetch"]),
        namespace: "tab",
        action: "tab_fetch",
        doc: "Alias for web.tab.fetch.",
        params: [
            tab_id: "number", required, "Tab ID",
            url: "string", required, "URL",
            opts: "table | nil", optional, "Options",
        ],
        returns: "table" => "{ status, ok, body, headers }",
    );

    // Complex aliases
    web_lua_core::lua_api_custom!(
        ctx,
        tab_table,
        name: "current",
        callback: tab_current_cb(ctx),
        namespace: "tab",
        action: "",
        doc: "Get the active tab ID.",
        params: [],
        returns: "number | nil" => "Tab ID or nil",
    );

    web_lua_core::lua_api_custom!(
        ctx,
        tab_table,
        name: "url",
        callback: tab_url_cb(ctx),
        namespace: "tab",
        action: "",
        doc: "Get the URL of a tab (defaults to current tab).",
        params: [
            tab_id: "number | nil", optional, "Tab ID",
        ],
        returns: "string | nil" => "URL or nil",
    );

    web_lua_core::lua_api_custom!(
        ctx,
        tab_table,
        name: "title",
        callback: tab_title_cb(ctx),
        namespace: "tab",
        action: "",
        doc: "Get the title of a tab (defaults to current tab).",
        params: [
            tab_id: "number | nil", optional, "Tab ID",
        ],
        returns: "string | nil" => "Title or nil",
    );

    web_lua_core::lua_api_custom!(
        ctx,
        tab_table,
        name: "open",
        callback: extract_field_alias_cb(ctx, &["chrome", "tabs", "create"], "id"),
        namespace: "tab",
        action: "",
        doc: "Create a new tab and return its ID.",
        params: [
            url: "string | nil", optional, "URL to open",
        ],
        returns: "number | nil" => "New tab ID or nil",
    );

    web_lua_core::lua_api_custom!(
        ctx,
        tab_table,
        name: "focus",
        callback: ignore_result_alias_cb(ctx, &["chrome", "tabs", "update"], 0),
        namespace: "tab",
        action: "",
        doc: "Activate (focus) a tab (defaults to current tab).",
        params: [
            tab_id: "number | nil", optional, "Tab ID",
        ],
        returns: "number | nil" => "Focused tab ID or nil",
    );

    web_lua_core::lua_api_custom!(
        ctx,
        tab_table,
        name: "reload",
        callback: ignore_result_alias_cb(ctx, &["chrome", "tabs", "reload"], 0),
        namespace: "tab",
        action: "",
        doc: "Reload a tab (defaults to current tab).",
        params: [
            tab_id: "number | nil", optional, "Tab ID",
        ],
        returns: "number | nil" => "Reloaded tab ID or nil",
    );

    // tab.sleep = runtime.sleep
    let runtime_sleep = runtime_table.get_value(ctx, "sleep");
    tab_table.set_field(ctx, "sleep", runtime_sleep);
    web_lua_core::api_docs::register(web_lua_core::api_docs::LuaApiDoc {
        namespace: "tab".to_string(),
        name: "sleep".to_string(),
        action: Some("sleep".to_string()),
        description: "Alias for runtime.sleep.".to_string(),
        params: vec![
            web_lua_core::api_docs::ParamDoc {
                name: "ms".to_string(),
                lua_type: "number".to_string(),
                required: false,
                description: "Milliseconds".to_string(),
            },
        ],
        returns: web_lua_core::api_docs::ReturnDoc {
            lua_type: "nil".to_string(),
            description: "None".to_string(),
        },
        source: "rust_core".to_string(),
    });

    ctx.set_global("tab", tab_table);

    // ── page table ────────────────────────────────────────────────
    let page_table = ctx.globals().get_value(ctx, "page");
    let page_table = match page_table {
        Value::Table(t) => t,
        _ => Table::new(ctx.mutation()),
    };

    web_lua_core::lua_api_custom!(
        ctx,
        page_table,
        name: "open",
        callback: direct_alias_cb(ctx, &["page", "new_tab"]),
        namespace: "page",
        action: "",
        doc: "Open a new tab (alias for page.new_tab).",
        params: [
            url: "string | nil", optional, "URL to open in the new tab",
        ],
        returns: "table" => "Created tab object",
    );

    web_lua_core::lua_api_custom!(
        ctx,
        page_table,
        name: "see",
        callback: direct_alias_cb(ctx, &["page", "snapshot"]),
        namespace: "page",
        action: "page_snapshot_text",
        doc: "Alias for page.snapshot.",
        params: [
            opts: "table | nil", optional, "Options",
        ],
        returns: "string" => "Human-readable accessibility tree with refIds",
    );

    web_lua_core::lua_api_custom!(
        ctx,
        page_table,
        name: "enter",
        callback: call_with_args_alias_cb(ctx, &["page", "press"], vec![Value::String(ctx.intern(b"Enter"))]),
        namespace: "page",
        action: "page_press",
        doc: "Press the Enter key.",
        params: [],
        returns: "boolean" => "Whether press succeeded",
    );

    web_lua_core::lua_api_custom!(
        ctx,
        page_table,
        name: "wait_for_load",
        callback: page_wait_for_load_cb(ctx),
        namespace: "page",
        action: "",
        doc: "Wait for the active tab to finish loading.",
        params: [
            timeout: "number | nil", optional, "Timeout in milliseconds",
        ],
        returns: "boolean" => "Whether tab loaded",
    );

    web_lua_core::lua_api_custom!(
        ctx,
        page_table,
        name: "fetch",
        callback: page_fetch_cb(ctx),
        namespace: "page",
        action: "",
        doc: "Fetch a URL using the active tab origin (wrapper for tab.fetch).",
        params: [
            url: "string", required, "URL to fetch",
            opts: "table | nil", optional, "Options: method, body, headers, timeout",
        ],
        returns: "table" => "{ status, ok, body, headers }",
    );

    ctx.set_global("page", page_table);
}
