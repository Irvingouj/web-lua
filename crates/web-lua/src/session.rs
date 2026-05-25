use crate::browser_api::{
    execute_dom_format, execute_dom_snapshot, execute_fetch, execute_host_call, execute_page_check,
    execute_page_dblclick, execute_page_hover, execute_page_press, execute_page_scroll,
    execute_page_scroll_to, execute_page_select, execute_page_type, execute_page_unhover,
    execute_page_wait, execute_sleep, execute_storage_delete, execute_storage_get,
    execute_storage_list, execute_storage_set,
};
use std::cell::Cell;
use wasm_bindgen::prelude::*;
use web_lua_base::types::*;
use web_lua_base::BaseSession;
use web_lua_core::command_params::*;

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
        let mut session = Self {
            base: BaseSession::new(),
            aborted: Cell::new(false),
        };
        // Inject Lua aliases for consistent API surface
        let _ = session.base.load_library(
            r#"
page.fetch = web.fetch
sleep = web.sleep
"#,
        );

        // Register injected alias metadata
        web_lua_core::lua_api_doc!(
            namespace: "page",
            name: "fetch",
            action: "",
            doc: "Fetch a URL (alias for web.fetch).",
            source: "injected_lua",
            params: [
                url: "string", required, "URL to fetch",
                opts: "table | nil", optional, "Options: method, body, headers, timeout",
            ],
            returns: "table" => "{ status, ok, body, headers }",
        );
        web_lua_core::lua_api_doc!(
            namespace: "global",
            name: "sleep",
            action: "",
            doc: "Pause execution (alias for web.sleep).",
            source: "injected_lua",
            params: [
                ms: "number", optional, "Milliseconds to sleep (default 1000)",
            ],
            returns: "nil" => "None",
        );

        session
    }

    /// Reset the session, clearing all Lua state.
    pub fn reset(&mut self) {
        self.base.reset();
        // Re-inject aliases after reset
        let _ = self.base.load_library(
            r#"
page.fetch = web.fetch
sleep = web.sleep
"#,
        );
    }

    /// Set the fuel limit for execution.
    pub fn set_fuel_limit(&mut self, limit: i32) {
        self.base.set_fuel_limit(limit);
    }

    /// Load a Lua library by executing its source code.
    pub fn load_library(&mut self, source: &str) -> WasmRunResult {
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
    pub async fn run_cell_async(&mut self, code: String, stdin: String) -> WasmRunResult {
        self.aborted.set(false);
        let mut result = self.base.run_cell(&code, &stdin);

        while result.status == WasmCellStatus::AsyncPending {
            // Cooperative abort: if stop_with was called, resume with an error
            // so the executor unwinds and the loop exits cleanly.
            if self.aborted.get() {
                let err_json = serde_json::to_string(&WasmAsyncResponse {
                    ok: false,
                    value: None,
                    error: Some(WasmAsyncError {
                        message: "Runner aborted".into(),
                        code: "E_ABORTED".into(),
                    }),
                })
                .unwrap_or_default();
                result = self.base.resume_cell(&err_json);
                continue;
            }

            let cmd = match result.pending_command {
                Some(ref c) => c,
                None => break,
            };

            let response = match self.handle_command(cmd).await {
                Ok(r) => r,
                Err(e) => {
                    // Resume with error so Lua gets a clean failure
                    let err_json = serde_json::to_string(&WasmAsyncResponse {
                        ok: false,
                        value: None,
                        error: Some(WasmAsyncError {
                            message: e,
                            code: "E_UNSUPPORTED".into(),
                        }),
                    })
                    .unwrap_or_default();
                    result = self.base.resume_cell(&err_json);
                    continue;
                }
            };

            let json = serde_json::to_string(&response).unwrap_or_default();
            result = self.base.resume_cell(&json);
        }

        // If we exited because of abort, reset state so the session is clean
        if self.aborted.get() {
            self.base.reset();
            self.aborted.set(false);
        }

        result.into()
    }
}

impl WebSession {
    async fn handle_command(
        &mut self,
        cmd: &WasmAsyncCommand,
    ) -> Result<WasmAsyncResponse, String> {
        match cmd.action.as_str() {
            "fetch" => {
                let params = cmd.parse_params::<FetchParams>()
                    .map_err(|e| format!("Invalid fetch params: {}", e))?;
                Ok(execute_fetch(params).await)
            }
            "sleep" => {
                let params = cmd.parse_params::<SleepParams>()
                    .map_err(|e| format!("Invalid sleep params: {}", e))?;
                Ok(execute_sleep(params).await)
            }
            "page_wait" => {
                let params = cmd.parse_params::<PageWaitParams>()
                    .map_err(|e| format!("Invalid page_wait params: {}", e))?;
                Ok(execute_page_wait(params).await)
            }

            "page_url" => {
                let window = web_sys::window().ok_or("No window available")?;
                let href = window.location().href().map_err(|e| format!("{:?}", e))?;
                Ok(WasmAsyncResponse {
                    ok: true,
                    value: Some(serde_json::Value::String(href)),
                    error: None,
                })
            }
            "page_title" => {
                let document = web_sys::window()
                    .ok_or("No window available")?
                    .document()
                    .ok_or("No document available")?;
                let title = document.title();
                Ok(WasmAsyncResponse {
                    ok: true,
                    value: Some(serde_json::Value::String(title)),
                    error: None,
                })
            }
            "page_click" => {
                let params = cmd.parse_params::<PageClickParams>()
                    .map_err(|e| format!("Invalid page_click params: {}", e))?;
                let document = web_sys::window()
                    .ok_or("No window available")?
                    .document()
                    .ok_or("No document available")?;
                let element = document
                    .query_selector(&format!("[data-ref-id='{}']", params.ref_id))
                    .map_err(|e| format!("{:?}", e))?
                    .ok_or_else(|| format!("Element with ref_id '{}' not found", params.ref_id))?;
                element
                    .dyn_ref::<web_sys::HtmlElement>()
                    .ok_or("Element is not clickable")?
                    .click();
                Ok(WasmAsyncResponse {
                    ok: true,
                    value: Some(serde_json::Value::Null),
                    error: None,
                })
            }
            "page_fill" => {
                let params = cmd.parse_params::<PageFillParams>()
                    .map_err(|e| format!("Invalid page_fill params: {}", e))?;
                let document = web_sys::window()
                    .ok_or("No window available")?
                    .document()
                    .ok_or("No document available")?;
                let element = document
                    .query_selector(&format!("[data-ref-id='{}']", params.ref_id))
                    .map_err(|e| format!("{:?}", e))?
                    .ok_or_else(|| format!("Element with ref_id '{}' not found", params.ref_id))?;
                if let Some(input) = element.dyn_ref::<web_sys::HtmlInputElement>() {
                    input.set_value(&params.value);
                } else {
                    return Err("Element is not an input".into());
                }
                let event = web_sys::Event::new("input").map_err(|e| format!("{:?}", e))?;
                let _ = element.dispatch_event(&event);
                Ok(WasmAsyncResponse {
                    ok: true,
                    value: Some(serde_json::Value::Null),
                    error: None,
                })
            }
            "page_goto" => {
                let params = cmd.parse_params::<PageGotoParams>()
                    .map_err(|e| format!("Invalid page_goto params: {}", e))?;
                let window = web_sys::window().ok_or("No window available")?;
                window
                    .location()
                    .set_href(&params.url)
                    .map_err(|e| format!("{:?}", e))?;
                Ok(WasmAsyncResponse {
                    ok: true,
                    value: Some(serde_json::Value::Null),
                    error: None,
                })
            }
            "page_back" => {
                let window = web_sys::window().ok_or("No window available")?;
                window
                    .history()
                    .map_err(|e| format!("{:?}", e))?
                    .back()
                    .map_err(|e| format!("{:?}", e))?;
                Ok(WasmAsyncResponse {
                    ok: true,
                    value: Some(serde_json::Value::Null),
                    error: None,
                })
            }
            "page_forward" => {
                let window = web_sys::window().ok_or("No window available")?;
                window
                    .history()
                    .map_err(|e| format!("{:?}", e))?
                    .forward()
                    .map_err(|e| format!("{:?}", e))?;
                Ok(WasmAsyncResponse {
                    ok: true,
                    value: Some(serde_json::Value::Null),
                    error: None,
                })
            }
            "page_reload" => {
                let window = web_sys::window().ok_or("No window available")?;
                window.location().reload().map_err(|e| format!("{:?}", e))?;
                Ok(WasmAsyncResponse {
                    ok: true,
                    value: Some(serde_json::Value::Null),
                    error: None,
                })
            }
            "page_snapshot" | "dom_snapshot" => {
                let params = cmd.parse_params::<DomSnapshotParams>()
                    .map_err(|e| format!("Invalid snapshot params: {}", e))?;
                Ok(execute_dom_snapshot(params))
            }
            "dom_format" => {
                let params = cmd.parse_params::<DomFormatParams>()
                    .map_err(|e| format!("Invalid dom_format params: {}", e))?;
                Ok(execute_dom_format(params))
            }
            "page_screenshot" => Ok(WasmAsyncResponse {
                ok: false,
                value: None,
                error: Some(WasmAsyncError {
                    message: "screenshot not yet implemented in web-lua".into(),
                    code: "E_NOT_IMPLEMENTED".into(),
                }),
            }),
            "page_type" => {
                let params = cmd.parse_params::<PageTypeParams>()
                    .map_err(|e| format!("Invalid page_type params: {}", e))?;
                Ok(execute_page_type(params).await)
            }
            "page_press" => {
                let params = cmd.parse_params::<PagePressParams>()
                    .map_err(|e| format!("Invalid page_press params: {}", e))?;
                Ok(execute_page_press(params).await)
            }
            "page_select" => {
                let params = cmd.parse_params::<PageSelectParams>()
                    .map_err(|e| format!("Invalid page_select params: {}", e))?;
                Ok(execute_page_select(params).await)
            }
            "page_check" => {
                let params = cmd.parse_params::<PageCheckParams>()
                    .map_err(|e| format!("Invalid page_check params: {}", e))?;
                Ok(execute_page_check(params).await)
            }
            "page_hover" => {
                let params = cmd.parse_params::<PageHoverParams>()
                    .map_err(|e| format!("Invalid page_hover params: {}", e))?;
                Ok(execute_page_hover(params).await)
            }
            "page_unhover" => Ok(execute_page_unhover().await),
            "page_scroll" => {
                let params = cmd.parse_params::<PageScrollParams>()
                    .map_err(|e| format!("Invalid page_scroll params: {}", e))?;
                Ok(execute_page_scroll(params).await)
            }
            "page_scroll_to" => {
                let params = cmd.parse_params::<PageScrollToParams>()
                    .map_err(|e| format!("Invalid page_scroll_to params: {}", e))?;
                Ok(execute_page_scroll_to(params).await)
            }
            "page_dblclick" => {
                let params = cmd.parse_params::<PageDblClickParams>()
                    .map_err(|e| format!("Invalid page_dblclick params: {}", e))?;
                Ok(execute_page_dblclick(params).await)
            }
            // Extension-only APIs: return error in web context
            "tab_query"
            | "tab_create"
            | "tab_activate"
            | "tab_close"
            | "tab_execute_script"
            | "tab_click"
            | "tab_fill"
            | "tab_snapshot"
            | "tab_scroll_to"
            | "tab_evaluate"
            | "tab_back"
            | "tab_wait_for_load"
            | "tab_fetch"
            | "cookies_get"
            | "cookies_set"
            | "cookies_delete"
            | "cookies_list"
            | "history_search"
            | "history_delete"
            | "bookmarks_search"
            | "bookmarks_create"
            | "bookmarks_delete"
            | "notifications_create"
            | "notifications_clear"
            | "clipboard_read"
            | "clipboard_write"
            | "chrome_runtime_sendMessage"
            | "chrome_tabs_query"
            | "chrome_tabs_create"
            | "chrome_tabs_update"
            | "chrome_tabs_remove"
            | "chrome_tabs_get"
            | "chrome_tabs_reload"
            | "chrome_tabs_sendMessage"
            | "chrome_alarms_create"
            | "chrome_alarms_clear"
            | "chrome_action_setBadgeText"
            | "chrome_action_setBadgeBackgroundColor"
            | "chrome_action_setTitle"
            | "chrome_action_setIcon"
            | "chrome_contextMenus_create"
            | "chrome_contextMenus_remove"
            | "chrome_windows_getAll"
            | "chrome_windows_create"
            | "chrome_windows_update"
            | "chrome_windows_remove"
            | "chrome_sidePanel_setOptions"
            | "chrome_cookies_get"
            | "chrome_cookies_set"
            | "chrome_cookies_remove"
            | "chrome_cookies_getAll"
            | "chrome_bookmarks_search"
            | "chrome_bookmarks_create"
            | "chrome_bookmarks_remove"
            | "chrome_history_search"
            | "chrome_history_deleteUrl"
            | "chrome_notifications_create"
            | "chrome_notifications_clear"
            | "chrome_scripting_executeScript"
            | "page_close"
            | "page_active_tab"
            | "page_tabs"
            | "page_switch"
            | "page_new_tab" => Err(format!(
                "{} is not available in web-lua context",
                cmd.action
            )),
            "storage_get" => {
                let params = cmd.parse_params::<StorageGetParams>()
                    .map_err(|e| format!("Invalid storage_get params: {}", e))?;
                Ok(execute_storage_get(params).await)
            }
            "storage_set" => {
                let params = cmd.parse_params::<StorageSetParams>()
                    .map_err(|e| format!("Invalid storage_set params: {}", e))?;
                Ok(execute_storage_set(params).await)
            }
            "storage_delete" => {
                let params = cmd.parse_params::<StorageDeleteParams>()
                    .map_err(|e| format!("Invalid storage_delete params: {}", e))?;
                Ok(execute_storage_delete(params).await)
            }
            "storage_list" => Ok(execute_storage_list().await),
            "mock_async" => {
                // Test-only: just return empty success
                Ok(WasmAsyncResponse {
                    ok: true,
                    value: Some(serde_json::Value::Null),
                    error: None,
                })
            }
            action if action.starts_with("host_") => {
                let host_action = &action[5..];
                Ok(execute_host_call(host_action, cmd.params.clone()).await)
            }
            _ => Err(format!("Unknown action: {}", cmd.action)),
        }
    }
}
