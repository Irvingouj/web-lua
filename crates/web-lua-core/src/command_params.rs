use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use ts_rs::TS;

// ─── Default helpers ─────────────────────────────────────────────

fn default_get() -> String {
    "GET".to_string()
}

fn default_timeout() -> u64 {
    30_000
}

fn default_wait_ms() -> u64 {
    1000
}

fn default_scroll_direction() -> String {
    "down".to_string()
}

fn default_scroll_amount() -> f64 {
    300.0
}

fn default_true() -> bool {
    true
}

fn default_false() -> bool {
    false
}

fn default_max_nodes() -> u64 {
    500
}

fn default_compact_text() -> String {
    "compact-text".to_string()
}

// ─── Normalization helpers ─────────────────────────────────────
/// Convert an array of positional args into a named object so serde
/// can deserialize it into a typed struct.
pub fn normalize_array_params(value: serde_json::Value, fields: &[&str]) -> serde_json::Value {
    match value {
        serde_json::Value::Array(arr) => {
            let mut map = serde_json::Map::new();
            for (i, field) in fields.iter().enumerate() {
                if let Some(v) = arr.get(i) {
                    map.insert(field.to_string(), v.clone());
                }
            }
            serde_json::Value::Object(map)
        }
        other => other,
    }
}

// ─── web.* ───────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export_to = "web/src/types/generated.ts")]
pub struct FetchParams {
    pub url: String,
    #[serde(default = "default_get")]
    pub method: String,
    #[serde(default)]
    pub headers: HashMap<String, String>,
    pub body: Option<String>,
    #[serde(default = "default_timeout")]
    pub timeout: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export_to = "web/src/types/generated.ts")]
pub struct SleepParams {
    pub duration: u64,
}

// ─── page.* ──────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export_to = "web/src/types/generated.ts")]
pub struct PageClickParams {
    #[serde(rename = "refId")]
    pub ref_id: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export_to = "web/src/types/generated.ts")]
pub struct PageDblClickParams {
    #[serde(rename = "refId")]
    pub ref_id: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export_to = "web/src/types/generated.ts")]
pub struct PageFillParams {
    #[serde(rename = "refId")]
    pub ref_id: String,
    pub value: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export_to = "web/src/types/generated.ts")]
pub struct PageTypeParams {
    #[serde(rename = "refId")]
    pub ref_id: String,
    pub text: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export_to = "web/src/types/generated.ts")]
pub struct PagePressParams {
    pub key: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export_to = "web/src/types/generated.ts")]
pub struct PageSelectParams {
    #[serde(rename = "refId")]
    pub ref_id: String,
    pub value: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export_to = "web/src/types/generated.ts")]
pub struct PageCheckParams {
    #[serde(rename = "refId")]
    pub ref_id: String,
    #[serde(default = "default_true")]
    pub checked: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export_to = "web/src/types/generated.ts")]
pub struct PageHoverParams {
    #[serde(rename = "refId")]
    pub ref_id: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export_to = "web/src/types/generated.ts")]
pub struct PageScrollParams {
    #[serde(default = "default_scroll_direction")]
    pub direction: String,
    #[serde(default = "default_scroll_amount")]
    pub amount: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export_to = "web/src/types/generated.ts")]
pub struct PageScrollToParams {
    #[serde(rename = "refId")]
    pub ref_id: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export_to = "web/src/types/generated.ts")]
pub struct PageGotoParams {
    pub url: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export_to = "web/src/types/generated.ts")]
pub struct PageWaitParams {
    #[serde(default = "default_wait_ms", rename = "duration")]
    pub ms: u64,
}

// ─── storage.* ───────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export_to = "web/src/types/generated.ts")]
pub struct StorageGetParams {
    pub key: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export_to = "web/src/types/generated.ts")]
pub struct StorageSetParams {
    pub key: String,
    pub value: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export_to = "web/src/types/generated.ts")]
pub struct StorageDeleteParams {
    pub key: String,
}

// ─── dom.* ───────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export_to = "web/src/types/generated.ts")]
pub struct DomSnapshotParams {
    #[serde(default = "default_false")]
    pub interactive_only: bool,
    #[serde(default = "default_max_nodes")]
    pub max_nodes: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export_to = "web/src/types/generated.ts")]
pub struct DomFormatParams {
    #[ts(type = "unknown")]
    pub snapshot: serde_json::Value,
    #[serde(default = "default_compact_text")]
    pub format: String,
}

// ─── web.tab.* ───────────────────────────────────────────────────
// These may arrive as arrays ([tab_id, ref_id, ...]) or objects.
// Use the normalize_array_params helper before deserializing.

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export_to = "web/src/types/generated.ts")]
pub struct TabClickParams {
    #[serde(rename = "tabId")]
    pub tab_id: u64,
    #[serde(rename = "refId")]
    pub ref_id: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export_to = "web/src/types/generated.ts")]
pub struct TabFillParams {
    #[serde(rename = "tabId")]
    pub tab_id: u64,
    #[serde(rename = "refId")]
    pub ref_id: String,
    pub value: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export_to = "web/src/types/generated.ts")]
pub struct TabEvaluateParams {
    #[serde(rename = "tabId")]
    pub tab_id: u64,
    pub script: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export_to = "web/src/types/generated.ts")]
pub struct TabBackParams {
    #[serde(rename = "tabId")]
    pub tab_id: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export_to = "web/src/types/generated.ts")]
pub struct TabWaitForLoadParams {
    #[serde(rename = "tabId")]
    pub tab_id: u64,
    #[serde(default = "default_timeout", rename = "timeout")]
    pub timeout: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export_to = "web/src/types/generated.ts")]
pub struct TabScrollToParams {
    #[serde(rename = "tabId")]
    pub tab_id: u64,
    #[serde(default)]
    pub x: f64,
    #[serde(default)]
    pub y: f64,
    #[serde(rename = "refId")]
    pub ref_id: Option<String>,
}
