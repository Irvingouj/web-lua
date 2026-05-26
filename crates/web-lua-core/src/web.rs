use crate::json::lua_value_to_json;
use crate::state::HostState;
use crate::types::AsyncCommand;
use crate::utils::{format_value, percent_encode};
use piccolo::{Callback, CallbackReturn, Context, IntoValue, String as LuaString, Table, Value};
use serde_json;
use std::cell::RefCell;
use std::rc::Rc;

// ─── Web Module ───────────────────────────────────────────────────

pub(crate) fn register_web_module(ctx: Context, host_state: Rc<RefCell<HostState>>) {
    let web_table = Table::new(&ctx);

    // web.mock_async(label) — yields for testing, resumes with provided value
    let hs_mock = host_state.clone();
    let mock_cb = Callback::from_fn(&ctx, move |ctx, _exec, mut stack| {
        let label = if !stack.is_empty() {
            match stack.get(0) {
                Value::String(s) => String::from_utf8_lossy(s.as_bytes()).to_string(),
                other => format_value(ctx, other),
            }
        } else {
            "mock".to_string()
        };

        let mut hs = hs_mock.borrow_mut();
        hs.async_call_counter += 1;
        let call_id = hs.async_call_counter;
        let command = AsyncCommand {
            call_id,
            action: crate::action::Action::MockAsync,
            params: serde_json::json!({ "label": label }),
        };
        hs.pending_async_command = Some(command);

        stack.clear();
        Ok(CallbackReturn::Yield {
            to_thread: None,
            then: None,
        })
    });

    web_table.set_field(ctx, "mock_async", mock_cb);
    crate::lua_api_doc!(
    namespace: "web",
    name: "mock_async",
    action: "mock_async",
    doc: "Yield for testing, resumes with provided value.",
    params: [
    label: "string | nil", optional, "Test label",
    ],
    returns: "string" => "Test label echoed back",
    );

    // web.fetch(url [, opts]) — async HTTP request
    let hs_fetch = host_state.clone();
    let fetch_cb = Callback::from_fn(&ctx, move |ctx, _exec, mut stack| {
        let url = if !stack.is_empty() {
            match stack.get(0) {
                Value::String(s) => String::from_utf8_lossy(s.as_bytes()).to_string(),
                other => format_value(ctx, other),
            }
        } else {
            let msg = "web.fetch requires at least a URL argument".to_string();
            return Err(msg.into_value(ctx).into());
        };

        // Parse options table (second argument)
        let mut method = "GET".to_string();
        let mut headers = serde_json::json!({});
        let mut body = serde_json::Value::Null;
        let mut timeout: u32 = 30_000;

        if stack.len() > 1 {
            if let Value::Table(t) = stack.get(1) {
                // method
                if let Ok(Value::String(s)) = t.get(ctx, "method") {
                    method = String::from_utf8_lossy(s.as_bytes()).to_uppercase();
                }
                // headers
                if let Ok(Value::Table(ht)) = t.get(ctx, "headers") {
                    let mut hdr_map = serde_json::Map::new();
                    for entry in ht.iter() {
                        let (k, v) = entry;
                        let key = match k {
                            Value::String(s) => String::from_utf8_lossy(s.as_bytes()).to_string(),
                            other => format_value(ctx, other),
                        };
                        let val = match v {
                            Value::String(s) => String::from_utf8_lossy(s.as_bytes()).to_string(),
                            other => format_value(ctx, other),
                        };
                        hdr_map.insert(key, serde_json::Value::String(val));
                    }
                    headers = serde_json::Value::Object(hdr_map);
                }
                // body
                if let Ok(Value::String(s)) = t.get(ctx, "body") {
                    body = serde_json::Value::String(
                        String::from_utf8_lossy(s.as_bytes()).to_string(),
                    );
                }
                // timeout
                if let Ok(Value::Integer(i)) = t.get(ctx, "timeout") {
                    timeout = i as u32;
                } else if let Ok(Value::Number(f)) = t.get(ctx, "timeout") {
                    timeout = f as u32;
                }
            }
        }

        let params = serde_json::json!({
            "url": url,
            "method": method,
            "headers": headers,
            "body": body,
            "timeout": timeout,
        });
        let _validated: crate::command_params::FetchParams =
            match serde_json::from_value(params.clone()) {
                Ok(v) => v,
                Err(e) => {
                    let msg = format!("Invalid fetch params built from Lua: {}", e);
                    return Err(msg.into_value(ctx).into());
                }
            };

        let mut hs = hs_fetch.borrow_mut();
        hs.async_call_counter += 1;
        let call_id = hs.async_call_counter;
        let command = AsyncCommand {
            call_id,
            action: crate::action::Action::Fetch,
            params,
        };
        hs.pending_async_command = Some(command);

        stack.clear();
        Ok(CallbackReturn::Yield {
            to_thread: None,
            then: None,
        })
    });

    web_table.set_field(ctx, "fetch", fetch_cb);

    crate::lua_api_doc!(
        namespace: "web",
        name: "fetch",
        action: "fetch",
        doc: "Perform an HTTP fetch request.",
        params: [
            url: "string", required, "URL to fetch",
            opts: "table | nil", optional, "Options: method, body, headers, timeout",
        ],
        returns: "table" => "{ status, ok, body, headers }",
    );

    // ── web.url.parse(url_string) → table ──
    let url_table = Table::new(&ctx);

    let url_parse_cb = Callback::from_fn(&ctx, move |ctx, _exec, mut stack| {
        let url_str = if !stack.is_empty() {
            match stack.get(0) {
                Value::String(s) => String::from_utf8_lossy(s.as_bytes()).to_string(),
                other => format_value(ctx, other),
            }
        } else {
            let msg = "web.url.parse requires a URL string argument".to_string();
            return Err(msg.into_value(ctx).into());
        };

        let parsed = match url::Url::parse(&url_str) {
            Ok(u) => u,
            Err(e) => {
                let msg = format!("invalid URL: {}", e);
                return Err(msg.into_value(ctx).into());
            }
        };

        let result = Table::new(&ctx);

        // scheme
        let scheme = parsed.scheme();
        result.set_field(ctx, "scheme", ctx.intern(scheme.as_bytes()));

        // host
        if let Some(host) = parsed.host_str() {
            result.set_field(ctx, "host", ctx.intern(host.as_bytes()));
        } else {
            result.set_field(ctx, "host", Value::Nil);
        }

        // port
        if let Some(port) = parsed.port() {
            result.set_field(ctx, "port", port as i64);
        } else {
            result.set_field(ctx, "port", Value::Nil);
        }

        // path
        let path = parsed.path();
        result.set_field(ctx, "path", ctx.intern(path.as_bytes()));

        // fragment
        if let Some(fragment) = parsed.fragment() {
            result.set_field(ctx, "fragment", ctx.intern(fragment.as_bytes()));
        } else {
            result.set_field(ctx, "fragment", Value::Nil);
        }

        // query string as table
        let query_table = Table::new(&ctx);
        let mut idx = 1i64;
        for (key, value) in parsed.query_pairs() {
            let pair = Table::new(&ctx);
            pair.set_field(ctx, "key", ctx.intern(key.as_bytes()));
            pair.set_field(ctx, "value", ctx.intern(value.as_bytes()));
            query_table.set(ctx, idx, pair).unwrap();
            idx += 1;
        }
        result.set_field(ctx, "query", query_table);

        // Also store raw query string
        if let Some(q) = parsed.query() {
            result.set_field(ctx, "query_string", ctx.intern(q.as_bytes()));
        } else {
            result.set_field(ctx, "query_string", Value::Nil);
        }

        stack.clear();
        stack.push_back(result.into());
        Ok(CallbackReturn::Return)
    });

    url_table.set_field(ctx, "parse", url_parse_cb);
    crate::lua_api_doc!(
    namespace: "web.url",
    name: "parse",
    action: "url_parse",
    doc: "Parse a URL string into components.",
    params: [
    url: "string", required, "URL string to parse",
    ],
    returns: "table" => "Parsed URL components: protocol, host, pathname, search, hash",
    );

    // ── web.url.encode(params_table) → string ──
    let url_encode_cb = Callback::from_fn(&ctx, move |ctx, _exec, mut stack| {
        let params = if !stack.is_empty() {
            match stack.get(0) {
                Value::Table(t) => t,
                other => {
                    let msg = format!("web.url.encode expects a table, got {}", other.type_name());
                    return Err(msg.into_value(ctx).into());
                }
            }
        } else {
            let msg = "web.url.encode requires a table argument".to_string();
            return Err(msg.into_value(ctx).into());
        };

        let mut pairs = Vec::new();
        for entry in params.iter() {
            let (k, v) = entry;
            let key = match k {
                Value::String(s) => String::from_utf8_lossy(s.as_bytes()).to_string(),
                other => format_value(ctx, other),
            };
            let val = match v {
                Value::String(s) => String::from_utf8_lossy(s.as_bytes()).to_string(),
                Value::Integer(i) => i.to_string(),
                Value::Number(f) => format!("{}", f),
                Value::Boolean(b) => (if b { "true" } else { "false" }).to_string(),
                _ => continue,
            };
            pairs.push(format!(
                "{}={}",
                percent_encode(key.as_bytes()),
                percent_encode(val.as_bytes())
            ));
        }

        let encoded = pairs.join("&");
        stack.clear();
        stack.push_back(ctx.intern(encoded.as_bytes()).into());
        Ok(CallbackReturn::Return)
    });

    url_table.set_field(ctx, "encode", url_encode_cb);
    crate::lua_api_doc!(
    namespace: "web.url",
    name: "encode",
    action: "url_encode",
    doc: "Encode a table into a query string.",
    params: [
    params: "table", required, "Key-value pairs to encode",
    ],
    returns: "string" => "URL-encoded query string",
    );
    web_table.set_field(ctx, "url", url_table);

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

    // ── web.sleep(ms) — async, yields to worker ──
    let hs_sleep = host_state.clone();
    let sleep_cb = Callback::from_fn(&ctx, move |ctx, _exec, mut stack| {
        let duration = if !stack.is_empty() {
            match stack.get(0) {
                Value::Integer(i) => i as u64,
                Value::Number(f) => f as u64,
                other => {
                    let msg = format!(
                        "web.sleep expects a number (milliseconds), got {}",
                        other.type_name()
                    );
                    return Err(msg.into_value(ctx).into());
                }
            }
        } else {
            let msg = "web.sleep requires a duration argument (milliseconds)".to_string();
            return Err(msg.into_value(ctx).into());
        };

        let params = serde_json::json!({ "duration": duration });
        let _validated: crate::command_params::SleepParams =
            match serde_json::from_value(params.clone()) {
                Ok(v) => v,
                Err(e) => {
                    let msg = format!("Invalid sleep params built from Lua: {}", e);
                    return Err(msg.into_value(ctx).into());
                }
            };

        let mut hs = hs_sleep.borrow_mut();
        hs.async_call_counter += 1;
        let call_id = hs.async_call_counter;
        let command = AsyncCommand {
            call_id,
            action: crate::action::Action::Sleep,
            params,
        };
        hs.pending_async_command = Some(command);

        stack.clear();
        Ok(CallbackReturn::Yield {
            to_thread: None,
            then: None,
        })
    });

    web_table.set_field(ctx, "sleep", sleep_cb);
    crate::lua_api_doc!(
    namespace: "web",
    name: "sleep",
    action: "sleep",
    doc: "Pause execution for a duration.",
    params: [
    ms: "number", optional, "Milliseconds to sleep (default 1000)",
    ],
    returns: "nil" => "None",
    );

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

    web_table.set_field(ctx, "storage", storage_table);

    // ── Browser Extension APIs ──
    // These yield commands to the worker, which checks if running in extension context.
    // We create a macro-like pattern to register multiple APIs with minimal boilerplate.

    macro_rules! lua_api {
        (
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
                let cb = Callback::from_fn(&ctx, move |ctx, _exec, mut stack| {
                    let params = if stack.is_empty() {
                        serde_json::json!({})
                    } else if stack.len() == 1 {
                        lua_value_to_json(ctx, stack.get(0)).unwrap_or(serde_json::Value::Null)
                    } else {
                        let args: Vec<serde_json::Value> = (0..stack.len())
                            .map(|i| {
                                lua_value_to_json(ctx, stack.get(i)).unwrap_or(serde_json::Value::Null)
                            })
                            .collect();
                        serde_json::Value::Array(args)
                    };

                    let mut hs = hs_ext.borrow_mut();
                    hs.async_call_counter += 1;
                    let call_id = hs.async_call_counter;
                    let command = AsyncCommand {
                        call_id,
                        action: crate::action::Action::from($action),
                        params,
                    };
                    hs.pending_async_command = Some(command);

                    stack.clear();
                    Ok(CallbackReturn::Yield {
                        to_thread: None,
                        then: None,
                    })
                });
                $table.set_field(ctx, $name, cb);

                crate::api_docs::register(crate::api_docs::LuaApiDoc {
                    namespace: $ns.to_string(),
                    name: $name.to_string(),
                    action: Some($action.to_string()),
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
                    source: "rust_core".to_string(),
                });
            }
        };
    }

    // web.tab sub-module
    let tab_table = Table::new(&ctx);
    lua_api!(tab_table,
    name: "query",
    action: "tab_query",
    host_state: host_state,
    namespace: "web.tab",
    doc: "Query Chrome tabs matching given criteria.",
    params: [
    query_info: "table", optional, "Query filter: active, currentWindow, url, etc.",
    ],
    returns: "table" => "Array of matching tab objects",
    );
    lua_api!(tab_table,
    name: "create",
    action: "tab_create",
    host_state: host_state,
    namespace: "web.tab",
    doc: "Create a new tab.",
    params: [
    create_properties: "table", optional, "URL, windowId, active, etc.",
    ],
    returns: "table" => "Created tab object",
    );
    lua_api!(tab_table,
    name: "activate",
    action: "tab_activate",
    host_state: host_state,
    namespace: "web.tab",
    doc: "Activate (focus) a tab.",
    params: [
    tab_id: "number", required, "Tab ID to activate",
    ],
    returns: "boolean" => "Whether activation succeeded",
    );
    lua_api!(tab_table,
    name: "close",
    action: "tab_close",
    host_state: host_state,
    namespace: "web.tab",
    doc: "Close a tab.",
    params: [
    tab_id: "number", required, "Tab ID to close",
    ],
    returns: "boolean" => "Whether close succeeded",
    );
    lua_api!(tab_table,
    name: "execute_script",
    action: "tab_execute_script",
    host_state: host_state,
    namespace: "web.tab",
    doc: "Execute JavaScript in a target tab.",
    params: [
    tab_id: "number", required, "Target tab ID",
    script: "string | table", required, "Script code or injection details",
    ],
    returns: "table" => "Injection results",
    );
    lua_api!(tab_table,
        name: "click",
        action: "tab_click",
        host_state: host_state,
        namespace: "web.tab",
        doc: "Click an element by refId in the target tab.",
        params: [
            tab_id: "number", required, "Target tab ID",
            ref_id: "number", required, "Element refId from snapshot",
        ],
        returns: "boolean" => "Whether the click succeeded",
    );
    lua_api!(tab_table,
    name: "fill",
    action: "tab_fill",
    host_state: host_state,
    namespace: "web.tab",
    doc: "Fill an input element by refId in the target tab.",
    params: [
    tab_id: "number", required, "Target tab ID",
    ref_id: "number", required, "Element refId from snapshot",
    value: "string", required, "Text to fill",
    ],
    returns: "boolean" => "Whether fill succeeded",
    );
    lua_api!(tab_table,
        name: "snapshot",
        action: "tab_snapshot",
        host_state: host_state,
        namespace: "web.tab",
        doc: "Take a DOM snapshot of the target tab.",
        params: [
            tab_id: "number", required, "Target tab ID",
        ],
        returns: "table" => "Simplified inline DOM snapshot with refIds",
    );
    lua_api!(tab_table,
    name: "scroll_to",
    action: "tab_scroll_to",
    host_state: host_state,
    namespace: "web.tab",
    doc: "Scroll to an element by refId in the target tab.",
    params: [
    tab_id: "number", required, "Target tab ID",
    ref_id: "number", required, "Element refId from snapshot",
    ],
    returns: "boolean" => "Whether scroll succeeded",
    );
    lua_api!(tab_table,
    name: "evaluate",
    action: "tab_evaluate",
    host_state: host_state,
    namespace: "web.tab",
    doc: "Evaluate JavaScript in a target tab and return the result.",
    params: [
    tab_id: "number", required, "Target tab ID",
    script: "string", required, "JavaScript code to evaluate",
    ],
    returns: "any" => "Evaluation result",
    );
    lua_api!(tab_table,
    name: "back",
    action: "tab_back",
    host_state: host_state,
    namespace: "web.tab",
    doc: "Navigate back in a target tab.",
    params: [
    tab_id: "number", required, "Target tab ID",
    ],
    returns: "boolean" => "Whether navigation succeeded",
    );
    lua_api!(tab_table,
    name: "wait_for_load",
    action: "tab_wait_for_load",
    host_state: host_state,
    namespace: "web.tab",
    doc: "Wait for a tab to finish loading.",
    params: [
    tab_id: "number", required, "Target tab ID",
    ],
    returns: "boolean" => "Whether the tab loaded",
    );
    lua_api!(tab_table,
    name: "fetch",
    action: "tab_fetch",
    host_state: host_state,
    namespace: "web.tab",
    doc: "Perform an HTTP fetch inside a target tab origin.",
    params: [
    tab_id: "number", required, "Target tab ID",
    url: "string", required, "URL to fetch",
    opts: "table | nil", optional, "Options: method, body, headers, timeout",
    ],
    returns: "table" => "{ status, ok, body, headers }",
    );
    web_table.set_field(ctx, "tab", tab_table);

    // web.cookies sub-module
    let cookies_table = Table::new(&ctx);
    lua_api!(cookies_table,
    name: "get",
    action: "cookies_get",
    host_state: host_state,
    namespace: "web.cookies",
    doc: "Get a cookie by name and URL.",
    params: [
    details: "table", required, "Cookie query: name, url, storeId",
    ],
    returns: "table | nil" => "Cookie object or nil if not found",
    );
    lua_api!(cookies_table,
    name: "set",
    action: "cookies_set",
    host_state: host_state,
    namespace: "web.cookies",
    doc: "Set a cookie.",
    params: [
    details: "table", required, "Cookie to set: name, value, url, etc.",
    ],
    returns: "table" => "Set cookie object",
    );
    lua_api!(cookies_table,
    name: "delete",
    action: "cookies_delete",
    host_state: host_state,
    namespace: "web.cookies",
    doc: "Delete a cookie.",
    params: [
    details: "table", required, "Cookie to delete: name, url",
    ],
    returns: "boolean" => "Whether deletion succeeded",
    );
    lua_api!(cookies_table,
    name: "list",
    action: "cookies_list",
    host_state: host_state,
    namespace: "web.cookies",
    doc: "List cookies matching a filter.",
    params: [
    filter: "table", optional, "Filter: url, name, domain, etc.",
    ],
    returns: "table" => "Array of cookie objects",
    );
    web_table.set_field(ctx, "cookies", cookies_table);

    // web.history sub-module
    let history_table = Table::new(&ctx);
    lua_api!(history_table,
    name: "search",
    action: "history_search",
    host_state: host_state,
    namespace: "web.history",
    doc: "Search browser history.",
    params: [
    query: "table", required, "Search query: text, startTime, endTime, maxResults",
    ],
    returns: "table" => "Array of history items",
    );
    lua_api!(history_table,
    name: "delete",
    action: "history_delete",
    host_state: host_state,
    namespace: "web.history",
    doc: "Delete a URL from browser history.",
    params: [
    url: "string", required, "URL to remove from history",
    ],
    returns: "boolean" => "Whether deletion succeeded",
    );
    web_table.set_field(ctx, "history", history_table);

    // web.bookmarks sub-module
    let bookmarks_table = Table::new(&ctx);
    lua_api!(bookmarks_table,
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
    lua_api!(bookmarks_table,
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
    lua_api!(bookmarks_table,
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
    web_table.set_field(ctx, "bookmarks", bookmarks_table);

    // web.notifications sub-module
    let notifications_table = Table::new(&ctx);
    lua_api!(notifications_table,
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
    lua_api!(notifications_table,
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
    web_table.set_field(ctx, "notifications", notifications_table);

    // web.clipboard sub-module
    let clipboard_table = Table::new(&ctx);
    lua_api!(clipboard_table,
    name: "read",
    action: "clipboard_read",
    host_state: host_state,
    namespace: "web.clipboard",
    doc: "Read text from the system clipboard.",
    params: [
    ],
    returns: "string | nil" => "Clipboard text or nil",
    );
    lua_api!(clipboard_table,
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
    web_table.set_field(ctx, "clipboard", clipboard_table);

    ctx.set_global("web", web_table);

    // ── chrome module (browser extension APIs) ──
    let chrome_table = Table::new(&ctx);

    // chrome.runtime
    let runtime_table = Table::new(&ctx);
    lua_api!(runtime_table,
    name: "sendMessage",
    action: "chrome_runtime_sendMessage",
    host_state: host_state,
    namespace: "chrome.runtime",
    doc: "Send a message to the extension background script or another extension.",
    params: [
    message: "any", required, "Message payload",
    options: "table | nil", optional, "Options: to, includeTlsChannelId",
    ],
    returns: "any" => "Response from the recipient",
    );
    chrome_table.set_field(ctx, "runtime", runtime_table);

    // chrome.tabs
    let tabs_table = Table::new(&ctx);
    lua_api!(tabs_table,
        name: "query",
        action: "chrome_tabs_query",
        host_state: host_state,
        namespace: "chrome.tabs",
        doc: "Query Chrome tabs matching given criteria.",
        params: [
            query_info: "table", required, "Query filter: active, currentWindow, url, etc.",
        ],
        returns: "table" => "Array of matching tab objects",
    );
    lua_api!(tabs_table,
    name: "create",
    action: "chrome_tabs_create",
    host_state: host_state,
    namespace: "chrome.tabs",
    doc: "Create a new Chrome tab.",
    params: [
    create_properties: "table", optional, "URL, windowId, active, etc.",
    ],
    returns: "table" => "Created tab object",
    );
    lua_api!(tabs_table,
    name: "update",
    action: "chrome_tabs_update",
    host_state: host_state,
    namespace: "chrome.tabs",
    doc: "Update properties of a tab.",
    params: [
    tab_id: "number | nil", optional, "Tab ID (nil for active tab)",
    update_properties: "table", required, "Properties: url, active, muted, etc.",
    ],
    returns: "table" => "Updated tab object",
    );
    lua_api!(tabs_table,
    name: "remove",
    action: "chrome_tabs_remove",
    host_state: host_state,
    namespace: "chrome.tabs",
    doc: "Close one or more tabs.",
    params: [
    tab_ids: "number | table", required, "Tab ID or array of tab IDs",
    ],
    returns: "boolean" => "Whether removal succeeded",
    );
    lua_api!(tabs_table,
    name: "get",
    action: "chrome_tabs_get",
    host_state: host_state,
    namespace: "chrome.tabs",
    doc: "Get a tab by ID.",
    params: [
    tab_id: "number", required, "Tab ID",
    ],
    returns: "table" => "Tab object",
    );
    lua_api!(tabs_table,
    name: "reload",
    action: "chrome_tabs_reload",
    host_state: host_state,
    namespace: "chrome.tabs",
    doc: "Reload a tab.",
    params: [
    tab_id: "number | nil", optional, "Tab ID (nil for active tab)",
    reload_properties: "table | nil", optional, "bypassCache",
    ],
    returns: "boolean" => "Whether reload succeeded",
    );
    lua_api!(tabs_table,
    name: "sendMessage",
    action: "chrome_tabs_sendMessage",
    host_state: host_state,
    namespace: "chrome.tabs",
    doc: "Send a message to a specific tab.",
    params: [
    tab_id: "number", required, "Target tab ID",
    message: "any", required, "Message payload",
    options: "table | nil", optional, "Options: frameId",
    ],
    returns: "any" => "Response from the tab",
    );
    chrome_table.set_field(ctx, "tabs", tabs_table);

    // chrome.alarms
    let alarms_table = Table::new(&ctx);
    lua_api!(alarms_table,
    name: "create",
    action: "chrome_alarms_create",
    host_state: host_state,
    namespace: "chrome.alarms",
    doc: "Create an alarm.",
    params: [
    name: "string | nil", optional, "Alarm name",
    alarm_info: "table", required, "When: delayInMinutes, periodInMinutes",
    ],
    returns: "boolean" => "Whether creation succeeded",
    );
    lua_api!(alarms_table,
    name: "clear",
    action: "chrome_alarms_clear",
    host_state: host_state,
    namespace: "chrome.alarms",
    doc: "Clear an alarm.",
    params: [
    name: "string | nil", optional, "Alarm name (nil clears all)",
    ],
    returns: "boolean" => "Whether any alarm was cleared",
    );
    chrome_table.set_field(ctx, "alarms", alarms_table);

    // chrome.action
    let action_table = Table::new(&ctx);
    lua_api!(action_table,
    name: "setBadgeText",
    action: "chrome_action_setBadgeText",
    host_state: host_state,
    namespace: "chrome.action",
    doc: "Set the badge text on the extension action icon.",
    params: [
    details: "table", required, "text, tabId",
    ],
    returns: "boolean" => "Whether set succeeded",
    );
    lua_api!(action_table,
    name: "setBadgeBackgroundColor",
    action: "chrome_action_setBadgeBackgroundColor",
    host_state: host_state,
    namespace: "chrome.action",
    doc: "Set the badge background color.",
    params: [
    details: "table", required, "color, tabId",
    ],
    returns: "boolean" => "Whether set succeeded",
    );
    lua_api!(action_table,
    name: "setTitle",
    action: "chrome_action_setTitle",
    host_state: host_state,
    namespace: "chrome.action",
    doc: "Set the title of the extension action.",
    params: [
    details: "table", required, "title, tabId",
    ],
    returns: "boolean" => "Whether set succeeded",
    );
    lua_api!(action_table,
    name: "setIcon",
    action: "chrome_action_setIcon",
    host_state: host_state,
    namespace: "chrome.action",
    doc: "Set the icon of the extension action.",
    params: [
    details: "table", required, "imageData, path, tabId",
    ],
    returns: "boolean" => "Whether set succeeded",
    );
    chrome_table.set_field(ctx, "action", action_table);

    // chrome.contextMenus
    let context_menus_table = Table::new(&ctx);
    lua_api!(context_menus_table,
    name: "create",
    action: "chrome_contextMenus_create",
    host_state: host_state,
    namespace: "chrome.contextMenus",
    doc: "Create a context menu item.",
    params: [
    create_properties: "table", required, "id, title, contexts, onclick",
    ],
    returns: "string | number" => "Created item ID",
    );
    lua_api!(context_menus_table,
    name: "remove",
    action: "chrome_contextMenus_remove",
    host_state: host_state,
    namespace: "chrome.contextMenus",
    doc: "Remove a context menu item.",
    params: [
    menuItemId: "string | number", required, "Item ID to remove",
    ],
    returns: "boolean" => "Whether removal succeeded",
    );
    chrome_table.set_field(ctx, "contextMenus", context_menus_table);

    // chrome.windows
    let windows_table = Table::new(&ctx);
    lua_api!(windows_table,
    name: "getAll",
    action: "chrome_windows_getAll",
    host_state: host_state,
    namespace: "chrome.windows",
    doc: "Get all browser windows.",
    params: [
    get_info: "table | nil", optional, "populate, windowTypes",
    ],
    returns: "table" => "Array of window objects",
    );
    lua_api!(windows_table,
    name: "create",
    action: "chrome_windows_create",
    host_state: host_state,
    namespace: "chrome.windows",
    doc: "Create a new browser window.",
    params: [
    create_data: "table | nil", optional, "url, type, focused, etc.",
    ],
    returns: "table" => "Created window object",
    );
    lua_api!(windows_table,
    name: "update",
    action: "chrome_windows_update",
    host_state: host_state,
    namespace: "chrome.windows",
    doc: "Update a browser window.",
    params: [
    window_id: "number", required, "Window ID",
    update_info: "table", required, "focused, state, etc.",
    ],
    returns: "table" => "Updated window object",
    );
    lua_api!(windows_table,
    name: "remove",
    action: "chrome_windows_remove",
    host_state: host_state,
    namespace: "chrome.windows",
    doc: "Close a browser window.",
    params: [
    window_id: "number", required, "Window ID to close",
    ],
    returns: "boolean" => "Whether close succeeded",
    );
    chrome_table.set_field(ctx, "windows", windows_table);

    // chrome.sidePanel
    let side_panel_table = Table::new(&ctx);
    lua_api!(side_panel_table,
    name: "setOptions",
    action: "chrome_sidePanel_setOptions",
    host_state: host_state,
    namespace: "chrome.sidePanel",
    doc: "Configure the side panel behavior.",
    params: [
    options: "table", required, "enabled, path",
    ],
    returns: "boolean" => "Whether options were set",
    );
    chrome_table.set_field(ctx, "sidePanel", side_panel_table);

    // chrome.cookies
    let cookies_table = Table::new(&ctx);
    lua_api!(cookies_table,
    name: "get",
    action: "chrome_cookies_get",
    host_state: host_state,
    namespace: "chrome.cookies",
    doc: "Get a cookie by details.",
    params: [
    details: "table", required, "name, url, storeId",
    ],
    returns: "table | nil" => "Cookie object or nil",
    );
    lua_api!(cookies_table,
    name: "set",
    action: "chrome_cookies_set",
    host_state: host_state,
    namespace: "chrome.cookies",
    doc: "Set a cookie.",
    params: [
    details: "table", required, "name, value, url, etc.",
    ],
    returns: "table" => "Set cookie object",
    );
    lua_api!(cookies_table,
    name: "remove",
    action: "chrome_cookies_remove",
    host_state: host_state,
    namespace: "chrome.cookies",
    doc: "Remove a cookie.",
    params: [
    details: "table", required, "name, url",
    ],
    returns: "boolean" => "Whether removal succeeded",
    );
    lua_api!(cookies_table,
    name: "getAll",
    action: "chrome_cookies_getAll",
    host_state: host_state,
    namespace: "chrome.cookies",
    doc: "Get all cookies matching a filter.",
    params: [
    details: "table", optional, "url, name, domain, etc.",
    ],
    returns: "table" => "Array of cookie objects",
    );
    chrome_table.set_field(ctx, "cookies", cookies_table);

    // chrome.bookmarks
    let bookmarks_table = Table::new(&ctx);
    lua_api!(bookmarks_table,
    name: "search",
    action: "chrome_bookmarks_search",
    host_state: host_state,
    namespace: "chrome.bookmarks",
    doc: "Search bookmarks.",
    params: [
    query: "string | table", required, "Search string or query object",
    ],
    returns: "table" => "Array of bookmark nodes",
    );
    lua_api!(bookmarks_table,
    name: "create",
    action: "chrome_bookmarks_create",
    host_state: host_state,
    namespace: "chrome.bookmarks",
    doc: "Create a bookmark.",
    params: [
    bookmark: "table", required, "parentId, title, url, index",
    ],
    returns: "table" => "Created bookmark node",
    );
    lua_api!(bookmarks_table,
    name: "remove",
    action: "chrome_bookmarks_remove",
    host_state: host_state,
    namespace: "chrome.bookmarks",
    doc: "Remove a bookmark.",
    params: [
    id: "string", required, "Bookmark node ID",
    ],
    returns: "boolean" => "Whether removal succeeded",
    );
    chrome_table.set_field(ctx, "bookmarks", bookmarks_table);

    // chrome.history
    let history_table = Table::new(&ctx);
    lua_api!(history_table,
    name: "search",
    action: "chrome_history_search",
    host_state: host_state,
    namespace: "chrome.history",
    doc: "Search browser history.",
    params: [
    query: "table", required, "text, startTime, endTime, maxResults",
    ],
    returns: "table" => "Array of history items",
    );
    lua_api!(history_table,
    name: "deleteUrl",
    action: "chrome_history_deleteUrl",
    host_state: host_state,
    namespace: "chrome.history",
    doc: "Delete a URL from history.",
    params: [
    url: "string", required, "URL to remove",
    ],
    returns: "boolean" => "Whether deletion succeeded",
    );
    chrome_table.set_field(ctx, "history", history_table);

    // chrome.notifications
    let notifications_table = Table::new(&ctx);
    lua_api!(notifications_table,
    name: "create",
    action: "chrome_notifications_create",
    host_state: host_state,
    namespace: "chrome.notifications",
    doc: "Create a notification.",
    params: [
    id: "string | nil", optional, "Notification ID",
    options: "table", required, "type, title, message, iconUrl",
    ],
    returns: "string" => "Notification ID",
    );
    lua_api!(notifications_table,
    name: "clear",
    action: "chrome_notifications_clear",
    host_state: host_state,
    namespace: "chrome.notifications",
    doc: "Clear a notification.",
    params: [
    id: "string", required, "Notification ID to clear",
    ],
    returns: "boolean" => "Whether notification was cleared",
    );
    chrome_table.set_field(ctx, "notifications", notifications_table);

    // chrome.scripting
    let scripting_table = Table::new(&ctx);
    lua_api!(scripting_table,
    name: "executeScript",
    action: "chrome_scripting_executeScript",
    host_state: host_state,
    namespace: "chrome.scripting",
    doc: "Inject JavaScript into a page.",
    params: [
    target: "table", required, "tabId, frameIds, allFrames",
    func: "string | table | nil", optional, "Function or script to inject",
    ],
    returns: "table" => "Array of injection results",
    );
    chrome_table.set_field(ctx, "scripting", scripting_table);

    ctx.set_global("chrome", chrome_table);

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
                        let msg = format!("Invalid dom_snapshot params built from Lua: {}", e);
                        return Err(msg.into_value(ctx).into());
                    }
                };

            let mut hs = hs_dom.borrow_mut();
            hs.async_call_counter += 1;
            let call_id = hs.async_call_counter;
            let command = AsyncCommand {
                call_id,
                action: crate::action::Action::DomSnapshot,
                params,
            };
            hs.pending_async_command = Some(command);

            stack.clear();
            Ok(CallbackReturn::Yield {
                to_thread: None,
                then: None,
            })
        });
        dom_table.set_field(ctx, "snapshot", dom_snapshot_cb);

        crate::lua_api_doc!(
            namespace: "dom",
            name: "snapshot",
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
                        let msg = format!("Invalid dom_format params built from Lua: {}", e);
                        return Err(msg.into_value(ctx).into());
                    }
                };

            let mut hs = hs_dom.borrow_mut();
            hs.async_call_counter += 1;
            let call_id = hs.async_call_counter;
            let command = AsyncCommand {
                call_id,
                action: crate::action::Action::DomFormat,
                params,
            };
            hs.pending_async_command = Some(command);

            stack.clear();
            Ok(CallbackReturn::Yield {
                to_thread: None,
                then: None,
            })
        });
        dom_table.set_field(ctx, "format", dom_format_cb);
        crate::lua_api_doc!(
        namespace: "dom",
        name: "format",
        action: "dom_format",
        doc: "Format a DOM snapshot into a text representation.",
        params: [
        snapshot: "table", required, "DOM snapshot object",
        format: "string | nil", optional, "Output format: compact-text, markdown, etc.",
        ],
        returns: "string" => "Formatted text representation",
        );
    }

    ctx.set_global("dom", dom_table);

    // ── page module (Agent API: snapshot + element actions + navigation) ──
    let page_table = Table::new(&ctx);

    // page.snapshot(opts?) — async, yields "page_snapshot"
    {
        let hs_page = host_state.clone();
        let cb = Callback::from_fn(&ctx, move |ctx, _exec, mut stack| {
            let params = if stack.is_empty() {
                serde_json::json!({})
            } else {
                lua_value_to_json(ctx, stack.get(0)).unwrap_or(serde_json::Value::Null)
            };
            let _validated: crate::command_params::DomSnapshotParams =
                match serde_json::from_value(params.clone()) {
                    Ok(v) => v,
                    Err(e) => {
                        let msg = format!("Invalid page_snapshot params built from Lua: {}", e);
                        return Err(msg.into_value(ctx).into());
                    }
                };

            let mut hs = hs_page.borrow_mut();
            hs.async_call_counter += 1;
            let command = AsyncCommand {
                call_id: hs.async_call_counter,
                action: crate::action::Action::PageSnapshot,
                params,
            };
            hs.pending_async_command = Some(command);
            stack.clear();
            Ok(CallbackReturn::Yield {
                to_thread: None,
                then: None,
            })
        });
        page_table.set_field(ctx, "snapshot", cb);

        crate::lua_api_doc!(
        namespace: "page",
        name: "snapshot",
        action: "page_snapshot",
        doc: "Take a DOM snapshot of the current page.",
        params: [
        opts: "table | nil", optional, "Options: refId, maxDepth, etc.",
        ],
        returns: "table" => "DOM snapshot object",
        );
    }

    // page.click(ref_id) — async
    {
        let hs_page = host_state.clone();
        let cb = Callback::from_fn(&ctx, move |ctx, _exec, mut stack| {
            let ref_id = if !stack.is_empty() {
                match stack.get(0) {
                    Value::String(s) => String::from_utf8_lossy(s.as_bytes()).to_string(),
                    other => format_value(ctx, other),
                }
            } else {
                return Err("page.click requires a ref_id argument"
                    .into_value(ctx)
                    .into());
            };
            let params = serde_json::json!({ "refId": ref_id });
            let _validated: crate::command_params::PageClickParams =
                match serde_json::from_value(params.clone()) {
                    Ok(v) => v,
                    Err(e) => {
                        let msg = format!("Invalid page_click params built from Lua: {}", e);
                        return Err(msg.into_value(ctx).into());
                    }
                };

            let mut hs = hs_page.borrow_mut();
            hs.async_call_counter += 1;
            let command = AsyncCommand {
                call_id: hs.async_call_counter,
                action: crate::action::Action::PageClick,
                params,
            };
            hs.pending_async_command = Some(command);
            stack.clear();
            Ok(CallbackReturn::Yield {
                to_thread: None,
                then: None,
            })
        });
        page_table.set_field(ctx, "click", cb);

        crate::lua_api_doc!(
            namespace: "page",
            name: "click",
            action: "page_click",
            doc: "Click an element by refId in the current page.",
            params: [
                ref_id: "string", required, "Element refId from snapshot",
            ],
            returns: "nil" => "None",
        );
    }

    // page.dblclick(ref_id) — async
    {
        let hs_page = host_state.clone();
        let cb = Callback::from_fn(&ctx, move |ctx, _exec, mut stack| {
            let ref_id = if !stack.is_empty() {
                match stack.get(0) {
                    Value::String(s) => String::from_utf8_lossy(s.as_bytes()).to_string(),
                    other => format_value(ctx, other),
                }
            } else {
                return Err("page.dblclick requires a ref_id argument"
                    .into_value(ctx)
                    .into());
            };
            let params = serde_json::json!({ "refId": ref_id });
            let _validated: crate::command_params::PageDblClickParams =
                match serde_json::from_value(params.clone()) {
                    Ok(v) => v,
                    Err(e) => {
                        let msg = format!("Invalid page_dblclick params built from Lua: {}", e);
                        return Err(msg.into_value(ctx).into());
                    }
                };

            let mut hs = hs_page.borrow_mut();
            hs.async_call_counter += 1;
            let command = AsyncCommand {
                call_id: hs.async_call_counter,
                action: crate::action::Action::PageDblclick,
                params,
            };
            hs.pending_async_command = Some(command);
            stack.clear();
            Ok(CallbackReturn::Yield {
                to_thread: None,
                then: None,
            })
        });
        page_table.set_field(ctx, "dblclick", cb);
        crate::lua_api_doc!(
        namespace: "page",
        name: "dblclick",
        action: "page_dblclick",
        doc: "Double-click an element by refId.",
        params: [
        ref_id: "string", required, "Element refId from snapshot",
        ],
        returns: "nil" => "None",
        );
    }

    // page.fill(ref_id, value) — async
    {
        let hs_page = host_state.clone();
        let cb = Callback::from_fn(&ctx, move |ctx, _exec, mut stack| {
            let ref_id = if !stack.is_empty() {
                match stack.get(0) {
                    Value::String(s) => String::from_utf8_lossy(s.as_bytes()).to_string(),
                    other => format_value(ctx, other),
                }
            } else {
                return Err("page.fill requires ref_id and value arguments"
                    .into_value(ctx)
                    .into());
            };
            let value = if stack.len() > 1 {
                match stack.get(1) {
                    Value::String(s) => String::from_utf8_lossy(s.as_bytes()).to_string(),
                    other => format_value(ctx, other),
                }
            } else {
                return Err("page.fill requires a value argument".into_value(ctx).into());
            };
            let params = serde_json::json!({ "refId": ref_id, "value": value });
            let _validated: crate::command_params::PageFillParams =
                match serde_json::from_value(params.clone()) {
                    Ok(v) => v,
                    Err(e) => {
                        let msg = format!("Invalid page_fill params built from Lua: {}", e);
                        return Err(msg.into_value(ctx).into());
                    }
                };

            let mut hs = hs_page.borrow_mut();
            hs.async_call_counter += 1;
            let command = AsyncCommand {
                call_id: hs.async_call_counter,
                action: crate::action::Action::PageFill,
                params,
            };
            hs.pending_async_command = Some(command);
            stack.clear();
            Ok(CallbackReturn::Yield {
                to_thread: None,
                then: None,
            })
        });
        page_table.set_field(ctx, "fill", cb);
        crate::lua_api_doc!(
        namespace: "page",
        name: "fill",
        action: "page_fill",
        doc: "Fill an input element by refId with a value.",
        params: [
        ref_id: "string", required, "Element refId from snapshot",
        value: "string", required, "Text to fill",
        ],
        returns: "nil" => "None",
        );
    }

    // page.type(ref_id, text) — async (append text)
    {
        let hs_page = host_state.clone();
        let cb = Callback::from_fn(&ctx, move |ctx, _exec, mut stack| {
            let ref_id = if !stack.is_empty() {
                match stack.get(0) {
                    Value::String(s) => String::from_utf8_lossy(s.as_bytes()).to_string(),
                    other => format_value(ctx, other),
                }
            } else {
                return Err("page.type requires ref_id and text arguments"
                    .into_value(ctx)
                    .into());
            };
            let text = if stack.len() > 1 {
                match stack.get(1) {
                    Value::String(s) => String::from_utf8_lossy(s.as_bytes()).to_string(),
                    other => format_value(ctx, other),
                }
            } else {
                return Err("page.type requires a text argument".into_value(ctx).into());
            };
            let params = serde_json::json!({ "refId": ref_id, "text": text });
            let _validated: crate::command_params::PageTypeParams =
                match serde_json::from_value(params.clone()) {
                    Ok(v) => v,
                    Err(e) => {
                        let msg = format!("Invalid page_type params built from Lua: {}", e);
                        return Err(msg.into_value(ctx).into());
                    }
                };

            let mut hs = hs_page.borrow_mut();
            hs.async_call_counter += 1;
            let command = AsyncCommand {
                call_id: hs.async_call_counter,
                action: crate::action::Action::PageType,
                params,
            };
            hs.pending_async_command = Some(command);
            stack.clear();
            Ok(CallbackReturn::Yield {
                to_thread: None,
                then: None,
            })
        });
        page_table.set_field(ctx, "type", cb);
        crate::lua_api_doc!(
        namespace: "page",
        name: "type",
        action: "page_type",
        doc: "Append text to an input element by refId.",
        params: [
        ref_id: "string", required, "Element refId from snapshot",
        text: "string", required, "Text to append",
        ],
        returns: "nil" => "None",
        );
    }

    // page.press(key) — async
    {
        let hs_page = host_state.clone();
        let cb = Callback::from_fn(&ctx, move |ctx, _exec, mut stack| {
            let key = if !stack.is_empty() {
                match stack.get(0) {
                    Value::String(s) => String::from_utf8_lossy(s.as_bytes()).to_string(),
                    other => format_value(ctx, other),
                }
            } else {
                return Err("page.press requires a key argument".into_value(ctx).into());
            };
            let params = serde_json::json!({ "key": key });
            let _validated: crate::command_params::PagePressParams =
                match serde_json::from_value(params.clone()) {
                    Ok(v) => v,
                    Err(e) => {
                        let msg = format!("Invalid page_press params built from Lua: {}", e);
                        return Err(msg.into_value(ctx).into());
                    }
                };

            let mut hs = hs_page.borrow_mut();
            hs.async_call_counter += 1;
            let command = AsyncCommand {
                call_id: hs.async_call_counter,
                action: crate::action::Action::PagePress,
                params,
            };
            hs.pending_async_command = Some(command);
            stack.clear();
            Ok(CallbackReturn::Yield {
                to_thread: None,
                then: None,
            })
        });
        page_table.set_field(ctx, "press", cb);
        crate::lua_api_doc!(
        namespace: "page",
        name: "press",
        action: "page_press",
        doc: "Press a keyboard key.",
        params: [
        key: "string", required, "Key name: Enter, Escape, ArrowDown, etc.",
        ],
        returns: "nil" => "None",
        );
    }

    // page.select(ref_id, value) — async
    {
        let hs_page = host_state.clone();
        let cb = Callback::from_fn(&ctx, move |ctx, _exec, mut stack| {
            let ref_id = if !stack.is_empty() {
                match stack.get(0) {
                    Value::String(s) => String::from_utf8_lossy(s.as_bytes()).to_string(),
                    other => format_value(ctx, other),
                }
            } else {
                return Err("page.select requires ref_id and value arguments"
                    .into_value(ctx)
                    .into());
            };
            let value = if stack.len() > 1 {
                match stack.get(1) {
                    Value::String(s) => String::from_utf8_lossy(s.as_bytes()).to_string(),
                    other => format_value(ctx, other),
                }
            } else {
                return Err("page.select requires a value argument"
                    .into_value(ctx)
                    .into());
            };
            let params = serde_json::json!({ "refId": ref_id, "value": value });
            let _validated: crate::command_params::PageSelectParams =
                match serde_json::from_value(params.clone()) {
                    Ok(v) => v,
                    Err(e) => {
                        let msg = format!("Invalid page_select params built from Lua: {}", e);
                        return Err(msg.into_value(ctx).into());
                    }
                };

            let mut hs = hs_page.borrow_mut();
            hs.async_call_counter += 1;
            let command = AsyncCommand {
                call_id: hs.async_call_counter,
                action: crate::action::Action::PageSelect,
                params,
            };
            hs.pending_async_command = Some(command);
            stack.clear();
            Ok(CallbackReturn::Yield {
                to_thread: None,
                then: None,
            })
        });
        page_table.set_field(ctx, "select", cb);
        crate::lua_api_doc!(
        namespace: "page",
        name: "select",
        action: "page_select",
        doc: "Select an option in a dropdown by refId and value.",
        params: [
        ref_id: "string", required, "Element refId from snapshot",
        value: "string", required, "Option value to select",
        ],
        returns: "nil" => "None",
        );
    }

    // page.check(ref_id, checked?) — async
    {
        let hs_page = host_state.clone();
        let cb = Callback::from_fn(&ctx, move |ctx, _exec, mut stack| {
            let ref_id = if !stack.is_empty() {
                match stack.get(0) {
                    Value::String(s) => String::from_utf8_lossy(s.as_bytes()).to_string(),
                    other => format_value(ctx, other),
                }
            } else {
                return Err("page.check requires a ref_id argument"
                    .into_value(ctx)
                    .into());
            };
            let checked = if stack.len() > 1 {
                match stack.get(1) {
                    Value::Boolean(b) => b,
                    Value::Nil => true,
                    _ => true,
                }
            } else {
                true
            };
            let params = serde_json::json!({ "refId": ref_id, "checked": checked });
            let _validated: crate::command_params::PageCheckParams =
                match serde_json::from_value(params.clone()) {
                    Ok(v) => v,
                    Err(e) => {
                        let msg = format!("Invalid page_check params built from Lua: {}", e);
                        return Err(msg.into_value(ctx).into());
                    }
                };

            let mut hs = hs_page.borrow_mut();
            hs.async_call_counter += 1;
            let command = AsyncCommand {
                call_id: hs.async_call_counter,
                action: crate::action::Action::PageCheck,
                params,
            };
            hs.pending_async_command = Some(command);
            stack.clear();
            Ok(CallbackReturn::Yield {
                to_thread: None,
                then: None,
            })
        });
        page_table.set_field(ctx, "check", cb);
        crate::lua_api_doc!(
        namespace: "page",
        name: "check",
        action: "page_check",
        doc: "Check or uncheck a checkbox by refId.",
        params: [
        ref_id: "string", required, "Element refId from snapshot",
        checked: "boolean", optional, "Checked state (default true)",
        ],
        returns: "nil" => "None",
        );
    }

    // page.hover(ref_id) — async
    {
        let hs_page = host_state.clone();
        let cb = Callback::from_fn(&ctx, move |ctx, _exec, mut stack| {
            let ref_id = if !stack.is_empty() {
                match stack.get(0) {
                    Value::String(s) => String::from_utf8_lossy(s.as_bytes()).to_string(),
                    other => format_value(ctx, other),
                }
            } else {
                return Err("page.hover requires a ref_id argument"
                    .into_value(ctx)
                    .into());
            };
            let params = serde_json::json!({ "refId": ref_id });
            let _validated: crate::command_params::PageHoverParams =
                match serde_json::from_value(params.clone()) {
                    Ok(v) => v,
                    Err(e) => {
                        let msg = format!("Invalid page_hover params built from Lua: {}", e);
                        return Err(msg.into_value(ctx).into());
                    }
                };

            let mut hs = hs_page.borrow_mut();
            hs.async_call_counter += 1;
            let command = AsyncCommand {
                call_id: hs.async_call_counter,
                action: crate::action::Action::PageHover,
                params,
            };
            hs.pending_async_command = Some(command);
            stack.clear();
            Ok(CallbackReturn::Yield {
                to_thread: None,
                then: None,
            })
        });
        page_table.set_field(ctx, "hover", cb);
        crate::lua_api_doc!(
        namespace: "page",
        name: "hover",
        action: "page_hover",
        doc: "Hover over an element by refId.",
        params: [
        ref_id: "string", required, "Element refId from snapshot",
        ],
        returns: "nil" => "None",
        );
    }

    // page.unhover() — async
    {
        let hs_page = host_state.clone();
        let cb = Callback::from_fn(&ctx, move |_ctx, _exec, mut stack| {
            let mut hs = hs_page.borrow_mut();
            hs.async_call_counter += 1;
            let command = AsyncCommand {
                call_id: hs.async_call_counter,
                action: crate::action::Action::PageUnhover,
                params: serde_json::json!({}),
            };
            hs.pending_async_command = Some(command);
            stack.clear();
            Ok(CallbackReturn::Yield {
                to_thread: None,
                then: None,
            })
        });
        page_table.set_field(ctx, "unhover", cb);
        crate::lua_api_doc!(
        namespace: "page",
        name: "unhover",
        action: "page_unhover",
        doc: "Move mouse away from any hovered element.",
        params: [
        ],
        returns: "nil" => "None",
        );
    }

    // page.scroll(direction, amount) — async
    {
        let hs_page = host_state.clone();
        let cb = Callback::from_fn(&ctx, move |ctx, _exec, mut stack| {
            let direction = if !stack.is_empty() {
                match stack.get(0) {
                    Value::String(s) => String::from_utf8_lossy(s.as_bytes()).to_string(),
                    other => format_value(ctx, other),
                }
            } else {
                "down".to_string()
            };
            let amount = if stack.len() > 1 {
                match stack.get(1) {
                    Value::Integer(i) => i as f64,
                    Value::Number(f) => f,
                    _ => 300.0,
                }
            } else {
                300.0
            };
            let params = serde_json::json!({ "direction": direction, "amount": amount });
            let _validated: crate::command_params::PageScrollParams =
                match serde_json::from_value(params.clone()) {
                    Ok(v) => v,
                    Err(e) => {
                        let msg = format!("Invalid page_scroll params built from Lua: {}", e);
                        return Err(msg.into_value(ctx).into());
                    }
                };

            let mut hs = hs_page.borrow_mut();
            hs.async_call_counter += 1;
            let command = AsyncCommand {
                call_id: hs.async_call_counter,
                action: crate::action::Action::PageScroll,
                params,
            };
            hs.pending_async_command = Some(command);
            stack.clear();
            Ok(CallbackReturn::Yield {
                to_thread: None,
                then: None,
            })
        });
        page_table.set_field(ctx, "scroll", cb);
        crate::lua_api_doc!(
        namespace: "page",
        name: "scroll",
        action: "page_scroll",
        doc: "Scroll the page by direction and amount.",
        params: [
        direction: "string", optional, "up, down, left, right (default down)",
        amount: "number", optional, "Pixels to scroll (default 300)",
        ],
        returns: "nil" => "None",
        );
    }

    // page.scroll_to(ref_id) — async
    {
        let hs_page = host_state.clone();
        let cb = Callback::from_fn(&ctx, move |ctx, _exec, mut stack| {
            let ref_id = if !stack.is_empty() {
                match stack.get(0) {
                    Value::String(s) => String::from_utf8_lossy(s.as_bytes()).to_string(),
                    other => format_value(ctx, other),
                }
            } else {
                return Err("page.scroll_to requires a ref_id argument"
                    .into_value(ctx)
                    .into());
            };
            let params = serde_json::json!({ "refId": ref_id });
            let _validated: crate::command_params::PageScrollToParams =
                match serde_json::from_value(params.clone()) {
                    Ok(v) => v,
                    Err(e) => {
                        let msg = format!("Invalid page_scroll_to params built from Lua: {}", e);
                        return Err(msg.into_value(ctx).into());
                    }
                };

            let mut hs = hs_page.borrow_mut();
            hs.async_call_counter += 1;
            let command = AsyncCommand {
                call_id: hs.async_call_counter,
                action: crate::action::Action::PageScrollTo,
                params,
            };
            hs.pending_async_command = Some(command);
            stack.clear();
            Ok(CallbackReturn::Yield {
                to_thread: None,
                then: None,
            })
        });
        page_table.set_field(ctx, "scroll_to", cb);
        crate::lua_api_doc!(
        namespace: "page",
        name: "scroll_to",
        action: "page_scroll_to",
        doc: "Scroll to an element by refId.",
        params: [
        ref_id: "string", required, "Element refId from snapshot",
        ],
        returns: "nil" => "None",
        );
    }

    // page.url() — async
    {
        let hs_page = host_state.clone();
        let cb = Callback::from_fn(&ctx, move |_ctx, _exec, mut stack| {
            let mut hs = hs_page.borrow_mut();
            hs.async_call_counter += 1;
            let command = AsyncCommand {
                call_id: hs.async_call_counter,
                action: crate::action::Action::PageUrl,
                params: serde_json::json!({}),
            };
            hs.pending_async_command = Some(command);
            stack.clear();
            Ok(CallbackReturn::Yield {
                to_thread: None,
                then: None,
            })
        });
        page_table.set_field(ctx, "url", cb);
        crate::lua_api_doc!(
        namespace: "page",
        name: "url",
        action: "page_url",
        doc: "Get the current page URL.",
        params: [
        ],
        returns: "string" => "Current URL",
        );
    }

    // page.title() — async
    {
        let hs_page = host_state.clone();
        let cb = Callback::from_fn(&ctx, move |_ctx, _exec, mut stack| {
            let mut hs = hs_page.borrow_mut();
            hs.async_call_counter += 1;
            let command = AsyncCommand {
                call_id: hs.async_call_counter,
                action: crate::action::Action::PageTitle,
                params: serde_json::json!({}),
            };
            hs.pending_async_command = Some(command);
            stack.clear();
            Ok(CallbackReturn::Yield {
                to_thread: None,
                then: None,
            })
        });
        page_table.set_field(ctx, "title", cb);
        crate::lua_api_doc!(
        namespace: "page",
        name: "title",
        action: "page_title",
        doc: "Get the current page title.",
        params: [
        ],
        returns: "string" => "Current page title",
        );
    }

    // page.screenshot() — async
    {
        let hs_page = host_state.clone();
        let cb = Callback::from_fn(&ctx, move |_ctx, _exec, mut stack| {
            let mut hs = hs_page.borrow_mut();
            hs.async_call_counter += 1;
            let command = AsyncCommand {
                call_id: hs.async_call_counter,
                action: crate::action::Action::PageScreenshot,
                params: serde_json::json!({}),
            };
            hs.pending_async_command = Some(command);
            stack.clear();
            Ok(CallbackReturn::Yield {
                to_thread: None,
                then: None,
            })
        });
        page_table.set_field(ctx, "screenshot", cb);
        crate::lua_api_doc!(
        namespace: "page",
        name: "screenshot",
        action: "page_screenshot",
        doc: "Take a screenshot of the current page.",
        params: [
        ],
        returns: "string" => "Base64-encoded screenshot image",
        );
    }

    // page.goto(url) — async
    {
        let hs_page = host_state.clone();
        let cb = Callback::from_fn(&ctx, move |ctx, _exec, mut stack| {
            let url = if !stack.is_empty() {
                match stack.get(0) {
                    Value::String(s) => String::from_utf8_lossy(s.as_bytes()).to_string(),
                    other => format_value(ctx, other),
                }
            } else {
                return Err("page.goto requires a URL argument".into_value(ctx).into());
            };
            let params = serde_json::json!({ "url": url });
            let _validated: crate::command_params::PageGotoParams =
                match serde_json::from_value(params.clone()) {
                    Ok(v) => v,
                    Err(e) => {
                        let msg = format!("Invalid page_goto params built from Lua: {}", e);
                        return Err(msg.into_value(ctx).into());
                    }
                };

            let mut hs = hs_page.borrow_mut();
            hs.async_call_counter += 1;
            let command = AsyncCommand {
                call_id: hs.async_call_counter,
                action: crate::action::Action::PageGoto,
                params,
            };
            hs.pending_async_command = Some(command);
            stack.clear();
            Ok(CallbackReturn::Yield {
                to_thread: None,
                then: None,
            })
        });
        page_table.set_field(ctx, "goto", cb);
        crate::lua_api_doc!(
        namespace: "page",
        name: "goto",
        action: "page_goto",
        doc: "Navigate to a URL.",
        params: [
        url: "string", required, "URL to navigate to",
        ],
        returns: "nil" => "None",
        );
    }

    // page.back() — async
    {
        let hs_page = host_state.clone();
        let cb = Callback::from_fn(&ctx, move |_ctx, _exec, mut stack| {
            let mut hs = hs_page.borrow_mut();
            hs.async_call_counter += 1;
            let command = AsyncCommand {
                call_id: hs.async_call_counter,
                action: crate::action::Action::PageBack,
                params: serde_json::json!({}),
            };
            hs.pending_async_command = Some(command);
            stack.clear();
            Ok(CallbackReturn::Yield {
                to_thread: None,
                then: None,
            })
        });
        page_table.set_field(ctx, "back", cb);
        crate::lua_api_doc!(
        namespace: "page",
        name: "back",
        action: "page_back",
        doc: "Navigate back in history.",
        params: [
        ],
        returns: "nil" => "None",
        );
    }

    // page.forward() — async
    {
        let hs_page = host_state.clone();
        let cb = Callback::from_fn(&ctx, move |_ctx, _exec, mut stack| {
            let mut hs = hs_page.borrow_mut();
            hs.async_call_counter += 1;
            let command = AsyncCommand {
                call_id: hs.async_call_counter,
                action: crate::action::Action::PageForward,
                params: serde_json::json!({}),
            };
            hs.pending_async_command = Some(command);
            stack.clear();
            Ok(CallbackReturn::Yield {
                to_thread: None,
                then: None,
            })
        });
        page_table.set_field(ctx, "forward", cb);
        crate::lua_api_doc!(
        namespace: "page",
        name: "forward",
        action: "page_forward",
        doc: "Navigate forward in history.",
        params: [
        ],
        returns: "nil" => "None",
        );
    }

    // page.reload() — async
    {
        let hs_page = host_state.clone();
        let cb = Callback::from_fn(&ctx, move |_ctx, _exec, mut stack| {
            let mut hs = hs_page.borrow_mut();
            hs.async_call_counter += 1;
            let command = AsyncCommand {
                call_id: hs.async_call_counter,
                action: crate::action::Action::PageReload,
                params: serde_json::json!({}),
            };
            hs.pending_async_command = Some(command);
            stack.clear();
            Ok(CallbackReturn::Yield {
                to_thread: None,
                then: None,
            })
        });
        page_table.set_field(ctx, "reload", cb);
        crate::lua_api_doc!(
        namespace: "page",
        name: "reload",
        action: "page_reload",
        doc: "Reload the current page.",
        params: [
        ],
        returns: "nil" => "None",
        );
    }

    // page.wait(ms) — async
    {
        let hs_page = host_state.clone();
        let cb = Callback::from_fn(&ctx, move |ctx, _exec, mut stack| {
            let ms = if !stack.is_empty() {
                match stack.get(0) {
                    Value::Integer(i) => i as u64,
                    Value::Number(f) => f as u64,
                    _ => 1000,
                }
            } else {
                1000
            };
            let params = serde_json::json!({ "ms": ms });
            let _validated: crate::command_params::PageWaitParams =
                match serde_json::from_value(params.clone()) {
                    Ok(v) => v,
                    Err(e) => {
                        let msg = format!("Invalid page_wait params built from Lua: {}", e);
                        return Err(msg.into_value(ctx).into());
                    }
                };

            let mut hs = hs_page.borrow_mut();
            hs.async_call_counter += 1;
            let command = AsyncCommand {
                call_id: hs.async_call_counter,
                action: crate::action::Action::PageWait,
                params,
            };
            hs.pending_async_command = Some(command);
            stack.clear();
            Ok(CallbackReturn::Yield {
                to_thread: None,
                then: None,
            })
        });
        page_table.set_field(ctx, "wait", cb);
        crate::lua_api_doc!(
        namespace: "page",
        name: "wait",
        action: "page_wait",
        doc: "Wait for a duration.",
        params: [
        ms: "number", optional, "Milliseconds to wait (default 1000)",
        ],
        returns: "nil" => "None",
        );
    }

    // page.tabs() — async (extension mode)
    {
        let hs_page = host_state.clone();
        let cb = Callback::from_fn(&ctx, move |_ctx, _exec, mut stack| {
            let mut hs = hs_page.borrow_mut();
            hs.async_call_counter += 1;
            let command = AsyncCommand {
                call_id: hs.async_call_counter,
                action: crate::action::Action::PageTabs,
                params: serde_json::json!({}),
            };
            hs.pending_async_command = Some(command);
            stack.clear();
            Ok(CallbackReturn::Yield {
                to_thread: None,
                then: None,
            })
        });
        page_table.set_field(ctx, "tabs", cb);
        crate::lua_api_doc!(
        namespace: "page",
        name: "tabs",
        action: "page_tabs",
        doc: "Get all tabs in the current window (extension mode).",
        params: [
        ],
        returns: "table" => "Array of tab objects",
        );
    }

    // page.switch(tabId) — async
    {
        let hs_page = host_state.clone();
        let cb = Callback::from_fn(&ctx, move |ctx, _exec, mut stack| {
            let tab_id = if !stack.is_empty() {
                match stack.get(0) {
                    Value::Integer(i) => i as f64,
                    Value::Number(f) => f,
                    other => {
                        let msg = format!(
                            "page.switch expects tabId (number), got {}",
                            other.type_name()
                        );
                        return Err(msg.into_value(ctx).into());
                    }
                }
            } else {
                return Err("page.switch requires a tabId argument"
                    .into_value(ctx)
                    .into());
            };
            let mut hs = hs_page.borrow_mut();
            hs.async_call_counter += 1;
            let command = AsyncCommand {
                call_id: hs.async_call_counter,
                action: crate::action::Action::PageSwitch,
                params: serde_json::json!({ "tabId": tab_id }),
            };
            hs.pending_async_command = Some(command);
            stack.clear();
            Ok(CallbackReturn::Yield {
                to_thread: None,
                then: None,
            })
        });
        page_table.set_field(ctx, "switch", cb);
        crate::lua_api_doc!(
        namespace: "page",
        name: "switch",
        action: "page_switch",
        doc: "Switch to a tab by ID.",
        params: [
        tab_id: "number", required, "Tab ID to switch to",
        ],
        returns: "nil" => "None",
        );
    }

    // page.new_tab(url?) — async
    {
        let hs_page = host_state.clone();
        let cb = Callback::from_fn(&ctx, move |_ctx, _exec, mut stack| {
            let url = if !stack.is_empty() {
                match stack.get(0) {
                    Value::String(s) => Some(String::from_utf8_lossy(s.as_bytes()).to_string()),
                    Value::Nil => None,
                    _ => None,
                }
            } else {
                None
            };
            let mut hs = hs_page.borrow_mut();
            hs.async_call_counter += 1;
            let command = AsyncCommand {
                call_id: hs.async_call_counter,
                action: crate::action::Action::PageNewTab,
                params: serde_json::json!({ "url": url }),
            };
            hs.pending_async_command = Some(command);
            stack.clear();
            Ok(CallbackReturn::Yield {
                to_thread: None,
                then: None,
            })
        });
        page_table.set_field(ctx, "new_tab", cb);
        crate::lua_api_doc!(
        namespace: "page",
        name: "new_tab",
        action: "page_new_tab",
        doc: "Open a new tab (optionally with a URL).",
        params: [
        url: "string | nil", optional, "URL to open in the new tab",
        ],
        returns: "table" => "Created tab object",
        );
    }

    // page.close(tabId) — async
    {
        let hs_page = host_state.clone();
        let cb = Callback::from_fn(&ctx, move |ctx, _exec, mut stack| {
            let tab_id = if !stack.is_empty() {
                match stack.get(0) {
                    Value::Integer(i) => i as f64,
                    Value::Number(f) => f,
                    other => {
                        let msg = format!(
                            "page.close expects tabId (number), got {}",
                            other.type_name()
                        );
                        return Err(msg.into_value(ctx).into());
                    }
                }
            } else {
                return Err("page.close requires a tabId argument"
                    .into_value(ctx)
                    .into());
            };
            let mut hs = hs_page.borrow_mut();
            hs.async_call_counter += 1;
            let command = AsyncCommand {
                call_id: hs.async_call_counter,
                action: crate::action::Action::PageClose,
                params: serde_json::json!({ "tabId": tab_id }),
            };
            hs.pending_async_command = Some(command);
            stack.clear();
            Ok(CallbackReturn::Yield {
                to_thread: None,
                then: None,
            })
        });
        page_table.set_field(ctx, "close", cb);
        crate::lua_api_doc!(
        namespace: "page",
        name: "close",
        action: "page_close",
        doc: "Close a tab by ID.",
        params: [
        tab_id: "number", required, "Tab ID to close",
        ],
        returns: "boolean" => "Whether close succeeded",
        );
    }

    // page.active_tab() — async
    {
        let hs_page = host_state.clone();
        let cb = Callback::from_fn(&ctx, move |_ctx, _exec, mut stack| {
            let mut hs = hs_page.borrow_mut();
            hs.async_call_counter += 1;
            let command = AsyncCommand {
                call_id: hs.async_call_counter,
                action: crate::action::Action::PageActiveTab,
                params: serde_json::json!({}),
            };
            hs.pending_async_command = Some(command);
            stack.clear();
            Ok(CallbackReturn::Yield {
                to_thread: None,
                then: None,
            })
        });
        page_table.set_field(ctx, "active_tab", cb);
        crate::lua_api_doc!(
        namespace: "page",
        name: "active_tab",
        action: "page_active_tab",
        doc: "Get the currently active tab ID.",
        params: [
        ],
        returns: "number | nil" => "Active tab ID or nil",
        );
    }

    ctx.set_global("page", page_table);

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

    host_table.set_field(ctx, "call", host_call_cb);
    crate::lua_api_doc!(
    namespace: "host",
    name: "call",
    action: "host_call",
    doc: "Call a registered host handler by name.",
    params: [
    action: "string", required, "Handler action name",
    params: "table | nil", optional, "Parameters to pass to handler",
    ],
    returns: "any" => "Handler response",
    );
    ctx.set_global("host", host_table);

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
                    let mut ki = 1;
                    for entry in t.iter() {
                        let (k, _) = entry;
                        let key_str = match k {
                            Value::Integer(i) => i.to_string(),
                            Value::String(s) => String::from_utf8_lossy(s.as_bytes()).to_string(),
                            other => format!("{:?}", other),
                        };
                        keys_table
                            .set(ctx, ki, LuaString::from_slice(&ctx, key_str.as_bytes()))
                            .unwrap();
                        ki += 1;
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

    runtime_table.set_field(ctx, "inspect", inspect_cb);
    crate::lua_api_doc!(
    namespace: "runtime",
    name: "inspect",
    action: "runtime_inspect",
    doc: "Inspect all global variables in the Lua state.",
    params: [
    ],
    returns: "table" => "Array of global variable descriptors: name, type, keys, value",
    );
    ctx.set_global("runtime", runtime_table);
}
