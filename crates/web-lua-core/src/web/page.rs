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
                action: crate::action::Action::PageSnapshotText,
                params,
            };
            hs.pending_async_command = Some(command);
            stack.clear();
            Ok(CallbackReturn::Yield {
                to_thread: None,
                then: None,
            })
        });
        page_table.set_field(ctx, "snapshot", cb);

        crate::lua_api_doc!(
        namespace: "page",
        name: "snapshot",
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
                action: crate::action::Action::PageSnapshotData,
                params,
            };
            hs.pending_async_command = Some(command);
            stack.clear();
            Ok(CallbackReturn::Yield {
                to_thread: None,
                then: None,
            })
        });
        page_table.set_field(ctx, "snapshot_data", cb);

        crate::lua_api_doc!(
        namespace: "page",
        name: "snapshot_data",
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
                action: crate::action::Action::PageSnapshotText,
                params,
            };
            hs.pending_async_command = Some(command);
            stack.clear();
            Ok(CallbackReturn::Yield {
                to_thread: None,
                then: None,
            })
        });
        page_table.set_field(ctx, "snapshot_text", cb);

        crate::lua_api_doc!(
        namespace: "page",
        name: "snapshot_text",
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
                action: crate::action::Action::PageClick,
                params,
            };
            hs.pending_async_command = Some(command);
            stack.clear();
            Ok(CallbackReturn::Yield {
                to_thread: None,
                then: None,
            })
        });
        page_table.set_field(ctx, "click", cb);

        crate::lua_api_doc!(
            namespace: "page",
            name: "click",
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
                action: crate::action::Action::PageDblclick,
                params,
            };
            hs.pending_async_command = Some(command);
            stack.clear();
            Ok(CallbackReturn::Yield {
                to_thread: None,
                then: None,
            })
        });
        page_table.set_field(ctx, "dblclick", cb);
        crate::lua_api_doc!(
        namespace: "page",
        name: "dblclick",
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
                action: crate::action::Action::PageFill,
                params,
            };
            hs.pending_async_command = Some(command);
            stack.clear();
            Ok(CallbackReturn::Yield {
                to_thread: None,
                then: None,
            })
        });
        page_table.set_field(ctx, "fill", cb);
        crate::lua_api_doc!(
        namespace: "page",
        name: "fill",
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
                action: crate::action::Action::PageType,
                params,
            };
            hs.pending_async_command = Some(command);
            stack.clear();
            Ok(CallbackReturn::Yield {
                to_thread: None,
                then: None,
            })
        });
        page_table.set_field(ctx, "type", cb);
        crate::lua_api_doc!(
        namespace: "page",
        name: "type",
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
                action: crate::action::Action::PagePress,
                params,
            };
            hs.pending_async_command = Some(command);
            stack.clear();
            Ok(CallbackReturn::Yield {
                to_thread: None,
                then: None,
            })
        });
        page_table.set_field(ctx, "press", cb);
        crate::lua_api_doc!(
        namespace: "page",
        name: "press",
        action: "page_press",
        doc: "Press a keyboard key.",
        params: [
        key: "string", required, "Key name: Enter, Escape, ArrowDown, etc.",
        ],
        returns: "nil" => "None",
        );
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
                action: crate::action::Action::PageSelect,
                params,
            };
            hs.pending_async_command = Some(command);
            stack.clear();
            Ok(CallbackReturn::Yield {
                to_thread: None,
                then: None,
            })
        });
        page_table.set_field(ctx, "select", cb);
        crate::lua_api_doc!(
        namespace: "page",
        name: "select",
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
                action: crate::action::Action::PageCheck,
                params,
            };
            hs.pending_async_command = Some(command);
            stack.clear();
            Ok(CallbackReturn::Yield {
                to_thread: None,
                then: None,
            })
        });
        page_table.set_field(ctx, "check", cb);
        crate::lua_api_doc!(
        namespace: "page",
        name: "check",
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
                action: crate::action::Action::PageHover,
                params,
            };
            hs.pending_async_command = Some(command);
            stack.clear();
            Ok(CallbackReturn::Yield {
                to_thread: None,
                then: None,
            })
        });
        page_table.set_field(ctx, "hover", cb);
        crate::lua_api_doc!(
        namespace: "page",
        name: "hover",
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
                action: crate::action::Action::PageUnhover,
                params: serde_json::json!({}),
            };
            hs.pending_async_command = Some(command);
            stack.clear();
            Ok(CallbackReturn::Yield {
                to_thread: None,
                then: None,
            })
        });
        page_table.set_field(ctx, "unhover", cb);
        crate::lua_api_doc!(
        namespace: "page",
        name: "unhover",
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
                        if v.is_empty() { None } else { Some(v) }
                    }
                }
            } else {
                None
            };
            let params = serde_json::json!({ "direction": direction, "amount": amount, "refId": ref_id });
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
                action: crate::action::Action::PageScroll,
                params,
            };
            hs.pending_async_command = Some(command);
            stack.clear();
            Ok(CallbackReturn::Yield {
                to_thread: None,
                then: None,
            })
        });
        page_table.set_field(ctx, "scroll", cb);
        crate::lua_api_doc!(
        namespace: "page",
        name: "scroll",
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
                action: crate::action::Action::PageScrollTo,
                params,
            };
            hs.pending_async_command = Some(command);
            stack.clear();
            Ok(CallbackReturn::Yield {
                to_thread: None,
                then: None,
            })
        });
        page_table.set_field(ctx, "scroll_to", cb);
        crate::lua_api_doc!(
        namespace: "page",
        name: "scroll_to",
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
                action: crate::action::Action::PageUrl,
                params: serde_json::json!({}),
            };
            hs.pending_async_command = Some(command);
            stack.clear();
            Ok(CallbackReturn::Yield {
                to_thread: None,
                then: None,
            })
        });
        page_table.set_field(ctx, "url", cb);
        crate::lua_api_doc!(
        namespace: "page",
        name: "url",
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
                action: crate::action::Action::PageTitle,
                params: serde_json::json!({}),
            };
            hs.pending_async_command = Some(command);
            stack.clear();
            Ok(CallbackReturn::Yield {
                to_thread: None,
                then: None,
            })
        });
        page_table.set_field(ctx, "title", cb);
        crate::lua_api_doc!(
        namespace: "page",
        name: "title",
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
                action: crate::action::Action::PageScreenshot,
                params: serde_json::json!({}),
            };
            hs.pending_async_command = Some(command);
            stack.clear();
            Ok(CallbackReturn::Yield {
                to_thread: None,
                then: None,
            })
        });
        page_table.set_field(ctx, "screenshot", cb);
        crate::lua_api_doc!(
        namespace: "page",
        name: "screenshot",
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
                action: crate::action::Action::PageGoto,
                params,
            };
            hs.pending_async_command = Some(command);
            stack.clear();
            Ok(CallbackReturn::Yield {
                to_thread: None,
                then: None,
            })
        });
        page_table.set_field(ctx, "goto", cb);
        page_table.set_field(ctx, "go", cb);
        crate::lua_api_doc!(
        namespace: "page",
        name: "goto",
        action: "page_goto",
        doc: "Navigate to a URL.",
        params: [
        url: "string", required, "URL to navigate to",
        ],
        returns: "nil" => "None",
        );
        crate::lua_api_doc!(
        namespace: "page",
        name: "go",
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
                action: crate::action::Action::PageBack,
                params: serde_json::json!({}),
            };
            hs.pending_async_command = Some(command);
            stack.clear();
            Ok(CallbackReturn::Yield {
                to_thread: None,
                then: None,
            })
        });
        page_table.set_field(ctx, "back", cb);
        crate::lua_api_doc!(
        namespace: "page",
        name: "back",
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
                action: crate::action::Action::PageForward,
                params: serde_json::json!({}),
            };
            hs.pending_async_command = Some(command);
            stack.clear();
            Ok(CallbackReturn::Yield {
                to_thread: None,
                then: None,
            })
        });
        page_table.set_field(ctx, "forward", cb);
        crate::lua_api_doc!(
        namespace: "page",
        name: "forward",
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
                action: crate::action::Action::PageReload,
                params: serde_json::json!({}),
            };
            hs.pending_async_command = Some(command);
            stack.clear();
            Ok(CallbackReturn::Yield {
                to_thread: None,
                then: None,
            })
        });
        page_table.set_field(ctx, "reload", cb);
        crate::lua_api_doc!(
        namespace: "page",
        name: "reload",
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
                action: crate::action::Action::PageWait,
                params,
            };
            hs.pending_async_command = Some(command);
            stack.clear();
            Ok(CallbackReturn::Yield {
                to_thread: None,
                then: None,
            })
        });
        page_table.set_field(ctx, "wait", cb);
        crate::lua_api_doc!(
        namespace: "page",
        name: "wait",
        action: "page_wait",
        doc: "Wait for a duration.",
        params: [
        ms: "number", optional, "Milliseconds to wait (default 1000)",
        ],
        returns: "nil" => "None",
        );
    }

    // page.tabs() — async (extension mode)
    {
        let hs_page = host_state.clone();
        let cb = Callback::from_fn(&ctx, move |_ctx, _exec, mut stack| {
            let mut hs = hs_page.borrow_mut();
            hs.async_call_counter += 1;
            let command = AsyncCommand {
                call_id: hs.async_call_counter,
                action: crate::action::Action::PageTabs,
                params: serde_json::json!({}),
            };
            hs.pending_async_command = Some(command);
            stack.clear();
            Ok(CallbackReturn::Yield {
                to_thread: None,
                then: None,
            })
        });
        page_table.set_field(ctx, "tabs", cb);
        crate::lua_api_doc!(
        namespace: "page",
        name: "tabs",
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
                action: crate::action::Action::PageSwitch,
                params: serde_json::json!({ "tabId": tab_id }),
            };
            hs.pending_async_command = Some(command);
            stack.clear();
            Ok(CallbackReturn::Yield {
                to_thread: None,
                then: None,
            })
        });
        page_table.set_field(ctx, "switch", cb);
        crate::lua_api_doc!(
        namespace: "page",
        name: "switch",
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
                action: crate::action::Action::PageNewTab,
                params: serde_json::json!({ "url": url }),
            };
            hs.pending_async_command = Some(command);
            stack.clear();
            Ok(CallbackReturn::Yield {
                to_thread: None,
                then: None,
            })
        });
        page_table.set_field(ctx, "new_tab", cb);
        crate::lua_api_doc!(
        namespace: "page",
        name: "new_tab",
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
                action: crate::action::Action::PageClose,
                params: serde_json::json!({ "tabId": tab_id }),
            };
            hs.pending_async_command = Some(command);
            stack.clear();
            Ok(CallbackReturn::Yield {
                to_thread: None,
                then: None,
            })
        });
        page_table.set_field(ctx, "close", cb);
        crate::lua_api_doc!(
        namespace: "page",
        name: "close",
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
                action: crate::action::Action::PageActiveTab,
                params: serde_json::json!({}),
            };
            hs.pending_async_command = Some(command);
            stack.clear();
            Ok(CallbackReturn::Yield {
                to_thread: None,
                then: None,
            })
        });
        page_table.set_field(ctx, "active_tab", cb);
        crate::lua_api_doc!(
        namespace: "page",
        name: "active_tab",
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
                action: crate::action::Action::PageFind,
                params,
            };
            hs.pending_async_command = Some(command);
            stack.clear();
            Ok(CallbackReturn::Yield {
                to_thread: None,
                then: None,
            })
        });
        page_table.set_field(ctx, "find", cb);
        crate::lua_api_doc!(
            namespace: "page",
            name: "find",
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
                action: crate::action::Action::PageWaitFor,
                params,
            };
            hs.pending_async_command = Some(command);
            stack.clear();
            Ok(CallbackReturn::Yield {
                to_thread: None,
                then: None,
            })
        });
        page_table.set_field(ctx, "wait_for", cb);
        crate::lua_api_doc!(
            namespace: "page",
            name: "wait_for",
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
                action: crate::action::Action::PageExtract,
                params,
            };
            hs.pending_async_command = Some(command);
            stack.clear();
            Ok(CallbackReturn::Yield {
                to_thread: None,
                then: None,
            })
        });
        page_table.set_field(ctx, "extract", cb);
        crate::lua_api_doc!(
            namespace: "page",
            name: "extract",
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
                action: crate::action::Action::PageAppend,
                params,
            };
            hs.pending_async_command = Some(command);
            stack.clear();
            Ok(CallbackReturn::Yield {
                to_thread: None,
                then: None,
            })
        });
        page_table.set_field(ctx, "append", cb);
        crate::lua_api_doc!(
            namespace: "page",
            name: "append",
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
