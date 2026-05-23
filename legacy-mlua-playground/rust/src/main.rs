/// Emscripten calls main() on module init. We just need the runtime ready.
fn main() {
    // Force the linker to include run_lua from lib.rs
    let _ = lua_wasm::run_lua as extern "C" fn(*const i8, *const i8) -> *mut i8;
}
