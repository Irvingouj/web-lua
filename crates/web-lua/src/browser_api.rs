use serde_json;
use wasm_bindgen::prelude::*;
use wasm_bindgen_futures::JsFuture;
use web_lua_base::types::WasmAsyncResponse;
use web_lua_base::types::WasmAsyncError;

pub async fn execute_fetch(params: serde_json::Value) -> WasmAsyncResponse {
    let url = params.get("url").and_then(|v| v.as_str()).unwrap_or("");
    let method = params
        .get("method")
        .and_then(|v| v.as_str())
        .unwrap_or("GET");
    let timeout = params
        .get("timeout")
        .and_then(|v| v.as_u64())
        .unwrap_or(30_000);

    let window = web_sys::window().unwrap();

    let request_init = web_sys::RequestInit::new();
    request_init.set_method(method);

    // Headers
    if let Some(headers_obj) = params.get("headers").and_then(|v| v.as_object()) {
        let headers = web_sys::Headers::new().unwrap();
        for (key, val) in headers_obj.iter() {
            if let Some(val_str) = val.as_str() {
                headers.append(key, val_str).ok();
            }
        }
        request_init.set_headers(&headers);
    }

    // Body
    if let Some(body_str) = params.get("body").and_then(|v| v.as_str()) {
        request_init.set_body(&JsValue::from_str(body_str));
    }

    // AbortController for timeout
    let _abort_controller = match js_sys::Reflect::get(&window, &"AbortController".into()) {
        Ok(ac_ctor) if !ac_ctor.is_undefined() => {
            let ac = js_sys::Reflect::construct(
                &ac_ctor.dyn_into::<js_sys::Function>().unwrap(),
                &js_sys::Array::new(),
            )
            .unwrap();
            let signal = js_sys::Reflect::get(&ac, &"signal".into()).unwrap();
            let signal = signal.dyn_ref::<web_sys::AbortSignal>();
            request_init.set_signal(signal);

            let set_timeout = js_sys::Reflect::get(&window, &"setTimeout".into())
                .unwrap()
                .dyn_into::<js_sys::Function>()
                .unwrap();
            let abort_fn = js_sys::Reflect::get(&ac, &"abort".into()).unwrap();
            let _ = set_timeout.call2(&window, &abort_fn, &JsValue::from_f64(timeout as f64));

            Some(ac)
        }
        _ => None,
    };

    let request = match web_sys::Request::new_with_str_and_init(url, &request_init) {
        Ok(r) => r,
        Err(e) => {
            return WasmAsyncResponse {
                ok: false,
                value: None,
                error: Some(WasmAsyncError {
                    message: format!("Invalid request: {:?}", e),
                    code: "E_BAD_REQUEST".into(),
                }),
            };
        }
    };

    let resp = match JsFuture::from(window.fetch_with_request(&request)).await {
        Ok(r) => r,
        Err(e) => {
            let is_timeout = format!("{:?}", e).contains("AbortError");
            let msg = if is_timeout {
                format!("Request timed out after {}ms", timeout)
            } else {
                format!("Network error: {:?}", e)
            };
            return WasmAsyncResponse {
                ok: false,
                value: None,
                error: Some(WasmAsyncError {
                    message: msg,
                    code: if is_timeout { "ETIMEDOUT".into() } else { "ENETWORK".into() },
                }),
            };
        }
    };

    let response = match resp.dyn_into::<web_sys::Response>() {
        Ok(r) => r,
        Err(_) => {
            return WasmAsyncResponse {
                ok: false,
                value: None,
                error: Some(WasmAsyncError {
                    message: "Invalid response from fetch".into(),
                    code: "E_RESPONSE".into(),
                }),
            };
        }
    };

    let status = response.status();
    let ok = response.ok();

    let body = match response.text() {
        Ok(p) => match JsFuture::from(p).await {
            Ok(b) => b.as_string().unwrap_or_default(),
            Err(_) => String::new(),
        },
        Err(_) => String::new(),
    };

    let value = serde_json::json!({
        "status": status,
        "ok": ok,
        "body": body,
    });

    WasmAsyncResponse {
        ok: true,
        value: Some(value),
        error: None,
    }
}

pub async fn execute_sleep(params: serde_json::Value) -> WasmAsyncResponse {
    let duration = params.get("duration").and_then(|v| v.as_u64()).unwrap_or(0);

    let window = web_sys::window().unwrap();
    let promise = js_sys::Promise::new(
        &mut |resolve: js_sys::Function, _reject: js_sys::Function| {
            let set_timeout = js_sys::Reflect::get(&window, &"setTimeout".into())
                .unwrap()
                .dyn_into::<js_sys::Function>()
                .unwrap();
            let _ = set_timeout.call2(&window, &resolve, &JsValue::from_f64(duration as f64));
        },
    );

    let _ = JsFuture::from(promise).await;

    WasmAsyncResponse {
        ok: true,
        value: Some(serde_json::Value::Null),
        error: None,
    }
}

pub async fn execute_page_wait(params: serde_json::Value) -> WasmAsyncResponse {
    let ms = params.get("ms").and_then(|v| v.as_u64()).unwrap_or(1000);
    let _ = execute_sleep(serde_json::json!({ "duration": ms })).await;
    WasmAsyncResponse {
        ok: true,
        value: Some(serde_json::Value::Bool(true)),
        error: None,
    }
}

fn get_local_storage() -> Result<web_sys::Storage, String> {
    web_sys::window()
        .ok_or("No window available")?
        .local_storage()
        .map_err(|e| format!("{:?}", e))?
        .ok_or("localStorage not available".into())
}

pub async fn execute_storage_get(params: serde_json::Value) -> WasmAsyncResponse {
    let key = params.get("key").and_then(|v| v.as_str()).unwrap_or("");
    match get_local_storage() {
        Ok(storage) => match storage.get_item(key) {
            Ok(Some(val)) => WasmAsyncResponse {
                ok: true,
                value: Some(serde_json::Value::String(val)),
                error: None,
            },
            Ok(None) => WasmAsyncResponse {
                ok: true,
                value: Some(serde_json::Value::Null),
                error: None,
            },
            Err(e) => WasmAsyncResponse {
                ok: false,
                value: None,
                error: Some(WasmAsyncError {
                    message: format!("{:?}", e),
                    code: "E_STORAGE".into(),
                }),
            },
        },
        Err(e) => WasmAsyncResponse {
            ok: false,
            value: None,
            error: Some(WasmAsyncError {
                message: e,
                code: "E_STORAGE".into(),
            }),
        },
    }
}

pub async fn execute_storage_set(params: serde_json::Value) -> WasmAsyncResponse {
    let key = params.get("key").and_then(|v| v.as_str()).unwrap_or("");
    let value = params.get("value").and_then(|v| v.as_str()).unwrap_or("");
    match get_local_storage() {
        Ok(storage) => match storage.set_item(key, value) {
            Ok(_) => WasmAsyncResponse {
                ok: true,
                value: Some(serde_json::Value::Null),
                error: None,
            },
            Err(e) => WasmAsyncResponse {
                ok: false,
                value: None,
                error: Some(WasmAsyncError {
                    message: format!("{:?}", e),
                    code: "E_STORAGE".into(),
                }),
            },
        },
        Err(e) => WasmAsyncResponse {
            ok: false,
            value: None,
            error: Some(WasmAsyncError {
                message: e,
                code: "E_STORAGE".into(),
            }),
        },
    }
}

pub async fn execute_storage_delete(params: serde_json::Value) -> WasmAsyncResponse {
    let key = params.get("key").and_then(|v| v.as_str()).unwrap_or("");
    match get_local_storage() {
        Ok(storage) => match storage.remove_item(key) {
            Ok(_) => WasmAsyncResponse {
                ok: true,
                value: Some(serde_json::Value::Null),
                error: None,
            },
            Err(e) => WasmAsyncResponse {
                ok: false,
                value: None,
                error: Some(WasmAsyncError {
                    message: format!("{:?}", e),
                    code: "E_STORAGE".into(),
                }),
            },
        },
        Err(e) => WasmAsyncResponse {
            ok: false,
            value: None,
            error: Some(WasmAsyncError {
                message: e,
                code: "E_STORAGE".into(),
            }),
        },
    }
}

pub async fn execute_host_call(action: &str, params: serde_json::Value) -> WasmAsyncResponse {
    let window = match web_sys::window() {
        Some(w) => w,
        None => return WasmAsyncResponse {
            ok: false,
            value: None,
            error: Some(WasmAsyncError {
                message: "No window available".into(),
                code: "E_HOST".into(),
            }),
        },
    };

    let handlers = match js_sys::Reflect::get(&window, &"__hostHandlers".into()) {
        Ok(h) if !h.is_undefined() && !h.is_null() => h,
        _ => return WasmAsyncResponse {
            ok: false,
            value: None,
            error: Some(WasmAsyncError {
                message: format!("No handler registered for '{}'", action),
                code: "E_HOST_NO_HANDLER".into(),
            }),
        },
    };

    let handler = match js_sys::Reflect::get(&handlers, &action.into()) {
        Ok(h) if h.is_function() => h.dyn_into::<js_sys::Function>().unwrap(),
        _ => return WasmAsyncResponse {
            ok: false,
            value: None,
            error: Some(WasmAsyncError {
                message: format!("No handler registered for '{}'", action),
                code: "E_HOST_NO_HANDLER".into(),
            }),
        },
    };

    // Serialize params to a JSON string, then parse to a JS object.
    // This avoids serde_wasm_bindgen's default map-to-JS-Map behavior.
    let params_json = match serde_json::to_string(&params) {
        Ok(s) => s,
        Err(e) => return WasmAsyncResponse {
            ok: false,
            value: None,
            error: Some(WasmAsyncError {
                message: format!("Failed to serialize params: {}", e),
                code: "E_HOST".into(),
            }),
        },
    };
    let params_js = match js_sys::JSON::parse(&params_json) {
        Ok(v) => v,
        Err(e) => return WasmAsyncResponse {
            ok: false,
            value: None,
            error: Some(WasmAsyncError {
                message: format!("Failed to parse params JSON: {:?}", e),
                code: "E_HOST".into(),
            }),
        },
    };

    let result = match handler.call1(&handlers, &params_js) {
        Ok(r) => r,
        Err(e) => return WasmAsyncResponse {
            ok: false,
            value: None,
            error: Some(WasmAsyncError {
                message: format!("Handler threw: {:?}", e),
                code: "E_HOST".into(),
            }),
        },
    };

    // If result is a Promise, await it
    let resolved = if result.is_instance_of::<js_sys::Promise>() {
        match JsFuture::from(result.dyn_into::<js_sys::Promise>().unwrap()).await {
            Ok(v) => v,
            Err(e) => return WasmAsyncResponse {
                ok: false,
                value: None,
                error: Some(WasmAsyncError {
                    message: format!("Handler promise rejected: {:?}", e),
                    code: "E_HOST".into(),
                }),
            },
        }
    } else {
        result
    };

    let value = match serde_wasm_bindgen::from_value::<serde_json::Value>(resolved.clone()) {
        Ok(v) => v,
        Err(_) => {
            // If it can't be deserialized to JSON, treat as string
            let s = resolved.as_string().unwrap_or_else(|| format!("{:?}", resolved));
            serde_json::Value::String(s)
        }
    };

    WasmAsyncResponse {
        ok: true,
        value: Some(value),
        error: None,
    }
}

// ─── DOM Snapshot ───────────────────────────────────────────────

pub fn execute_dom_snapshot(params: serde_json::Value) -> WasmAsyncResponse {
    let options = serde_json::json!({
        "interactive_only": params.get("interactive_only").and_then(|v| v.as_bool()).unwrap_or(false),
        "max_nodes": params.get("max_nodes").and_then(|v| v.as_u64()).unwrap_or(500) as usize,
    });

    let js_options = match serde_wasm_bindgen::to_value(&options) {
        Ok(v) => v,
        Err(_) => return WasmAsyncResponse {
            ok: false,
            value: None,
            error: Some(WasmAsyncError {
                message: "Failed to serialize snapshot options".into(),
                code: "E_SNAPSHOT".into(),
            }),
        },
    };

    let snap_js = dom_semantic_tree::collect::collect_document(js_options);

    let snap_json = match js_sys::JSON::stringify(&snap_js)
        .ok()
        .and_then(|s| s.as_string())
    {
        Some(s) => s,
        None => return WasmAsyncResponse {
            ok: false,
            value: None,
            error: Some(WasmAsyncError {
                message: "Failed to stringify snapshot".into(),
                code: "E_SNAPSHOT".into(),
            }),
        },
    };

    let snapshot: dom_semantic_tree::model::TreeSnapshot = match serde_json::from_str(&snap_json) {
        Ok(s) => s,
        Err(_) => return WasmAsyncResponse {
            ok: false,
            value: None,
            error: Some(WasmAsyncError {
                message: "Failed to parse snapshot".into(),
                code: "E_SNAPSHOT".into(),
            }),
        },
    };

    let text = dom_semantic_tree::format::format_snapshot(&snapshot, "compact-text");

    let data = match serde_json::to_value(&snapshot) {
        Ok(v) => v,
        Err(_) => return WasmAsyncResponse {
            ok: false,
            value: None,
            error: Some(WasmAsyncError {
                message: "Failed to serialize snapshot data".into(),
                code: "E_SNAPSHOT".into(),
            }),
        },
    };

    let result = serde_json::json!({
        "data": data,
        "text": text,
    });

    WasmAsyncResponse {
        ok: true,
        value: Some(result),
        error: None,
    }
}

pub fn execute_dom_format(params: serde_json::Value) -> WasmAsyncResponse {
    let snapshot = match params.get("snapshot") {
        Some(s) => s,
        None => return WasmAsyncResponse {
            ok: false,
            value: None,
            error: Some(WasmAsyncError {
                message: "dom_format requires snapshot argument".into(),
                code: "E_FORMAT".into(),
            }),
        },
    };
    let format = params.get("format").and_then(|v| v.as_str()).unwrap_or("compact-text");
    let snap: dom_semantic_tree::model::TreeSnapshot = match serde_json::from_value(snapshot.clone()) {
        Ok(s) => s,
        Err(_) => return WasmAsyncResponse {
            ok: false,
            value: None,
            error: Some(WasmAsyncError {
                message: "Failed to parse snapshot for formatting".into(),
                code: "E_FORMAT".into(),
            }),
        },
    };
    let text = dom_semantic_tree::format::format_snapshot(&snap, format);
    WasmAsyncResponse {
        ok: true,
        value: Some(serde_json::Value::String(text)),
        error: None,
    }
}

// ─── Page Agent Actions ─────────────────────────────────────────

fn extract_ref_id(params: &serde_json::Value) -> Option<&str> {
    if let Some(s) = params.as_str() {
        return Some(s);
    }
    params.get("refId").and_then(|v| v.as_str())
}

fn get_element_by_ref_id(ref_id: &str) -> Result<web_sys::Element, String> {
    let document = web_sys::window()
        .ok_or("No window available")?
        .document()
        .ok_or("No document available")?;
    document
        .query_selector(&format!("[data-ref-id='{}']", ref_id))
        .map_err(|e| format!("{:?}", e))?
        .ok_or_else(|| format!("Element with ref_id '{}' not found", ref_id))
}

pub async fn execute_page_hover(params: serde_json::Value) -> WasmAsyncResponse {
    let ref_id = extract_ref_id(&params).unwrap_or("");
    match get_element_by_ref_id(ref_id) {
        Ok(element) => {
            let event = web_sys::MouseEvent::new_with_mouse_event_init_dict("mouseenter", &web_sys::MouseEventInit::new());
            let _ = element.dispatch_event(&event.map_err(|e| format!("{:?}", e)).unwrap());
            WasmAsyncResponse { ok: true, value: Some(serde_json::Value::Bool(true)), error: None }
        }
        Err(e) => WasmAsyncResponse {
            ok: false, value: None,
            error: Some(WasmAsyncError { message: e, code: "E_AGENT".into() }),
        }
    }
}

pub async fn execute_page_unhover(_params: serde_json::Value) -> WasmAsyncResponse {
    let document = match web_sys::window().and_then(|w| w.document()) {
        Some(d) => d,
        None => return WasmAsyncResponse {
            ok: false, value: None,
            error: Some(WasmAsyncError { message: "No document available".into(), code: "E_AGENT".into() }),
        },
    };
    // Dispatch mouseleave on body to clear any hover
    if let Some(body) = document.body() {
        let event = web_sys::MouseEvent::new_with_mouse_event_init_dict("mouseleave", &web_sys::MouseEventInit::new());
        let _ = body.dispatch_event(&event.map_err(|e| format!("{:?}", e)).unwrap());
    }
    WasmAsyncResponse { ok: true, value: Some(serde_json::Value::Bool(true)), error: None }
}

pub async fn execute_page_scroll(params: serde_json::Value) -> WasmAsyncResponse {
    let direction = params.get("direction").and_then(|v| v.as_str()).unwrap_or("down");
    let amount = params.get("amount").and_then(|v| v.as_f64()).unwrap_or(300.0);
    let window = match web_sys::window() {
        Some(w) => w,
        None => return WasmAsyncResponse {
            ok: false, value: None,
            error: Some(WasmAsyncError { message: "No window available".into(), code: "E_AGENT".into() }),
        },
    };
    let (dx, dy) = match direction {
        "down" => (0.0, amount),
        "up" => (0.0, -amount),
        "left" => (-amount, 0.0),
        "right" => (amount, 0.0),
        _ => (0.0, amount),
    };
    window.scroll_by_with_x_and_y(dx, dy);
    WasmAsyncResponse { ok: true, value: Some(serde_json::Value::Bool(true)), error: None }
}

pub async fn execute_page_scroll_to(params: serde_json::Value) -> WasmAsyncResponse {
    let ref_id = extract_ref_id(&params).unwrap_or("");
    match get_element_by_ref_id(ref_id) {
        Ok(element) => {
            element.scroll_into_view();
            WasmAsyncResponse { ok: true, value: Some(serde_json::Value::Bool(true)), error: None }
        }
        Err(e) => WasmAsyncResponse {
            ok: false, value: None,
            error: Some(WasmAsyncError { message: e, code: "E_AGENT".into() }),
        }
    }
}

pub async fn execute_page_dblclick(params: serde_json::Value) -> WasmAsyncResponse {
    let ref_id = extract_ref_id(&params).unwrap_or("");
    match get_element_by_ref_id(ref_id) {
        Ok(element) => {
            let event = web_sys::MouseEvent::new_with_mouse_event_init_dict("dblclick", &web_sys::MouseEventInit::new());
            let _ = element.dispatch_event(&event.map_err(|e| format!("{:?}", e)).unwrap());
            WasmAsyncResponse { ok: true, value: Some(serde_json::Value::Bool(true)), error: None }
        }
        Err(e) => WasmAsyncResponse {
            ok: false, value: None,
            error: Some(WasmAsyncError { message: e, code: "E_AGENT".into() }),
        }
    }
}

pub async fn execute_page_type(params: serde_json::Value) -> WasmAsyncResponse {
    let ref_id = extract_ref_id(&params).unwrap_or("");
    let text = params.get("text").and_then(|v| v.as_str()).unwrap_or("");
    match get_element_by_ref_id(ref_id) {
        Ok(element) => {
            if let Some(input) = element.dyn_ref::<web_sys::HtmlInputElement>() {
                let new_val = format!("{}{}", input.value(), text);
                input.set_value(&new_val);
            } else if let Some(textarea) = element.dyn_ref::<web_sys::HtmlTextAreaElement>() {
                let new_val = format!("{}{}", textarea.value(), text);
                textarea.set_value(&new_val);
            } else {
                return WasmAsyncResponse {
                    ok: false, value: None,
                    error: Some(WasmAsyncError { message: "Element is not a text input".into(), code: "E_AGENT".into() }),
                };
            }
            WasmAsyncResponse { ok: true, value: Some(serde_json::Value::Bool(true)), error: None }
        }
        Err(e) => WasmAsyncResponse {
            ok: false, value: None,
            error: Some(WasmAsyncError { message: e, code: "E_AGENT".into() }),
        }
    }
}

pub async fn execute_page_press(params: serde_json::Value) -> WasmAsyncResponse {
    let key = params.get("key").and_then(|v| v.as_str()).unwrap_or("");
    let document = match web_sys::window().and_then(|w| w.document()) {
        Some(d) => d,
        None => return WasmAsyncResponse {
            ok: false, value: None,
            error: Some(WasmAsyncError { message: "No document available".into(), code: "E_AGENT".into() }),
        },
    };
    let mut init = web_sys::KeyboardEventInit::new();
    init.set_key(key);
    let event = web_sys::KeyboardEvent::new_with_keyboard_event_init_dict(
        "keydown",
        &init,
    );
    let _ = document.dispatch_event(&event.map_err(|e| format!("{:?}", e)).unwrap());
    WasmAsyncResponse { ok: true, value: Some(serde_json::Value::Bool(true)), error: None }
}

pub async fn execute_page_select(params: serde_json::Value) -> WasmAsyncResponse {
    let ref_id = extract_ref_id(&params).unwrap_or("");
    let value = params.get("value").and_then(|v| v.as_str()).unwrap_or("");
    match get_element_by_ref_id(ref_id) {
        Ok(element) => {
            if let Some(select) = element.dyn_ref::<web_sys::HtmlSelectElement>() {
                select.set_value(value);
            } else {
                return WasmAsyncResponse {
                    ok: false, value: None,
                    error: Some(WasmAsyncError { message: "Element is not a select".into(), code: "E_AGENT".into() }),
                };
            }
            WasmAsyncResponse { ok: true, value: Some(serde_json::Value::Bool(true)), error: None }
        }
        Err(e) => WasmAsyncResponse {
            ok: false, value: None,
            error: Some(WasmAsyncError { message: e, code: "E_AGENT".into() }),
        }
    }
}

pub async fn execute_page_check(params: serde_json::Value) -> WasmAsyncResponse {
    let ref_id = extract_ref_id(&params).unwrap_or("");
    let checked = params.get("checked").and_then(|v| v.as_bool()).unwrap_or(true);
    match get_element_by_ref_id(ref_id) {
        Ok(element) => {
            if let Some(input) = element.dyn_ref::<web_sys::HtmlInputElement>() {
                input.set_checked(checked);
            } else if let Some(checkbox) = element.dyn_ref::<web_sys::HtmlInputElement>() {
                checkbox.set_checked(checked);
            } else {
                return WasmAsyncResponse {
                    ok: false, value: None,
                    error: Some(WasmAsyncError { message: "Element is not a checkbox".into(), code: "E_AGENT".into() }),
                };
            }
            WasmAsyncResponse { ok: true, value: Some(serde_json::Value::Bool(true)), error: None }
        }
        Err(e) => WasmAsyncResponse {
            ok: false, value: None,
            error: Some(WasmAsyncError { message: e, code: "E_AGENT".into() }),
        }
    }
}

pub async fn execute_storage_list(_params: serde_json::Value) -> WasmAsyncResponse {
    match get_local_storage() {
        Ok(storage) => {
            let len = storage.length().unwrap_or(0);
            let mut keys = Vec::new();
            for i in 0..len {
                if let Ok(Some(k)) = storage.key(i) {
                    keys.push(serde_json::Value::String(k));
                }
            }
            WasmAsyncResponse {
                ok: true,
                value: Some(serde_json::Value::Array(keys)),
                error: None,
            }
        }
        Err(e) => WasmAsyncResponse {
            ok: false,
            value: None,
            error: Some(WasmAsyncError {
                message: e,
                code: "E_STORAGE".into(),
            }),
        },
    }
}
