use crate::utils::format_unknown_api_error;
use piccolo::{Callback, CallbackReturn, Context, IntoValue, Table, Value};

/// Wrap an API sub-table with a metatable whose `__index` callback returns a
/// sentinel function for unknown keys. Calling that sentinel throws a helpful
/// error listing every valid API (and child namespaces) so the user can pick
/// the right one (like `cli --help`).
///
/// Aliases already present in the table are left untouched (the `__index`
/// callback only fires when the key is absent from the table itself). This
/// preserves normal Lua table semantics for reads (`== nil` no longer
/// crashes; it simply returns a callable sentinel), while still catching
/// mistyped API calls at the call site.
pub(crate) fn protect_api_table<'gc>(
    ctx: Context<'gc>,
    table: Table<'gc>,
    namespace: &str,
) -> Table<'gc> {
    let ns = namespace.to_string();
    let mt = Table::new(&ctx);

    let index_cb = Callback::from_fn_with(&ctx, table, move |table, ctx, _exec, mut stack| {
        let key = stack.get(1);
        if let Value::String(s) = key {
            let name = String::from_utf8_lossy(s.as_bytes()).to_string();
            // Check if the key exists in the actual table (alias, etc.)
            // get_raw bypasses the metatable, so this will not recurse.
            let val = table.get_raw(Value::String(s));
            if !val.is_nil() {
                stack.clear();
                stack.push_back(val);
                return Ok(CallbackReturn::Return);
            }
            // Key is missing — return a sentinel callback that throws when called.
            // This lets reads survive (e.g. local x = page.notexist) while still
            // producing a helpful error on actual calls (page.notexist()).
            let ns_err = ns.clone();
            let name_err = name.clone();
            let sentinel = Callback::from_fn(&ctx, move |ctx, _exec, mut _stack| {
                let msg = format_unknown_api_error(&ns_err, &name_err);
                Err(msg.into_value(ctx).into())
            });
            stack.clear();
            stack.push_back(sentinel.into());
            return Ok(CallbackReturn::Return);
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
