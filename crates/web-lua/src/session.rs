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

// ─── WebSession ─────────────────────────────────────────────────

/// WebSession wraps BaseSession for the web environment.
/// WASM runs on the main thread; browser side-effects are executed
/// directly via web_sys.
#[wasm_bindgen]
pub struct WebSession {
    base: BaseSession,
    aborted: Cell<bool>,
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
        self.base.load_library(source)
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

        result
    }
}

impl WebSession {
    async fn handle_command(
        &mut self,
        cmd: &WasmAsyncCommand,
    ) -> Result<WasmAsyncResponse, String> {
        match cmd.action.as_str() {
            "fetch" => Ok(execute_fetch(cmd.params.clone()).await),
            "sleep" => Ok(execute_sleep(cmd.params.clone()).await),
            "page_wait" => Ok(execute_page_wait(cmd.params.clone()).await),

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
                let ref_id = cmd
                    .params
                    .get("refId")
                    .and_then(|v| v.as_str())
                    .ok_or("page_click requires refId")?;
                let document = web_sys::window()
                    .ok_or("No window available")?
                    .document()
                    .ok_or("No document available")?;
                let element = document
                    .query_selector(&format!("[data-ref-id='{}']", ref_id))
                    .map_err(|e| format!("{:?}", e))?
                    .ok_or_else(|| format!("Element with ref_id '{}' not found", ref_id))?;
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
                let ref_id = cmd
                    .params
                    .get("refId")
                    .and_then(|v| v.as_str())
                    .ok_or("page_fill requires refId")?;
                let value = cmd
                    .params
                    .get("value")
                    .and_then(|v| v.as_str())
                    .ok_or("page_fill requires value")?;
                let document = web_sys::window()
                    .ok_or("No window available")?
                    .document()
                    .ok_or("No document available")?;
                let element = document
                    .query_selector(&format!("[data-ref-id='{}']", ref_id))
                    .map_err(|e| format!("{:?}", e))?
                    .ok_or_else(|| format!("Element with ref_id '{}' not found", ref_id))?;
                if let Some(input) = element.dyn_ref::<web_sys::HtmlInputElement>() {
                    input.set_value(value);
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
                let url = cmd
                    .params
                    .get("url")
                    .and_then(|v| v.as_str())
                    .ok_or("page_goto requires url")?;
                let window = web_sys::window().ok_or("No window available")?;
                window
                    .location()
                    .set_href(url)
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
            "page_snapshot" | "dom_snapshot" => Ok(execute_dom_snapshot(cmd.params.clone())),
            "dom_format" => Ok(execute_dom_format(cmd.params.clone())),
            "page_screenshot" => Ok(WasmAsyncResponse {
                ok: false,
                value: None,
                error: Some(WasmAsyncError {
                    message: "screenshot not yet implemented in web-lua".into(),
                    code: "E_NOT_IMPLEMENTED".into(),
                }),
            }),
            "page_type" => Ok(execute_page_type(cmd.params.clone()).await),
            "page_press" => Ok(execute_page_press(cmd.params.clone()).await),
            "page_select" => Ok(execute_page_select(cmd.params.clone()).await),
            "page_check" => Ok(execute_page_check(cmd.params.clone()).await),
            "page_hover" => Ok(execute_page_hover(cmd.params.clone()).await),
            "page_unhover" => Ok(execute_page_unhover(cmd.params.clone()).await),
            "page_scroll" => Ok(execute_page_scroll(cmd.params.clone()).await),
            "page_scroll_to" => Ok(execute_page_scroll_to(cmd.params.clone()).await),
            "page_dblclick" => Ok(execute_page_dblclick(cmd.params.clone()).await),
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
            "storage_get" => Ok(execute_storage_get(cmd.params.clone()).await),
            "storage_set" => Ok(execute_storage_set(cmd.params.clone()).await),
            "storage_delete" => Ok(execute_storage_delete(cmd.params.clone()).await),
            "storage_list" => Ok(execute_storage_list(cmd.params.clone()).await),
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
