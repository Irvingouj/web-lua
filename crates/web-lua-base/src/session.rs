use crate::types::*;
use piccolo_notebook_core::NotebookSession;

// ─── BaseSession ────────────────────────────────────────────────

/// BaseSession wraps NotebookSession for use by upper-layer crates
/// (web-lua, extension-lua). It is NOT marked with `#[wasm_bindgen]`;
/// JS cannot see it directly. Upper crates wrap it in their own
/// `#[wasm_bindgen]` structs.
pub struct BaseSession {
    pub inner: NotebookSession,
}

impl Default for BaseSession {
    fn default() -> Self {
        Self::new()
    }
}

impl BaseSession {
    /// Create a new notebook session.
    pub fn new() -> Self {
        Self {
            inner: NotebookSession::new(),
        }
    }

    /// Run a cell of code with optional stdin.
    pub fn run_cell(&mut self, code: &str, stdin: &str) -> WasmRunResult {
        self.inner.run_cell(code, stdin).into()
    }

    /// Resume a yielded cell with an async response JSON string.
    pub fn resume_cell(&mut self, response_json: &str) -> WasmRunResult {
        self.inner.resume_cell(response_json).into()
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

    /// Restore a pending async command that was yielded but not yet resolved.
    /// Used when the host handles some async calls itself and wants to pass
    /// the rest back to JS.
    pub fn restore_pending_command(&mut self, cmd: WasmAsyncCommand) {
        let core_cmd = piccolo_notebook_core::AsyncCommand {
            call_id: cmd.call_id,
            action: cmd.action,
            params: cmd.params,
        };
        self.inner.restore_pending_command(core_cmd);
    }
}
