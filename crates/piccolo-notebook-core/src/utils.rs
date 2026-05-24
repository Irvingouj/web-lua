use crate::types::CellError;
use piccolo::{Context, Value};
use std::fmt;

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
    CellError::Runtime {
        message: clean_error_message(&msg),
    }
}

/// Extract a line number from an error message like "parse error at line 5: ..."
pub(crate) fn extract_line_number(msg: &str) -> Option<u32> {
    // Try "at line N" pattern
    if let Some(idx) = msg.find("at line ") {
        let rest = &msg[idx + 8..];
        let num_str: String = rest.chars().take_while(|c| c.is_ascii_digit()).collect();
        return num_str.parse().ok();
    }
    // Try ":N:" pattern (some formats use this)
    None
}

/// Clean up error messages to be more user-friendly.
pub(crate) fn clean_error_message(msg: &str) -> String {
    let msg = msg.trim();
    // Remove the "lua error: " or "runtime error: " prefix from piccolo
    msg.strip_prefix("lua error: ")
        .or_else(|| msg.strip_prefix("runtime error: "))
        .unwrap_or(msg)
        .to_string()
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

pub(crate) fn format_value(_ctx: Context, value: Value) -> String {
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
        Value::Table(_) => "table".to_string(),
        Value::Function(_) => "function".to_string(),
        Value::Thread(_) => "thread".to_string(),
        _ => format!("{:?}", value),
    }
}
