use crate::types::*;
use serde_json;
use wasm_bindgen::prelude::*;
use wasm_bindgen_futures::JsFuture;

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

    let global = js_sys::global();

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

    // AbortController for timeout — set up BEFORE creating Request
    let _abort_controller = match js_sys::Reflect::get(&global, &"AbortController".into()) {
        Ok(ac_ctor) if !ac_ctor.is_undefined() => {
            let ac = js_sys::Reflect::construct(
                &ac_ctor.dyn_into::<js_sys::Function>().unwrap(),
                &js_sys::Array::new(),
            )
            .unwrap();
            let signal = js_sys::Reflect::get(&ac, &"signal".into()).unwrap();
            let signal = signal.dyn_ref::<web_sys::AbortSignal>();
            request_init.set_signal(signal);

            // Set up timeout
            let set_timeout = js_sys::Reflect::get(&global, &"setTimeout".into())
                .unwrap()
                .dyn_into::<js_sys::Function>()
                .unwrap();
            let abort_fn = js_sys::Reflect::get(&ac, &"abort".into()).unwrap();
            let _ = set_timeout.call2(&global, &abort_fn, &JsValue::from_f64(timeout as f64));

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

    let fetch_fn = match js_sys::Reflect::get(&global, &"fetch".into()) {
        Ok(f) if !f.is_undefined() => f.dyn_into::<js_sys::Function>().unwrap(),
        _ => {
            return WasmAsyncResponse {
                ok: false,
                value: None,
                error: Some(WasmAsyncError {
                    message: "fetch is not available in this context".into(),
                    code: "E_NO_FETCH".into(),
                }),
            };
        }
    };

    let promise = match fetch_fn.call1(&global, &request) {
        Ok(p) => p.dyn_into::<js_sys::Promise>().unwrap(),
        Err(e) => {
            return WasmAsyncResponse {
                ok: false,
                value: None,
                error: Some(WasmAsyncError {
                    message: format!("Fetch failed: {:?}", e),
                    code: "E_FETCH".into(),
                }),
            };
        }
    };

    let resp = match JsFuture::from(promise).await {
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

    // Read response body as text
    let body = match response.text() {
        Ok(p) => match JsFuture::from(p).await {
            Ok(b) => b.as_string().unwrap_or_default(),
            Err(_) => String::new(),
        },
        Err(_) => String::new(),
    };

    // Read headers
    let headers = js_sys::Object::new();
    let resp_headers = response.headers();
    let entries_fn = js_sys::Reflect::get(&resp_headers, &"entries".into())
        .unwrap()
        .dyn_into::<js_sys::Function>()
        .unwrap();
    let entries_iter = entries_fn.call0(&resp_headers).unwrap();
    // Headers.entries() returns an iterator; for simplicity we skip detailed header parsing
    // and let the consumer read them if needed via the raw JS object
    js_sys::Reflect::set(&headers, &"raw".into(), &entries_iter).ok();

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

/// Sleep: await a JS Promise that resolves after N milliseconds.
pub async fn execute_sleep(params: serde_json::Value) -> WasmAsyncResponse {
    let duration = params.get("duration").and_then(|v| v.as_u64()).unwrap_or(0);

    let global = js_sys::global();
    let promise = js_sys::Promise::new(
        &mut |resolve: js_sys::Function, _reject: js_sys::Function| {
            let set_timeout = js_sys::Reflect::get(&global, &"setTimeout".into())
                .unwrap()
                .dyn_into::<js_sys::Function>()
                .unwrap();
            let _ = set_timeout.call2(&global, &resolve, &JsValue::from_f64(duration as f64));
        },
    );

    let _ = JsFuture::from(promise).await;

    WasmAsyncResponse {
        ok: true,
        value: Some(serde_json::Value::Null),
        error: None,
    }
}
