pub mod log;
pub mod session;

pub use log::set_log_level;
pub use session::ExtensionSession;

use wasm_bindgen::prelude::*;

/// Generate API documentation in the requested format.
/// Creates a temporary session to ensure the registry is populated.
#[wasm_bindgen(js_name = generateApiDocs)]
pub fn generate_api_docs(format: web_lua_core::api_docs::ApiDocFormat) -> String {
    let _session = ExtensionSession::new();
    web_lua_core::api_docs::generate(format)
}
