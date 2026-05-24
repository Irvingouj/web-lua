use crate::json::lua_value_to_json;
use crate::state::HostState;
use crate::types::{AsyncCommand, AsyncError, AsyncResponse, CellError};
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
        let label = if stack.len() > 0 {
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
            action: "mock_async".to_string(),
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

    // web.fetch(url [, opts]) — async HTTP request
    let hs_fetch = host_state.clone();
    let fetch_cb = Callback::from_fn(&ctx, move |ctx, _exec, mut stack| {
        let url = if stack.len() > 0 {
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

        let mut hs = hs_fetch.borrow_mut();
        hs.async_call_counter += 1;
        let call_id = hs.async_call_counter;
        let command = AsyncCommand {
            call_id,
            action: "fetch".to_string(),
            params: serde_json::json!({
                "url": url,
                "method": method,
                "headers": headers,
                "body": body,
                "timeout": timeout,
            }),
        };
        hs.pending_async_command = Some(command);

        stack.clear();
        Ok(CallbackReturn::Yield {
            to_thread: None,
            then: None,
        })
    });

    web_table.set_field(ctx, "fetch", fetch_cb);

    // ── web.url.parse(url_string) → table ──
    let url_table = Table::new(&ctx);

    let url_parse_cb = Callback::from_fn(&ctx, move |ctx, _exec, mut stack| {
        let url_str = if stack.len() > 0 {
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

    // ── web.url.encode(params_table) → string ──
    let url_encode_cb = Callback::from_fn(&ctx, move |ctx, _exec, mut stack| {
        let params = if stack.len() > 0 {
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

    // ── web.sleep(ms) — async, yields to worker ──
    let hs_sleep = host_state.clone();
    let sleep_cb = Callback::from_fn(&ctx, move |ctx, _exec, mut stack| {
        let duration = if stack.len() > 0 {
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

        let mut hs = hs_sleep.borrow_mut();
        hs.async_call_counter += 1;
        let call_id = hs.async_call_counter;
        let command = AsyncCommand {
            call_id,
            action: "sleep".to_string(),
            params: serde_json::json!({ "duration": duration }),
        };
        hs.pending_async_command = Some(command);

        stack.clear();
        Ok(CallbackReturn::Yield {
            to_thread: None,
            then: None,
        })
    });

    web_table.set_field(ctx, "sleep", sleep_cb);

    // ── web.storage sub-module ──
    let storage_table = Table::new(&ctx);

    // Helper: create a storage async callback
    let make_storage_cb = |action: &'static str,
                           hs_storage: Rc<RefCell<HostState>>|
     -> Callback<'_> {
        Callback::from_fn(&ctx, move |ctx, _exec, mut stack| {
            let params = match action {
                "storage_get" => {
                    let key = if stack.len() > 0 {
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
                    let key = if stack.len() > 0 {
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
                    let key = if stack.len() > 0 {
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

            let mut hs = hs_storage.borrow_mut();
            hs.async_call_counter += 1;
            let call_id = hs.async_call_counter;
            let command = AsyncCommand {
                call_id,
                action: action.to_string(),
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

    let storage_set_cb = make_storage_cb("storage_set", host_state.clone());
    storage_table.set_field(ctx, "set", storage_set_cb);

    let storage_delete_cb = make_storage_cb("storage_delete", host_state.clone());
    storage_table.set_field(ctx, "delete", storage_delete_cb);

    let storage_list_cb = make_storage_cb("storage_list", host_state.clone());
    storage_table.set_field(ctx, "list", storage_list_cb);

    web_table.set_field(ctx, "storage", storage_table);

    // ── Browser Extension APIs ──
    // These yield commands to the worker, which checks if running in extension context.
    // We create a macro-like pattern to register multiple APIs with minimal boilerplate.

    macro_rules! register_ext_api {
        ($table:expr, $method:expr, $action:expr, $hs:expr) => {
            let hs_ext = $hs.clone();
            let cb = Callback::from_fn(&ctx, move |ctx, _exec, mut stack| {
                let params = if stack.len() == 0 {
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
                    action: $action.to_string(),
                    params,
                };
                hs.pending_async_command = Some(command);

                stack.clear();
                Ok(CallbackReturn::Yield {
                    to_thread: None,
                    then: None,
                })
            });
            $table.set_field(ctx, $method, cb);
        };
    }

    // web.tab sub-module
    let tab_table = Table::new(&ctx);
    register_ext_api!(tab_table, "query", "tab_query", host_state);
    register_ext_api!(tab_table, "create", "tab_create", host_state);
    register_ext_api!(tab_table, "activate", "tab_activate", host_state);
    register_ext_api!(tab_table, "close", "tab_close", host_state);
    register_ext_api!(
        tab_table,
        "execute_script",
        "tab_execute_script",
        host_state
    );
    web_table.set_field(ctx, "tab", tab_table);

    // web.cookies sub-module
    let cookies_table = Table::new(&ctx);
    register_ext_api!(cookies_table, "get", "cookies_get", host_state);
    register_ext_api!(cookies_table, "set", "cookies_set", host_state);
    register_ext_api!(cookies_table, "delete", "cookies_delete", host_state);
    register_ext_api!(cookies_table, "list", "cookies_list", host_state);
    web_table.set_field(ctx, "cookies", cookies_table);

    // web.history sub-module
    let history_table = Table::new(&ctx);
    register_ext_api!(history_table, "search", "history_search", host_state);
    register_ext_api!(history_table, "delete", "history_delete", host_state);
    web_table.set_field(ctx, "history", history_table);

    // web.bookmarks sub-module
    let bookmarks_table = Table::new(&ctx);
    register_ext_api!(bookmarks_table, "search", "bookmarks_search", host_state);
    register_ext_api!(bookmarks_table, "create", "bookmarks_create", host_state);
    register_ext_api!(bookmarks_table, "delete", "bookmarks_delete", host_state);
    web_table.set_field(ctx, "bookmarks", bookmarks_table);

    // web.notifications sub-module
    let notifications_table = Table::new(&ctx);
    register_ext_api!(
        notifications_table,
        "create",
        "notifications_create",
        host_state
    );
    web_table.set_field(ctx, "notifications", notifications_table);

    // web.clipboard sub-module
    let clipboard_table = Table::new(&ctx);
    register_ext_api!(clipboard_table, "read", "clipboard_read", host_state);
    register_ext_api!(clipboard_table, "write", "clipboard_write", host_state);
    web_table.set_field(ctx, "clipboard", clipboard_table);

    ctx.set_global("web", web_table);

    // ── chrome module (browser extension APIs) ──
    let chrome_table = Table::new(&ctx);

    // chrome.runtime
    let runtime_table = Table::new(&ctx);
    register_ext_api!(
        runtime_table,
        "sendMessage",
        "chrome_runtime_sendMessage",
        host_state
    );
    chrome_table.set_field(ctx, "runtime", runtime_table);

    // chrome.tabs
    let tabs_table = Table::new(&ctx);
    register_ext_api!(tabs_table, "query", "chrome_tabs_query", host_state);
    register_ext_api!(tabs_table, "create", "chrome_tabs_create", host_state);
    register_ext_api!(tabs_table, "update", "chrome_tabs_update", host_state);
    register_ext_api!(tabs_table, "remove", "chrome_tabs_remove", host_state);
    register_ext_api!(
        tabs_table,
        "sendMessage",
        "chrome_tabs_sendMessage",
        host_state
    );
    chrome_table.set_field(ctx, "tabs", tabs_table);

    // chrome.alarms
    let alarms_table = Table::new(&ctx);
    register_ext_api!(alarms_table, "create", "chrome_alarms_create", host_state);
    register_ext_api!(alarms_table, "clear", "chrome_alarms_clear", host_state);
    chrome_table.set_field(ctx, "alarms", alarms_table);

    // chrome.action
    let action_table = Table::new(&ctx);
    register_ext_api!(
        action_table,
        "setBadgeText",
        "chrome_action_setBadgeText",
        host_state
    );
    register_ext_api!(
        action_table,
        "setBadgeBackgroundColor",
        "chrome_action_setBadgeBackgroundColor",
        host_state
    );
    register_ext_api!(
        action_table,
        "setTitle",
        "chrome_action_setTitle",
        host_state
    );
    register_ext_api!(action_table, "setIcon", "chrome_action_setIcon", host_state);
    chrome_table.set_field(ctx, "action", action_table);

    // chrome.contextMenus
    let context_menus_table = Table::new(&ctx);
    register_ext_api!(
        context_menus_table,
        "create",
        "chrome_contextMenus_create",
        host_state
    );
    register_ext_api!(
        context_menus_table,
        "remove",
        "chrome_contextMenus_remove",
        host_state
    );
    chrome_table.set_field(ctx, "contextMenus", context_menus_table);

    // chrome.windows
    let windows_table = Table::new(&ctx);
    register_ext_api!(windows_table, "getAll", "chrome_windows_getAll", host_state);
    register_ext_api!(windows_table, "create", "chrome_windows_create", host_state);
    register_ext_api!(windows_table, "update", "chrome_windows_update", host_state);
    register_ext_api!(windows_table, "remove", "chrome_windows_remove", host_state);
    chrome_table.set_field(ctx, "windows", windows_table);

    // chrome.sidePanel
    let side_panel_table = Table::new(&ctx);
    register_ext_api!(
        side_panel_table,
        "setOptions",
        "chrome_sidePanel_setOptions",
        host_state
    );
    chrome_table.set_field(ctx, "sidePanel", side_panel_table);

    // chrome.cookies
    let cookies_table = Table::new(&ctx);
    register_ext_api!(cookies_table, "get", "chrome_cookies_get", host_state);
    register_ext_api!(cookies_table, "set", "chrome_cookies_set", host_state);
    register_ext_api!(cookies_table, "remove", "chrome_cookies_remove", host_state);
    register_ext_api!(cookies_table, "getAll", "chrome_cookies_getAll", host_state);
    chrome_table.set_field(ctx, "cookies", cookies_table);

    // chrome.bookmarks
    let bookmarks_table = Table::new(&ctx);
    register_ext_api!(
        bookmarks_table,
        "search",
        "chrome_bookmarks_search",
        host_state
    );
    register_ext_api!(
        bookmarks_table,
        "create",
        "chrome_bookmarks_create",
        host_state
    );
    register_ext_api!(
        bookmarks_table,
        "remove",
        "chrome_bookmarks_remove",
        host_state
    );
    chrome_table.set_field(ctx, "bookmarks", bookmarks_table);

    // chrome.history
    let history_table = Table::new(&ctx);
    register_ext_api!(history_table, "search", "chrome_history_search", host_state);
    register_ext_api!(
        history_table,
        "deleteUrl",
        "chrome_history_deleteUrl",
        host_state
    );
    chrome_table.set_field(ctx, "history", history_table);

    // chrome.notifications
    let notifications_table = Table::new(&ctx);
    register_ext_api!(
        notifications_table,
        "create",
        "chrome_notifications_create",
        host_state
    );
    register_ext_api!(
        notifications_table,
        "clear",
        "chrome_notifications_clear",
        host_state
    );
    chrome_table.set_field(ctx, "notifications", notifications_table);

    // chrome.scripting
    let scripting_table = Table::new(&ctx);
    register_ext_api!(
        scripting_table,
        "executeScript",
        "chrome_scripting_executeScript",
        host_state
    );
    chrome_table.set_field(ctx, "scripting", scripting_table);

    ctx.set_global("chrome", chrome_table);

    // ── dom module (DOM semantic tree snapshot via dom-semantic-tree) ──
    let dom_table = Table::new(&ctx);

    // dom.snapshot(opts?) — async, yields to main thread for DOM traversal
    {
        let hs_dom = host_state.clone();
        let dom_snapshot_cb = Callback::from_fn(&ctx, move |ctx, _exec, mut stack| {
            let params = if stack.len() == 0 {
                serde_json::json!({})
            } else {
                lua_value_to_json(ctx, stack.get(0)).unwrap_or(serde_json::Value::Null)
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
        dom_table.set_field(ctx, "snapshot", dom_snapshot_cb);
    }

    // dom.format(snapshot, format?) — async, relays to main thread for formatting
    {
        let hs_dom = host_state.clone();
        let dom_format_cb = Callback::from_fn(&ctx, move |ctx, _exec, mut stack| {
            if stack.len() < 1 {
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

            let mut hs = hs_dom.borrow_mut();
            hs.async_call_counter += 1;
            let call_id = hs.async_call_counter;
            let command = AsyncCommand {
                call_id,
                action: "dom_format".to_string(),
                params: serde_json::json!({
                    "snapshot": snapshot,
                    "format": format,
                }),
            };
            hs.pending_async_command = Some(command);

            stack.clear();
            Ok(CallbackReturn::Yield {
                to_thread: None,
                then: None,
            })
        });
        dom_table.set_field(ctx, "format", dom_format_cb);
    }

    ctx.set_global("dom", dom_table);

    // ── page module (Agent API: snapshot + element actions + navigation) ──
    let page_table = Table::new(&ctx);

    // page.snapshot(opts?) — async, yields "page_snapshot"
    {
        let hs_page = host_state.clone();
        let cb = Callback::from_fn(&ctx, move |ctx, _exec, mut stack| {
            let params = if stack.len() == 0 {
                serde_json::json!({})
            } else {
                lua_value_to_json(ctx, stack.get(0)).unwrap_or(serde_json::Value::Null)
            };
            let mut hs = hs_page.borrow_mut();
            hs.async_call_counter += 1;
            let command = AsyncCommand {
                call_id: hs.async_call_counter,
                action: "page_snapshot".to_string(),
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
    }

    // page.click(ref_id) — async
    {
        let hs_page = host_state.clone();
        let cb = Callback::from_fn(&ctx, move |ctx, _exec, mut stack| {
            let ref_id = if stack.len() > 0 {
                match stack.get(0) {
                    Value::String(s) => String::from_utf8_lossy(s.as_bytes()).to_string(),
                    other => format_value(ctx, other),
                }
            } else {
                return Err("page.click requires a ref_id argument"
                    .into_value(ctx)
                    .into());
            };
            let mut hs = hs_page.borrow_mut();
            hs.async_call_counter += 1;
            let command = AsyncCommand {
                call_id: hs.async_call_counter,
                action: "page_click".to_string(),
                params: serde_json::json!({ "refId": ref_id }),
            };
            hs.pending_async_command = Some(command);
            stack.clear();
            Ok(CallbackReturn::Yield {
                to_thread: None,
                then: None,
            })
        });
        page_table.set_field(ctx, "click", cb);
    }

    // page.dblclick(ref_id) — async
    {
        let hs_page = host_state.clone();
        let cb = Callback::from_fn(&ctx, move |ctx, _exec, mut stack| {
            let ref_id = if stack.len() > 0 {
                match stack.get(0) {
                    Value::String(s) => String::from_utf8_lossy(s.as_bytes()).to_string(),
                    other => format_value(ctx, other),
                }
            } else {
                return Err("page.dblclick requires a ref_id argument"
                    .into_value(ctx)
                    .into());
            };
            let mut hs = hs_page.borrow_mut();
            hs.async_call_counter += 1;
            let command = AsyncCommand {
                call_id: hs.async_call_counter,
                action: "page_dblclick".to_string(),
                params: serde_json::json!({ "refId": ref_id }),
            };
            hs.pending_async_command = Some(command);
            stack.clear();
            Ok(CallbackReturn::Yield {
                to_thread: None,
                then: None,
            })
        });
        page_table.set_field(ctx, "dblclick", cb);
    }

    // page.fill(ref_id, value) — async
    {
        let hs_page = host_state.clone();
        let cb = Callback::from_fn(&ctx, move |ctx, _exec, mut stack| {
            let ref_id = if stack.len() > 0 {
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
            let mut hs = hs_page.borrow_mut();
            hs.async_call_counter += 1;
            let command = AsyncCommand {
                call_id: hs.async_call_counter,
                action: "page_fill".to_string(),
                params: serde_json::json!({ "refId": ref_id, "value": value }),
            };
            hs.pending_async_command = Some(command);
            stack.clear();
            Ok(CallbackReturn::Yield {
                to_thread: None,
                then: None,
            })
        });
        page_table.set_field(ctx, "fill", cb);
    }

    // page.type(ref_id, text) — async (append text)
    {
        let hs_page = host_state.clone();
        let cb = Callback::from_fn(&ctx, move |ctx, _exec, mut stack| {
            let ref_id = if stack.len() > 0 {
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
            let mut hs = hs_page.borrow_mut();
            hs.async_call_counter += 1;
            let command = AsyncCommand {
                call_id: hs.async_call_counter,
                action: "page_type".to_string(),
                params: serde_json::json!({ "refId": ref_id, "text": text }),
            };
            hs.pending_async_command = Some(command);
            stack.clear();
            Ok(CallbackReturn::Yield {
                to_thread: None,
                then: None,
            })
        });
        page_table.set_field(ctx, "type", cb);
    }

    // page.press(key) — async
    {
        let hs_page = host_state.clone();
        let cb = Callback::from_fn(&ctx, move |ctx, _exec, mut stack| {
            let key = if stack.len() > 0 {
                match stack.get(0) {
                    Value::String(s) => String::from_utf8_lossy(s.as_bytes()).to_string(),
                    other => format_value(ctx, other),
                }
            } else {
                return Err("page.press requires a key argument".into_value(ctx).into());
            };
            let mut hs = hs_page.borrow_mut();
            hs.async_call_counter += 1;
            let command = AsyncCommand {
                call_id: hs.async_call_counter,
                action: "page_press".to_string(),
                params: serde_json::json!({ "key": key }),
            };
            hs.pending_async_command = Some(command);
            stack.clear();
            Ok(CallbackReturn::Yield {
                to_thread: None,
                then: None,
            })
        });
        page_table.set_field(ctx, "press", cb);
    }

    // page.select(ref_id, value) — async
    {
        let hs_page = host_state.clone();
        let cb = Callback::from_fn(&ctx, move |ctx, _exec, mut stack| {
            let ref_id = if stack.len() > 0 {
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
            let mut hs = hs_page.borrow_mut();
            hs.async_call_counter += 1;
            let command = AsyncCommand {
                call_id: hs.async_call_counter,
                action: "page_select".to_string(),
                params: serde_json::json!({ "refId": ref_id, "value": value }),
            };
            hs.pending_async_command = Some(command);
            stack.clear();
            Ok(CallbackReturn::Yield {
                to_thread: None,
                then: None,
            })
        });
        page_table.set_field(ctx, "select", cb);
    }

    // page.check(ref_id, checked?) — async
    {
        let hs_page = host_state.clone();
        let cb = Callback::from_fn(&ctx, move |ctx, _exec, mut stack| {
            let ref_id = if stack.len() > 0 {
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
            let mut hs = hs_page.borrow_mut();
            hs.async_call_counter += 1;
            let command = AsyncCommand {
                call_id: hs.async_call_counter,
                action: "page_check".to_string(),
                params: serde_json::json!({ "refId": ref_id, "checked": checked }),
            };
            hs.pending_async_command = Some(command);
            stack.clear();
            Ok(CallbackReturn::Yield {
                to_thread: None,
                then: None,
            })
        });
        page_table.set_field(ctx, "check", cb);
    }

    // page.hover(ref_id) — async
    {
        let hs_page = host_state.clone();
        let cb = Callback::from_fn(&ctx, move |ctx, _exec, mut stack| {
            let ref_id = if stack.len() > 0 {
                match stack.get(0) {
                    Value::String(s) => String::from_utf8_lossy(s.as_bytes()).to_string(),
                    other => format_value(ctx, other),
                }
            } else {
                return Err("page.hover requires a ref_id argument"
                    .into_value(ctx)
                    .into());
            };
            let mut hs = hs_page.borrow_mut();
            hs.async_call_counter += 1;
            let command = AsyncCommand {
                call_id: hs.async_call_counter,
                action: "page_hover".to_string(),
                params: serde_json::json!({ "refId": ref_id }),
            };
            hs.pending_async_command = Some(command);
            stack.clear();
            Ok(CallbackReturn::Yield {
                to_thread: None,
                then: None,
            })
        });
        page_table.set_field(ctx, "hover", cb);
    }

    // page.unhover() — async
    {
        let hs_page = host_state.clone();
        let cb = Callback::from_fn(&ctx, move |ctx, _exec, mut stack| {
            let mut hs = hs_page.borrow_mut();
            hs.async_call_counter += 1;
            let command = AsyncCommand {
                call_id: hs.async_call_counter,
                action: "page_unhover".to_string(),
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
    }

    // page.scroll(direction, amount) — async
    {
        let hs_page = host_state.clone();
        let cb = Callback::from_fn(&ctx, move |ctx, _exec, mut stack| {
            let direction = if stack.len() > 0 {
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
            let mut hs = hs_page.borrow_mut();
            hs.async_call_counter += 1;
            let command = AsyncCommand {
                call_id: hs.async_call_counter,
                action: "page_scroll".to_string(),
                params: serde_json::json!({ "direction": direction, "amount": amount }),
            };
            hs.pending_async_command = Some(command);
            stack.clear();
            Ok(CallbackReturn::Yield {
                to_thread: None,
                then: None,
            })
        });
        page_table.set_field(ctx, "scroll", cb);
    }

    // page.scroll_to(ref_id) — async
    {
        let hs_page = host_state.clone();
        let cb = Callback::from_fn(&ctx, move |ctx, _exec, mut stack| {
            let ref_id = if stack.len() > 0 {
                match stack.get(0) {
                    Value::String(s) => String::from_utf8_lossy(s.as_bytes()).to_string(),
                    other => format_value(ctx, other),
                }
            } else {
                return Err("page.scroll_to requires a ref_id argument"
                    .into_value(ctx)
                    .into());
            };
            let mut hs = hs_page.borrow_mut();
            hs.async_call_counter += 1;
            let command = AsyncCommand {
                call_id: hs.async_call_counter,
                action: "page_scroll_to".to_string(),
                params: serde_json::json!({ "refId": ref_id }),
            };
            hs.pending_async_command = Some(command);
            stack.clear();
            Ok(CallbackReturn::Yield {
                to_thread: None,
                then: None,
            })
        });
        page_table.set_field(ctx, "scroll_to", cb);
    }

    // page.url() — async
    {
        let hs_page = host_state.clone();
        let cb = Callback::from_fn(&ctx, move |ctx, _exec, mut stack| {
            let mut hs = hs_page.borrow_mut();
            hs.async_call_counter += 1;
            let command = AsyncCommand {
                call_id: hs.async_call_counter,
                action: "page_url".to_string(),
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
    }

    // page.title() — async
    {
        let hs_page = host_state.clone();
        let cb = Callback::from_fn(&ctx, move |ctx, _exec, mut stack| {
            let mut hs = hs_page.borrow_mut();
            hs.async_call_counter += 1;
            let command = AsyncCommand {
                call_id: hs.async_call_counter,
                action: "page_title".to_string(),
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
    }

    // page.screenshot() — async
    {
        let hs_page = host_state.clone();
        let cb = Callback::from_fn(&ctx, move |ctx, _exec, mut stack| {
            let mut hs = hs_page.borrow_mut();
            hs.async_call_counter += 1;
            let command = AsyncCommand {
                call_id: hs.async_call_counter,
                action: "page_screenshot".to_string(),
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
    }

    // page.goto(url) — async
    {
        let hs_page = host_state.clone();
        let cb = Callback::from_fn(&ctx, move |ctx, _exec, mut stack| {
            let url = if stack.len() > 0 {
                match stack.get(0) {
                    Value::String(s) => String::from_utf8_lossy(s.as_bytes()).to_string(),
                    other => format_value(ctx, other),
                }
            } else {
                return Err("page.goto requires a URL argument".into_value(ctx).into());
            };
            let mut hs = hs_page.borrow_mut();
            hs.async_call_counter += 1;
            let command = AsyncCommand {
                call_id: hs.async_call_counter,
                action: "page_goto".to_string(),
                params: serde_json::json!({ "url": url }),
            };
            hs.pending_async_command = Some(command);
            stack.clear();
            Ok(CallbackReturn::Yield {
                to_thread: None,
                then: None,
            })
        });
        page_table.set_field(ctx, "goto", cb);
    }

    // page.back() — async
    {
        let hs_page = host_state.clone();
        let cb = Callback::from_fn(&ctx, move |ctx, _exec, mut stack| {
            let mut hs = hs_page.borrow_mut();
            hs.async_call_counter += 1;
            let command = AsyncCommand {
                call_id: hs.async_call_counter,
                action: "page_back".to_string(),
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
    }

    // page.forward() — async
    {
        let hs_page = host_state.clone();
        let cb = Callback::from_fn(&ctx, move |ctx, _exec, mut stack| {
            let mut hs = hs_page.borrow_mut();
            hs.async_call_counter += 1;
            let command = AsyncCommand {
                call_id: hs.async_call_counter,
                action: "page_forward".to_string(),
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
    }

    // page.reload() — async
    {
        let hs_page = host_state.clone();
        let cb = Callback::from_fn(&ctx, move |ctx, _exec, mut stack| {
            let mut hs = hs_page.borrow_mut();
            hs.async_call_counter += 1;
            let command = AsyncCommand {
                call_id: hs.async_call_counter,
                action: "page_reload".to_string(),
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
    }

    // page.wait(ms) — async
    {
        let hs_page = host_state.clone();
        let cb = Callback::from_fn(&ctx, move |ctx, _exec, mut stack| {
            let ms = if stack.len() > 0 {
                match stack.get(0) {
                    Value::Integer(i) => i as u64,
                    Value::Number(f) => f as u64,
                    _ => 1000,
                }
            } else {
                1000
            };
            let mut hs = hs_page.borrow_mut();
            hs.async_call_counter += 1;
            let command = AsyncCommand {
                call_id: hs.async_call_counter,
                action: "page_wait".to_string(),
                params: serde_json::json!({ "ms": ms }),
            };
            hs.pending_async_command = Some(command);
            stack.clear();
            Ok(CallbackReturn::Yield {
                to_thread: None,
                then: None,
            })
        });
        page_table.set_field(ctx, "wait", cb);
    }

    // page.tabs() — async (extension mode)
    {
        let hs_page = host_state.clone();
        let cb = Callback::from_fn(&ctx, move |ctx, _exec, mut stack| {
            let mut hs = hs_page.borrow_mut();
            hs.async_call_counter += 1;
            let command = AsyncCommand {
                call_id: hs.async_call_counter,
                action: "page_tabs".to_string(),
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
    }

    // page.switch(tabId) — async
    {
        let hs_page = host_state.clone();
        let cb = Callback::from_fn(&ctx, move |ctx, _exec, mut stack| {
            let tab_id = if stack.len() > 0 {
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
                action: "page_switch".to_string(),
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
    }

    // page.new_tab(url?) — async
    {
        let hs_page = host_state.clone();
        let cb = Callback::from_fn(&ctx, move |ctx, _exec, mut stack| {
            let url = if stack.len() > 0 {
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
                action: "page_new_tab".to_string(),
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
    }

    // page.close(tabId) — async
    {
        let hs_page = host_state.clone();
        let cb = Callback::from_fn(&ctx, move |ctx, _exec, mut stack| {
            let tab_id = if stack.len() > 0 {
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
                action: "page_close".to_string(),
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
    }

    // page.active_tab() — async
    {
        let hs_page = host_state.clone();
        let cb = Callback::from_fn(&ctx, move |ctx, _exec, mut stack| {
            let mut hs = hs_page.borrow_mut();
            hs.async_call_counter += 1;
            let command = AsyncCommand {
                call_id: hs.async_call_counter,
                action: "page_active_tab".to_string(),
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
    }

    ctx.set_global("page", page_table);

    // ── host.call(action, params) — generic async bridge for JS handlers ──
    let hs_host = host_state.clone();
    let host_table = Table::new(&ctx);

    let host_call_cb = Callback::from_fn(&ctx, move |ctx, _exec, mut stack| {
        let action = if stack.len() > 0 {
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
            action: format!("host_{}", action),
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
    ctx.set_global("runtime", runtime_table);
}
