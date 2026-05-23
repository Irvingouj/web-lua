use std::cell::RefCell;
use std::rc::Rc;

use piccolo::{
    Callback, CallbackReturn, Closure, Context, Executor, Fuel, Lua, StashedExecutor,
    String as LuaString, Value,
};
use serde::{Deserialize, Serialize};

/// Result of running a single cell.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RunResult {
    pub stdout: Vec<String>,
    pub stderr: Vec<String>,
    pub result: Option<String>,
    pub error: Option<String>,
    pub commands: Vec<serde_json::Value>,
    pub fuel_exhausted: bool,
    pub execution_count: u32,
}

/// Internal state shared between Lua closures and the host.
#[derive(Debug, Default)]
struct HostState {
    stdout: Vec<String>,
    stderr: Vec<String>,
    commands: Vec<serde_json::Value>,
    stdin_lines: Vec<String>,
    stdin_cursor: usize,
    fuel_exhausted: bool,
}

/// A persistent Lua notebook session using piccolo.
pub struct NotebookSession {
    lua: Lua,
    executor: Option<StashedExecutor>,
    execution_count: u32,
    fuel_limit: i32,
    host_state: Rc<RefCell<HostState>>,
}

impl Default for NotebookSession {
    fn default() -> Self {
        Self::new()
    }
}

impl NotebookSession {
    /// Create a new notebook session with a fresh Lua state.
    pub fn new() -> Self {
        Self::with_fuel_limit(8192)
    }

    /// Create a new notebook session with a custom fuel limit.
    pub fn with_fuel_limit(fuel_limit: i32) -> Self {
        let mut lua = Lua::core();
        let host_state = Rc::new(RefCell::new(HostState::default()));

        // Register our custom host globals
        lua.enter(|ctx| {
            register_host_globals(ctx, host_state.clone());

            // Disable dangerous globals - set them to nil
            for name in &["io", "os", "debug", "package", "require", "dofile", "loadfile"] {
                ctx.set_global(*name, Value::Nil);
            }
        });

        Self {
            lua,
            executor: None,
            execution_count: 0,
            fuel_limit,
            host_state,
        }
    }

    /// Set the fuel limit for execution.
    pub fn set_fuel_limit(&mut self, limit: i32) {
        self.fuel_limit = limit;
    }

    /// Reset the session, clearing all Lua state.
    pub fn reset(&mut self) {
        self.lua = Lua::core();
        self.executor = None;
        self.execution_count = 0;
        self.host_state = Rc::new(RefCell::new(HostState::default()));

        self.lua.enter(|ctx| {
            register_host_globals(ctx, self.host_state.clone());
            for name in &["io", "os", "debug", "package", "require", "dofile", "loadfile"] {
                ctx.set_global(*name, Value::Nil);
            }
        });
    }

    /// Run a cell of code.
    pub fn run_cell(&mut self, code: &str, stdin: &str) -> RunResult {
        // Reset host state for this run
        let stdin_lines: Vec<String> = stdin.lines().map(|l| l.to_string()).collect();
        {
            let mut hs = self.host_state.borrow_mut();
            hs.stdout.clear();
            hs.stderr.clear();
            hs.commands.clear();
            hs.stdin_lines = stdin_lines;
            hs.stdin_cursor = 0;
            hs.fuel_exhausted = false;
        }

        self.execution_count += 1;
        let exec_count = self.execution_count;

        // Compile and run
        let stashed_exec = match self.lua.try_enter(|ctx| {
            let env = ctx.globals();
            let closure = Closure::load_with_env(ctx, None, code.as_bytes(), env)?;
            let executor = Executor::start(ctx, closure.into(), ());
            Ok(ctx.stash(executor))
        }) {
            Ok(e) => e,
            Err(e) => {
                return RunResult {
                    stdout: vec![],
                    stderr: vec![],
                    result: None,
                    error: Some(format!("{}", e)),
                    commands: vec![],
                    fuel_exhausted: false,
                    execution_count: exec_count,
                };
            }
        };

        self.executor = Some(stashed_exec);

        // Run to completion with fuel limiting
        let executor_ref = self.executor.as_ref().unwrap();
        loop {
            let mut fuel = Fuel::with(self.fuel_limit);
            let done = match self.lua.try_enter(|ctx| {
                Ok(ctx.fetch(executor_ref).step(ctx, &mut fuel))
            }) {
                Ok(Ok(d)) => d,
                Ok(Err(e)) => {
                    // BadThreadMode - executor finished with an error
                    let hs = self.host_state.borrow();
                    return RunResult {
                        stdout: hs.stdout.clone(),
                        stderr: hs.stderr.clone(),
                        result: None,
                        error: Some(format!("{}", e)),
                        commands: hs.commands.clone(),
                        fuel_exhausted: false,
                        execution_count: exec_count,
                    };
                }
                Err(e) => {
                    let hs = self.host_state.borrow();
                    return RunResult {
                        stdout: hs.stdout.clone(),
                        stderr: hs.stderr.clone(),
                        result: None,
                        error: Some(format!("{}", e)),
                        commands: hs.commands.clone(),
                        fuel_exhausted: false,
                        execution_count: exec_count,
                    };
                }
            };

            if done {
                break;
            }

            // Fuel was exhausted but there's more work
            if !fuel.should_continue() {
                self.host_state.borrow_mut().fuel_exhausted = true;
                break;
            }
        }

        // Get result
        let result_str = match self.lua.try_enter(|ctx| {
            let exec = ctx.fetch(executor_ref);
            match exec.take_result::<Vec<Value>>(ctx) {
                Ok(Ok(results)) => {
                    if results.is_empty() {
                        Ok(None)
                    } else {
                        Ok(Some(format_value(ctx, results[0])))
                    }
                }
                Ok(Err(_lua_err)) => Ok(None),
                Err(_bad_mode) => Ok(None),
            }
        }) {
            Ok(Some(s)) => Some(s),
            _ => None,
        };

        let hs = self.host_state.borrow();
        RunResult {
            stdout: hs.stdout.clone(),
            stderr: hs.stderr.clone(),
            result: result_str,
            error: None,
            commands: hs.commands.clone(),
            fuel_exhausted: hs.fuel_exhausted,
            execution_count: exec_count,
        }
    }

    /// Get the current execution count.
    pub fn execution_count(&self) -> u32 {
        self.execution_count
    }
}

fn format_value(_ctx: Context, value: Value) -> String {
    match value {
        Value::Nil => "nil".to_string(),
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
            let bytes = s.as_bytes();
            String::from_utf8_lossy(bytes).to_string()
        }
        Value::Table(_) => "table".to_string(),
        Value::Function(_) => "function".to_string(),
        Value::Thread(_) => "thread".to_string(),
        _ => format!("{:?}", value),
    }
}

fn register_host_globals(ctx: Context, host_state: Rc<RefCell<HostState>>) {
    // print(...) - appends formatted line to stdout
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

    // input() - returns full stdin string
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

    // read() - returns stdin one line at a time
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

    // emit(value) - appends a structured command/debug value
    let hs_emit = host_state.clone();
    let emit_cb = Callback::from_fn(&ctx, move |ctx, _exec, mut stack| {
        if stack.len() > 0 {
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
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_basic_print() {
        let mut session = NotebookSession::new();
        let result = session.run_cell("print(\"hello\")", "");
        assert_eq!(result.stdout, vec!["hello"]);
        assert!(result.error.is_none());
    }

    #[test]
    fn test_arithmetic() {
        let mut session = NotebookSession::new();
        let result = session.run_cell("print(1 + 2)", "");
        assert_eq!(result.stdout, vec!["3"]);
    }

    #[test]
    fn test_variable_persistence() {
        let mut session = NotebookSession::new();

        let r1 = session.run_cell("x = 10", "");
        assert!(r1.error.is_none());

        let r2 = session.run_cell("print(x + 1)", "");
        assert_eq!(r2.stdout, vec!["11"]);
    }

    #[test]
    fn test_function_and_recursion() {
        let mut session = NotebookSession::new();
        let code = r#"
            function fact(n)
                if n <= 1 then
                    return 1
                end
                return n * fact(n - 1)
            end
            print(fact(5))
        "#;
        let result = session.run_cell(code, "");
        assert_eq!(result.stdout, vec!["120"]);
    }

    #[test]
    fn test_while_loop() {
        let mut session = NotebookSession::new();
        let code = r#"
            i = 0
            while i < 3 do
                print(i)
                i = i + 1
            end
        "#;
        let result = session.run_cell(code, "");
        assert_eq!(result.stdout, vec!["0", "1", "2"]);
    }

    #[test]
    fn test_infinite_loop_fuel() {
        let mut session = NotebookSession::with_fuel_limit(500);
        let result = session.run_cell("while true do end", "");
        assert!(result.fuel_exhausted);
    }

    #[test]
    fn test_read_stdin() {
        let mut session = NotebookSession::new();
        let result = session.run_cell("print(read())\nprint(read())", "abc\ndef");
        assert_eq!(result.stdout, vec!["abc", "def"]);
    }

    #[test]
    fn test_input_stdin() {
        let mut session = NotebookSession::new();
        let result = session.run_cell("print(input())", "hello world");
        assert_eq!(result.stdout, vec!["hello world"]);
    }

    #[test]
    fn test_emit() {
        let mut session = NotebookSession::new();
        let result = session.run_cell("emit(\"hello\")", "");
        assert_eq!(result.commands.len(), 1);
        assert_eq!(result.commands[0]["args"]["value"], "hello");
    }

    #[test]
    fn test_cross_cell_state() {
        let mut session = NotebookSession::new();
        session.run_cell("x = 10", "");
        session.run_cell("function double(n) return n * 2 end", "");
        let r = session.run_cell("print(double(x))", "");
        assert_eq!(r.stdout, vec!["20"]);
    }

    #[test]
    fn test_reset_clears_state() {
        let mut session = NotebookSession::new();
        session.run_cell("x = 10", "");
        session.reset();
        let r = session.run_cell("print(x)", "");
        // x should be nil after reset
        assert_eq!(r.stdout, vec!["nil"]);
    }

    #[test]
    fn test_dangerous_globals_disabled() {
        let mut session = NotebookSession::new();
        let r = session.run_cell("print(os)", "");
        assert_eq!(r.stdout, vec!["nil"]);

        let r = session.run_cell("print(io)", "");
        assert_eq!(r.stdout, vec!["nil"]);

        let r = session.run_cell("print(debug)", "");
        assert_eq!(r.stdout, vec!["nil"]);
    }

    #[test]
    fn test_execution_count_increments() {
        let mut session = NotebookSession::new();
        assert_eq!(session.execution_count(), 0);
        session.run_cell("x = 1", "");
        assert_eq!(session.execution_count(), 1);
        session.run_cell("x = 2", "");
        assert_eq!(session.execution_count(), 2);
    }

    #[test]
    fn test_if_else() {
        let mut session = NotebookSession::new();
        let code = r#"
            x = 5
            if x > 3 then
                print("big")
            else
                print("small")
            end
        "#;
        let result = session.run_cell(code, "");
        assert_eq!(result.stdout, vec!["big"]);
    }

    #[test]
    fn test_table_basics() {
        let mut session = NotebookSession::new();
        let code = r#"
            t = {a = 1, b = 2}
            print(t.a)
            print(t.b)
        "#;
        let result = session.run_cell(code, "");
        assert_eq!(result.stdout, vec!["1", "2"]);
    }

    #[test]
    fn test_print_multiple_args() {
        let mut session = NotebookSession::new();
        let result = session.run_cell("print(1, 2, 3)", "");
        assert_eq!(result.stdout, vec!["1\t2\t3"]);
    }
}
