use wasm_bindgen::prelude::*;
use piccolo_notebook_core::NotebookSession;

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
    /// Returns a JSON string with the result.
    pub fn run_cell(&mut self, code: &str, stdin: &str) -> String {
        let result = self.inner.run_cell(code, stdin);
        serde_json::to_string(&result).unwrap_or_else(|e| {
            serde_json::json!({
                "error": format!("Serialization error: {}", e),
                "stdout": [],
                "stderr": [],
                "result": null,
                "commands": [],
                "fuel_exhausted": false,
                "execution_count": 0
            }).to_string()
        })
    }

    /// Reset the session, clearing all Lua state.
    pub fn reset(&mut self) {
        self.inner.reset();
    }

    /// Set the fuel limit for execution.
    pub fn set_fuel_limit(&mut self, limit: i32) {
        self.inner.set_fuel_limit(limit);
    }
}

impl Default for WasmSession {
    fn default() -> Self {
        Self::new()
    }
}
