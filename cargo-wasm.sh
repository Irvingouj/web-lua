#!/bin/bash
# Wrapper that ensures rustup's toolchain rustc is found first
export PATH="/Users/oujunyi/.rustup/toolchains/stable-aarch64-apple-darwin/bin:$PATH"
exec cargo "$@"
