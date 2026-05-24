//! WASM wrapper for dom-semantic-tree.
//! This crate builds as a separate WASM module loaded in the main thread
//! (where DOM access is available). The Lua worker relays dom.snapshot() calls
//! through the main thread to invoke these functions.

use wasm_bindgen::prelude::*;

/// Collect a semantic snapshot of the entire document.
/// Returns a JS object with { version, url, title, viewport, nodes, outline }.
#[wasm_bindgen(js_name = collectDocument)]
pub fn collect_document(options: JsValue) -> JsValue {
    dom_semantic_tree::collect::collect_document(options)
}

/// Collect a semantic snapshot starting from a specific root element.
#[wasm_bindgen(js_name = collectElement)]
pub fn collect_element(root: &web_sys::Element, options: JsValue) -> JsValue {
    dom_semantic_tree::collect::collect_element_js(root, &options)
}

/// Format a snapshot into compact text, JSON, or pretty JSON.
/// `format` can be "compact-text" (default), "json", or "json-pretty".
/// Accepts either a JS object or a JSON string.
#[wasm_bindgen(js_name = formatSnapshot)]
pub fn format_snapshot(snapshot: JsValue, format: Option<String>) -> String {
    // Try serde_wasm_bindgen first, fall back to JSON string parsing
    let snap: dom_semantic_tree::model::TreeSnapshot =
        if let Ok(s) = serde_wasm_bindgen::from_value(snapshot.clone()) {
            s
        } else if snapshot.is_string() {
            // If it's a JSON string, parse directly
            let json_str = snapshot.as_string().unwrap_or_default();
            serde_json::from_str(&json_str).unwrap_or_default()
        } else {
            // Last resort: convert to JSON string via JS, then parse
            let json_str = js_sys::JSON::stringify(&snapshot)
                .map(|s| s.as_string().unwrap_or_default())
                .unwrap_or_default();
            serde_json::from_str(&json_str).unwrap_or_default()
        };
    let fmt = format.as_deref().unwrap_or("compact-text");
    dom_semantic_tree::format::format_snapshot(&snap, fmt)
}

/// Get the version of dom-semantic-tree.
#[wasm_bindgen(js_name = getVersion)]
pub fn get_version() -> String {
    dom_semantic_tree::version()
}
