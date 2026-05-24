use crate::browser_api::{execute_fetch, execute_sleep};
use crate::types::*;
use piccolo_notebook_core::NotebookSession;
use wasm_bindgen::prelude::*;

// ─── WasmSession ────────────────────────────────────────────────

/// WasmSession wraps NotebookSession for use from JavaScript/TypeScript.
#[wasm_bindgen]
pub struct WasmSession {
    inner: NotebookSession,
}

#[wasm_bindgen]
impl WasmSession {
    /// Create a new notebook session.
    #[wasm_bindgen(constructor)]
    pub fn new() -> Self {
        Self {
            inner: NotebookSession::new(),
        }
    }

    /// Run a cell of code with optional stdin.
    pub fn run_cell(&mut self, code: &str, stdin: &str) -> WasmRunResult {
        self.inner.run_cell(code, stdin).into()
    }

    /// Resume a yielded cell with an async response.
    pub fn resume_cell(&mut self, response: WasmAsyncResponse) -> WasmRunResult {
        let json = serde_json::to_string(&response).unwrap_or_default();
        self.inner.resume_cell(&json).into()
    }

    /// Reset the session, clearing all Lua state.
    pub fn reset(&mut self) {
        self.inner.reset();
    }

    /// Set the fuel limit for execution.
    pub fn set_fuel_limit(&mut self, limit: i32) {
        self.inner.set_fuel_limit(limit);
    }

    /// Load a Lua library by executing its source code.
    /// Any globals defined become available to subsequent cells.
    pub fn load_library(&mut self, source: &str) -> WasmRunResult {
        self.inner.run_cell(source, "").into()
    }

    /// Inspect all global variables in the current Lua state.
    pub fn inspect_globals(&mut self) -> WasmGlobalsSnapshot {
        self.inner.inspect_globals().into()
    }
}

impl Default for WasmSession {
    fn default() -> Self {
        Self::new()
    }
}

// ─── Async browser API helpers ──────────────────────────────────

/// Run a cell, automatically resolving async fetch / sleep calls
/// directly via wasm-bindgen-futures without yielding to JS.
#[wasm_bindgen]
impl WasmSession {
    #[wasm_bindgen(js_name = runCellAsync)]
    pub async fn run_cell_async(&mut self, code: String, stdin: String) -> WasmRunResult {
        let mut result = self.inner.run_cell(&code, &stdin);

        while result.status == piccolo_notebook_core::CellStatus::AsyncPending {
            let cmd = match &result.pending_command {
                Some(c) => c,
                None => break,
            };

            let response = match cmd.action.as_str() {
                "fetch" => execute_fetch(cmd.params.clone()).await,
                "sleep" => execute_sleep(cmd.params.clone()).await,
                // Can't handle in WASM (needs main thread) — return to JS
                _ => break,
            };

            let json = serde_json::to_string(&response).unwrap_or_default();
            result = self.inner.resume_cell(&json);
        }

        result.into()
    }
}
