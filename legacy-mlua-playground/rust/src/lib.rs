use mlua::{Lua, LuaOptions, MultiValue, StdLib, Value};
use serde::Serialize;
use std::ffi::{CStr, CString};
use std::os::raw::c_char;
use std::sync::{Arc, Mutex};

// ── JSON result returned to JS ───────────────────────────────────────

#[derive(Serialize)]
struct RunResult {
    stdout: Vec<String>,
    stderr: Vec<String>,
    result: Option<String>,
    error: Option<String>,
}

// ── Shared mutable state for a single run ────────────────────────────

struct RunState {
    stdout: Vec<String>,
    stderr: Vec<String>,
    stdin_full: String,
    stdin_lines: Vec<String>,
    stdin_index: usize,
}

impl RunState {
    fn new(stdin: &str) -> Self {
        Self {
            stdout: Vec::new(),
            stderr: Vec::new(),
            stdin_full: stdin.to_string(),
            stdin_lines: stdin.lines().map(|l| l.to_string()).collect(),
            stdin_index: 0,
        }
    }
}

// ── Value → human-readable string ────────────────────────────────────

fn value_to_string(val: &Value) -> String {
    match val {
        Value::Nil => "nil".into(),
        Value::Boolean(b) => b.to_string(),
        Value::Integer(i) => i.to_string(),
        Value::Number(n) => {
            // Match Lua convention: floats always show a decimal point
            let s = n.to_string();
            if !s.contains('.') {
                format!("{}.0", s)
            } else {
                s
            }
        }
        Value::String(s) => match s.to_str() {
            Ok(v) => v.to_string(),
            Err(_) => "<invalid utf8>".to_string(),
        },
        Value::Table(t) => {
            // Best-effort table representation
            let mut parts: Vec<String> = Vec::new();
            let mut _is_array = true;
            let mut idx = 1;
            for pair in t.clone().sequence_values::<Value>() {
                match pair {
                    Ok(v) => {
                        parts.push(value_to_string(&v));
                        idx += 1;
                    }
                    Err(_) => {
                        _is_array = false;
                        break;
                    }
                }
            }
            // Also show non-integer keys
            for pair in t.clone().pairs::<Value, Value>() {
                if let Ok((k, v)) = pair {
                    if let Value::Integer(i) = &k {
                        if *i >= 1 && *i < idx {
                            continue; // already shown as array element
                        }
                    }
                    parts.push(format!("{}={}", value_to_string(&k), value_to_string(&v)));
                }
            }
            if parts.is_empty() {
                "table: {}".into()
            } else {
                format!("table: {{{}}}", parts.join(", "))
            }
        }
        Value::Function(_) => "function".into(),
        Value::Thread(_) => "thread".into(),
        Value::UserData(_) => "userdata".into(),
        Value::LightUserData(_) => "lightuserdata".into(),
        Value::Error(e) => format!("error: {}", e),
        _ => format!("{:?}", val),
    }
}

// ── Core execution ───────────────────────────────────────────────────

fn run_lua_inner(code: &str, stdin_text: &str) -> RunResult {
    let state = Arc::new(Mutex::new(RunState::new(stdin_text)));

    // Create a fresh Lua state with only safe standard libraries.
    // We load: table, string, math, coroutine, utf8 — but NOT io, os, package, debug.
    let lua = match Lua::new_with(
        StdLib::TABLE | StdLib::STRING | StdLib::MATH | StdLib::COROUTINE | StdLib::UTF8,
        LuaOptions::default(),
    ) {
        Ok(l) => l,
        Err(e) => {
            return RunResult {
                stdout: vec![],
                stderr: vec![format!("Failed to create Lua state: {}", e)],
                result: None,
                error: Some(format!("Failed to create Lua state: {}", e)),
            };
        }
    };

    // ── Custom globals ──────────────────────────────────────────────

    let globals = lua.globals();

    // print(...)
    {
        let st = state.clone();
        let print_fn = lua
            .create_function(move |_lua, args: MultiValue| {
                let parts: Vec<String> = args.into_iter().map(|v| value_to_string(&v)).collect();
                let line = parts.join("\t");
                st.lock().unwrap().stdout.push(line);
                Ok(())
            })
            .expect("create print");
        globals.set("print", print_fn).expect("set print");
    }

    // input() → full stdin string
    {
        let st = state.clone();
        let input_fn = lua
            .create_function(move |_lua, ()| {
                let s = st.lock().unwrap().stdin_full.clone();
                Ok(s)
            })
            .expect("create input");
        globals.set("input", input_fn).expect("set input");
    }

    // read() → next line from stdin, empty string when exhausted
    {
        let st = state.clone();
        let read_fn = lua
            .create_function(move |_lua, ()| {
                let mut guard = st.lock().unwrap();
                if guard.stdin_index < guard.stdin_lines.len() {
                    let line = guard.stdin_lines[guard.stdin_index].clone();
                    guard.stdin_index += 1;
                    Ok(line)
                } else {
                    Ok(String::new())
                }
            })
            .expect("create read");
        globals.set("read", read_fn).expect("set read");
    }

    // emit(value)
    {
        let st = state.clone();
        let emit_fn = lua
            .create_function(move |_lua, val: Value| {
                st.lock().unwrap().stdout.push(value_to_string(&val));
                Ok(())
            })
            .expect("create emit");
        globals.set("emit", emit_fn).expect("set emit");
    }

    // ── Disable dangerous globals ───────────────────────────────────
    // Even though we didn't load io/os/debug/package, belt-and-suspenders:
    for name in &[
        "io", "os", "debug", "package", "require", "loadfile", "dofile", "collectgarbage",
    ] {
        let _ = globals.set(*name, Value::Nil);
    }

    // ── Execute user code ───────────────────────────────────────────
    let exec_result: Result<Value, mlua::Error> = lua.load(code).eval::<Value>();

    let guard = state.lock().unwrap();
    match exec_result {
        Ok(val) => {
            let result_str = match &val {
                Value::Nil => None,
                other => Some(value_to_string(other)),
            };
            RunResult {
                stdout: guard.stdout.clone(),
                stderr: guard.stderr.clone(),
                result: result_str,
                error: None,
            }
        }
        Err(e) => RunResult {
            stdout: guard.stdout.clone(),
            stderr: guard.stderr.clone(),
            result: None,
            error: Some(format!("{}", e)),
        },
    }
}

// ── C ABI entry point ────────────────────────────────────────────────

#[no_mangle]
pub extern "C" fn run_lua(code_ptr: *const c_char, stdin_ptr: *const c_char) -> *mut c_char {
    // Note: panic=abort is used, so catch_unwind is not available.
    // mlua handles Lua errors internally via longjmp; Rust panics in our
    // glue code should never happen for normal user input.
    let code = unsafe { CStr::from_ptr(code_ptr) }
        .to_string_lossy()
        .into_owned();
    let stdin_text = unsafe { CStr::from_ptr(stdin_ptr) }
        .to_string_lossy()
        .into_owned();

    let result = run_lua_inner(&code, &stdin_text);

    let json = serde_json::to_string(&result).unwrap_or_else(|_| {
        r#"{"stdout":[],"stderr":[],"result":null,"error":"JSON serialization failed"}"#.into()
    });

    // Caller (Emscripten glue) copies the bytes; we intentionally leak here.
    CString::into_raw(CString::new(json).expect("JSON should be valid CStr"))
}
