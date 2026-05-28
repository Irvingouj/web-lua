use crate::json::register_json_module;
use crate::state::HostState;
use crate::types::CellError;
use crate::utils::format_value;
use crate::web::register_web_module;
use piccolo::{Callback, CallbackReturn, Context, IntoValue, String as LuaString, Table, Value};
use std::cell::RefCell;
use std::collections::HashSet;
use std::rc::Rc;

// ─── Host Globals ───────────────────────────────────────────────

pub(crate) fn disable_dangerous_globals(ctx: Context) {
    for name in &[
        "io", "os", "debug", "package", "require", "dofile", "loadfile",
    ] {
        ctx.set_global(name, Value::Nil);
    }
}

pub(crate) fn register_host_globals(ctx: Context, host_state: Rc<RefCell<HostState>>) {
    // ── print(...) ────────────────────────────────────────────
    let hs_print = host_state.clone();
    let print_cb = Callback::from_fn(&ctx, move |ctx, _exec, mut stack| {
        let parts: Vec<String> = (0..stack.len())
            .map(|i| format_value(ctx, stack.get(i)))
            .collect();
        let line = parts.join("\t");
        hs_print.borrow_mut().stdout.push(line);
        stack.clear();
        Ok(CallbackReturn::Return)
    });
    ctx.set_global("print", print_cb);

    // ── input() ───────────────────────────────────────────────
    let hs_input = host_state.clone();
    let input_cb = Callback::from_fn(&ctx, move |ctx, _exec, mut stack| {
        let hs = hs_input.borrow();
        let full_stdin = hs.stdin_lines.join("\n");
        stack.clear();
        let s = LuaString::from_slice(&ctx, full_stdin.as_bytes());
        stack.push_back(s.into());
        Ok(CallbackReturn::Return)
    });
    ctx.set_global("input", input_cb);

    // ── read() ────────────────────────────────────────────────
    let hs_read = host_state.clone();
    let read_cb = Callback::from_fn(&ctx, move |ctx, _exec, mut stack| {
        let mut hs = hs_read.borrow_mut();
        if hs.stdin_cursor < hs.stdin_lines.len() {
            let line = hs.stdin_lines[hs.stdin_cursor].clone();
            hs.stdin_cursor += 1;
            stack.clear();
            let s = LuaString::from_slice(&ctx, line.as_bytes());
            stack.push_back(s.into());
        } else {
            stack.clear();
            stack.push_back(Value::Nil);
        }
        Ok(CallbackReturn::Return)
    });
    ctx.set_global("read", read_cb);

    // ── emit(value) ───────────────────────────────────────────
    let hs_emit = host_state.clone();
    let emit_cb = Callback::from_fn(&ctx, move |ctx, _exec, mut stack| {
        if !stack.is_empty() {
            let val = stack.get(0);
            let formatted = format_value(ctx, val);
            let cmd = serde_json::json!({
                "action": "emit",
                "args": { "value": formatted }
            });
            hs_emit.borrow_mut().commands.push(cmd);
        }
        stack.clear();
        Ok(CallbackReturn::Return)
    });
    ctx.set_global("emit", emit_cb);

    // ── json module ──────────────────────────────────────────
    register_json_module(ctx);

    // ── web module ───────────────────────────────────────────
    register_web_module(ctx, host_state.clone());

    // ── Strict mode ──────────────────────────────────────────
    setup_strict_mode(ctx, host_state.clone());
}

pub(crate) fn setup_strict_mode(ctx: Context, host_state: Rc<RefCell<HostState>>) {
    let declared: Rc<RefCell<HashSet<String>>> = Rc::new(RefCell::new(HashSet::from([
        // Host APIs
        "print".into(),
        "input".into(),
        "read".into(),
        "emit".into(),
        "json".into(),
        "web".into(),
        "chrome".into(),
        "host".into(),
        "dom".into(),
        "page".into(),
        "sidepanel".into(),
        "runtime".into(),
        "tab".into(),
        "fs".into(),
        "path".into(),
        "global".into(),
        // Stdlib functions
        "tostring".into(),
        "tonumber".into(),
        "type".into(),
        "pairs".into(),
        "ipairs".into(),
        "next".into(),
        "select".into(),
        "error".into(),
        "pcall".into(),
        "xpcall".into(),
        "rawget".into(),
        "rawset".into(),
        "rawequal".into(),
        "rawlen".into(),
        "setmetatable".into(),
        "getmetatable".into(),
        "assert".into(),
        "collectgarbage".into(),
        "require".into(),
        "unpack".into(),
        "load".into(),
        "dofile".into(),
        "loadfile".into(),
        // Stdlib tables
        "string".into(),
        "math".into(),
        "table".into(),
        "coroutine".into(),
        "utf8".into(),
        // Disabled globals (exist as nil, reading is allowed)
        "io".into(),
        "os".into(),
        "debug".into(),
        "package".into(),
        "_VERSION".into(),
        "_G".into(),
    ])));

    let globals = ctx.globals();
    let mt = Table::new(&ctx);

    // __newindex: record newly declared globals
    let declared_set = declared.clone();
    let newindex_cb = Callback::from_fn(&ctx, move |ctx, _exec, mut stack| {
        if stack.len() >= 3 {
            let key = stack.get(1);
            if let Value::String(s) = key {
                let name = String::from_utf8_lossy(s.as_bytes()).to_string();
                declared_set.borrow_mut().insert(name);
            }
            let table: Value = stack.get(0);
            let key: Value = stack.get(1);
            let val: Value = stack.get(2);
            if let Value::Table(t) = table {
                let _ = t.set_raw(&ctx, key, val);
            }
        }
        stack.clear();
        Ok(CallbackReturn::Return)
    });

    // __index: error on undeclared globals
    let declared_get = declared.clone();
    let hs_strict = host_state.clone();
    let index_cb = Callback::from_fn(&ctx, move |ctx, _exec, mut stack| {
        if stack.len() >= 2 {
            let key = stack.get(1);
            if let Value::String(s) = key {
                let name = String::from_utf8_lossy(s.as_bytes()).to_string();
                if !declared_get.borrow().contains(&name) {
                    hs_strict
                        .borrow_mut()
                        .cell_errors
                        .push(CellError::StrictMode {
                            variable: name.clone(),
                        });
                    let msg = format!("strict mode: undeclared variable '{}'", name);
                    return Err(msg.into_value(ctx).into());
                }
            }
            let table: Value = stack.get(0);
            let key_val: Value = stack.get(1);
            let result = if let Value::Table(t) = table {
                t.get_raw(key_val)
            } else {
                Value::Nil
            };
            stack.clear();
            stack.push_back(result);
        }
        Ok(CallbackReturn::Return)
    });

    mt.set_field(ctx, "__index", index_cb);
    mt.set_field(ctx, "__newindex", newindex_cb);
    globals.set_metatable(&ctx, Some(mt));
}
