# Known Issues & Design Traps

> 记录已验证的实锤问题与易踩坑点。未修复前保持追踪。

---

## 1. Snapshot 在 Shadow DOM 页面返回 0 元素

**状态**：实锤 bug，代码层面完全未处理 shadow DOM。

**根因**：
- `crates/dom-semantic-tree/src/collect.rs:519` `recurse_children` 仅遍历 `element.children()` (`HtmlCollection`)，完全不处理 `element.shadow_root()`。
- Shadow host 的 `children` 是空的，真正内容在 shadow tree 内部，导致遍历直接跳过整棵子树。
- 若 shadow host 本身是 `<div>` 且无 aria role，`infer_role` 判定为 generic，`interactive_only` 模式下直接跳过，连 host 本身都不进 snapshot。

**影响**：
- LinkedIn Jobs、GitHub PR、任何 Lit / Stencil / Web Components 页面，snapshot 几乎为空。
- `dom.snapshot()`、`page.snapshot()`、`tab.snapshot()` 全部中招（共用同一 collector）。

**修复方向**：
- 在 `recurse_children` 里加 `element.shadow_root()` 分支，递归遍历 shadow tree。
- shadow tree 内元素也需分配 `data-ref-id`，否则 `tab.click` 等依赖 refId 的 API 无法定位。

---

## 2. `page.*` API 在 extension-lua 中操作的是 side panel DOM，而非目标网页

**状态**：设计上如此，但跨环境语义不对称，构成静默陷阱。

**根因**：
- `crates/extension-lua/js/runner.ts:985` `getElementByRefId` 直接调用 `document.querySelector(...)`。
- Runner 主线程跑在 extension side panel 里，因此 `document` 是 side panel 的 DOM，不是目标网页的 DOM。
- `page.click`、`page.fill`、`page.snapshot`、`page.goto` 全部执行在 side panel 上下文中。

**与 `web-lua` 的不对称**：

| API | `web-lua` (网页主线程 WASM) | `extension-lua` (side panel Runner) |
|---|---|---|
| `page.click(refId)` | 点击当前网页元素 | 点击 side panel 内元素 |
| `page.goto(url)` | 跳转当前网页 | 跳转 side panel 自己 |
| `page.snapshot()` | 快照当前网页 | 快照 side panel DOM |

**后果**：
- 用户把脚本从 `web-lua` 搬到 `extension-lua`，`page.*` 语义突变，但无编译期/运行期报错 —— 静默点错地方。
- Prompt 里禁了 `page.snapshot()`，但 `page.click`、`page.fill` 的隐患一样存在。

**正确用法**：
- 操作目标网页必须用 `tab.*` 命名空间：`tab.click(tabId, refId)`、`tab.fill(tabId, refId, text)`、`tab.snapshot(tabId)`。
- `tab.*` 通过 `sendMessageToTab` / `executeInTab` 在 content script 中执行，真正作用于目标 tab 的 DOM。

---

## 3. LLM 容易发明不存在的 API（命名空间混乱所致）

**状态**：部分成立。LLM 并非全在瞎编，而是文档命名不一致导致合理推断出错。

**三个典型案例**：

| LLM 声称的 API | 真实存在？ | 说明 |
|---|---|---|
| `tab.navigate` | ❌ 不存在 | 纯 hallucination。正确的是 `tab.open(url)` 或 `chrome.tabs.create({url})`。 |
| `chrome.runtime.sleep` | ❌ 不存在 | LLM 混淆了 `chrome.runtime.*` 和 `runtime.*`。真实别名是 `runtime.sleep`（映射到 `web.sleep`），没有 `chrome.` 前缀。 |
| `web.tab.evaluate` | ✅ 真实存在 | API.md:1191 有文档，`tab.evaluate` 是其别名。LLM 这个没编错。 |

**命名空间混乱的根因**：

- `chrome.tabs.create` 是原生 Chrome API，`tab.open` 是注入的 Lua 别名 —— 两者功能相同但命名完全不同。
- `runtime.sleep` 是 `web.sleep` 的别名，放在 `runtime` 前缀下，但和 `chrome.runtime.*` 完全无关。
- `web.fetch`、`web.storage`、`web.clipboard` 等用 `web.` 前缀，但 `web.tab.evaluate` 又混在 `web` 命名空间里操作 tab。

**后果**：
- LLM 看到"tab 操作"语义空间，会自然推断出 `tab.navigate` 这种更符合 Playwright/Puppeteer 直觉的名字。
- 用户按 LLM 写的代码调用 `tab.navigate`，运行时报 `Unknown action`，但错误信息无法告诉用户"应该用 `tab.open`"。

**修复方向**：
- 统一别名命名规则，或增加模糊匹配/纠错提示（如 `Action::Other` 返回 "Did you mean tab.open?"）。
- 在 API.md 中显式列出"常见错误写法"和对应正确写法。
