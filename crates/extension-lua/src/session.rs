use crate::log::{log_debug, log_error};
use wasm_bindgen::prelude::*;
use wasm_bindgen_futures::JsFuture;
use web_lua_base::types::*;
use web_lua_base::BaseSession;

#[wasm_bindgen]
extern "C" {
    /// Global JS function injected by the Worker bootstrap code.
    /// Takes a WasmAsyncCommand as a JS object, relays it to the
    /// main-thread runner via postMessage, and returns a Promise
    /// that resolves with the WasmAsyncResponse.
    #[wasm_bindgen(js_name = __extension_lua_relay)]
    fn extension_lua_relay(cmd: JsValue) -> js_sys::Promise;
}

// ─── ExtensionSession ───────────────────────────────────────────

/// ExtensionSession wraps BaseSession for the Chrome Extension environment.
/// WASM runs inside a Web Worker; all browser side-effects are relayed
/// to the main-thread runner via the `__extension_lua_relay` global function.
#[wasm_bindgen]
pub struct ExtensionSession {
    base: BaseSession,
}

impl Default for ExtensionSession {
    fn default() -> Self {
        Self::new()
    }
}

#[wasm_bindgen]
impl ExtensionSession {
    /// Create a new extension session.
    /// Automatically injects Lua aliases for the designed namespace
    /// (`tab.*`, `chrome.*`, `runtime.*`, etc.).
    #[wasm_bindgen(constructor)]
    pub fn new() -> Self {
        let mut session = Self {
            base: BaseSession::new(),
        };
        // Inject Lua aliases so the Lua API surface matches the design
        let _ = session.base.load_library(include_str!("prelude.lua"));
        let _ = session.base.load_library(web_lua_core::PATH_PRELUDE);
        // Register injected alias metadata
        web_lua_core::lua_api_doc!(
            namespace: "tab",
            name: "current",
            action: "",
            doc: "Get the active tab ID.",
            source: "injected_lua",
            params: [],
            returns: "number | nil" => "Tab ID or nil",
        );
        web_lua_core::lua_api_doc!(
            namespace: "tab",
            name: "url",
            action: "",
            doc: "Get the URL of a tab (defaults to current tab).",
            source: "injected_lua",
            params: [
                tab_id: "number | nil", optional, "Tab ID",
            ],
            returns: "string | nil" => "URL or nil",
        );
        web_lua_core::lua_api_doc!(
            namespace: "tab",
            name: "title",
            action: "",
            doc: "Get the title of a tab (defaults to current tab).",
            source: "injected_lua",
            params: [
                tab_id: "number | nil", optional, "Tab ID",
            ],
            returns: "string | nil" => "Title or nil",
        );
        web_lua_core::lua_api_doc!(
            namespace: "tab",
            name: "open",
            action: "",
            doc: "Create a new tab and return its ID.",
            source: "injected_lua",
            params: [
                url: "string | nil", optional, "URL to open",
            ],
            returns: "number | nil" => "New tab ID or nil",
        );
        web_lua_core::lua_api_doc!(
            namespace: "tab",
            name: "focus",
            action: "",
            doc: "Activate (focus) a tab (defaults to current tab).",
            source: "injected_lua",
            params: [
                tab_id: "number | nil", optional, "Tab ID",
            ],
            returns: "number | nil" => "Focused tab ID or nil",
        );
        web_lua_core::lua_api_doc!(
            namespace: "tab",
            name: "reload",
            action: "",
            doc: "Reload a tab (defaults to current tab).",
            source: "injected_lua",
            params: [
                tab_id: "number | nil", optional, "Tab ID",
            ],
            returns: "number | nil" => "Reloaded tab ID or nil",
        );
        // tab.* aliases to web.tab.*
        web_lua_core::lua_api_doc!(namespace: "tab", name: "query", action: "tab_query", doc: "Alias for web.tab.query.", source: "injected_lua", params: [query_info: "table", optional, "Query filter"], returns: "table" => "Array of matching tabs");
        web_lua_core::lua_api_doc!(namespace: "tab", name: "create", action: "tab_create", doc: "Alias for web.tab.create.", source: "injected_lua", params: [create_properties: "table", optional, "Tab properties"], returns: "table" => "Created tab object");
        web_lua_core::lua_api_doc!(namespace: "tab", name: "activate", action: "tab_activate", doc: "Alias for web.tab.activate.", source: "injected_lua", params: [tab_id: "number", required, "Tab ID"], returns: "boolean" => "Whether activation succeeded");
        web_lua_core::lua_api_doc!(namespace: "tab", name: "close", action: "tab_close", doc: "Alias for web.tab.close.", source: "injected_lua", params: [tab_id: "number", required, "Tab ID"], returns: "boolean" => "Whether close succeeded");
        web_lua_core::lua_api_doc!(namespace: "tab", name: "execute_script", action: "tab_execute_script", doc: "Alias for web.tab.execute_script.", source: "injected_lua", params: [tab_id: "number", required, "Tab ID", script: "string | table", required, "Script to inject"], returns: "table" => "Injection results");
        web_lua_core::lua_api_doc!(namespace: "tab", name: "click", action: "tab_click", doc: "Alias for web.tab.click.", source: "injected_lua", params: [tab_id: "number", required, "Tab ID", ref_id: "number", required, "Element refId"], returns: "boolean" => "Whether click succeeded");
        web_lua_core::lua_api_doc!(namespace: "tab", name: "fill", action: "tab_fill", doc: "Alias for web.tab.fill.", source: "injected_lua", params: [tab_id: "number", required, "Tab ID", ref_id: "number", required, "Element refId", value: "string", required, "Text to fill"], returns: "boolean" => "Whether fill succeeded");
        web_lua_core::lua_api_doc!(namespace: "tab", name: "snapshot", action: "tab_snapshot", doc: "Alias for web.tab.snapshot. Returns human-readable text. Defaults to active tab.", source: "injected_lua", params: [tab_id: "number", optional, "Tab ID (defaults to active tab)"], returns: "string" => "Human-readable accessibility tree with refIds");
        web_lua_core::lua_api_doc!(namespace: "tab", name: "snapshot_text", action: "tab_snapshot_text", doc: "Alias for web.tab.snapshot_text. Defaults to active tab.", source: "injected_lua", params: [tab_id: "number", optional, "Tab ID (defaults to active tab)"], returns: "string" => "Human-readable accessibility tree with refIds");
        web_lua_core::lua_api_doc!(namespace: "tab", name: "snapshot_data", action: "tab_snapshot_data", doc: "Alias for web.tab.snapshot_data. Defaults to active tab.", source: "injected_lua", params: [tab_id: "number", optional, "Tab ID (defaults to active tab)"], returns: "table" => "Structured snapshot with nodes, url, title, viewport");
        web_lua_core::lua_api_doc!(namespace: "tab", name: "scroll_to", action: "tab_scroll_to", doc: "Alias for web.tab.scroll_to.", source: "injected_lua", params: [tab_id: "number", required, "Tab ID", ref_id: "number", required, "Element refId"], returns: "boolean" => "Whether scroll succeeded");
        web_lua_core::lua_api_doc!(namespace: "tab", name: "evaluate", action: "tab_evaluate", doc: "Alias for web.tab.evaluate.", source: "injected_lua", params: [tab_id: "number", required, "Tab ID", script: "string", required, "JavaScript to evaluate"], returns: "any" => "Evaluation result");
        web_lua_core::lua_api_doc!(namespace: "tab", name: "back", action: "tab_back", doc: "Alias for web.tab.back.", source: "injected_lua", params: [tab_id: "number", required, "Tab ID"], returns: "boolean" => "Whether navigation succeeded");
        web_lua_core::lua_api_doc!(namespace: "tab", name: "wait_for_load", action: "tab_wait_for_load", doc: "Alias for web.tab.wait_for_load.", source: "injected_lua", params: [tab_id: "number", required, "Tab ID"], returns: "boolean" => "Whether tab loaded");
        web_lua_core::lua_api_doc!(namespace: "tab", name: "fetch", action: "tab_fetch", doc: "Alias for web.tab.fetch.", source: "injected_lua", params: [tab_id: "number", required, "Tab ID", url: "string", required, "URL", opts: "table | nil", optional, "Options"], returns: "table" => "{ status, ok, body, headers }");
        // runtime.* aliases
        web_lua_core::lua_api_doc!(namespace: "runtime", name: "fetch", action: "fetch", doc: "Alias for web.fetch.", source: "injected_lua", params: [url: "string", required, "URL", opts: "table | nil", optional, "Options"], returns: "table" => "{ status, ok, body, headers }");
        web_lua_core::lua_api_doc!(namespace: "runtime", name: "sleep", action: "sleep", doc: "Alias for web.sleep.", source: "injected_lua", params: [ms: "number", optional, "Milliseconds"], returns: "nil" => "None");
        web_lua_core::lua_api_doc!(namespace: "runtime", name: "storage", action: "", doc: "Alias for web.storage.", source: "injected_lua", params: [], returns: "table" => "Storage API table");
        web_lua_core::lua_api_doc!(namespace: "runtime", name: "clipboard", action: "", doc: "Alias for web.clipboard.", source: "injected_lua", params: [], returns: "table" => "Clipboard API table");
        web_lua_core::lua_api_doc!(namespace: "runtime", name: "notifications", action: "", doc: "Alias for web.notifications.", source: "injected_lua", params: [], returns: "table" => "Notifications API table");
        // page aliases
        web_lua_core::lua_api_doc!(
            namespace: "page",
            name: "go",
            action: "",
            doc: "Navigate to a URL (alias for page.goto).",
            source: "injected_lua",
            params: [
                url: "string", required, "URL to navigate to",
            ],
            returns: "nil" => "None",
        );
        web_lua_core::lua_api_doc!(
            namespace: "page",
            name: "open",
            action: "",
            doc: "Open a new tab (alias for page.new_tab).",
            source: "injected_lua",
            params: [
                url: "string | nil", optional, "URL to open in the new tab",
            ],
            returns: "table" => "Created tab object",
        );
        // page.fetch wrapper
        web_lua_core::lua_api_doc!(
            namespace: "page",
            name: "fetch",
            action: "",
            doc: "Fetch a URL using the active tab origin (wrapper for tab.fetch).",
            source: "injected_lua",
            params: [
                url: "string", required, "URL to fetch",
                opts: "table | nil", optional, "Options: method, body, headers, timeout",
            ],
            returns: "table" => "{ status, ok, body, headers }",
        );
        web_lua_core::lua_api_doc!(
            namespace: "path",
            name: "join",
            action: "",
            doc: "Join path segments into an absolute VFS path.",
            source: "injected_lua",
            params: [
                parts: "string", required, "Path segments to join",
            ],
            returns: "string" => "Joined absolute path",
        );
        web_lua_core::lua_api_doc!(
            namespace: "path",
            name: "basename",
            action: "",
            doc: "Get the last component of a path.",
            source: "injected_lua",
            params: [
                path: "string", required, "Absolute VFS path",
            ],
            returns: "string" => "File or directory name",
        );
        web_lua_core::lua_api_doc!(
            namespace: "path",
            name: "dirname",
            action: "",
            doc: "Get the directory portion of a path.",
            source: "injected_lua",
            params: [
                path: "string", required, "Absolute VFS path",
            ],
            returns: "string" => "Parent directory path",
        );
        web_lua_core::lua_api_doc!(
            namespace: "path",
            name: "extname",
            action: "",
            doc: "Get the file extension including the leading dot.",
            source: "injected_lua",
            params: [
                path: "string", required, "Absolute VFS path",
            ],
            returns: "string" => "Extension or empty string",
        );
        web_lua_core::lua_api_doc!(
            namespace: "path",
            name: "normalize",
            action: "",
            doc: "Resolve . and .. segments in a path.",
            source: "injected_lua",
            params: [
                path: "string", required, "Absolute VFS path",
            ],
            returns: "string" => "Normalized absolute path",
        );
        web_lua_core::lua_api_doc!(
            namespace: "path",
            name: "is_absolute",
            action: "",
            doc: "Check whether a path is absolute (starts with /).",
            source: "injected_lua",
            params: [
                path: "string", required, "Path to check",
            ],
            returns: "boolean" => "true if absolute",
        );

        session
    }

    /// Reset the session, clearing all Lua state.
    pub fn reset(&mut self) {
        self.base.reset();
        let _ = self.base.load_library(include_str!("prelude.lua"));
        let _ = self.base.load_library(web_lua_core::PATH_PRELUDE);
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
    #[wasm_bindgen(js_name = stopWith)]
    pub fn stop_with(&mut self) {
        self.base.reset();
    }

    /// Run a cell, automatically resolving all async calls by relaying
    /// them to the main-thread runner via `__extension_lua_relay`.
    #[wasm_bindgen(js_name = runCellAsync)]
    pub async fn run_cell_async(&mut self, code: String, stdin: String) -> CellResult {
        let result = web_lua_base::run_cell_async_loop(
            &mut self.base,
            &code,
            &stdin,
            |cmd| async move {
                let action = cmd.action.clone();
                match ExtensionSession::handle_command(&cmd).await {
                    Ok(r) => {
                        log_debug(&format!(
                            "[ExtensionSession] async response: action={}",
                            action
                        ));
                        Ok(r)
                    }
                    Err(e) => {
                        log_error(&format!(
                            "[ExtensionSession] async relay error: action={}, err={}",
                            action, e
                        ));
                        Err(WasmAsyncError {
                            message: e,
                            code: "E_RELAY_ERROR".into(),
                        })
                    }
                }
            },
            None,
        )
        .await;

        let mut cell_result: CellResult = result.into();
        if let CellResult::Ok {
            ref mut stdout,
            ref result,
            ..
        } = cell_result
        {
            if stdout.is_empty() && result.is_some() {
                stdout.push(StdOutOrAuto::Auto {
                    line: result.clone().unwrap(),
                });
            }
        }
        cell_result
    }
}

impl ExtensionSession {
    async fn handle_command(cmd: &WasmAsyncCommand) -> Result<WasmAsyncResponse, String> {
        if cmd.action.starts_with("fs_") {
            return Self::handle_fs_command(cmd).await;
        }
        // Serialize command to a JSON string, then parse to a JS object.
        // This avoids serde_wasm_bindgen's default map-to-JS-Map behavior,
        // ensuring serde_json::Value::Object becomes a plain JS Object.
        let json_str = serde_json::to_string(cmd)
            .map_err(|e| format!("Failed to serialize command: {:?}", e))?;
        let js_cmd = js_sys::JSON::parse(&json_str)
            .map_err(|e| format!("Failed to parse command JSON: {:?}", e))?;

        let promise = extension_lua_relay(js_cmd);
        let resp_js = JsFuture::from(promise)
            .await
            .map_err(|e| format!("Relay promise rejected: {:?}", e))?;

        // Stringify the JS response and parse as JSON to avoid
        // serde_wasm_bindgen deserialization quirks with nested objects.
        let resp_json_str = js_sys::JSON::stringify(&resp_js)
            .map_err(|e| format!("Failed to stringify response: {:?}", e))?
            .as_string()
            .ok_or_else(|| "JSON.stringify returned non-string".to_string())?;
        let resp: WasmAsyncResponse = serde_json::from_str(&resp_json_str)
            .map_err(|e| format!("Failed to deserialize response: {:?}", e))?;

        log_debug(&format!(
            "[ExtensionSession] deserialized response: ok={}",
            resp.ok
        ));
        Ok(resp)
    }

    async fn handle_fs_command(cmd: &WasmAsyncCommand) -> Result<WasmAsyncResponse, String> {
        fn ok(value: serde_json::Value) -> WasmAsyncResponse {
            WasmAsyncResponse {
                ok: true,
                value: Some(value),
                error: None,
            }
        }
        fn err(e: web_fs::FsError) -> WasmAsyncResponse {
            WasmAsyncResponse {
                ok: false,
                value: None,
                error: Some(WasmAsyncError {
                    message: e.wire_message(),
                    code: e.wire_code().into(),
                }),
            }
        }

        match cmd.action.as_str() {
            "fs_exists" => {
                let params: web_lua_core::command_params::FsPathParams = cmd
                    .parse_params()
                    .map_err(|e| format!("Invalid params: {}", e))?;
                Ok(ok(serde_json::Value::Bool(
                    web_fs::exists(&params.path).await,
                )))
            }
            "fs_stat" => {
                let params: web_lua_core::command_params::FsPathParams = cmd
                    .parse_params()
                    .map_err(|e| format!("Invalid params: {}", e))?;
                match web_fs::stat(&params.path).await {
                    Ok(meta) => match serde_json::to_value(&meta) {
                        Ok(v) => Ok(ok(v)),
                        Err(e) => Ok(err(web_fs::FsError::Io(format!(
                            "Failed to serialize metadata: {}",
                            e
                        )))),
                    },
                    Err(e) => Ok(err(e)),
                }
            }
            "fs_list" => {
                let params: web_lua_core::command_params::FsPathParams = cmd
                    .parse_params()
                    .map_err(|e| format!("Invalid params: {}", e))?;
                match web_fs::list(&params.path).await {
                    Ok(entries) => match serde_json::to_value(&entries) {
                        Ok(v) => Ok(ok(v)),
                        Err(e) => Ok(err(web_fs::FsError::Io(format!(
                            "Failed to serialize entries: {}",
                            e
                        )))),
                    },
                    Err(e) => Ok(err(e)),
                }
            }
            "fs_mkdir" => {
                let params: web_lua_core::command_params::FsPathParams = cmd
                    .parse_params()
                    .map_err(|e| format!("Invalid params: {}", e))?;
                match web_fs::mkdir(&params.path).await {
                    Ok(()) => Ok(ok(serde_json::Value::Bool(true))),
                    Err(e) => Ok(err(e)),
                }
            }
            "fs_delete" => {
                let params: web_lua_core::command_params::FsPathParams = cmd
                    .parse_params()
                    .map_err(|e| format!("Invalid params: {}", e))?;
                match web_fs::delete(&params.path).await {
                    Ok(()) => Ok(ok(serde_json::Value::Bool(true))),
                    Err(e) => Ok(err(e)),
                }
            }
            "fs_copy" => {
                let params: web_lua_core::command_params::FsCopyParams = cmd
                    .parse_params()
                    .map_err(|e| format!("Invalid params: {}", e))?;
                match web_fs::copy(&params.from, &params.to).await {
                    Ok(()) => Ok(ok(serde_json::Value::Bool(true))),
                    Err(e) => Ok(err(e)),
                }
            }
            "fs_move" => {
                let params: web_lua_core::command_params::FsCopyParams = cmd
                    .parse_params()
                    .map_err(|e| format!("Invalid params: {}", e))?;
                match web_fs::rename(&params.from, &params.to).await {
                    Ok(()) => Ok(ok(serde_json::Value::Bool(true))),
                    Err(e) => Ok(err(e)),
                }
            }
            "fs_read" => {
                let params: web_lua_core::command_params::FsPathParams = cmd
                    .parse_params()
                    .map_err(|e| format!("Invalid params: {}", e))?;
                match web_fs::read(&params.path).await {
                    Ok(bytes) => Ok(ok(serde_json::Value::String(
                        data_encoding::BASE64.encode(&bytes),
                    ))),
                    Err(e) => Ok(err(e)),
                }
            }
            "fs_read_text" => {
                let params: web_lua_core::command_params::FsPathParams = cmd
                    .parse_params()
                    .map_err(|e| format!("Invalid params: {}", e))?;
                match web_fs::read_text(&params.path).await {
                    Ok(text) => Ok(ok(serde_json::Value::String(text))),
                    Err(e) => Ok(err(e)),
                }
            }
            "fs_read_base64" => {
                let params: web_lua_core::command_params::FsPathParams = cmd
                    .parse_params()
                    .map_err(|e| format!("Invalid params: {}", e))?;
                match web_fs::read_base64(&params.path).await {
                    Ok(text) => Ok(ok(serde_json::Value::String(text))),
                    Err(e) => Ok(err(e)),
                }
            }
            "fs_read_range" => {
                let params: web_lua_core::command_params::FsReadRangeParams = cmd
                    .parse_params()
                    .map_err(|e| format!("Invalid params: {}", e))?;
                match web_fs::read_range(&params.path, params.offset, params.len).await {
                    Ok(bytes) => Ok(ok(serde_json::Value::String(
                        data_encoding::BASE64.encode(&bytes),
                    ))),
                    Err(e) => Ok(err(e)),
                }
            }
            "fs_write" => {
                let params: web_lua_core::command_params::FsWriteParams = cmd
                    .parse_params()
                    .map_err(|e| format!("Invalid params: {}", e))?;
                let data = match data_encoding::BASE64.decode(params.data.as_bytes()) {
                    Ok(d) => d,
                    Err(_) => {
                        return Ok(WasmAsyncResponse {
                            ok: false,
                            value: None,
                            error: Some(WasmAsyncError {
                                message: "Invalid base64 data".into(),
                                code: "E_INVALID_ENCODING".into(),
                            }),
                        })
                    }
                };
                match web_fs::write(&params.path, &data).await {
                    Ok(()) => Ok(ok(serde_json::Value::Bool(true))),
                    Err(e) => Ok(err(e)),
                }
            }
            "fs_write_text" => {
                let params: web_lua_core::command_params::FsWriteParams = cmd
                    .parse_params()
                    .map_err(|e| format!("Invalid params: {}", e))?;
                match web_fs::write_text(&params.path, &params.data).await {
                    Ok(()) => Ok(ok(serde_json::Value::Bool(true))),
                    Err(e) => Ok(err(e)),
                }
            }
            "fs_write_base64" => {
                let params: web_lua_core::command_params::FsWriteParams = cmd
                    .parse_params()
                    .map_err(|e| format!("Invalid params: {}", e))?;
                match web_fs::write_base64(&params.path, &params.data).await {
                    Ok(()) => Ok(ok(serde_json::Value::Bool(true))),
                    Err(e) => Ok(err(e)),
                }
            }
            "fs_append" => {
                let params: web_lua_core::command_params::FsWriteParams = cmd
                    .parse_params()
                    .map_err(|e| format!("Invalid params: {}", e))?;
                let data = match data_encoding::BASE64.decode(params.data.as_bytes()) {
                    Ok(d) => d,
                    Err(_) => {
                        return Ok(WasmAsyncResponse {
                            ok: false,
                            value: None,
                            error: Some(WasmAsyncError {
                                message: "Invalid base64 data".into(),
                                code: "E_INVALID_ENCODING".into(),
                            }),
                        })
                    }
                };
                match web_fs::append(&params.path, &data).await {
                    Ok(()) => Ok(ok(serde_json::Value::Bool(true))),
                    Err(e) => Ok(err(e)),
                }
            }
            "fs_append_text" => {
                let params: web_lua_core::command_params::FsWriteParams = cmd
                    .parse_params()
                    .map_err(|e| format!("Invalid params: {}", e))?;
                match web_fs::append_text(&params.path, &params.data).await {
                    Ok(()) => Ok(ok(serde_json::Value::Bool(true))),
                    Err(e) => Ok(err(e)),
                }
            }
            "fs_append_base64" => {
                let params: web_lua_core::command_params::FsWriteParams = cmd
                    .parse_params()
                    .map_err(|e| format!("Invalid params: {}", e))?;
                match web_fs::append_base64(&params.path, &params.data).await {
                    Ok(()) => Ok(ok(serde_json::Value::Bool(true))),
                    Err(e) => Ok(err(e)),
                }
            }
            "fs_update" => {
                let params: web_lua_core::command_params::FsUpdateParams = cmd
                    .parse_params()
                    .map_err(|e| format!("Invalid params: {}", e))?;
                let data = match data_encoding::BASE64.decode(params.data.as_bytes()) {
                    Ok(d) => d,
                    Err(_) => {
                        return Ok(WasmAsyncResponse {
                            ok: false,
                            value: None,
                            error: Some(WasmAsyncError {
                                message: "Invalid base64 data".into(),
                                code: "E_INVALID_ENCODING".into(),
                            }),
                        })
                    }
                };
                match web_fs::update(&params.path, params.offset, &data).await {
                    Ok(()) => Ok(ok(serde_json::Value::Bool(true))),
                    Err(e) => Ok(err(e)),
                }
            }
            "fs_hash" => {
                let params: web_lua_core::command_params::FsHashParams = cmd
                    .parse_params()
                    .map_err(|e| format!("Invalid params: {}", e))?;
                match web_fs::hash(&params.path, &params.algo).await {
                    Ok(hex) => Ok(ok(serde_json::Value::String(hex))),
                    Err(e) => Ok(err(e)),
                }
            }
            _ => Err(format!("Unknown fs action: {}", cmd.action)),
        }
    }
}
