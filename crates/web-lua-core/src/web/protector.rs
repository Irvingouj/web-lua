use crate::utils::{levenshtein_distance, suggest_api_names};
use piccolo::{Callback, CallbackReturn, Context, IntoValue, Table, Value};

/// Wrap an API sub-table with a metatable whose `__index` callback throws a
/// helpful error when an unknown key is accessed. It queries
/// `api_docs::REGISTRY` for valid names in the given namespace and suggests
/// the closest ones.
///
/// Aliases already present in the table are left untouched (the `__index`
/// callback only fires when the key is absent from the table itself).
pub(crate) fn protect_api_table<'gc>(
    ctx: Context<'gc>,
    table: Table<'gc>,
    namespace: &str,
) -> Table<'gc> {
    let ns = namespace.to_string();
    let mt = Table::new(&ctx);

    let index_cb = Callback::from_fn(&ctx, move |ctx, _exec, mut stack| {
        let key = stack.get(1);
        if let Value::String(s) = key {
            let name = String::from_utf8_lossy(s.as_bytes()).to_string();
            // Check if the key exists in the actual table (alias, etc.)
            if let Ok(val) = table.get(ctx, name.as_str()) {
                if !val.is_nil() {
                    stack.clear();
                    stack.push_back(val);
                    return Ok(CallbackReturn::Return);
                }
            }
            // Key is missing — build a helpful error
            let suggestions = suggest_api_names(&ns, &name);
            let mut msg = format!("'{}.{}' is not a valid API", ns, name);
            if !suggestions.is_empty() {
                let list = suggestions
                    .iter()
                    .map(|n| format!("{}.{}", ns, n))
                    .collect::<Vec<_>>()
                    .join(", ");
                msg.push_str(&format!(
                    ". Did you mean: {}?",
                    list
                ));
            }
            return Err(msg.into_value(ctx).into());
        }
        // Non-string key: fall back to raw get
        let result = table.get_raw(key);
        stack.clear();
        stack.push_back(result);
        Ok(CallbackReturn::Return)
    });

    mt.set_field(ctx, "__index", index_cb);
    table.set_metatable(&ctx, Some(mt));
    table
}

/// Protect a top-level API namespace table (e.g. `page`, `tab`).
/// This is a convenience wrapper around `protect_api_table` that uses the
/// table's field name as the namespace.
pub(crate) fn protect<'gc>(
    ctx: Context<'gc>,
    table: Table<'gc>,
    namespace: &str,
) -> Table<'gc> {
    protect_api_table(ctx, table, namespace)
}
