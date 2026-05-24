//! Cryptography plugin for the notebook runtime.
//!
//! Exposes `crypto` as a Lua global with:
//! - `crypto.sha256(data)` → hex string
//! - `crypto.md5(data)` → hex string
//! - `crypto.hmac_sha256(key, data)` → hex string
//! - `crypto.hex_encode(data)` → hex string
//! - `crypto.hex_decode(hex_string)` → decoded string

use std::cell::RefCell;
use std::rc::Rc;

use hmac::{Hmac, Mac};
use md5::Md5;
use piccolo::{Callback, CallbackReturn, Context, IntoValue, Table, Value};
use piccolo_notebook_core::{HostState, LuaPlugin};
use sha2::{Digest, Sha256};

type HmacSha256 = Hmac<Sha256>;

/// Cryptography plugin exposing hash and HMAC functions to Lua.
pub struct CryptoPlugin;

impl LuaPlugin for CryptoPlugin {
    fn name(&self) -> &str {
        "crypto"
    }

    fn register(&self, ctx: Context, _host_state: Rc<RefCell<HostState>>) {
        let crypto = Table::new(&ctx);

        // crypto.sha256(data) → hex string
        let sha256_cb = Callback::from_fn(&ctx, move |ctx, _exec, mut stack| {
            let input: String = stack_arg_string(ctx, &mut stack, 0, "crypto.sha256")?;
            let hash = Sha256::digest(input.as_bytes());
            let hex_str = hex::encode(hash);
            stack.clear();
            stack.push_back(ctx.intern(hex_str.as_bytes()).into());
            Ok(CallbackReturn::Return)
        });
        crypto.set_field(ctx, "sha256", sha256_cb);

        // crypto.md5(data) → hex string
        let md5_cb = Callback::from_fn(&ctx, move |ctx, _exec, mut stack| {
            let input: String = stack_arg_string(ctx, &mut stack, 0, "crypto.md5")?;
            let hash = Md5::digest(input.as_bytes());
            let hex_str = hex::encode(hash);
            stack.clear();
            stack.push_back(ctx.intern(hex_str.as_bytes()).into());
            Ok(CallbackReturn::Return)
        });
        crypto.set_field(ctx, "md5", md5_cb);

        // crypto.hmac_sha256(key, data) → hex string
        let hmac_cb = Callback::from_fn(&ctx, move |ctx, _exec, mut stack| {
            let key: String = stack_arg_string(ctx, &mut stack, 0, "crypto.hmac_sha256")?;
            let data: String = stack_arg_string(ctx, &mut stack, 1, "crypto.hmac_sha256")?;
            let mut mac = HmacSha256::new_from_slice(key.as_bytes())
                .map_err(|e| -> piccolo::Error { e.to_string().into_value(ctx).into() })?;
            mac.update(data.as_bytes());
            let result = mac.finalize();
            let hex_str = hex::encode(result.into_bytes());
            stack.clear();
            stack.push_back(ctx.intern(hex_str.as_bytes()).into());
            Ok(CallbackReturn::Return)
        });
        crypto.set_field(ctx, "hmac_sha256", hmac_cb);

        // crypto.hex_encode(data) → hex string
        let hex_enc_cb = Callback::from_fn(&ctx, move |ctx, _exec, mut stack| {
            let input: String = stack_arg_string(ctx, &mut stack, 0, "crypto.hex_encode")?;
            let hex_str = hex::encode(input.as_bytes());
            stack.clear();
            stack.push_back(ctx.intern(hex_str.as_bytes()).into());
            Ok(CallbackReturn::Return)
        });
        crypto.set_field(ctx, "hex_encode", hex_enc_cb);

        // crypto.hex_decode(hex_string) → decoded string
        let hex_dec_cb = Callback::from_fn(&ctx, move |ctx, _exec, mut stack| {
            let input: String = stack_arg_string(ctx, &mut stack, 0, "crypto.hex_decode")?;
            let decoded = hex::decode(input.as_str()).map_err(|e| -> piccolo::Error {
                format!("hex_decode error: {}", e).into_value(ctx).into()
            })?;
            let s = String::from_utf8_lossy(&decoded).to_string();
            stack.clear();
            stack.push_back(ctx.intern(s.as_bytes()).into());
            Ok(CallbackReturn::Return)
        });
        crypto.set_field(ctx, "hex_decode", hex_dec_cb);

        ctx.set_global("crypto", crypto);
    }
}

/// Helper: extract a string argument from the stack, returning an owned String.
fn stack_arg_string<'gc>(
    ctx: Context<'gc>,
    stack: &mut piccolo::Stack<'gc, '_>,
    index: usize,
    fn_name: &str,
) -> Result<String, piccolo::Error<'gc>> {
    if stack.len() <= index {
        let msg = format!("{} requires at least {} argument(s)", fn_name, index + 1);
        return Err(msg.into_value(ctx).into());
    }
    match stack.get(index) {
        Value::String(s) => Ok(String::from_utf8_lossy(s.as_bytes()).to_string()),
        other => {
            let msg = format!(
                "{} expects a string at argument {}, got {}",
                fn_name,
                index + 1,
                other.type_name()
            );
            Err(msg.into_value(ctx).into())
        }
    }
}

#[cfg(test)]
mod tests {
    use piccolo_notebook_core::NotebookSession;

    use super::*;

    fn make_session() -> NotebookSession {
        NotebookSession::build()
            .plugin(Box::new(CryptoPlugin))
            .finish()
    }

    #[test]
    fn test_sha256() {
        let mut session = make_session();
        let result = session.run_cell(r#"print(crypto.sha256("hello"))"#, "");
        assert!(result.error.is_none(), "got: {:?}", result.error);
        assert_eq!(
            result.stdout[0],
            "2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824"
        );
    }

    #[test]
    fn test_md5() {
        let mut session = make_session();
        let result = session.run_cell(r#"print(crypto.md5("hello"))"#, "");
        assert!(result.error.is_none(), "got: {:?}", result.error);
        assert_eq!(result.stdout[0], "5d41402abc4b2a76b9719d911017c592");
    }

    #[test]
    fn test_hmac_sha256() {
        let mut session = make_session();
        let result = session.run_cell(r#"print(crypto.hmac_sha256("key", "message"))"#, "");
        assert!(result.error.is_none(), "got: {:?}", result.error);
        assert_eq!(result.stdout[0].len(), 64);
    }

    #[test]
    fn test_hex_encode_decode() {
        let mut session = make_session();
        let result = session.run_cell(
            r#"
            local hex = crypto.hex_encode("Hello")
            print(hex)
            local decoded = crypto.hex_decode(hex)
            print(decoded)
        "#,
            "",
        );
        assert!(result.error.is_none(), "got: {:?}", result.error);
        assert_eq!(result.stdout[0], "48656c6c6f");
        assert_eq!(result.stdout[1], "Hello");
    }

    #[test]
    fn test_hex_decode_invalid() {
        let mut session = make_session();
        let result = session.run_cell(
            r#"
            local ok, err = pcall(function()
                crypto.hex_decode("not valid hex!!!")
            end)
            print("caught:", not ok)
        "#,
            "",
        );
        assert!(result.error.is_none(), "got: {:?}", result.error);
        assert!(
            result.stdout[0].contains("true"),
            "got: {:?}",
            result.stdout
        );
    }

    #[test]
    fn test_crypto_coexists_with_builtins() {
        let mut session = make_session();
        let r1 = session.run_cell(r#"print(json.encode({a = 1}))"#, "");
        assert!(r1.error.is_none());
        let r2 = session.run_cell(r#"print(crypto.sha256("test"):sub(1, 8))"#, "");
        assert!(r2.error.is_none());
    }
}
