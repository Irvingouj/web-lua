use piccolo::Value;
use std::cell::Cell;
use wasm_bindgen::prelude::*;
use web_lua_base::types::*;
use web_lua_base::BaseSession;

// ─── WebSession ─────────────────────────────────────────────────

/// WebSession wraps BaseSession for the web environment.
/// WASM runs on the main thread; browser side-effects are executed
/// directly via web_sys.
#[wasm_bindgen]
pub struct WebSession {
    base: BaseSession,
    aborted: Cell<bool>,
}

impl Default for WebSession {
    fn default() -> Self {
        Self::new()
    }
}

#[wasm_bindgen]
impl WebSession {
    /// Create a new web session.
    /// Automatically injects Lua aliases so the Lua API surface
    /// matches the designed namespace (`page.fetch`, `sleep`, etc.)
    #[wasm_bindgen(constructor)]
    pub fn new() -> Self {
        crate::browser_api::init_registry();
        let mut session = Self {
            base: BaseSession::new(),
            aborted: Cell::new(false),
        };
        session.base.inner.set_js_doc_provider_available(true);
        session.register_aliases();
        session
    }

    /// Reset the session, clearing all Lua state.
    pub fn reset(&mut self) {
        self.base.reset();
        self.register_aliases();
    }

    /// Register Lua aliases as Rust callbacks (no Lua injection).
    fn register_aliases(&mut self) {
        self.base.with_lua(|ctx, _host_state| {
            // page.go — alias for page.goto
            let page_table = ctx.get_global("page").unwrap();
            if let Value::Table(page) = page_table {
                let goto_cb: Value = page.get(ctx, "goto").unwrap();
                web_lua_core::lua_api_custom!(ctx, page, name: "go", callback: goto_cb,
                    namespace: "page",
                    action: "",
                    doc: "Navigate to a URL (alias for page.goto).",
                    params: [
                        url: "string", required, "URL to navigate to",
                    ],
                    returns: "nil" => "None",
                );
            }

            // page.fetch — alias for web.fetch
            let web_table = ctx.get_global("web").unwrap();
            let page_table = ctx.get_global("page").unwrap();
            if let (Value::Table(web), Value::Table(page)) = (web_table, page_table) {
                let fetch_cb: Value = web.get(ctx, "fetch").unwrap();
                web_lua_core::lua_api_custom!(ctx, page, name: "fetch", callback: fetch_cb,
                    namespace: "page",
                    action: "",
                    doc: "Fetch a URL (alias for web.fetch).",
                    params: [
                        url: "string", required, "URL to fetch",
                        opts: "table | nil", optional, "Options: method, body, headers, timeout",
                    ],
                    returns: "table" => "{ status, ok, body, headers }",
                );
            }

            // sleep — alias for web.sleep
            let web_table = ctx.get_global("web").unwrap();
            if let Value::Table(web) = web_table {
                let sleep_cb: Value = web.get(ctx, "sleep").unwrap();
                let globals = ctx.globals();
                web_lua_core::lua_api_custom!(ctx, globals, name: "sleep", callback: sleep_cb,
                    namespace: "global",
                    action: "",
                    doc: "Pause execution (alias for web.sleep).",
                    params: [
                        ms: "number", optional, "Milliseconds to sleep (default 1000)",
                    ],
                    returns: "nil" => "None",
                );
            }
        });
    }

    /// Set the fuel limit for execution.
    pub fn set_fuel_limit(&mut self, limit: i32) {
        self.base.set_fuel_limit(limit);
    }

    /// Load a Lua library by executing its source code.
    pub fn load_library(&mut self, source: &str) -> CellResult {
        self.base.load_library(source).into()
    }

    /// Inspect all global variables in the current Lua state.
    pub fn inspect_globals(&mut self) -> WasmGlobalsSnapshot {
        self.base.inspect_globals()
    }

    /// Clean up the session and release resources.
    /// Sets the abort flag so any in-flight run_cell_async loop
    /// will exit cooperatively after the current async operation.
    #[wasm_bindgen(js_name = stopWith)]
    pub fn stop_with(&mut self) {
        self.aborted.set(true);
        self.base.reset();
    }

    /// Run a cell, automatically resolving all async calls
    /// directly via web_sys without yielding to JS.
    #[wasm_bindgen(js_name = runCellAsync)]
    pub async fn run_cell_async(&mut self, code: String, stdin: String) -> CellResult {
        self.aborted.set(false);
        let result = web_lua_base::run_cell_async_loop(
            &mut self.base,
            &code,
            &stdin,
            |cmd| async move {
                WebSession::handle_command(&cmd)
                    .await
                    .map_err(|e| WasmAsyncError {
                        message: e,
                        code: "E_UNSUPPORTED".into(),
                    })
            },
            Some(&self.aborted),
        )
        .await;

        // If we exited because of abort, reset state so the session is clean
        if self.aborted.get() {
            self.base.reset();
            self.aborted.set(false);
        }

        result.into()
    }
}

/// Return all registered API docs as a JSON string.
/// Used by the JS side to populate the merged doc registry.
#[wasm_bindgen(js_name = getApiDocsJson)]
pub fn get_api_docs_json() -> String {
    web_lua_core::api_docs::generate_json()
}

impl WebSession {
    async fn handle_command(cmd: &WasmAsyncCommand) -> Result<WasmAsyncResponse, String> {
        crate::browser_api::dispatch_command(cmd).await
    }
}
