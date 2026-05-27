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
        assert_eq!(extract_line_number("runtime error: [line 12]: oops"), Some(12));
    }

    #[test]
    fn test_extract_line_number_compile_pattern() {
        assert_eq!(extract_line_number("parse error at line 3: unexpected token"), Some(3));
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
        assert_eq!(
            clean_error_message("lua error: [line 2]: boom"),
            "boom"
        );
        assert_eq!(
            clean_error_message("runtime error: [line 1]: oops"),
            "oops"
        );
    }

    #[test]
    fn test_clean_error_message_no_prefix() {
        assert_eq!(clean_error_message("plain message"), "plain message");
    }
}
