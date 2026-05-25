use crate::types::{AsyncCommand, CellError};

// ─── Internal State ─────────────────────────────────────────────

/// Internal state shared between Lua closures and the host.
/// Plugin authors can use `host_state.borrow_mut()` to set `pending_async_command`
/// for async callbacks.
#[derive(Debug, Default)]
pub struct HostState {
    pub(crate) stdout: Vec<String>,
    pub(crate) stderr: Vec<String>,
    pub(crate) commands: Vec<serde_json::Value>,
    pub(crate) stdin_lines: Vec<String>,
    pub(crate) stdin_cursor: usize,
    pub(crate) fuel_exhausted: bool,
    /// Dedicated channel for cell errors from Lua callbacks (e.g. strict mode).
    pub(crate) cell_errors: Vec<CellError>,
    /// When a callback yields for async, it stores the command here.
    pub(crate) pending_async_command: Option<AsyncCommand>,
    /// Monotonic counter for async call IDs.
    pub(crate) async_call_counter: u32,
}
