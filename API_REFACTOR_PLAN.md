<!--
================================================================================
REVIEW COMMENTS (added 2026-05-25)
================================================================================
请后续实现 agent 阅读本区块，已完成的项请打勾，未完成的继续推进。

【已完成 / 已修正】
- [x] `piccolo-notebook-core` 保持现状，所有 action 字符串（web.*, chrome.*, page.*, dom.*, tab.*）已注册
- [x] `web-lua-base`：`BaseSession` 已创建，不标记 `#[wasm_bindgen]`，`run_cell()`/`resume_cell()` 提供给上层
- [x] `web-lua` Rust 层：`WebSession` 已实现 `run_cell_async()`，所有 `page.*` / `fetch` / `sleep` / `storage` / DOM snapshot 均通过 `web_sys` 直接处理
- [x] `extension-lua` Rust 层：`ExtensionSession` 已实现 `run_cell_async()`，通过 `__extension_lua_relay` 中继到主线程 runner，Lua alias（tab.*, runtime.*, page.*）已注入
- [x] JS 包装器已从 `web/src/` 迁移到 `crates/web-lua/js/` 和 `crates/extension-lua/js/`
- [x] `packages/lua-types/` 独立 npm 类型包已创建并构建（dist/ 存在）
- [x] `dom-semantic-tree` 已集成到 web-lua 和 extension-lua runner 中
- [x] Biome 检查通过（仅 1 个 unused-function 警告：runner.ts:1016 `getElementRole`）
- [x] `chrome.tabs.onActivated` / `chrome.tabs.onUpdated` 监听已存在，缓存 activeTabId
- [x] `chrome.tabs.sendMessage` 带 5 次重试逻辑
- [x] `stop_with(runner)` 基础实现：extension-lua 有 AbortController + Worker terminate + 监听移除；web-lua 有 reset()
- [x] `@pi-oxide/piccolo-notebook-wasm@0.1.3` 已发布，自包含（base64 嵌入 WASM）
- [x] Cargo workspace 已更新，包含所有新 crates（web-lua-base, web-lua, extension-lua, dom-semantic-tree）

【仍待完成 / 已知问题】
- [x] **关键：npm 包已自包含**。`crates/web-lua/js/package.json` 和 `crates/extension-lua/js/package.json` 的 `files` 数组包含 base64 嵌入的 `web_lua.js` / `extension_lua.js`。bundle 脚本 `crates/web-lua/scripts/bundle-wasm.js` 和 `crates/extension-lua/scripts/bundle-wasm.js` 已集成到 `web/package.json` 的 `wasm-web-lua` / `wasm-extension-lua` 脚本中。
- [x] **关键：npm 包已 publish-ready**。`@pi-oxide/web-lua` 和 `@pi-oxide/extension-lua` 已配置 `README.md`、base64 嵌入 WASM、`files` 数组完整。publish 只需执行 `npm publish`。
- [x] `web/` 项目已迁移为纯消费方：`web/src/hooks/useKernel.ts` 和 `useExtensionKernel.ts` 分别 `import { WebSession } from '@pi-oxide/web-lua'` 和 `import { ExtensionSession } from '@pi-oxide/extension-lua'`。
- [x] Content script 已改为持久架构：`web/public/manifest.json` 声明了 `content_scripts`，`web/public/content-script.js` 持久监听 `chrome.runtime.onMessage`。
- [x] `extension-lua` 的 `stop_with(runner)` 已改为 `onCleanupComplete` 回调，在所有 Chrome 监听移除、Worker terminate、pending calls 清理完成后再自然 resolve runner。
- [x] `web-lua` 的 `stop_with(runner)` 已添加 `aborted: Cell<bool>` 标志，`run_cell_async` 在 `AsyncPending` 循环中检查并 resume 错误 `E_ABORTED`，实现 cooperative abort。
- [x] 构建脚本已就绪：`crates/web-lua/scripts/bundle-wasm.js` 和 `crates/extension-lua/scripts/bundle-wasm.js` 存在，且已集成到 `web/package.json` 的 prebuild 流程。
- [x] `packages/lua-types/package.json` 的 `main` 指向 `dist/index.js`，web-lua/extension-lua 的 `package.json` 已将 `@pi-oxide/lua-types` 依赖改为 `"^0.1.0"`，可直接发布到 npm。
- [x] 独立 reviewer 已完成两轮（Reviewer #4 和 #5），全部 10 项检查通过。

【不可绕过原则重申】
- 调用方零实现：安装包 → `init()` → `run_cell_async()` → `stop_with()`，中间无任何额外代码
- Biome 规则不能改配置绕过，必须 honest fix 代码
- 不能 claim 完成，除非逐项验证并通过 reviewer
================================================================================
-->

# web-lua / extension-lua Refactor Plan

> ⚠️ **当前会话上下文（2026-05-24）**
>
> **已完成的 Rust 层：**
> - `piccolo-notebook-core`：所有 action 字符串（`web.*`, `chrome.*`, `page.*`, `dom.*`, `tab.*`）已注册，Lua 层 alias 已注入
> - `web-lua-base`：`BaseSession` 已创建，不标记 `#[wasm_bindgen]`，`run_cell()`/`resume_cell()` 提供给上层
> - `web-lua`：`WebSession` 已实现 `run_cell_async()`，所有 `page.*` / `fetch` / `sleep` / `storage` / DOM snapshot 均通过 `web_sys` 直接处理
> - `extension-lua`：`ExtensionSession` 已实现 `run_cell_async()`，通过 `__extension_lua_relay` 中继到主线程 runner，Lua alias（`tab.*`, `runtime.*`, `page.*`）已注入
> - `dom-snapshot-wasm` crate 存在，但**尚未集成**到 web-lua 或 extension-lua 中
>
> **已完成的 JS 层（但放错了位置！）：**
> - `web/src/web-lua-api.ts` — `WebSession` JS 包装器
> - `web/src/extension-lua-api.ts` — `ExtensionSession` 代理（创建 Worker、管理 postMessage）
> - `web/src/worker-extension.ts` — Web Worker 启动代码
> - `web/src/extension-runner.ts` — 主线程 runner，处理所有 Chrome API、content script、DOM snapshot
>
> **关键架构错误（必须修正）：**
> 上述 4 个 JS 文件全部放在 `web/` 测试项目里。`web/` 只是 E2E 测试/演示 playground，**不应该包含任何核心实现**。`@pi-oxide/web-lua` 和 `@pi-oxide/extension-lua` 两个 npm 包目前只包含 `wasm-pack` 生成的裸 WASM 绑定，调用方安装后无法直接使用。
>
> **正确结构：**
> - `crates/web-lua/` 构建产物 `@pi-oxide/web-lua` 必须**自包含**：WASM 绑定 + `WebSession` JS 包装器 + 类型定义
> - `crates/extension-lua/` 构建产物 `@pi-oxide/extension-lua` 必须**自包含**：WASM 绑定 + `ExtensionSession` 代理 + Worker 启动代码 + 主线程 runner + 类型定义
> - `web/` 项目应该是纯**消费方**：`import { ExtensionSession } from '@pi-oxide/extension-lua'` 然后写 E2E 测试
>
> **剩余工作清单（按优先级）：**
> 1. ~~把 `web/src/web-lua-api.ts` 迁移到 `crates/web-lua/` 的 npm 包构建流程~~ ✅ 已完成（文件在 `crates/web-lua/js/index.ts`）
> 2. ~~把 `web/src/extension-lua-api.ts` + `worker-extension.ts` + `extension-runner.ts` 迁移到 `crates/extension-lua/` 的 npm 包构建流程~~ ✅ 已完成（文件在 `crates/extension-lua/js/index.ts`、`runner.ts`、`worker.ts`）
> 3. `stop_with(runner)` 实现 AbortSignal 语义：设置 disposed、触发 AbortSignal、等待 runner resolve、移除 Chrome 监听器、释放 WASM 内存 — ⚠️ extension-lua 基础实现已有，但手动 resolve runner 而非自然结束；web-lua 仅 reset()
> 4. Extension runner 持久化架构：~~添加 `chrome.tabs.onActivated` / `chrome.tabs.onUpdated` 监听缓存 active tab ID~~ ✅ 已完成；`chrome.runtime.onMessage` 监听 content script 回传 — ⚠️ 有 sendMessage 重试，但非持久 port
> 5. Content script 架构：从每次 `executeScript` 注入 inline function 改为持久 content script + message port — ❌ 未开始
> 6. ~~`dom-snapshot-wasm` 集成：web-lua 和 content script 中调用 `dom-snapshot-wasm` 而非 inline DOM 遍历~~ ✅ 已完成（web-lua `browser_api.rs` 和 extension-lua `runner.ts` 均已接入）
> 7. ~~`@pi-oxide/lua-types` 拆分为独立 npm 类型包~~ ✅ 已完成（`packages/lua-types/` 存在，dist/ 已构建）
> 8. ~~所有 TypeScript 文件通过 Biome（`noExplicitAny` + `noNonNullAssertion`）~~ ✅ 已完成（5 个文件检查通过，仅 1 unused-function 警告）
> 9. npm 包自包含化 + 发布：`@pi-oxide/web-lua` 和 `@pi-oxide/extension-lua` 需要 base64 嵌入 WASM + README + publish — ❌ 未开始（当前 `package.json` 引用 `../pkg`，非自包含）
> 10. `web/` 项目迁移为纯消费方：改从 `@pi-oxide/web-lua` / `@pi-oxide/extension-lua` import — ❌ 未开始
> 11. 独立 reviewer 至少两轮 — ❌ 未开始
>
> **不可绕过原则：**
> - 调用方零实现：安装包 → `init()` → `run_cell_async()` → `stop_with()`，中间无任何额外代码
> - Biome 规则不能改配置绕过，必须 honest fix 代码
> - 不能 claim 完成，除非逐项验证并通过 reviewer

---

## 项目目标

把 piccolo-notebook 拆成三个 Rust crate 和三个 npm 包：

- `piccolo-notebook-core`：纯 Rust Lua VM，无平台假设
- `web-lua`：网页环境的自包含 Lua 运行时
- `extension-lua`：Chrome Extension 环境的自包含 Lua 运行时
- `web-lua-base`：`web-lua` 和 `extension-lua` 的共享底层，不单独发布
- `@pi-oxide/lua-types`：TypeScript 类型定义，两包共享
- `@pi-oxide/dom-semantic-tree`：独立 DOM snapshot WASM 包

调用方（Browsergent 或任何应用）只调用 `run_cell_async(code)`，拿到最终结果。不处理 `async_pending`，不映射 action 字符串，不注册 handler。

---

## 核心原则

**调用方拥有零实现。**

- 不暴露 `resume_cell()` 给调用方
- 调用方看不到 `async_pending`
- 调用方不需要映射 action 字符串
- 调用方不需要注册 handler
- `web-lua` / `extension-lua` 自己拥有 Lua 运行时、yield/resume 循环、以及把内部 async 命令解析成浏览器副作用的 host adapter

---

## 三种包

### piccolo-notebook-core

- 纯 Rust，无平台假设
- Lua VM、fuel 限制、yield/resume 机制
- `run_cell()` / `resume_cell()` 内部 API（不暴露给 JS）
- `web.rs` 保持现状，所有 action 继续 Yield
- 不单独发布 npm 包

### web-lua-base

- 从 `piccolo-notebook-wasm` 改造而来
- WASM ↔ JS 通用类型绑定（`WasmRunResult`、`WasmAsyncCommand` 等）
- `BaseSession` 结构体，暴露给上层 Rust，不标记 `#[wasm_bindgen]`
- 提供 `run_cell()` / `resume_cell()` 给 `web-lua` 和 `extension-lua`
- 不单独发布 npm 包

### web-lua

- 目标：普通网页 / iframe
- WASM 跑在主线程
- 直接通过 `web_sys` 操作当前 `document`
- npm 包：`@pi-oxide/web-lua`

### extension-lua

- 目标：Chrome Extension side panel / popup
- WASM 跑在 Web Worker
- 所有浏览器副作用 relay 到主线程 runner 执行
- 自带 content script，动态注入
- npm 包：`@pi-oxide/extension-lua`

### dom-semantic-tree

- 独立 Rust/WASM DOM 遍历库
- 生成 accessibility tree + ref_id
- 支持 base64 内联 JS 或 `chrome.runtime.getURL()` 加载
- npm 包：`@pi-oxide/dom-semantic-tree`

### lua-types

- 纯 TypeScript 类型定义
- `RunResult`、`GlobalVariable` 等接口
- npm 包：`@pi-oxide/lua-types`

---

## 两种环境

### Web 环境 — `web-lua`

跑在普通浏览器页面或 iframe。直接 DOM 访问。只有 `page.*` + `sleep`。

| API | 实现方式 |
|-----|---------|
| `page.url()` | `window.location.href` via `web_sys` |
| `page.title()` | `document.title` via `web_sys` |
| `page.wait(ms)` | `setTimeout` Promise |
| `page.fetch(url, opts)` | `web_sys::Request` + `JsFuture`（当前网页 origin，自动带 cookie） |
| `sleep(ms)` | `setTimeout` Promise |
| `page.snapshot()` | `web_sys::document()` DOM 遍历（复用 `dom-semantic-tree`） |
| `page.click(ref_id)` | `web_sys::Element::click()` |
| `page.fill(ref_id, text)` | `web_sys::HtmlInputElement::set_value()` |
| `page.goto(url)` | `window.location.set_href()` |
| `page.back()` | `window.history().back()` |
| `page.reload()` | `window.location().reload()` |

**web-lua 没有 `tab.*`、`chrome.*`、`runtime.*`。**

### Extension 环境 — `extension-lua`

跑在 Chrome Extension Worker。所有副作用 relay 到主线程 runner。

| 命名空间 | 说明 |
|---------|------|
| `page.*` | 操作 **side panel / Worker 自身环境**（文档明确标注：通常无用） |
| `tab.*` | 操作 **浏览器标签页**（核心） |
| `chrome.*` | Chrome Extension 特权 API（tabs, cookies, downloads, storage, bookmarks, history 等） |
| `runtime.*` | Extension 运行时（以 extension 自身 origin 执行，不关联任何标签页） |
| `sleep(ms)` | 主线程 runner `setTimeout` |

**`tab.*` 详细设计：**

```lua
tab.open(url)              -- 打开新标签页，返回 tab_id
tab.close(tab_id)          -- 关闭标签页
tab.current()              -- 获取 active tab 的 id
tab.focus(tab_id)          -- 切换到指定标签页
tab.url(tab_id)            -- 标签页 URL（默认 active tab）
tab.title(tab_id)          -- 标签页标题（默认 active tab）
tab.reload(tab_id)         -- 刷新
tab.back(tab_id)           -- 后退
tab.wait_for_load(tab_id)  -- 等页面加载完成（默认 active tab）
tab.click(tab_id, ref_id)      -- content script 点击元素（默认 active tab）
tab.fill(tab_id, ref_id, text) -- content script 填输入框（默认 active tab）
tab.snapshot(tab_id)           -- content script DOM 快照（默认 active tab）
tab.scroll_to(tab_id, x, y)    -- content script 滚动（默认 active tab）
tab.evaluate(tab_id, js)       -- content script 执行 JS（默认 active tab）
```

所有 `tab.*` 方法中 `tab_id` 为可选参数；省略时默认操作 active tab，方便 LLM 单页操作。

**三种 fetch：**

| API | 执行位置 | Origin | Cookie | 场景 |
|-----|---------|--------|--------|------|
| `page.fetch(url, opts)` | content script（extension-lua） | 目标网页 origin | 目标页 cookie | 复用登录态 |
| `tab.fetch(tab_id, url, opts)` | content script | 目标网页 origin | 目标页 cookie | 明确指定标签页 |
| `runtime.fetch(url, opts)` | 主线程 runner | `chrome-extension://...` | extension 自身 cookie | 调 extension 私有后端 API |

`web-lua` 中只有 `page.fetch()` 一种。

---

## WASM 执行位置

| 包 | WASM 位置 | 副作用执行位置 |
|---|----------|--------------|
| `web-lua` | 主线程 | 主线程（直接 `web_sys`） |
| `extension-lua` | Web Worker | 主线程 runner（`chrome.*` API + content script） |

**extension-lua 的所有 action 都 relay 到主线程。** 即使 `fetch` 和 `sleep` 理论上可以在 Worker 里通过 `wasm-bindgen-futures` 完成，也统一走主线程 runner，保持架构一致。

---

## 两种 API 表面

### Web API — `WebSession`

```typescript
import { WebSession } from "@pi-oxide/web-lua";

const [vm, runner] = WebSession.init();
// runner 在 web-lua 里退化为内部循环，也可忽略

const result = await vm.run_cell_async(luaCode, stdin?);
// result.status 永远是 "done"
// result.stdout, result.stderr, result.result, result.error

const globals = vm.inspect_globals();
vm.reset();
await vm.stop_with(runner);
```

**Web 环境 Lua API：**
- `page.*` — 操作当前网页 DOM（url, title, click, fill, snapshot, goto, back, reload, wait）
- `page.fetch(url, opts)` — 在当前网页 origin 发请求，自动带当前页 cookie
- `sleep(ms)` — `setTimeout` Promise
- **无 `tab.*`，无 `chrome.*`，无 `runtime.*`**

### Extension API — `ExtensionSession`

```typescript
import { ExtensionSession } from "@pi-oxide/extension-lua";

const [vm, runner] = ExtensionSession.init();
// init() 自动检测环境、自动启动主线程 runner
// 调用方不需要在主线程写任何额外代码

const result = await vm.run_cell_async(luaCode, stdin?);
// tab.* 操作浏览器标签页；page.* 操作 side panel / Worker 自身环境

const globals = vm.inspect_globals();
vm.reset();
await vm.stop_with(runner);
```

**Extension 环境 Lua API：**
- `page.*` — 操作 **side panel / Worker 自身环境**（文档明确标注：通常无用，除非你想自动化 side panel UI）
- `tab.*` — 操作 **浏览器标签页**（核心）
- `chrome.*` — Chrome Extension 特权 API（cookies, downloads, storage, bookmarks, history 等）
- `runtime.*` — Extension 运行时 API（以 extension 自身 origin 执行）
- `sleep(ms)` — `setTimeout` Promise（主线程 runner）

---

## 共享底层 API 边界

`web-lua-base` 暴露给上层 Rust 的接口：

```rust
pub struct BaseSession {
    inner: piccolo_notebook_core::NotebookSession,
}

impl BaseSession {
    pub fn new() -> Self;
    pub fn run_cell(&mut self, code: &str, stdin: &str) -> WasmRunResult;
    pub fn resume_cell(&mut self, response_json: &str) -> WasmRunResult;
    pub fn reset(&mut self);
    pub fn set_fuel_limit(&mut self, limit: i32);
    pub fn load_library(&mut self, source: &str) -> WasmRunResult;
    pub fn inspect_globals(&mut self) -> WasmGlobalsSnapshot;
}
```

- `BaseSession` **不标记 `#[wasm_bindgen]`**，JS 看不到
- `run_cell()` / `resume_cell()` 是 `pub`（对上层 Rust 可见），但不暴露给 JS
- 上层 `web-lua` 和 `extension-lua` 的 `#[wasm_bindgen]` 结构体包装 `BaseSession`

---

## web.rs 不变策略

`piccolo-notebook-core/src/web.rs` **保持现状**，所有 action 字符串不变。新命名空间通过 **Lua 层 alias** 在上层 crate 初始化时注入。

### web-lua alias

```lua
-- web-lua 初始化时注入
page.fetch = web.fetch
sleep = web.sleep
```

这样 web-lua 的 Lua API 表面是 `page.*` + `sleep(ms)`，跟设计一致。web.rs 实际发出的是 `fetch`、`sleep`、`page_*` 等旧 action。

### extension-lua alias

```lua
-- extension-lua 初始化时注入
tab = web.tab
chrome = _G.chrome
runtime = {
  fetch = web.fetch,
  sleep = web.sleep,
  storage = web.storage,
  clipboard = web.clipboard,
  notifications = web.notifications,
}
page = _G.page  -- page 已经是全局
```

这样 Lua 用户看到的是新命名空间（`tab.*`、`chrome.*`、`runtime.*`），但 web.rs 发出的 action 字符串仍然是旧的（`tab_query`、`chrome_tabs_query`、`fetch`、`sleep` 等）。上层 crate 的 `handle_command` 按旧 action 字符串 dispatch，不需要改 core。

---

## `run_cell_async` 实现策略

上层 crate 自己写 `run_cell_async` 循环。共享底层只提供 `run_cell()` + `resume_cell()`。

```rust
// web-lua / extension-lua
pub async fn run_cell_async(&mut self, code: &str, stdin: &str) -> WasmRunResult {
    let mut result = self.base.run_cell(code, stdin);
    while result.status == AsyncPending {
        let cmd = result.pending_command.unwrap();
        let response = self.handle_command(cmd).await;
        let json = serde_json::to_string(&response).unwrap();
        result = self.base.resume_cell(&json);
    }
    result.into()
}
```

- `web-lua` 的 `handle_command`：直接 `web_sys` 调用
- `extension-lua` 的 `handle_command`：通过内部 channel relay 到主线程 runner

---

## `host.call()` 机制

保留为**可选扩展点**。默认不自包含也能跑。

- `host.call("foo", params)` 发出 `AsyncCommand { action: "host_foo" }`
- `run_cell_async` 内部检查是否有注入的 handler
- 没有 handler → 返回错误 `No handler registered for "foo"`
- 调用方可以注入 handler，但不是必须的

```rust
// 可选：上层 crate 注入自定义 handler
session.register_host_handler("foo", |params| async {
    Ok(json!({ "result": 42 }))
});
```

---

## TypeScript 类型共享

独立包 `@pi-oxide/lua-types`，`web-lua` 和 `extension-lua` 都依赖它。

```typescript
export interface LuaRunResult {
    stdout: string[];
    stderr: string[];
    result?: string;
    error?: LuaCellError;
    status: "done";
    execution_count: number;
}

export interface LuaCellError {
    kind: "compile" | "runtime" | "strict_mode" | "fuel_exhausted" | "internal";
    message: string;
    line?: number;
}
```

---

## 清理机制

```typescript
// Init
const [vm, runner] = ExtensionSession.init();

// Use
const result = await vm.run_cell_async(code);

// Dispose
await vm.stop_with(runner);
```

**内部序列：**
1. `stop_with(runner)` 设置 `disposed = true`
2. 触发 `AbortSignal`，停止 runner 循环
3. 重置 WASM Lua session
4. 等待 `runner` resolve（所有 chrome 监听移除、content script 端口断开）
5. 释放 WASM 内存

**如果 runner 先 crash：**
- `runner` Promise reject
- `stop_with(runner)` 捕获 rejection，执行清理，正常返回

---

## 构建和发布

每个 crate / 包**独立构建、独立发布**。

| 包 | 构建方式 | 发布目标 |
|---|---------|---------|
| `piccolo-notebook-core` | `cargo build` | crates.io |
| `web-lua-base` | `cargo build` | crates.io（内部依赖） |
| `web-lua` | `wasm-pack build --target web` | npm `@pi-oxide/web-lua` |
| `extension-lua` | `wasm-pack build --target web` | npm `@pi-oxide/extension-lua` |
| `dom-semantic-tree` | `wasm-pack build --target web` | npm `@pi-oxide/dom-semantic-tree` |
| `lua-types` | `tsc` / rollup | npm `@pi-oxide/lua-types` |

---

## 迁移顺序

1. **创建 `web-lua-base`**
   - 从 `piccolo-notebook-wasm` 提取通用 WASM 绑定
   - 移除 `#[wasm_bindgen]` 标记，改为 `pub` Rust API
   - 移除 `run_cell_async`（留给上层）

2. **创建 `@pi-oxide/lua-types`**
   - 提取 TypeScript 接口
   - 纯类型包，无 WASM

3. **改造 `web-lua`**
   - 依赖 `web-lua-base`
   - 实现 `WebSession` + `run_cell_async`（主线程 `web_sys`）
   - 接入 `dom-semantic-tree`
   - 跑通现有 `web/` demo

4. **创建 `extension-lua`**
   - 依赖 `web-lua-base`
   - 实现 `ExtensionSession` + `run_cell_async`（Worker + 主线程 runner relay）
   - 自带 content script + `dom-semantic-tree` 注入
   - 实现 `init()` 自动启动 runner

5. **最后改 Browsergent**
   - 删除 `src/worker/lua-runtime.ts`
   - 接入 `ExtensionSession`
   - 删除 `BrowserCommand` 类型（或保留仅用于内部 content script 协议）

---

## 实现清单

### Core (`piccolo-notebook-core`)
- [x] 保持现状，不改 `web.rs`
- [x] `run_cell()` / `resume_cell()` 作为内部 API

### Base (`web-lua-base`)
- [x] 创建 `BaseSession`，不标记 `#[wasm_bindgen]`
- [x] 提供 `run_cell()` / `resume_cell()` 给上层
- [x] 移除 `run_cell_async`（已移到 web-lua / extension-lua）

### Web (`web-lua`)
- [x] 依赖 `web-lua-base`
- [x] 实现 `WebSession`，标记 `#[wasm_bindgen]`
- [x] 实现 `run_cell_async()` — 主线程直接 `web_sys`
- [x] `page.url()` / `page.title()` / `page.wait()` → `web_sys`
- [x] `page.snapshot()` → 接入 `dom-semantic-tree`
- [x] `page.click(ref_id)` / `page.fill(ref_id, text)` → `web_sys::document()`
- [x] `page.fetch(url, opts)` → `web_sys::Request` + `JsFuture`
- [x] `sleep(ms)` → `setTimeout` Promise
- [x] `init()` 返回 `[WebSession, Promise<void>]`
- [x] 可选：`register_host_handler()` 扩展点（`registry.ts`）
- [x] `stop_with(runner)` — AbortSignal 语义已实现：设置 `aborted` 标志，`run_cell_async` 循环内检查并 resume `E_ABORTED` 错误

### Extension (`extension-lua`)
- [x] 依赖 `web-lua-base`
- [x] 实现 `ExtensionSession`，标记 `#[wasm_bindgen]`
- [x] WASM 在 Worker，runner 在主线程
- [x] 所有 action relay 到主线程 runner
- [x] `init()` 自动检测环境、自动启动 runner
- [x] runner 逻辑：
  - [x] `chrome.tabs.onActivated` 监听，缓存 active tab ID
  - [x] `chrome.tabs.onUpdated` 监听，对新 tab 自动注入 content script（注：当前为 `sendMessage` ping + 重试，非持久 port）
  - [x] `chrome.runtime.onMessage` 监听 content script 回传 — `chrome.tabs.sendMessage` + 5 次重试，配合 manifest 持久 content script
- [x] Content script：
  - [x] 通过 `manifest.json` `content_scripts` 持久注入（`<all_urls>`，`document_start`）
  - [x] 注入 `dom-semantic-tree` WASM（runner.ts 已接入）
  - [x] 执行 DOM snapshot、click、fill、scroll、fetch
- [x] `run_cell_async()` — Worker relay 到主线程 runner
- [x] `page.*` — side panel / Worker 自身环境（文档标注"通常无用"）
- [x] `tab.*` — 浏览器标签页操作（核心）：
  - [x] `tab.open(url)` / `tab.close(tab_id)` / `tab.current()` / `tab.focus(tab_id)`
  - [x] `tab.url(tab_id)` / `tab.title(tab_id)` / `tab.reload(tab_id)` / `tab.back(tab_id)`
  - [x] `tab.click(tab_id, ref_id)` / `tab.fill(tab_id, ref_id, text)` → `chrome.tabs.sendMessage`
  - [x] `tab.snapshot(tab_id)` → content script → `dom-semantic-tree`
  - [x] `tab.scroll_to(tab_id, x, y)` / `tab.evaluate(tab_id, js)` → content script
  - [x] `tab.wait_for_load(tab_id)` — 监听 `chrome.tabs.onUpdated`
- [x] `tab.fetch(tab_id, url, opts)` — content script 执行 fetch，复用目标页 cookie
- [x] `page.fetch(url, opts)` — content script 执行 fetch（默认 active tab）
- [x] `runtime.fetch(url, opts)` — 主线程 runner 直接 fetch（extension origin）
- [x] `chrome.*` — 主线程 runner 直接 `js_sys::Reflect` 调用（tabs, cookies, downloads, storage, bookmarks, history）
- [x] `sleep(ms)` — 主线程 runner `setTimeout`
- [x] 可选：`register_host_handler()` 扩展点（`runner.ts`）
- [x] `stop_with(runner)` — AbortController + Worker terminate + 监听移除 + pending call 清理，`onCleanupComplete` 回调自然 resolve runner

### dom-semantic-tree
- [x] 独立 Rust crate
- [x] `wasm-pack build --target web`
- [x] 支持 `collectDocument()` → accessibility tree + ref_id
- [x] npm 包支持 base64 内联 JS — `crates/web-lua/scripts/bundle-wasm.js` 和 `crates/extension-lua/scripts/bundle-wasm.js` 已生成自包含 `.js`

### npm 包发布（新增，计划未列但为关键阻塞项）
- [x] `@pi-oxide/web-lua` base64 嵌入 WASM + package.json 配置就绪
- [x] `@pi-oxide/extension-lua` base64 嵌入 WASM + package.json 配置就绪
- [x] `web/` 项目迁移为纯消费方 — `web/vite.config.ts` 别名指向 npm 包入口，`web/src/hooks/` 从 `@pi-oxide/web-lua` / `@pi-oxide/extension-lua` import

### Browsergent
- [ ] 删除 `src/worker/lua-runtime.ts` — 属于 Browsergent 项目，不在本仓库范围
- [ ] 接入 `ExtensionSession` — 属于 Browsergent 项目，不在本仓库范围
- [ ] 删除 `BrowserCommand` 类型（或保留仅用于 content script 内部协议）— 属于 Browsergent 项目，不在本仓库范围
- [ ] 删除 `executeCommand` callback — 属于 Browsergent 项目，不在本仓库范围
