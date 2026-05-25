use serde::Serialize;
use std::sync::Mutex;

#[derive(Clone, Debug, Serialize)]
pub struct LuaApiDoc {
    pub namespace: String,
    pub name: String,
    pub action: Option<String>,
    pub description: String,
    pub params: Vec<ParamDoc>,
    pub returns: ReturnDoc,
    pub source: String,
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

static REGISTRY: Mutex<Vec<LuaApiDoc>> = Mutex::new(Vec::new());

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

pub fn generate(format: &str) -> String {
    match format {
        "json" => generate_json(),
        "markdown" => generate_markdown(),
        _ => generate_json(),
    }
}
