use crate::{Callback, CallbackReturn, Context, FromValue, IntoValue, String, Table, Value};

pub fn load_string<'gc>(ctx: Context<'gc>) {
    let string = Table::new(&ctx);

    string.set_field(
        ctx,
        "len",
        Callback::from_fn(&ctx, |ctx, _, mut stack| {
            let string = stack.consume::<String>(ctx)?;
            let len = string.len();
            stack.replace(ctx, len);
            Ok(CallbackReturn::Return)
        }),
    );

    string.set_field(
        ctx,
        "byte",
        Callback::from_fn(&ctx, |ctx, _, mut stack| {
            let (string, i, j) = stack.consume::<(String, Option<i64>, Option<i64>)>(ctx)?;
            let i = i.unwrap_or(1);
            let substr = sub(string.as_bytes(), i, j.or(Some(i)))?;
            stack.extend(substr.iter().map(|b| Value::Integer(i64::from(*b))));
            Ok(CallbackReturn::Return)
        }),
    );

    string.set_field(
        ctx,
        "char",
        Callback::from_fn(&ctx, |ctx, _, mut stack| {
            let string = ctx.intern(
                &stack
                    .into_iter()
                    .map(|c| u8::from_value(ctx, c))
                    .collect::<Result<Vec<_>, _>>()?,
            );
            stack.replace(ctx, string);
            Ok(CallbackReturn::Return)
        }),
    );

    string.set_field(
        ctx,
        "sub",
        Callback::from_fn(&ctx, |ctx, _, mut stack| {
            let (string, i, j) = stack.consume::<(String, i64, Option<i64>)>(ctx)?;
            let substr = ctx.intern(sub(string.as_bytes(), i, j)?);
            stack.replace(ctx, substr);
            Ok(CallbackReturn::Return)
        }),
    );

    string.set_field(
        ctx,
        "lower",
        Callback::from_fn(&ctx, |ctx, _, mut stack| {
            let string = stack.consume::<String>(ctx)?;
            let lowered = ctx.intern(
                &string
                    .as_bytes()
                    .iter()
                    .map(u8::to_ascii_lowercase)
                    .collect::<Vec<_>>(),
            );
            stack.replace(ctx, lowered);
            Ok(CallbackReturn::Return)
        }),
    );

    string.set_field(
        ctx,
        "reverse",
        Callback::from_fn(&ctx, |ctx, _, mut stack| {
            let string = stack.consume::<String>(ctx)?;
            let reversed = ctx.intern(&string.as_bytes().iter().copied().rev().collect::<Vec<_>>());
            stack.replace(ctx, reversed);
            Ok(CallbackReturn::Return)
        }),
    );

    string.set_field(
        ctx,
        "upper",
        Callback::from_fn(&ctx, |ctx, _, mut stack| {
            let string = stack.consume::<String>(ctx)?;
            let uppered = ctx.intern(
                &string
                    .as_bytes()
                    .iter()
                    .map(u8::to_ascii_uppercase)
                    .collect::<Vec<_>>(),
            );
            stack.replace(ctx, uppered);
            Ok(CallbackReturn::Return)
        }),
    );

    string.set_field(
        ctx,
        "rep",
        Callback::from_fn(&ctx, |ctx, _, mut stack| {
            let (s, n, sep): (String, i64, Option<String>) = stack.consume(ctx)?;
            let n = n.max(0) as usize;
            let s_bytes = s.as_bytes();
            let sep_bytes: Vec<u8> = sep
                .as_ref()
                .map(|x| x.as_bytes().to_vec())
                .unwrap_or_default();
            let mut out = Vec::new();
            for i in 0..n {
                if i > 0 && !sep_bytes.is_empty() {
                    out.extend_from_slice(&sep_bytes);
                }
                out.extend_from_slice(s_bytes);
            }
            let result = std::string::String::from_utf8_lossy(&out);
            stack.replace(ctx, ctx.intern(result.as_bytes()));
            Ok(CallbackReturn::Return)
        }),
    );

    string.set_field(
        ctx,
        "find",
        Callback::from_fn(&ctx, |ctx, _, mut stack| {
            let (haystack, needle, init, _plain): (String, String, Option<i64>, Option<bool>) =
                stack.consume(ctx)?;
            let init = init.unwrap_or(1);
            let haystack_bytes = haystack.as_bytes();
            let start = if init > 1 {
                (init - 1) as usize
            } else if init < 0 {
                let abs = init.unsigned_abs() as usize;
                haystack_bytes.len().saturating_sub(abs)
            } else {
                0
            };
            let start = start.min(haystack_bytes.len());
            let substr = &haystack_bytes[start..];
            let needle_bytes = needle.as_bytes();
            if needle_bytes.is_empty() {
                stack.clear();
                stack.push_back(((start as i64) + 1).into());
                stack.push_back((start as i64).into());
            } else if let Some(pos) = substr
                .windows(needle_bytes.len())
                .position(|w| w == needle_bytes)
            {
                let found_start = (start + pos + 1) as i64;
                let found_end = (start + pos + needle_bytes.len()) as i64;
                stack.clear();
                stack.push_back(found_start.into());
                stack.push_back(found_end.into());
            } else {
                stack.replace(ctx, Value::Nil);
            }
            Ok(CallbackReturn::Return)
        }),
    );

    string.set_field(
        ctx,
        "format",
        Callback::from_fn(&ctx, |ctx, _, mut stack| {
            let fmt_str = if !stack.is_empty() {
                match stack.get(0) {
                    Value::String(s) => {
                        std::string::String::from_utf8_lossy(s.as_bytes()).to_string()
                    }
                    _ => {
                        return Err("bad argument #1 to 'format' (string expected)"
                            .into_value(ctx)
                            .into())
                    }
                }
            } else {
                return Err("missing argument #1 to 'format'".into_value(ctx).into());
            };
            let args: Vec<Value> = (1..stack.len()).map(|i| stack.get(i)).collect();
            match format_lua(fmt_str.as_bytes(), &args) {
                Ok(result) => {
                    stack.replace(ctx, ctx.intern(result.as_bytes()));
                    Ok(CallbackReturn::Return)
                }
                Err(msg) => Err(msg.into_value(ctx).into()),
            }
        }),
    );

    ctx.set_global("string", string);
}

fn format_lua(fmt: &[u8], args: &[Value]) -> Result<std::string::String, std::string::String> {
    let mut result = Vec::new();
    let mut arg_idx = 0;
    let mut i = 0;
    while i < fmt.len() {
        if fmt[i] == b'%' && i + 1 < fmt.len() {
            let spec = fmt[i + 1];
            match spec {
                b'%' => result.push(b'%'),
                b's' => {
                    let arg = args.get(arg_idx).ok_or("missing argument")?;
                    let s = match arg {
                        Value::String(s) => {
                            std::string::String::from_utf8_lossy(s.as_bytes()).to_string()
                        }
                        Value::Nil => "nil".to_string(),
                        Value::Boolean(b) => b.to_string(),
                        Value::Integer(n) => n.to_string(),
                        Value::Number(f) => f.to_string(),
                        _ => return Err("bad argument to 'format'".to_string()),
                    };
                    result.extend_from_slice(s.as_bytes());
                    arg_idx += 1;
                }
                b'd' | b'i' => {
                    let arg = args.get(arg_idx).ok_or("missing argument")?;
                    let n = match arg {
                        Value::Integer(i) => format!("{}", i),
                        Value::Number(f) => format!("{:.0}", f),
                        _ => return Err("bad argument to 'format'".to_string()),
                    };
                    result.extend_from_slice(n.as_bytes());
                    arg_idx += 1;
                }
                b'f' => {
                    let arg = args.get(arg_idx).ok_or("missing argument")?;
                    let n = match arg {
                        Value::Integer(i) => format!("{:.6}", *i as f64),
                        Value::Number(f) => format!("{}", f),
                        _ => return Err("bad argument to 'format'".to_string()),
                    };
                    result.extend_from_slice(n.as_bytes());
                    arg_idx += 1;
                }
                b'x' => {
                    let arg = args.get(arg_idx).ok_or("missing argument")?;
                    let n = match arg {
                        Value::Integer(i) => format!("{:x}", i),
                        Value::Number(f) => format!("{:x}", *f as i64),
                        _ => return Err("bad argument to 'format'".to_string()),
                    };
                    result.extend_from_slice(n.as_bytes());
                    arg_idx += 1;
                }
                b'X' => {
                    let arg = args.get(arg_idx).ok_or("missing argument")?;
                    let n = match arg {
                        Value::Integer(i) => format!("{:X}", i),
                        Value::Number(f) => format!("{:X}", *f as i64),
                        _ => return Err("bad argument to 'format'".to_string()),
                    };
                    result.extend_from_slice(n.as_bytes());
                    arg_idx += 1;
                }
                b'q' => {
                    let arg = args.get(arg_idx).ok_or("missing argument")?;
                    let mut quoted = std::string::String::from("\"");
                    match arg {
                        Value::String(s) => {
                            for &b in s.as_bytes() {
                                match b {
                                    b'"' => quoted.push_str("\\\""),
                                    b'\\' => quoted.push_str("\\\\"),
                                    b'\n' => quoted.push_str("\\n"),
                                    b'\r' => quoted.push_str("\\r"),
                                    b'\t' => quoted.push_str("\\t"),
                                    0..=31 => quoted.push_str(&format!("\\{:03o}", b)),
                                    _ => quoted.push(b as char),
                                }
                            }
                        }
                        _ => return Err("bad argument to 'format'".to_string()),
                    }
                    quoted.push('"');
                    result.extend_from_slice(quoted.as_bytes());
                    arg_idx += 1;
                }
                _ => return Err("invalid format specifier".to_string()),
            }
            i += 2;
        } else {
            result.push(fmt[i]);
            i += 1;
        }
    }
    Ok(std::string::String::from_utf8_lossy(&result).to_string())
}

fn sub(string: &[u8], i: i64, j: Option<i64>) -> Result<&[u8], std::num::TryFromIntError> {
    let i = match i {
        i if i > 0 => i.saturating_sub(1).try_into()?,
        0 => 0,
        i => string.len().saturating_sub(i.unsigned_abs().try_into()?),
    };
    let j = if let Some(j) = j {
        if j >= 0 {
            j.try_into()?
        } else {
            let j: usize = j.unsigned_abs().try_into()?;
            string.len().saturating_sub(j.saturating_sub(1))
        }
    } else {
        string.len()
    }
    .clamp(0, string.len());

    Ok(if i >= j || i >= string.len() {
        &[]
    } else {
        &string[i..j]
    })
}
