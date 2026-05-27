use crate::utils::{format_value, percent_encode};
use piccolo::{Callback, CallbackReturn, Context, IntoValue, Table, Value};

pub(crate) fn register<'a>(ctx: Context<'a>) -> Table<'a> {
    let _url_table = Table::new(&ctx);

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

    url_table
}
