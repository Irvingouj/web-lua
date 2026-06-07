use serde::{Deserialize, Serialize};
use tsify::Tsify;

// ─── Typed wrapper types for WASM ABI ───────────────────────────
// These mirror the core types but derive Tsify so wasm-bindgen
// emits proper TypeScript interfaces in the .d.ts output.

/// Status of a cell execution.
#[derive(Debug, Clone, PartialEq, Serialize, Tsify)]
#[tsify(into_wasm_abi)]
#[serde(rename_all = "snake_case")]
pub enum WasmCellStatus {
    Done,
    AsyncPending,
}

/// Error details inside an async response.
#[derive(Debug, Clone, Deserialize, Serialize, Tsify)]
#[tsify(into_wasm_abi, from_wasm_abi)]
pub struct WasmAsyncError {
    pub message: String,
    pub code: String,
}

/// Response passed to `resume_cell` to resolve an async yield.
#[derive(Debug, Clone, Deserialize, Serialize, Tsify)]
#[tsify(into_wasm_abi, from_wasm_abi)]
pub struct WasmAsyncResponse {
    pub ok: bool,
    #[tsify(type = "unknown")]
    pub value: Option<serde_json::Value>,
    pub error: Option<WasmAsyncError>,
}

/// Structured error from running a cell.
#[derive(Debug, Clone, Serialize, Deserialize, Tsify)]
#[tsify(into_wasm_abi)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum WasmCellError {
    Compile { message: String, line: Option<u32> },
    Runtime { message: String, line: Option<u32> },
    StrictMode { variable: String },
    FuelExhausted,
    Internal { message: String },
    Cancelled,
}

/// A single global variable observed by `inspect_globals`.
#[derive(Debug, Clone, Serialize, Deserialize, Tsify)]
#[tsify(into_wasm_abi)]
pub struct WasmGlobalVariable {
    pub name: String,
    #[serde(rename = "type")]
    pub type_name: String,
    pub value: Option<String>,
    pub keys: Option<Vec<String>>,
}

/// Snapshot of all Lua globals.
#[derive(Debug, Clone, Serialize, Deserialize, Tsify)]
#[tsify(into_wasm_abi)]
pub struct WasmGlobalsSnapshot {
    pub variables: Vec<WasmGlobalVariable>,
    pub execution_count: u32,
}

/// A single stdout line, either from an explicit print or auto-printed.
#[derive(Debug, Clone, Serialize, Deserialize, Tsify)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum StdOutOrAuto {
    Stdout { line: String },
    Auto { line: String },
}

/// An async command yielded from Lua, waiting for external resolution.
#[derive(Debug, Clone, Serialize, Deserialize, Tsify)]
#[tsify(into_wasm_abi)]
pub struct WasmAsyncCommand {
    pub call_id: u32,
    pub action: String,
    #[tsify(type = "unknown")]
    pub params: serde_json::Value,
}

impl WasmAsyncCommand {
    pub fn parse_params<T: serde::de::DeserializeOwned>(&self) -> Result<T, serde_json::Error> {
        serde_json::from_value(self.params.clone())
    }
}

// ─── Result types ──────────────────────────────────────────────

/// Consumer-facing result of running a single cell.
/// Either success with an optional result string, or an error.
#[derive(Debug, Clone, Serialize, Deserialize, Tsify)]
#[tsify(into_wasm_abi)]
#[serde(tag = "status", rename_all = "snake_case")]
pub enum CellResult {
    Ok {
        stdout: Vec<StdOutOrAuto>,
        stderr: Vec<String>,
        result: Option<String>,
        execution_count: u32,
    },
    Err {
        stdout: Vec<StdOutOrAuto>,
        stderr: Vec<String>,
        error: WasmCellError,
        execution_count: u32,
    },
}

/// Result of running a single cell, including async-loop state.
/// Either still pending (waiting for async resolution) or done.
#[derive(Debug, Clone, Serialize, Deserialize, Tsify)]
#[tsify(into_wasm_abi)]
#[serde(tag = "status", rename_all = "snake_case")]
pub enum WasmRunResult {
    Pending {
        stdout: Vec<StdOutOrAuto>,
        stderr: Vec<String>,
        #[tsify(type = "unknown[]")]
        commands: Vec<serde_json::Value>,
        fuel_exhausted: bool,
        execution_count: u32,
        pending_command: WasmAsyncCommand,
    },
    Ok {
        stdout: Vec<StdOutOrAuto>,
        stderr: Vec<String>,
        result: Option<String>,
        execution_count: u32,
    },
    Err {
        stdout: Vec<StdOutOrAuto>,
        stderr: Vec<String>,
        error: WasmCellError,
        execution_count: u32,
    },
}

// ─── From impls ────────────────────────────────────────────────

impl From<web_lua_core::CellError> for WasmCellError {
    fn from(e: web_lua_core::CellError) -> Self {
        match e {
            web_lua_core::CellError::Compile { message, line } => {
                WasmCellError::Compile { message, line }
            }
            web_lua_core::CellError::Runtime { message, line } => {
                WasmCellError::Runtime { message, line }
            }
            web_lua_core::CellError::StrictMode { variable } => {
                WasmCellError::StrictMode { variable }
            }
            web_lua_core::CellError::FuelExhausted => WasmCellError::FuelExhausted,
            web_lua_core::CellError::Internal { message } => WasmCellError::Internal { message },
            web_lua_core::CellError::Cancelled => WasmCellError::Cancelled,
        }
    }
}

impl From<web_lua_core::GlobalVariable> for WasmGlobalVariable {
    fn from(v: web_lua_core::GlobalVariable) -> Self {
        WasmGlobalVariable {
            name: v.name,
            type_name: v.type_name,
            value: v.value,
            keys: v.keys,
        }
    }
}

impl From<web_lua_core::GlobalsSnapshot> for WasmGlobalsSnapshot {
    fn from(s: web_lua_core::GlobalsSnapshot) -> Self {
        WasmGlobalsSnapshot {
            variables: s.variables.into_iter().map(Into::into).collect(),
            execution_count: s.execution_count,
        }
    }
}

impl From<web_lua_core::AsyncCommand> for WasmAsyncCommand {
    fn from(c: web_lua_core::AsyncCommand) -> Self {
        WasmAsyncCommand {
            call_id: c.call_id,
            action: c.action,
            params: c.params,
        }
    }
}

impl From<web_lua_core::RunResult> for CellResult {
    fn from(r: web_lua_core::RunResult) -> Self {
        let stdout = r
            .stdout
            .into_iter()
            .map(|s| StdOutOrAuto::Stdout { line: s })
            .collect();
        if let Some(error) = r.error {
            CellResult::Err {
                stdout,
                stderr: r.stderr,
                error: error.into(),
                execution_count: r.execution_count,
            }
        } else {
            CellResult::Ok {
                stdout,
                stderr: r.stderr,
                result: r.result,
                execution_count: r.execution_count,
            }
        }
    }
}

impl From<web_lua_core::RunResult> for WasmRunResult {
    fn from(r: web_lua_core::RunResult) -> Self {
        let stdout = r
            .stdout
            .into_iter()
            .map(|s| StdOutOrAuto::Stdout { line: s })
            .collect();
        match r.status {
            web_lua_core::CellStatus::AsyncPending => WasmRunResult::Pending {
                stdout,
                stderr: r.stderr,
                commands: r.commands,
                fuel_exhausted: r.fuel_exhausted,
                execution_count: r.execution_count,
                pending_command: r
                    .pending_command
                    .expect("AsyncPending without pending_command")
                    .into(),
            },
            web_lua_core::CellStatus::Done => {
                if let Some(error) = r.error {
                    WasmRunResult::Err {
                        stdout,
                        stderr: r.stderr,
                        error: error.into(),
                        execution_count: r.execution_count,
                    }
                } else {
                    WasmRunResult::Ok {
                        stdout,
                        stderr: r.stderr,
                        result: r.result,
                        execution_count: r.execution_count,
                    }
                }
            }
        }
    }
}

impl From<WasmRunResult> for CellResult {
    fn from(r: WasmRunResult) -> Self {
        match r {
            WasmRunResult::Ok {
                mut stdout,
                stderr,
                result,
                execution_count,
            } => {
                // Auto-print the result when no explicit print() was used
                if stdout.is_empty() {
                    if let Some(ref line) = result {
                        if !line.is_empty() {
                            stdout.push(StdOutOrAuto::Auto { line: line.clone() });
                        }
                    }
                }
                CellResult::Ok {
                    stdout,
                    stderr,
                    result,
                    execution_count,
                }
            }
            WasmRunResult::Err {
                stdout,
                stderr,
                error,
                execution_count,
            } => CellResult::Err {
                stdout,
                stderr,
                error,
                execution_count,
            },
            WasmRunResult::Pending {
                stdout,
                stderr,
                execution_count,
                ..
            } => CellResult::Err {
                stdout,
                stderr,
                error: WasmCellError::Internal {
                    message: "Pending result converted to CellResult".into(),
                },
                execution_count,
            },
        }
    }
}
