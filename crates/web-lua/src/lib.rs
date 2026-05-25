pub mod browser_api;
pub mod session;

pub use session::WebSession;

use wasm_bindgen::prelude::*;

/// Generate API documentation in the requested format ("json" or "markdown").
/// Creates a temporary session to ensure the registry is populated.
#[wasm_bindgen(js_name = generateApiDocs)]
pub fn generate_api_docs(format: &str) -> String {
    let _session = WebSession::new();
    web_lua_core::api_docs::generate(format)
}
