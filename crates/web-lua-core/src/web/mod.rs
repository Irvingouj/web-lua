use crate::state::HostState;
use piccolo::{Context, Table};
use std::cell::RefCell;
use std::rc::Rc;

macro_rules! lua_api {
    (
        $ctx:expr,
        $table:expr,
        name: $name:expr,
        action: $action:expr,
        host_state: $hs:expr,
        namespace: $ns:expr,
        doc: $desc:expr,
        params: [$($pname:ident: $ptype:expr, $preq:ident, $pdesc:expr),* $(,)?],
        returns: $rtype:expr => $rdesc:expr $(,)?
    ) => {
        {
            let hs_ext = $hs.clone();
            let cb = piccolo::Callback::from_fn(&$ctx, move |ctx, _exec, mut stack| {
                let params = if stack.is_empty() {
                    serde_json::json!({})
                } else if stack.len() == 1 {
                    crate::json::lua_value_to_json(ctx, stack.get(0)).unwrap_or(serde_json::Value::Null)
                } else {
                    let args: Vec<serde_json::Value> = (0..stack.len())
                        .map(|i| {
                            crate::json::lua_value_to_json(ctx, stack.get(i)).unwrap_or(serde_json::Value::Null)
                        })
                        .collect();
                    serde_json::Value::Array(args)
                };

                let mut hs = hs_ext.borrow_mut();
                hs.async_call_counter += 1;
                let call_id = hs.async_call_counter;
                let command = crate::types::AsyncCommand {
                    call_id,
                    action: crate::action::Action::from($action),
                    params,
                };
                hs.pending_async_command = Some(command);

                stack.clear();
                Ok(piccolo::CallbackReturn::Yield {
                    to_thread: None,
                    then: None,
                })
            });
            $table.set_field($ctx, $name, cb);

            crate::api_docs::register(crate::api_docs::LuaApiDoc {
                namespace: $ns.to_string(),
                name: $name.to_string(),
                action: Some($action.to_string()),
                description: $desc.to_string(),
                params: vec![$(
                    crate::api_docs::ParamDoc {
                        name: stringify!($pname).to_string(),
                        lua_type: $ptype.to_string(),
                        required: stringify!($preq) == "required",
                        description: $pdesc.to_string(),
                    }
                ),*],
                returns: crate::api_docs::ReturnDoc {
                    lua_type: $rtype.to_string(),
                    description: $rdesc.to_string(),
                },
                source: "rust_core".to_string(),
            });
        }
    };
}

mod bookmarks;
mod chrome;
mod clipboard;
mod cookies;
mod dom;
mod fetch;
mod history;
mod host;
mod log;
mod notifications;
mod page;
mod runtime;
mod storage;
mod tab;
mod url;

pub(crate) fn register_web_module(ctx: Context, host_state: Rc<RefCell<HostState>>) {
    let web_table = Table::new(&ctx);

    fetch::register(ctx, &web_table, host_state.clone());

    let url_table = url::register(ctx);
    web_table.set_field(ctx, "url", url_table);

    log::register(ctx, &web_table, host_state.clone());

    let storage_table = storage::register(ctx, host_state.clone());
    web_table.set_field(ctx, "storage", storage_table);

    let tab_table = tab::register(ctx, host_state.clone());
    web_table.set_field(ctx, "tab", tab_table);

    let cookies_table = cookies::register(ctx, host_state.clone());
    web_table.set_field(ctx, "cookies", cookies_table);

    let history_table = history::register(ctx, host_state.clone());
    web_table.set_field(ctx, "history", history_table);

    let bookmarks_table = bookmarks::register(ctx, host_state.clone());
    web_table.set_field(ctx, "bookmarks", bookmarks_table);

    let notifications_table = notifications::register(ctx, host_state.clone());
    web_table.set_field(ctx, "notifications", notifications_table);

    let clipboard_table = clipboard::register(ctx, host_state.clone());
    web_table.set_field(ctx, "clipboard", clipboard_table);

    chrome::register(ctx, host_state.clone());
    dom::register(ctx, host_state.clone());
    page::register(ctx, host_state.clone());
    host::register(ctx, host_state.clone());
    runtime::register(ctx, host_state.clone());

    ctx.set_global("web", web_table);
}
