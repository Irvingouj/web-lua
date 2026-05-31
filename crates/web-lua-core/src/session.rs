use crate::globals::{disable_dangerous_globals, register_host_globals};
use crate::json::json_value_to_lua;
use crate::plugin::LuaPlugin;
use crate::state::HostState;
use crate::types::{
    AsyncCommand, AsyncResponse, CellError, CellStatus, GlobalVariable, GlobalsSnapshot, RunResult,
};
use crate::utils::{classify_extern_error, clean_error_message, extract_line_number, format_value};
use piccolo::{Closure, Executor, ExecutorMode, Fuel, IntoValue, Lua, StashedExecutor, Value};
use std::cell::{Cell, RefCell};
use std::rc::Rc;

// ─── Session Builder ────────────────────────────────────────────

/// Builder for creating a [`NotebookSession`] with custom configuration.
///
/// # Example
///
/// ```rust,ignore
/// let session = NotebookSession::build()
///     .fuel_limit(4096)
///     .plugin(Box::new(MyPlugin))
///     .lua_library("utils", "function utils.id(x) return x end")
///     .finish();
/// ```
pub struct SessionBuilder {
    fuel_limit: i32,
    plugins: Vec<Box<dyn LuaPlugin>>,
    lua_libraries: Vec<(String, String)>,
}

impl Default for SessionBuilder {
    fn default() -> Self {
        Self {
            fuel_limit: 1_000_000,
            plugins: Vec::new(),
            lua_libraries: Vec::new(),
        }
    }
}

impl SessionBuilder {
    /// Set the fuel limit for execution.
    pub fn fuel_limit(mut self, limit: i32) -> Self {
        self.fuel_limit = limit;
        self
    }

    /// Register a Rust plugin.
    pub fn plugin(mut self, plugin: Box<dyn LuaPlugin>) -> Self {
        self.plugins.push(plugin);
        self
    }

    /// Register a pure Lua library by source code.
    /// The code will be executed during session initialization.
    /// Any globals defined become available to subsequent cells.
    pub fn lua_library(mut self, name: &str, source: &str) -> Self {
        self.lua_libraries
            .push((name.to_string(), source.to_string()));
        self
    }

    /// Build the session with the configured options.
    pub fn finish(self) -> NotebookSession {
        let fuel_limit = self.fuel_limit;
        let mut lua = Lua::core();
        let host_state = Rc::new(RefCell::new(HostState::default()));
        let cancelled = Rc::new(Cell::new(false));

        lua.enter(|ctx| {
            register_host_globals(ctx, host_state.clone());
            disable_dangerous_globals(ctx);

            // Register Rust plugins
            for plugin in &self.plugins {
                plugin.register(ctx, host_state.clone());
            }
        });

        let mut session = NotebookSession {
            lua,
            executor: None,
            execution_count: 0,
            fuel_limit,
            host_state,
            cancelled,
        };

        // Load Lua libraries (needs run_cell, so after session creation)
        for (_name, source) in &self.lua_libraries {
            let result = session.run_cell(source, "");
            // If a library fails to load, that's a programming error.
            // We silently continue — the cell error will surface when the
            // user tries to use the library.
            let _ = result;
        }

        // Reset execution count after library loading so user cells start at 1
        session.execution_count = 0;

        session
    }
}

// ─── NotebookSession ────────────────────────────────────────────

/// A persistent Lua notebook session using piccolo.
pub struct NotebookSession {
    lua: Lua,
    executor: Option<StashedExecutor>,
    execution_count: u32,
    fuel_limit: i32,
    host_state: Rc<RefCell<HostState>>,
    cancelled: Rc<Cell<bool>>,
}

impl Default for NotebookSession {
    fn default() -> Self {
        Self::new()
    }
}

impl NotebookSession {
    /// Create a new notebook session with a fresh Lua state.
    pub fn new() -> Self {
        Self::build().finish()
    }

    /// Create a new notebook session with a custom fuel limit.
    pub fn with_fuel_limit(fuel_limit: i32) -> Self {
        Self::build().fuel_limit(fuel_limit).finish()
    }

    /// Start building a session with custom configuration.
    pub fn build() -> SessionBuilder {
        SessionBuilder::default()
    }

    /// Set the fuel limit for execution.
    pub fn set_fuel_limit(&mut self, limit: i32) {
        self.fuel_limit = limit;
    }

    /// Cancel the current execution.
    pub fn cancel(&mut self) {
        self.cancelled.set(true);
    }

    fn is_cancelled(&self) -> bool {
        self.cancelled.get()
    }

    /// Inspect all global variables in the current Lua state.
    /// Returns a snapshot of variable names, types, values, and table keys.
    pub fn inspect_globals(&mut self) -> GlobalsSnapshot {
        let exec_count = self.execution_count;
        let mut variables = Vec::new();

        self.lua.enter(|ctx| {
            let globals = ctx.globals();
            // Collect entries first (can't hold references across operations)
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
                    Value::Integer(_) => "number",
                    Value::Number(_) => "number",
                    Value::String(_) => "string",
                    Value::Table(_) => "table",
                    Value::Function(_) => "function",
                    Value::Thread(_) => "thread",
                    _ => "unknown",
                };

                let (value, keys) = if type_name == "table" {
                    if let Value::Table(t) = val {
                        // Collect table keys for inspection
                        let mut table_keys: Vec<String> = Vec::new();
                        let mut next_int: i64 = 1;
                        for entry in t.iter() {
                            let (k, _) = entry;
                            match k {
                                Value::Integer(i) => {
                                    if i == next_int {
                                        table_keys.push(i.to_string());
                                        next_int += 1;
                                    } else {
                                        table_keys.push(format!("[{}]", i));
                                    }
                                }
                                Value::String(s) => {
                                    table_keys
                                        .push(String::from_utf8_lossy(s.as_bytes()).to_string());
                                }
                                _ => {
                                    table_keys.push(format!("{:?}", k));
                                }
                            }
                        }
                        // Don't include raw value for tables (too large)
                        (None, Some(table_keys))
                    } else {
                        (None, None)
                    }
                } else if type_name == "function" {
                    // Don't try to stringify functions
                    (None, None)
                } else {
                    // For primitives, include the value
                    let formatted = match val {
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
                            let s = String::from_utf8_lossy(s.as_bytes()).to_string();
                            // Truncate long strings
                            if s.len() > 200 {
                                format!("{}...", &s[..200])
                            } else {
                                s
                            }
                        }
                        _ => format!("{:?}", val),
                    };
                    (Some(formatted), None)
                };

                variables.push(GlobalVariable {
                    name,
                    type_name: type_name.to_string(),
                    value,
                    keys,
                });
            }
        });

        // Sort by name for stable output
        variables.sort_by(|a, b| a.name.cmp(&b.name));

        GlobalsSnapshot {
            variables,
            execution_count: exec_count,
        }
    }

    /// Reset the session, clearing all Lua state.
    pub fn reset(&mut self) {
        self.lua = Lua::core();
        self.executor = None;
        self.execution_count = 0;
        self.cancelled.set(false);
        self.host_state = Rc::new(RefCell::new(HostState::default()));

        self.lua.enter(|ctx| {
            register_host_globals(ctx, self.host_state.clone());
            disable_dangerous_globals(ctx);
        });
    }

    /// Restore a pending async command that was yielded but not yet resolved.
    /// Used when the host (e.g. WASM) handles some async calls itself and wants
    /// to pass the rest back to JS.
    pub fn restore_pending_command(&mut self, cmd: AsyncCommand) {
        self.host_state.borrow_mut().pending_async_command = Some(cmd);
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
            hs.cell_errors.clear();
        }

        self.execution_count += 1;
        let exec_count = self.execution_count;

        // ── Phase 1: Compile ───────────────────────────────────
        let stashed_exec = match self.lua.try_enter(|ctx| {
            let env = ctx.globals();
            let closure = Closure::load_with_env(ctx, None, code.as_bytes(), env)?;
            let executor = Executor::start(ctx, closure.into(), ());
            Ok(ctx.stash(executor))
        }) {
            Ok(e) => e,
            Err(extern_error) => {
                return RunResult::err(classify_extern_error(&extern_error), exec_count);
            }
        };

        self.executor = Some(stashed_exec);

        // ── Phase 2: Execute with fuel limiting ────────────────
        let executor_ref = self.executor.as_ref().unwrap();
        loop {
            let mut fuel = Fuel::with(self.fuel_limit);
            let done = match self
                .lua
                .try_enter(|ctx| Ok(ctx.fetch(executor_ref).step(ctx, &mut fuel)))
            {
                Ok(Ok(d)) => d,
                Ok(Err(bad_thread)) => {
                    // Executor hit a bad thread mode — this is an internal error
                    let hs = self.host_state.borrow();
                    return RunResult::with_partial_output(
                        hs.stdout.clone(),
                        hs.stderr.clone(),
                        hs.commands.clone(),
                        CellError::Internal {
                            message: format!("{}", bad_thread),
                        },
                        false,
                        exec_count,
                    );
                }
                Err(extern_error) => {
                    // Runtime error from the executor
                    let hs = self.host_state.borrow();
                    // Check if host callbacks recorded a structured error
                    if let Some(cell_err) = hs.cell_errors.first().cloned() {
                        return RunResult::with_partial_output(
                            hs.stdout.clone(),
                            hs.stderr.clone(),
                            hs.commands.clone(),
                            cell_err,
                            false,
                            exec_count,
                        );
                    }
                    return RunResult::with_partial_output(
                        hs.stdout.clone(),
                        hs.stderr.clone(),
                        hs.commands.clone(),
                        classify_extern_error(&extern_error),
                        false,
                        exec_count,
                    );
                }
            };

            if self.is_cancelled() {
                let hs = self.host_state.borrow();
                return RunResult::with_partial_output(
                    hs.stdout.clone(),
                    hs.stderr.clone(),
                    hs.commands.clone(),
                    CellError::Cancelled,
                    false,
                    exec_count,
                );
            }

            if done {
                // Check if this is a yield or real completion
                // A callback can yield by returning CallbackReturn::Yield.
                // Check for a pending async command to distinguish yield from normal completion.
                let _mode = self
                    .lua
                    .try_enter(|ctx| Ok(ctx.fetch(executor_ref).mode()))
                    .unwrap_or(ExecutorMode::Stopped);
                let has_pending = self.host_state.borrow().pending_async_command.is_some();
                if has_pending {
                    let mut hs = self.host_state.borrow_mut();
                    let cmd = hs.pending_async_command.take().unwrap();
                    let stdout_so_far = hs.stdout.clone();
                    return RunResult::async_pending(stdout_so_far, cmd, exec_count);
                }
                break;
            }

            // Fuel was exhausted but there's more work to do
            if !fuel.should_continue() {
                self.host_state.borrow_mut().fuel_exhausted = true;
                break;
            }
        }

        // ── Phase 3: Collect result ────────────────────────────
        let (result_str, lua_error) = self
            .lua
            .try_enter(|ctx| {
                let exec = ctx.fetch(executor_ref);
                match exec.take_result::<Value>(ctx) {
                    Ok(Ok(value)) => {
                        if matches!(value, Value::Nil) {
                            Ok((None, None))
                        } else {
                            Ok((Some(format_value(ctx, value)), None))
                        }
                    }
                    Ok(Err(lua_err)) => {
                        let msg = format!("{}", lua_err);
                        Ok((None, Some(msg)))
                    }
                    Err(_bad_mode) => Ok((None, None)),
                }
            })
            .ok()
            .unwrap_or((None, None));

        if let Some(err_msg) = lua_error {
            let line = extract_line_number(&err_msg);
            self.host_state
                .borrow_mut()
                .cell_errors
                .push(CellError::Runtime {
                    message: clean_error_message(&err_msg),
                    line,
                });
        }

        // ── Phase 4: Build result ──────────────────────────────
        let hs = self.host_state.borrow();
        let error = if hs.fuel_exhausted {
            Some(CellError::FuelExhausted)
        } else {
            hs.cell_errors.first().cloned()
        };

        RunResult {
            stdout: hs.stdout.clone(),
            stderr: hs.stderr.clone(),
            result: result_str,
            error,
            commands: hs.commands.clone(),
            fuel_exhausted: hs.fuel_exhausted,
            execution_count: exec_count,
            status: CellStatus::Done,
            pending_command: None,
        }
    }

    /// Resume a yielded cell with an async response.
    pub fn resume_cell(&mut self, result_json: &str) -> RunResult {
        let exec_count = self.execution_count;
        let executor_ref = match self.executor.as_ref() {
            Some(e) => e,
            None => {
                return RunResult::err(
                    CellError::Internal {
                        message: "No active executor to resume".into(),
                    },
                    exec_count,
                );
            }
        };

        // Parse the async response
        let response: AsyncResponse = match serde_json::from_str(result_json) {
            Ok(r) => r,
            Err(e) => {
                return RunResult::err(
                    CellError::Internal {
                        message: format!("Invalid async response JSON: {}", e),
                    },
                    exec_count,
                );
            }
        };

        // Clear the pending command
        self.host_state.borrow_mut().pending_async_command = None;

        // First, take_result to clear the Result mode → Suspended mode
        self.lua.enter(|ctx| {
            let exec = ctx.fetch(executor_ref);
            let _ = exec.take_result::<Vec<Value>>(ctx);
        });

        // Now resume the executor (it's in Suspended mode)
        let resume_result = if response.ok {
            // Resume with value
            self.lua.try_enter(|ctx| {
                let exec = ctx.fetch(executor_ref);
                let val = json_value_to_lua(
                    ctx,
                    response.value.as_ref().unwrap_or(&serde_json::Value::Null),
                );
                Ok(exec.resume(ctx, val)?)
            })
        } else {
            // Resume with error
            self.lua.enter(|ctx| {
                let exec = ctx.fetch(executor_ref);
                let err_msg = response
                    .error
                    .as_ref()
                    .map(|e| e.message.clone())
                    .unwrap_or_else(|| "unknown async error".into());
                exec.resume_err(&ctx, err_msg.into_value(ctx).into())
                    .unwrap();
            });
            Ok(())
        };

        if let Err(bad_mode) = resume_result {
            return RunResult::err(
                CellError::Internal {
                    message: format!("Failed to resume executor: {:?}", bad_mode),
                },
                exec_count,
            );
        }

        // Continue the fuel loop (same as run_cell Phase 2)
        loop {
            let mut fuel = Fuel::with(self.fuel_limit);
            let done = match self
                .lua
                .try_enter(|ctx| Ok(ctx.fetch(executor_ref).step(ctx, &mut fuel)))
            {
                Ok(Ok(d)) => d,
                Ok(Err(bad_thread)) => {
                    let hs = self.host_state.borrow();
                    return RunResult::with_partial_output(
                        hs.stdout.clone(),
                        hs.stderr.clone(),
                        hs.commands.clone(),
                        CellError::Internal {
                            message: format!("{}", bad_thread),
                        },
                        false,
                        exec_count,
                    );
                }
                Err(extern_error) => {
                    let hs = self.host_state.borrow();
                    if let Some(cell_err) = hs.cell_errors.first().cloned() {
                        return RunResult::with_partial_output(
                            hs.stdout.clone(),
                            hs.stderr.clone(),
                            hs.commands.clone(),
                            cell_err,
                            false,
                            exec_count,
                        );
                    }
                    return RunResult::with_partial_output(
                        hs.stdout.clone(),
                        hs.stderr.clone(),
                        hs.commands.clone(),
                        classify_extern_error(&extern_error),
                        false,
                        exec_count,
                    );
                }
            };

            if self.is_cancelled() {
                let hs = self.host_state.borrow();
                return RunResult::with_partial_output(
                    hs.stdout.clone(),
                    hs.stderr.clone(),
                    hs.commands.clone(),
                    CellError::Cancelled,
                    false,
                    exec_count,
                );
            }

            if done {
                // Check for pending async command (yield)
                let has_pending = self.host_state.borrow().pending_async_command.is_some();
                if has_pending {
                    let mut hs = self.host_state.borrow_mut();
                    let cmd = hs.pending_async_command.take().unwrap();
                    let stdout_so_far = hs.stdout.clone();
                    return RunResult::async_pending(stdout_so_far, cmd, exec_count);
                }
                break;
            }

            if !fuel.should_continue() {
                self.host_state.borrow_mut().fuel_exhausted = true;
                break;
            }
        }

        // Build final result
        let (result_str, lua_error) = self
            .lua
            .try_enter(|ctx| {
                let exec = ctx.fetch(executor_ref);
                match exec.take_result::<Value>(ctx) {
                    Ok(Ok(value)) => {
                        if matches!(value, Value::Nil) {
                            Ok((None, None))
                        } else {
                            Ok((Some(format_value(ctx, value)), None))
                        }
                    }
                    Ok(Err(lua_err)) => {
                        let msg = format!("{}", lua_err);
                        Ok((None, Some(msg)))
                    }
                    Err(_bad_mode) => Ok((None, None)),
                }
            })
            .ok()
            .unwrap_or((None, None));

        if let Some(err_msg) = lua_error {
            let line = extract_line_number(&err_msg);
            self.host_state
                .borrow_mut()
                .cell_errors
                .push(CellError::Runtime {
                    message: clean_error_message(&err_msg),
                    line,
                });
        }

        let hs = self.host_state.borrow();
        let error = if hs.fuel_exhausted {
            Some(CellError::FuelExhausted)
        } else {
            hs.cell_errors.first().cloned()
        };

        RunResult {
            stdout: hs.stdout.clone(),
            stderr: hs.stderr.clone(),
            result: result_str,
            error,
            commands: hs.commands.clone(),
            fuel_exhausted: hs.fuel_exhausted,
            execution_count: exec_count,
            status: CellStatus::Done,
            pending_command: None,
        }
    }

    /// Get the current execution count.
    pub fn execution_count(&self) -> u32 {
        self.execution_count
    }

    /// Execute a callback with access to the Lua context and host state.
    pub fn with_lua<F>(&mut self, f: F)
    where
        F: FnOnce(piccolo::Context, Rc<RefCell<HostState>>),
    {
        let host_state = self.host_state.clone();
        self.lua.enter(|ctx| {
            f(ctx, host_state);
        });
    }
}
