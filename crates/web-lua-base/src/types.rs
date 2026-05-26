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
#[derive(Debug, Clone, Serialize, Tsify)]
#[tsify(into_wasm_abi)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum WasmCellError {
    Compile { message: String, line: Option<u32> },
    Runtime { message: String },
    StrictMode { variable: String },
    FuelExhausted,
    Internal { message: String },
}

/// A single global variable observed by `inspect_globals`.
#[derive(Debug, Clone, Serialize, Tsify)]
#[tsify(into_wasm_abi)]
pub struct WasmGlobalVariable {
    pub name: String,
    #[serde(rename = "type")]
    pub type_name: String,
    pub value: Option<String>,
    pub keys: Option<Vec<String>>,
}

/// Snapshot of all Lua globals.
#[derive(Debug, Clone, Serialize, Tsify)]
#[tsify(into_wasm_abi)]
pub struct WasmGlobalsSnapshot {
    pub variables: Vec<WasmGlobalVariable>,
    pub execution_count: u32,
}

/// An async command yielded from Lua, waiting for external resolution.
#[derive(Debug, Clone, Serialize, Tsify)]
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

/// Result of running a single cell.
#[derive(Debug, Clone, Serialize, Tsify)]
#[tsify(into_wasm_abi)]
pub struct WasmRunResult {
    pub stdout: Vec<String>,
    pub stderr: Vec<String>,
    pub result: Option<String>,
    pub error: Option<WasmCellError>,
    #[tsify(type = "unknown[]")]
    pub commands: Vec<serde_json::Value>,
    pub fuel_exhausted: bool,
    pub execution_count: u32,
    pub status: WasmCellStatus,
    pub pending_command: Option<WasmAsyncCommand>,
}

/// Consumer-facing result of running a single cell.
/// Stripped of internal async-loop fields (commands, fuel_exhausted, status, pending_command).
#[derive(Debug, Clone, Serialize, Tsify)]
#[tsify(into_wasm_abi)]
pub struct CellResult {
    pub stdout: Vec<String>,
    pub stderr: Vec<String>,
    pub result: Option<String>,
    pub error: Option<WasmCellError>,
    pub execution_count: u32,
}

impl From<web_lua_core::CellStatus> for WasmCellStatus {
    fn from(s: web_lua_core::CellStatus) -> Self {
        match s {
            web_lua_core::CellStatus::Done => WasmCellStatus::Done,
            web_lua_core::CellStatus::AsyncPending => WasmCellStatus::AsyncPending,
        }
    }
}

impl From<web_lua_core::CellError> for WasmCellError {
    fn from(e: web_lua_core::CellError) -> Self {
        match e {
            web_lua_core::CellError::Compile { message, line } => {
                WasmCellError::Compile { message, line }
            }
            web_lua_core::CellError::Runtime { message } => WasmCellError::Runtime { message },
            web_lua_core::CellError::StrictMode { variable } => {
                WasmCellError::StrictMode { variable }
            }
            web_lua_core::CellError::FuelExhausted => WasmCellError::FuelExhausted,
            web_lua_core::CellError::Internal { message } => WasmCellError::Internal { message },
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
            action: c.action.into(),
            params: c.params,
        }
    }
}

impl From<web_lua_core::RunResult> for WasmRunResult {
    fn from(r: web_lua_core::RunResult) -> Self {
        WasmRunResult {
            stdout: r.stdout,
            stderr: r.stderr,
            result: r.result,
            error: r.error.map(Into::into),
            commands: r.commands,
            fuel_exhausted: r.fuel_exhausted,
            execution_count: r.execution_count,
            status: r.status.into(),
            pending_command: r.pending_command.map(Into::into),
        }
    }
}

impl From<web_lua_core::RunResult> for CellResult {
    fn from(r: web_lua_core::RunResult) -> Self {
        CellResult {
            stdout: r.stdout,
            stderr: r.stderr,
            result: r.result,
            error: r.error.map(Into::into),
            execution_count: r.execution_count,
        }
    }
}

impl From<WasmRunResult> for CellResult {
    fn from(r: WasmRunResult) -> Self {
        CellResult {
            stdout: r.stdout,
            stderr: r.stderr,
            result: r.result,
            error: r.error,
            execution_count: r.execution_count,
        }
    }
}
