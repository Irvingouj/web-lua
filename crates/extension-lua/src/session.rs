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
        let _ = session.base.load_library(
            r#"
local function tab_current()
  local tabs = chrome.tabs.query({active = true, currentWindow = true})
  if tabs and tabs[1] then
    return tabs[1].id
  end
  return nil
end
local function tab_url(tab_id)
  local id = tab_id or tab_current()
  if not id then return nil end
  local t = chrome.tabs.get(id)
  return t and t.url
end
local function tab_title(tab_id)
  local id = tab_id or tab_current()
  if not id then return nil end
  local t = chrome.tabs.get(id)
  return t and t.title
end
tab = {
  query = web.tab.query,
  create = web.tab.create,
  activate = web.tab.activate,
  close = web.tab.close,
  execute_script = web.tab.execute_script,
  click = web.tab.click,
  fill = web.tab.fill,
  snapshot = web.tab.snapshot,
  scroll_to = web.tab.scroll_to,
  evaluate = web.tab.evaluate,
  back = web.tab.back,
  wait_for_load = web.tab.wait_for_load,
  fetch = web.tab.fetch,
  open = function(url)
    local t = chrome.tabs.create({url = url or ""})
    return t and t.id
  end,
  current = tab_current,
  focus = function(tab_id)
    local id = tab_id or tab_current()
    if id then
      chrome.tabs.update(id, {active = true})
    end
    return id
  end,
  url = tab_url,
  title = tab_title,
  reload = function(tab_id)
    local id = tab_id or tab_current()
    if id then
      chrome.tabs.reload(id)
    end
    return id
  end,
}
runtime = {
  fetch = web.fetch,
  sleep = web.sleep,
  storage = web.storage,
  clipboard = web.clipboard,
  notifications = web.notifications,
}
page.fetch = function(url, opts)
  return tab.fetch(tab.current(), url, opts)
end
"#,
        );
        session
    }

    /// Reset the session, clearing all Lua state.
    pub fn reset(&mut self) {
        self.base.reset();
        let _ = self.base.load_library(
            r#"
local function tab_current()
  local tabs = chrome.tabs.query({active = true, currentWindow = true})
  if tabs and tabs[1] then
    return tabs[1].id
  end
  return nil
end
local function tab_url(tab_id)
  local id = tab_id or tab_current()
  if not id then return nil end
  local t = chrome.tabs.get(id)
  return t and t.url
end
local function tab_title(tab_id)
  local id = tab_id or tab_current()
  if not id then return nil end
  local t = chrome.tabs.get(id)
  return t and t.title
end
tab = {
  query = web.tab.query,
  create = web.tab.create,
  activate = web.tab.activate,
  close = web.tab.close,
  execute_script = web.tab.execute_script,
  click = web.tab.click,
  fill = web.tab.fill,
  snapshot = web.tab.snapshot,
  scroll_to = web.tab.scroll_to,
  evaluate = web.tab.evaluate,
  back = web.tab.back,
  wait_for_load = web.tab.wait_for_load,
  fetch = web.tab.fetch,
  open = function(url)
    local t = chrome.tabs.create({url = url or ""})
    return t and t.id
  end,
  current = tab_current,
  focus = function(tab_id)
    local id = tab_id or tab_current()
    if id then
      chrome.tabs.update(id, {active = true})
    end
    return id
  end,
  url = tab_url,
  title = tab_title,
  reload = function(tab_id)
    local id = tab_id or tab_current()
    if id then
      chrome.tabs.reload(id)
    end
    return id
  end,
}
runtime = {
  fetch = web.fetch,
  sleep = web.sleep,
  storage = web.storage,
  clipboard = web.clipboard,
  notifications = web.notifications,
}
page.fetch = function(url, opts)
  return tab.fetch(tab.current(), url, opts)
end
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
    #[wasm_bindgen(js_name = stopWith)]
    pub fn stop_with(&mut self) {
        self.base.reset();
    }

    /// Run a cell, automatically resolving all async calls by relaying
    /// them to the main-thread runner via `__extension_lua_relay`.
    #[wasm_bindgen(js_name = runCellAsync)]
    pub async fn run_cell_async(&mut self, code: String, stdin: String) -> CellResult {
        let mut result = self.base.run_cell(&code, &stdin);

        while result.status == WasmCellStatus::AsyncPending {
            let cmd = match result.pending_command {
                Some(ref c) => c,
                None => break,
            };

            let response = match self.handle_command(cmd).await {
                Ok(r) => {
                    log_debug(&format!("[ExtensionSession] async response: action={}", cmd.action));
                    r
                }
                Err(e) => {
                    log_error(&format!("[ExtensionSession] async relay error: action={}, err={}", cmd.action, e));
                    let err_json = serde_json::to_string(&WasmAsyncResponse {
                        ok: false,
                        value: None,
                        error: Some(WasmAsyncError {
                            message: e,
                            code: "E_RELAY_ERROR".into(),
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

        result.into()
    }
}

impl ExtensionSession {
    async fn handle_command(
        &mut self,
        cmd: &WasmAsyncCommand,
    ) -> Result<WasmAsyncResponse, String> {
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

        log_debug(&format!("[ExtensionSession] deserialized response: ok={}", resp.ok));
        Ok(resp)
    }
}
