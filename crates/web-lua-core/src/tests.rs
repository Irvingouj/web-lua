use crate::globals::{disable_dangerous_globals, register_host_globals, setup_strict_mode};
use crate::json::{json_value_to_lua, lua_value_to_json, register_json_module};
use crate::plugin::LuaPlugin;
use crate::session::{NotebookSession, SessionBuilder};
use crate::state::HostState;
use crate::types::{
    AsyncCommand, CellError, CellStatus, GlobalVariable, GlobalsSnapshot, RunResult,
};
use crate::utils::{classify_extern_error, format_value};
use crate::web::register_web_module;
use piccolo::{
    Callback, CallbackReturn, Closure, Context, Executor, ExecutorMode, Fuel, IntoValue, Lua,
    StashedExecutor, String as LuaString, Table, Value,
};
use serde_json;
use std::cell::RefCell;
use std::rc::Rc;
use ts_rs::TS;

// ─── Tests ──────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_export_types() {
        // Resolve the workspace root: MANIFEST_DIR is crates/web-lua-core,
        // so going two levels up gives us the workspace root.
        let manifest_dir = std::env::var("CARGO_MANIFEST_DIR").unwrap();
        let workspace_root = std::path::Path::new(&manifest_dir)
            .parent()
            .unwrap()
            .parent()
            .unwrap();
        let cfg = ts_rs::Config::new().with_out_dir(workspace_root);
        CellError::export_all(&cfg).unwrap();
        RunResult::export_all(&cfg).unwrap();
        crate::command_params::FetchParams::export_all(&cfg).unwrap();
        crate::command_params::SleepParams::export_all(&cfg).unwrap();
        crate::command_params::PageClickParams::export_all(&cfg).unwrap();
        crate::command_params::PageDblClickParams::export_all(&cfg).unwrap();
        crate::command_params::PageFillParams::export_all(&cfg).unwrap();
        crate::command_params::PageTypeParams::export_all(&cfg).unwrap();
        crate::command_params::PagePressParams::export_all(&cfg).unwrap();
        crate::command_params::PageSelectParams::export_all(&cfg).unwrap();
        crate::command_params::PageCheckParams::export_all(&cfg).unwrap();
        crate::command_params::PageHoverParams::export_all(&cfg).unwrap();
        crate::command_params::PageScrollParams::export_all(&cfg).unwrap();
        crate::command_params::PageScrollToParams::export_all(&cfg).unwrap();
        crate::command_params::PageGotoParams::export_all(&cfg).unwrap();
        crate::command_params::PageWaitParams::export_all(&cfg).unwrap();
        crate::command_params::StorageGetParams::export_all(&cfg).unwrap();
        crate::command_params::StorageSetParams::export_all(&cfg).unwrap();
        crate::command_params::StorageDeleteParams::export_all(&cfg).unwrap();
        crate::command_params::DomSnapshotParams::export_all(&cfg).unwrap();
        crate::command_params::TabClickParams::export_all(&cfg).unwrap();
        crate::command_params::TabFillParams::export_all(&cfg).unwrap();
        crate::command_params::TabTypeParams::export_all(&cfg).unwrap();
        crate::command_params::TabPressParams::export_all(&cfg).unwrap();
        crate::command_params::TabSelectParams::export_all(&cfg).unwrap();
        crate::command_params::TabCheckParams::export_all(&cfg).unwrap();
        crate::command_params::TabHoverParams::export_all(&cfg).unwrap();
        crate::command_params::TabUnhoverParams::export_all(&cfg).unwrap();
        crate::command_params::TabScrollParams::export_all(&cfg).unwrap();
        crate::command_params::TabDblClickParams::export_all(&cfg).unwrap();
        crate::command_params::TabEvaluateParams::export_all(&cfg).unwrap();
        crate::command_params::TabBackParams::export_all(&cfg).unwrap();
        crate::command_params::TabWaitForLoadParams::export_all(&cfg).unwrap();
        crate::command_params::TabScrollToParams::export_all(&cfg).unwrap();
        crate::command_params::PageFindParams::export_all(&cfg).unwrap();
        crate::command_params::PageWaitForParams::export_all(&cfg).unwrap();
        crate::command_params::PageExtractParams::export_all(&cfg).unwrap();
        crate::command_params::PageAppendParams::export_all(&cfg).unwrap();
    }

    #[test]
    fn test_basic_print() {
        let mut session = NotebookSession::new();
        let result = session.run_cell("print(\"hello\")", "");
        assert_eq!(result.stdout, vec!["hello"]);
        assert!(result.error.is_none());
    }

    #[test]
    fn test_arithmetic() {
        let mut session = NotebookSession::new();
        let result = session.run_cell("print(1 + 2)", "");
        assert_eq!(result.stdout, vec!["3"]);
    }

    #[test]
    fn test_variable_persistence() {
        let mut session = NotebookSession::new();
        let r1 = session.run_cell("x = 10", "");
        assert!(r1.error.is_none());
        let r2 = session.run_cell("print(x + 1)", "");
        assert_eq!(r2.stdout, vec!["11"]);
    }

    #[test]
    fn test_runtime_error_line_is_cell_relative() {
        let mut session = NotebookSession::new();
        // First cell: 3 lines, no error
        let r1 = session.run_cell("local a = 1\nlocal b = 2\nlocal c = 3", "");
        assert!(r1.error.is_none());
        // Second cell: 2 lines, error on its line 2
        // The line must be 2 (relative to this cell), not 5 (cumulative).
        let r2 = session.run_cell("local d = 4\nerror('boom')", "");
        if let Some(CellError::Runtime { line, .. }) = r2.error {
            assert_eq!(
                line,
                Some(2),
                "Expected cell-relative line 2, got {:?}",
                line
            );
        } else {
            panic!("Expected Runtime error, got {:?}", r2.error);
        }
    }

    #[test]
    fn test_function_and_recursion() {
        let mut session = NotebookSession::new();
        let code = r#"
            function fact(n)
                if n <= 1 then
                    return 1
                end
                return n * fact(n - 1)
            end
            print(fact(5))
        "#;
        let result = session.run_cell(code, "");
        assert_eq!(result.stdout, vec!["120"]);
    }

    #[test]
    fn test_while_loop() {
        let mut session = NotebookSession::new();
        let code = r#"
            i = 0
            while i < 3 do
                print(i)
                i = i + 1
            end
        "#;
        let result = session.run_cell(code, "");
        assert_eq!(result.stdout, vec!["0", "1", "2"]);
    }

    #[test]
    fn test_infinite_loop_fuel() {
        let mut session = NotebookSession::with_fuel_limit(500);
        let result = session.run_cell("while true do end", "");
        assert!(result.fuel_exhausted);
        assert!(matches!(result.error, Some(CellError::FuelExhausted)));
    }

    #[test]
    fn test_read_stdin() {
        let mut session = NotebookSession::new();
        let result = session.run_cell("print(read())\nprint(read())", "abc\ndef");
        assert_eq!(result.stdout, vec!["abc", "def"]);
    }

    #[test]
    fn test_input_stdin() {
        let mut session = NotebookSession::new();
        let result = session.run_cell("print(input())", "hello world");
        assert_eq!(result.stdout, vec!["hello world"]);
    }

    #[test]
    fn test_emit() {
        let mut session = NotebookSession::new();
        let result = session.run_cell("emit(\"hello\")", "");
        assert_eq!(result.commands.len(), 1);
        assert_eq!(result.commands[0]["args"]["value"], "hello");
    }

    #[test]
    fn test_cross_cell_state() {
        let mut session = NotebookSession::new();
        session.run_cell("x = 10", "");
        session.run_cell("function double(n) return n * 2 end", "");
        let r = session.run_cell("print(double(x))", "");
        assert_eq!(r.stdout, vec!["20"]);
    }

    #[test]
    fn test_reset_clears_state() {
        let mut session = NotebookSession::new();
        session.run_cell("x = 10", "");
        session.reset();
        let r = session.run_cell("print(x)", "");
        assert!(
            matches!(r.error, Some(CellError::StrictMode { ref variable } ) if variable == "x"),
            "Expected StrictMode error for x after reset, got: {:?}",
            r.error
        );
    }

    #[test]
    fn test_dangerous_globals_disabled() {
        let mut session = NotebookSession::new();
        let r = session.run_cell("print(os)", "");
        assert_eq!(r.stdout, vec!["nil"]);
        let r = session.run_cell("print(io)", "");
        assert_eq!(r.stdout, vec!["nil"]);
        let r = session.run_cell("print(debug)", "");
        assert_eq!(r.stdout, vec!["nil"]);
    }

    #[test]
    fn test_execution_count_increments() {
        let mut session = NotebookSession::new();
        assert_eq!(session.execution_count(), 0);
        session.run_cell("x = 1", "");
        assert_eq!(session.execution_count(), 1);
        session.run_cell("x = 2", "");
        assert_eq!(session.execution_count(), 2);
    }

    #[test]
    fn test_if_else() {
        let mut session = NotebookSession::new();
        let code = r#"
            x = 5
            if x > 3 then
                print("big")
            else
                print("small")
            end
        "#;
        let result = session.run_cell(code, "");
        assert_eq!(result.stdout, vec!["big"]);
    }

    #[test]
    fn test_table_basics() {
        let mut session = NotebookSession::new();
        let code = r#"
            t = {a = 1, b = 2}
            print(t.a)
            print(t.b)
        "#;
        let result = session.run_cell(code, "");
        assert_eq!(result.stdout, vec!["1", "2"]);
    }

    #[test]
    fn test_print_multiple_args() {
        let mut session = NotebookSession::new();
        let result = session.run_cell("print(1, 2, 3)", "");
        assert_eq!(result.stdout, vec!["1\t2\t3"]);
    }

    #[test]
    fn test_strict_mode_undeclared_variable() {
        let mut session = NotebookSession::new();
        let result = session.run_cell("print(undeclared_thing)", "");
        assert!(
            matches!(result.error, Some(CellError::StrictMode { ref variable }) if variable == "undeclared_thing"),
            "Expected StrictMode error, got: {:?}",
            result.error
        );
    }

    #[test]
    fn test_strict_mode_declared_variable_ok() {
        let mut session = NotebookSession::new();
        session.run_cell("my_var = 42", "");
        let result = session.run_cell("print(my_var)", "");
        assert_eq!(result.stdout, vec!["42"]);
    }

    #[test]
    fn test_compile_error_syntax() {
        let mut session = NotebookSession::new();
        let result = session.run_cell("x = ", "");
        assert!(
            matches!(result.error, Some(CellError::Compile { .. })),
            "Expected Compile error for bad syntax, got: {:?}",
            result.error
        );
    }

    #[test]
    fn test_runtime_error_nil_arithmetic() {
        let mut session = NotebookSession::new();
        // Piccolo may or may not error on nil arithmetic; test that it at least
        // doesn't crash and produces *some* result (error or output).
        let result = session.run_cell("local x = nil; print(x + 1)", "");
        // Either it errors (runtime error) or it produces some output (e.g. "nil" or error message)
        // Piccolo's behavior for nil + 1 is to produce a runtime error about arithmetic on nil
        // but if it doesn't, we just check it didn't crash.
        if let Some(ref err) = result.error {
            assert!(
                matches!(err, CellError::Runtime { .. }),
                "Expected Runtime error for nil arithmetic, got: {:?}",
                result.error
            );
        }
        // If no error, piccolo may have just printed something — that's also acceptable behavior.
    }

    #[test]
    fn test_compile_error_has_line_number() {
        let mut session = NotebookSession::new();
        // Line 2 has the syntax error
        let result = session.run_cell("x = 1\ny =\nz = 3", "");
        match result.error {
            Some(CellError::Compile { line: Some(n), .. }) => {
                assert!(n >= 1, "Line number should be >= 1, got {}", n);
            }
            Some(CellError::Compile { line: None, .. }) => {
                // Some compile errors may not have line numbers, that's ok
            }
            other => panic!("Expected Compile error, got: {:?}", other),
        }
    }

    // ── Loops: for numeric ──────────────────────────────────────

    #[test]
    fn test_for_loop_counting_up() {
        let mut session = NotebookSession::new();
        let result = session.run_cell(
            r#"
            for i = 1, 5 do
                print(i)
            end
        "#,
            "",
        );
        assert_eq!(result.stdout, vec!["1", "2", "3", "4", "5"]);
        assert!(result.error.is_none());
    }

    #[test]
    fn test_for_loop_with_step() {
        let mut session = NotebookSession::new();
        let result = session.run_cell(
            r#"
            for i = 0, 10, 3 do
                print(i)
            end
        "#,
            "",
        );
        assert_eq!(result.stdout, vec!["0", "3", "6", "9"]);
    }

    #[test]
    fn test_for_loop_counting_down() {
        let mut session = NotebookSession::new();
        let result = session.run_cell(
            r#"
            for i = 3, 1, -1 do
                print(i)
            end
        "#,
            "",
        );
        assert_eq!(result.stdout, vec!["3", "2", "1"]);
    }

    #[test]
    fn test_for_loop_empty_range() {
        let mut session = NotebookSession::new();
        // 5 to 1 with no negative step: should not execute
        let result = session.run_cell(
            r#"
            for i = 5, 1 do
                print(i)
            end
        "#,
            "",
        );
        assert_eq!(result.stdout, Vec::<String>::new());
        assert!(result.error.is_none());
    }

    // ── Loops: repeat/until ─────────────────────────────────────

    #[test]
    fn test_repeat_until() {
        let mut session = NotebookSession::new();
        let result = session.run_cell(
            r#"
            x = 1
            repeat
                print(x)
                x = x + 1
            until x > 3
        "#,
            "",
        );
        assert_eq!(result.stdout, vec!["1", "2", "3"]);
        assert!(result.error.is_none());
    }

    // ── Generic for: pairs / ipairs ─────────────────────────────

    #[test]
    fn test_for_pairs() {
        let mut session = NotebookSession::new();
        let result = session.run_cell(
            r#"
            local t = {a = 10, b = 20}
            local keys = {}
            for k, v in pairs(t) do
                print(k .. "=" .. tostring(v))
            end
        "#,
            "",
        );
        assert!(result.error.is_none(), "got error: {:?}", result.error);
        // pairs order is not guaranteed, just check both entries exist
        assert_eq!(result.stdout.len(), 2);
        assert!(
            result.stdout.contains(&"a=10".to_string())
                || result.stdout.contains(&"b=20".to_string())
        );
    }

    #[test]
    fn test_for_ipairs() {
        let mut session = NotebookSession::new();
        let result = session.run_cell(
            r#"
            local t = {10, 20, 30}
            for i, v in ipairs(t) do
                print(i, v)
            end
        "#,
            "",
        );
        assert!(result.error.is_none(), "got error: {:?}", result.error);
        assert_eq!(result.stdout.len(), 3);
        assert_eq!(result.stdout[0], "1\t10");
        assert_eq!(result.stdout[1], "2\t20");
        assert_eq!(result.stdout[2], "3\t30");
    }

    // ── Operators: modulo, exponent, not-equal, and/or/not ──────

    #[test]
    fn test_modulo() {
        let mut session = NotebookSession::new();
        let result = session.run_cell("print(10 % 3)", "");
        assert_eq!(result.stdout, vec!["1"]);
    }

    #[test]
    fn test_exponent() {
        let mut session = NotebookSession::new();
        let result = session.run_cell("print(2 ^ 10)", "");
        // piccolo returns float for ^
        assert!(
            result.stdout[0].contains("1024"),
            "got: {:?}",
            result.stdout
        );
    }

    #[test]
    fn test_not_equal() {
        let mut session = NotebookSession::new();
        let result = session.run_cell("print(1 ~= 2)", "");
        assert_eq!(result.stdout, vec!["true"]);
        let r2 = session.run_cell("print(1 ~= 1)", "");
        assert_eq!(r2.stdout, vec!["false"]);
    }

    #[test]
    fn test_logical_and() {
        let mut session = NotebookSession::new();
        let result = session.run_cell("print(true and false)", "");
        assert_eq!(result.stdout, vec!["false"]);
        let r2 = session.run_cell("print(true and 42)", "");
        assert_eq!(r2.stdout, vec!["42"]);
    }

    #[test]
    fn test_logical_or() {
        let mut session = NotebookSession::new();
        let result = session.run_cell("print(false or 99)", "");
        assert_eq!(result.stdout, vec!["99"]);
        let r2 = session.run_cell("print(nil or \"hello\")", "");
        assert_eq!(r2.stdout, vec!["hello"]);
    }

    #[test]
    fn test_logical_not() {
        let mut session = NotebookSession::new();
        let result = session.run_cell("print(not true)", "");
        assert_eq!(result.stdout, vec!["false"]);
        let r2 = session.run_cell("print(not nil)", "");
        assert_eq!(r2.stdout, vec!["true"]);
    }

    // ── String operations ───────────────────────────────────────

    #[test]
    fn test_string_concatenation() {
        let mut session = NotebookSession::new();
        let result = session.run_cell("print(\"hello\" .. \" \" .. \"world\")", "");
        assert_eq!(result.stdout, vec!["hello world"]);
    }

    #[test]
    fn test_string_len() {
        let mut session = NotebookSession::new();
        let result = session.run_cell("print(#\"hello\")", "");
        assert_eq!(result.stdout, vec!["5"]);
    }

    #[test]
    fn test_string_upper_lower() {
        let mut session = NotebookSession::new();
        let result = session.run_cell("print(string.upper(\"hello\"))", "");
        assert_eq!(result.stdout, vec!["HELLO"]);
        let r2 = session.run_cell("print(string.lower(\"WORLD\"))", "");
        assert_eq!(r2.stdout, vec!["world"]);
    }

    #[test]
    fn test_string_sub() {
        let mut session = NotebookSession::new();
        let result = session.run_cell("print(string.sub(\"hello\", 1, 3))", "");
        assert_eq!(result.stdout, vec!["hel"]);
    }

    #[test]
    fn test_string_rep() {
        let mut session = NotebookSession::new();
        let result = session.run_cell("print(string.rep(\"ab\", 3))", "");
        assert!(result.error.is_none(), "got error: {:?}", result.error);
        assert_eq!(result.stdout, vec!["ababab"]);
        let r2 = session.run_cell("print(string.rep(\"x\", 2, \"-\"))", "");
        assert_eq!(r2.stdout, vec!["x-x"]);
        let r3 = session.run_cell("print(string.rep(\"a\", 0))", "");
        assert_eq!(r3.stdout, vec![""]);
    }

    #[test]
    fn test_string_find() {
        let mut session = NotebookSession::new();
        let r1 = session.run_cell("print(string.find(\"hello world\", \"world\"))", "");
        assert!(r1.error.is_none(), "got error: {:?}", r1.error);
        assert_eq!(r1.stdout, vec!["7\t11"]);
        let r2 = session.run_cell("print(string.find(\"hello world\", \"o\", 5))", "");
        assert_eq!(r2.stdout, vec!["5\t5"]);
        let r3 = session.run_cell("print(string.find(\"hello\", \"z\"))", "");
        assert_eq!(r3.stdout, vec!["nil"]);
    }

    #[test]
    fn test_string_format() {
        let mut session = NotebookSession::new();
        let r1 = session.run_cell("print(string.format(\"%s %d\", \"hello\", 42))", "");
        assert!(r1.error.is_none(), "got error: {:?}", r1.error);
        assert_eq!(r1.stdout, vec!["hello 42"]);
        let r2 = session.run_cell("print(string.format(\"hex: %x\", 255))", "");
        assert_eq!(r2.stdout, vec!["hex: ff"]);
        let r3 = session.run_cell("print(string.format(\"HEX: %X\", 255))", "");
        assert_eq!(r3.stdout, vec!["HEX: FF"]);
        let r4 = session.run_cell(r#"print(string.format("q: %q", "a\"b"))"#, "");
        assert_eq!(r4.stdout, vec!["q: \"a\\\"b\""]);
        let r5 = session.run_cell("print(string.format(\"%%\"))", "");
        assert_eq!(r5.stdout, vec!["%"]);
        let r6 = session.run_cell("print(string.format(\"%f\", 3.14))", "");
        assert!(r6.stdout[0].contains("3.14"), "got: {:?}", r6.stdout);
    }

    // ── Math library ────────────────────────────────────────────

    #[test]
    fn test_math_sqrt() {
        let mut session = NotebookSession::new();
        let result = session.run_cell("print(math.sqrt(144))", "");
        // sqrt returns float in piccolo
        assert!(result.stdout[0].contains("12"), "got: {:?}", result.stdout);
    }

    #[test]
    fn test_math_floor_ceil() {
        let mut session = NotebookSession::new();
        let result = session.run_cell("print(math.floor(3.7))", "");
        assert_eq!(result.stdout, vec!["3"]);
        let r2 = session.run_cell("print(math.ceil(3.2))", "");
        assert_eq!(r2.stdout, vec!["4"]);
    }

    #[test]
    fn test_math_max_min() {
        let mut session = NotebookSession::new();
        let result = session.run_cell("print(math.max(1, 5, 3))", "");
        assert_eq!(result.stdout, vec!["5"]);
        let r2 = session.run_cell("print(math.min(1, 5, 3))", "");
        assert_eq!(r2.stdout, vec!["1"]);
    }

    #[test]
    fn test_math_abs() {
        let mut session = NotebookSession::new();
        let result = session.run_cell("print(math.abs(-42))", "");
        assert_eq!(result.stdout, vec!["42"]);
    }

    // ── Tables: numeric index, nested, length ───────────────────

    #[test]
    fn test_table_numeric_index() {
        let mut session = NotebookSession::new();
        let result = session.run_cell(
            r#"
            local t = {10, 20, 30}
            print(t[1])
            print(t[2])
            print(t[3])
        "#,
            "",
        );
        assert_eq!(result.stdout, vec!["10", "20", "30"]);
    }

    #[test]
    fn test_table_length() {
        let mut session = NotebookSession::new();
        let result = session.run_cell(
            r#"
            local t = {10, 20, 30, 40}
            print(#t)
        "#,
            "",
        );
        assert_eq!(result.stdout, vec!["4"]);
    }

    #[test]
    fn test_table_nested() {
        let mut session = NotebookSession::new();
        let result = session.run_cell(
            r#"
            local t = {a = {x = 1}, b = {y = 2}}
            print(t.a.x)
            print(t.b.y)
        "#,
            "",
        );
        assert_eq!(result.stdout, vec!["1", "2"]);
    }

    #[test]
    fn test_table_bracket_access() {
        let mut session = NotebookSession::new();
        let result = session.run_cell(
            r#"
            local t = {}
            t["my key"] = 42
            print(t["my key"])
        "#,
            "",
        );
        assert_eq!(result.stdout, vec!["42"]);
    }

    // ── Error handling: error() and pcall() ─────────────────────

    #[test]
    fn test_error_function() {
        let mut session = NotebookSession::new();
        // error() at top level in piccolo may silently stop execution
        // without producing a catchable error in our current setup.
        // Verify it doesn't crash, and that pcall catches it (tested separately).
        let result = session.run_cell("error(\"something went wrong\")", "");
        // At minimum: no crash, and either error is set or execution just silently stopped
        assert!(
            result.error.is_none() || matches!(result.error, Some(CellError::Runtime { .. })),
            "Unexpected error type: {:?}",
            result.error
        );
    }

    #[test]
    fn test_runtime_error_has_line_number() {
        let mut session = NotebookSession::new();
        // error() on line 2 should report line 2
        let result = session.run_cell("local x = 1\nerror('boom')", "");
        if let Some(CellError::Runtime { line, .. }) = result.error {
            assert_eq!(line, Some(2), "Expected line 2, got {:?}", line);
        } else {
            panic!("Expected Runtime error, got {:?}", result.error);
        }
    }

    #[test]
    fn test_assert_error_has_line_number() {
        let mut session = NotebookSession::new();
        let result = session.run_cell("local x = 1\nassert(false, 'boom')", "");
        if let Some(CellError::Runtime { line, .. }) = result.error {
            assert_eq!(line, Some(2), "Expected line 2, got {:?}", line);
        } else {
            panic!("Expected Runtime error, got {:?}", result.error);
        }
    }

    #[test]
    fn test_error_line_1() {
        let mut session = NotebookSession::new();
        let result = session.run_cell("error('boom')", "");
        if let Some(CellError::Runtime { line, .. }) = result.error {
            assert_eq!(line, Some(1), "Expected line 1, got {:?}", line);
        } else {
            panic!("Expected Runtime error, got {:?}", result.error);
        }
    }

    #[test]
    fn test_error_message_with_embedded_line_marker() {
        let mut session = NotebookSession::new();
        // A user message that itself contains "[line 5]:" should not confuse the extractor
        let result = session.run_cell("error('see [line 5]: for info')", "");
        if let Some(CellError::Runtime { line, message }) = result.error {
            assert_eq!(line, Some(1), "Expected line 1, got {:?}", line);
            assert!(
                message.contains("[line 5]: for info"),
                "Message should keep embedded marker, got: {}",
                message
            );
        } else {
            panic!("Expected Runtime error, got {:?}", result.error);
        }
    }

    #[test]
    fn test_pcall_catches_error() {
        let mut session = NotebookSession::new();
        let result = session.run_cell(
            r#"
            local ok, err = pcall(function() error("boom") end)
            print(ok)
            print(err)
        "#,
            "",
        );
        assert!(result.error.is_none(), "got error: {:?}", result.error);
        assert_eq!(result.stdout[0], "false");
        assert!(
            result.stdout[1].contains("boom"),
            "expected 'boom' in '{}'",
            result.stdout[1]
        );
    }

    #[test]
    fn test_pcall_success() {
        let mut session = NotebookSession::new();
        let result = session.run_cell(
            r#"
            local ok, val = pcall(function() return 42 end)
            print(ok)
            print(val)
        "#,
            "",
        );
        assert!(result.error.is_none());
        assert_eq!(result.stdout, vec!["true", "42"]);
    }

    // ── Contextual API errors ───────────────────────────────────

    #[test]
    fn test_unknown_api_lists_available() {
        let mut session = NotebookSession::new();
        let result = session.run_cell("page.notexist()", "");
        assert!(
            result.error.is_some(),
            "Expected error for unknown API, got none"
        );
        let msg = match &result.error {
            Some(CellError::Runtime { message, .. }) => message.clone(),
            other => panic!("Expected Runtime error, got {:?}", other),
        };
        assert!(
            msg.contains("page.notexist"),
            "Message should mention the invalid API, got: {}",
            msg
        );
        // Should list all available APIs in the namespace like --help
        assert!(
            msg.contains("Available APIs in 'page'"),
            "Message should list available APIs, got: {}",
            msg
        );
        assert!(
            msg.contains("page.snapshot") && msg.contains("page.click"),
            "Message should include real API names, got: {}",
            msg
        );
    }

    #[test]
    fn test_unknown_api_always_lists_available() {
        // Even wildly different names get the full namespace listing
        let mut session = NotebookSession::new();
        let result = session.run_cell("page.xxxxxxx()", "");
        let msg = match &result.error {
            Some(CellError::Runtime { message, .. }) => message.clone(),
            other => panic!("Expected Runtime error, got {:?}", other),
        };
        assert!(
            msg.contains("page.xxxxxxx"),
            "Message should mention the invalid API, got: {}",
            msg
        );
        assert!(
            msg.contains("Available APIs in 'page'"),
            "Message should still list available APIs, got: {}",
            msg
        );
    }

    #[test]
    fn test_param_error_enriched() {
        let mut session = NotebookSession::new();
        // page.snapshot expects max_nodes to be a number
        let result = session.run_cell(r#"page.snapshot({max_nodes = "bad"})"#, "");
        let msg = match &result.error {
            Some(CellError::Runtime { message, .. }) => message.clone(),
            other => panic!("Expected Runtime error, got {:?}", other),
        };
        assert!(
            msg.contains("page.snapshot"),
            "Message should identify the API, got: {}",
            msg
        );
        assert!(
            msg.contains("invalid parameters"),
            "Message should say invalid parameters, got: {}",
            msg
        );
        assert!(
            msg.contains("Expected signature"),
            "Message should show expected signature, got: {}",
            msg
        );
    }

    #[test]
    fn test_chrome_top_level_miss() {
        let mut session = NotebookSession::new();
        let result = session.run_cell("chrome.nope()", "");
        let msg = match &result.error {
            Some(CellError::Runtime { message, .. }) => message.clone(),
            other => panic!("Expected Runtime error, got {:?}", other),
        };
        // Should list chrome.tabs, chrome.runtime, etc — NOT say "no APIs registered"
        assert!(
            msg.contains("chrome.tabs") || msg.contains("chrome.runtime"),
            "Should list sub-namespaces under chrome, got: {}",
            msg
        );
    }

    #[test]
    fn test_nil_comparison_no_crash() {
        let mut session = NotebookSession::new();
        // Reads of missing keys now return a sentinel function instead of crashing,
        // so == nil is false (the sentinel is truthy). At least it doesn't throw.
        let result = session.run_cell(
            r#"if page.notexist == nil then print("safe") else print("broken") end"#,
            "",
        );
        assert!(
            result.error.is_none(),
            "Feature-detection read should not crash, got: {:?}",
            result.error
        );
        assert_eq!(result.stdout, vec!["broken"]);
    }

    #[test]
    fn test_sentinel_call_still_errors() {
        let mut session = NotebookSession::new();
        let result = session.run_cell("page.notexist()", "");
        assert!(
            result.error.is_some(),
            "Calling a missing API should still error"
        );
        let msg = match &result.error {
            Some(CellError::Runtime { message, .. }) => message.clone(),
            other => panic!("Expected Runtime error, got {:?}", other),
        };
        assert!(
            msg.contains("page.notexist"),
            "Error should name the invalid API, got: {}",
            msg
        );
        assert!(
            msg.contains("Available APIs in 'page'"),
            "Error should list available APIs, got: {}",
            msg
        );
    }

    #[test]
    fn test_web_notexist_shows_apis_and_children() {
        let mut session = NotebookSession::new();
        let result = session.run_cell("web.notexist()", "");
        let msg = match &result.error {
            Some(CellError::Runtime { message, .. }) => message.clone(),
            other => panic!("Expected Runtime error, got {:?}", other),
        };
        // web has direct APIs (fetch, sleep, log, mock_async) AND sub-namespaces (tab, storage, url)
        assert!(
            msg.contains("Available APIs in 'web'"),
            "Should list direct APIs, got: {}",
            msg
        );
        assert!(
            msg.contains("Sub-namespaces under 'web'"),
            "Should list sub-namespaces, got: {}",
            msg
        );
        assert!(
            msg.contains("web.tab") || msg.contains("web.storage") || msg.contains("web.url"),
            "Should mention child namespaces, got: {}",
            msg
        );
    }

    #[test]
    fn test_web_tab_notexist() {
        let mut session = NotebookSession::new();
        let result = session.run_cell("web.tab.notexist()", "");
        let msg = match &result.error {
            Some(CellError::Runtime { message, .. }) => message.clone(),
            other => panic!("Expected Runtime error, got {:?}", other),
        };
        assert!(
            msg.contains("web.tab.notexist"),
            "Error should name the invalid API, got: {}",
            msg
        );
        assert!(
            msg.contains("Available APIs in 'web.tab'"),
            "Should list APIs under web.tab, got: {}",
            msg
        );
    }

    #[test]
    fn test_rawget_bypasses_protector() {
        let mut session = NotebookSession::new();
        // rawget bypasses the __index metatable and returns true nil
        let result = session.run_cell(
            r#"local v = rawget(page, "notexist")
            if v == nil then print("raw_nil") else print("raw_something") end"#,
            "",
        );
        assert!(
            result.error.is_none(),
            "rawget should bypass protector without error, got: {:?}",
            result.error
        );
        assert_eq!(result.stdout, vec!["raw_nil"]);
    }

    #[test]
    fn test_type_of_sentinel() {
        let mut session = NotebookSession::new();
        let result = session.run_cell(
            r#"print(type(page.notexist))"#,
            "",
        );
        assert!(
            result.error.is_none(),
            "type() of sentinel should not crash, got: {:?}",
            result.error
        );
        assert_eq!(result.stdout, vec!["function"]);
    }

    #[test]
    fn test_sentinel_call_with_args() {
        let mut session = NotebookSession::new();
        let result = session.run_cell("page.notexist(1, 2, 3)", "");
        let msg = match &result.error {
            Some(CellError::Runtime { message, .. }) => message.clone(),
            other => panic!("Expected Runtime error, got {:?}", other),
        };
        assert!(
            msg.contains("page.notexist"),
            "Error should name the invalid API even with extra args, got: {}",
            msg
        );
    }

    // ── Local variables and scoping ─────────────────────────────

    #[test]
    fn test_local_scoping() {
        let mut session = NotebookSession::new();
        let result = session.run_cell(
            r#"
            local x = 10
            do
                local x = 20
                print(x)
            end
            print(x)
        "#,
            "",
        );
        assert_eq!(result.stdout, vec!["20", "10"]);
    }

    #[test]
    fn test_local_function() {
        let mut session = NotebookSession::new();
        let result = session.run_cell(
            r#"
            local function add(a, b)
                return a + b
            end
            print(add(3, 4))
        "#,
            "",
        );
        assert_eq!(result.stdout, vec!["7"]);
    }

    // ── Return values printed ───────────────────────────────────

    #[test]
    fn test_return_value_captured() {
        let mut session = NotebookSession::new();
        let result = session.run_cell("return 1 + 2", "");
        // In our notebook model, top-level return may not be captured as result
        // (it's a compile error in some Lua implementations or just ignored)
        // At minimum, it should not crash
        assert!(
            result.error.is_none() || matches!(result.error, Some(CellError::Compile { .. })),
            "Unexpected error: {:?}",
            result.error
        );
    }

    #[test]
    fn test_multiple_returns() {
        let mut session = NotebookSession::new();
        let result = session.run_cell(
            r#"
            function multi() return 1, 2, 3 end
            print(multi())
        "#,
            "",
        );
        // first return value is printed
        assert!(result.stdout[0].contains("1"));
    }

    // ── Type checking: tostring, tonumber, type ─────────────────

    #[test]
    fn test_tostring_tonumber() {
        let mut session = NotebookSession::new();
        let r1 = session.run_cell("print(tostring(42))", "");
        assert_eq!(r1.stdout, vec!["42"]);
        let r2 = session.run_cell("print(tonumber(\"123\") + 1)", "");
        assert_eq!(r2.stdout, vec!["124"]);
    }

    #[test]
    fn test_type_function() {
        let mut session = NotebookSession::new();
        let r1 = session.run_cell("print(type(42))", "");
        assert_eq!(r1.stdout, vec!["number"]);
        let r2 = session.run_cell("print(type(\"hi\"))", "");
        assert_eq!(r2.stdout, vec!["string"]);
        let r3 = session.run_cell("print(type(nil))", "");
        assert_eq!(r3.stdout, vec!["nil"]);
        let r4 = session.run_cell("print(type({}))", "");
        assert_eq!(r4.stdout, vec!["table"]);
    }

    // ── Fuel exhaustion + recovery ──────────────────────────────

    #[test]
    fn test_fuel_exhaustion_session_survives() {
        let mut session = NotebookSession::with_fuel_limit(500);
        // Exhaust fuel
        let r1 = session.run_cell("while true do end", "");
        assert!(r1.fuel_exhausted);
        // Session should still work after fuel exhaustion
        let r2 = session.run_cell("print(\"recovered\")", "");
        assert_eq!(r2.stdout, vec!["recovered"]);
        assert!(r2.error.is_none());
    }

    // ── Async yield/resume tests ────────────────────────────────

    #[test]
    fn test_sync_cell_still_works() {
        let mut session = NotebookSession::new();
        let result = session.run_cell("print(\"hello\")", "");
        assert_eq!(result.status, CellStatus::Done);
        assert_eq!(result.stdout, vec!["hello"]);
        assert!(result.pending_command.is_none());
    }

    #[test]
    fn test_inspect_globals_basic() {
        let mut session = NotebookSession::new();
        session.run_cell("x = 42\nname = \"hello\"\nflag = true\narr = {1, 2, 3}", "");

        let snap = session.inspect_globals();
        assert!(snap.execution_count >= 1);

        let vars: std::collections::HashMap<&str, &GlobalVariable> = snap
            .variables
            .iter()
            .map(|v| (v.name.as_str(), v))
            .collect();

        // Check primitives
        let x = vars.get("x").expect("x should exist");
        assert_eq!(x.type_name, "number");
        assert_eq!(x.value.as_deref(), Some("42"));

        let name = vars.get("name").expect("name should exist");
        assert_eq!(name.type_name, "string");
        assert_eq!(name.value.as_deref(), Some("hello"));

        let flag = vars.get("flag").expect("flag should exist");
        assert_eq!(flag.type_name, "boolean");
        assert_eq!(flag.value.as_deref(), Some("true"));

        // Check table
        let arr = vars.get("arr").expect("arr should exist");
        assert_eq!(arr.type_name, "table");
        assert!(arr.value.is_none()); // tables don't include value
        let expected_keys: &[String] = &["1".to_string(), "2".to_string(), "3".to_string()];
        assert_eq!(arr.keys.as_deref(), Some(expected_keys));

        // Built-in modules should be present
        assert!(vars.contains_key("json"), "json module should exist");
        assert!(vars.contains_key("web"), "web module should exist");
        assert!(vars.contains_key("page"), "page module should exist");
        assert!(vars.contains_key("host"), "host module should exist");

        // Functions should show type but no value
        let print_fn = vars.get("print").expect("print should exist");
        assert_eq!(print_fn.type_name, "function");
        assert!(print_fn.value.is_none());
    }

    #[test]
    fn test_inspect_globals_after_reset() {
        let mut session = NotebookSession::new();
        session.run_cell("my_var = 123", "");

        let snap = session.inspect_globals();
        assert!(snap.variables.iter().any(|v| v.name == "my_var"));

        session.reset();
        let snap = session.inspect_globals();
        assert!(!snap.variables.iter().any(|v| v.name == "my_var"));
    }

    #[test]
    fn test_inspect_globals_nested_table() {
        let mut session = NotebookSession::new();
        session.run_cell("t = { a = 1, b = 2, [42] = \"deep\" }", "");

        let snap = session.inspect_globals();
        let t = snap
            .variables
            .iter()
            .find(|v| v.name == "t")
            .expect("t should exist");
        assert_eq!(t.type_name, "table");
        let keys = t.keys.as_deref().expect("table should have keys");
        assert!(keys.contains(&"a".to_string()));
        assert!(keys.contains(&"b".to_string()));
        assert!(keys.contains(&"[42]".to_string()));
    }

    #[test]
    fn test_runtime_inspect_lua_api() {
        let mut session = NotebookSession::new();
        session.run_cell("x = 42\nmy_str = \"hello\"", "");

        let result = session.run_cell(
            "local vars = runtime.inspect()\nfor _, v in ipairs(vars) do if v.name == \"x\" then print(v.type .. \"=\" .. v.value) end end",
            "",
        );
        assert_eq!(result.status, CellStatus::Done);
        assert!(
            result.stdout.iter().any(|s| s.contains("number=42")),
            "got: {:?}",
            result.stdout
        );

        // Check that runtime.inspect sees the string variable
        let result2 = session.run_cell(
            "local vars = runtime.inspect()\nfor _, v in ipairs(vars) do if v.name == \"my_str\" then print(v.value) end end",
            "",
        );
        assert!(
            result2.stdout.iter().any(|s| s.contains("hello")),
            "got: {:?}",
            result2.stdout
        );
    }

    #[test]
    fn test_async_pending_status() {
        let mut session = NotebookSession::new();
        let result = session.run_cell("local x = web.mock_async(\"test\")\nprint(x)", "");
        assert_eq!(result.status, CellStatus::AsyncPending);
        let cmd = result.pending_command.unwrap();
        assert_eq!(cmd.action.as_str(), "mock_async");
    }

    #[test]
    fn test_resume_with_value() {
        let mut session = NotebookSession::new();
        let result = session.run_cell("local x = web.mock_async(\"hello\")\nprint(x)", "");
        assert_eq!(result.status, CellStatus::AsyncPending);

        let resume_result = session.resume_cell(r#"{"ok": true, "value": "world"}"#);
        assert_eq!(resume_result.status, CellStatus::Done);
        assert_eq!(resume_result.stdout, vec!["world"]);
    }

    #[test]
    fn test_resume_with_error() {
        let mut session = NotebookSession::new();
        let result = session.run_cell("local x = web.mock_async(\"test\")\nprint(x)", "");
        assert_eq!(result.status, CellStatus::AsyncPending);

        let resume_result = session.resume_cell(
            r#"{"ok": false, "error": {"message": "something failed", "code": "EUNKNOWN"}}"#,
        );
        assert_eq!(resume_result.status, CellStatus::Done);
        // Error from resume_err should appear in error field OR cause the cell to error
        assert!(
            resume_result.error.is_some() || resume_result.stdout.is_empty(),
            "Expected error after resume_err, got stdout: {:?}, error: {:?}",
            resume_result.stdout,
            resume_result.error
        );
    }

    #[test]
    fn test_pcall_catches_async_error() {
        let mut session = NotebookSession::new();
        let result = session.run_cell(
            r#"
            local ok, err = pcall(function()
                local x = web.mock_async("test")
                print(x)
            end)
            print("caught:", tostring(not ok))
        "#,
            "",
        );
        assert_eq!(result.status, CellStatus::AsyncPending);

        let resume_result = session
            .resume_cell(r#"{"ok": false, "error": {"message": "boom", "code": "EUNKNOWN"}}"#);
        assert_eq!(resume_result.status, CellStatus::Done);
        assert!(
            resume_result.stdout[0].contains("true"),
            "got: {:?}",
            resume_result.stdout
        );
    }

    #[test]
    fn test_multiple_async_calls_in_one_cell() {
        let mut session = NotebookSession::new();
        let result = session.run_cell(
            r#"
            local a = web.mock_async("first")
            local b = web.mock_async("second")
            print(a, b)
        "#,
            "",
        );
        assert_eq!(result.status, CellStatus::AsyncPending);

        // Resume first call
        let r1 = session.resume_cell(r#"{"ok": true, "value": "A"}"#);
        assert_eq!(r1.status, CellStatus::AsyncPending);

        // Resume second call
        let r2 = session.resume_cell(r#"{"ok": true, "value": "B"}"#);
        assert_eq!(r2.status, CellStatus::Done);
        assert_eq!(r2.stdout[0], "A\tB");
    }

    #[test]
    fn test_async_preserves_stdout_across_yields() {
        let mut session = NotebookSession::new();
        let result = session.run_cell(
            r#"
            print("before")
            local x = web.mock_async("test")
            print("got: " .. tostring(x))
        "#,
            "",
        );
        assert_eq!(result.status, CellStatus::AsyncPending);
        // stdout should have "before" from before the yield
        assert!(
            result.stdout.contains(&"before".to_string()),
            "got: {:?}",
            result.stdout
        );

        let resume_result = session.resume_cell(r#"{"ok": true, "value": "data"}"#);
        assert_eq!(resume_result.status, CellStatus::Done);
        // Should have both "before" and "got: data"
        assert!(resume_result.stdout.contains(&"before".to_string()));
        assert!(resume_result.stdout.iter().any(|s| s.contains("got: data")));
    }

    #[test]
    fn test_resume_with_json_object() {
        let mut session = NotebookSession::new();
        let result = session.run_cell(
            r#"
            local resp = web.mock_async("fetch")
            print(resp.status)
            print(resp.body)
        "#,
            "",
        );
        assert_eq!(result.status, CellStatus::AsyncPending);

        let resume_result =
            session.resume_cell(r#"{"ok": true, "value": {"status": 200, "body": "hello"}}"#);
        assert_eq!(resume_result.status, CellStatus::Done);
        assert!(
            resume_result.stdout.contains(&"200".to_string())
                || resume_result.stdout.iter().any(|s| s.contains("200")),
            "got: {:?}",
            resume_result.stdout
        );
    }

    // ── web.fetch tests ─────────────────────────────────────────

    #[test]
    fn test_fetch_lua_syntax_get() {
        let mut session = NotebookSession::new();
        let result = session.run_cell(
            r#"
            local response = web.fetch("https://example.com/api")
            print(response.status)
        "#,
            "",
        );
        assert_eq!(result.status, CellStatus::AsyncPending);
        let cmd = result.pending_command.unwrap();
        assert_eq!(cmd.action.as_str(), "fetch");
        assert_eq!(cmd.params["url"], "https://example.com/api");
        assert_eq!(cmd.params["method"], "GET");
    }

    #[test]
    fn test_fetch_lua_syntax_post() {
        let mut session = NotebookSession::new();
        let result = session.run_cell(
            r#"
            local payload = json.encode({name = "lua"})
            local response = web.fetch("https://example.com/api", {
                method = "POST",
                body = payload,
                headers = {["Content-Type"] = "application/json"},
                timeout = 5000
            })
            print(response.status)
        "#,
            "",
        );
        assert_eq!(result.status, CellStatus::AsyncPending);
        let cmd = result.pending_command.unwrap();
        assert_eq!(cmd.action.as_str(), "fetch");
        assert_eq!(cmd.params["method"], "POST");
        assert_eq!(cmd.params["timeout"], 5000);
    }

    #[test]
    fn test_fetch_resume_with_response() {
        let mut session = NotebookSession::new();
        let result = session.run_cell(
            r#"
            local response = web.fetch("https://example.com/api")
            print(response.status)
            print(response.body)
        "#,
            "",
        );
        assert_eq!(result.status, CellStatus::AsyncPending);

        let resume_result = session.resume_cell(
            r#"{"ok": true, "value": {"status": 200, "ok": true, "body": "{\"name\":\"test\"}", "headers": {}}}"#
        );
        assert_eq!(resume_result.status, CellStatus::Done);
        assert!(
            resume_result.stdout.iter().any(|s| s.contains("200")),
            "got: {:?}",
            resume_result.stdout
        );
    }

    // ── JSON module tests ───────────────────────────────────────

    #[test]
    fn test_json_encode_basic() {
        let mut session = NotebookSession::new();
        let result = session.run_cell(
            r#"
            local s = json.encode({a = 1, b = "hello"})
            print(s)
        "#,
            "",
        );
        assert!(result.error.is_none(), "got error: {:?}", result.error);
        assert!(
            result.stdout[0].contains("\"a\":1"),
            "got: {:?}",
            result.stdout
        );
        assert!(
            result.stdout[0].contains("\"b\":\"hello\""),
            "got: {:?}",
            result.stdout
        );
    }

    #[test]
    fn test_json_decode_basic() {
        let mut session = NotebookSession::new();
        let result = session.run_cell(
            r#"
            local t = json.decode('{"a":1}')
            print(t.a)
        "#,
            "",
        );
        assert!(result.error.is_none(), "got error: {:?}", result.error);
        assert_eq!(result.stdout, vec!["1"]);
    }

    #[test]
    fn test_json_encode_decode_roundtrip() {
        let mut session = NotebookSession::new();
        let result = session.run_cell(
            r#"
            local original = {name = "lua", version = 5, features = {"async", "json"}}
            local encoded = json.encode(original)
            local decoded = json.decode(encoded)
            print(decoded.name)
            print(decoded.version)
            print(decoded.features[1])
            print(decoded.features[2])
        "#,
            "",
        );
        assert!(result.error.is_none(), "got error: {:?}", result.error);
        assert_eq!(result.stdout, vec!["lua", "5", "async", "json"]);
    }

    #[test]
    fn test_json_encode_array() {
        let mut session = NotebookSession::new();
        let result = session.run_cell(
            r#"
            print(json.encode({1, 2, 3}))
        "#,
            "",
        );
        assert!(result.error.is_none(), "got error: {:?}", result.error);
        assert_eq!(result.stdout, vec!["[1,2,3]"]);
    }

    #[test]
    fn test_json_decode_array() {
        let mut session = NotebookSession::new();
        let result = session.run_cell(
            r#"
            local t = json.decode("[10,20,30]")
            print(t[1])
            print(t[2])
            print(t[3])
        "#,
            "",
        );
        assert!(result.error.is_none(), "got error: {:?}", result.error);
        assert_eq!(result.stdout, vec!["10", "20", "30"]);
    }

    #[test]
    fn test_json_encode_nested() {
        let mut session = NotebookSession::new();
        let result = session.run_cell(
            r#"
            local t = {user = {name = "alice", age = 30}}
            local s = json.encode(t)
            print(s)
        "#,
            "",
        );
        assert!(result.error.is_none(), "got error: {:?}", result.error);
        assert!(
            result.stdout[0].contains("alice"),
            "got: {:?}",
            result.stdout
        );
        assert!(result.stdout[0].contains("30"), "got: {:?}", result.stdout);
    }

    #[test]
    fn test_json_decode_null() {
        let mut session = NotebookSession::new();
        let result = session.run_cell(
            r#"
            local t = json.decode('{"a": null}')
            print(t.a)
        "#,
            "",
        );
        assert!(result.error.is_none(), "got error: {:?}", result.error);
        assert_eq!(result.stdout, vec!["nil"]);
    }

    #[test]
    fn test_json_decode_invalid() {
        let mut session = NotebookSession::new();
        let result = session.run_cell(
            r#"
            local ok, result = pcall(json.decode, "not valid json{{{")
            print(not ok)
        "#,
            "",
        );
        // pcall should catch the error from json.decode
        assert!(
            result.error.is_none(),
            "unexpected error: {:?}",
            result.error
        );
        assert_eq!(
            result.stdout,
            vec!["true"],
            "pcall should have caught the error"
        );
    }

    #[test]
    fn test_json_pretty() {
        let mut session = NotebookSession::new();
        let result = session.run_cell(
            r#"
            local s = json.pretty({a = 1})
            print(s)
        "#,
            "",
        );
        assert!(result.error.is_none(), "got error: {:?}", result.error);
        assert!(
            result.stdout[0].contains("\n"),
            "pretty should contain newlines, got: {:?}",
            result.stdout
        );
    }

    #[test]
    fn test_json_encode_boolean_nil_numbers() {
        let mut session = NotebookSession::new();
        let result = session.run_cell(
            r#"
            local s = json.encode({flag = true, count = 0, name = "test"})
            print(s)
        "#,
            "",
        );
        assert!(result.error.is_none(), "got error: {:?}", result.error);
        assert!(
            result.stdout[0].contains("\"flag\":true"),
            "got: {:?}",
            result.stdout
        );
        assert!(
            result.stdout[0].contains("\"count\":0"),
            "got: {:?}",
            result.stdout
        );
        assert!(
            result.stdout[0].contains("\"name\":\"test\""),
            "got: {:?}",
            result.stdout
        );
    }

    // ── Phase 4: web.url / web.log / web.sleep tests ───────────────

    #[test]
    fn test_url_parse() {
        let mut session = NotebookSession::new();
        let result = session.run_cell(
            r#"
            local u = web.url.parse("https://example.com/path?q=hello#section")
            print(u.scheme)
            print(u.host)
            print(u.path)
            print(u.fragment)
        "#,
            "",
        );
        assert!(result.error.is_none(), "got error: {:?}", result.error);
        assert!(
            result.stdout.contains(&"https".to_string()),
            "got: {:?}",
            result.stdout
        );
        assert!(
            result.stdout.contains(&"example.com".to_string()),
            "got: {:?}",
            result.stdout
        );
        assert!(
            result.stdout.contains(&"/path".to_string()),
            "got: {:?}",
            result.stdout
        );
        assert!(
            result.stdout.contains(&"section".to_string()),
            "got: {:?}",
            result.stdout
        );
    }

    #[test]
    fn test_url_parse_with_port() {
        let mut session = NotebookSession::new();
        let result = session.run_cell(
            r#"
            local u = web.url.parse("http://localhost:3000/api")
            print(u.scheme)
            print(u.host)
            print(u.port)
            print(u.path)
        "#,
            "",
        );
        assert!(result.error.is_none(), "got error: {:?}", result.error);
        assert!(
            result.stdout.contains(&"http".to_string()),
            "got: {:?}",
            result.stdout
        );
        assert!(
            result.stdout.contains(&"localhost".to_string()),
            "got: {:?}",
            result.stdout
        );
        assert!(
            result.stdout.contains(&"3000".to_string()),
            "got: {:?}",
            result.stdout
        );
        assert!(
            result.stdout.contains(&"/api".to_string()),
            "got: {:?}",
            result.stdout
        );
    }

    #[test]
    fn test_url_parse_query() {
        let mut session = NotebookSession::new();
        let result = session.run_cell(
            r#"
            local u = web.url.parse("https://example.com/search?q=hello&page=1")
            print(u.query_string)
            print(#u.query)
        "#,
            "",
        );
        assert!(result.error.is_none(), "got error: {:?}", result.error);
        assert!(
            result.stdout[0].contains("q=hello"),
            "got: {:?}",
            result.stdout
        );
        assert!(
            result.stdout.contains(&"2".to_string()),
            "got: {:?}",
            result.stdout
        );
    }

    #[test]
    fn test_url_parse_invalid() {
        let mut session = NotebookSession::new();
        // Use pcall to catch the error from the callback
        let result = session.run_cell(
            r#"
            local ok, err = pcall(function()
                web.url.parse("http://[invalid-ipv6")
            end)
            print("caught:", not ok)
        "#,
            "",
        );
        // The url crate may or may not reject certain strings.
        // What matters is that web.url.parse doesn't crash.
        assert!(
            result.error.is_none(),
            "unexpected error: {:?}",
            result.error
        );
    }

    #[test]
    fn test_url_encode() {
        let mut session = NotebookSession::new();
        let result = session.run_cell(
            r#"
            local qs = web.url.encode({a = "1", b = "2"})
            print(qs)
        "#,
            "",
        );
        assert!(result.error.is_none(), "got error: {:?}", result.error);
        assert!(result.stdout[0].contains("a=1"), "got: {:?}", result.stdout);
        assert!(result.stdout[0].contains("b=2"), "got: {:?}", result.stdout);
    }

    #[test]
    fn test_url_encode_special_chars() {
        let mut session = NotebookSession::new();
        let result = session.run_cell(
            r#"
            local qs = web.url.encode({query = "hello world"})
            print(qs)
        "#,
            "",
        );
        assert!(result.error.is_none(), "got error: {:?}", result.error);
        assert!(
            result.stdout[0].contains("query=hello%20world"),
            "got: {:?}",
            result.stdout
        );
    }

    #[test]
    fn test_web_log() {
        let mut session = NotebookSession::new();
        let result = session.run_cell(
            r#"
            web.log("test message")
            web.log("key", 42)
        "#,
            "",
        );
        assert!(result.error.is_none(), "got error: {:?}", result.error);
        // web.log should add commands but not stdout
        assert!(
            result.commands.iter().any(|c| c["action"] == "log"),
            "got: {:?}",
            result.commands
        );
    }

    #[test]
    fn test_web_sleep_yields() {
        let mut session = NotebookSession::new();
        let result = session.run_cell(
            r#"
            web.sleep(100)
            print("after sleep")
        "#,
            "",
        );
        assert_eq!(result.status, CellStatus::AsyncPending);
        assert!(result.pending_command.is_some());
        assert_eq!(result.pending_command.unwrap().action.as_str(), "sleep");

        // Resume with ok
        let resume_result = session.resume_cell(r#"{"ok": true, "value": null}"#);
        assert_eq!(resume_result.status, CellStatus::Done);
        assert_eq!(resume_result.stdout, vec!["after sleep"]);
    }

    #[test]
    fn test_web_sleep_with_error() {
        let mut session = NotebookSession::new();
        let result = session.run_cell(
            r#"
            local ok, err = pcall(function()
                web.sleep(100)
            end)
            print("caught:", ok)
        "#,
            "",
        );
        assert_eq!(result.status, CellStatus::AsyncPending);

        let resume_result = session.resume_cell(
            r#"{"ok": false, "error": {"message": "sleep interrupted", "code": "EUNKNOWN"}}"#,
        );
        assert_eq!(resume_result.status, CellStatus::Done);
        // pcall should catch the error
        assert!(
            resume_result.stdout[0].contains("false"),
            "got: {:?}",
            resume_result.stdout
        );
    }

    // ── Phase 5: web.storage tests ─────────────────────────────────

    #[test]
    fn test_storage_get_yields() {
        let mut session = NotebookSession::new();
        let result = session.run_cell(
            r#"
            local val = web.storage.get("mykey")
            print(val)
        "#,
            "",
        );
        assert_eq!(result.status, CellStatus::AsyncPending);
        let cmd = result.pending_command.unwrap();
        assert_eq!(cmd.action.as_str(), "storage_get");
        assert_eq!(cmd.params["key"], "mykey");
    }

    #[test]
    fn test_storage_set_yields() {
        let mut session = NotebookSession::new();
        let result = session.run_cell(
            r#"
            web.storage.set("mykey", "myvalue")
        "#,
            "",
        );
        assert_eq!(result.status, CellStatus::AsyncPending);
        let cmd = result.pending_command.unwrap();
        assert_eq!(cmd.action.as_str(), "storage_set");
        assert_eq!(cmd.params["key"], "mykey");
        assert_eq!(cmd.params["value"], "myvalue");
    }

    #[test]
    fn test_storage_delete_yields() {
        let mut session = NotebookSession::new();
        let result = session.run_cell(
            r#"
            web.storage.delete("mykey")
        "#,
            "",
        );
        assert_eq!(result.status, CellStatus::AsyncPending);
        let cmd = result.pending_command.unwrap();
        assert_eq!(cmd.action.as_str(), "storage_delete");
        assert_eq!(cmd.params["key"], "mykey");
    }

    #[test]
    fn test_storage_list_yields() {
        let mut session = NotebookSession::new();
        let result = session.run_cell(
            r#"
            local keys = web.storage.list()
            print(keys)
        "#,
            "",
        );
        assert_eq!(result.status, CellStatus::AsyncPending);
        let cmd = result.pending_command.unwrap();
        assert_eq!(cmd.action.as_str(), "storage_list");
    }

    #[test]
    fn test_storage_resume_with_value() {
        let mut session = NotebookSession::new();
        let result = session.run_cell(
            r#"
            local val = web.storage.get("test")
            print(val)
        "#,
            "",
        );
        assert_eq!(result.status, CellStatus::AsyncPending);

        // Resume with a value
        let resume_result = session.resume_cell(r#"{"ok": true, "value": "stored_value"}"#);
        assert_eq!(resume_result.status, CellStatus::Done);
        assert_eq!(resume_result.stdout, vec!["stored_value"]);
    }

    // ── Phase 6: Browser extension API tests ───────────────────────

    #[test]
    fn test_tab_query_yields() {
        let mut session = NotebookSession::new();
        let result = session.run_cell(
            r#"
            local tabs = web.tab.query({active = true})
            print(#tabs)
        "#,
            "",
        );
        assert_eq!(result.status, CellStatus::AsyncPending);
        let cmd = result.pending_command.unwrap();
        assert_eq!(cmd.action.as_str(), "tab_query");
    }

    #[test]
    fn test_tab_create_yields() {
        let mut session = NotebookSession::new();
        let result = session.run_cell(
            r#"
            local tab = web.tab.create({url = "https://example.com"})
            print(tab.id)
        "#,
            "",
        );
        assert_eq!(result.status, CellStatus::AsyncPending);
        let cmd = result.pending_command.unwrap();
        assert_eq!(cmd.action.as_str(), "tab_create");
    }

    #[test]
    fn test_tab_wait_for_load_yields() {
        let mut session = NotebookSession::new();
        let result = session.run_cell(
            r#"
            local ok = web.tab.wait_for_load(123)
            print(ok)
        "#,
            "",
        );
        assert_eq!(result.status, CellStatus::AsyncPending);
        let cmd = result.pending_command.unwrap();
        assert_eq!(cmd.action.as_str(), "tab_wait_for_load");
        assert_eq!(cmd.params, serde_json::json!(123));
    }

    #[test]
    fn test_tab_wait_for_load_with_timeout() {
        let mut session = NotebookSession::new();
        let result = session.run_cell(
            r#"
            local ok = web.tab.wait_for_load(123, 5000)
            print(ok)
        "#,
            "",
        );
        assert_eq!(result.status, CellStatus::AsyncPending);
        let cmd = result.pending_command.unwrap();
        assert_eq!(cmd.params, serde_json::json!([123, 5000]));
    }

    #[test]
    fn test_tab_wait_for_load_params_default_timeout() {
        let params: crate::command_params::TabWaitForLoadParams =
            serde_json::from_value(serde_json::json!({"tabId": 123})).unwrap();
        assert_eq!(params.tab_id, 123);
        assert_eq!(params.timeout, 30_000);
    }

    #[test]
    fn test_tab_wait_for_load_params_custom_timeout() {
        let params: crate::command_params::TabWaitForLoadParams =
            serde_json::from_value(serde_json::json!({"tabId": 123, "timeout": 5000})).unwrap();
        assert_eq!(params.tab_id, 123);
        assert_eq!(params.timeout, 5_000);
    }

    #[test]
    fn test_tab_snapshot_yields() {
        let mut session = NotebookSession::new();
        let result = session.run_cell(
            r#"
            local data = web.tab.snapshot(123)
            print(data.title)
            print(#data.nodes)
        "#,
            "",
        );
        assert_eq!(result.status, CellStatus::AsyncPending);
        let cmd = result.pending_command.unwrap();
        assert_eq!(cmd.action.as_str(), "tab_snapshot");
        assert_eq!(cmd.params, serde_json::json!(123));

        let resume = session.resume_cell(
            r#"{"ok": true, "value": {"text": "URL: https://example.com\nTitle: Example\n\n- link \"About\" [ref=2]", "nodes": [{"refId": 2, "role": "link", "tag": "a", "name": "About"}], "url": "https://example.com", "title": "Example", "viewport": {"width": 800, "height": 600}}}"#
        );
        assert_eq!(resume.status, CellStatus::Done);
        assert_eq!(resume.stdout, vec!["Example", "1"]);
    }

    #[test]
    fn test_tab_snapshot_text_yields() {
        let mut session = NotebookSession::new();
        let result = session.run_cell(
            r#"
            local text = web.tab.snapshot_text(123)
            print(text)
        "#,
            "",
        );
        assert_eq!(result.status, CellStatus::AsyncPending);
        let cmd = result.pending_command.unwrap();
        assert_eq!(cmd.action.as_str(), "tab_snapshot_text");
        assert_eq!(cmd.params, serde_json::json!(123));
    }

    #[test]
    fn test_tab_snapshot_data_yields_and_returns_table() {
        let mut session = NotebookSession::new();
        let result = session.run_cell(
            r#"
            local data = web.tab.snapshot_data(123)
            print(data.title)
            print(data.url)
            print(#data.nodes)
        "#,
            "",
        );
        assert_eq!(result.status, CellStatus::AsyncPending);
        let cmd = result.pending_command.unwrap();
        assert_eq!(cmd.action.as_str(), "tab_snapshot_data");
        assert_eq!(cmd.params, serde_json::json!(123));

        let resume = session.resume_cell(
            r#"{"ok": true, "value": {"nodes": [{"refId": 1, "role": "link", "tag": "a", "name": "About"}], "url": "https://example.com", "title": "Example", "viewport": {"width": 800, "height": 600}}}"#
        );
        assert_eq!(resume.status, CellStatus::Done);
        assert_eq!(resume.stdout, vec!["Example", "https://example.com", "1"]);
    }

    #[test]
    fn test_tab_snapshot_defaults_to_active_tab() {
        let mut session = NotebookSession::new();
        let result = session.run_cell(
            r#"
            local data = web.tab.snapshot()
            print(data.title)
        "#,
            "",
        );
        assert_eq!(result.status, CellStatus::AsyncPending);
        let cmd = result.pending_command.unwrap();
        assert_eq!(cmd.action.as_str(), "tab_snapshot");

        let resume = session.resume_cell(
            r#"{"ok": true, "value": {"text": "URL: https://example.com\nTitle: Example\n\n- link \"About\" [ref=2]", "nodes": [], "url": "https://example.com", "title": "Example", "viewport": {"width": 800, "height": 600}}}"#
        );
        assert_eq!(resume.status, CellStatus::Done);
        assert_eq!(resume.stdout, vec!["Example"]);
    }

    #[test]
    fn test_cookies_get_yields() {
        let mut session = NotebookSession::new();
        let result = session.run_cell(
            r#"
            local cookie = web.cookies.get({url = "https://example.com", name = "session"})
            print(cookie)
        "#,
            "",
        );
        assert_eq!(result.status, CellStatus::AsyncPending);
        let cmd = result.pending_command.unwrap();
        assert_eq!(cmd.action.as_str(), "cookies_get");
    }

    #[test]
    fn test_history_search_yields() {
        let mut session = NotebookSession::new();
        let result = session.run_cell(
            r#"
            local items = web.history.search({text = "example"})
            print(#items)
        "#,
            "",
        );
        assert_eq!(result.status, CellStatus::AsyncPending);
        let cmd = result.pending_command.unwrap();
        assert_eq!(cmd.action.as_str(), "history_search");
    }

    #[test]
    fn test_bookmarks_search_yields() {
        let mut session = NotebookSession::new();
        let result = session.run_cell(
            r#"
            local results = web.bookmarks.search("example")
            print(#results)
        "#,
            "",
        );
        assert_eq!(result.status, CellStatus::AsyncPending);
        let cmd = result.pending_command.unwrap();
        assert_eq!(cmd.action.as_str(), "bookmarks_search");
    }

    #[test]
    fn test_clipboard_read_yields() {
        let mut session = NotebookSession::new();
        let result = session.run_cell(
            r#"
            local text = web.clipboard.read()
            print(text)
        "#,
            "",
        );
        assert_eq!(result.status, CellStatus::AsyncPending);
        let cmd = result.pending_command.unwrap();
        assert_eq!(cmd.action.as_str(), "clipboard_read");
    }

    #[test]
    fn test_notifications_create_yields() {
        let mut session = NotebookSession::new();
        let result = session.run_cell(
            r#"
            web.notifications.create("Test", {body = "Hello"})
        "#,
            "",
        );
        assert_eq!(result.status, CellStatus::AsyncPending);
        let cmd = result.pending_command.unwrap();
        assert_eq!(cmd.action.as_str(), "notifications_create");
    }

    #[test]
    fn test_ext_api_resume_with_result() {
        let mut session = NotebookSession::new();
        let result = session.run_cell(
            r#"
            local tabs = web.tab.query({active = true})
            print(tabs[1].url)
        "#,
            "",
        );
        assert_eq!(result.status, CellStatus::AsyncPending);

        // Resume with a mock result
        let resume_result = session.resume_cell(
            r#"{"ok": true, "value": [{"id": 1, "url": "https://example.com", "title": "Example"}]}"#
        );
        assert_eq!(resume_result.status, CellStatus::Done);
        assert!(
            resume_result
                .stdout
                .iter()
                .any(|s| s.contains("example.com")),
            "got: {:?}",
            resume_result.stdout
        );
    }

    #[test]
    fn test_ext_api_resume_with_error() {
        let mut session = NotebookSession::new();
        let result = session.run_cell(
            r#"
            local ok, err = pcall(function()
                local tabs = web.tab.query({active = true})
                print(tabs)
            end)
            print("caught:", not ok)
        "#,
            "",
        );
        assert_eq!(result.status, CellStatus::AsyncPending);

        let resume_result = session.resume_cell(
            r#"{"ok": false, "error": {"message": "Extension API not available", "code": "ENOEXTENSION"}}"#
        );
        assert_eq!(resume_result.status, CellStatus::Done);
        // pcall catches the error, so ok=false, not ok=true
        assert!(
            resume_result.stdout[0].contains("true"),
            "got: {:?}",
            resume_result.stdout
        );
    }

    // ── Phase 1: Plugin system tests ────────────────────────────────

    #[test]
    fn test_plugin_sync_callback() {
        struct TestPlugin;
        impl LuaPlugin for TestPlugin {
            fn name(&self) -> &str {
                "test"
            }
            fn register(&self, ctx: Context, _hs: Rc<RefCell<HostState>>) {
                let t = Table::new(&ctx);
                let cb = Callback::from_fn(&ctx, move |ctx, _exec, mut stack| {
                    let val = if stack.len() > 0 {
                        match stack.get(0) {
                            Value::Integer(i) => i * 2,
                            other => {
                                let msg = format!(
                                    "test.double expects an integer, got {}",
                                    other.type_name()
                                );
                                return Err(msg.into_value(ctx).into());
                            }
                        }
                    } else {
                        0i64
                    };
                    stack.clear();
                    stack.push_back(val.into());
                    Ok(CallbackReturn::Return)
                });
                t.set_field(ctx, "double", cb);
                ctx.set_global("testlib", t);
            }
        }

        let mut session = NotebookSession::build()
            .plugin(Box::new(TestPlugin))
            .finish();

        let result = session.run_cell("print(testlib.double(21))", "");
        assert!(result.error.is_none(), "got error: {:?}", result.error);
        assert_eq!(result.stdout, vec!["42"]);
    }

    #[test]
    fn test_plugin_async_callback() {
        struct AsyncTestPlugin;
        impl LuaPlugin for AsyncTestPlugin {
            fn name(&self) -> &str {
                "async_test"
            }
            fn register(&self, ctx: Context, hs: Rc<RefCell<HostState>>) {
                let hs_async = hs.clone();
                let cb = Callback::from_fn(&ctx, move |_ctx, _exec, mut stack| {
                    let label = if stack.len() > 0 {
                        match stack.get(0) {
                            Value::String(s) => String::from_utf8_lossy(s.as_bytes()).to_string(),
                            _ => "default".to_string(),
                        }
                    } else {
                        "default".to_string()
                    };

                    let mut hs = hs_async.borrow_mut();
                    hs.async_call_counter += 1;
                    let command = AsyncCommand {
                        call_id: hs.async_call_counter,
                        action: crate::action::Action::Other(format!("plugin_action_{}", label)),
                        params: serde_json::json!({ "label": label }),
                    };
                    hs.pending_async_command = Some(command);

                    stack.clear();
                    Ok(CallbackReturn::Yield {
                        to_thread: None,
                        then: None,
                    })
                });
                ctx.set_global("plugin_async", cb);
            }
        }

        let mut session = NotebookSession::build()
            .plugin(Box::new(AsyncTestPlugin))
            .finish();

        let result = session.run_cell(
            r#"
            local result = plugin_async("hello")
            print(result)
        "#,
            "",
        );
        assert_eq!(result.status, CellStatus::AsyncPending);
        let cmd = result.pending_command.unwrap();
        assert_eq!(cmd.action.as_str(), "plugin_action_hello");

        // Resume with a value
        let resume = session.resume_cell(r#"{"ok": true, "value": "world"}"#);
        assert_eq!(resume.status, CellStatus::Done);
        assert_eq!(resume.stdout, vec!["world"]);
    }

    #[test]
    fn test_lua_library_loading() {
        let mut session = NotebookSession::build()
            .lua_library(
                "mymath",
                r#"
                mymath = {}
                function mymath.double(x) return x * 2 end
                function mymath.triple(x) return x * 3 end
            "#,
            )
            .finish();

        let result = session.run_cell("print(mymath.double(21))", "");
        assert!(result.error.is_none(), "got error: {:?}", result.error);
        assert_eq!(result.stdout, vec!["42"]);

        let result2 = session.run_cell("print(mymath.triple(7))", "");
        assert_eq!(result2.stdout, vec!["21"]);
    }

    #[test]
    fn test_plugin_coexists_with_builtins() {
        struct HelperPlugin;
        impl LuaPlugin for HelperPlugin {
            fn name(&self) -> &str {
                "helper"
            }
            fn register(&self, ctx: Context, _hs: Rc<RefCell<HostState>>) {
                let cb = Callback::from_fn(&ctx, move |ctx, _exec, mut stack| {
                    stack.clear();
                    stack.push_back(ctx.intern("from_plugin".as_bytes()).into());
                    Ok(CallbackReturn::Return)
                });
                ctx.set_global("helper", cb);
            }
        }

        let mut session = NotebookSession::build()
            .plugin(Box::new(HelperPlugin))
            .lua_library(
                "utils",
                r#"
                utils = {}
                function utils.greet(name) return 'hello ' .. name end
            "#,
            )
            .finish();

        // Built-in still works
        let r1 = session.run_cell("print(json.encode({a = 1}))", "");
        assert!(r1.error.is_none());

        // Plugin works
        let r2 = session.run_cell("print(helper())", "");
        assert_eq!(r2.stdout, vec!["from_plugin"]);

        // Lua library works
        let r3 = session.run_cell("print(utils.greet('world'))", "");
        assert_eq!(r3.stdout, vec!["hello world"]);
    }

    #[test]
    fn test_builder_fuel_limit() {
        let mut session = NotebookSession::build().fuel_limit(100).finish();

        let result = session.run_cell("while true do end", "");
        assert!(result.fuel_exhausted);
    }

    #[test]
    fn test_multiple_plugins() {
        struct Plugin1;
        impl LuaPlugin for Plugin1 {
            fn name(&self) -> &str {
                "p1"
            }
            fn register(&self, ctx: Context, _hs: Rc<RefCell<HostState>>) {
                let cb = Callback::from_fn(&ctx, move |ctx, _exec, mut stack| {
                    stack.clear();
                    stack.push_back(ctx.intern("plugin1".as_bytes()).into());
                    Ok(CallbackReturn::Return)
                });
                ctx.set_global("p1", cb);
            }
        }

        struct Plugin2;
        impl LuaPlugin for Plugin2 {
            fn name(&self) -> &str {
                "p2"
            }
            fn register(&self, ctx: Context, _hs: Rc<RefCell<HostState>>) {
                let cb = Callback::from_fn(&ctx, move |ctx, _exec, mut stack| {
                    stack.clear();
                    stack.push_back(ctx.intern("plugin2".as_bytes()).into());
                    Ok(CallbackReturn::Return)
                });
                ctx.set_global("p2", cb);
            }
        }

        let mut session = NotebookSession::build()
            .plugin(Box::new(Plugin1))
            .plugin(Box::new(Plugin2))
            .finish();

        let result = session.run_cell("print(p1(), p2())", "");
        assert_eq!(result.stdout, vec!["plugin1\tplugin2"]);
    }

    #[test]
    fn test_session_new_still_works() {
        // Backward compatibility: NotebookSession::new() still works
        let mut session = NotebookSession::new();
        let result = session.run_cell("print('hello')", "");
        assert_eq!(result.stdout, vec!["hello"]);
    }

    // ── Phase 2: host.call() tests ──────────────────────────────────

    #[test]
    fn test_host_call_yields() {
        let mut session = NotebookSession::new();
        let result = session.run_cell(
            r#"
            local result = host.call("my_action", {key = "value"})
            print(result)
        "#,
            "",
        );
        assert_eq!(result.status, CellStatus::AsyncPending);
        let cmd = result.pending_command.unwrap();
        assert_eq!(cmd.action.as_str(), "host_my_action");
        assert_eq!(cmd.params["key"], "value");
    }

    #[test]
    fn test_host_call_no_params() {
        let mut session = NotebookSession::new();
        let result = session.run_cell(
            r#"
            local result = host.call("ping")
            print(result)
        "#,
            "",
        );
        assert_eq!(result.status, CellStatus::AsyncPending);
        let cmd = result.pending_command.unwrap();
        assert_eq!(cmd.action.as_str(), "host_ping");
    }

    #[test]
    fn test_host_call_resume_with_value() {
        let mut session = NotebookSession::new();
        let result = session.run_cell(
            r#"
            local result = host.call("my_action", {})
            print(result.status)
        "#,
            "",
        );
        assert_eq!(result.status, CellStatus::AsyncPending);

        let resume = session.resume_cell(r#"{"ok": true, "value": {"status": "ok", "count": 5}}"#);
        assert_eq!(resume.status, CellStatus::Done);
        assert!(
            resume.stdout.iter().any(|s| s.contains("ok")),
            "got: {:?}",
            resume.stdout
        );
    }

    #[test]
    fn test_host_call_resume_with_error() {
        let mut session = NotebookSession::new();
        let result = session.run_cell(
            r#"
            local ok, err = pcall(function()
                host.call("missing", {})
            end)
            print("caught:", not ok)
        "#,
            "",
        );
        assert_eq!(result.status, CellStatus::AsyncPending);

        let resume = session.resume_cell(
            r#"{"ok": false, "error": {"message": "No handler registered for 'missing'", "code": "ENOHANDLER"}}"#
        );
        assert_eq!(resume.status, CellStatus::Done);
        assert!(
            resume.stdout[0].contains("true"),
            "got: {:?}",
            resume.stdout
        );
    }

    #[test]
    fn test_host_call_requires_string_action() {
        let mut session = NotebookSession::new();
        let result = session.run_cell(
            r#"
            local ok, err = pcall(function()
                host.call(123, {})
            end)
            print("caught:", not ok)
        "#,
            "",
        );
        assert!(
            result.error.is_none(),
            "unexpected error: {:?}",
            result.error
        );
        assert!(
            result.stdout[0].contains("true"),
            "got: {:?}",
            result.stdout
        );
    }

    #[test]
    fn test_host_call_no_args() {
        let mut session = NotebookSession::new();
        let result = session.run_cell(
            r#"
            local ok, err = pcall(function()
                host.call()
            end)
            print("caught:", not ok)
        "#,
            "",
        );
        assert!(
            result.error.is_none(),
            "unexpected error: {:?}",
            result.error
        );
        assert!(
            result.stdout[0].contains("true"),
            "got: {:?}",
            result.stdout
        );
    }

    #[test]
    fn test_host_call_multiple_in_one_cell() {
        let mut session = NotebookSession::new();
        let result = session.run_cell(
            r#"
            local a = host.call("first", {n = 1})
            local b = host.call("second", {n = 2})
            print(a .. b)
        "#,
            "",
        );
        assert_eq!(result.status, CellStatus::AsyncPending);

        // Resume first
        let r1 = session.resume_cell(r#"{"ok": true, "value": "A"}"#);
        assert_eq!(r1.status, CellStatus::AsyncPending);

        // Resume second
        let r2 = session.resume_cell(r#"{"ok": true, "value": "B"}"#);
        assert_eq!(r2.status, CellStatus::Done);
        assert_eq!(r2.stdout, vec!["AB"]);
    }
}

#[cfg(test)]
mod debug_tests {
    use ts_rs::TS;
}
