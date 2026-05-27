use crate::state::HostState;
use crate::types::AsyncCommand;
use piccolo::{Callback, CallbackReturn, Context, IntoValue, Table, Value};
use std::cell::RefCell;
use std::rc::Rc;

pub(crate) fn register<'a>(ctx: Context<'a>, host_state: Rc<RefCell<HostState>>) -> Table<'a> {
    let fs_table = Table::new(&ctx);

    // Helper: build a single-string callback with named field
    let make_1str_cb = |name: &'static str,
                        action: &'static str,
                        field: &'static str,
                        hs: Rc<RefCell<HostState>>|
     -> Callback<'_> {
        Callback::from_fn(&ctx, move |ctx, _exec, mut stack| {
            let val = if !stack.is_empty() {
                match stack.get(0) {
                    Value::String(s) => String::from_utf8_lossy(s.as_bytes()).to_string(),
                    other => {
                        let msg = format!(
                            "fs.{} expects {} as string, got {}",
                            name,
                            field,
                            other.type_name()
                        );
                        return Err(msg.into_value(ctx).into());
                    }
                }
            } else {
                let msg = format!("fs.{} requires a {} argument", name, field);
                return Err(msg.into_value(ctx).into());
            };

            let params = serde_json::json!({ field: val });

            let mut hs = hs.borrow_mut();
            hs.async_call_counter += 1;
            let call_id = hs.async_call_counter;
            let command = AsyncCommand {
                call_id,
                action: crate::action::Action::from(action),
                params,
            };
            hs.pending_async_command = Some(command);

            stack.clear();
            Ok(CallbackReturn::Yield {
                to_thread: None,
                then: None,
            })
        })
    };

    // Helper: build a 2-string callback with named fields
    let make_2str_cb = |name: &'static str,
                        action: &'static str,
                        field1: &'static str,
                        field2: &'static str,
                        hs: Rc<RefCell<HostState>>|
     -> Callback<'_> {
        Callback::from_fn(&ctx, move |ctx, _exec, mut stack| {
            let a = if !stack.is_empty() {
                match stack.get(0) {
                    Value::String(s) => String::from_utf8_lossy(s.as_bytes()).to_string(),
                    other => {
                        let msg = format!(
                            "fs.{} expects {} as string, got {}",
                            name,
                            field1,
                            other.type_name()
                        );
                        return Err(msg.into_value(ctx).into());
                    }
                }
            } else {
                let msg = format!("fs.{} requires a {} argument", name, field1);
                return Err(msg.into_value(ctx).into());
            };

            let b = if stack.len() > 1 {
                match stack.get(1) {
                    Value::String(s) => String::from_utf8_lossy(s.as_bytes()).to_string(),
                    other => {
                        let msg = format!(
                            "fs.{} expects {} as string, got {}",
                            name,
                            field2,
                            other.type_name()
                        );
                        return Err(msg.into_value(ctx).into());
                    }
                }
            } else {
                let msg = format!("fs.{} requires a {} argument", name, field2);
                return Err(msg.into_value(ctx).into());
            };

            let params = serde_json::json!({ field1: a, field2: b });

            let mut hs = hs.borrow_mut();
            hs.async_call_counter += 1;
            let call_id = hs.async_call_counter;
            let command = AsyncCommand {
                call_id,
                action: crate::action::Action::from(action),
                params,
            };
            hs.pending_async_command = Some(command);

            stack.clear();
            Ok(CallbackReturn::Yield {
                to_thread: None,
                then: None,
            })
        })
    };

    // ── fs.exists(path) ──
    {
        let cb = make_1str_cb("exists", "fs_exists", "path", host_state.clone());
        fs_table.set_field(ctx, "exists", cb);
        crate::lua_api_doc!(
            namespace: "fs",
            name: "exists",
            action: "fs_exists",
            doc: "Check whether a path exists in the virtual filesystem.",
            params: [
                path: "string", required, "Absolute VFS path",
            ],
            returns: "boolean" => "true if the path exists",
        );
    }

    // ── fs.stat(path) ──
    {
        let cb = make_1str_cb("stat", "fs_stat", "path", host_state.clone());
        fs_table.set_field(ctx, "stat", cb);
        crate::lua_api_doc!(
            namespace: "fs",
            name: "stat",
            action: "fs_stat",
            doc: "Get metadata for a path.",
            params: [
                path: "string", required, "Absolute VFS path",
            ],
            returns: "table | nil" => "Metadata object or nil if not found",
        );
    }

    // ── fs.list(path) ──
    {
        let cb = make_1str_cb("list", "fs_list", "path", host_state.clone());
        fs_table.set_field(ctx, "list", cb);
        crate::lua_api_doc!(
            namespace: "fs",
            name: "list",
            action: "fs_list",
            doc: "List entries in a directory.",
            params: [
                path: "string", required, "Absolute VFS directory path",
            ],
            returns: "table" => "Array of DirEntry tables",
        );
    }

    // ── fs.mkdir(path) ──
    {
        let cb = make_1str_cb("mkdir", "fs_mkdir", "path", host_state.clone());
        fs_table.set_field(ctx, "mkdir", cb);
        crate::lua_api_doc!(
            namespace: "fs",
            name: "mkdir",
            action: "fs_mkdir",
            doc: "Create a directory (and parents if needed).",
            params: [
                path: "string", required, "Absolute VFS directory path",
            ],
            returns: "boolean" => "true on success",
        );
    }

    // ── fs.delete(path) ──
    {
        let cb = make_1str_cb("delete", "fs_delete", "path", host_state.clone());
        fs_table.set_field(ctx, "delete", cb);
        crate::lua_api_doc!(
            namespace: "fs",
            name: "delete",
            action: "fs_delete",
            doc: "Delete a file or directory (recursive for directories).",
            params: [
                path: "string", required, "Absolute VFS path to delete",
            ],
            returns: "boolean" => "true on success",
        );
    }

    // ── fs.copy(from, to) ──
    {
        let cb = make_2str_cb("copy", "fs_copy", "from", "to", host_state.clone());
        fs_table.set_field(ctx, "copy", cb);
        crate::lua_api_doc!(
            namespace: "fs",
            name: "copy",
            action: "fs_copy",
            doc: "Copy a file from one path to another.",
            params: [
                from: "string", required, "Source absolute VFS path",
                to: "string", required, "Destination absolute VFS path",
            ],
            returns: "boolean" => "true on success",
        );
    }

    // ── fs.move(from, to) ──
    {
        let cb = make_2str_cb("move", "fs_move", "from", "to", host_state.clone());
        fs_table.set_field(ctx, "move", cb);
        crate::lua_api_doc!(
            namespace: "fs",
            name: "move",
            action: "fs_move",
            doc: "Move (rename) a file from one path to another.",
            params: [
                from: "string", required, "Source absolute VFS path",
                to: "string", required, "Destination absolute VFS path",
            ],
            returns: "boolean" => "true on success",
        );
    }

    // ── fs.read(path) ── (returns base64 over the wire; executor decodes)
    {
        let cb = make_1str_cb("read", "fs_read", "path", host_state.clone());
        fs_table.set_field(ctx, "read", cb);
        crate::lua_api_doc!(
            namespace: "fs",
            name: "read",
            action: "fs_read",
            doc: "Read raw bytes from a file. Returns base64-encoded string over the async wire.",
            params: [
                path: "string", required, "Absolute VFS file path",
            ],
            returns: "string" => "Base64-encoded file contents",
        );
    }

    // ── fs.read_text(path) ──
    {
        let cb = make_1str_cb("read_text", "fs_read_text", "path", host_state.clone());
        fs_table.set_field(ctx, "read_text", cb);
        crate::lua_api_doc!(
            namespace: "fs",
            name: "read_text",
            action: "fs_read_text",
            doc: "Read a file as UTF-8 text.",
            params: [
                path: "string", required, "Absolute VFS file path",
            ],
            returns: "string | nil" => "File contents or nil",
        );
    }

    // ── fs.read_base64(path) ──
    {
        let cb = make_1str_cb("read_base64", "fs_read_base64", "path", host_state.clone());
        fs_table.set_field(ctx, "read_base64", cb);
        crate::lua_api_doc!(
            namespace: "fs",
            name: "read_base64",
            action: "fs_read_base64",
            doc: "Read a file and return its contents as base64.",
            params: [
                path: "string", required, "Absolute VFS file path",
            ],
            returns: "string | nil" => "Base64-encoded contents or nil",
        );
    }

    // ── fs.read_range(path, offset, len) ──
    {
        let hs = host_state.clone();
        let cb = Callback::from_fn(&ctx, move |ctx, _exec, mut stack| {
            let path = if !stack.is_empty() {
                match stack.get(0) {
                    Value::String(s) => String::from_utf8_lossy(s.as_bytes()).to_string(),
                    other => {
                        let msg = format!(
                            "fs.read_range expects path as string, got {}",
                            other.type_name()
                        );
                        return Err(msg.into_value(ctx).into());
                    }
                }
            } else {
                let msg = "fs.read_range requires a path argument".to_string();
                return Err(msg.into_value(ctx).into());
            };

            let offset = if stack.len() > 1 {
                match stack.get(1) {
                    Value::Integer(i) => i as u64,
                    Value::Number(f) => f as u64,
                    other => {
                        let msg = format!(
                            "fs.read_range expects offset as number, got {}",
                            other.type_name()
                        );
                        return Err(msg.into_value(ctx).into());
                    }
                }
            } else {
                let msg = "fs.read_range requires an offset argument".to_string();
                return Err(msg.into_value(ctx).into());
            };

            let len = if stack.len() > 2 {
                match stack.get(2) {
                    Value::Integer(i) => i as usize,
                    Value::Number(f) => f as usize,
                    other => {
                        let msg = format!(
                            "fs.read_range expects len as number, got {}",
                            other.type_name()
                        );
                        return Err(msg.into_value(ctx).into());
                    }
                }
            } else {
                let msg = "fs.read_range requires a len argument".to_string();
                return Err(msg.into_value(ctx).into());
            };

            let params = serde_json::json!({ "path": path, "offset": offset, "len": len });
            let _validated: crate::command_params::FsReadRangeParams =
                match serde_json::from_value(params.clone()) {
                    Ok(v) => v,
                    Err(e) => {
                        let msg = format!("Invalid fs.read_range params built from Lua: {}", e);
                        return Err(msg.into_value(ctx).into());
                    }
                };

            let mut hs = hs.borrow_mut();
            hs.async_call_counter += 1;
            let call_id = hs.async_call_counter;
            let command = AsyncCommand {
                call_id,
                action: crate::action::Action::FsReadRange,
                params,
            };
            hs.pending_async_command = Some(command);

            stack.clear();
            Ok(CallbackReturn::Yield {
                to_thread: None,
                then: None,
            })
        });
        fs_table.set_field(ctx, "read_range", cb);
        crate::lua_api_doc!(
            namespace: "fs",
            name: "read_range",
            action: "fs_read_range",
            doc: "Read a byte range from a file.",
            params: [
                path: "string", required, "Absolute VFS file path",
                offset: "number", required, "Byte offset to start reading",
                len: "number", required, "Number of bytes to read",
            ],
            returns: "string" => "Base64-encoded range contents",
        );
    }

    // ── fs.write(path, data) — manual callback for binary data ──
    {
        let hs_write = host_state.clone();
        let write_cb = Callback::from_fn(&ctx, move |ctx, _exec, mut stack| {
            let path = if !stack.is_empty() {
                match stack.get(0) {
                    Value::String(s) => String::from_utf8_lossy(s.as_bytes()).to_string(),
                    other => {
                        let msg =
                            format!("fs.write expects path as string, got {}", other.type_name());
                        return Err(msg.into_value(ctx).into());
                    }
                }
            } else {
                let msg = "fs.write requires a path argument".to_string();
                return Err(msg.into_value(ctx).into());
            };

            let data = if stack.len() > 1 {
                match stack.get(1) {
                    Value::String(s) => data_encoding::BASE64.encode(s.as_bytes()),
                    other => {
                        let msg =
                            format!("fs.write expects string data, got {}", other.type_name());
                        return Err(msg.into_value(ctx).into());
                    }
                }
            } else {
                let msg = "fs.write requires a data argument".to_string();
                return Err(msg.into_value(ctx).into());
            };

            let params = serde_json::json!({ "path": path, "data": data });
            let _validated: crate::command_params::FsWriteParams =
                match serde_json::from_value(params.clone()) {
                    Ok(v) => v,
                    Err(e) => {
                        let msg = format!("Invalid fs.write params built from Lua: {}", e);
                        return Err(msg.into_value(ctx).into());
                    }
                };

            let mut hs = hs_write.borrow_mut();
            hs.async_call_counter += 1;
            let call_id = hs.async_call_counter;
            let command = AsyncCommand {
                call_id,
                action: crate::action::Action::FsWrite,
                params,
            };
            hs.pending_async_command = Some(command);

            stack.clear();
            Ok(CallbackReturn::Yield {
                to_thread: None,
                then: None,
            })
        });
        fs_table.set_field(ctx, "write", write_cb);
        crate::lua_api_doc!(
            namespace: "fs",
            name: "write",
            action: "fs_write",
            doc: "Write raw bytes to a file (overwrites existing). Data is base64-encoded over the wire.",
            params: [
                path: "string", required, "Absolute VFS file path",
                data: "string", required, "Raw byte string to write",
            ],
            returns: "boolean" => "true on success",
        );
    }

    // ── fs.write_text(path, text) ──
    {
        let cb = make_2str_cb(
            "write_text",
            "fs_write_text",
            "path",
            "data",
            host_state.clone(),
        );
        fs_table.set_field(ctx, "write_text", cb);
        crate::lua_api_doc!(
            namespace: "fs",
            name: "write_text",
            action: "fs_write_text",
            doc: "Write UTF-8 text to a file (overwrites existing).",
            params: [
                path: "string", required, "Absolute VFS file path",
                text: "string", required, "Text to write",
            ],
            returns: "boolean" => "true on success",
        );
    }

    // ── fs.write_base64(path, b64) ──
    {
        let cb = make_2str_cb(
            "write_base64",
            "fs_write_base64",
            "path",
            "data",
            host_state.clone(),
        );
        fs_table.set_field(ctx, "write_base64", cb);
        crate::lua_api_doc!(
            namespace: "fs",
            name: "write_base64",
            action: "fs_write_base64",
            doc: "Write base64-decoded bytes to a file (overwrites existing).",
            params: [
                path: "string", required, "Absolute VFS file path",
                b64: "string", required, "Base64-encoded data",
            ],
            returns: "boolean" => "true on success",
        );
    }

    // ── fs.append(path, data) — manual callback for binary data ──
    {
        let hs_append = host_state.clone();
        let append_cb = Callback::from_fn(&ctx, move |ctx, _exec, mut stack| {
            let path = if !stack.is_empty() {
                match stack.get(0) {
                    Value::String(s) => String::from_utf8_lossy(s.as_bytes()).to_string(),
                    other => {
                        let msg = format!(
                            "fs.append expects path as string, got {}",
                            other.type_name()
                        );
                        return Err(msg.into_value(ctx).into());
                    }
                }
            } else {
                let msg = "fs.append requires a path argument".to_string();
                return Err(msg.into_value(ctx).into());
            };

            let data = if stack.len() > 1 {
                match stack.get(1) {
                    Value::String(s) => data_encoding::BASE64.encode(s.as_bytes()),
                    other => {
                        let msg =
                            format!("fs.append expects string data, got {}", other.type_name());
                        return Err(msg.into_value(ctx).into());
                    }
                }
            } else {
                let msg = "fs.append requires a data argument".to_string();
                return Err(msg.into_value(ctx).into());
            };

            let params = serde_json::json!({ "path": path, "data": data });
            let _validated: crate::command_params::FsWriteParams =
                match serde_json::from_value(params.clone()) {
                    Ok(v) => v,
                    Err(e) => {
                        let msg = format!("Invalid fs.append params built from Lua: {}", e);
                        return Err(msg.into_value(ctx).into());
                    }
                };

            let mut hs = hs_append.borrow_mut();
            hs.async_call_counter += 1;
            let call_id = hs.async_call_counter;
            let command = AsyncCommand {
                call_id,
                action: crate::action::Action::FsAppend,
                params,
            };
            hs.pending_async_command = Some(command);

            stack.clear();
            Ok(CallbackReturn::Yield {
                to_thread: None,
                then: None,
            })
        });
        fs_table.set_field(ctx, "append", append_cb);
        crate::lua_api_doc!(
            namespace: "fs",
            name: "append",
            action: "fs_append",
            doc: "Append raw bytes to a file. Data is base64-encoded over the wire.",
            params: [
                path: "string", required, "Absolute VFS file path",
                data: "string", required, "Raw byte string to append",
            ],
            returns: "boolean" => "true on success",
        );
    }

    // ── fs.append_text(path, text) ──
    {
        let cb = make_2str_cb(
            "append_text",
            "fs_append_text",
            "path",
            "data",
            host_state.clone(),
        );
        fs_table.set_field(ctx, "append_text", cb);
        crate::lua_api_doc!(
            namespace: "fs",
            name: "append_text",
            action: "fs_append_text",
            doc: "Append UTF-8 text to a file.",
            params: [
                path: "string", required, "Absolute VFS file path",
                text: "string", required, "Text to append",
            ],
            returns: "boolean" => "true on success",
        );
    }

    // ── fs.append_base64(path, b64) ──
    {
        let cb = make_2str_cb(
            "append_base64",
            "fs_append_base64",
            "path",
            "data",
            host_state.clone(),
        );
        fs_table.set_field(ctx, "append_base64", cb);
        crate::lua_api_doc!(
            namespace: "fs",
            name: "append_base64",
            action: "fs_append_base64",
            doc: "Append base64-decoded bytes to a file.",
            params: [
                path: "string", required, "Absolute VFS file path",
                b64: "string", required, "Base64-encoded data",
            ],
            returns: "boolean" => "true on success",
        );
    }

    // ── fs.update(path, offset, data) — manual callback for binary data ──
    {
        let hs_update = host_state.clone();
        let update_cb = Callback::from_fn(&ctx, move |ctx, _exec, mut stack| {
            let path = if !stack.is_empty() {
                match stack.get(0) {
                    Value::String(s) => String::from_utf8_lossy(s.as_bytes()).to_string(),
                    other => {
                        let msg = format!(
                            "fs.update expects path as string, got {}",
                            other.type_name()
                        );
                        return Err(msg.into_value(ctx).into());
                    }
                }
            } else {
                let msg = "fs.update requires a path argument".to_string();
                return Err(msg.into_value(ctx).into());
            };

            let offset = if stack.len() > 1 {
                match stack.get(1) {
                    Value::Integer(i) => i as u64,
                    Value::Number(f) => f as u64,
                    other => {
                        let msg = format!(
                            "fs.update expects offset as number, got {}",
                            other.type_name()
                        );
                        return Err(msg.into_value(ctx).into());
                    }
                }
            } else {
                let msg = "fs.update requires an offset argument".to_string();
                return Err(msg.into_value(ctx).into());
            };

            let data = if stack.len() > 2 {
                match stack.get(2) {
                    Value::String(s) => data_encoding::BASE64.encode(s.as_bytes()),
                    other => {
                        let msg =
                            format!("fs.update expects string data, got {}", other.type_name());
                        return Err(msg.into_value(ctx).into());
                    }
                }
            } else {
                let msg = "fs.update requires a data argument".to_string();
                return Err(msg.into_value(ctx).into());
            };

            let params = serde_json::json!({ "path": path, "offset": offset, "data": data });
            let _validated: crate::command_params::FsUpdateParams =
                match serde_json::from_value(params.clone()) {
                    Ok(v) => v,
                    Err(e) => {
                        let msg = format!("Invalid fs.update params built from Lua: {}", e);
                        return Err(msg.into_value(ctx).into());
                    }
                };

            let mut hs = hs_update.borrow_mut();
            hs.async_call_counter += 1;
            let call_id = hs.async_call_counter;
            let command = AsyncCommand {
                call_id,
                action: crate::action::Action::FsUpdate,
                params,
            };
            hs.pending_async_command = Some(command);

            stack.clear();
            Ok(CallbackReturn::Yield {
                to_thread: None,
                then: None,
            })
        });
        fs_table.set_field(ctx, "update", update_cb);
        crate::lua_api_doc!(
            namespace: "fs",
            name: "update",
            action: "fs_update",
            doc: "Write raw bytes at a specific offset in a file. Data is base64-encoded over the wire.",
            params: [
                path: "string", required, "Absolute VFS file path",
                offset: "number", required, "Byte offset",
                data: "string", required, "Raw byte string to write",
            ],
            returns: "boolean" => "true on success",
        );
    }

    // ── fs.hash(path, algo) ──
    {
        let hs = host_state.clone();
        let cb = Callback::from_fn(&ctx, move |ctx, _exec, mut stack| {
            let path = if !stack.is_empty() {
                match stack.get(0) {
                    Value::String(s) => String::from_utf8_lossy(s.as_bytes()).to_string(),
                    other => {
                        let msg =
                            format!("fs.hash expects path as string, got {}", other.type_name());
                        return Err(msg.into_value(ctx).into());
                    }
                }
            } else {
                let msg = "fs.hash requires a path argument".to_string();
                return Err(msg.into_value(ctx).into());
            };

            let algo = if stack.len() > 1 {
                match stack.get(1) {
                    Value::String(s) => String::from_utf8_lossy(s.as_bytes()).to_string(),
                    other => {
                        let msg =
                            format!("fs.hash expects algo as string, got {}", other.type_name());
                        return Err(msg.into_value(ctx).into());
                    }
                }
            } else {
                let msg = "fs.hash requires an algo argument".to_string();
                return Err(msg.into_value(ctx).into());
            };

            let params = serde_json::json!({ "path": path, "algo": algo });
            let _validated: crate::command_params::FsHashParams =
                match serde_json::from_value(params.clone()) {
                    Ok(v) => v,
                    Err(e) => {
                        let msg = format!("Invalid fs.hash params built from Lua: {}", e);
                        return Err(msg.into_value(ctx).into());
                    }
                };

            let mut hs = hs.borrow_mut();
            hs.async_call_counter += 1;
            let call_id = hs.async_call_counter;
            let command = AsyncCommand {
                call_id,
                action: crate::action::Action::FsHash,
                params,
            };
            hs.pending_async_command = Some(command);

            stack.clear();
            Ok(CallbackReturn::Yield {
                to_thread: None,
                then: None,
            })
        });
        fs_table.set_field(ctx, "hash", cb);
        crate::lua_api_doc!(
            namespace: "fs",
            name: "hash",
            action: "fs_hash",
            doc: "Compute a hash of a file's contents.",
            params: [
                path: "string", required, "Absolute VFS file path",
                algo: "string", required, "Hash algorithm (sha256 or sha1)",
            ],
            returns: "string | nil" => "Hex-encoded hash or nil",
        );
    }

    fs_table
}
