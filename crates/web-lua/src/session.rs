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

impl WebSession {
    async fn handle_command(cmd: &WasmAsyncCommand) -> Result<WasmAsyncResponse, String> {
        use web_lua_core::action::Action;
        match Action::from(cmd.action.as_str()) {
            Action::Fetch => {
                let params = cmd
                    .parse_params::<FetchParams>()
                    .map_err(|e| format!("Invalid fetch params: {}", e))?;
                Ok(execute_fetch(params).await)
            }
            Action::Sleep => {
                let params = cmd
                    .parse_params::<SleepParams>()
                    .map_err(|e| format!("Invalid sleep params: {}", e))?;
                Ok(execute_sleep(params).await)
            }
            Action::PageWait => {
                let params = cmd
                    .parse_params::<PageWaitParams>()
                    .map_err(|e| format!("Invalid page_wait params: {}", e))?;
                Ok(execute_page_wait(params).await)
            }

            Action::PageUrl => {
                let window = web_sys::window().ok_or("No window available")?;
                let href = window.location().href().map_err(|e| format!("{:?}", e))?;
                Ok(WasmAsyncResponse {
                    ok: true,
                    value: Some(serde_json::Value::String(href)),
                    error: None,
                })
            }
            Action::PageTitle => {
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
            Action::PageClick => {
                let params = cmd
                    .parse_params::<PageClickParams>()
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
            Action::PageFill => {
                let params = cmd
                    .parse_params::<PageFillParams>()
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
            Action::PageGoto => {
                let params = cmd
                    .parse_params::<PageGotoParams>()
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
            Action::PageBack => {
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
            Action::PageForward => {
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
            Action::PageReload => {
                let window = web_sys::window().ok_or("No window available")?;
                window.location().reload().map_err(|e| format!("{:?}", e))?;
                Ok(WasmAsyncResponse {
                    ok: true,
                    value: Some(serde_json::Value::Null),
                    error: None,
                })
            }
            Action::DomSnapshot | Action::PageSnapshot => {
                let params = cmd
                    .parse_params::<DomSnapshotParams>()
                    .map_err(|e| format!("Invalid snapshot params: {}", e))?;
                Ok(execute_dom_snapshot(params))
            }
            Action::PageSnapshotText => {
                let params = cmd
                    .parse_params::<DomSnapshotParams>()
                    .map_err(|e| format!("Invalid snapshot params: {}", e))?;
                let resp = execute_dom_snapshot(params);
                // Extract just the text string from the result
                if let Some(ref value) = resp.value {
                    if let Some(text) = value.get("text").and_then(|t| t.as_str()) {
                        return Ok(WasmAsyncResponse {
                            ok: true,
                            value: Some(serde_json::Value::String(text.to_string())),
                            error: None,
                        });
                    }
                }
                Ok(resp)
            }
            Action::PageSnapshotData => {
                let params = cmd
                    .parse_params::<DomSnapshotParams>()
                    .map_err(|e| format!("Invalid snapshot params: {}", e))?;
                Ok(execute_dom_snapshot(params))
            }
            Action::DomFormat => {
                let params = cmd
                    .parse_params::<DomFormatParams>()
                    .map_err(|e| format!("Invalid dom_format params: {}", e))?;
                Ok(execute_dom_format(params))
            }
            Action::PageScreenshot => Ok(WasmAsyncResponse {
                ok: false,
                value: None,
                error: Some(WasmAsyncError {
                    message: "screenshot not yet implemented in web-lua".into(),
                    code: "E_NOT_IMPLEMENTED".into(),
                }),
            }),
            Action::PageType => {
                let params = cmd
                    .parse_params::<PageTypeParams>()
                    .map_err(|e| format!("Invalid page_type params: {}", e))?;
                Ok(execute_page_type(params).await)
            }
            Action::PagePress => {
                let params = cmd
                    .parse_params::<PagePressParams>()
                    .map_err(|e| format!("Invalid page_press params: {}", e))?;
                Ok(execute_page_press(params).await)
            }
            Action::PageSelect => {
                let params = cmd
                    .parse_params::<PageSelectParams>()
                    .map_err(|e| format!("Invalid page_select params: {}", e))?;
                Ok(execute_page_select(params).await)
            }
            Action::PageCheck => {
                let params = cmd
                    .parse_params::<PageCheckParams>()
                    .map_err(|e| format!("Invalid page_check params: {}", e))?;
                Ok(execute_page_check(params).await)
            }
            Action::PageHover => {
                let params = cmd
                    .parse_params::<PageHoverParams>()
                    .map_err(|e| format!("Invalid page_hover params: {}", e))?;
                Ok(execute_page_hover(params).await)
            }
            Action::PageUnhover => Ok(execute_page_unhover().await),
            Action::PageScroll => {
                let params = cmd
                    .parse_params::<PageScrollParams>()
                    .map_err(|e| format!("Invalid page_scroll params: {}", e))?;
                Ok(execute_page_scroll(params).await)
            }
            Action::PageScrollTo => {
                let params = cmd
                    .parse_params::<PageScrollToParams>()
                    .map_err(|e| format!("Invalid page_scroll_to params: {}", e))?;
                Ok(execute_page_scroll_to(params).await)
            }
            Action::PageDblclick => {
                let params = cmd
                    .parse_params::<PageDblClickParams>()
                    .map_err(|e| format!("Invalid page_dblclick params: {}", e))?;
                Ok(execute_page_dblclick(params).await)
            }
            // Extension-only APIs: return error in web context
            Action::TabQuery
            | Action::TabCreate
            | Action::TabActivate
            | Action::TabClose
            | Action::TabExecuteScript
            | Action::TabClick
            | Action::TabFill
            | Action::TabSnapshot
            | Action::TabScrollTo
            | Action::TabEvaluate
            | Action::TabType
            | Action::TabPress
            | Action::TabSelect
            | Action::TabCheck
            | Action::TabHover
            | Action::TabUnhover
            | Action::TabScroll
            | Action::TabDblclick
            | Action::TabBack
            | Action::TabWaitForLoad
            | Action::TabFetch
            | Action::CookiesGet
            | Action::CookiesSet
            | Action::CookiesDelete
            | Action::CookiesList
            | Action::HistorySearch
            | Action::HistoryDelete
            | Action::BookmarksSearch
            | Action::BookmarksCreate
            | Action::BookmarksDelete
            | Action::NotificationsCreate
            | Action::NotificationsClear
            | Action::ClipboardRead
            | Action::ClipboardWrite
            | Action::ChromeRuntimeSendMessage
            | Action::ChromeTabsQuery
            | Action::ChromeTabsCreate
            | Action::ChromeTabsUpdate
            | Action::ChromeTabsRemove
            | Action::ChromeTabsGet
            | Action::ChromeTabsReload
            | Action::ChromeTabsSendMessage
            | Action::ChromeAlarmsCreate
            | Action::ChromeAlarmsClear
            | Action::ChromeActionSetBadgeText
            | Action::ChromeActionSetBadgeBackgroundColor
            | Action::ChromeActionSetTitle
            | Action::ChromeActionSetIcon
            | Action::ChromeContextMenusCreate
            | Action::ChromeContextMenusRemove
            | Action::ChromeWindowsGetAll
            | Action::ChromeWindowsCreate
            | Action::ChromeWindowsUpdate
            | Action::ChromeWindowsRemove
            | Action::ChromeSidePanelSetOptions
            | Action::ChromeCookiesGet
            | Action::ChromeCookiesSet
            | Action::ChromeCookiesRemove
            | Action::ChromeCookiesGetAll
            | Action::ChromeBookmarksSearch
            | Action::ChromeBookmarksCreate
            | Action::ChromeBookmarksRemove
            | Action::ChromeHistorySearch
            | Action::ChromeHistoryDeleteUrl
            | Action::ChromeNotificationsCreate
            | Action::ChromeNotificationsClear
            | Action::ChromeScriptingExecuteScript
            | Action::PageClose
            | Action::PageActiveTab
            | Action::PageTabs
            | Action::PageSwitch
            | Action::PageNewTab => Err(format!(
                "{} is not available in web-lua context",
                cmd.action
            )),
            Action::StorageGet => {
                let params = cmd
                    .parse_params::<StorageGetParams>()
                    .map_err(|e| format!("Invalid storage_get params: {}", e))?;
                Ok(execute_storage_get(params).await)
            }
            Action::StorageSet => {
                let params = cmd
                    .parse_params::<StorageSetParams>()
                    .map_err(|e| format!("Invalid storage_set params: {}", e))?;
                Ok(execute_storage_set(params).await)
            }
            Action::StorageDelete => {
                let params = cmd
                    .parse_params::<StorageDeleteParams>()
                    .map_err(|e| format!("Invalid storage_delete params: {}", e))?;
                Ok(execute_storage_delete(params).await)
            }
            Action::StorageList => Ok(execute_storage_list().await),
            Action::MockAsync => {
                // Test-only: just return empty success
                Ok(WasmAsyncResponse {
                    ok: true,
                    value: Some(serde_json::Value::Null),
                    error: None,
                })
            }
            Action::Host(host_action) => {
                Ok(execute_host_call(host_action.as_str(), cmd.params.clone()).await)
            }
            Action::Other(action) => Err(format!("Unknown action: {}", action)),
            Action::RuntimeInspect => Err(format!(
                "{} is not available in web-lua context",
                cmd.action
            )),
            Action::UrlParse => Err(format!(
                "{} is not available in web-lua context",
                cmd.action
            )),
            Action::UrlEncode => Err(format!(
                "{} is not available in web-lua context",
                cmd.action
            )),
            Action::WebLog => Err(format!(
                "{} is not available in web-lua context",
                cmd.action
            )),
        }
    }
}
