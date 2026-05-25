pub mod collect;
pub mod format;
pub mod geometry;
pub mod model;
pub mod name;
pub mod refs;
pub mod role;
pub mod state;
pub mod visibility;

#[cfg(feature = "wasm")]
use wasm_bindgen::prelude::*;
#[cfg(feature = "wasm")]
use web_sys::Element;

/// Semantic version string.
pub fn version() -> String {
    env!("CARGO_PKG_VERSION").to_string()
}

#[cfg(feature = "wasm")]
#[wasm_bindgen]
pub fn collect_document(options: JsValue) -> JsValue {
    collect::collect_document(options)
}

#[cfg(feature = "wasm")]
#[wasm_bindgen]
pub fn collect_element(root: &Element, options: JsValue) -> JsValue {
    collect::collect_element_js(root, &options)
}

#[cfg(feature = "wasm")]
#[wasm_bindgen]
pub fn format_snapshot_js(snapshot: JsValue, format: Option<String>) -> String {
    let snap: crate::model::TreeSnapshot =
        serde_wasm_bindgen::from_value(snapshot).unwrap_or_default();
    let fmt = format.as_deref().unwrap_or("compact-text");
    crate::format::format_snapshot(&snap, fmt)
}

#[cfg(feature = "wasm")]
#[wasm_bindgen]
pub fn version_js() -> String {
    version()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_version() {
        assert_eq!(version(), env!("CARGO_PKG_VERSION"));
    }
}
