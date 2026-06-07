use crate::state::HostState;
use crate::types::AsyncCommand;
use crate::utils::{format_value, percent_encode};
use piccolo::{Callback, CallbackReturn, Context, IntoValue, Table, Value};
use std::cell::RefCell;
use std::rc::Rc;

pub(crate) fn register<'a>(
    ctx: Context<'a>,
    web_table: &Table<'a>,
    host_state: Rc<RefCell<HostState>>,
) {
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

    lua_api_custom!(ctx, web_table, name: "mock_async", callback: mock_cb,

        namespace: "web",

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
                    let msg = crate::utils::format_param_error("web", "fetch", &e);
                    return Err(msg.into_value(ctx).into());
                }
            };

        let mut hs = hs_fetch.borrow_mut();
        hs.async_call_counter += 1;
        let call_id = hs.async_call_counter;
        let command = AsyncCommand {
            call_id,
            action: "fetch".to_string(),
            params,
        };
        hs.pending_async_command = Some(command);

        stack.clear();
        Ok(CallbackReturn::Yield {
            to_thread: None,
            then: None,
        })
    });

    lua_api_custom!(ctx, web_table, name: "fetch", callback: fetch_cb,

        namespace: "web",

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
        for (idx, (key, value)) in (1i64..).zip(parsed.query_pairs()) {
            let pair = Table::new(&ctx);
            pair.set_field(ctx, "key", ctx.intern(key.as_bytes()));
            pair.set_field(ctx, "value", ctx.intern(value.as_bytes()));
            query_table.set(ctx, idx, pair).unwrap();
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

    lua_api_custom!(ctx, url_table, name: "parse", callback: url_parse_cb,

        namespace: "web.url",

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

    lua_api_custom!(ctx, url_table, name: "encode", callback: url_encode_cb,

        namespace: "web.url",

        action: "url_encode",

        doc: "Encode a table into a query string.",

        params: [

        params: "table", required, "Key-value pairs to encode",

        ],

        returns: "string" => "URL-encoded query string",

    );
    crate::web::protector::protect_api_table(ctx, url_table, "web.url");
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

    lua_api_custom!(ctx, web_table, name: "log", callback: web_log_cb,

        namespace: "web",

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
                    let msg = crate::utils::format_param_error("web", "sleep", &e);
                    return Err(msg.into_value(ctx).into());
                }
            };

        let mut hs = hs_sleep.borrow_mut();
        hs.async_call_counter += 1;
        let call_id = hs.async_call_counter;
        let command = AsyncCommand {
            call_id,
            action: "sleep".to_string(),
            params,
        };
        hs.pending_async_command = Some(command);

        stack.clear();
        Ok(CallbackReturn::Yield {
            to_thread: None,
            then: None,
        })
    });

    lua_api_custom!(ctx, web_table, name: "sleep", callback: sleep_cb,

        namespace: "web",

        action: "sleep",

        doc: "Pause execution for a duration.",

        params: [

        ms: "number", optional, "Milliseconds to sleep (default 1000)",

        ],

        returns: "nil" => "None",

    );

    // web.fetch_dom(url, selector?) — async HTTP request + DOM parsing
    let hs_fetch_dom = host_state.clone();
    let fetch_dom_cb = Callback::from_fn(&ctx, move |ctx, _exec, mut stack| {
        let url = if !stack.is_empty() {
            match stack.get(0) {
                Value::String(s) => String::from_utf8_lossy(s.as_bytes()).to_string(),
                other => format_value(ctx, other),
            }
        } else {
            let msg = "web.fetch_dom requires at least a URL argument".to_string();
            return Err(msg.into_value(ctx).into());
        };

        let selector = if stack.len() > 1 {
            match stack.get(1) {
                Value::String(s) => String::from_utf8_lossy(s.as_bytes()).to_string(),
                _ => "".to_string(),
            }
        } else {
            "".to_string()
        };

        let max_text = if stack.len() > 2 {
            match stack.get(2) {
                Value::Integer(i) => i as u64,
                Value::Number(f) => f as u64,
                _ => 500,
            }
        } else {
            500
        };

        let params = serde_json::json!({
            "url": url,
            "selector": selector,
            "max_text": max_text,
        });
        let _validated: crate::command_params::FetchDomParams =
            match serde_json::from_value(params.clone()) {
                Ok(v) => v,
                Err(e) => {
                    let msg = crate::utils::format_param_error("web", "fetch_dom", &e);
                    return Err(msg.into_value(ctx).into());
                }
            };

        let mut hs = hs_fetch_dom.borrow_mut();
        hs.async_call_counter += 1;
        let call_id = hs.async_call_counter;
        let command = AsyncCommand {
            call_id,
            action: "fetch_dom".to_string(),
            params,
        };
        hs.pending_async_command = Some(command);

        stack.clear();
        Ok(CallbackReturn::Yield {
            to_thread: None,
            then: None,
        })
    });

    lua_api_custom!(ctx, web_table, name: "fetch_dom", callback: fetch_dom_cb,

        namespace: "web",

        action: "fetch_dom",

        doc: "Fetch a URL and parse the HTML into a queryable DOM.",

        params: [

        url: "string", required, "URL to fetch",

        selector: "string | nil", optional, "CSS selector to extract matching elements",

        ],

        returns: "table" => "{ status, ok, body, headers, matches }",

    );
}
