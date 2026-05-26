use crate::utils::format_value;
use piccolo::{Callback, CallbackReturn, Context, IntoValue, String as LuaString, Table, Value};

// ─── JSON Module ──────────────────────────────────────────────────

pub(crate) fn register_json_module(ctx: Context) {
    let json_table = Table::new(&ctx);

    // json.encode(table) → JSON string
    let encode_cb = Callback::from_fn(&ctx, move |ctx, _exec, mut stack| {
        let val = if !stack.is_empty() {
            stack.get(0)
        } else {
            Value::Nil
        };
        match lua_value_to_json(ctx, val) {
            Ok(json_val) => {
                let s = serde_json::to_string(&json_val)
                    .unwrap_or_else(|e| format!("encode error: {}", e));
                stack.clear();
                let ls = LuaString::from_slice(&ctx, s.as_bytes());
                stack.push_back(ls.into());
            }
            Err(msg) => {
                stack.clear();
                return Err(msg.into_value(ctx).into());
            }
        }
        Ok(CallbackReturn::Return)
    });

    // json.decode(string) → Lua table/value
    let decode_cb = Callback::from_fn(&ctx, move |ctx, _exec, mut stack| {
        let input = if !stack.is_empty() {
            match stack.get(0) {
                Value::String(s) => String::from_utf8_lossy(s.as_bytes()).to_string(),
                other => format_value(ctx, other).to_string(),
            }
        } else {
            String::new()
        };

        match serde_json::from_str::<serde_json::Value>(&input) {
            Ok(json_val) => {
                stack.clear();
                let lua_val = json_value_to_lua(ctx, &json_val);
                stack.push_back(lua_val);
            }
            Err(e) => {
                let msg = format!("json decode error: {}", e);
                stack.clear();
                return Err(msg.into_value(ctx).into());
            }
        }
        Ok(CallbackReturn::Return)
    });

    // json.pretty(table) → formatted JSON string
    let pretty_cb = Callback::from_fn(&ctx, move |ctx, _exec, mut stack| {
        let val = if !stack.is_empty() {
            stack.get(0)
        } else {
            Value::Nil
        };
        match lua_value_to_json(ctx, val) {
            Ok(json_val) => {
                let s = serde_json::to_string_pretty(&json_val)
                    .unwrap_or_else(|e| format!("encode error: {}", e));
                stack.clear();
                let ls = LuaString::from_slice(&ctx, s.as_bytes());
                stack.push_back(ls.into());
            }
            Err(msg) => {
                stack.clear();
                return Err(msg.into_value(ctx).into());
            }
        }
        Ok(CallbackReturn::Return)
    });

    json_table.set_field(ctx, "encode", encode_cb);
    json_table.set_field(ctx, "decode", decode_cb);
    json_table.set_field(ctx, "pretty", pretty_cb);
    ctx.set_global("json", json_table);
}

/// Convert a Lua Value to a serde_json::Value.
pub(crate) fn lua_value_to_json(ctx: Context, val: Value) -> Result<serde_json::Value, String> {
    match val {
        Value::Nil => Ok(serde_json::Value::Null),
        Value::Boolean(b) => Ok(serde_json::Value::Bool(b)),
        Value::Integer(i) => Ok(serde_json::json!(i)),
        Value::Number(f) => Ok(serde_json::json!(f)),
        Value::String(s) => {
            let text = String::from_utf8_lossy(s.as_bytes()).to_string();
            Ok(serde_json::Value::String(text))
        }
        Value::Table(t) => {
            // Determine if this is an array (sequence) or object (hash)
            // Heuristic: if it has consecutive integer keys starting from 1, it's an array
            let mut is_array = true;
            let mut arr_items: Vec<(usize, serde_json::Value)> = Vec::new();
            let mut obj_items: Vec<(String, serde_json::Value)> = Vec::new();

            let mut next_int_key: usize = 1;
            let mut found_int_keys = false;

            // Iterate all entries
            let mut raw_entries: Vec<(Value, Value)> = Vec::new();
            for entry in t.iter() {
                let (k, v) = entry;
                raw_entries.push((k, v));
            }

            for (k, v) in &raw_entries {
                match k {
                    Value::Integer(i) => {
                        let idx = *i as usize;
                        if idx >= 1 {
                            found_int_keys = true;
                            if idx == next_int_key {
                                next_int_key += 1;
                                arr_items.push((idx, lua_value_to_json(ctx, *v)?));
                            } else {
                                // Non-consecutive integer key — treat as object
                                is_array = false;
                                obj_items.push((format!("{}", i), lua_value_to_json(ctx, *v)?));
                            }
                        }
                    }
                    Value::String(s) => {
                        is_array = false;
                        let key = String::from_utf8_lossy(s.as_bytes()).to_string();
                        let json_val = lua_value_to_json(ctx, *v)?;
                        // Skip nil values (they're omitted from JSON objects)
                        if !json_val.is_null() {
                            obj_items.push((key, json_val));
                        }
                    }
                    _ => {
                        is_array = false;
                    }
                }
            }

            // If we have mixed integer and string keys, merge into object
            if !found_int_keys && obj_items.is_empty() && arr_items.is_empty() {
                // Empty table — represent as empty object
                return Ok(serde_json::json!({}));
            }

            if found_int_keys && is_array && obj_items.is_empty() {
                // Pure array
                let items: Vec<serde_json::Value> = arr_items.into_iter().map(|(_, v)| v).collect();
                Ok(serde_json::Value::Array(items))
            } else {
                // Object — merge all items
                let mut map = serde_json::Map::new();
                for (idx, v) in arr_items {
                    if !v.is_null() {
                        map.insert(format!("{}", idx), v);
                    }
                }
                for (k, v) in obj_items {
                    map.insert(k, v);
                }
                Ok(serde_json::Value::Object(map))
            }
        }
        _ => Err(format!(
            "cannot serialize {} to JSON",
            format_value(ctx, val)
        )),
    }
}

/// Convert a serde_json::Value to a Lua Value.
pub(crate) fn json_value_to_lua<'gc>(ctx: Context<'gc>, val: &serde_json::Value) -> Value<'gc> {
    match val {
        serde_json::Value::Null => Value::Nil,
        serde_json::Value::Bool(b) => Value::Boolean(*b),
        serde_json::Value::Number(n) => {
            if let Some(i) = n.as_i64() {
                Value::Integer(i)
            } else if let Some(f) = n.as_f64() {
                Value::Number(f)
            } else {
                Value::Number(0.0)
            }
        }
        serde_json::Value::String(s) => {
            let ls = LuaString::from_slice(&ctx, s.as_bytes());
            ls.into()
        }
        serde_json::Value::Array(arr) => {
            let t = Table::new(&ctx);
            for (i, item) in arr.iter().enumerate() {
                let key = Value::Integer((i + 1) as i64);
                let val = json_value_to_lua(ctx, item);
                let _ = t.set_raw(&ctx, key, val);
            }
            t.into()
        }
        serde_json::Value::Object(obj) => {
            let t = Table::new(&ctx);
            for (k, v) in obj {
                let key = LuaString::from_slice(&ctx, k.as_bytes());
                let val = json_value_to_lua(ctx, v);
                let _ = t.set_raw(&ctx, key.into(), val);
            }
            t.into()
        }
    }
}
