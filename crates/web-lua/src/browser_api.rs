use serde_json;
use std::cell::RefCell;
use std::collections::HashMap;
use std::future::Future;
use std::pin::Pin;
use wasm_bindgen::prelude::*;
use wasm_bindgen_futures::JsFuture;
use web_lua_base::types::WasmAsyncCommand;
use web_lua_base::types::WasmAsyncError;
use web_lua_base::types::WasmAsyncResponse;
use web_lua_core::command_params::*;

// ─── Registry ───────────────────────────────────────────────────

pub type Handler =
    Box<dyn Fn(WasmAsyncCommand) -> Pin<Box<dyn Future<Output = Result<WasmAsyncResponse, String>>>>>;

thread_local! {
    static HANDLER_REGISTRY: RefCell<HashMap<String, Handler>> = RefCell::new(HashMap::new());
}

pub fn register_handler(name: &str, handler: Handler) {
    HANDLER_REGISTRY.with(|reg| {
        reg.borrow_mut().insert(name.to_string(), handler);
    });
}

pub async fn dispatch_command(cmd: &WasmAsyncCommand) -> Result<WasmAsyncResponse, String> {
    // host.call escape hatch: action names are dynamic
    if cmd.action.starts_with("host_") {
        let host_action = &cmd.action[5..];
        return Ok(execute_host_call(host_action, cmd.params.clone()).await);
    }

    let action = cmd.action.clone();
    let future_opt = HANDLER_REGISTRY.with(|reg| reg.borrow().get(&action).map(|h| h(cmd.clone())));
    match future_opt {
        Some(fut) => fut.await,
        None => Err(format!("Unknown action: {}", cmd.action)),
    }
}

#[wasm_bindgen]
extern "C" {
    type DOMParser;
    #[wasm_bindgen(constructor)]
    fn new() -> DOMParser;
    #[wasm_bindgen(method, js_name = parseFromString)]
    fn parse_from_string(this: &DOMParser, html: &str, type_: &str) -> web_sys::Document;
}

fn no_window_response() -> WasmAsyncResponse {
    WasmAsyncResponse {
        ok: false,
        value: None,
        error: Some(WasmAsyncError {
            message: "DOM APIs not available in this context".into(),
            code: "E_NO_WINDOW".into(),
        }),
    }
}

pub fn find_element_by_label(document: &web_sys::Document, query: &str) -> Option<web_sys::Element> {
    let lower_query = query.to_lowercase().trim().to_string();
    if lower_query.is_empty() {
        return None;
    }
    let elements = document
        .query_selector_all("input, textarea, select, button, a, [role='button'], [role='link']")
        .ok()?;
    for i in 0..elements.length() {
        if let Some(node) = elements.item(i) {
            if let Ok(el) = node.dyn_into::<web_sys::Element>() {
                if let Some(aria_label) = el.get_attribute("aria-label") {
                    if aria_label.to_lowercase().trim() == lower_query {
                        return Some(el);
                    }
                }
                if let Some(input) = el.dyn_ref::<web_sys::HtmlInputElement>() {
                    if input.placeholder().to_lowercase().trim() == lower_query {
                        return Some(el);
                    }
                }
                if let Some(text) = el.text_content() {
                    if text.to_lowercase().trim() == lower_query {
                        return Some(el);
                    }
                }
            }
        }
    }
    None
}

pub async fn execute_fetch(params: FetchParams) -> WasmAsyncResponse {
    let window = match web_sys::window() {
        Some(w) => w,
        None => return no_window_response(),
    };

    let request_init = web_sys::RequestInit::new();
    request_init.set_method(&params.method);

    // Headers
    if !params.headers.is_empty() {
        let headers = match web_sys::Headers::new() {
            Ok(h) => h,
            Err(_) => {
                return WasmAsyncResponse {
                    ok: false,
                    value: None,
                    error: Some(WasmAsyncError {
                        message: "Failed to create Headers object".into(),
                        code: "E_HEADERS".into(),
                    }),
                }
            }
        };
        for (key, val) in &params.headers {
            headers.append(key, val).ok();
        }
        request_init.set_headers(&headers);
    }

    // Body
    if let Some(body_str) = &params.body {
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
            let _ = set_timeout.call2(
                &window,
                &abort_fn,
                &JsValue::from_f64(params.timeout as f64),
            );

            Some(ac)
        }
        _ => None,
    };

    let request = match web_sys::Request::new_with_str_and_init(&params.url, &request_init) {
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
                format!("Request timed out after {}ms", params.timeout)
            } else {
                format!("Network error: {:?}", e)
            };
            return WasmAsyncResponse {
                ok: false,
                value: None,
                error: Some(WasmAsyncError {
                    message: msg,
                    code: if is_timeout {
                        "ETIMEDOUT".into()
                    } else {
                        "ENETWORK".into()
                    },
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

pub async fn execute_sleep(params: SleepParams) -> WasmAsyncResponse {
    let window = match web_sys::window() {
        Some(w) => w,
        None => return no_window_response(),
    };
    let promise = js_sys::Promise::new(
        &mut |resolve: js_sys::Function, _reject: js_sys::Function| {
            let set_timeout = js_sys::Reflect::get(&window, &"setTimeout".into())
                .unwrap()
                .dyn_into::<js_sys::Function>()
                .unwrap();
            let _ = set_timeout.call2(
                &window,
                &resolve,
                &JsValue::from_f64(params.duration as f64),
            );
        },
    );

    let _ = JsFuture::from(promise).await;

    WasmAsyncResponse {
        ok: true,
        value: Some(serde_json::Value::Null),
        error: None,
    }
}

pub async fn execute_page_wait(params: PageWaitParams) -> WasmAsyncResponse {
    let _ = execute_sleep(SleepParams {
        duration: params.ms,
    })
    .await;
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

pub async fn execute_storage_get(params: StorageGetParams) -> WasmAsyncResponse {
    match get_local_storage() {
        Ok(storage) => match storage.get_item(&params.key) {
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

pub async fn execute_storage_set(params: StorageSetParams) -> WasmAsyncResponse {
    match get_local_storage() {
        Ok(storage) => match storage.set_item(&params.key, &params.value) {
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

pub async fn execute_storage_delete(params: StorageDeleteParams) -> WasmAsyncResponse {
    match get_local_storage() {
        Ok(storage) => match storage.remove_item(&params.key) {
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
        None => {
            return WasmAsyncResponse {
                ok: false,
                value: None,
                error: Some(WasmAsyncError {
                    message: "No window available".into(),
                    code: "E_HOST".into(),
                }),
            }
        }
    };

    let handlers = match js_sys::Reflect::get(&window, &"__hostHandlers".into()) {
        Ok(h) if !h.is_undefined() && !h.is_null() => h,
        _ => {
            return WasmAsyncResponse {
                ok: false,
                value: None,
                error: Some(WasmAsyncError {
                    message: format!("No handler registered for '{}'", action),
                    code: "E_HOST_NO_HANDLER".into(),
                }),
            }
        }
    };

    let handler = match js_sys::Reflect::get(&handlers, &action.into()) {
        Ok(h) if h.is_function() => h.dyn_into::<js_sys::Function>().unwrap(),
        _ => {
            return WasmAsyncResponse {
                ok: false,
                value: None,
                error: Some(WasmAsyncError {
                    message: format!("No handler registered for '{}'", action),
                    code: "E_HOST_NO_HANDLER".into(),
                }),
            }
        }
    };

    // Serialize params to a JSON string, then parse to a JS object.
    // This avoids serde_wasm_bindgen's default map-to-JS-Map behavior.
    let params_json = match serde_json::to_string(&params) {
        Ok(s) => s,
        Err(e) => {
            return WasmAsyncResponse {
                ok: false,
                value: None,
                error: Some(WasmAsyncError {
                    message: format!("Failed to serialize params: {}", e),
                    code: "E_HOST".into(),
                }),
            }
        }
    };
    let params_js = match js_sys::JSON::parse(&params_json) {
        Ok(v) => v,
        Err(e) => {
            return WasmAsyncResponse {
                ok: false,
                value: None,
                error: Some(WasmAsyncError {
                    message: format!("Failed to parse params JSON: {:?}", e),
                    code: "E_HOST".into(),
                }),
            }
        }
    };

    let result = match handler.call1(&handlers, &params_js) {
        Ok(r) => r,
        Err(e) => {
            return WasmAsyncResponse {
                ok: false,
                value: None,
                error: Some(WasmAsyncError {
                    message: format!("Handler threw: {:?}", e),
                    code: "E_HOST".into(),
                }),
            }
        }
    };

    // If result is a Promise, await it
    let resolved = if result.is_instance_of::<js_sys::Promise>() {
        match JsFuture::from(result.dyn_into::<js_sys::Promise>().unwrap()).await {
            Ok(v) => v,
            Err(e) => {
                return WasmAsyncResponse {
                    ok: false,
                    value: None,
                    error: Some(WasmAsyncError {
                        message: format!("Handler promise rejected: {:?}", e),
                        code: "E_HOST".into(),
                    }),
                }
            }
        }
    } else {
        result
    };

    let value = match serde_wasm_bindgen::from_value::<serde_json::Value>(resolved.clone()) {
        Ok(v) => v,
        Err(_) => {
            // If it can't be deserialized to JSON, treat as string
            let s = resolved
                .as_string()
                .unwrap_or_else(|| format!("{:?}", resolved));
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

pub fn execute_dom_snapshot(params: DomSnapshotParams) -> WasmAsyncResponse {
    let opts = dom_semantic_tree::model::CollectOptions {
        interactive_only: params.interactive_only,
        max_nodes: params.max_nodes as usize,
        ..Default::default()
    };

    let snapshot = dom_semantic_tree::collect::collect_document(opts);

    let text = dom_semantic_tree::format::format_snapshot(
        &snapshot,
        dom_semantic_tree::format::SnapshotFormat::CompactText,
    );

    let data = match serde_json::to_value(&snapshot) {
        Ok(v) => v,
        Err(_) => {
            return WasmAsyncResponse {
                ok: false,
                value: None,
                error: Some(WasmAsyncError {
                    message: "Failed to serialize snapshot data".into(),
                    code: "E_SNAPSHOT".into(),
                }),
            }
        }
    };

    let result = serde_json::json!({
        "text": text,
        "nodes": data["nodes"],
        "url": data["url"],
        "title": data["title"],
        "viewport": data["viewport"],
        "version": "1.0",
    });

    WasmAsyncResponse {
        ok: true,
        value: Some(result),
        error: None,
    }
}

pub fn execute_dom_format(params: DomFormatParams) -> WasmAsyncResponse {
    let snapshot = &params.snapshot;
    let snap: dom_semantic_tree::model::TreeSnapshot =
        match serde_json::from_value(snapshot.clone()) {
            Ok(s) => s,
            Err(_) => {
                return WasmAsyncResponse {
                    ok: false,
                    value: None,
                    error: Some(WasmAsyncError {
                        message: "Failed to parse snapshot for formatting".into(),
                        code: "E_FORMAT".into(),
                    }),
                }
            }
        };
    let text = dom_semantic_tree::format::format_snapshot(&snap, params.format);
    WasmAsyncResponse {
        ok: true,
        value: Some(serde_json::Value::String(text)),
        error: None,
    }
}

// ─── Page Agent Actions ─────────────────────────────────────────

fn get_element_by_ref_id(ref_id: &str) -> Result<web_sys::Element, String> {
    let document = web_sys::window()
        .ok_or("No window available")?
        .document()
        .ok_or("No document available")?;
    document
        .query_selector(&format!("[data-ref-id='{}']", ref_id))
        .map_err(|e| format!("{:?}", e))?
        .ok_or_else(|| format!("Element with ref_id={} not found. Handles are scoped to a single snapshot. Call page.snapshot() again to get fresh refIds.", ref_id))
}

pub async fn execute_page_hover(params: PageHoverParams) -> WasmAsyncResponse {
    match get_element_by_ref_id(&params.ref_id) {
        Ok(element) => {
            let event = match web_sys::MouseEvent::new_with_mouse_event_init_dict(
                "mouseenter",
                &web_sys::MouseEventInit::new(),
            ) {
                Ok(e) => e,
                Err(e) => {
                    return WasmAsyncResponse {
                        ok: false,
                        value: None,
                        error: Some(WasmAsyncError {
                            message: format!("{:?}", e),
                            code: "E_AGENT".into(),
                        }),
                    }
                }
            };
            let _ = element.dispatch_event(&event);
            WasmAsyncResponse {
                ok: true,
                value: Some(serde_json::Value::Bool(true)),
                error: None,
            }
        }
        Err(e) => WasmAsyncResponse {
            ok: false,
            value: None,
            error: Some(WasmAsyncError {
                message: e,
                code: "E_AGENT".into(),
            }),
        },
    }
}

pub async fn execute_page_unhover() -> WasmAsyncResponse {
    let document = match web_sys::window().and_then(|w| w.document()) {
        Some(d) => d,
        None => {
            return WasmAsyncResponse {
                ok: false,
                value: None,
                error: Some(WasmAsyncError {
                    message: "No document available".into(),
                    code: "E_AGENT".into(),
                }),
            }
        }
    };
    // Dispatch mouseleave on body to clear any hover
    if let Some(body) = document.body() {
        if let Ok(event) = web_sys::MouseEvent::new_with_mouse_event_init_dict(
            "mouseleave",
            &web_sys::MouseEventInit::new(),
        ) {
            let _ = body.dispatch_event(&event);
        }
    }
    WasmAsyncResponse {
        ok: true,
        value: Some(serde_json::Value::Bool(true)),
        error: None,
    }
}

pub async fn execute_page_scroll(params: PageScrollParams) -> WasmAsyncResponse {
    let window = match web_sys::window() {
        Some(w) => w,
        None => {
            return WasmAsyncResponse {
                ok: false,
                value: None,
                error: Some(WasmAsyncError {
                    message: "No window available".into(),
                    code: "E_AGENT".into(),
                }),
            }
        }
    };
    let (dx, dy) = match params.direction.as_str() {
        "down" => (0.0, params.amount),
        "up" => (0.0, -params.amount),
        "left" => (-params.amount, 0.0),
        "right" => (params.amount, 0.0),
        _ => (0.0, params.amount),
    };

    if let Some(ref_id) = &params.ref_id {
        match get_element_by_ref_id(ref_id) {
            Ok(element) => {
                let mut current = Some(element);
                while let Some(el) = current {
                    let style = window.get_computed_style(&el).ok().flatten();
                    let overflow = style.as_ref().and_then(|s| {
                        js_sys::Reflect::get(s, &"overflow".into())
                            .ok()
                            .and_then(|v| v.as_string())
                    });
                    let overflow_y = style.as_ref().and_then(|s| {
                        js_sys::Reflect::get(s, &"overflowY".into())
                            .ok()
                            .and_then(|v| v.as_string())
                    });
                    let is_scrollable = overflow
                        .as_ref()
                        .map(|v| {
                            v.contains("auto") || v.contains("scroll") || v.contains("overlay")
                        })
                        .unwrap_or(false)
                        || overflow_y
                            .as_ref()
                            .map(|v| {
                                v.contains("auto") || v.contains("scroll") || v.contains("overlay")
                            })
                            .unwrap_or(false);
                    if is_scrollable {
                        let current_top = el.scroll_top() as f64;
                        let current_left = el.scroll_left() as f64;
                        let _ = js_sys::Reflect::set(
                            &el,
                            &"scrollTop".into(),
                            &JsValue::from_f64(current_top + dy),
                        );
                        let _ = js_sys::Reflect::set(
                            &el,
                            &"scrollLeft".into(),
                            &JsValue::from_f64(current_left + dx),
                        );
                        return WasmAsyncResponse {
                            ok: true,
                            value: Some(serde_json::Value::Bool(true)),
                            error: None,
                        };
                    }
                    current = el.parent_element();
                }
                // No scrollable ancestor found — fall back to window scroll
            }
            Err(e) => {
                return WasmAsyncResponse {
                    ok: false,
                    value: None,
                    error: Some(WasmAsyncError {
                        message: e,
                        code: "E_NOT_FOUND".into(),
                    }),
                };
            }
        }
    }

    window.scroll_by_with_x_and_y(dx, dy);
    WasmAsyncResponse {
        ok: true,
        value: Some(serde_json::Value::Bool(true)),
        error: None,
    }
}

pub async fn execute_fetch_dom(params: FetchDomParams) -> WasmAsyncResponse {
    let window = match web_sys::window() {
        Some(w) => w,
        None => return no_window_response(),
    };

    let request = match web_sys::Request::new_with_str(&params.url) {
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
            return WasmAsyncResponse {
                ok: false,
                value: None,
                error: Some(WasmAsyncError {
                    message: format!("Network error: {:?}", e),
                    code: "ENETWORK".into(),
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

    let parser = DOMParser::new();
    let doc = parser.parse_from_string(&body, "text/html");

    let mut matches = Vec::new();
    if !params.selector.is_empty() {
        if let Ok(elements) = doc.query_selector_all(&params.selector) {
            let len = elements.length();
            for i in 0..len {
                if let Some(node) = elements.item(i) {
                    if let Ok(el) = node.dyn_into::<web_sys::Element>() {
                        let text = el.text_content().unwrap_or_default().trim().to_string();
                        let text = if text.len() > params.max_text as usize {
                            text[..params.max_text as usize].to_string()
                        } else {
                            text
                        };
                        matches.push(serde_json::json!({
                            "tag": el.tag_name().to_lowercase(),
                            "text": text,
                        }));
                    }
                }
            }
        }
    }

    let value = serde_json::json!({
        "status": status,
        "ok": ok,
        "body": body,
        "matches": matches,
    });

    WasmAsyncResponse {
        ok: true,
        value: Some(value),
        error: None,
    }
}

pub async fn execute_page_scroll_to(params: PageScrollToParams) -> WasmAsyncResponse {
    match get_element_by_ref_id(&params.ref_id) {
        Ok(element) => {
            element.scroll_into_view();
            WasmAsyncResponse {
                ok: true,
                value: Some(serde_json::Value::Bool(true)),
                error: None,
            }
        }
        Err(e) => WasmAsyncResponse {
            ok: false,
            value: None,
            error: Some(WasmAsyncError {
                message: e,
                code: "E_AGENT".into(),
            }),
        },
    }
}

pub async fn execute_page_dblclick(params: PageDblClickParams) -> WasmAsyncResponse {
    match get_element_by_ref_id(&params.ref_id) {
        Ok(element) => {
            let event = match web_sys::MouseEvent::new_with_mouse_event_init_dict(
                "dblclick",
                &web_sys::MouseEventInit::new(),
            ) {
                Ok(e) => e,
                Err(e) => {
                    return WasmAsyncResponse {
                        ok: false,
                        value: None,
                        error: Some(WasmAsyncError {
                            message: format!("{:?}", e),
                            code: "E_AGENT".into(),
                        }),
                    }
                }
            };
            let _ = element.dispatch_event(&event);
            WasmAsyncResponse {
                ok: true,
                value: Some(serde_json::Value::Bool(true)),
                error: None,
            }
        }
        Err(e) => WasmAsyncResponse {
            ok: false,
            value: None,
            error: Some(WasmAsyncError {
                message: e,
                code: "E_AGENT".into(),
            }),
        },
    }
}

pub async fn execute_page_type(params: PageTypeParams) -> WasmAsyncResponse {
    match get_element_by_ref_id(&params.ref_id) {
        Ok(element) => {
            if let Some(input) = element.dyn_ref::<web_sys::HtmlInputElement>() {
                let new_val = format!("{}{}", input.value(), params.text);
                input.set_value(&new_val);
            } else if let Some(textarea) = element.dyn_ref::<web_sys::HtmlTextAreaElement>() {
                let new_val = format!("{}{}", textarea.value(), params.text);
                textarea.set_value(&new_val);
            } else {
                return WasmAsyncResponse {
                    ok: false,
                    value: None,
                    error: Some(WasmAsyncError {
                        message: "Element is not a text input".into(),
                        code: "E_AGENT".into(),
                    }),
                };
            }
            WasmAsyncResponse {
                ok: true,
                value: Some(serde_json::Value::Bool(true)),
                error: None,
            }
        }
        Err(e) => WasmAsyncResponse {
            ok: false,
            value: None,
            error: Some(WasmAsyncError {
                message: e,
                code: "E_AGENT".into(),
            }),
        },
    }
}

pub async fn execute_page_press(params: PagePressParams) -> WasmAsyncResponse {
    let document = match web_sys::window().and_then(|w| w.document()) {
        Some(d) => d,
        None => {
            return WasmAsyncResponse {
                ok: false,
                value: None,
                error: Some(WasmAsyncError {
                    message: "No document available".into(),
                    code: "E_AGENT".into(),
                }),
            }
        }
    };
    let init = web_sys::KeyboardEventInit::new();
    init.set_key(&params.key);
    let event = match web_sys::KeyboardEvent::new_with_keyboard_event_init_dict("keydown", &init) {
        Ok(e) => e,
        Err(e) => {
            return WasmAsyncResponse {
                ok: false,
                value: None,
                error: Some(WasmAsyncError {
                    message: format!("{:?}", e),
                    code: "E_AGENT".into(),
                }),
            }
        }
    };
    let _ = document.dispatch_event(&event);
    WasmAsyncResponse {
        ok: true,
        value: Some(serde_json::Value::Bool(true)),
        error: None,
    }
}

pub async fn execute_page_select(params: PageSelectParams) -> WasmAsyncResponse {
    match get_element_by_ref_id(&params.ref_id) {
        Ok(element) => {
            if let Some(select) = element.dyn_ref::<web_sys::HtmlSelectElement>() {
                select.set_value(&params.value);
            } else {
                return WasmAsyncResponse {
                    ok: false,
                    value: None,
                    error: Some(WasmAsyncError {
                        message: "Element is not a select".into(),
                        code: "E_AGENT".into(),
                    }),
                };
            }
            WasmAsyncResponse {
                ok: true,
                value: Some(serde_json::Value::Bool(true)),
                error: None,
            }
        }
        Err(e) => WasmAsyncResponse {
            ok: false,
            value: None,
            error: Some(WasmAsyncError {
                message: e,
                code: "E_AGENT".into(),
            }),
        },
    }
}

pub async fn execute_page_check(params: PageCheckParams) -> WasmAsyncResponse {
    match get_element_by_ref_id(&params.ref_id) {
        Ok(element) => {
            if let Some(input) = element.dyn_ref::<web_sys::HtmlInputElement>() {
                input.set_checked(params.checked);
            } else {
                return WasmAsyncResponse {
                    ok: false,
                    value: None,
                    error: Some(WasmAsyncError {
                        message: "Element is not a checkbox".into(),
                        code: "E_AGENT".into(),
                    }),
                };
            }
            WasmAsyncResponse {
                ok: true,
                value: Some(serde_json::Value::Bool(true)),
                error: None,
            }
        }
        Err(e) => WasmAsyncResponse {
            ok: false,
            value: None,
            error: Some(WasmAsyncError {
                message: e,
                code: "E_AGENT".into(),
            }),
        },
    }
}

// ─── Inline page actions (moved from session.rs) ───────────────

pub async fn execute_page_url() -> Result<WasmAsyncResponse, String> {
    let window = web_sys::window().ok_or("No window available")?;
    let href = window.location().href().map_err(|e| format!("{:?}", e))?;
    Ok(WasmAsyncResponse {
        ok: true,
        value: Some(serde_json::Value::String(href)),
        error: None,
    })
}

pub async fn execute_page_title() -> Result<WasmAsyncResponse, String> {
    let document = web_sys::window()
        .ok_or("No window available")?
        .document()
        .ok_or("No document available")?;
    let title = document.title();
    Ok(WasmAsyncResponse {
        ok: true,
        value: Some(serde_json::Value::String(title)),
        error: None,
    })
}

pub async fn execute_page_click(params: PageClickParams) -> Result<WasmAsyncResponse, String> {
    let document = web_sys::window()
        .ok_or("No window available")?
        .document()
        .ok_or("No document available")?;
    let element = document
        .query_selector(&format!("[data-ref-id='{}']", params.ref_id))
        .map_err(|e| format!("{:?}", e))?
        .or_else(|| find_element_by_label(&document, &params.label))
        .ok_or_else(|| format!("Element with ref_id '{}' not found. Handles are scoped to a single snapshot. Call page.snapshot() again to get fresh refIds.", params.ref_id))?;
    element
        .dyn_ref::<web_sys::HtmlElement>()
        .ok_or("Element is not clickable")?
        .click();
    Ok(WasmAsyncResponse {
        ok: true,
        value: Some(serde_json::Value::Null),
        error: None,
    })
}

pub async fn execute_page_fill(params: PageFillParams) -> Result<WasmAsyncResponse, String> {
    let document = web_sys::window()
        .ok_or("No window available")?
        .document()
        .ok_or("No document available")?;
    let element = document
        .query_selector(&format!("[data-ref-id='{}']", params.ref_id))
        .map_err(|e| format!("{:?}", e))?
        .or_else(|| find_element_by_label(&document, &params.label))
        .ok_or_else(|| format!("Element with ref_id '{}' not found. Handles are scoped to a single snapshot. Call page.snapshot() again to get fresh refIds.", params.ref_id))?;
    if let Some(input) = element.dyn_ref::<web_sys::HtmlInputElement>() {
        input.set_value(&params.value);
    } else {
        return Err("Element is not an input".into());
    }
    let event = web_sys::Event::new("input").map_err(|e| format!("{:?}", e))?;
    let _ = element.dispatch_event(&event);
    Ok(WasmAsyncResponse {
        ok: true,
        value: Some(serde_json::Value::Null),
        error: None,
    })
}

pub async fn execute_page_goto(params: PageGotoParams) -> Result<WasmAsyncResponse, String> {
    let window = web_sys::window().ok_or("No window available")?;
    window
        .location()
        .set_href(&params.url)
        .map_err(|e| format!("{:?}", e))?;
    Ok(WasmAsyncResponse {
        ok: true,
        value: Some(serde_json::Value::Null),
        error: None,
    })
}

pub async fn execute_page_back() -> Result<WasmAsyncResponse, String> {
    let window = web_sys::window().ok_or("No window available")?;
    window
        .history()
        .map_err(|e| format!("{:?}", e))?
        .back()
        .map_err(|e| format!("{:?}", e))?;
    Ok(WasmAsyncResponse {
        ok: true,
        value: Some(serde_json::Value::Null),
        error: None,
    })
}

pub async fn execute_page_forward() -> Result<WasmAsyncResponse, String> {
    let window = web_sys::window().ok_or("No window available")?;
    window
        .history()
        .map_err(|e| format!("{:?}", e))?
        .forward()
        .map_err(|e| format!("{:?}", e))?;
    Ok(WasmAsyncResponse {
        ok: true,
        value: Some(serde_json::Value::Null),
        error: None,
    })
}

pub async fn execute_page_reload() -> Result<WasmAsyncResponse, String> {
    let window = web_sys::window().ok_or("No window available")?;
    window.location().reload().map_err(|e| format!("{:?}", e))?;
    Ok(WasmAsyncResponse {
        ok: true,
        value: Some(serde_json::Value::Null),
        error: None,
    })
}

pub async fn execute_page_snapshot_text(
    params: DomSnapshotParams,
) -> Result<WasmAsyncResponse, String> {
    let resp = execute_dom_snapshot(params);
    if let Some(ref value) = resp.value {
        if let Some(text) = value.get("text").and_then(|t| t.as_str()) {
            return Ok(WasmAsyncResponse {
                ok: true,
                value: Some(serde_json::Value::String(text.to_string())),
                error: None,
            });
        }
    }
    Ok(resp)
}

pub async fn execute_page_snapshot_data(
    params: DomSnapshotParams,
) -> Result<WasmAsyncResponse, String> {
    Ok(execute_dom_snapshot(params))
}

pub async fn execute_page_append(params: PageAppendParams) -> Result<WasmAsyncResponse, String> {
    let document = web_sys::window()
        .ok_or("No window available")?
        .document()
        .ok_or("No document available")?;
    let element = document
        .query_selector(&format!("[data-ref-id='{}']", params.ref_id))
        .map_err(|e| format!("{:?}", e))?
        .or_else(|| find_element_by_label(&document, &params.label))
        .ok_or_else(|| format!("Element with ref_id '{}' not found. Handles are scoped to a single snapshot. Call page.snapshot() again to get fresh refIds.", params.ref_id))?;
    if let Some(input) = element.dyn_ref::<web_sys::HtmlInputElement>() {
        let current = input.value();
        input.set_value(&format!("{}{}", current, params.text));
    } else {
        return Err("Element is not an input".into());
    }
    let event = web_sys::Event::new("input").map_err(|e| format!("{:?}", e))?;
    let _ = element.dispatch_event(&event);
    Ok(WasmAsyncResponse {
        ok: true,
        value: Some(serde_json::Value::Null),
        error: None,
    })
}

pub async fn execute_page_find(params: PageFindParams) -> Result<WasmAsyncResponse, String> {
    let document = web_sys::window()
        .ok_or("No window available")?
        .document()
        .ok_or("No document available")?;
    let elements = document
        .query_selector_all(&params.selector)
        .map_err(|e| format!("{:?}", e))?;
    let mut results = Vec::new();
    for i in 0..elements.length() {
        if let Some(el) = elements.item(i) {
            if let Some(el) = el.dyn_ref::<web_sys::Element>() {
                let tag = el.tag_name();
                let ref_id = el.get_attribute("data-ref-id").unwrap_or_default();
                let text = el.text_content().unwrap_or_default();
                results.push(serde_json::json!({
                    "tag": tag,
                    "refId": ref_id,
                    "text": text,
                }));
            }
        }
    }
    Ok(WasmAsyncResponse {
        ok: true,
        value: Some(serde_json::Value::Array(results)),
        error: None,
    })
}

pub async fn execute_page_wait_for(
    params: PageWaitForParams,
) -> Result<WasmAsyncResponse, String> {
    let window = web_sys::window().ok_or("No window available")?;
    let document = window.document().ok_or("No document available")?;
    let start = js_sys::Date::now();
    let timeout = params.timeout as f64;
    let interval_ms = 100.0;

    loop {
        if let Ok(Some(_)) = document.query_selector(&params.selector) {
            return Ok(WasmAsyncResponse {
                ok: true,
                value: Some(serde_json::Value::Bool(true)),
                error: None,
            });
        }
        let elapsed = js_sys::Date::now() - start;
        if elapsed >= timeout {
            return Ok(WasmAsyncResponse {
                ok: false,
                value: None,
                error: Some(WasmAsyncError {
                    message: format!("Timeout waiting for selector: {}", params.selector),
                    code: "E_TIMEOUT".into(),
                }),
            });
        }
        let promise = js_sys::Promise::new(
            &mut |resolve: js_sys::Function, _reject: js_sys::Function| {
                let set_timeout = js_sys::Reflect::get(&window, &"setTimeout".into())
                    .unwrap()
                    .dyn_into::<js_sys::Function>()
                    .unwrap();
                let _ = set_timeout.call2(&window, &resolve, &JsValue::from_f64(interval_ms));
            },
        );
        let _ = JsFuture::from(promise).await;
    }
}

pub async fn execute_page_extract(
    params: PageExtractParams,
) -> Result<WasmAsyncResponse, String> {
    let document = web_sys::window()
        .ok_or("No window available")?
        .document()
        .ok_or("No document available")?;
    let mut result = serde_json::Map::new();
    for field in &params.fields {
        match field.as_str() {
            "title" => {
                result.insert(
                    "title".to_string(),
                    serde_json::Value::String(document.title()),
                );
            }
            "url" => {
                let href = web_sys::window()
                    .ok_or("No window available")?
                    .location()
                    .href()
                    .map_err(|e| format!("{:?}", e))?;
                result.insert("url".to_string(), serde_json::Value::String(href));
            }
            "headings" => {
                let max_headings = params.max_headings as usize;
                let headings = document
                    .query_selector_all("h1, h2, h3, h4, h5, h6")
                    .map_err(|e| format!("{:?}", e))?;
                let mut list = Vec::new();
                for i in 0..headings.length() {
                    if let Some(el) = headings.item(i) {
                        if let Some(el) = el.dyn_ref::<web_sys::Element>() {
                            let text = el
                                .text_content()
                                .unwrap_or_default()
                                .trim()
                                .to_string();
                            let text = if text.len() > max_headings {
                                text.chars().take(max_headings).collect::<String>()
                            } else {
                                text
                            };
                            list.push(serde_json::json!({
                                "tag": el.tag_name(),
                                "text": text,
                            }));
                        }
                    }
                }
                result.insert("headings".to_string(), serde_json::Value::Array(list));
            }
            "links" => {
                let max_links = params.max_links as usize;
                let links = document
                    .query_selector_all("a[href]")
                    .map_err(|e| format!("{:?}", e))?;
                let mut list = Vec::new();
                for i in 0..links.length() {
                    if let Some(el) = links.item(i) {
                        if let Some(el) = el.dyn_ref::<web_sys::Element>() {
                            let text = el
                                .text_content()
                                .unwrap_or_default()
                                .trim()
                                .to_string();
                            let text = if text.len() > max_links {
                                text.chars().take(max_links).collect::<String>()
                            } else {
                                text
                            };
                            list.push(serde_json::json!({
                                "href": el.get_attribute("href").unwrap_or_default(),
                                "text": text,
                            }));
                        }
                    }
                }
                result.insert("links".to_string(), serde_json::Value::Array(list));
            }
            "text" => {
                let max_text = params.max_text as usize;
                let body_text = document
                    .body()
                    .and_then(|b| b.text_content())
                    .unwrap_or_default()
                    .trim()
                    .chars()
                    .take(max_text)
                    .collect::<String>();
                result.insert("text".to_string(), serde_json::Value::String(body_text));
            }
            _ => {}
        }
    }
    Ok(WasmAsyncResponse {
        ok: true,
        value: Some(serde_json::Value::Object(result)),
        error: None,
    })
}

// ─── Sidepanel actions (synonyms in web-lua) ────────────────────

pub async fn execute_sidepanel_snapshot_text(
    params: DomSnapshotParams,
) -> Result<WasmAsyncResponse, String> {
    let resp = execute_dom_snapshot(params);
    if let Some(ref value) = resp.value {
        if let Some(text) = value.get("text").and_then(|t| t.as_str()) {
            return Ok(WasmAsyncResponse {
                ok: true,
                value: Some(serde_json::Value::String(text.to_string())),
                error: None,
            });
        }
    }
    Ok(resp)
}

pub async fn execute_sidepanel_snapshot_data(
    params: DomSnapshotParams,
) -> Result<WasmAsyncResponse, String> {
    Ok(execute_dom_snapshot(params))
}

pub async fn execute_sidepanel_click(
    params: PageClickParams,
) -> Result<WasmAsyncResponse, String> {
    let document = web_sys::window()
        .ok_or("No window available")?
        .document()
        .ok_or("No document available")?;
    let element = document
        .query_selector(&format!("[data-ref-id='{}']", params.ref_id))
        .map_err(|e| format!("{:?}", e))?
        .or_else(|| find_element_by_label(&document, &params.label))
        .ok_or_else(|| format!("Element with ref_id '{}' not found. Handles are scoped to a single snapshot. Call page.snapshot() again to get fresh refIds.", params.ref_id))?;
    element
        .dyn_ref::<web_sys::HtmlElement>()
        .ok_or("Element is not clickable")?
        .click();
    Ok(WasmAsyncResponse {
        ok: true,
        value: Some(serde_json::Value::Null),
        error: None,
    })
}

pub async fn execute_sidepanel_fill(
    params: PageFillParams,
) -> Result<WasmAsyncResponse, String> {
    let document = web_sys::window()
        .ok_or("No window available")?
        .document()
        .ok_or("No document available")?;
    let element = document
        .query_selector(&format!("[data-ref-id='{}']", params.ref_id))
        .map_err(|e| format!("{:?}", e))?
        .or_else(|| find_element_by_label(&document, &params.label))
        .ok_or_else(|| format!("Element with ref_id '{}' not found. Handles are scoped to a single snapshot. Call page.snapshot() again to get fresh refIds.", params.ref_id))?;
    if let Some(input) = element.dyn_ref::<web_sys::HtmlInputElement>() {
        input.set_value(&params.value);
    } else {
        return Err("Element is not an input".into());
    }
    let event = web_sys::Event::new("input").map_err(|e| format!("{:?}", e))?;
    let _ = element.dispatch_event(&event);
    Ok(WasmAsyncResponse {
        ok: true,
        value: Some(serde_json::Value::Null),
        error: None,
    })
}

pub async fn execute_sidepanel_append(
    params: PageAppendParams,
) -> Result<WasmAsyncResponse, String> {
    let document = web_sys::window()
        .ok_or("No window available")?
        .document()
        .ok_or("No document available")?;
    let element = document
        .query_selector(&format!("[data-ref-id='{}']", params.ref_id))
        .map_err(|e| format!("{:?}", e))?
        .or_else(|| find_element_by_label(&document, &params.label))
        .ok_or_else(|| format!("Element with ref_id '{}' not found. Handles are scoped to a single snapshot. Call page.snapshot() again to get fresh refIds.", params.ref_id))?;
    if let Some(input) = element.dyn_ref::<web_sys::HtmlInputElement>() {
        let current = input.value();
        input.set_value(&format!("{}{}", current, params.text));
    } else {
        return Err("Element is not an input".into());
    }
    let event = web_sys::Event::new("input").map_err(|e| format!("{:?}", e))?;
    let _ = element.dispatch_event(&event);
    Ok(WasmAsyncResponse {
        ok: true,
        value: Some(serde_json::Value::Null),
        error: None,
    })
}

pub async fn execute_sidepanel_url() -> Result<WasmAsyncResponse, String> {
    let window = web_sys::window().ok_or("No window available")?;
    let href = window.location().href().map_err(|e| format!("{:?}", e))?;
    Ok(WasmAsyncResponse {
        ok: true,
        value: Some(serde_json::Value::String(href)),
        error: None,
    })
}

pub async fn execute_sidepanel_title() -> Result<WasmAsyncResponse, String> {
    let document = web_sys::window()
        .ok_or("No window available")?
        .document()
        .ok_or("No document available")?;
    let title = document.title();
    Ok(WasmAsyncResponse {
        ok: true,
        value: Some(serde_json::Value::String(title)),
        error: None,
    })
}

pub async fn execute_storage_list() -> WasmAsyncResponse {
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

// ─── fs.* helpers ───────────────────────────────────────────────

fn fs_err_to_wasm(err: web_fs::FsError) -> WasmAsyncError {
    WasmAsyncError {
        message: err.wire_message(),
        code: err.wire_code().into(),
    }
}

pub async fn execute_fs_exists(
    params: web_lua_core::command_params::FsPathParams,
) -> WasmAsyncResponse {
    let exists = web_fs::exists(&params.path).await;
    WasmAsyncResponse {
        ok: true,
        value: Some(serde_json::Value::Bool(exists)),
        error: None,
    }
}

pub async fn execute_fs_stat(
    params: web_lua_core::command_params::FsPathParams,
) -> WasmAsyncResponse {
    match web_fs::stat(&params.path).await {
        Ok(meta) => match serde_json::to_value(&meta) {
            Ok(v) => WasmAsyncResponse {
                ok: true,
                value: Some(v),
                error: None,
            },
            Err(e) => WasmAsyncResponse {
                ok: false,
                value: None,
                error: Some(WasmAsyncError {
                    message: format!("Failed to serialize metadata: {}", e),
                    code: "E_IO".into(),
                }),
            },
        },
        Err(e) => WasmAsyncResponse {
            ok: false,
            value: None,
            error: Some(fs_err_to_wasm(e)),
        },
    }
}

pub async fn execute_fs_list(
    params: web_lua_core::command_params::FsPathParams,
) -> WasmAsyncResponse {
    match web_fs::list(&params.path).await {
        Ok(entries) => match serde_json::to_value(&entries) {
            Ok(v) => WasmAsyncResponse {
                ok: true,
                value: Some(v),
                error: None,
            },
            Err(e) => WasmAsyncResponse {
                ok: false,
                value: None,
                error: Some(WasmAsyncError {
                    message: format!("Failed to serialize entries: {}", e),
                    code: "E_IO".into(),
                }),
            },
        },
        Err(e) => WasmAsyncResponse {
            ok: false,
            value: None,
            error: Some(fs_err_to_wasm(e)),
        },
    }
}

pub async fn execute_fs_mkdir(
    params: web_lua_core::command_params::FsPathParams,
) -> WasmAsyncResponse {
    match web_fs::mkdir(&params.path).await {
        Ok(_) => WasmAsyncResponse {
            ok: true,
            value: Some(serde_json::Value::Bool(true)),
            error: None,
        },
        Err(e) => WasmAsyncResponse {
            ok: false,
            value: None,
            error: Some(fs_err_to_wasm(e)),
        },
    }
}

pub async fn execute_fs_delete(
    params: web_lua_core::command_params::FsPathParams,
) -> WasmAsyncResponse {
    match web_fs::delete(&params.path).await {
        Ok(_) => WasmAsyncResponse {
            ok: true,
            value: Some(serde_json::Value::Bool(true)),
            error: None,
        },
        Err(e) => WasmAsyncResponse {
            ok: false,
            value: None,
            error: Some(fs_err_to_wasm(e)),
        },
    }
}

pub async fn execute_fs_copy(
    params: web_lua_core::command_params::FsCopyParams,
) -> WasmAsyncResponse {
    match web_fs::copy(&params.from, &params.to).await {
        Ok(_) => WasmAsyncResponse {
            ok: true,
            value: Some(serde_json::Value::Bool(true)),
            error: None,
        },
        Err(e) => WasmAsyncResponse {
            ok: false,
            value: None,
            error: Some(fs_err_to_wasm(e)),
        },
    }
}

pub async fn execute_fs_move(
    params: web_lua_core::command_params::FsCopyParams,
) -> WasmAsyncResponse {
    match web_fs::rename(&params.from, &params.to).await {
        Ok(_) => WasmAsyncResponse {
            ok: true,
            value: Some(serde_json::Value::Bool(true)),
            error: None,
        },
        Err(e) => WasmAsyncResponse {
            ok: false,
            value: None,
            error: Some(fs_err_to_wasm(e)),
        },
    }
}

pub async fn execute_fs_read(
    params: web_lua_core::command_params::FsPathParams,
) -> WasmAsyncResponse {
    match web_fs::read(&params.path).await {
        Ok(bytes) => WasmAsyncResponse {
            ok: true,
            value: Some(serde_json::Value::String(
                data_encoding::BASE64.encode(&bytes),
            )),
            error: None,
        },
        Err(e) => WasmAsyncResponse {
            ok: false,
            value: None,
            error: Some(fs_err_to_wasm(e)),
        },
    }
}

pub async fn execute_fs_read_text(
    params: web_lua_core::command_params::FsPathParams,
) -> WasmAsyncResponse {
    match web_fs::read_text(&params.path).await {
        Ok(text) => WasmAsyncResponse {
            ok: true,
            value: Some(serde_json::Value::String(text)),
            error: None,
        },
        Err(e) => WasmAsyncResponse {
            ok: false,
            value: None,
            error: Some(fs_err_to_wasm(e)),
        },
    }
}

pub async fn execute_fs_read_base64(
    params: web_lua_core::command_params::FsPathParams,
) -> WasmAsyncResponse {
    match web_fs::read_base64(&params.path).await {
        Ok(b64) => WasmAsyncResponse {
            ok: true,
            value: Some(serde_json::Value::String(b64)),
            error: None,
        },
        Err(e) => WasmAsyncResponse {
            ok: false,
            value: None,
            error: Some(fs_err_to_wasm(e)),
        },
    }
}

pub async fn execute_fs_read_range(
    params: web_lua_core::command_params::FsReadRangeParams,
) -> WasmAsyncResponse {
    match web_fs::read_range(&params.path, params.offset, params.len).await {
        Ok(bytes) => WasmAsyncResponse {
            ok: true,
            value: Some(serde_json::Value::String(
                data_encoding::BASE64.encode(&bytes),
            )),
            error: None,
        },
        Err(e) => WasmAsyncResponse {
            ok: false,
            value: None,
            error: Some(fs_err_to_wasm(e)),
        },
    }
}

pub async fn execute_fs_write(
    params: web_lua_core::command_params::FsWriteParams,
) -> WasmAsyncResponse {
    let bytes = match data_encoding::BASE64.decode(params.data.as_bytes()) {
        Ok(b) => b,
        Err(_) => {
            return WasmAsyncResponse {
                ok: false,
                value: None,
                error: Some(WasmAsyncError {
                    message: "Invalid base64 data".into(),
                    code: "E_INVALID_ENCODING".into(),
                }),
            };
        }
    };
    match web_fs::write(&params.path, &bytes).await {
        Ok(_) => WasmAsyncResponse {
            ok: true,
            value: Some(serde_json::Value::Bool(true)),
            error: None,
        },
        Err(e) => WasmAsyncResponse {
            ok: false,
            value: None,
            error: Some(fs_err_to_wasm(e)),
        },
    }
}

pub async fn execute_fs_write_text(
    params: web_lua_core::command_params::FsWriteParams,
) -> WasmAsyncResponse {
    match web_fs::write_text(&params.path, &params.data).await {
        Ok(_) => WasmAsyncResponse {
            ok: true,
            value: Some(serde_json::Value::Bool(true)),
            error: None,
        },
        Err(e) => WasmAsyncResponse {
            ok: false,
            value: None,
            error: Some(fs_err_to_wasm(e)),
        },
    }
}

pub async fn execute_fs_write_base64(
    params: web_lua_core::command_params::FsWriteParams,
) -> WasmAsyncResponse {
    match web_fs::write_base64(&params.path, &params.data).await {
        Ok(_) => WasmAsyncResponse {
            ok: true,
            value: Some(serde_json::Value::Bool(true)),
            error: None,
        },
        Err(e) => WasmAsyncResponse {
            ok: false,
            value: None,
            error: Some(fs_err_to_wasm(e)),
        },
    }
}

pub async fn execute_fs_append(
    params: web_lua_core::command_params::FsWriteParams,
) -> WasmAsyncResponse {
    let bytes = match data_encoding::BASE64.decode(params.data.as_bytes()) {
        Ok(b) => b,
        Err(_) => {
            return WasmAsyncResponse {
                ok: false,
                value: None,
                error: Some(WasmAsyncError {
                    message: "Invalid base64 data".into(),
                    code: "E_INVALID_ENCODING".into(),
                }),
            };
        }
    };
    match web_fs::append(&params.path, &bytes).await {
        Ok(_) => WasmAsyncResponse {
            ok: true,
            value: Some(serde_json::Value::Bool(true)),
            error: None,
        },
        Err(e) => WasmAsyncResponse {
            ok: false,
            value: None,
            error: Some(fs_err_to_wasm(e)),
        },
    }
}

pub async fn execute_fs_append_text(
    params: web_lua_core::command_params::FsWriteParams,
) -> WasmAsyncResponse {
    match web_fs::append_text(&params.path, &params.data).await {
        Ok(_) => WasmAsyncResponse {
            ok: true,
            value: Some(serde_json::Value::Bool(true)),
            error: None,
        },
        Err(e) => WasmAsyncResponse {
            ok: false,
            value: None,
            error: Some(fs_err_to_wasm(e)),
        },
    }
}

pub async fn execute_fs_append_base64(
    params: web_lua_core::command_params::FsWriteParams,
) -> WasmAsyncResponse {
    match web_fs::append_base64(&params.path, &params.data).await {
        Ok(_) => WasmAsyncResponse {
            ok: true,
            value: Some(serde_json::Value::Bool(true)),
            error: None,
        },
        Err(e) => WasmAsyncResponse {
            ok: false,
            value: None,
            error: Some(fs_err_to_wasm(e)),
        },
    }
}

pub async fn execute_fs_update(
    params: web_lua_core::command_params::FsUpdateParams,
) -> WasmAsyncResponse {
    let bytes = match data_encoding::BASE64.decode(params.data.as_bytes()) {
        Ok(b) => b,
        Err(_) => {
            return WasmAsyncResponse {
                ok: false,
                value: None,
                error: Some(WasmAsyncError {
                    message: "Invalid base64 data".into(),
                    code: "E_INVALID_ENCODING".into(),
                }),
            };
        }
    };
    match web_fs::update(&params.path, params.offset, &bytes).await {
        Ok(_) => WasmAsyncResponse {
            ok: true,
            value: Some(serde_json::Value::Bool(true)),
            error: None,
        },
        Err(e) => WasmAsyncResponse {
            ok: false,
            value: None,
            error: Some(fs_err_to_wasm(e)),
        },
    }
}

pub async fn execute_fs_hash(
    params: web_lua_core::command_params::FsHashParams,
) -> WasmAsyncResponse {
    match web_fs::hash(&params.path, &params.algo).await {
        Ok(hex) => WasmAsyncResponse {
            ok: true,
            value: Some(serde_json::Value::String(hex)),
            error: None,
        },
        Err(e) => WasmAsyncResponse {
            ok: false,
            value: None,
            error: Some(fs_err_to_wasm(e)),
        },
    }
}

// ─── Registry Initialization ────────────────────────────────────

macro_rules! reg_async_resp {
    ($reg:expr, $name:expr, $params:ty, $fn:path) => {
        $reg.insert(
            $name.to_string(),
            Box::new(|cmd: WasmAsyncCommand| {
                Box::pin(async move {
                    let params = cmd
                        .parse_params::<$params>()
                        .map_err(|e| format!("Invalid {} params: {}", $name, e))?;
                    Ok($fn(params).await)
                })
            }),
        );
    };
}

macro_rules! reg_async_result {
    ($reg:expr, $name:expr, $params:ty, $fn:path) => {
        $reg.insert(
            $name.to_string(),
            Box::new(|cmd: WasmAsyncCommand| {
                Box::pin(async move {
                    let params = cmd
                        .parse_params::<$params>()
                        .map_err(|e| format!("Invalid {} params: {}", $name, e))?;
                    $fn(params).await
                })
            }),
        );
    };
}

macro_rules! reg_async_resp_no_params {
    ($reg:expr, $name:expr, $fn:path) => {
        $reg.insert(
            $name.to_string(),
            Box::new(|_cmd: WasmAsyncCommand| {
                Box::pin(async move { Ok($fn().await) })
            }),
        );
    };
}

macro_rules! reg_async_result_no_params {
    ($reg:expr, $name:expr, $fn:path) => {
        $reg.insert(
            $name.to_string(),
            Box::new(|_cmd: WasmAsyncCommand| {
                Box::pin(async move { $fn().await })
            }),
        );
    };
}

macro_rules! reg_sync_resp {
    ($reg:expr, $name:expr, $params:ty, $fn:path) => {
        $reg.insert(
            $name.to_string(),
            Box::new(|cmd: WasmAsyncCommand| {
                Box::pin(async move {
                    let params = cmd
                        .parse_params::<$params>()
                        .map_err(|e| format!("Invalid {} params: {}", $name, e))?;
                    Ok($fn(params))
                })
            }),
        );
    };
}

macro_rules! reg_unavailable {
    ($reg:expr, $($name:expr),+ $(,)?) => {
        $(
            $reg.insert(
                $name.to_string(),
                Box::new(|_cmd: WasmAsyncCommand| {
                    Box::pin(async move {
                        Err(format!("{} is not available in web-lua context", $name))
                    })
                }),
            );
        )+
    };
}

pub async fn execute_runtime_docs() -> WasmAsyncResponse {
    execute_host_call("runtime_docs", serde_json::json!({})).await
}

pub async fn execute_runtime_get_doc(params: serde_json::Value) -> WasmAsyncResponse {
    execute_host_call("runtime_get_doc", params).await
}

pub async fn execute_runtime_search_docs(params: serde_json::Value) -> WasmAsyncResponse {
    execute_host_call("runtime_search_docs", params).await
}

pub fn init_registry() {
    HANDLER_REGISTRY.with(|reg| {
        let mut reg = reg.borrow_mut();

        // Runtime doc provider actions
        reg_async_resp_no_params!(reg, "__runtime_docs", execute_runtime_docs);
        reg.insert(
            "__runtime_get_doc".to_string(),
            Box::new(|cmd: WasmAsyncCommand| {
                Box::pin(async move {
                    Ok(execute_runtime_get_doc(cmd.params).await)
                })
            }),
        );
        reg.insert(
            "__runtime_search_docs".to_string(),
            Box::new(|cmd: WasmAsyncCommand| {
                Box::pin(async move {
                    Ok(execute_runtime_search_docs(cmd.params).await)
                })
            }),
        );

        // web.fetch
        reg_async_resp!(reg, "fetch", FetchParams, execute_fetch);
        // web.sleep
        reg_async_resp!(reg, "sleep", SleepParams, execute_sleep);
        // page.wait
        reg_async_resp!(reg, "page_wait", PageWaitParams, execute_page_wait);
        // page.press
        reg_async_resp!(reg, "page_press", PagePressParams, execute_page_press);
        // page.select
        reg_async_resp!(reg, "page_select", PageSelectParams, execute_page_select);
        // page.check
        reg_async_resp!(reg, "page_check", PageCheckParams, execute_page_check);
        // page.hover
        reg_async_resp!(reg, "page_hover", PageHoverParams, execute_page_hover);
        // page.unhover
        reg_async_resp_no_params!(reg, "page_unhover", execute_page_unhover);
        // page.scroll
        reg_async_resp!(reg, "page_scroll", PageScrollParams, execute_page_scroll);
        // page.scroll_to
        reg_async_resp!(reg, "page_scroll_to", PageScrollToParams, execute_page_scroll_to);
        // page.dblclick
        reg_async_resp!(reg, "page_dblclick", PageDblClickParams, execute_page_dblclick);
        // page.type
        reg_async_resp!(reg, "page_type", PageTypeParams, execute_page_type);
        // dom.snapshot
        reg_sync_resp!(reg, "dom_snapshot", DomSnapshotParams, execute_dom_snapshot);
        // dom.format
        reg_sync_resp!(reg, "dom_format", DomFormatParams, execute_dom_format);
        // web.fetch_dom
        reg_async_resp!(reg, "fetch_dom", FetchDomParams, execute_fetch_dom);
        // storage.get
        reg_async_resp!(reg, "storage_get", StorageGetParams, execute_storage_get);
        // storage.set
        reg_async_resp!(reg, "storage_set", StorageSetParams, execute_storage_set);
        // storage.delete
        reg_async_resp!(reg, "storage_delete", StorageDeleteParams, execute_storage_delete);
        // storage.list
        reg_async_resp_no_params!(reg, "storage_list", execute_storage_list);

        // fs.*
        reg_async_resp!(reg, "fs_exists", FsPathParams, execute_fs_exists);
        reg_async_resp!(reg, "fs_stat", FsPathParams, execute_fs_stat);
        reg_async_resp!(reg, "fs_list", FsPathParams, execute_fs_list);
        reg_async_resp!(reg, "fs_mkdir", FsPathParams, execute_fs_mkdir);
        reg_async_resp!(reg, "fs_delete", FsPathParams, execute_fs_delete);
        reg_async_resp!(reg, "fs_copy", FsCopyParams, execute_fs_copy);
        reg_async_resp!(reg, "fs_move", FsCopyParams, execute_fs_move);
        reg_async_resp!(reg, "fs_read", FsPathParams, execute_fs_read);
        reg_async_resp!(reg, "fs_read_text", FsPathParams, execute_fs_read_text);
        reg_async_resp!(reg, "fs_read_base64", FsPathParams, execute_fs_read_base64);
        reg_async_resp!(reg, "fs_read_range", FsReadRangeParams, execute_fs_read_range);
        reg_async_resp!(reg, "fs_write", FsWriteParams, execute_fs_write);
        reg_async_resp!(reg, "fs_write_text", FsWriteParams, execute_fs_write_text);
        reg_async_resp!(reg, "fs_write_base64", FsWriteParams, execute_fs_write_base64);
        reg_async_resp!(reg, "fs_append", FsWriteParams, execute_fs_append);
        reg_async_resp!(reg, "fs_append_text", FsWriteParams, execute_fs_append_text);
        reg_async_resp!(reg, "fs_append_base64", FsWriteParams, execute_fs_append_base64);
        reg_async_resp!(reg, "fs_update", FsUpdateParams, execute_fs_update);
        reg_async_resp!(reg, "fs_hash", FsHashParams, execute_fs_hash);

        // Inline page actions
        reg_async_result_no_params!(reg, "page_url", execute_page_url);
        reg_async_result_no_params!(reg, "page_title", execute_page_title);
        reg_async_result!(reg, "page_click", PageClickParams, execute_page_click);
        reg_async_result!(reg, "page_fill", PageFillParams, execute_page_fill);
        reg_async_result!(reg, "page_goto", PageGotoParams, execute_page_goto);
        reg_async_result_no_params!(reg, "page_back", execute_page_back);
        reg_async_result_no_params!(reg, "page_forward", execute_page_forward);
        reg_async_result_no_params!(reg, "page_reload", execute_page_reload);
        reg_async_result!(reg, "page_snapshot_text", DomSnapshotParams, execute_page_snapshot_text);
        reg_async_result!(reg, "page_snapshot_data", DomSnapshotParams, execute_page_snapshot_data);
        reg_async_result!(reg, "page_append", PageAppendParams, execute_page_append);
        reg_async_result!(reg, "page_find", PageFindParams, execute_page_find);
        reg_async_result!(reg, "page_wait_for", PageWaitForParams, execute_page_wait_for);
        reg_async_result!(reg, "page_extract", PageExtractParams, execute_page_extract);

        // Sidepanel synonyms
        reg_async_result!(reg, "sidepanel_snapshot_text", DomSnapshotParams, execute_sidepanel_snapshot_text);
        reg_async_result!(reg, "sidepanel_snapshot_data", DomSnapshotParams, execute_sidepanel_snapshot_data);
        reg_async_result!(reg, "sidepanel_click", PageClickParams, execute_sidepanel_click);
        reg_async_resp!(reg, "sidepanel_dblclick", PageDblClickParams, execute_page_dblclick);
        reg_async_result!(reg, "sidepanel_fill", PageFillParams, execute_sidepanel_fill);
        reg_async_resp!(reg, "sidepanel_type", PageTypeParams, execute_page_type);
        reg_async_result!(reg, "sidepanel_append", PageAppendParams, execute_sidepanel_append);
        reg_async_resp!(reg, "sidepanel_press", PagePressParams, execute_page_press);
        reg_async_resp!(reg, "sidepanel_select", PageSelectParams, execute_page_select);
        reg_async_resp!(reg, "sidepanel_check", PageCheckParams, execute_page_check);
        reg_async_resp!(reg, "sidepanel_hover", PageHoverParams, execute_page_hover);
        reg_async_resp_no_params!(reg, "sidepanel_unhover", execute_page_unhover);
        reg_async_resp!(reg, "sidepanel_scroll", PageScrollParams, execute_page_scroll);
        reg_async_resp!(reg, "sidepanel_scroll_to", PageScrollToParams, execute_page_scroll_to);
        reg_async_result_no_params!(reg, "sidepanel_url", execute_sidepanel_url);
        reg_async_result_no_params!(reg, "sidepanel_title", execute_sidepanel_title);
        reg_async_resp!(reg, "sidepanel_wait", PageWaitParams, execute_page_wait);

        // Test-only mock
        reg.insert(
            "mock_async".to_string(),
            Box::new(|_cmd: WasmAsyncCommand| {
                Box::pin(async move {
                    Ok(WasmAsyncResponse {
                        ok: true,
                        value: Some(serde_json::Value::Null),
                        error: None,
                    })
                })
            }),
        );

        // Not yet implemented
        reg.insert(
            "page_screenshot".to_string(),
            Box::new(|_cmd: WasmAsyncCommand| {
                Box::pin(async move {
                    Ok(WasmAsyncResponse {
                        ok: false,
                        value: None,
                        error: Some(WasmAsyncError {
                            message: "screenshot not yet implemented in web-lua".into(),
                            code: "E_NOT_IMPLEMENTED".into(),
                        }),
                    })
                })
            }),
        );

        // Extension-only APIs
        reg_unavailable!(
            reg,
            "tab_query",
            "tab_create",
            "tab_activate",
            "tab_close",
            "tab_execute_script",
            "tab_click",
            "tab_fill",
            "tab_snapshot",
            "tab_scroll_to",
            "tab_evaluate",
            "tab_type",
            "tab_press",
            "tab_select",
            "tab_check",
            "tab_hover",
            "tab_unhover",
            "tab_scroll",
            "tab_dblclick",
            "tab_back",
            "tab_wait_for_load",
            "tab_fetch",
            "cookies_get",
            "cookies_set",
            "cookies_delete",
            "cookies_list",
            "history_search",
            "history_delete",
            "bookmarks_search",
            "bookmarks_create",
            "bookmarks_delete",
            "notifications_create",
            "notifications_clear",
            "clipboard_read",
            "clipboard_write",
            "chrome_runtime_sendMessage",
            "chrome_tabs_query",
            "chrome_tabs_create",
            "chrome_tabs_update",
            "chrome_tabs_remove",
            "chrome_tabs_get",
            "chrome_tabs_reload",
            "chrome_tabs_sendMessage",
            "chrome_alarms_create",
            "chrome_alarms_clear",
            "chrome_action_setBadgeText",
            "chrome_action_setBadgeBackgroundColor",
            "chrome_action_setTitle",
            "chrome_action_setIcon",
            "chrome_contextMenus_create",
            "chrome_contextMenus_remove",
            "chrome_windows_getAll",
            "chrome_windows_create",
            "chrome_windows_update",
            "chrome_windows_remove",
            "chrome_sidePanel_setOptions",
            "chrome_cookies_get",
            "chrome_cookies_set",
            "chrome_cookies_remove",
            "chrome_cookies_getAll",
            "chrome_bookmarks_search",
            "chrome_bookmarks_create",
            "chrome_bookmarks_remove",
            "chrome_history_search",
            "chrome_history_deleteUrl",
            "chrome_notifications_create",
            "chrome_notifications_clear",
            "chrome_scripting_executeScript",
            "page_close",
            "page_active_tab",
            "page_tabs",
            "page_switch",
            "page_new_tab",
            "runtime_inspect",
            "url_parse",
            "url_encode",
            "web_log",
        );
    });
}
