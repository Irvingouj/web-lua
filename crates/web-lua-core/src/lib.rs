pub mod action;
pub mod api_docs;
pub mod command_params;
pub(crate) mod globals;
pub(crate) mod json;
pub mod plugin;
pub mod session;
pub(crate) mod state;
pub mod types;
pub(crate) mod utils;
pub(crate) mod web;

#[cfg(test)]
pub mod tests;

pub use plugin::*;
pub use session::*;
pub use state::*;
pub use types::*;

/// Register API metadata without generating a Lua callback.
/// Use this for custom Callback::from_fn blocks or injected Lua aliases.
#[macro_export]
macro_rules! lua_api_doc {
    (
        namespace: $ns:expr,
        name: $name:expr,
        action: $action:expr,
        doc: $desc:expr,
        params: [$($pname:ident: $ptype:expr, $preq:ident, $pdesc:expr),* $(,)?],
        returns: $rtype:expr => $rdesc:expr $(,)?
    ) => {
        $crate::api_docs::register($crate::api_docs::LuaApiDoc {
            namespace: $ns.to_string(),
            name: $name.to_string(),
            action: Some($action.to_string()),
            description: $desc.to_string(),
            params: vec![$(
                $crate::api_docs::ParamDoc {
                    name: stringify!($pname).to_string(),
                    lua_type: $ptype.to_string(),
                    required: stringify!($preq) == "required",
                    description: $pdesc.to_string(),
                }
            ),*],
            returns: $crate::api_docs::ReturnDoc {
                lua_type: $rtype.to_string(),
                description: $rdesc.to_string(),
            },
            source: "rust_core".to_string(),
        });
    };

    (
        namespace: $ns:expr,
        name: $name:expr,
        action: $action:expr,
        doc: $desc:expr,
        source: $src:expr,
        params: [$($pname:ident: $ptype:expr, $preq:ident, $pdesc:expr),* $(,)?],
        returns: $rtype:expr => $rdesc:expr $(,)?
    ) => {
        $crate::api_docs::register($crate::api_docs::LuaApiDoc {
            namespace: $ns.to_string(),
            name: $name.to_string(),
            action: Some($action.to_string()),
            description: $desc.to_string(),
            params: vec![$(
                $crate::api_docs::ParamDoc {
                    name: stringify!($pname).to_string(),
                    lua_type: $ptype.to_string(),
                    required: stringify!($preq) == "required",
                    description: $pdesc.to_string(),
                }
            ),*],
            returns: $crate::api_docs::ReturnDoc {
                lua_type: $rtype.to_string(),
                description: $rdesc.to_string(),
            },
            source: $src.to_string(),
        });
    };
}
