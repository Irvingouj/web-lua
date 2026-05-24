use crate::state::HostState;
use piccolo::Context;
use std::cell::RefCell;
use std::rc::Rc;

// ─── Plugin Trait ────────────────────────────────────────────────

/// A plugin that extends the Lua runtime with custom globals.
///
/// Implement this trait to register Rust callbacks as Lua globals.
/// Plugins are registered via [`SessionBuilder::plugin`].
///
/// # Example
///
/// ```rust,ignore
/// struct MathPlugin;
///
/// impl LuaPlugin for MathPlugin {
///     fn name(&self) -> &str { "math_extra" }
///     fn register(&self, ctx: Context, _host_state: Rc<RefCell<HostState>>) {
///         let t = Table::new(&ctx);
///         // ... register callbacks ...
///         ctx.set_global("math_extra", t);
///     }
/// }
/// ```
pub trait LuaPlugin: 'static {
    /// Plugin name, for debugging purposes.
    fn name(&self) -> &str;

    /// Register custom Lua globals into the session.
    /// Called inside `Lua::enter()`, so you can create `Callback`, `Table`, etc.
    fn register(&self, ctx: Context, host_state: Rc<RefCell<HostState>>);
}
