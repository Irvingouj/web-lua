use crate::json::lua_value_to_json;
use crate::state::HostState;
use crate::types::AsyncCommand;
use crate::utils::format_value;
use piccolo::{Callback, CallbackReturn, Context, IntoValue, Table, Value};
use std::cell::RefCell;
use std::rc::Rc;

pub(crate) fn register<'a>(ctx: Context<'a>, host_state: Rc<RefCell<HostState>>) {
    let _page_table = Table::new(&ctx);

    // ── page module (Agent API: snapshot + element actions + navigation) ──
    let page_table = Table::new(&ctx);

    // page.snapshot(opts?) — async, yields "page_snapshot_text"
    {
        let hs_page = host_state.clone();
        let cb = Callback::from_fn(&ctx, move |ctx, _exec, mut stack| {
            let params = if stack.is_empty() {
                serde_json::json!({})
            } else {
                lua_value_to_json(ctx, stack.get(0)).unwrap_or(serde_json::Value::Null)
            };
            let _validated: crate::command_params::DomSnapshotParams =
                match serde_json::from_value(params.clone()) {
                    Ok(v) => v,
                    Err(e) => {
                        let msg = crate::utils::format_param_error("page", "snapshot", &e);
                        return Err(msg.into_value(ctx).into());
                    }
                };

            let mut hs = hs_page.borrow_mut();
            hs.async_call_counter += 1;
            let command = AsyncCommand {
                call_id: hs.async_call_counter,
                action: "page_snapshot_text".to_string(),
                params,
            };
            hs.pending_async_command = Some(command);
            stack.clear();
            Ok(CallbackReturn::Yield {
                to_thread: None,
                then: None,
            })
        });
        lua_api_custom!(ctx, page_table, name: "snapshot", callback: cb,
            namespace: "page",
            action: "page_snapshot_text",
            doc: "Take a DOM snapshot and return readable text.",
            params: [
            opts: "table | nil", optional, "Options: max_nodes, interactive_only, etc.",
            ],
            returns: "string" => "Readable accessibility tree with refIds",
        );
    }

    // page.snapshot_data(opts?) — async, yields "page_snapshot_data"
    {
        let hs_page = host_state.clone();
        let cb = Callback::from_fn(&ctx, move |ctx, _exec, mut stack| {
            let params = if stack.is_empty() {
                serde_json::json!({})
            } else {
                lua_value_to_json(ctx, stack.get(0)).unwrap_or(serde_json::Value::Null)
            };
            let _validated: crate::command_params::DomSnapshotParams =
                match serde_json::from_value(params.clone()) {
                    Ok(v) => v,
                    Err(e) => {
                        let msg = crate::utils::format_param_error("page", "snapshot_data", &e);
                        return Err(msg.into_value(ctx).into());
                    }
                };

            let mut hs = hs_page.borrow_mut();
            hs.async_call_counter += 1;
            let command = AsyncCommand {
                call_id: hs.async_call_counter,
                action: "page_snapshot_data".to_string(),
                params,
            };
            hs.pending_async_command = Some(command);
            stack.clear();
            Ok(CallbackReturn::Yield {
                to_thread: None,
                then: None,
            })
        });
        lua_api_custom!(ctx, page_table, name: "snapshot_data", callback: cb,
            namespace: "page",
            action: "page_snapshot_data",
            doc: "Take a DOM snapshot and return structured data.",
            params: [
            opts: "table | nil", optional, "Options: max_nodes, interactive_only, etc.",
            ],
            returns: "table" => "{ text, nodes, url, title, viewport, version }",
        );
    }

    // page.snapshot_text(opts?) — alias for page.snapshot
    {
        let hs_page = host_state.clone();
        let cb = Callback::from_fn(&ctx, move |ctx, _exec, mut stack| {
            let params = if stack.is_empty() {
                serde_json::json!({})
            } else {
                lua_value_to_json(ctx, stack.get(0)).unwrap_or(serde_json::Value::Null)
            };
            let _validated: crate::command_params::DomSnapshotParams =
                match serde_json::from_value(params.clone()) {
                    Ok(v) => v,
                    Err(e) => {
                        let msg = crate::utils::format_param_error("page", "snapshot_text", &e);
                        return Err(msg.into_value(ctx).into());
                    }
                };

            let mut hs = hs_page.borrow_mut();
            hs.async_call_counter += 1;
            let command = AsyncCommand {
                call_id: hs.async_call_counter,
                action: "page_snapshot_text".to_string(),
                params,
            };
            hs.pending_async_command = Some(command);
            stack.clear();
            Ok(CallbackReturn::Yield {
                to_thread: None,
                then: None,
            })
        });
        lua_api_custom!(ctx, page_table, name: "snapshot_text", callback: cb,
            namespace: "page",
            action: "page_snapshot_text",
            doc: "Alias for page.snapshot — returns readable text.",
            params: [
            opts: "table | nil", optional, "Options: max_nodes, interactive_only, etc.",
            ],
            returns: "string" => "Readable accessibility tree with refIds",
        );
        lua_api_custom!(ctx, page_table, name: "see", callback: cb,
            namespace: "page",
            action: "page_snapshot_text",
            doc: "Alias for page.snapshot — returns readable text.",
            params: [
            opts: "table | nil", optional, "Options: max_nodes, interactive_only, etc.",
            ],
            returns: "string" => "Readable accessibility tree with refIds",
        );
    }

    // page.click(ref_id) — async
    {
        let hs_page = host_state.clone();
        let cb = Callback::from_fn(&ctx, move |ctx, _exec, mut stack| {
            let ref_id = if !stack.is_empty() {
                match stack.get(0) {
                    Value::String(s) => String::from_utf8_lossy(s.as_bytes()).to_string(),
                    other => format_value(ctx, other),
                }
            } else {
                return Err("page.click requires a ref_id argument"
                    .into_value(ctx)
                    .into());
            };
            let params = serde_json::json!({ "refId": ref_id, "label": ref_id });
            let _validated: crate::command_params::PageClickParams =
                match serde_json::from_value(params.clone()) {
                    Ok(v) => v,
                    Err(e) => {
                        let msg = crate::utils::format_param_error("page", "click", &e);
                        return Err(msg.into_value(ctx).into());
                    }
                };

            let mut hs = hs_page.borrow_mut();
            hs.async_call_counter += 1;
            let command = AsyncCommand {
                call_id: hs.async_call_counter,
                action: "page_click".to_string(),
                params,
            };
            hs.pending_async_command = Some(command);
            stack.clear();
            Ok(CallbackReturn::Yield {
                to_thread: None,
                then: None,
            })
        });
        lua_api_custom!(ctx, page_table, name: "click", callback: cb,
            namespace: "page",
            action: "page_click",
            doc: "Click an element by refId in the current page.",
            params: [
            ref_id: "string", required, "Element refId from snapshot",
            ],
            returns: "nil" => "None",
        );
    }

    // page.dblclick(ref_id) — async
    {
        let hs_page = host_state.clone();
        let cb = Callback::from_fn(&ctx, move |ctx, _exec, mut stack| {
            let ref_id = if !stack.is_empty() {
                match stack.get(0) {
                    Value::String(s) => String::from_utf8_lossy(s.as_bytes()).to_string(),
                    other => format_value(ctx, other),
                }
            } else {
                return Err("page.dblclick requires a ref_id argument"
                    .into_value(ctx)
                    .into());
            };
            let params = serde_json::json!({ "refId": ref_id });
            let _validated: crate::command_params::PageDblClickParams =
                match serde_json::from_value(params.clone()) {
                    Ok(v) => v,
                    Err(e) => {
                        let msg = crate::utils::format_param_error("page", "dblclick", &e);
                        return Err(msg.into_value(ctx).into());
                    }
                };

            let mut hs = hs_page.borrow_mut();
            hs.async_call_counter += 1;
            let command = AsyncCommand {
                call_id: hs.async_call_counter,
                action: "page_dblclick".to_string(),
                params,
            };
            hs.pending_async_command = Some(command);
            stack.clear();
            Ok(CallbackReturn::Yield {
                to_thread: None,
                then: None,
            })
        });
        lua_api_custom!(ctx, page_table, name: "dblclick", callback: cb,
            namespace: "page",
            action: "page_dblclick",
            doc: "Double-click an element by refId.",
            params: [
            ref_id: "string", required, "Element refId from snapshot",
            ],
            returns: "nil" => "None",
        );
    }

    // page.fill(ref_id, value) — async
    {
        let hs_page = host_state.clone();
        let cb = Callback::from_fn(&ctx, move |ctx, _exec, mut stack| {
            let ref_id = if !stack.is_empty() {
                match stack.get(0) {
                    Value::String(s) => String::from_utf8_lossy(s.as_bytes()).to_string(),
                    other => format_value(ctx, other),
                }
            } else {
                return Err("page.fill requires ref_id and value arguments"
                    .into_value(ctx)
                    .into());
            };
            let value = if stack.len() > 1 {
                match stack.get(1) {
                    Value::String(s) => String::from_utf8_lossy(s.as_bytes()).to_string(),
                    other => format_value(ctx, other),
                }
            } else {
                return Err("page.fill requires a value argument".into_value(ctx).into());
            };
            let params = serde_json::json!({ "refId": ref_id, "label": ref_id, "value": value });
            let _validated: crate::command_params::PageFillParams =
                match serde_json::from_value(params.clone()) {
                    Ok(v) => v,
                    Err(e) => {
                        let msg = crate::utils::format_param_error("page", "fill", &e);
                        return Err(msg.into_value(ctx).into());
                    }
                };

            let mut hs = hs_page.borrow_mut();
            hs.async_call_counter += 1;
            let command = AsyncCommand {
                call_id: hs.async_call_counter,
                action: "page_fill".to_string(),
                params,
            };
            hs.pending_async_command = Some(command);
            stack.clear();
            Ok(CallbackReturn::Yield {
                to_thread: None,
                then: None,
            })
        });
        lua_api_custom!(ctx, page_table, name: "fill", callback: cb,
            namespace: "page",
            action: "page_fill",
            doc: "Fill an input element by refId with a value.",
            params: [
            ref_id: "string", required, "Element refId from snapshot",
            value: "string", required, "Text to fill",
            ],
            returns: "nil" => "None",
        );
    }

    // page.type(ref_id, text) — async (append text)
    {
        let hs_page = host_state.clone();
        let cb = Callback::from_fn(&ctx, move |ctx, _exec, mut stack| {
            let ref_id = if !stack.is_empty() {
                match stack.get(0) {
                    Value::String(s) => String::from_utf8_lossy(s.as_bytes()).to_string(),
                    other => format_value(ctx, other),
                }
            } else {
                return Err("page.type requires ref_id and text arguments"
                    .into_value(ctx)
                    .into());
            };
            let text = if stack.len() > 1 {
                match stack.get(1) {
                    Value::String(s) => String::from_utf8_lossy(s.as_bytes()).to_string(),
                    other => format_value(ctx, other),
                }
            } else {
                return Err("page.type requires a text argument".into_value(ctx).into());
            };
            let params = serde_json::json!({ "refId": ref_id, "label": ref_id, "text": text });
            let _validated: crate::command_params::PageTypeParams =
                match serde_json::from_value(params.clone()) {
                    Ok(v) => v,
                    Err(e) => {
                        let msg = crate::utils::format_param_error("page", "type", &e);
                        return Err(msg.into_value(ctx).into());
                    }
                };

            let mut hs = hs_page.borrow_mut();
            hs.async_call_counter += 1;
            let command = AsyncCommand {
                call_id: hs.async_call_counter,
                action: "page_type".to_string(),
                params,
            };
            hs.pending_async_command = Some(command);
            stack.clear();
            Ok(CallbackReturn::Yield {
                to_thread: None,
                then: None,
            })
        });
        lua_api_custom!(ctx, page_table, name: "type", callback: cb,
            namespace: "page",
            action: "page_type",
            doc: "Append text to an input element by refId.",
            params: [
            ref_id: "string", required, "Element refId from snapshot",
            text: "string", required, "Text to append",
            ],
            returns: "nil" => "None",
        );
    }

    // page.press(key) — async
    {
        let hs_page = host_state.clone();
        let cb = Callback::from_fn(&ctx, move |ctx, _exec, mut stack| {
            let key = if !stack.is_empty() {
                match stack.get(0) {
                    Value::String(s) => String::from_utf8_lossy(s.as_bytes()).to_string(),
                    other => format_value(ctx, other),
                }
            } else {
                return Err("page.press requires a key argument".into_value(ctx).into());
            };
            let params = serde_json::json!({ "key": key });
            let _validated: crate::command_params::PagePressParams =
                match serde_json::from_value(params.clone()) {
                    Ok(v) => v,
                    Err(e) => {
                        let msg = crate::utils::format_param_error("page", "press", &e);
                        return Err(msg.into_value(ctx).into());
                    }
                };

            let mut hs = hs_page.borrow_mut();
            hs.async_call_counter += 1;
            let command = AsyncCommand {
                call_id: hs.async_call_counter,
                action: "page_press".to_string(),
                params,
            };
            hs.pending_async_command = Some(command);
            stack.clear();
            Ok(CallbackReturn::Yield {
                to_thread: None,
                then: None,
            })
        });
        lua_api_custom!(ctx, page_table, name: "press", callback: cb,
            namespace: "page",
            action: "page_press",
            doc: "Press a keyboard key.",
            params: [
            key: "string", required, "Key name: Enter, Escape, ArrowDown, etc.",
            ],
            returns: "nil" => "None",
        );
        page_table.set_field(ctx, "enter", cb);
        crate::api_docs::register(crate::api_docs::LuaApiDoc {
            namespace: "page".to_string(),
            name: "enter".to_string(),
            public_name: "page.enter".to_string(),
            action: Some("page_press".to_string()),
            local_name: None,
            source: crate::api_docs::ToolSource::RustCore,
            transport: crate::api_docs::ToolTransport::HostAsync,
            description: "Alias for page.press(\"Enter\") — press the Enter key.".to_string(),
            params: vec![],
            returns: crate::api_docs::ReturnDoc {
                lua_type: "nil".to_string(),
                description: "None".to_string(),
            },
        });
    }

    // page.select(ref_id, value) — async
    {
        let hs_page = host_state.clone();
        let cb = Callback::from_fn(&ctx, move |ctx, _exec, mut stack| {
            let ref_id = if !stack.is_empty() {
                match stack.get(0) {
                    Value::String(s) => String::from_utf8_lossy(s.as_bytes()).to_string(),
                    other => format_value(ctx, other),
                }
            } else {
                return Err("page.select requires ref_id and value arguments"
                    .into_value(ctx)
                    .into());
            };
            let value = if stack.len() > 1 {
                match stack.get(1) {
                    Value::String(s) => String::from_utf8_lossy(s.as_bytes()).to_string(),
                    other => format_value(ctx, other),
                }
            } else {
                return Err("page.select requires a value argument"
                    .into_value(ctx)
                    .into());
            };
            let params = serde_json::json!({ "refId": ref_id, "value": value });
            let _validated: crate::command_params::PageSelectParams =
                match serde_json::from_value(params.clone()) {
                    Ok(v) => v,
                    Err(e) => {
                        let msg = crate::utils::format_param_error("page", "select", &e);
                        return Err(msg.into_value(ctx).into());
                    }
                };

            let mut hs = hs_page.borrow_mut();
            hs.async_call_counter += 1;
            let command = AsyncCommand {
                call_id: hs.async_call_counter,
                action: "page_select".to_string(),
                params,
            };
            hs.pending_async_command = Some(command);
            stack.clear();
            Ok(CallbackReturn::Yield {
                to_thread: None,
                then: None,
            })
        });
        lua_api_custom!(ctx, page_table, name: "select", callback: cb,
            namespace: "page",
            action: "page_select",
            doc: "Select an option in a dropdown by refId and value.",
            params: [
            ref_id: "string", required, "Element refId from snapshot",
            value: "string", required, "Option value to select",
            ],
            returns: "nil" => "None",
        );
    }

    // page.check(ref_id, checked?) — async
    {
        let hs_page = host_state.clone();
        let cb = Callback::from_fn(&ctx, move |ctx, _exec, mut stack| {
            let ref_id = if !stack.is_empty() {
                match stack.get(0) {
                    Value::String(s) => String::from_utf8_lossy(s.as_bytes()).to_string(),
                    other => format_value(ctx, other),
                }
            } else {
                return Err("page.check requires a ref_id argument"
                    .into_value(ctx)
                    .into());
            };
            let checked = if stack.len() > 1 {
                match stack.get(1) {
                    Value::Boolean(b) => b,
                    Value::Nil => true,
                    _ => true,
                }
            } else {
                true
            };
            let params = serde_json::json!({ "refId": ref_id, "checked": checked });
            let _validated: crate::command_params::PageCheckParams =
                match serde_json::from_value(params.clone()) {
                    Ok(v) => v,
                    Err(e) => {
                        let msg = crate::utils::format_param_error("page", "check", &e);
                        return Err(msg.into_value(ctx).into());
                    }
                };

            let mut hs = hs_page.borrow_mut();
            hs.async_call_counter += 1;
            let command = AsyncCommand {
                call_id: hs.async_call_counter,
                action: "page_check".to_string(),
                params,
            };
            hs.pending_async_command = Some(command);
            stack.clear();
            Ok(CallbackReturn::Yield {
                to_thread: None,
                then: None,
            })
        });
        lua_api_custom!(ctx, page_table, name: "check", callback: cb,
            namespace: "page",
            action: "page_check",
            doc: "Check or uncheck a checkbox by refId.",
            params: [
            ref_id: "string", required, "Element refId from snapshot",
            checked: "boolean", optional, "Checked state (default true)",
            ],
            returns: "nil" => "None",
        );
    }

    // page.hover(ref_id) — async
    {
        let hs_page = host_state.clone();
        let cb = Callback::from_fn(&ctx, move |ctx, _exec, mut stack| {
            let ref_id = if !stack.is_empty() {
                match stack.get(0) {
                    Value::String(s) => String::from_utf8_lossy(s.as_bytes()).to_string(),
                    other => format_value(ctx, other),
                }
            } else {
                return Err("page.hover requires a ref_id argument"
                    .into_value(ctx)
                    .into());
            };
            let params = serde_json::json!({ "refId": ref_id });
            let _validated: crate::command_params::PageHoverParams =
                match serde_json::from_value(params.clone()) {
                    Ok(v) => v,
                    Err(e) => {
                        let msg = crate::utils::format_param_error("page", "hover", &e);
                        return Err(msg.into_value(ctx).into());
                    }
                };

            let mut hs = hs_page.borrow_mut();
            hs.async_call_counter += 1;
            let command = AsyncCommand {
                call_id: hs.async_call_counter,
                action: "page_hover".to_string(),
                params,
            };
            hs.pending_async_command = Some(command);
            stack.clear();
            Ok(CallbackReturn::Yield {
                to_thread: None,
                then: None,
            })
        });
        lua_api_custom!(ctx, page_table, name: "hover", callback: cb,
            namespace: "page",
            action: "page_hover",
            doc: "Hover over an element by refId.",
            params: [
            ref_id: "string", required, "Element refId from snapshot",
            ],
            returns: "nil" => "None",
        );
    }

    // page.unhover() — async
    {
        let hs_page = host_state.clone();
        let cb = Callback::from_fn(&ctx, move |_ctx, _exec, mut stack| {
            let mut hs = hs_page.borrow_mut();
            hs.async_call_counter += 1;
            let command = AsyncCommand {
                call_id: hs.async_call_counter,
                action: "page_unhover".to_string(),
                params: serde_json::json!({}),
            };
            hs.pending_async_command = Some(command);
            stack.clear();
            Ok(CallbackReturn::Yield {
                to_thread: None,
                then: None,
            })
        });
        lua_api_custom!(ctx, page_table, name: "unhover", callback: cb,
            namespace: "page",
            action: "page_unhover",
            doc: "Move mouse away from any hovered element.",
            params: [
            ],
            returns: "nil" => "None",
        );
    }

    // page.scroll(direction, amount) — async
    {
        let hs_page = host_state.clone();
        let cb = Callback::from_fn(&ctx, move |ctx, _exec, mut stack| {
            let direction = if !stack.is_empty() {
                match stack.get(0) {
                    Value::String(s) => String::from_utf8_lossy(s.as_bytes()).to_string(),
                    other => format_value(ctx, other),
                }
            } else {
                "down".to_string()
            };
            let amount = if stack.len() > 1 {
                match stack.get(1) {
                    Value::Integer(i) => i as f64,
                    Value::Number(f) => f,
                    _ => 300.0,
                }
            } else {
                300.0
            };
            let ref_id = if stack.len() > 2 {
                match stack.get(2) {
                    Value::String(s) => Some(String::from_utf8_lossy(s.as_bytes()).to_string()),
                    Value::Nil => None,
                    other => {
                        let v = format_value(ctx, other);
                        if v.is_empty() {
                            None
                        } else {
                            Some(v)
                        }
                    }
                }
            } else {
                None
            };
            let params =
                serde_json::json!({ "direction": direction, "amount": amount, "refId": ref_id });
            let _validated: crate::command_params::PageScrollParams =
                match serde_json::from_value(params.clone()) {
                    Ok(v) => v,
                    Err(e) => {
                        let msg = crate::utils::format_param_error("page", "scroll", &e);
                        return Err(msg.into_value(ctx).into());
                    }
                };

            let mut hs = hs_page.borrow_mut();
            hs.async_call_counter += 1;
            let command = AsyncCommand {
                call_id: hs.async_call_counter,
                action: "page_scroll".to_string(),
                params,
            };
            hs.pending_async_command = Some(command);
            stack.clear();
            Ok(CallbackReturn::Yield {
                to_thread: None,
                then: None,
            })
        });
        lua_api_custom!(ctx, page_table, name: "scroll", callback: cb,
            namespace: "page",
            action: "page_scroll",
            doc: "Scroll the page by direction and amount.",
            params: [
            direction: "string", optional, "up, down, left, right (default down)",
            amount: "number", optional, "Pixels to scroll (default 300)",
            ref_id: "string", optional, "Element refId to scroll within its overflow container",
            ],
            returns: "nil" => "None",
        );
    }

    // page.scroll_to(ref_id) — async
    {
        let hs_page = host_state.clone();
        let cb = Callback::from_fn(&ctx, move |ctx, _exec, mut stack| {
            let ref_id = if !stack.is_empty() {
                match stack.get(0) {
                    Value::String(s) => String::from_utf8_lossy(s.as_bytes()).to_string(),
                    other => format_value(ctx, other),
                }
            } else {
                return Err("page.scroll_to requires a ref_id argument"
                    .into_value(ctx)
                    .into());
            };
            let params = serde_json::json!({ "refId": ref_id });
            let _validated: crate::command_params::PageScrollToParams =
                match serde_json::from_value(params.clone()) {
                    Ok(v) => v,
                    Err(e) => {
                        let msg = crate::utils::format_param_error("page", "scroll_to", &e);
                        return Err(msg.into_value(ctx).into());
                    }
                };

            let mut hs = hs_page.borrow_mut();
            hs.async_call_counter += 1;
            let command = AsyncCommand {
                call_id: hs.async_call_counter,
                action: "page_scroll_to".to_string(),
                params,
            };
            hs.pending_async_command = Some(command);
            stack.clear();
            Ok(CallbackReturn::Yield {
                to_thread: None,
                then: None,
            })
        });
        lua_api_custom!(ctx, page_table, name: "scroll_to", callback: cb,
            namespace: "page",
            action: "page_scroll_to",
            doc: "Scroll to an element by refId.",
            params: [
            ref_id: "string", required, "Element refId from snapshot",
            ],
            returns: "nil" => "None",
        );
    }

    // page.url() — async
    {
        let hs_page = host_state.clone();
        let cb = Callback::from_fn(&ctx, move |_ctx, _exec, mut stack| {
            let mut hs = hs_page.borrow_mut();
            hs.async_call_counter += 1;
            let command = AsyncCommand {
                call_id: hs.async_call_counter,
                action: "page_url".to_string(),
                params: serde_json::json!({}),
            };
            hs.pending_async_command = Some(command);
            stack.clear();
            Ok(CallbackReturn::Yield {
                to_thread: None,
                then: None,
            })
        });
        lua_api_custom!(ctx, page_table, name: "url", callback: cb,
            namespace: "page",
            action: "page_url",
            doc: "Get the current page URL.",
            params: [
            ],
            returns: "string" => "Current URL",
        );
    }

    // page.title() — async
    {
        let hs_page = host_state.clone();
        let cb = Callback::from_fn(&ctx, move |_ctx, _exec, mut stack| {
            let mut hs = hs_page.borrow_mut();
            hs.async_call_counter += 1;
            let command = AsyncCommand {
                call_id: hs.async_call_counter,
                action: "page_title".to_string(),
                params: serde_json::json!({}),
            };
            hs.pending_async_command = Some(command);
            stack.clear();
            Ok(CallbackReturn::Yield {
                to_thread: None,
                then: None,
            })
        });
        lua_api_custom!(ctx, page_table, name: "title", callback: cb,
            namespace: "page",
            action: "page_title",
            doc: "Get the current page title.",
            params: [
            ],
            returns: "string" => "Current page title",
        );
    }

    // page.screenshot() — async
    {
        let hs_page = host_state.clone();
        let cb = Callback::from_fn(&ctx, move |_ctx, _exec, mut stack| {
            let mut hs = hs_page.borrow_mut();
            hs.async_call_counter += 1;
            let command = AsyncCommand {
                call_id: hs.async_call_counter,
                action: "page_screenshot".to_string(),
                params: serde_json::json!({}),
            };
            hs.pending_async_command = Some(command);
            stack.clear();
            Ok(CallbackReturn::Yield {
                to_thread: None,
                then: None,
            })
        });
        lua_api_custom!(ctx, page_table, name: "screenshot", callback: cb,
            namespace: "page",
            action: "page_screenshot",
            doc: "Take a screenshot of the current page.",
            params: [
            ],
            returns: "string" => "Base64-encoded screenshot image",
        );
    }

    // page.goto(url) — async
    {
        let hs_page = host_state.clone();
        let cb = Callback::from_fn(&ctx, move |ctx, _exec, mut stack| {
            let url = if !stack.is_empty() {
                match stack.get(0) {
                    Value::String(s) => String::from_utf8_lossy(s.as_bytes()).to_string(),
                    other => format_value(ctx, other),
                }
            } else {
                return Err("page.goto requires a URL argument".into_value(ctx).into());
            };
            let params = serde_json::json!({ "url": url });
            let _validated: crate::command_params::PageGotoParams =
                match serde_json::from_value(params.clone()) {
                    Ok(v) => v,
                    Err(e) => {
                        let msg = crate::utils::format_param_error("page", "goto", &e);
                        return Err(msg.into_value(ctx).into());
                    }
                };

            let mut hs = hs_page.borrow_mut();
            hs.async_call_counter += 1;
            let command = AsyncCommand {
                call_id: hs.async_call_counter,
                action: "page_goto".to_string(),
                params,
            };
            hs.pending_async_command = Some(command);
            stack.clear();
            Ok(CallbackReturn::Yield {
                to_thread: None,
                then: None,
            })
        });
        lua_api_custom!(ctx, page_table, name: "goto", callback: cb,
            namespace: "page",
            action: "page_goto",
            doc: "Navigate to a URL.",
            params: [
            url: "string", required, "URL to navigate to",
            ],
            returns: "nil" => "None",
        );
        lua_api_custom!(ctx, page_table, name: "go", callback: cb,
            namespace: "page",
            action: "page_goto",
            doc: "Navigate to a URL (alias for page.goto).",
            params: [
            url: "string", required, "URL to navigate to",
            ],
            returns: "nil" => "None",
        );
    }

    // page.back() — async
    {
        let hs_page = host_state.clone();
        let cb = Callback::from_fn(&ctx, move |_ctx, _exec, mut stack| {
            let mut hs = hs_page.borrow_mut();
            hs.async_call_counter += 1;
            let command = AsyncCommand {
                call_id: hs.async_call_counter,
                action: "page_back".to_string(),
                params: serde_json::json!({}),
            };
            hs.pending_async_command = Some(command);
            stack.clear();
            Ok(CallbackReturn::Yield {
                to_thread: None,
                then: None,
            })
        });
        lua_api_custom!(ctx, page_table, name: "back", callback: cb,
            namespace: "page",
            action: "page_back",
            doc: "Navigate back in history.",
            params: [
            ],
            returns: "nil" => "None",
        );
    }

    // page.forward() — async
    {
        let hs_page = host_state.clone();
        let cb = Callback::from_fn(&ctx, move |_ctx, _exec, mut stack| {
            let mut hs = hs_page.borrow_mut();
            hs.async_call_counter += 1;
            let command = AsyncCommand {
                call_id: hs.async_call_counter,
                action: "page_forward".to_string(),
                params: serde_json::json!({}),
            };
            hs.pending_async_command = Some(command);
            stack.clear();
            Ok(CallbackReturn::Yield {
                to_thread: None,
                then: None,
            })
        });
        lua_api_custom!(ctx, page_table, name: "forward", callback: cb,
            namespace: "page",
            action: "page_forward",
            doc: "Navigate forward in history.",
            params: [
            ],
            returns: "nil" => "None",
        );
    }

    // page.reload() — async
    {
        let hs_page = host_state.clone();
        let cb = Callback::from_fn(&ctx, move |_ctx, _exec, mut stack| {
            let mut hs = hs_page.borrow_mut();
            hs.async_call_counter += 1;
            let command = AsyncCommand {
                call_id: hs.async_call_counter,
                action: "page_reload".to_string(),
                params: serde_json::json!({}),
            };
            hs.pending_async_command = Some(command);
            stack.clear();
            Ok(CallbackReturn::Yield {
                to_thread: None,
                then: None,
            })
        });
        lua_api_custom!(ctx, page_table, name: "reload", callback: cb,
            namespace: "page",
            action: "page_reload",
            doc: "Reload the current page.",
            params: [
            ],
            returns: "nil" => "None",
        );
    }

    // page.wait(ms) — async
    {
        let hs_page = host_state.clone();
        let cb = Callback::from_fn(&ctx, move |ctx, _exec, mut stack| {
            let ms = if !stack.is_empty() {
                match stack.get(0) {
                    Value::Integer(i) => i as u64,
                    Value::Number(f) => f as u64,
                    _ => 1000,
                }
            } else {
                1000
            };
            let params = serde_json::json!({ "duration": ms });
            let _validated: crate::command_params::PageWaitParams =
                match serde_json::from_value(params.clone()) {
                    Ok(v) => v,
                    Err(e) => {
                        let msg = crate::utils::format_param_error("page", "wait", &e);
                        return Err(msg.into_value(ctx).into());
                    }
                };

            let mut hs = hs_page.borrow_mut();
            hs.async_call_counter += 1;
            let command = AsyncCommand {
                call_id: hs.async_call_counter,
                action: "page_wait".to_string(),
                params,
            };
            hs.pending_async_command = Some(command);
            stack.clear();
            Ok(CallbackReturn::Yield {
                to_thread: None,
                then: None,
            })
        });
        lua_api_custom!(ctx, page_table, name: "wait", callback: cb,
            namespace: "page",
            action: "page_wait",
            doc: "Wait for a duration.",
            params: [
            ms: "number", optional, "Milliseconds to wait (default 1000)",
            ],
            returns: "nil" => "None",
        );
        crate::api_docs::register(crate::api_docs::LuaApiDoc {
            namespace: "page".to_string(),
            name: "wait_for_load".to_string(),
            public_name: "page.wait_for_load".to_string(),
            action: Some("tab_wait_for_load".to_string()),
            local_name: None,
            source: crate::api_docs::ToolSource::RustCore,
            transport: crate::api_docs::ToolTransport::HostAsync,
            description: "Wait for the current tab to finish loading.".to_string(),
            params: vec![crate::api_docs::ParamDoc {
                name: "timeout".to_string(),
                lua_type: "number".to_string(),
                required: false,
                description: "Timeout in milliseconds".to_string(),
            }],
            returns: crate::api_docs::ReturnDoc {
                lua_type: "boolean".to_string(),
                description: "true if loaded within timeout".to_string(),
            },
        });
    }

    // page.tabs() — async (extension mode)
    {
        let hs_page = host_state.clone();
        let cb = Callback::from_fn(&ctx, move |_ctx, _exec, mut stack| {
            let mut hs = hs_page.borrow_mut();
            hs.async_call_counter += 1;
            let command = AsyncCommand {
                call_id: hs.async_call_counter,
                action: "page_tabs".to_string(),
                params: serde_json::json!({}),
            };
            hs.pending_async_command = Some(command);
            stack.clear();
            Ok(CallbackReturn::Yield {
                to_thread: None,
                then: None,
            })
        });
        lua_api_custom!(ctx, page_table, name: "tabs", callback: cb,
            namespace: "page",
            action: "page_tabs",
            doc: "Get all tabs in the current window (extension mode).",
            params: [
            ],
            returns: "table" => "Array of tab objects",
        );
    }

    // page.switch(tabId) — async
    {
        let hs_page = host_state.clone();
        let cb = Callback::from_fn(&ctx, move |ctx, _exec, mut stack| {
            let tab_id = if !stack.is_empty() {
                match stack.get(0) {
                    Value::Integer(i) => i as f64,
                    Value::Number(f) => f,
                    other => {
                        let msg = format!(
                            "page.switch expects tabId (number), got {}",
                            other.type_name()
                        );
                        return Err(msg.into_value(ctx).into());
                    }
                }
            } else {
                return Err("page.switch requires a tabId argument"
                    .into_value(ctx)
                    .into());
            };
            let mut hs = hs_page.borrow_mut();
            hs.async_call_counter += 1;
            let command = AsyncCommand {
                call_id: hs.async_call_counter,
                action: "page_switch".to_string(),
                params: serde_json::json!({ "tabId": tab_id }),
            };
            hs.pending_async_command = Some(command);
            stack.clear();
            Ok(CallbackReturn::Yield {
                to_thread: None,
                then: None,
            })
        });
        lua_api_custom!(ctx, page_table, name: "switch", callback: cb,
            namespace: "page",
            action: "page_switch",
            doc: "Switch to a tab by ID.",
            params: [
            tab_id: "number", required, "Tab ID to switch to",
            ],
            returns: "nil" => "None",
        );
    }

    // page.new_tab(url?) — async
    {
        let hs_page = host_state.clone();
        let cb = Callback::from_fn(&ctx, move |_ctx, _exec, mut stack| {
            let url = if !stack.is_empty() {
                match stack.get(0) {
                    Value::String(s) => Some(String::from_utf8_lossy(s.as_bytes()).to_string()),
                    Value::Nil => None,
                    _ => None,
                }
            } else {
                None
            };
            let mut hs = hs_page.borrow_mut();
            hs.async_call_counter += 1;
            let command = AsyncCommand {
                call_id: hs.async_call_counter,
                action: "page_new_tab".to_string(),
                params: serde_json::json!({ "url": url }),
            };
            hs.pending_async_command = Some(command);
            stack.clear();
            Ok(CallbackReturn::Yield {
                to_thread: None,
                then: None,
            })
        });
        lua_api_custom!(ctx, page_table, name: "new_tab", callback: cb,
            namespace: "page",
            action: "page_new_tab",
            doc: "Open a new tab (optionally with a URL).",
            params: [
            url: "string | nil", optional, "URL to open in the new tab",
            ],
            returns: "table" => "Created tab object",
        );
    }

    // page.close(tabId) — async
    {
        let hs_page = host_state.clone();
        let cb = Callback::from_fn(&ctx, move |ctx, _exec, mut stack| {
            let tab_id = if !stack.is_empty() {
                match stack.get(0) {
                    Value::Integer(i) => i as f64,
                    Value::Number(f) => f,
                    other => {
                        let msg = format!(
                            "page.close expects tabId (number), got {}",
                            other.type_name()
                        );
                        return Err(msg.into_value(ctx).into());
                    }
                }
            } else {
                return Err("page.close requires a tabId argument"
                    .into_value(ctx)
                    .into());
            };
            let mut hs = hs_page.borrow_mut();
            hs.async_call_counter += 1;
            let command = AsyncCommand {
                call_id: hs.async_call_counter,
                action: "page_close".to_string(),
                params: serde_json::json!({ "tabId": tab_id }),
            };
            hs.pending_async_command = Some(command);
            stack.clear();
            Ok(CallbackReturn::Yield {
                to_thread: None,
                then: None,
            })
        });
        lua_api_custom!(ctx, page_table, name: "close", callback: cb,
            namespace: "page",
            action: "page_close",
            doc: "Close a tab by ID.",
            params: [
            tab_id: "number", required, "Tab ID to close",
            ],
            returns: "boolean" => "Whether close succeeded",
        );
    }

    // page.active_tab() — async
    {
        let hs_page = host_state.clone();
        let cb = Callback::from_fn(&ctx, move |_ctx, _exec, mut stack| {
            let mut hs = hs_page.borrow_mut();
            hs.async_call_counter += 1;
            let command = AsyncCommand {
                call_id: hs.async_call_counter,
                action: "page_active_tab".to_string(),
                params: serde_json::json!({}),
            };
            hs.pending_async_command = Some(command);
            stack.clear();
            Ok(CallbackReturn::Yield {
                to_thread: None,
                then: None,
            })
        });
        lua_api_custom!(ctx, page_table, name: "active_tab", callback: cb,
            namespace: "page",
            action: "page_active_tab",
            doc: "Get the currently active tab ID.",
            params: [
            ],
            returns: "number | nil" => "Active tab ID or nil",
        );
    }

    // page.find(selector) — async
    {
        let hs_page = host_state.clone();
        let cb = Callback::from_fn(&ctx, move |ctx, _exec, mut stack| {
            let selector = if !stack.is_empty() {
                match stack.get(0) {
                    Value::String(s) => String::from_utf8_lossy(s.as_bytes()).to_string(),
                    Value::Table(t) => match t.get(ctx, "selector") {
                        Ok(Value::String(s)) => String::from_utf8_lossy(s.as_bytes()).to_string(),
                        Ok(other) => format_value(ctx, other),
                        Err(_) => {
                            return Err("page.find: table must have a 'selector' field"
                                .into_value(ctx)
                                .into())
                        }
                    },
                    other => format_value(ctx, other),
                }
            } else {
                return Err("page.find requires a selector argument"
                    .into_value(ctx)
                    .into());
            };
            let params = serde_json::json!({ "selector": selector });
            let _validated: crate::command_params::PageFindParams =
                match serde_json::from_value(params.clone()) {
                    Ok(v) => v,
                    Err(e) => {
                        let msg = crate::utils::format_param_error("page", "find", &e);
                        return Err(msg.into_value(ctx).into());
                    }
                };

            let mut hs = hs_page.borrow_mut();
            hs.async_call_counter += 1;
            let command = AsyncCommand {
                call_id: hs.async_call_counter,
                action: "page_find".to_string(),
                params,
            };
            hs.pending_async_command = Some(command);
            stack.clear();
            Ok(CallbackReturn::Yield {
                to_thread: None,
                then: None,
            })
        });
        lua_api_custom!(ctx, page_table, name: "find", callback: cb,
            namespace: "page",
            action: "page_find",
            doc: "Find elements matching a CSS selector.",
            params: [
            selector: "string", required, "CSS selector",
            ],
            returns: "table" => "Array of element objects { tag, refId, text }",
        );
    }

    // page.wait_for(selector, timeout?) — async
    {
        let hs_page = host_state.clone();
        let cb = Callback::from_fn(&ctx, move |ctx, _exec, mut stack| {
            let selector = if !stack.is_empty() {
                match stack.get(0) {
                    Value::String(s) => String::from_utf8_lossy(s.as_bytes()).to_string(),
                    other => format_value(ctx, other),
                }
            } else {
                return Err("page.wait_for requires a selector argument"
                    .into_value(ctx)
                    .into());
            };
            let timeout = if stack.len() > 1 {
                match stack.get(1) {
                    Value::Integer(i) => i as u64,
                    Value::Number(f) => f as u64,
                    _ => 30_000,
                }
            } else {
                30_000
            };
            let params = serde_json::json!({ "selector": selector, "timeout": timeout });
            let _validated: crate::command_params::PageWaitForParams =
                match serde_json::from_value(params.clone()) {
                    Ok(v) => v,
                    Err(e) => {
                        let msg = crate::utils::format_param_error("page", "wait_for", &e);
                        return Err(msg.into_value(ctx).into());
                    }
                };

            let mut hs = hs_page.borrow_mut();
            hs.async_call_counter += 1;
            let command = AsyncCommand {
                call_id: hs.async_call_counter,
                action: "page_wait_for".to_string(),
                params,
            };
            hs.pending_async_command = Some(command);
            stack.clear();
            Ok(CallbackReturn::Yield {
                to_thread: None,
                then: None,
            })
        });
        lua_api_custom!(ctx, page_table, name: "wait_for", callback: cb,
            namespace: "page",
            action: "page_wait_for",
            doc: "Wait for an element matching a CSS selector to appear.",
            params: [
            selector: "string", required, "CSS selector",
            timeout: "number", optional, "Timeout in milliseconds (default 30000)",
            ],
            returns: "boolean" => "True if element found, false if timeout",
        );
    }

    // page.extract(fields, opts?) — async
    {
        let hs_page = host_state.clone();
        let cb = Callback::from_fn(&ctx, move |ctx, _exec, mut stack| {
            let fields = if !stack.is_empty() {
                match stack.get(0) {
                    Value::Table(t) => {
                        let mut fields = Vec::new();
                        for i in 1..=t.length() {
                            if let Ok(Value::String(s)) = t.get(ctx, i) {
                                fields.push(String::from_utf8_lossy(s.as_bytes()).to_string());
                            }
                        }
                        fields
                    }
                    _ => Vec::new(),
                }
            } else {
                Vec::new()
            };
            let opts = if stack.len() >= 2 {
                match stack.get(1) {
                    Value::Table(_) => lua_value_to_json(ctx, stack.get(1)).ok(),
                    _ => Some(serde_json::json!({})),
                }
            } else {
                Some(serde_json::json!({}))
            };
            let params = serde_json::json!({
                "fields": fields,
                "max_text": opts.as_ref().and_then(|o| o.get("max_text").and_then(|v| v.as_u64())).unwrap_or(500),
                "max_headings": opts.as_ref().and_then(|o| o.get("max_headings").and_then(|v| v.as_u64())).unwrap_or(200),
                "max_links": opts.as_ref().and_then(|o| o.get("max_links").and_then(|v| v.as_u64())).unwrap_or(100),
            });
            let _validated: crate::command_params::PageExtractParams =
                match serde_json::from_value(params.clone()) {
                    Ok(v) => v,
                    Err(e) => {
                        let msg = crate::utils::format_param_error("page", "extract", &e);
                        return Err(msg.into_value(ctx).into());
                    }
                };

            let mut hs = hs_page.borrow_mut();
            hs.async_call_counter += 1;
            let command = AsyncCommand {
                call_id: hs.async_call_counter,
                action: "page_extract".to_string(),
                params,
            };
            hs.pending_async_command = Some(command);
            stack.clear();
            Ok(CallbackReturn::Yield {
                to_thread: None,
                then: None,
            })
        });
        lua_api_custom!(ctx, page_table, name: "extract", callback: cb,
            namespace: "page",
            action: "page_extract",
            doc: "Extract structured data from the page.",
            params: [
            fields: "table", required, "Array of field names: title, url, headings, links, etc.",
            opts: "table | nil", optional, "Options: max_text, max_headings, max_links",
            ],
            returns: "table" => "Extracted data object",
        );
    }

    // page.append(ref_id, text) — async (append text)
    {
        let hs_page = host_state.clone();
        let cb = Callback::from_fn(&ctx, move |ctx, _exec, mut stack| {
            let ref_id = if !stack.is_empty() {
                match stack.get(0) {
                    Value::String(s) => String::from_utf8_lossy(s.as_bytes()).to_string(),
                    other => format_value(ctx, other),
                }
            } else {
                return Err("page.append requires ref_id and text arguments"
                    .into_value(ctx)
                    .into());
            };
            let text = if stack.len() > 1 {
                match stack.get(1) {
                    Value::String(s) => String::from_utf8_lossy(s.as_bytes()).to_string(),
                    other => format_value(ctx, other),
                }
            } else {
                return Err("page.append requires a text argument"
                    .into_value(ctx)
                    .into());
            };
            let params = serde_json::json!({ "refId": ref_id, "text": text });
            let _validated: crate::command_params::PageAppendParams =
                match serde_json::from_value(params.clone()) {
                    Ok(v) => v,
                    Err(e) => {
                        let msg = crate::utils::format_param_error("page", "append", &e);
                        return Err(msg.into_value(ctx).into());
                    }
                };

            let mut hs = hs_page.borrow_mut();
            hs.async_call_counter += 1;
            let command = AsyncCommand {
                call_id: hs.async_call_counter,
                action: "page_append".to_string(),
                params,
            };
            hs.pending_async_command = Some(command);
            stack.clear();
            Ok(CallbackReturn::Yield {
                to_thread: None,
                then: None,
            })
        });
        lua_api_custom!(ctx, page_table, name: "append", callback: cb,
            namespace: "page",
            action: "page_append",
            doc: "Append text to an input element by refId.",
            params: [
            ref_id: "string", required, "Element refId from snapshot",
            text: "string", required, "Text to append",
            ],
            returns: "nil" => "None",
        );
    }

    set_protected_global!(ctx, "page", page_table, "page");
}
