use piccolo::{Callback, CallbackReturn, Context, Table, Value};

pub(crate) fn register<'a>(ctx: Context<'a>) {
    let path_table = Table::new(&ctx);

    // ── path.join(...) ───────────────────────────────────────────
    let join_cb = Callback::from_fn(&ctx, move |ctx, _exec, mut stack| {
        let mut segments = Vec::new();
        for i in 0..stack.len() {
            if let Value::String(s) = stack.get(i) {
                let part = String::from_utf8_lossy(s.as_bytes());
                for seg in part.split('/') {
                    if !seg.is_empty() {
                        segments.push(seg.to_string());
                    }
                }
            }
        }
        let result = format!("/{}", segments.join("/"));
        stack.clear();
        stack.push_back(ctx.intern(result.as_bytes()).into());
        Ok(CallbackReturn::Return)
    });
    lua_api_custom!(
        ctx,
        path_table,
        name: "join",
        callback: join_cb,
        namespace: "path",
        action: "",
        doc: "Join path segments into an absolute VFS path.",
        params: [parts: "string", required, "Path segments to join"],
        returns: "string" => "Joined absolute path"
    );

    // ── path.basename(p) ───────────────────────────────────────
    let basename_cb = Callback::from_fn(&ctx, move |ctx, _exec, mut stack| {
        let result = if !stack.is_empty() {
            match stack.get(0) {
                Value::String(s) => {
                    let p = String::from_utf8_lossy(s.as_bytes());
                    p.split('/')
                        .filter(|s| !s.is_empty())
                        .last()
                        .unwrap_or("")
                        .to_string()
                }
                _ => "".to_string(),
            }
        } else {
            "".to_string()
        };
        stack.clear();
        stack.push_back(ctx.intern(result.as_bytes()).into());
        Ok(CallbackReturn::Return)
    });
    lua_api_custom!(
        ctx,
        path_table,
        name: "basename",
        callback: basename_cb,
        namespace: "path",
        action: "",
        doc: "Get the last component of a path.",
        params: [path: "string", required, "Absolute VFS path"],
        returns: "string" => "File or directory name"
    );

    // ── path.dirname(p) ────────────────────────────────────────
    let dirname_cb = Callback::from_fn(&ctx, move |ctx, _exec, mut stack| {
        let result = if !stack.is_empty() {
            match stack.get(0) {
                Value::String(s) => {
                    let p = String::from_utf8_lossy(s.as_bytes());
                    if let Some(last_slash) = p.rfind('/') {
                        if last_slash == 0 {
                            "/".to_string()
                        } else {
                            p[..last_slash].to_string()
                        }
                    } else {
                        "/".to_string()
                    }
                }
                _ => "/".to_string(),
            }
        } else {
            "/".to_string()
        };
        stack.clear();
        stack.push_back(ctx.intern(result.as_bytes()).into());
        Ok(CallbackReturn::Return)
    });
    lua_api_custom!(
        ctx,
        path_table,
        name: "dirname",
        callback: dirname_cb,
        namespace: "path",
        action: "",
        doc: "Get the directory portion of a path.",
        params: [path: "string", required, "Absolute VFS path"],
        returns: "string" => "Parent directory path"
    );

    // ── path.extname(p) ────────────────────────────────────────
    // Node.js semantics: dotfiles like ".gitignore" return ""
    let extname_cb = Callback::from_fn(&ctx, move |ctx, _exec, mut stack| {
        let result = if !stack.is_empty() {
            match stack.get(0) {
                Value::String(s) => {
                    let p = String::from_utf8_lossy(s.as_bytes());
                    let base = p.rsplit('/').next().unwrap_or("");
                    if base == "." || base == ".." {
                        "".to_string()
                    } else if base.starts_with('.') && base[1..].find('.').is_none() {
                        "".to_string()
                    } else if let Some(dot_pos) = base.rfind('.') {
                        base[dot_pos..].to_string()
                    } else {
                        "".to_string()
                    }
                }
                _ => "".to_string(),
            }
        } else {
            "".to_string()
        };
        stack.clear();
        stack.push_back(ctx.intern(result.as_bytes()).into());
        Ok(CallbackReturn::Return)
    });
    lua_api_custom!(
        ctx,
        path_table,
        name: "extname",
        callback: extname_cb,
        namespace: "path",
        action: "",
        doc: "Get the file extension including the leading dot.",
        params: [path: "string", required, "Absolute VFS path"],
        returns: "string" => "Extension or empty string"
    );

    // ── path.normalize(p) ──────────────────────────────────────
    let normalize_cb = Callback::from_fn(&ctx, move |ctx, _exec, mut stack| {
        let result = if !stack.is_empty() {
            match stack.get(0) {
                Value::String(s) => {
                    let p = String::from_utf8_lossy(s.as_bytes());
                    let mut segments = Vec::new();
                    for seg in p.split('/') {
                        if seg.is_empty() || seg == "." {
                            continue;
                        } else if seg == ".." {
                            if !segments.is_empty() {
                                segments.pop();
                            }
                        } else {
                            segments.push(seg.to_string());
                        }
                    }
                    let mut result = format!("/{}", segments.join("/"));
                    if p.ends_with('/') && !segments.is_empty() {
                        result.push('/');
                    }
                    result
                }
                _ => "/".to_string(),
            }
        } else {
            "/".to_string()
        };
        stack.clear();
        stack.push_back(ctx.intern(result.as_bytes()).into());
        Ok(CallbackReturn::Return)
    });
    lua_api_custom!(
        ctx,
        path_table,
        name: "normalize",
        callback: normalize_cb,
        namespace: "path",
        action: "",
        doc: "Resolve . and .. segments in a path.",
        params: [path: "string", required, "Absolute VFS path"],
        returns: "string" => "Normalized absolute path"
    );

    // ── path.is_absolute(p) ────────────────────────────────────
    let is_absolute_cb = Callback::from_fn(&ctx, move |_ctx, _exec, mut stack| {
        let result = if !stack.is_empty() {
            match stack.get(0) {
                Value::String(s) => {
                    let p = String::from_utf8_lossy(s.as_bytes());
                    p.starts_with('/')
                }
                _ => false,
            }
        } else {
            false
        };
        stack.clear();
        stack.push_back(Value::Boolean(result));
        Ok(CallbackReturn::Return)
    });
    lua_api_custom!(
        ctx,
        path_table,
        name: "is_absolute",
        callback: is_absolute_cb,
        namespace: "path",
        action: "",
        doc: "Check whether a path is absolute (starts with /).",
        params: [path: "string", required, "Path to check"],
        returns: "boolean" => "true if absolute"
    );

    // ── path.sep ───────────────────────────────────────────────
    path_table.set_field(ctx, "sep", ctx.intern(b"/"));

    crate::web::protector::protect_api_table(ctx, path_table, "path");
    ctx.set_global("path", path_table);
}
