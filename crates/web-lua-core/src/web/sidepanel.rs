use crate::json::lua_value_to_json;
use crate::state::HostState;
use crate::types::AsyncCommand;
use crate::utils::format_value;
use piccolo::{Callback, CallbackReturn, Context, IntoValue, Table, Value};
use std::cell::RefCell;
use std::rc::Rc;

pub(crate) fn register<'a>(ctx: Context<'a>, host_state: Rc<RefCell<HostState>>) {
    let sidepanel_table = Table::new(&ctx);

    // sidepanel.snapshot(opts?) — async, yields "sidepanel_snapshot_text"
    {
        let hs = host_state.clone();
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
                        let msg = crate::utils::format_param_error("sidepanel", "snapshot", &e);
                        return Err(msg.into_value(ctx).into());
                    }
                };

            let mut hs = hs.borrow_mut();
            hs.async_call_counter += 1;
            let command = AsyncCommand {
                call_id: hs.async_call_counter,
                action: "sidepanel_snapshot_text".to_string(),
                params,
            };
            hs.pending_async_command = Some(command);
            stack.clear();
            Ok(CallbackReturn::Yield {
                to_thread: None,
                then: None,
            })
        });
        lua_api_custom!(ctx, sidepanel_table, name: "snapshot", callback: cb,
            namespace: "sidepanel",
            action: "sidepanel_snapshot_text",
            doc: "Take a DOM snapshot of the sidepanel and return readable text.",
            params: [
            opts: "table | nil", optional, "Options: max_nodes, interactive_only, etc.",
            ],
            returns: "string" => "Readable accessibility tree with refIds",
        );
    }

    // sidepanel.snapshot_data(opts?) — async, yields "sidepanel_snapshot_data"
    {
        let hs = host_state.clone();
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
                        let msg =
                            crate::utils::format_param_error("sidepanel", "snapshot_data", &e);
                        return Err(msg.into_value(ctx).into());
                    }
                };

            let mut hs = hs.borrow_mut();
            hs.async_call_counter += 1;
            let command = AsyncCommand {
                call_id: hs.async_call_counter,
                action: "sidepanel_snapshot_data".to_string(),
                params,
            };
            hs.pending_async_command = Some(command);
            stack.clear();
            Ok(CallbackReturn::Yield {
                to_thread: None,
                then: None,
            })
        });
        lua_api_custom!(ctx, sidepanel_table, name: "snapshot_data", callback: cb,
            namespace: "sidepanel",
            action: "sidepanel_snapshot_data",
            doc: "Take a DOM snapshot of the sidepanel and return structured data.",
            params: [
            opts: "table | nil", optional, "Options: max_nodes, interactive_only, etc.",
            ],
            returns: "table" => "Structured snapshot with nodes, url, title, viewport",
        );
    }

    // sidepanel.click(ref_id) — async
    {
        let hs = host_state.clone();
        let cb = Callback::from_fn(&ctx, move |ctx, _exec, mut stack| {
            let ref_id = if !stack.is_empty() {
                match stack.get(0) {
                    Value::String(s) => String::from_utf8_lossy(s.as_bytes()).to_string(),
                    other => format_value(ctx, other),
                }
            } else {
                return Err("sidepanel.click requires a ref_id argument"
                    .into_value(ctx)
                    .into());
            };
            let params = serde_json::json!({ "refId": ref_id });
            let _validated: crate::command_params::PageClickParams =
                match serde_json::from_value(params.clone()) {
                    Ok(v) => v,
                    Err(e) => {
                        let msg = crate::utils::format_param_error("sidepanel", "click", &e);
                        return Err(msg.into_value(ctx).into());
                    }
                };

            let mut hs = hs.borrow_mut();
            hs.async_call_counter += 1;
            let command = AsyncCommand {
                call_id: hs.async_call_counter,
                action: "sidepanel_click".to_string(),
                params,
            };
            hs.pending_async_command = Some(command);
            stack.clear();
            Ok(CallbackReturn::Yield {
                to_thread: None,
                then: None,
            })
        });
        lua_api_custom!(ctx, sidepanel_table, name: "click", callback: cb,
            namespace: "sidepanel",
            action: "sidepanel_click",
            doc: "Click an element by refId in the sidepanel.",
            params: [
            ref_id: "string", required, "Element refId from snapshot",
            ],
            returns: "nil" => "None",
        );
    }

    // sidepanel.dblclick(ref_id) — async
    {
        let hs = host_state.clone();
        let cb = Callback::from_fn(&ctx, move |ctx, _exec, mut stack| {
            let ref_id = if !stack.is_empty() {
                match stack.get(0) {
                    Value::String(s) => String::from_utf8_lossy(s.as_bytes()).to_string(),
                    other => format_value(ctx, other),
                }
            } else {
                return Err("sidepanel.dblclick requires a ref_id argument"
                    .into_value(ctx)
                    .into());
            };
            let params = serde_json::json!({ "refId": ref_id });
            let _validated: crate::command_params::PageDblClickParams =
                match serde_json::from_value(params.clone()) {
                    Ok(v) => v,
                    Err(e) => {
                        let msg = crate::utils::format_param_error("sidepanel", "dblclick", &e);
                        return Err(msg.into_value(ctx).into());
                    }
                };

            let mut hs = hs.borrow_mut();
            hs.async_call_counter += 1;
            let command = AsyncCommand {
                call_id: hs.async_call_counter,
                action: "sidepanel_dblclick".to_string(),
                params,
            };
            hs.pending_async_command = Some(command);
            stack.clear();
            Ok(CallbackReturn::Yield {
                to_thread: None,
                then: None,
            })
        });
        lua_api_custom!(ctx, sidepanel_table, name: "dblclick", callback: cb,
            namespace: "sidepanel",
            action: "sidepanel_dblclick",
            doc: "Double-click an element by refId in the sidepanel.",
            params: [
            ref_id: "string", required, "Element refId from snapshot",
            ],
            returns: "nil" => "None",
        );
    }

    // sidepanel.fill(ref_id, value) — async
    {
        let hs = host_state.clone();
        let cb = Callback::from_fn(&ctx, move |ctx, _exec, mut stack| {
            let ref_id = if !stack.is_empty() {
                match stack.get(0) {
                    Value::String(s) => String::from_utf8_lossy(s.as_bytes()).to_string(),
                    other => format_value(ctx, other),
                }
            } else {
                return Err("sidepanel.fill requires ref_id and value arguments"
                    .into_value(ctx)
                    .into());
            };
            let value = if stack.len() > 1 {
                match stack.get(1) {
                    Value::String(s) => String::from_utf8_lossy(s.as_bytes()).to_string(),
                    other => format_value(ctx, other),
                }
            } else {
                return Err("sidepanel.fill requires a value argument"
                    .into_value(ctx)
                    .into());
            };
            let params = serde_json::json!({ "refId": ref_id, "value": value });
            let _validated: crate::command_params::PageFillParams =
                match serde_json::from_value(params.clone()) {
                    Ok(v) => v,
                    Err(e) => {
                        let msg = crate::utils::format_param_error("sidepanel", "fill", &e);
                        return Err(msg.into_value(ctx).into());
                    }
                };

            let mut hs = hs.borrow_mut();
            hs.async_call_counter += 1;
            let command = AsyncCommand {
                call_id: hs.async_call_counter,
                action: "sidepanel_fill".to_string(),
                params,
            };
            hs.pending_async_command = Some(command);
            stack.clear();
            Ok(CallbackReturn::Yield {
                to_thread: None,
                then: None,
            })
        });
        lua_api_custom!(ctx, sidepanel_table, name: "fill", callback: cb,
            namespace: "sidepanel",
            action: "sidepanel_fill",
            doc: "Fill an input element by refId with a value in the sidepanel.",
            params: [
            ref_id: "string", required, "Element refId from snapshot",
            value: "string", required, "Text to fill",
            ],
            returns: "nil" => "None",
        );
    }

    // sidepanel.type(ref_id, text) — async (append text)
    {
        let hs = host_state.clone();
        let cb = Callback::from_fn(&ctx, move |ctx, _exec, mut stack| {
            let ref_id = if !stack.is_empty() {
                match stack.get(0) {
                    Value::String(s) => String::from_utf8_lossy(s.as_bytes()).to_string(),
                    other => format_value(ctx, other),
                }
            } else {
                return Err("sidepanel.type requires ref_id and text arguments"
                    .into_value(ctx)
                    .into());
            };
            let text = if stack.len() > 1 {
                match stack.get(1) {
                    Value::String(s) => String::from_utf8_lossy(s.as_bytes()).to_string(),
                    other => format_value(ctx, other),
                }
            } else {
                return Err("sidepanel.type requires a text argument"
                    .into_value(ctx)
                    .into());
            };
            let params = serde_json::json!({ "refId": ref_id, "text": text });
            let _validated: crate::command_params::PageTypeParams =
                match serde_json::from_value(params.clone()) {
                    Ok(v) => v,
                    Err(e) => {
                        let msg = crate::utils::format_param_error("sidepanel", "type", &e);
                        return Err(msg.into_value(ctx).into());
                    }
                };

            let mut hs = hs.borrow_mut();
            hs.async_call_counter += 1;
            let command = AsyncCommand {
                call_id: hs.async_call_counter,
                action: "sidepanel_type".to_string(),
                params,
            };
            hs.pending_async_command = Some(command);
            stack.clear();
            Ok(CallbackReturn::Yield {
                to_thread: None,
                then: None,
            })
        });
        lua_api_custom!(ctx, sidepanel_table, name: "type", callback: cb,
            namespace: "sidepanel",
            action: "sidepanel_type",
            doc: "Append text to an input element by refId in the sidepanel.",
            params: [
            ref_id: "string", required, "Element refId from snapshot",
            text: "string", required, "Text to append",
            ],
            returns: "nil" => "None",
        );
    }

    // sidepanel.press(key) — async
    {
        let hs = host_state.clone();
        let cb = Callback::from_fn(&ctx, move |ctx, _exec, mut stack| {
            let key = if !stack.is_empty() {
                match stack.get(0) {
                    Value::String(s) => String::from_utf8_lossy(s.as_bytes()).to_string(),
                    other => format_value(ctx, other),
                }
            } else {
                return Err("sidepanel.press requires a key argument"
                    .into_value(ctx)
                    .into());
            };
            let params = serde_json::json!({ "key": key });
            let _validated: crate::command_params::PagePressParams =
                match serde_json::from_value(params.clone()) {
                    Ok(v) => v,
                    Err(e) => {
                        let msg = crate::utils::format_param_error("sidepanel", "press", &e);
                        return Err(msg.into_value(ctx).into());
                    }
                };

            let mut hs = hs.borrow_mut();
            hs.async_call_counter += 1;
            let command = AsyncCommand {
                call_id: hs.async_call_counter,
                action: "sidepanel_press".to_string(),
                params,
            };
            hs.pending_async_command = Some(command);
            stack.clear();
            Ok(CallbackReturn::Yield {
                to_thread: None,
                then: None,
            })
        });
        lua_api_custom!(ctx, sidepanel_table, name: "press", callback: cb,
            namespace: "sidepanel",
            action: "sidepanel_press",
            doc: "Press a keyboard key in the sidepanel.",
            params: [
            key: "string", required, "Key name: Enter, Escape, ArrowDown, etc.",
            ],
            returns: "nil" => "None",
        );
    }

    // sidepanel.select(ref_id, value) — async
    {
        let hs = host_state.clone();
        let cb = Callback::from_fn(&ctx, move |ctx, _exec, mut stack| {
            let ref_id = if !stack.is_empty() {
                match stack.get(0) {
                    Value::String(s) => String::from_utf8_lossy(s.as_bytes()).to_string(),
                    other => format_value(ctx, other),
                }
            } else {
                return Err("sidepanel.select requires ref_id and value arguments"
                    .into_value(ctx)
                    .into());
            };
            let value = if stack.len() > 1 {
                match stack.get(1) {
                    Value::String(s) => String::from_utf8_lossy(s.as_bytes()).to_string(),
                    other => format_value(ctx, other),
                }
            } else {
                return Err("sidepanel.select requires a value argument"
                    .into_value(ctx)
                    .into());
            };
            let params = serde_json::json!({ "refId": ref_id, "value": value });
            let _validated: crate::command_params::PageSelectParams =
                match serde_json::from_value(params.clone()) {
                    Ok(v) => v,
                    Err(e) => {
                        let msg = crate::utils::format_param_error("sidepanel", "select", &e);
                        return Err(msg.into_value(ctx).into());
                    }
                };

            let mut hs = hs.borrow_mut();
            hs.async_call_counter += 1;
            let command = AsyncCommand {
                call_id: hs.async_call_counter,
                action: "sidepanel_select".to_string(),
                params,
            };
            hs.pending_async_command = Some(command);
            stack.clear();
            Ok(CallbackReturn::Yield {
                to_thread: None,
                then: None,
            })
        });
        lua_api_custom!(ctx, sidepanel_table, name: "select", callback: cb,
            namespace: "sidepanel",
            action: "sidepanel_select",
            doc: "Select an option in a dropdown by refId and value in the sidepanel.",
            params: [
            ref_id: "string", required, "Element refId from snapshot",
            value: "string", required, "Option value to select",
            ],
            returns: "nil" => "None",
        );
    }

    // sidepanel.check(ref_id, checked?) — async
    {
        let hs = host_state.clone();
        let cb = Callback::from_fn(&ctx, move |ctx, _exec, mut stack| {
            let ref_id = if !stack.is_empty() {
                match stack.get(0) {
                    Value::String(s) => String::from_utf8_lossy(s.as_bytes()).to_string(),
                    other => format_value(ctx, other),
                }
            } else {
                return Err("sidepanel.check requires a ref_id argument"
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
                        let msg = crate::utils::format_param_error("sidepanel", "check", &e);
                        return Err(msg.into_value(ctx).into());
                    }
                };

            let mut hs = hs.borrow_mut();
            hs.async_call_counter += 1;
            let command = AsyncCommand {
                call_id: hs.async_call_counter,
                action: "sidepanel_check".to_string(),
                params,
            };
            hs.pending_async_command = Some(command);
            stack.clear();
            Ok(CallbackReturn::Yield {
                to_thread: None,
                then: None,
            })
        });
        lua_api_custom!(ctx, sidepanel_table, name: "check", callback: cb,
            namespace: "sidepanel",
            action: "sidepanel_check",
            doc: "Check or uncheck a checkbox by refId in the sidepanel.",
            params: [
            ref_id: "string", required, "Element refId from snapshot",
            checked: "boolean", optional, "Checked state (default true)",
            ],
            returns: "nil" => "None",
        );
    }

    // sidepanel.hover(ref_id) — async
    {
        let hs = host_state.clone();
        let cb = Callback::from_fn(&ctx, move |ctx, _exec, mut stack| {
            let ref_id = if !stack.is_empty() {
                match stack.get(0) {
                    Value::String(s) => String::from_utf8_lossy(s.as_bytes()).to_string(),
                    other => format_value(ctx, other),
                }
            } else {
                return Err("sidepanel.hover requires a ref_id argument"
                    .into_value(ctx)
                    .into());
            };
            let params = serde_json::json!({ "refId": ref_id });
            let _validated: crate::command_params::PageHoverParams =
                match serde_json::from_value(params.clone()) {
                    Ok(v) => v,
                    Err(e) => {
                        let msg = crate::utils::format_param_error("sidepanel", "hover", &e);
                        return Err(msg.into_value(ctx).into());
                    }
                };

            let mut hs = hs.borrow_mut();
            hs.async_call_counter += 1;
            let command = AsyncCommand {
                call_id: hs.async_call_counter,
                action: "sidepanel_hover".to_string(),
                params,
            };
            hs.pending_async_command = Some(command);
            stack.clear();
            Ok(CallbackReturn::Yield {
                to_thread: None,
                then: None,
            })
        });
        lua_api_custom!(ctx, sidepanel_table, name: "hover", callback: cb,
            namespace: "sidepanel",
            action: "sidepanel_hover",
            doc: "Hover over an element by refId in the sidepanel.",
            params: [
            ref_id: "string", required, "Element refId from snapshot",
            ],
            returns: "nil" => "None",
        );
    }

    // sidepanel.unhover() — async
    {
        let hs = host_state.clone();
        let cb = Callback::from_fn(&ctx, move |_ctx, _exec, mut stack| {
            let mut hs = hs.borrow_mut();
            hs.async_call_counter += 1;
            let command = AsyncCommand {
                call_id: hs.async_call_counter,
                action: "sidepanel_unhover".to_string(),
                params: serde_json::json!({}),
            };
            hs.pending_async_command = Some(command);
            stack.clear();
            Ok(CallbackReturn::Yield {
                to_thread: None,
                then: None,
            })
        });
        lua_api_custom!(ctx, sidepanel_table, name: "unhover", callback: cb,
            namespace: "sidepanel",
            action: "sidepanel_unhover",
            doc: "Move mouse away from any hovered element in the sidepanel.",
            params: [
            ],
            returns: "nil" => "None",
        );
    }

    // sidepanel.scroll(direction, amount) — async
    {
        let hs = host_state.clone();
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
            let params = serde_json::json!({ "direction": direction, "amount": amount });
            let _validated: crate::command_params::PageScrollParams =
                match serde_json::from_value(params.clone()) {
                    Ok(v) => v,
                    Err(e) => {
                        let msg = crate::utils::format_param_error("sidepanel", "scroll", &e);
                        return Err(msg.into_value(ctx).into());
                    }
                };

            let mut hs = hs.borrow_mut();
            hs.async_call_counter += 1;
            let command = AsyncCommand {
                call_id: hs.async_call_counter,
                action: "sidepanel_scroll".to_string(),
                params,
            };
            hs.pending_async_command = Some(command);
            stack.clear();
            Ok(CallbackReturn::Yield {
                to_thread: None,
                then: None,
            })
        });
        lua_api_custom!(ctx, sidepanel_table, name: "scroll", callback: cb,
            namespace: "sidepanel",
            action: "sidepanel_scroll",
            doc: "Scroll the sidepanel by direction and amount.",
            params: [
            direction: "string", optional, "up, down, left, right (default down)",
            amount: "number", optional, "Pixels to scroll (default 300)",
            ],
            returns: "nil" => "None",
        );
    }

    // sidepanel.scroll_to(ref_id) — async
    {
        let hs = host_state.clone();
        let cb = Callback::from_fn(&ctx, move |ctx, _exec, mut stack| {
            let ref_id = if !stack.is_empty() {
                match stack.get(0) {
                    Value::String(s) => String::from_utf8_lossy(s.as_bytes()).to_string(),
                    other => format_value(ctx, other),
                }
            } else {
                return Err("sidepanel.scroll_to requires a ref_id argument"
                    .into_value(ctx)
                    .into());
            };
            let params = serde_json::json!({ "refId": ref_id });
            let _validated: crate::command_params::PageScrollToParams =
                match serde_json::from_value(params.clone()) {
                    Ok(v) => v,
                    Err(e) => {
                        let msg = crate::utils::format_param_error("sidepanel", "scroll_to", &e);
                        return Err(msg.into_value(ctx).into());
                    }
                };

            let mut hs = hs.borrow_mut();
            hs.async_call_counter += 1;
            let command = AsyncCommand {
                call_id: hs.async_call_counter,
                action: "sidepanel_scroll_to".to_string(),
                params,
            };
            hs.pending_async_command = Some(command);
            stack.clear();
            Ok(CallbackReturn::Yield {
                to_thread: None,
                then: None,
            })
        });
        lua_api_custom!(ctx, sidepanel_table, name: "scroll_to", callback: cb,
            namespace: "sidepanel",
            action: "sidepanel_scroll_to",
            doc: "Scroll to an element by refId in the sidepanel.",
            params: [
            ref_id: "string", required, "Element refId from snapshot",
            ],
            returns: "nil" => "None",
        );
    }

    // sidepanel.url() — async
    {
        let hs = host_state.clone();
        let cb = Callback::from_fn(&ctx, move |_ctx, _exec, mut stack| {
            let mut hs = hs.borrow_mut();
            hs.async_call_counter += 1;
            let command = AsyncCommand {
                call_id: hs.async_call_counter,
                action: "sidepanel_url".to_string(),
                params: serde_json::json!({}),
            };
            hs.pending_async_command = Some(command);
            stack.clear();
            Ok(CallbackReturn::Yield {
                to_thread: None,
                then: None,
            })
        });
        lua_api_custom!(ctx, sidepanel_table, name: "url", callback: cb,
            namespace: "sidepanel",
            action: "sidepanel_url",
            doc: "Get the sidepanel URL.",
            params: [
            ],
            returns: "string" => "Current sidepanel URL",
        );
    }

    // sidepanel.title() — async
    {
        let hs = host_state.clone();
        let cb = Callback::from_fn(&ctx, move |_ctx, _exec, mut stack| {
            let mut hs = hs.borrow_mut();
            hs.async_call_counter += 1;
            let command = AsyncCommand {
                call_id: hs.async_call_counter,
                action: "sidepanel_title".to_string(),
                params: serde_json::json!({}),
            };
            hs.pending_async_command = Some(command);
            stack.clear();
            Ok(CallbackReturn::Yield {
                to_thread: None,
                then: None,
            })
        });
        lua_api_custom!(ctx, sidepanel_table, name: "title", callback: cb,
            namespace: "sidepanel",
            action: "sidepanel_title",
            doc: "Get the sidepanel document title.",
            params: [
            ],
            returns: "string" => "Current sidepanel title",
        );
    }

    // sidepanel.wait(ms) — async
    {
        let hs = host_state.clone();
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
                        let msg = crate::utils::format_param_error("sidepanel", "wait", &e);
                        return Err(msg.into_value(ctx).into());
                    }
                };

            let mut hs = hs.borrow_mut();
            hs.async_call_counter += 1;
            let command = AsyncCommand {
                call_id: hs.async_call_counter,
                action: "sidepanel_wait".to_string(),
                params,
            };
            hs.pending_async_command = Some(command);
            stack.clear();
            Ok(CallbackReturn::Yield {
                to_thread: None,
                then: None,
            })
        });
        lua_api_custom!(ctx, sidepanel_table, name: "wait", callback: cb,
            namespace: "sidepanel",
            action: "sidepanel_wait",
            doc: "Wait for a duration.",
            params: [
            ms: "number", optional, "Milliseconds to wait (default 1000)",
            ],
            returns: "nil" => "None",
        );
    }

    // sidepanel.append(ref_id, text) — async (append text)
    {
        let hs = host_state.clone();
        let cb = Callback::from_fn(&ctx, move |ctx, _exec, mut stack| {
            let ref_id = if !stack.is_empty() {
                match stack.get(0) {
                    Value::String(s) => String::from_utf8_lossy(s.as_bytes()).to_string(),
                    other => format_value(ctx, other),
                }
            } else {
                return Err("sidepanel.append requires ref_id and text arguments"
                    .into_value(ctx)
                    .into());
            };
            let text = if stack.len() > 1 {
                match stack.get(1) {
                    Value::String(s) => String::from_utf8_lossy(s.as_bytes()).to_string(),
                    other => format_value(ctx, other),
                }
            } else {
                return Err("sidepanel.append requires a text argument"
                    .into_value(ctx)
                    .into());
            };
            let params = serde_json::json!({ "refId": ref_id, "text": text });
            let _validated: crate::command_params::PageAppendParams =
                match serde_json::from_value(params.clone()) {
                    Ok(v) => v,
                    Err(e) => {
                        let msg = crate::utils::format_param_error("sidepanel", "append", &e);
                        return Err(msg.into_value(ctx).into());
                    }
                };

            let mut hs = hs.borrow_mut();
            hs.async_call_counter += 1;
            let command = AsyncCommand {
                call_id: hs.async_call_counter,
                action: "sidepanel_append".to_string(),
                params,
            };
            hs.pending_async_command = Some(command);
            stack.clear();
            Ok(CallbackReturn::Yield {
                to_thread: None,
                then: None,
            })
        });
        lua_api_custom!(ctx, sidepanel_table, name: "append", callback: cb,
            namespace: "sidepanel",
            action: "sidepanel_append",
            doc: "Append text to an input element by refId in the sidepanel.",
            params: [
            ref_id: "string", required, "Element refId from snapshot",
            text: "string", required, "Text to append",
            ],
            returns: "nil" => "None",
        );
    }

    set_protected_global!(ctx, "sidepanel", sidepanel_table, "sidepanel");
}
