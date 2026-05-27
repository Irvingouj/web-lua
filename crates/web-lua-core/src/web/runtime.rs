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
