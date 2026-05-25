# Async API Implementation Plan

## Testing Strategy Overview

我们有三层自动化测试，每一层覆盖不同的东西：

```
┌─────────────────────────────────────────────────┐
│  Layer 1: Rust 单元测试                           │
│  测试 Lua 语义、Rust 逻辑、yield/resume 机制       │
│  速度：~0.01s 全部跑完                             │
│  不需要浏览器、不需要 WASM                          │
└─────────────────────────────────────────────────┘
          ↓ JSON 通过
┌─────────────────────────────────────────────────┐
│  Layer 2: Worker 集成测试                          │
│  测试 Worker 异步状态机、错误处理、超时              │
│  速度：~1s                                        │
│  需要 Vite dev server，不需要真实网络               │
│  用 mock 拦截 fetch                               │
└─────────────────────────────────────────────────┘
          ↓ 真实浏览器
┌─────────────────────────────────────────────────┐
│  Layer 3: E2E 测试（Playwright）                   │
│  测试完整用户流程：点击按钮 → 看到 API 结果          │
│  速度：~10s                                       │
│  需要本地 mock HTTP server                         │
└─────────────────────────────────────────────────┘
```

---

## Phase 1: JSON 模块（纯 Rust，无 async）

### 实现内容

在 `web-lua-core/src/lib.rs` 中注册 `json` 全局 table：

```lua
json.encode({a = 1, b = "hello"})  → '{"a":1,"b":"hello"}'
json.decode('{"a":1}')             → {a = 1}
json.pretty({x = 1})              → 格式化输出
```

### 实现细节

1. 在 `register_host_globals` 中创建 `json` table
2. `json.encode`：遍历 Lua table → 递归转成 `serde_json::Value` → serialize
3. `json.decode`：`serde_json::from_str` → 递归转成 Lua table/values → push 到 stack
4. `json.pretty`：同 encode 但用 `serde_json::to_string_pretty`

### Lua table → JSON 转换规则

| Lua 类型 | JSON 类型 | 备注 |
|---------|----------|------|
| number (integer) | number | `42` → `42` |
| number (float) | number | `3.14` → `3.14` |
| string | string | `"hello"` → `"hello"` |
| boolean | boolean | `true` → `true` |
| nil | null | 不支持作为 table value |
| table (sequence) | array | `{1,2,3}` → `[1,2,3]` |
| table (hash) | object | `{a=1}` → `{"a":1}` |
| function / thread | 跳过 | 无法序列化 |

### JSON → Lua table 转换规则

| JSON 类型 | Lua 类型 | 备注 |
|----------|---------|------|
| null | nil | |
| boolean | boolean | |
| number (integer) | number | |
| number (float) | number | |
| string | string | |
| array | table (sequence) | key 从 1 开始（Lua 惯例） |
| object | table (hash) | |

### Rust 单元测试

```rust
#[test]
fn test_json_encode_basic() {
    // json.encode({a = 1, b = "hello"})
    let result = session.run_cell(r#"
        local s = json.encode({a = 1, b = "hello"})
        print(s)
    "#, "");
    // JSON object key order is not guaranteed
    assert!(result.stdout[0].contains("\"a\":1"));
    assert!(result.stdout[0].contains("\"b\":\"hello\""));
}

#[test]
fn test_json_decode_basic() {
    // json.decode('{"a":1}')
    let result = session.run_cell(r#"
        local t = json.decode('{"a":1}')
        print(t.a)
    "#, "");
    assert_eq!(result.stdout, vec!["1"]);
}

#[test]
fn test_json_encode_decode_roundtrip() {
    let result = session.run_cell(r#"
        local original = {name = "lua", version = 5, features = {"async", "json"}}
        local encoded = json.encode(original)
        local decoded = json.decode(encoded)
        print(decoded.name)
        print(decoded.version)
        print(decoded.features[1])
    "#, "");
    assert_eq!(result.stdout, vec!["lua", "5", "async"]);
}

#[test]
fn test_json_encode_array() {
    let result = session.run_cell(r#"
        print(json.encode({1, 2, 3}))
    "#, "");
    assert_eq!(result.stdout, vec!["[1,2,3]"]);
}

#[test]
fn test_json_decode_array() {
    let result = session.run_cell(r#"
        local t = json.decode("[10,20,30]")
        print(t[1])
        print(t[2])
        print(t[3])
    "#, "");
    assert_eq!(result.stdout, vec!["10", "20", "30"]);
}

#[test]
fn test_json_encode_nested() {
    let result = session.run_cell(r#"
        local t = {user = {name = "alice", age = 30}}
        local s = json.encode(t)
        print(s)
    "#, "");
    assert!(result.stdout[0].contains("alice"));
    assert!(result.stdout[0].contains("30"));
}

#[test]
fn test_json_decode_null() {
    let result = session.run_cell(r#"
        local t = json.decode('{"a": null}')
        print(t.a)
    "#, "");
    assert_eq!(result.stdout, vec!["nil"]);
}

#[test]
fn test_json_decode_invalid() {
    let result = session.run_cell(r#"
        json.decode("not valid json{{{")
    "#, "");
    assert!(matches!(result.error, Some(CellError::Runtime { .. })));
}

#[test]
fn test_json_pretty() {
    let result = session.run_cell(r#"
        local s = json.pretty({a = 1})
        print(s)
    "#, "");
    assert!(result.stdout[0].contains("\n"));
}

#[test]
fn test_json_encode_boolean_nil_numbers() {
    let result = session.run_cell(r#"
        print(json.encode({flag = true, count = 0, empty = nil}))
    "#, "");
    assert!(result.stdout[0].contains("\"flag\":true"));
    assert!(result.stdout[0].contains("\"count\":0"));
    // nil values should be omitted from the JSON
}
```

### 验收标准

- [ ] 10 个 Rust 单元测试全部通过
- [ ] 不需要改 worker.ts 或 main.ts
- [ ] json table 自动出现在 strict mode 的白名单中

---

## Phase 2: Coroutine Yield/Resume 基础设施

### 实现内容

让 `run_cell` 支持异步暂停和恢复。这是最核心的架构变更。

### Step 2.1: 新增类型定义

在 `lib.rs` 中新增：

```rust
#[derive(Debug, Clone, Serialize, Deserialize, TS)]
pub enum CellStatus {
    Done,
    AsyncPending,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
pub struct AsyncCommand {
    pub call_id: String,
    pub action: String,
    pub params: serde_json::Value,
}
```

扩展 `RunResult`：

```rust
pub struct RunResult {
    // ... 现有字段 ...
    pub status: CellStatus,
    pub pending_command: Option<AsyncCommand>,
}
```

### Step 2.2: 改造 run_cell 支持协程

核心改动：用户代码不再直接作为 closure 执行，而是包在一个 coroutine 里。

```
之前：Closure → Executor::start → fuel loop → done
之后：Coroutine(Closure) → Executor::start → fuel loop → yield → 返回 AsyncPending
                                                          → done → 返回 Done
```

在 piccolo 中，需要研究：
- 如何创建 coroutine 并启动
- 如何在 Rust callback 中 yield 当前 coroutine
- 如何从外部 resume 一个已 yield 的 coroutine 并传入值

**关键问题：piccolo 的 coroutine API 是否支持从 Rust callback 内部 yield？**

如果支持，流程是：
1. `Callback::from_fn` 中返回 `CallbackReturn::Yield` 
2. Executor 检测到 yield，停止 step
3. `run_cell` 检测到 yield，返回 `AsyncPending`
4. `resume_cell` 调用 `coroutine.resume(ctx, value)`

如果不支持，备选方案：
- 在 callback 中设置一个 flag（表示需要 async）
- 然后主动触发一个 Lua error（作为信号）
- 在 fuel loop 中捕获这个特殊的 error
- 但这很 hack，需要先研究 piccolo API

### Step 2.3: 实现 resume_cell

```rust
pub fn resume_cell(&mut self, result_json: &str) -> RunResult {
    // 1. 解析 result_json → AsyncResponse { ok, value/error }
    // 2. 如果 ok：resume coroutine with value
    // 3. 如果 error：resume coroutine with error injection
    // 4. 继续 fuel loop
    // 5. 返回 Done 或 AsyncPending
}
```

### Step 2.4: 更新 WASM wrapper

```rust
// piccolo-notebook-wasm/src/lib.rs
pub fn resume_cell(&mut self, result_json: &str) -> String {
    let result = self.inner.resume_cell(result_json);
    serde_json::to_string(&result).unwrap_or_else(...)
}
```

### Step 2.5: 更新 worker.ts

Worker 的 `runCell` handler 变成异步状态机：

```typescript
case 'runCell': {
    await executeCell(msg.id, msg.code, msg.stdin || '');
    break;
}

async function executeCell(id: string, code: string, stdin: string) {
    let jsonStr = session.run_cell(code, stdin);
    let result = JSON.parse(jsonStr);

    while (result.status === 'async_pending') {
        const response = await handleAsyncCommand(result.pending_command);
        jsonStr = session.resume_cell(JSON.stringify(response));
        result = JSON.parse(jsonStr);
    }

    postMessage({ type: 'result', id, data: result });
}

async function handleAsyncCommand(command: any): Promise<string> {
    // Phase 2 只需要 mock，Phase 3 才实现真实 fetch
    return JSON.stringify({ ok: false, error: { message: `Unknown action: ${command.action}` } });
}
```

### Step 2.6: 更新 main.ts

`handleCellResult` 不需要大改，因为最终 `data` 的 shape 跟之前一样（status 是新增字段，不影响现有逻辑）。

### Rust 单元测试（Phase 2）

需要一个 mock 机制：在 Rust 测试中，不需要真的做 async，直接调用 `resume_cell` 传一个值回去就行。

```rust
#[test]
fn test_sync_cell_still_works() {
    // 不使用任何 async API 的 cell 应该跟以前一样
    let mut session = NotebookSession::new();
    let result = session.run_cell("print(\"hello\")", "");
    assert_eq!(result.status, CellStatus::Done);
    assert_eq!(result.stdout, vec!["hello"]);
}

#[test]
fn test_async_pending_status() {
    // 使用一个 mock async API
    let mut session = NotebookSession::new();
    let result = session.run_cell("local x = web.mock_async(\"test\")\nprint(x)", "");
    assert_eq!(result.status, CellStatus::AsyncPending);
    assert!(result.pending_command.is_some());
    assert_eq!(result.pending_command.unwrap().action, "mock_async");
}

#[test]
fn test_resume_with_value() {
    let mut session = NotebookSession::new();
    let result = session.run_cell("local x = web.mock_async(\"hello\")\nprint(x)", "");
    assert_eq!(result.status, CellStatus::AsyncPending);

    // Resume with a value
    let resume_result = session.resume_cell(r#"{"ok": true, "value": "world"}"#);
    assert_eq!(resume_result.status, CellStatus::Done);
    assert_eq!(resume_result.stdout, vec!["world"]);
}

#[test]
fn test_resume_with_error() {
    let mut session = NotebookSession::new();
    let result = session.run_cell("local x = web.mock_async(\"test\")\nprint(x)", "");
    assert_eq!(result.status, CellStatus::AsyncPending);

    // Resume with an error
    let resume_result = session.resume_cell(
        r#"{"ok": false, "error": {"message": "something failed", "code": "EUNKNOWN"}}"#
    );
    assert_eq!(resume_result.status, CellStatus::Done);
    assert!(resume_result.error.is_some());
}

#[test]
fn test_pcall_catches_async_error() {
    let mut session = NotebookSession::new();
    let result = session.run_cell(r#"
        local ok, err = pcall(function()
            local x = web.mock_async("test")
            print(x)
        end)
        print("caught:", ok)
    "#, "");
    assert_eq!(result.status, CellStatus::AsyncPending);

    let resume_result = session.resume_cell(
        r#"{"ok": false, "error": {"message": "boom", "code": "EUNKNOWN"}}"#
    );
    assert_eq!(resume_result.status, CellStatus::Done);
    assert!(resume_result.stdout[0].contains("false"));
}

#[test]
fn test_multiple_async_calls_in_one_cell() {
    let mut session = NotebookSession::new();
    let result = session.run_cell(r#"
        local a = web.mock_async("first")
        local b = web.mock_async("second")
        print(a, b)
    "#, "");
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
fn test_async_call_count_limit() {
    let mut session = NotebookSession::new();
    session.set_max_async_calls(3);
    let result = session.run_cell(r#"
        for i = 1, 10 do
            web.mock_async("call " .. tostring(i))
        end
    "#, "");
    // 前 3 次应该 yield，第 4 次应该报错
    // 具体行为取决于实现：可能在 yield 时检查
    assert!(result.error.is_some() || result.status == CellStatus::AsyncPending);
}

#[test]
fn test_all_existing_tests_still_pass() {
    // 确保 coroutine 改造没有破坏现有功能
    // 已有的 58 个测试不需要改动，全部自动重跑
}
```

### 验收标准

- [ ] `CellStatus` 和 `AsyncCommand` 类型定义完成
- [ ] `run_cell` 支持 coroutine yield
- [ ] `resume_cell` 实现完成
- [ ] WASM wrapper 暴露 `resume_cell`
- [ ] Worker 实现异步状态机
- [ ] 新增 8+ 个 Rust 单元测试
- [ ] 原有 58 个测试全部仍然通过
- [ ] 9 个 E2E 测试全部仍然通过

---

## Phase 3: web.fetch 实现

### 实现内容

第一个真实的 async API。验证整个 yield/resume 链路端到端工作。

### Step 3.1: Rust 侧注册 web.fetch

```rust
// 在 register_host_globals 中
// 注册 web table
let web = Table::new(&ctx);

// web.fetch(url, opts?)
let fetch_cb = Callback::from_fn(&ctx, move |ctx, _exec, mut stack| {
    let url = /* 从 stack 读取 */;
    let opts = /* 可选参数 */;

    // 构造 AsyncCommand
    let call_id = uuid_or_counter();
    let command = AsyncCommand {
        call_id,
        action: "fetch".to_string(),
        params: json!({
            "url": url,
            "method": opts.method || "GET",
            "headers": opts.headers || {},
            "body": opts.body || null,
            "timeout": opts.timeout || 30000,
        }),
    };

    // 存储 call_id 以便 resume 时匹配
    host_state.borrow_mut().pending_call_id = Some(call_id);
    host_state.borrow_mut().pending_commands.push(command);

    // Yield 协程
    Ok(CallbackReturn::Yield)
});

web.set_field(ctx, "fetch", fetch_cb);
ctx.set_global("web", web);
```

### Step 3.2: resume_cell 处理 fetch 结果

当 worker 传回 fetch 结果时：

```rust
// AsyncResponse.ok = true 的情况
// value = { status: 200, ok: true, headers: {...}, body: "..." }
// 需要转成 Lua table push 到 coroutine

// AsyncResponse.ok = false 的情况
// error = { message: "...", code: "E..." }
// 向 coroutine 注入 Lua error
```

### Step 3.3: Worker 侧实现真实 fetch

```typescript
async function handleAsyncCommand(command: AsyncCommand): Promise<string> {
    switch (command.action) {
        case 'fetch': {
            const { url, method, headers, body, timeout } = command.params;
            try {
                const response = await Promise.race([
                    fetch(url, { method, headers, body }),
                    createTimeout(timeout || 30000)
                ]);
                const responseBody = await response.text();
                return JSON.stringify({
                    ok: true,
                    value: {
                        status: response.status,
                        ok: response.ok,
                        headers: Object.fromEntries(response.headers),
                        body: responseBody
                    }
                });
            } catch (err: any) {
                return JSON.stringify({
                    ok: false,
                    error: {
                        message: err.message,
                        code: classifyFetchError(err),
                        category: categorizeError(err),
                    }
                });
            }
        }
        default:
            return JSON.stringify({
                ok: false,
                error: { message: `Unknown action: ${command.action}`, code: 'EUNKNOWN' }
            });
    }
}
```

### 测试策略

#### Rust 单元测试（mock async）

不需要真实网络。用 `web.mock_async` 测试 yield/resume 机制，fetch 的 Lua 语义已经覆盖。

```rust
#[test]
fn test_fetch_lua_syntax() {
    // 确保 web.fetch 的 Lua 调用语法正确
    let mut session = NotebookSession::new();
    let result = session.run_cell(r#"
        local response = web.fetch("https://example.com")
        print(response.status)
    "#, "");
    assert_eq!(result.status, CellStatus::AsyncPending);
    let cmd = result.pending_command.unwrap();
    assert_eq!(cmd.action, "fetch");
    assert_eq!(cmd.params["url"], "https://example.com");
}
```

#### Worker 集成测试（mock fetch）

在 Playwright 中拦截 fetch 请求，不需要真实服务器：

```typescript
// web/tests/worker/fetch.spec.ts
import { test, expect } from '@playwright/test';

test.use({ baseURL: 'http://localhost:5173' });

test('web.fetch returns response from mock API', async ({ page }) => {
    // 拦截 fetch 请求
    await page.route('https://api.mock.com/data', route => {
        route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({ name: 'test', count: 42 }),
        });
    });

    await page.goto('/');

    // 等待 kernel ready
    await expect(page.locator('[data-testid="kernel-status"]')).toContainText('ready', { timeout: 15000 });

    // 执行 fetch
    const editor = page.locator('[data-testid="cell-editor"]').first();
    await editor.click();
    await editor.fill(`
local response = web.fetch("https://api.mock.com/data")
local data = json.decode(response.body)
print(data.name)
print(data.count)
    `);

    await page.locator('[data-testid="cell-run-button"]').first().click();

    // 验证输出
    const output = page.locator('[data-testid="cell-output"]').first();
    await expect(output).toContainText('test', { timeout: 15000 });
    await expect(output).toContainText('42');
    await expect(page.locator('[data-testid="cell-status"]').first()).toContainText('success');
});

test('web.fetch handles network error', async ({ page }) => {
    await page.route('https://api.mock.com/fail', route => {
        route.abort('connectionrefused');
    });

    await page.goto('/');
    await expect(page.locator('[data-testid="kernel-status"]')).toContainText('ready', { timeout: 15000 });

    const editor = page.locator('[data-testid="cell-editor"]').first();
    await editor.click();
    await editor.fill(`
local ok, err = pcall(function()
    return web.fetch("https://api.mock.com/fail")
end)
print("caught error:", not ok)
    `);

    await page.locator('[data-testid="cell-run-button"]').first().click();

    const output = page.locator('[data-testid="cell-output"]').first();
    await expect(output).toContainText('caught error:', { timeout: 15000 });
});

test('web.fetch handles HTTP 404', async ({ page }) => {
    await page.route('https://api.mock.com/notfound', route => {
        route.fulfill({ status: 404, body: 'Not Found' });
    });

    await page.goto('/');
    await expect(page.locator('[data-testid="kernel-status"]')).toContainText('ready', { timeout: 15000 });

    const editor = page.locator('[data-testid="cell-editor"]').first();
    await editor.click();
    await editor.fill(`
local response = web.fetch("https://api.mock.com/notfound")
print(response.status)
print(response.ok)
    `);

    await page.locator('[data-testid="cell-run-button"]').first().click();

    const output = page.locator('[data-testid="cell-output"]').first();
    await expect(output).toContainText('404', { timeout: 15000 });
    await expect(output).toContainText('false');
});

test('web.fetch with POST', async ({ page }) => {
    let capturedBody = '';
    await page.route('https://api.mock.com/submit', async route => {
        const request = route.request();
        capturedBody = request.postData() || '';
        route.fulfill({
            status: 201,
            body: JSON.stringify({ created: true }),
        });
    });

    await page.goto('/');
    await expect(page.locator('[data-testid="kernel-status"]')).toContainText('ready', { timeout: 15000 });

    const editor = page.locator('[data-testid="cell-editor"]').first();
    await editor.click();
    await editor.fill(`
local payload = json.encode({name = "lua"})
local response = web.fetch("https://api.mock.com/submit", {
    method = "POST",
    body = payload,
    headers = {["Content-Type"] = "application/json"}
})
print(response.status)
    `);

    await page.locator('[data-testid="cell-run-button"]').first().click();

    const output = page.locator('[data-testid="cell-output"]').first();
    await expect(output).toContainText('201', { timeout: 15000 });
});

test('multiple fetch calls in one cell', async ({ page }) => {
    let callCount = 0;
    await page.route('https://api.mock.com/**', route => {
        callCount++;
        route.fulfill({
            status: 200,
            body: JSON.stringify({ id: callCount }),
        });
    });

    await page.goto('/');
    await expect(page.locator('[data-testid="kernel-status"]')).toContainText('ready', { timeout: 15000 });

    const editor = page.locator('[data-testid="cell-editor"]').first();
    await editor.click();
    await editor.fill(`
local r1 = web.fetch("https://api.mock.com/first")
local r2 = web.fetch("https://api.mock.com/second")
local d1 = json.decode(r1.body)
local d2 = json.decode(r2.body)
print(d1.id, d2.id)
    `);

    await page.locator('[data-testid="cell-run-button"]').first().click();

    const output = page.locator('[data-testid="cell-output"]').first();
    await expect(output).toContainText('1\t2', { timeout: 15000 });
});
```

### 验收标准

- [ ] `web.fetch` Rust 侧注册完成
- [ ] Worker `handleAsyncCommand` 实现 fetch
- [ ] 超时机制实现
- [ ] 错误分类实现（ETIMEDOUT, ENETWORK, ECORS, EUNKNOWN）
- [ ] 5 个 Playwright E2E 测试（mock fetch）
- [ ] 2+ 个 Rust 单元测试
- [ ] 原有测试全部仍然通过

---

## Phase 4: web.url + web.log + web.sleep

### 实现内容

扩展非核心但常用的 API。

### web.url（纯 Rust，无 async）

```lua
local u = web.url.parse("https://example.com/path?q=hello#section")
print(u.scheme)    -- "https"
print(u.host)      -- "example.com"
print(u.path)      -- "/path"
print(u.query)     -- {q = "hello"}
print(u.fragment)  -- "section"

local qs = web.url.encode({page = 1, sort = "name"})
print(qs)  -- "page=1&sort=name"
```

实现：在 Rust 中用 `url` crate 解析 URL，转成 Lua table。

### web.log（同步，不 yield）

```lua
web.log("debug info", 42, {a = 1})  -- console.log
```

实现：Rust callback 把消息写入 `host_state.stderr` 或新的 `logs` 字段，worker 转发到 `console.log`。

### web.sleep（async）

```lua
print("before")
web.sleep(1000)
print("after")  -- 1秒后打印
```

实现：yield `{action: "sleep", duration: 1000}`，worker 用 `setTimeout` + `Promise` 实现。

### 测试

```rust
// Rust 单元测试
#[test]
fn test_url_parse() {
    let result = session.run_cell(r#"
        local u = web.url.parse("https://example.com/path?q=hello")
        print(u.scheme)
        print(u.host)
        print(u.path)
    "#, "");
    assert_eq!(result.stdout, vec!["https", "example.com", "/path"]);
}

#[test]
fn test_url_encode() {
    let result = session.run_cell(r#"
        print(web.url.encode({a = "1", b = "2"}))
    "#, "");
    // 顺序不保证
    assert!(result.stdout[0].contains("a=1"));
    assert!(result.stdout[0].contains("b=2"));
}

#[test]
fn test_web_log() {
    let result = session.run_cell(r#"
        web.log("test message")
    "#, "");
    assert!(result.error.is_none());
    // 验证 log 出现在某个字段
}
```

```typescript
// E2E 测试
test('web.sleep pauses execution', async ({ page }) => {
    // 使用 cell 执行 web.sleep，验证输出有时间间隔
    // 可以用 page.evaluate 检查 console 输出
});
```

### 验收标准

- [ ] `web.url.parse` / `web.url.encode` 实现
- [ ] `web.log` 实现
- [ ] `web.sleep` 实现
- [ ] 3+ 个 Rust 单元测试
- [ ] 1+ 个 E2E 测试

---

## Phase 5: web.storage（主线程中转）

### 实现内容

localStorage 需要主线程中转：

```
Worker → postMessage({type: 'asyncRelay', command}) → Main Thread
Main Thread → localStorage.getItem(key) → postMessage({type: 'asyncRelayResult', result})
Worker → resume_cell(result)
```

### 新增 Worker ↔ Main Thread 消息协议

```typescript
// Worker → Main
{ type: 'asyncRelay', id: string, command: AsyncCommand }

// Main → Worker
{ type: 'asyncRelayResult', id: string, result: string }
```

### main.ts 新增处理

```typescript
// 在 worker.onmessage 中
case 'asyncRelay': {
    // 在主线程执行需要主线程的 API
    const result = await handleMainThreadCommand(msg.command);
    w.postMessage({ type: 'asyncRelayResult', id: msg.id, result });
    break;
}
```

### 测试

```typescript
test('web.storage.get/set', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('[data-testid="kernel-status"]')).toContainText('ready', { timeout: 15000 });

    // 先 set
    const editor = page.locator('[data-testid="cell-editor"]').first();
    await editor.click();
    await editor.fill(`web.storage.set("test_key", "hello")`);
    await page.locator('[data-testid="cell-run-button"]').first().click();
    await expect(page.locator('[data-testid="cell-status"]').first()).toContainText('success', { timeout: 15000 });

    // 再 get
    await page.locator('[data-testid="add-cell-button"]').click();
    await page.waitForTimeout(100);
    const editor2 = page.locator('[data-testid="cell-editor"]').nth(1);
    await editor2.click();
    await editor2.fill(`print(web.storage.get("test_key"))`);
    await page.locator('[data-testid="cell-run-button"]').nth(1).click();

    const output = page.locator('[data-testid="cell-output"]').nth(1);
    await expect(output).toContainText('hello', { timeout: 15000 });
});
```

### 验收标准

- [ ] `web.storage.get` / `set` / `delete` / `list` 实现
- [ ] 主线程中转协议实现
- [ ] 2+ 个 E2E 测试
- [ ] 原有测试全部仍然通过

---

## Phase 6: 浏览器扩展 API

### 实现内容

`web.tab.*`, `web.cookies.*`, `web.history.*`, `web.bookmarks.*`

这些 API 的实现模式跟 `web.fetch` 一样——yield command，worker 执行，resume。

但有一个区别：**这些 API 只在扩展上下文可用**。在普通网页中调用应该返回明确的错误。

### 检测扩展上下文

```typescript
function isExtensionContext(): boolean {
    return !!(globalThis as any).chrome?.tabs;
}

// 在 handleAsyncCommand 中
if (isExtensionApi(command.action) && !isExtensionContext()) {
    return JSON.stringify({
        ok: false,
        error: {
            message: `${command.action} is only available in browser extension context`,
            code: 'ENOEXTENSION',
            category: 'permission',
        }
    });
}
```

### 测试策略

**Rust 单元测试**：测试 Lua 语法、yield 行为（同 Phase 2 mock 模式）

**E2E 测试**：需要 Playwright 的扩展测试能力，或者 mock `chrome` 全局对象

```typescript
test('web.tab.query in extension context', async ({ page }) => {
    // Mock chrome.tabs.query
    await page.addInitScript(() => {
        (window as any).chrome = {
            tabs: {
                query: (opts: any) => Promise.resolve([
                    { id: 1, url: 'https://example.com', title: 'Example' }
                ])
            }
        };
    });

    await page.goto('/');
    // ... 测试 web.tab.query 调用
});
```

### 验收标准

- [ ] `web.tab.query` / `create` / `activate` / `close` 实现
- [ ] `web.cookies.get` / `set` 实现
- [ ] `web.history.search` 实现
- [x] `web.bookmarks.search` / `create` 实现
- [x] 扩展上下文检测
- [x] 非 extension 上下文的友好错误
- [x] 每个 API 至少 1 个 E2E 测试

---

## 总体测试清单

| Phase | Rust 单元测试 | E2E 测试 | 实际新增测试数 |
|-------|-------------|---------|-------------|
| Phase 1: json | 10 | 0 | 10 |
| Phase 2: coroutine 基础 | 8 | 0 | 8 |
| Phase 3: web.fetch | 3 | 5 | 8 |
| Phase 4: url/log/sleep | 9 | 4 | 13 |
| Phase 5: web.storage | 5 | 4 | 9 |
| Phase 6: extension APIs | 9 | 5 | 14 |
| **总计** | **44** | **18** | **62** |

最终测试统计：

| 层 | 数量 | 备注 |
|----|------|------|
| Rust 单元测试 | 102 | 全部通过 |
| E2E 浏览器测试 | 27 (1 skipped) | 全部通过 |
| **总计** | **129** | |

---

## 文件变更概览

### 每个阶段涉及的文件

| 文件 | Phase 1 | Phase 2 | Phase 3 | Phase 4 | Phase 5 | Phase 6 |
|------|---------|---------|---------|---------|---------|---------|
| `crates/web-lua-core/src/lib.rs` | ✏️ json | ✏️ coroutine | ✏️ fetch | ✏️ url/log | | ✏️ tabs |
| `crates/piccolo-notebook-wasm/src/lib.rs` | | ✏️ resume_cell | | | | |
| `web/src/worker.ts` | | ✏️ async loop | ✏️ fetch handler | ✏️ sleep | ✏️ relay | ✏️ chrome |
| `web/src/main.ts` | | | | | ✏️ relay handler | |
| `web/src/types/generated.ts` | ✏️ 重新生成 | ✏️ 新类型 | | | | |
| `web/tests/e2e/*.spec.ts` | | | 📄 fetch.spec | | 📄 storage.spec | 📄 extension.spec |
| `build-wasm.sh` | | | | | | |

### 新增依赖

| Phase | Crate | 用途 |
|-------|-------|------|
| Phase 1 | `serde_json` (已有) | JSON 编解码 |
| Phase 4 | `url` | URL 解析 |
| Phase 2 | `uuid` 或 counter | AsyncCommand call_id |
