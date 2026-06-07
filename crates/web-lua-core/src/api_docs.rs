use serde::{Deserialize, Serialize};
use std::sync::Mutex;
use tsify::Tsify;

#[derive(Clone, Debug, Serialize)]
pub struct LuaApiDoc {
    pub namespace: String,
    pub name: String,
    pub public_name: String,
    pub action: Option<String>,
    pub local_name: Option<String>,
    pub source: ToolSource,
    pub transport: ToolTransport,
    pub description: String,
    pub params: Vec<ParamDoc>,
    pub returns: ReturnDoc,
}

#[derive(Clone, Debug, Copy, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ToolSource {
    RustCore,
    ExtensionWorker,
    MainThread,
    ContentScript,
    Sidepanel,
}

#[derive(Clone, Debug, Copy, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ToolTransport {
    RustSync,
    HostAsync,
    ExtensionWorker,
    ChromeApi,
    ActiveTabContentScript,
    SpecificTabContentScript,
    SidepanelDom,
}

#[derive(Clone, Debug, Serialize)]
pub struct ParamDoc {
    pub name: String,
    pub lua_type: String,
    pub required: bool,
    pub description: String,
}

#[derive(Clone, Debug, Serialize)]
pub struct ReturnDoc {
    pub lua_type: String,
    pub description: String,
}

#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize, Tsify)]
#[serde(rename_all = "lowercase")]
#[tsify(into_wasm_abi, from_wasm_abi)]
pub enum ApiDocFormat {
    Json,
    Markdown,
}

pub static REGISTRY: Mutex<Vec<LuaApiDoc>> = Mutex::new(Vec::new());

pub fn register(doc: LuaApiDoc) {
    let mut registry = REGISTRY.lock().unwrap();
    // Avoid duplicates when sessions are recreated (e.g. reset)
    if !registry
        .iter()
        .any(|d| d.namespace == doc.namespace && d.name == doc.name)
    {
        registry.push(doc);
    }
}

pub fn generate_json() -> String {
    let docs = REGISTRY.lock().unwrap().clone();
    serde_json::to_string_pretty(&docs).unwrap()
}

pub fn generate_markdown() -> String {
    let docs = REGISTRY.lock().unwrap().clone();
    let mut md = String::new();

    use std::collections::BTreeMap;
    let mut by_ns: BTreeMap<String, Vec<LuaApiDoc>> = BTreeMap::new();
    for doc in docs {
        by_ns.entry(doc.namespace.clone()).or_default().push(doc);
    }

    for (ns, apis) in by_ns {
        md.push_str(&format!("## `{}` module\n\n", ns));
        for api in apis {
            let action_note = api
                .action
                .as_ref()
                .filter(|a| !a.is_empty())
                .map(|a| format!(" _(action: `{}`)_", a))
                .unwrap_or_default();
            md.push_str(&format!("### `{}.{}{}`\n\n", ns, api.name, action_note));
            md.push_str(&format!("**Public name:** `{}`\n\n", api.public_name));
            md.push_str(&format!("**Source:** `{}`\n\n", serde_json::to_string(&api.source).unwrap_or_default().trim_matches('"')));
            md.push_str(&format!("**Transport:** `{}`\n\n", serde_json::to_string(&api.transport).unwrap_or_default().trim_matches('"')));
            if let Some(ref local) = api.local_name {
                md.push_str(&format!("**Local name:** `{}`\n\n", local));
            }
            md.push_str(&format!("{}\n\n", api.description));
            if !api.params.is_empty() {
                md.push_str("**Parameters**\n\n");
                for p in &api.params {
                    let req_flag = if p.required { "required" } else { "optional" };
                    md.push_str(&format!(
                        "- `{}` (`{}`, {}): {}\n",
                        p.name, p.lua_type, req_flag, p.description
                    ));
                }
                md.push('\n');
            }
            md.push_str(&format!(
                "**Returns** `{}`: {}\n\n",
                api.returns.lua_type, api.returns.description
            ));
        }
    }

    md
}

pub fn generate(format: ApiDocFormat) -> String {
    match format {
        ApiDocFormat::Json => generate_json(),
        ApiDocFormat::Markdown => generate_markdown(),
    }
}

pub fn all_as_json_value() -> serde_json::Value {
    let docs = REGISTRY.lock().unwrap().clone();
    serde_json::to_value(docs).unwrap_or_else(|_| serde_json::Value::Array(Vec::new()))
}

pub fn find_as_json_value(query: &str) -> Option<serde_json::Value> {
    let (namespace, name) = query
        .split_once('.')
        .map(|(ns, name)| (Some(ns), name))
        .unwrap_or((None, query));

    let docs = REGISTRY.lock().unwrap();
    docs.iter()
        .find(|doc| {
            doc.name == name && namespace.is_none_or(|ns| doc.namespace == ns)
                || doc.action.as_deref() == Some(query)
        })
        .and_then(|doc| serde_json::to_value(doc).ok())
}

pub fn search_as_json_value(query: &str) -> serde_json::Value {
    let query_lower = query.to_lowercase();
    let docs = REGISTRY.lock().unwrap();
    let matched: Vec<&LuaApiDoc> = docs
        .iter()
        .filter(|doc| {
            doc.namespace.to_lowercase().contains(&query_lower)
                || doc.name.to_lowercase().contains(&query_lower)
                || doc.description.to_lowercase().contains(&query_lower)
                || doc.public_name.to_lowercase().contains(&query_lower)
                || doc.action
                    .as_deref()
                    .unwrap_or("")
                    .to_lowercase()
                    .contains(&query_lower)
        })
        .collect();
    serde_json::to_value(matched).unwrap_or_else(|_| serde_json::Value::Array(Vec::new()))
}



#[cfg(test)]
mod tests {
    use super::*;

    fn sample_doc_with_local_name() -> LuaApiDoc {
        LuaApiDoc {
            namespace: "test_ns".to_string(),
            name: "test_click".to_string(),
            public_name: "test_ns.test_click".to_string(),
            action: Some("test_click_action".to_string()),
            local_name: Some("click".to_string()),
            source: ToolSource::MainThread,
            transport: ToolTransport::HostAsync,
            description: "Click an element.".to_string(),
            params: vec![ParamDoc {
                name: "ref_id".to_string(),
                lua_type: "string".to_string(),
                required: true,
                description: "Element refId".to_string(),
            }],
            returns: ReturnDoc {
                lua_type: "nil".to_string(),
                description: "None".to_string(),
            },
        }
    }

    fn sample_doc_without_local_name() -> LuaApiDoc {
        LuaApiDoc {
            namespace: "test_ns".to_string(),
            name: "test_inspect".to_string(),
            public_name: "test_ns.test_inspect".to_string(),
            action: None,
            local_name: None,
            source: ToolSource::MainThread,
            transport: ToolTransport::RustSync,
            description: "Inspect a value.".to_string(),
            params: vec![],
            returns: ReturnDoc {
                lua_type: "string".to_string(),
                description: "String representation".to_string(),
            },
        }
    }

    #[test]
    fn test_generate_json_includes_new_fields() {
        register(sample_doc_with_local_name());
        register(sample_doc_without_local_name());

        let json = generate_json();
        assert!(json.contains("\"public_name\""), "JSON missing public_name");
        assert!(json.contains("\"local_name\""), "JSON missing local_name");
        assert!(json.contains("\"source\""), "JSON missing source");
        assert!(json.contains("\"transport\""), "JSON missing transport");
        assert!(json.contains("\"test_ns.test_click\""), "JSON missing public_name value");
        assert!(json.contains("\"main_thread\""), "JSON missing snake_case source");
        assert!(json.contains("\"host_async\""), "JSON missing snake_case transport");
        assert!(json.contains("\"rust_sync\""), "JSON missing snake_case transport variant");
        assert!(json.contains("null"), "JSON missing null for None local_name");
    }

    #[test]
    fn test_generate_markdown_includes_new_fields() {
        register(sample_doc_with_local_name());
        register(sample_doc_without_local_name());

        let md = generate_markdown();
        assert!(md.contains("**Public name:**"), "Markdown missing Public name");
        assert!(md.contains("**Source:**"), "Markdown missing Source");
        assert!(md.contains("**Transport:**"), "Markdown missing Transport");
        assert!(md.contains("**Local name:**"), "Markdown missing Local name for doc with local_name");
        assert!(md.contains("`test_ns.test_click`"), "Markdown missing public_name value");
        assert!(md.contains("`main_thread`"), "Markdown missing snake_case source");
        assert!(md.contains("`host_async`"), "Markdown missing snake_case transport");
        assert!(md.contains("`rust_sync`"), "Markdown missing snake_case transport variant");
    }

    #[test]
    fn test_generate_markdown_conditional_local_name() {
        // Ensure at least one doc without local_name is registered
        register(sample_doc_without_local_name());

        let md = generate_markdown();
        // Find the section for test_ns.test_inspect and verify no Local name line
        let section = md
            .split("## `test_ns` module")
            .nth(1)
            .unwrap_or("");
        let doc_section = section
            .split("### `test_ns.test_inspect`")
            .nth(1)
            .unwrap_or("")
            .split("### `test_ns.test_click`")
            .next()
            .unwrap_or("");
        assert!(
            !doc_section.contains("**Local name:**"),
            "Markdown should not include Local name when local_name is None"
        );
    }

    #[test]
    fn test_all_as_json_value_includes_new_fields() {
        register(sample_doc_with_local_name());

        let value = all_as_json_value();
        let arr = value.as_array().expect("Expected array");
        // Find our test doc in the array
        let found = arr.iter().find(|v| {
            v.get("name")
                .and_then(|n| n.as_str())
                == Some("test_click")
        });
        assert!(found.is_some(), "test_click doc not found in array");
        let obj = found.unwrap().as_object().expect("Expected object");
        assert!(obj.contains_key("public_name"), "Missing public_name");
        assert!(obj.contains_key("local_name"), "Missing local_name");
        assert!(obj.contains_key("source"), "Missing source");
        assert!(obj.contains_key("transport"), "Missing transport");
        assert_eq!(
            obj.get("public_name").unwrap().as_str(),
            Some("test_ns.test_click")
        );
        assert_eq!(obj.get("source").unwrap().as_str(), Some("main_thread"));
        assert_eq!(obj.get("transport").unwrap().as_str(), Some("host_async"));
    }

    #[test]
    fn test_find_as_json_value_by_namespace_name() {
        register(sample_doc_with_local_name());

        let found = find_as_json_value("test_ns.test_click");
        assert!(found.is_some(), "Should find by namespace.name");
        let found_val = found.unwrap();
        let obj = found_val.as_object().expect("Expected object");
        assert_eq!(obj.get("public_name").unwrap().as_str(), Some("test_ns.test_click"));
        assert_eq!(obj.get("source").unwrap().as_str(), Some("main_thread"));
        assert_eq!(obj.get("transport").unwrap().as_str(), Some("host_async"));
    }

    #[test]
    fn test_find_as_json_value_by_action() {
        register(sample_doc_with_local_name());

        let found = find_as_json_value("test_click_action");
        assert!(found.is_some(), "Should find by action string");
        let found_val = found.unwrap();
        let obj = found_val.as_object().expect("Expected object");
        assert_eq!(obj.get("public_name").unwrap().as_str(), Some("test_ns.test_click"));
        assert_eq!(obj.get("transport").unwrap().as_str(), Some("host_async"));
    }

    #[test]
    fn test_find_as_json_value_not_found() {
        let found = find_as_json_value("test_nonexistent_12345");
        assert!(found.is_none(), "Should return None for unknown query");
    }

    #[test]
    fn test_tool_source_serialization_snake_case() {
        let variants = vec![
            (ToolSource::RustCore, "rust_core"),
            (ToolSource::ExtensionWorker, "extension_worker"),
            (ToolSource::MainThread, "main_thread"),
            (ToolSource::ContentScript, "content_script"),
            (ToolSource::Sidepanel, "sidepanel"),
        ];
        for (variant, expected) in variants {
            let json = serde_json::to_string(&variant).unwrap();
            assert_eq!(json, format!("\"{}\"", expected));
        }
    }

    #[test]
    fn test_tool_transport_serialization_snake_case() {
        let variants = vec![
            (ToolTransport::RustSync, "rust_sync"),
            (ToolTransport::HostAsync, "host_async"),
            (ToolTransport::ExtensionWorker, "extension_worker"),
            (ToolTransport::ChromeApi, "chrome_api"),
            (ToolTransport::ActiveTabContentScript, "active_tab_content_script"),
            (ToolTransport::SpecificTabContentScript, "specific_tab_content_script"),
            (ToolTransport::SidepanelDom, "sidepanel_dom"),
        ];
        for (variant, expected) in variants {
            let json = serde_json::to_string(&variant).unwrap();
            assert_eq!(json, format!("\"{}\"", expected));
        }
    }

    #[test]
    fn test_tool_source_deserialization_round_trip() {
        let variants = vec![
            ToolSource::RustCore,
            ToolSource::ExtensionWorker,
            ToolSource::MainThread,
            ToolSource::ContentScript,
            ToolSource::Sidepanel,
        ];
        for variant in variants {
            let json = serde_json::to_string(&variant).unwrap();
            let deserialized: ToolSource = serde_json::from_str(&json).unwrap();
            assert_eq!(variant, deserialized);
        }
    }

    #[test]
    fn test_tool_transport_deserialization_round_trip() {
        let variants = vec![
            ToolTransport::RustSync,
            ToolTransport::HostAsync,
            ToolTransport::ExtensionWorker,
            ToolTransport::ChromeApi,
            ToolTransport::ActiveTabContentScript,
            ToolTransport::SpecificTabContentScript,
            ToolTransport::SidepanelDom,
        ];
        for variant in variants {
            let json = serde_json::to_string(&variant).unwrap();
            let deserialized: ToolTransport = serde_json::from_str(&json).unwrap();
            assert_eq!(variant, deserialized);
        }
    }

    #[test]
    fn test_local_name_null_in_json_when_none() {
        register(sample_doc_without_local_name());

        let json = generate_json();
        assert!(
            json.contains("\"local_name\":null") || json.contains("\"local_name\": null"),
            "JSON should contain null for local_name when None: {}",
            json
        );
    }
}
