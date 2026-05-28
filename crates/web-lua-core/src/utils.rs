use crate::api_docs::REGISTRY;
use crate::types::CellError;
use piccolo::{Context, Value};

// ─── Error Classification ──────────────────────────────────────

/// Classify an ExternError into a structured CellError.
pub(crate) fn classify_extern_error(err: &piccolo::ExternError) -> CellError {
    let msg = format!("{}", err);

    // Check for compile/parse errors (they contain "parse error" or "compiler error")
    if msg.contains("parse error")
        || msg.contains("compiler error")
        || msg.contains("Compile error")
    {
        let line = extract_line_number(&msg);
        return CellError::Compile {
            message: clean_error_message(&msg),
            line,
        };
    }

    // Default to runtime error
    let line = extract_line_number(&msg);
    CellError::Runtime {
        message: clean_error_message(&msg),
        line,
    }
}

/// Extract a line number from an error message.
/// Handles "at line N" and "[line N]:" patterns.
pub(crate) fn extract_line_number(msg: &str) -> Option<u32> {
    let msg = msg.trim();

    // Try "[line N]:" pattern (runtime errors from piccolo error() builtin).
    // Piccolo formats these as "lua error: [line N]: msg", so strip the known
    // prefix first and then look for the line marker at the start.
    let after_prefix = msg
        .strip_prefix("lua error: ")
        .or_else(|| msg.strip_prefix("runtime error: "))
        .unwrap_or(msg);
    if let Some(rest) = after_prefix.strip_prefix("[line ") {
        let num_str: String = rest.chars().take_while(|c| c.is_ascii_digit()).collect();
        if let Ok(n) = num_str.parse::<u32>() {
            if n > 0 {
                return Some(n);
            }
        }
    }

    // Try "at line N" pattern (compile/parse errors)
    if let Some(idx) = msg.find("at line ") {
        let rest = &msg[idx + 8..];
        let num_str: String = rest.chars().take_while(|c| c.is_ascii_digit()).collect();
        return num_str.parse().ok();
    }
    None
}

/// Clean up error messages to be more user-friendly.
pub(crate) fn clean_error_message(msg: &str) -> String {
    let msg = msg.trim();
    // Remove the "lua error: " or "runtime error: " prefix from piccolo
    let msg = msg
        .strip_prefix("lua error: ")
        .or_else(|| msg.strip_prefix("runtime error: "))
        .unwrap_or(msg);
    // Remove the "[line N]: " prefix that our modified error() builtin prepends
    if let Some(rest) = msg.strip_prefix("[line ") {
        let digits: String = rest.chars().take_while(|c| c.is_ascii_digit()).collect();
        let after = &rest[digits.len()..];
        if let Some(rest) = after.strip_prefix("]: ") {
            return rest.to_string();
        }
    }
    msg.to_string()
}

// ─── API Discovery Helpers ─────────────────────────────────────

/// Scan `api_docs::REGISTRY` once and return both the direct API names in
/// `namespace` and the immediate child namespace names under it.
///
/// Uses a single mutex lock and a single pass over the registry.
pub(crate) fn scan_namespace(namespace: &str) -> (Vec<String>, Vec<String>) {
    let prefix = format!("{}.", namespace);
    let registry = REGISTRY.lock().unwrap();

    let mut apis: Vec<String> = Vec::new();
    let mut children: Vec<String> = Vec::new();

    for doc in registry.iter() {
        if doc.namespace == namespace {
            apis.push(doc.name.clone());
        } else if doc.namespace.starts_with(&prefix) {
            let rest = &doc.namespace[prefix.len()..];
            let child = if let Some(dot) = rest.find('.') {
                format!("{}{}", prefix, &rest[..dot])
            } else {
                doc.namespace.clone()
            };
            children.push(child);
        }
    }

    apis.sort();
    apis.dedup();
    children.sort();
    children.dedup();

    (apis, children)
}

/// Compute the Levenshtein distance between two strings using a standard
/// 2-row dynamic programming approach (O(min(n,m)) memory).
fn levenshtein_distance(a: &str, b: &str) -> usize {
    let (a, b) = if a.len() < b.len() { (a, b) } else { (b, a) };
    let a_bytes = a.as_bytes();
    let b_bytes = b.as_bytes();
    let m = a_bytes.len();
    let n = b_bytes.len();

    let mut prev: Vec<usize> = (0..=m).collect();
    let mut curr = vec![0; m + 1];

    for j in 1..=n {
        curr[0] = j;
        for i in 1..=m {
            let cost = if a_bytes[i - 1] == b_bytes[j - 1] {
                0
            } else {
                1
            };
            curr[i] = (prev[i - 1] + cost).min(prev[i] + 1).min(curr[i - 1] + 1);
        }
        std::mem::swap(&mut prev, &mut curr);
    }

    prev[m]
}

/// Build the "unknown API" help message for a given namespace and name.
/// Returns the full formatted string used by the protector sentinel.
pub(crate) fn format_unknown_api_error(namespace: &str, name: &str) -> String {
    let (apis, children) = scan_namespace(namespace);
    let mut msg = format!("'{}.{}' is not a valid API.\n\n", namespace, name);

    if !apis.is_empty() {
        msg.push_str(&format!("Available APIs in '{}':\n", namespace));
        for api in &apis {
            msg.push_str(&format!("  {}.{}\n", namespace, api));
        }
    }

    if !children.is_empty() {
        if !apis.is_empty() {
            msg.push_str(&format!("\nSub-namespaces under '{}':\n", namespace));
        } else {
            msg.push_str(&format!("Available namespaces under '{}':\n", namespace));
        }
        for child in &children {
            msg.push_str(&format!("  {}\n", child));
        }
    }

    if apis.is_empty() && children.is_empty() {
        msg.push_str("(no APIs registered in this namespace)");
    }

    // Suggest the closest matching API if distance is within threshold
    if !apis.is_empty() {
        let mut min_dist = usize::MAX;
        let mut closest: Option<&str> = None;
        for api in &apis {
            let dist = levenshtein_distance(name, api);
            if dist < min_dist {
                min_dist = dist;
                closest = Some(api);
            }
        }
        if let Some(closest_api) = closest {
            if min_dist <= 2 {
                msg.push_str(&format!("\nDid you mean: {}.{}?\n", namespace, closest_api));
            }
        }
    }

    msg
}

/// Build a human-friendly parameter error message using `LuaApiDoc` metadata.
pub(crate) fn format_param_error(
    namespace: &str,
    name: &str,
    serde_err: &serde_json::Error,
) -> String {
    let registry = REGISTRY.lock().unwrap();
    let doc = registry
        .iter()
        .find(|d| d.namespace == namespace && d.name == name);

    let signature: Option<String> = doc.map(|d| {
        let params = d
            .params
            .iter()
            .map(|p| {
                let req = if p.required { "required" } else { "optional" };
                format!(
                    "  {:<12} ({:<8}, {:<8}): {}",
                    p.name, p.lua_type, req, p.description
                )
            })
            .collect::<Vec<_>>()
            .join("\n");
        format!("{}.{}({{\n{}\n}})", namespace, name, params)
    });

    let mut msg = format!("{}.{}: invalid parameters.\n", namespace, name);
    msg.push_str(&format!("  {}\n", serde_err));
    if let Some(sig) = signature {
        msg.push_str("\nExpected signature:\n");
        msg.push_str(&sig);
    }
    msg
}

// ─── URL Encoding Helper ─────────────────────────────────────────

/// Simple percent-encoding for URL query parameters.
pub(crate) fn percent_encode(input: &[u8]) -> String {
    input
        .iter()
        .map(|&b| {
            if b.is_ascii_alphanumeric() || b == b'-' || b == b'_' || b == b'.' || b == b'~' {
                (b as char).to_string()
            } else {
                format!("%{:02X}", b)
            }
        })
        .collect()
}

// ─── Value Formatting ───────────────────────────────────────────

pub(crate) fn format_value(ctx: Context, value: Value) -> String {
    match value {
        Value::Nil => "nil".to_string(),
        Value::Boolean(b) => b.to_string(),
        Value::Integer(i) => i.to_string(),
        Value::Number(f) => {
            if f == f.floor() && f.is_finite() {
                format!("{:.1}", f)
            } else {
                format!("{}", f)
            }
        }
        Value::String(s) => {
            let bytes = s.as_bytes();
            String::from_utf8_lossy(bytes).to_string()
        }
        Value::Table(_) => match crate::json::lua_value_to_json(ctx, value) {
            Ok(json) => serde_json::to_string(&json).unwrap_or_else(|_| "table".to_string()),
            Err(_) => "table".to_string(),
        },
        Value::Function(_) => "function".to_string(),
        Value::Thread(_) => "thread".to_string(),
        _ => format!("{:?}", value),
    }
}

// ─── Unit Tests ─────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_extract_line_number_builtin_prefix() {
        assert_eq!(extract_line_number("lua error: [line 5]: boom"), Some(5));
        assert_eq!(
            extract_line_number("runtime error: [line 12]: oops"),
            Some(12)
        );
    }

    #[test]
    fn test_extract_line_number_compile_pattern() {
        assert_eq!(
            extract_line_number("parse error at line 3: unexpected token"),
            Some(3)
        );
    }

    #[test]
    fn test_extract_line_number_no_false_positive() {
        // Embedded [line 5] should NOT be extracted
        assert_eq!(
            extract_line_number("lua error: see [line 5]: for info"),
            None
        );
    }

    #[test]
    fn test_clean_error_message_strips_all_prefixes() {
        assert_eq!(clean_error_message("lua error: [line 2]: boom"), "boom");
        assert_eq!(clean_error_message("runtime error: [line 1]: oops"), "oops");
    }

    #[test]
    fn test_clean_error_message_no_prefix() {
        assert_eq!(clean_error_message("plain message"), "plain message");
    }

    #[test]
    fn test_format_unknown_api_error_lists_children() {
        // Populate the registry so chrome sub-namespaces are registered
        let _session = crate::session::NotebookSession::new();
        let msg = format_unknown_api_error("chrome", "nope");
        assert!(
            msg.contains("chrome.nope"),
            "Message should name the invalid API, got: {}",
            msg
        );
        assert!(
            msg.contains("Available namespaces under 'chrome'"),
            "Should show child namespaces for chrome, got: {}",
            msg
        );
    }

    #[test]
    fn test_format_param_error_without_registry_entry() {
        let serde_err = serde_json::from_str::<serde_json::Value>("not_json").unwrap_err();
        let msg = format_param_error("nonexistent", "api", &serde_err);
        assert!(
            msg.contains("nonexistent.api: invalid parameters"),
            "Should name the API, got: {}",
            msg
        );
        assert!(
            !msg.contains("Expected signature"),
            "Should omit signature when doc is missing, got: {}",
            msg
        );
    }

    #[test]
    fn test_levenshtein_distance() {
        assert_eq!(levenshtein_distance("", ""), 0);
        assert_eq!(levenshtein_distance("a", ""), 1);
        assert_eq!(levenshtein_distance("", "b"), 1);
        assert_eq!(levenshtein_distance("kitten", "sitting"), 3);
        assert_eq!(levenshtein_distance("flaw", "lawn"), 2);
        assert_eq!(levenshtein_distance("snapsot", "snapshot"), 1);
        assert_eq!(levenshtein_distance("navigate", "goto"), 6);
    }

    #[test]
    fn test_did_you_mean_suggests_close_match() {
        // Populate the registry by creating a session so page.* APIs are registered
        let _session = crate::session::NotebookSession::new();
        let msg = format_unknown_api_error("page", "snapsot");
        assert!(
            msg.contains("Did you mean: page.snapshot?"),
            "Should suggest close match for 'snapsot', got: {}",
            msg
        );
    }

    #[test]
    fn test_did_you_mean_no_suggestion_when_distance_too_large() {
        // Populate the registry by creating a session so page.* APIs are registered
        let _session = crate::session::NotebookSession::new();
        let msg = format_unknown_api_error("page", "xyzabc");
        assert!(
            !msg.contains("Did you mean"),
            "Should not suggest when distance is too large, got: {}",
            msg
        );
    }

    #[test]
    fn test_did_you_mean_no_suggestion_for_navigate() {
        // Populate the registry by creating a session so page.* APIs are registered
        let _session = crate::session::NotebookSession::new();
        // 'navigate' vs 'goto' has Levenshtein distance 6 (> 2), so it
        // should NOT trigger the "Did you mean" hint.
        let msg = format_unknown_api_error("page", "navigate");
        assert!(
            !msg.contains("Did you mean"),
            "Should not suggest for 'navigate' (distance too large), got: {}",
            msg
        );
    }
}
