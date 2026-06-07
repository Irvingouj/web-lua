# Tool Registration Target Architecture

本文描述 Piccolo Notebook 工具系统的理想最终形态。它不是迁移计划，不描述阶段，不保留旧接口，不为历史实现妥协。最终系统里，Rust 侧、JS main thread 侧、content script 侧、sidepanel 侧都使用同一个注册语义：

```text
register(name, args, returns, doc, handler)
```

其中：

```text
name    = stable internal action name
args    = runtime-validatable input schema
returns = runtime-validatable output schema
doc     = Lua/LLM-visible documentation metadata
handler = executable implementation
```

这个五元组是唯一合法的工具注册模型。工具定义本身不携带 transport 细节，不知道自己运行在 worker、main thread、content script、sidepanel、tab frame 还是 Rust VM。环境差异由 dispatcher 和 adapter 处理。

## Final Shape

```text
                                +-----------------------------+
                                | Canonical Tool Definition   |
                                |                             |
                                | register(                   |
                                |   name,                     |
                                |   args,                     |
                                |   returns,                  |
                                |   doc,                      |
                                |   handler                   |
                                | )                           |
                                +--------------+--------------+
                                               |
                +------------------------------+------------------------------+
                |                                                             |
                v                                                             v
  +-----------------------------+                               +-----------------------------+
  | Executable Tool Registry    |                               | Documentation Registry      |
  |                             |                               |                             |
  | name -> handler             |                               | public Lua API docs         |
  | name -> args schema         |                               | internal action docs        |
  | name -> returns schema      |                               | source/transport metadata   |
  +--------------+--------------+                               +--------------+--------------+
                 |                                                             |
                 v                                                             v
  +-----------------------------+                               +-----------------------------+
  | Dispatcher                  |                               | runtime.docs()              |
  |                             |                               | runtime.get_doc(...)        |
  | validates args              |                               | runtime.search_docs(...)    |
  | calls adapter/handler       |                               +--------------+--------------+
  | validates return value      |                                              |
  +--------------+--------------+                                              |
                 |                                                             |
                 +-------------------------------+-----------------------------+
                                                 |
                                                 v
                                +-----------------------------+
                                | Lua / LLM Runtime           |
                                |                             |
                                | discovers tools at runtime  |
                                | reads exact argument docs   |
                                | calls public Lua APIs       |
                                +-----------------------------+
```

## Canonical Tool Definition

JS tools are registered with this exact shape:

```ts
register(
  "sidepanel_check",
  SidepanelCheckParamsSchema,
  z.null(),
  {
    publicName: "sidepanel.check",
    namespace: "sidepanel",
    name: "check",
    action: "sidepanel_check",
    source: "sidepanel",
    transport: "sidepanel_dom",
    description: "Check or uncheck a checkbox in the sidepanel.",
    params: [
      {
        name: "refId",
        type: "string",
        required: true,
        description: "Element ref id from the latest sidepanel snapshot.",
      },
      {
        name: "checked",
        type: "boolean",
        required: false,
        description: "Whether the checkbox should be checked. Defaults to true.",
      },
    ],
    returns: {
      type: "null",
      description: "Returns null after the checkbox state has been updated.",
    },
  },
  async (params) => {
    const element = resolveSidepanelElement(params.refId);
    setCheckboxState(element, params.checked ?? true);
    return null;
  },
);
```

Rust tools are registered with the same conceptual shape:

```rust
register_lua_tool!(
    ctx,
    table,
    name: "check",
    action: "sidepanel_check",
    args: SidepanelCheckParams,
    returns: Null,
    doc: ToolDoc {
        public_name: "sidepanel.check",
        namespace: "sidepanel",
        name: "check",
        action: "sidepanel_check",
        source: ToolSource::RustCore,
        transport: ToolTransport::HostAsync,
        description: "Check or uncheck a checkbox in the sidepanel.",
        params: vec![
            ParamDoc {
                name: "refId",
                lua_type: "string",
                required: true,
                description: "Element ref id from the latest sidepanel snapshot.",
            },
            ParamDoc {
                name: "checked",
                lua_type: "boolean",
                required: false,
                description: "Whether the checkbox should be checked. Defaults to true.",
            },
        ],
        returns: ReturnDoc {
            lua_type: "nil",
            description: "Returns nil after the checkbox state has been updated.",
        },
    },
    handler: sidepanel_check_handler,
);
```

The Rust macro expands to exactly two effects:

```text
1. Lua function registration
   table.set_field(ctx, lua_name, callback)

2. Documentation registration
   api_docs::register(doc)
```

The JS function expands to exactly two effects:

```text
1. Executable registration
   executableRegistry.set(action, { args, returns, handler })

2. Documentation registration
   docRegistry.set(publicName/action, doc)
```

## Documentation Model

The documentation record is not generated from the handler. It is explicit, complete, and runtime-visible.

```ts
type ToolDoc = {
  publicName: string;
  namespace: string;
  name: string;
  action: string;
  source: ToolSource;
  transport: ToolTransport;
  description: string;
  params: ToolParamDoc[];
  returns: ToolReturnDoc;
};

type ToolSource =
  | "rust_core"
  | "extension_worker"
  | "main_thread"
  | "content_script"
  | "sidepanel";

type ToolTransport =
  | "rust_sync"
  | "host_async"
  | "extension_worker"
  | "chrome_api"
  | "active_tab_content_script"
  | "specific_tab_content_script"
  | "sidepanel_dom";

type ToolParamDoc = {
  name: string;
  type: string;
  required: boolean;
  description: string;
};

type ToolReturnDoc = {
  type: string;
  description: string;
};
```

The Lua-facing documentation always describes public Lua APIs, not private implementation details. A content script action named `"click"` is never shown to the LLM as `host.call("click", ...)`. It is shown as `page.click(...)`, `tab.click(...)`, or `sidepanel.click(...)`, depending on the public API that routes to it.

```text
internal content script action:
  click

public Lua API:
  page.click

async action:
  page_click

doc identity:
  publicName = "page.click"
  action     = "page_click"
  source     = "content_script"
  transport  = "active_tab_content_script"
```

## Documentation Flow From Content Script To Lua

Content script docs flow through the extension control plane. The Lua VM never talks directly to a content script. The content script registers local executable handlers and local docs. The main thread asks the content script for its docs through the existing message bridge. The main thread merges those docs with Rust and main-thread docs. Lua asks the host for the merged docs.

```text
content-script.ts
  register("click", args, returns, doc, handler)
        |
        v
content script executable registry
content script doc registry
        |
        | chrome.runtime / tabs messaging
        v
main thread / extension runner
  fetches content script docs
  normalizes publicName/action/source/transport
  caches docs by tabId/frameId/version
        |
        v
merged JS doc registry
  main thread docs
  sidepanel docs
  content script docs
        |
        | host async command result
        v
Rust Lua runtime
  receives docs as JSON
  converts JSON to Lua table
        |
        v
runtime.docs()
runtime.get_doc(...)
runtime.search_docs(...)
```

The content script exposes an internal docs action:

```ts
register(
  "__tool_docs",
  z.object({}),
  z.array(ToolDocSchema),
  {
    publicName: "__internal.content_script.tool_docs",
    namespace: "__internal",
    name: "content_script_tool_docs",
    action: "__content_script_tool_docs",
    source: "content_script",
    transport: "active_tab_content_script",
    description: "Return content script tool documentation.",
    params: [],
    returns: {
      type: "ToolDoc[]",
      description: "Documentation for tools registered inside this content script.",
    },
  },
  async () => listLocalToolDocs(),
);
```

The main thread calls this action after injection and whenever content script capability state may have changed:

```text
main thread
  |
  | sendMessage(tabId, {
  |   action: "__content_script_tool_docs",
  |   params: {}
  | })
  v
content script
  |
  | returns ToolDoc[]
  v
main thread merged registry
```

The merged registry stores docs by both public name and action:

```text
byPublicName:
  "page.click" -> ToolDoc
  "page.fill"  -> ToolDoc

byAction:
  "page_click" -> ToolDoc
  "page_fill"  -> ToolDoc
```

The Lua VM sees only normalized docs:

```lua
local doc = runtime.get_doc("page.click")
print(doc.publicName) -- "page.click"
print(doc.action)     -- "page_click"
print(doc.source)     -- "content_script"
print(doc.transport)  -- "active_tab_content_script"
```

## Rust Runtime Docs

Rust owns the Lua API surface. `runtime.docs()`, `runtime.get_doc(name)`, and `runtime.search_docs(query)` are Lua APIs. They are implemented as host-backed runtime APIs when the full extension environment is available.

```text
Lua code
  runtime.get_doc("page.click")
        |
        v
Rust callback
  creates AsyncCommand {
    action: "__runtime_get_doc",
    params: { query: "page.click" }
  }
        |
        v
WASM boundary
        |
        v
JS runner
  resolves query from merged doc registry
        |
        v
AsyncResponse.ok(doc)
        |
        v
Rust resume
  json_value_to_lua(doc)
        |
        v
Lua receives table
```

The runtime docs functions have stable behavior:

```lua
runtime.docs() -> table
runtime.get_doc(query: string) -> table | nil
runtime.search_docs(query: string) -> table
```

`runtime.docs()` returns every public Lua-facing API doc visible in the current execution environment.

`runtime.get_doc(query)` accepts:

```text
"page.click"       public Lua API name
"page_click"       async action name
"sidepanel.check"  public sidepanel API name
"runtime.docs"     Rust runtime API name
```

`runtime.search_docs(query)` performs simple runtime search over:

```text
publicName
namespace
name
action
description
param names
param descriptions
return description
```

The Rust runtime also has local Rust-core docs available without a JS round trip:

```text
api_docs::REGISTRY
        |
        v
runtime docs provider
        |
        +-- if JS host provider exists:
        |     ask JS for merged docs
        |
        +-- if no JS host provider exists:
              return Rust-core docs only
```

In the browser extension runtime, JS is the authoritative merged docs provider because only JS knows current content script and sidepanel capabilities.

## How Rust Calls JS Functions

Rust does not call arbitrary JS functions directly from Lua tool handlers. Rust emits typed async commands. JS receives the command, validates it against the registered tool schema, executes the registered JS handler or transport adapter, validates the return value, then resumes Rust.

```text
Lua user code
  page.click({ refId = "12" })
        |
        v
Rust Lua callback registered for page.click
        |
        v
serialize Lua args -> JSON
        |
        v
AsyncCommand {
  call_id: 7,
  action: "page_click",
  params: { "refId": "12" }
}
        |
        v
WASM boundary
        |
        v
JS runner executeMainThreadCommand(command)
        |
        v
dispatcher.lookup("page_click")
        |
        v
args schema validates params
        |
        v
transport adapter resolves execution environment
        |
        v
handler executes
        |
        v
returns schema validates result
        |
        v
AsyncResponse {
  ok: true,
  value: null
}
        |
        v
Rust resume_async(call_id, response)
        |
        v
Lua coroutine resumes
```

For content script backed tools, the JS side dispatch looks like this:

```text
JS runner receives:
  action = "page_click"
  params = { refId: "12" }
        |
        v
dispatcher finds ToolDefinition("page_click")
        |
        v
transport = active_tab_content_script
        |
        v
adapter resolves active tab id
        |
        v
chrome.tabs.sendMessage(tabId, {
  action: "click",
  params: { refId: "12" }
})
        |
        v
content script local dispatcher
        |
        v
content script handler("click")
        |
        v
result returned to main thread
        |
        v
result returned to Rust
```

For main thread backed tools:

```text
action = "storage_get"
transport = chrome_api
        |
        v
JS runner calls registered handler directly
        |
        v
chrome.storage.local.get(...)
        |
        v
result returned to Rust
```

For sidepanel backed tools:

```text
action = "sidepanel_check"
transport = sidepanel_dom
        |
        v
JS runner calls sidepanel registry handler
        |
        v
handler resolves DOM element in sidepanel document
        |
        v
result returned to Rust
```

## Dispatcher Contract

The dispatcher is the only component allowed to execute tools by action name.

```ts
async function dispatch(action: string, params: unknown): Promise<AsyncResponse> {
  const tool = executableRegistry.get(action);
  if (!tool) return toolNotFound(action);

  const parsedParams = tool.args.safeParse(params);
  if (!parsedParams.success) return invalidParams(parsedParams.error);

  const rawValue = await tool.handler(parsedParams.data);

  const parsedReturn = tool.returns.safeParse(rawValue);
  if (!parsedReturn.success) return invalidReturn(parsedReturn.error);

  return { ok: true, value: parsedReturn.data };
}
```

Every handler receives already-validated params. Every caller receives schema-valid output. Tool docs and schemas describe the same contract.

## Content Script Registry

The content script has its own local registry because handlers execute in the page isolated world.

```text
content script registry
  click
  fill
  type
  append
  press
  select
  check
  hover
  unhover
  scroll
  snapshot
  fetch
  __tool_docs
```

The local content script action names are private implementation names. Public docs use Lua names:

```text
private local action    public Lua API
--------------------    ----------------
click                   page.click
fill                    page.fill
type                    page.type
append                  page.append
press                   page.press
select                  page.select
check                   page.check
hover                   page.hover
unhover                 page.unhover
scroll                  page.scroll
snapshot                page.snapshot
fetch                   page.fetch
```

The main thread is responsible for mapping public actions to private content script actions:

```text
page_click -> content script "click"
page_fill  -> content script "fill"
tab_click  -> content script "click" with explicit tabId
```

The content script never needs to know whether a request came from `page.click` or `tab.click`. It only executes `"click"` against its local DOM.

## Main Thread Registry

The main thread registry owns tools that require browser or extension privileges:

```text
storage.*
cookies.*
bookmarks.*
history.*
notifications.*
chrome.tabs.*
chrome.runtime.*
tab.*
page.* transport wrappers
runtime doc provider actions
```

The main thread registry also owns the merged documentation view:

```text
merged docs =
  Rust exported docs
  + main thread JS docs
  + sidepanel docs
  + content script docs from active/specific tabs
```

Main thread docs provider actions:

```text
__runtime_docs
__runtime_get_doc
__runtime_search_docs
```

These actions are normal registered tools:

```ts
register(
  "__runtime_get_doc",
  RuntimeGetDocParamsSchema,
  ToolDocSchema.nullable(),
  {
    publicName: "runtime.get_doc",
    namespace: "runtime",
    name: "get_doc",
    action: "__runtime_get_doc",
    source: "main_thread",
    transport: "extension_worker",
    description: "Return documentation for one runtime-visible API.",
    params: [
      {
        name: "query",
        type: "string",
        required: true,
        description: "Public API name or internal action name.",
      },
    ],
    returns: {
      type: "ToolDoc | null",
      description: "Tool documentation, or null when no matching API exists.",
    },
  },
  async ({ query }) => mergedDocs.get(query) ?? null,
);
```

## Rust API Registry

Rust API docs live in `api_docs::REGISTRY`. Every Lua API registered by Rust inserts exactly one `ToolDoc`.

```text
register_lua_tool!
        |
        +-- Lua callback installed into table/global
        |
        +-- ToolDoc inserted into api_docs::REGISTRY
```

Rust docs can be exported to JS:

```text
generateApiDocs(Json)
        |
        v
ToolDoc[]
        |
        v
JS merged docs registry
```

JS merged docs can be returned to Rust at runtime:

```text
runtime.docs()
        |
        v
AsyncCommand("__runtime_docs")
        |
        v
JS merged docs registry
        |
        v
ToolDoc[]
        |
        v
Lua table
```

The same doc shape is used everywhere. Generated `API.md`, generated `api.json`, runtime `runtime.docs()`, and LLM tool discovery all consume the same canonical records.

## Public API Identity

Every tool has two names:

```text
publicName = Lua-facing function name
action     = async command / dispatcher identity
```

Examples:

```text
publicName              action
------------------      --------------------
web.fetch               fetch
web.sleep               sleep
page.click              page_click
page.snapshot           page_snapshot
tab.click               tab_click
sidepanel.check         sidepanel_check
runtime.docs            __runtime_docs
runtime.get_doc         __runtime_get_doc
```

The LLM reads `publicName`. The dispatcher executes `action`.

## Runtime Documentation Semantics

Lua-visible docs are ordinary Lua tables:

```lua
{
  publicName = "page.click",
  namespace = "page",
  name = "click",
  action = "page_click",
  source = "content_script",
  transport = "active_tab_content_script",
  description = "Click an element in the current page.",
  params = {
    {
      name = "refId",
      type = "string",
      required = true,
      description = "Element ref id from the latest page snapshot.",
    },
  },
  returns = {
    type = "nil",
    description = "Returns nil after the click is dispatched.",
  },
}
```

The LLM can discover and call APIs entirely from inside Lua:

```lua
local doc = runtime.get_doc("page.click")
print(doc.description)

for _, param in ipairs(doc.params) do
  print(param.name, param.type, param.required)
end

page.click({ refId = "12" })
```

## Compile-Time Doctests

Doctests are compile-time-only metadata attached to `doc`. They do not exist in production builds.

```ts
register(
  "sidepanel_check",
  SidepanelCheckParamsSchema,
  z.null(),
  {
    publicName: "sidepanel.check",
    namespace: "sidepanel",
    name: "check",
    action: "sidepanel_check",
    source: "sidepanel",
    transport: "sidepanel_dom",
    description: "Check or uncheck a checkbox in the sidepanel.",
    params: [...],
    returns: { type: "null", description: "Returns null on success." },

    ...(__DOCTEST__
      ? {
          testScript: `
            const checkbox = document.createElement("input");
            checkbox.type = "checkbox";
            checkbox.dataset.refId = "abc";
            document.body.appendChild(checkbox);

            await callTool("sidepanel_check", {
              refId: "abc",
              checked: true,
            });

            expect(checkbox.checked).toBe(true);
          `,
        }
      : {}),
  },
  async (params) => {
    const element = resolveSidepanelElement(params.refId);
    setCheckboxState(element, params.checked ?? true);
    return null;
  },
);
```

The flag is build-time replaced:

```ts
define: {
  __DOCTEST__: JSON.stringify(mode === "doctest"),
}
```

Normal production build:

```text
__DOCTEST__ = false
        |
        v
object spread branch is unreachable
        |
        v
tree shaking removes testScript
        |
        v
production bundle contains no doctest code
```

Doctest build:

```text
__DOCTEST__ = true
        |
        v
testScript exists in doc object
        |
        v
register(...) collects it
        |
        v
doctest runner executes it against real dispatcher
```

The doctest runner imports all tool modules, then runs collected scripts:

```text
doctest.test.ts
        |
        v
import tool modules
        |
        v
register(...) executes
        |
        v
doctestTools[] filled
        |
        v
each testScript runs with:
  expect
  callTool
  fixture DOM
```

The doctest runner calls the real dispatcher:

```ts
const callTool = async (action: string, params: unknown) => {
  const result = await dispatch(action, params);
  if (!result.ok) throw new Error(result.error.message);
  return result.value;
};
```

Doctests validate tool examples and tool behavior at the contract boundary. Playwright E2E validates real user flows. Production stripping validation proves doctest strings are absent from release output.

## E2E Integration

The final test system has distinct layers:

```text
+-------------------------+---------------------------------------------+
| Layer                   | Responsibility                              |
+-------------------------+---------------------------------------------+
| JS registry tests       | register/dispatch/docs behavior             |
| JS doctests             | examples attached to tools                  |
| production strip test   | no testScript or doctest bodies in dist     |
| Rust tests              | Lua callbacks and runtime docs              |
| Playwright E2E          | real browser notebook behavior              |
+-------------------------+---------------------------------------------+
```

The E2E command runs against production-like code with `__DOCTEST__ = false`. Doctests run before or beside E2E, never inside normal app runtime.

```text
doctest mode
  validates individual tool contracts

production build strip check
  validates doctest code is absent

playwright e2e
  validates full notebook behavior
```

## Error Model

Every tool failure returns a structured error:

```ts
type ToolError = {
  message: string;
  code: string;
  category: string;
  action: string;
  publicName?: string;
};
```

Validation errors include schema context:

```text
E_INVALID_PARAMS
E_INVALID_RETURN
E_TOOL_NOT_FOUND
E_TRANSPORT_UNAVAILABLE
E_CONTENT_SCRIPT_NOT_READY
E_NO_ACTIVE_TAB
E_ELEMENT_NOT_FOUND
```

Lua receives errors as Lua errors with useful messages, and `pcall` can catch them:

```lua
local ok, err = pcall(function()
  page.click({ refId = "missing" })
end)

print(ok)  -- false
print(err) -- E_ELEMENT_NOT_FOUND with action/publicName context
```

## Perfect End State

The finished system has these properties:

```text
One registration shape:
  register(name, args, returns, doc, handler)

One executable registry:
  action -> validated handler

One documentation model:
  ToolDoc records shared by Rust, JS, generated docs, and Lua runtime docs

One runtime discovery surface:
  runtime.docs()
  runtime.get_doc(...)
  runtime.search_docs(...)

One dispatch boundary:
  Rust emits AsyncCommand
  JS validates and executes
  JS returns AsyncResponse
  Rust resumes Lua

One content script docs flow:
  content script local docs
  main thread fetches by message
  main thread merges
  Rust asks JS for merged docs
  Lua receives docs as table

One doctest mechanism:
  compile-time __DOCTEST__
  doctest scripts collected only in doctest builds
  production bundles contain no doctest strings
```

In this target architecture, docs are not side artifacts. Docs are part of the runtime contract. The same record that explains a tool to generated API documentation also explains it to Lua, to the LLM, to doctests, and to the dispatcher. The handler executes behavior; the schema enforces the boundary; the doc describes the boundary; the dispatcher connects Rust and JS without leaking environment-specific details into tool definitions.

## Explicit Content Script Registration And Metadata Protocol

Content script actions are registered in JS, inside the content script execution context:

```text
crates/extension-lua/js/content-script.ts
```

This code runs in the target tab's isolated world. It is not running inside Rust, not inside the Lua VM, and not inside the extension worker. Every injected tab/frame owns its own content script registry.

```text
Tab 1 / frame 0
  content-script.ts
    handlers:
      click
      fill
      snapshot
    docs:
      page.click
      page.fill
      page.snapshot

Tab 2 / frame 0
  content-script.ts
    handlers:
      click
      fill
      snapshot
    docs:
      page.click
      page.fill
      page.snapshot

Tab 2 / frame 3
  content-script.ts
    handlers:
      click
      fill
      snapshot
    docs:
      page.click
      page.fill
      page.snapshot
```

The content script registry is local to that injected execution context:

```ts
const contentScriptHandlers = new Map<string, ToolHandler>();
const contentScriptDocsByPublicName = new Map<string, ToolDoc>();
const contentScriptDocsByAction = new Map<string, ToolDoc>();
```

When content script code calls `register(...)`, it inserts into both executable and documentation registries:

```ts
register(
  "click",
  ContentClickParamsSchema,
  z.null(),
  {
    publicName: "page.click",
    namespace: "page",
    name: "click",
    action: "page_click",
    localName: "click",
    source: "content_script",
    transport: "active_tab_content_script",
    description: "Click an element in the current page.",
    params: [
      {
        name: "refId",
        type: "string",
        required: true,
        description: "Element ref id from the latest page snapshot.",
      },
    ],
    returns: {
      type: "null",
      description: "Returns null after the click is dispatched.",
    },
  },
  async (params) => {
    const element = getElementByRefId(params.refId);
    element.click();
    return null;
  },
);
```

The first argument, `"click"`, is the local content script action. The `doc.action`, `"page_click"`, is the cross-runtime dispatch action. The `doc.publicName`, `"page.click"`, is the Lua/LLM-facing API name.

```text
localName / local action:
  click

cross-runtime action:
  page_click

public Lua API:
  page.click
```

These names are explicitly declared at the tool level. They are not derived by string replacement.

```text
Tool identity record
+------------------------------------------------+
| publicName: "page.click"                       |
| namespace:  "page"                             |
| name:       "click"                            |
| action:     "page_click"                       |
| localName:  "click"                            |
| source:     "content_script"                   |
| transport:  "active_tab_content_script"        |
+------------------------------------------------+
```

The Lua callback and the JS dispatcher both use this identity record:

```text
Lua function:
  page.click(...)
        |
        v
Rust callback declares:
  action = "page_click"
        |
        v
AsyncCommand:
  action = "page_click"
        |
        v
JS runner registry lookup:
  "page_click"
        |
        v
transport adapter reads:
  localName = "click"
        |
        v
content script local dispatch:
  "click"
```

No part of the system assumes that `"page.click"` can be safely converted to `"page_click"`. Aliases, nested namespaces, legacy action names, and local content script names are all explicit metadata.

## Channel Message Protocol

All runner-to-content-script communication uses a single message envelope. Raw ad hoc messages are not valid.

Request:

```ts
type PiccoloToolRequest = {
  channel: "piccolo-tool";
  version: 1;
  requestId: string;
  action: string;
  params: unknown;
};
```

Success response:

```ts
type PiccoloToolSuccessResponse = {
  channel: "piccolo-tool";
  version: 1;
  requestId: string;
  ok: true;
  value: unknown;
};
```

Error response:

```ts
type PiccoloToolErrorResponse = {
  channel: "piccolo-tool";
  version: 1;
  requestId: string;
  ok: false;
  error: {
    code: string;
    category: string;
    message: string;
  };
};
```

The content script listener handles only this channel:

```ts
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!isPiccoloToolRequest(message)) return false;

  dispatchLocalContentScriptTool(message.action, message.params)
    .then((value) => {
      sendResponse({
        channel: "piccolo-tool",
        version: 1,
        requestId: message.requestId,
        ok: true,
        value,
      });
    })
    .catch((error) => {
      sendResponse({
        channel: "piccolo-tool",
        version: 1,
        requestId: message.requestId,
        ok: false,
        error: normalizeToolError(error),
      });
    });

  return true;
});
```

The listener returns `true` for every valid Piccolo tool request because the response is asynchronous. Without this, Chrome may close the message channel before `sendResponse` runs.

The JS runner sends content script requests through exactly one function:

```ts
async function callContentScriptTool(
  tabId: number,
  frameId: number | undefined,
  action: string,
  params: unknown,
): Promise<unknown> {
  const requestId = crypto.randomUUID();
  const request: PiccoloToolRequest = {
    channel: "piccolo-tool",
    version: 1,
    requestId,
    action,
    params,
  };

  const response = await chrome.tabs.sendMessage(
    tabId,
    request,
    frameId === undefined ? undefined : { frameId },
  );

  assertPiccoloToolResponse(response, requestId);

  if (!response.ok) {
    throw toToolError(response.error);
  }

  return response.value;
}
```

`assertPiccoloToolResponse` verifies:

```text
channel   == "piccolo-tool"
version   == 1
requestId == original request id
ok        is boolean
```

Every content-script-backed public action uses this path:

```text
page_click
        |
        v
ensureContentScript(tabId, frameId)
        |
        v
callContentScriptTool(tabId, frameId, "click", params)
```

## Content Script Readiness Protocol

The runner never assumes a content script is present. It proves readiness before dispatching a content-script-backed tool.

```text
ensureContentScript(tabId, frameId)
        |
        +-- send "__ping"
        |
        +-- if ping succeeds:
        |     return ready
        |
        +-- if ping fails:
        |     inject content-script.js
        |     send "__ping" again
        |     require ready response
        |
        v
content script is ready for tool calls
```

The content script registers an internal ping action:

```ts
register(
  "__ping",
  z.object({}),
  z.object({
    ready: z.literal(true),
    version: z.string(),
    toolsHash: z.string(),
  }),
  {
    publicName: "__internal.content_script.ping",
    namespace: "__internal",
    name: "ping",
    action: "__content_script_ping",
    localName: "__ping",
    source: "content_script",
    transport: "active_tab_content_script",
    description: "Return content script readiness and registered tools version.",
    params: [],
    returns: {
      type: "{ ready: true, version: string, toolsHash: string }",
      description: "Content script readiness metadata.",
    },
  },
  async () => ({
    ready: true,
    version: CONTENT_SCRIPT_VERSION,
    toolsHash: getContentScriptToolsHash(),
  }),
);
```

The runner injection path:

```ts
async function ensureContentScript(tabId: number, frameId?: number): Promise<void> {
  const ping = await tryPingContentScript(tabId, frameId);
  if (ping?.ready === true) return;

  await chrome.scripting.executeScript({
    target: frameId === undefined ? { tabId } : { tabId, frameIds: [frameId] },
    files: ["content-script.js"],
  });

  const afterInject = await tryPingContentScript(tabId, frameId);
  if (afterInject?.ready !== true) {
    throw new ToolError(
      "Content script did not become ready after injection",
      "E_CONTENT_SCRIPT_NOT_READY",
      "transport",
    );
  }
}
```

## Content Script Docs Protocol

Content script docs are pulled by the runner using the same channel. The content script registers an internal docs action:

```ts
register(
  "__tool_docs",
  z.object({}),
  z.array(ToolDocSchema),
  {
    publicName: "__internal.content_script.tool_docs",
    namespace: "__internal",
    name: "tool_docs",
    action: "__content_script_tool_docs",
    localName: "__tool_docs",
    source: "content_script",
    transport: "active_tab_content_script",
    description: "Return content script tool documentation.",
    params: [],
    returns: {
      type: "ToolDoc[]",
      description: "Documentation for tools registered inside this content script.",
    },
  },
  async () => listLocalToolDocs(),
);
```

The runner fetches docs from a ready content script:

```ts
async function fetchContentScriptDocs(
  tabId: number,
  frameId?: number,
): Promise<ToolDoc[]> {
  await ensureContentScript(tabId, frameId);
  const docs = await callContentScriptTool(tabId, frameId, "__tool_docs", {});
  return ToolDocArraySchema.parse(docs);
}
```

Those docs are merged into the main JS documentation registry:

```text
content script ToolDoc[]
        |
        v
normalize docs for tab/frame context
        |
        v
mergedDocRegistry.upsertMany(docs)
        |
        +-- byPublicName["page.click"]
        |
        +-- byAction["page_click"]
```

The merged registry stores source context:

```ts
type ResolvedToolDoc = ToolDoc & {
  availability: {
    tabId?: number;
    frameId?: number;
    fetchedAt: number;
    toolsHash?: string;
  };
};
```

## Metadata Flow From Content Script To Lua VM

Content script metadata reaches Lua through two explicit protocols:

```text
Protocol A:
  runner <-> content script
  "__tool_docs"

Protocol B:
  Rust Lua VM <-> JS runner
  "__runtime_docs"
  "__runtime_get_doc"
  "__runtime_search_docs"
```

Full flow:

```text
content-script.ts
  register("click", args, returns, doc, handler)
        |
        v
contentScriptDocsByPublicName
contentScriptDocsByAction
        |
        | Protocol A:
        | runner calls "__tool_docs"
        v
extension runner / main thread JS
  receives ToolDoc[]
  validates ToolDoc[]
  merges into mergedDocRegistry
        |
        | Protocol B:
        | Rust emits "__runtime_docs"
        v
Rust WASM session
  receives JSON ToolDoc[]
  converts JSON to Lua table
        |
        v
Lua runtime.docs()
```

For `runtime.get_doc("page.click")`:

```text
Lua
  runtime.get_doc("page.click")
        |
        v
Rust callback
  AsyncCommand {
    action: "__runtime_get_doc",
    params: { query: "page.click" }
  }
        |
        v
JS runner
  mergedDocRegistry.get("page.click")
        |
        v
AsyncResponse {
  ok: true,
  value: ToolDoc | null
}
        |
        v
Rust
  json_value_to_lua(value)
        |
        v
Lua
  table | nil
```

For `runtime.docs()`:

```text
Lua
  runtime.docs()
        |
        v
Rust callback
  AsyncCommand {
    action: "__runtime_docs",
    params: {}
  }
        |
        v
JS runner
  mergedDocRegistry.list()
        |
        v
AsyncResponse {
  ok: true,
  value: ToolDoc[]
}
        |
        v
Rust
  json_value_to_lua(value)
        |
        v
Lua
  array-like table of docs
```

The JS runner registers runtime doc provider tools like any other tool:

```ts
register(
  "__runtime_get_doc",
  RuntimeGetDocParamsSchema,
  ToolDocSchema.nullable(),
  {
    publicName: "runtime.get_doc",
    namespace: "runtime",
    name: "get_doc",
    action: "__runtime_get_doc",
    source: "main_thread",
    transport: "extension_worker",
    description: "Return documentation for one runtime-visible API.",
    params: [
      {
        name: "query",
        type: "string",
        required: true,
        description: "Public API name or internal action name.",
      },
    ],
    returns: {
      type: "ToolDoc | null",
      description: "Tool documentation, or null when no matching API exists.",
    },
  },
  async ({ query }) => mergedDocRegistry.get(query) ?? null,
);
```

```ts
register(
  "__runtime_docs",
  z.object({}),
  z.array(ToolDocSchema),
  {
    publicName: "runtime.docs",
    namespace: "runtime",
    name: "docs",
    action: "__runtime_docs",
    source: "main_thread",
    transport: "extension_worker",
    description: "Return documentation for all runtime-visible APIs.",
    params: [],
    returns: {
      type: "ToolDoc[]",
      description: "All currently visible runtime API documentation.",
    },
  },
  async () => mergedDocRegistry.list(),
);
```

## End-To-End Content Script Action Call

This is the exact call chain for `page.click`:

```text
Lua:
  page.click({ refId = "abc" })

Rust:
  Lua callback for publicName "page.click"
  uses explicit action "page_click"
        |
        v
  AsyncCommand {
    call_id,
    action: "page_click",
    params: { refId: "abc" }
  }

JS runner:
  dispatch("page_click", { refId: "abc" })
        |
        v
  tool doc says:
    transport = "active_tab_content_script"
    localName = "click"
        |
        v
  ensureContentScript(activeTabId, frameId)
        |
        v
  callContentScriptTool(activeTabId, frameId, "click", { refId: "abc" })

Chrome message:
  {
    channel: "piccolo-tool",
    version: 1,
    requestId,
    action: "click",
    params: { refId: "abc" }
  }

content-script.ts:
  onMessage validates channel/version/requestId
        |
        v
  dispatchLocalContentScriptTool("click", { refId: "abc" })
        |
        v
  local handler clicks DOM element
        |
        v
  sendResponse({
    channel: "piccolo-tool",
    version: 1,
    requestId,
    ok: true,
    value: null
  })

JS runner:
  validates response
  validates return schema
  returns AsyncResponse ok to Rust

Rust:
  resumes Lua coroutine

Lua:
  page.click returns nil
```

The system-level invariants are:

```text
1. content script actions are registered in content-script.ts, per tab/frame execution context
2. publicName/action/localName are explicit tool metadata
3. Lua callbacks use action, not publicName, for AsyncCommand
4. JS runner uses action for registry lookup
5. content script transport uses localName for local dispatch
6. runner-to-content-script messages always use channel/version/requestId
7. async content script listeners always return true
8. every content-script-backed dispatch calls ensureContentScript first
9. content script docs are fetched through "__tool_docs"
10. Lua runtime docs are fetched through "__runtime_docs" and "__runtime_get_doc"
11. Rust converts returned JSON docs into Lua tables
12. Lua and the LLM see public Lua APIs, never private content script actions
```

## Static Docs, Availability, And Multiple Content Scripts

Content-script-backed tools have two separate concepts:

```text
static docs
  The tool exists.
  This is its public Lua name.
  These are its args.
  This is its return value.
  This is how the LLM should call it.

availability
  Is this tool usable in the current tab/frame/document right now?
  Is the content script injected?
  Is the page injectable?
  Is the frame reachable?
  Is the current snapshot/refId scope still valid?
```

Static docs are canonical and live in the extension runner bundle. They do not depend on content script injection.

```text
static content docs
  page.click
  page.fill
  page.type
  page.snapshot
  page.scroll
```

Therefore, if the content script is not injected, blocked, or unavailable, Lua still receives docs:

```lua
local doc = runtime.get_doc("page.click")
print(doc.publicName)            -- "page.click"
print(doc.availability.status)   -- "not_injected" | "blocked" | "unknown"
```

The content script's `__tool_docs` response is runtime confirmation, not the only source of truth.

```text
canonical static docs
        |
        v
mergedDocRegistry always contains page.click
        |
        +-- if content script is ready:
        |     availability = "ready"
        |     optional runtime docs are verified against static docs
        |
        +-- if content script is not injected:
        |     availability = "not_injected"
        |
        +-- if injection is blocked:
              availability = "blocked"
```

This prevents a bad runtime state from hiding tool knowledge from the LLM. The LLM can see that `page.click` exists, and it can also see that the current page cannot execute it.

```text
                 +--------------------------+
                 | Static content docs      |
                 | in extension runner      |
                 +------------+-------------+
                              |
                              v
+-----------------+    +------+-------+    +------------------+
| content script  | -> | merged docs  | -> | Lua runtime.docs |
| __tool_docs     |    | registry     |    +------------------+
+-----------------+    +------+-------+
                              ^
                              |
                 +------------+-------------+
                 | availability probe       |
                 | ping/inject/error state  |
                 +--------------------------+
```

Availability is represented explicitly:

```ts
type ToolAvailability =
  | {
      status: "ready";
      tabId: number;
      frameId: number;
      documentId?: string;
      snapshotId?: string;
      checkedAt: number;
    }
  | {
      status: "not_injected";
      tabId?: number;
      frameId?: number;
      reason: string;
      checkedAt: number;
    }
  | {
      status: "blocked";
      tabId?: number;
      frameId?: number;
      reason: string;
      checkedAt: number;
    }
  | {
      status: "unknown";
      reason: string;
      checkedAt: number;
    };
```

The ToolDoc returned to Lua can include resolved availability for the active target:

```ts
type RuntimeToolDoc = ToolDoc & {
  availability: ToolAvailability;
};
```

### Multiple Content Script Contexts

An extension can have many content scripts alive at the same time. The system treats them as separate content contexts, not as one global registry.

The content context key is:

```ts
type ContentContextKey = {
  tabId: number;
  frameId: number;
  documentId?: string;
};
```

`tabId` alone is not enough because one tab can contain many frames. `frameId` is required. `documentId` is included when the browser API exposes it, because the same frame can navigate and receive a new document.

```text
tab 12 / frame 0 / document A
tab 12 / frame 3 / document B
tab 12 / frame 7 / document C
tab 15 / frame 0 / document K
```

Each content context has its own:

```text
content script registry
DOM tree
snapshot state
refId scope
readiness state
tool docs confirmation
```

The runner tracks them separately:

```ts
type ContentScriptContext = {
  key: ContentContextKey;
  ready: boolean;
  blocked: boolean;
  reason?: string;
  toolsHash?: string;
  docs: ToolDoc[];
  lastSeenAt: number;
};
```

The merged docs registry has one canonical public doc per API, plus per-context capability state:

```ts
type MergedDocRegistry = {
  staticDocsByPublicName: Map<string, ToolDoc>;
  staticDocsByAction: Map<string, ToolDoc>;

  contextDocs: Map<string, Map<string, ToolDoc>>;
  availability: Map<string, Map<string, ToolAvailability>>;
};
```

The key string is derived from `ContentContextKey`:

```text
tab=12:frame=0:document=A
tab=12:frame=3:document=B
tab=15:frame=0:document=K
```

The public docs view is deduped by public API name:

```text
runtime.docs()
  page.click
  page.fill
  page.snapshot
```

It does not return one `page.click` for every iframe. The default view resolves availability against the current active target.

```text
runtime.docs()
        |
        v
deduped public ToolDoc[]
        |
        v
availability attached for active tab/frame/document
```

A context-aware docs view can expose all contexts:

```lua
runtime.docs({ scope = "contexts" })
runtime.contexts()
```

That view can show:

```text
page.click
  tab=12 frame=0 document=A ready
  tab=12 frame=3 document=B ready
  tab=15 frame=0 document=K blocked
```

### Dispatch With Multiple Content Scripts

Tool docs are global. Tool availability is per content context. Tool execution is routed to exactly one content context.

```text
page.* APIs
  default to active tab + selected frame/main frame

tab.* APIs
  require or resolve explicit tabId/frameId

sidepanel.* APIs
  route to sidepanel DOM context
```

For `page.click`, the runner chooses the current active content context:

```text
page_click
        |
        v
resolveActiveContentContext()
        |
        v
ensureContentScript(tabId, frameId, documentId)
        |
        v
callContentScriptTool(tabId, frameId, "click", params)
```

For `tab.click`, the context is explicit:

```lua
tab.click({
  tabId = 12,
  frameId = 3,
  refId = "abc",
})
```

The dispatch route:

```text
tab_click
        |
        v
resolveContentContext(tabId=12, frameId=3)
        |
        v
ensureContentScript(12, 3, documentId)
        |
        v
callContentScriptTool(12, 3, "click", params)
```

Every message targets one context:

```ts
chrome.tabs.sendMessage(
  tabId,
  request,
  { frameId },
);
```

The request includes expected context metadata:

```ts
type PiccoloToolRequest = {
  channel: "piccolo-tool";
  version: 1;
  requestId: string;
  action: string;
  params: unknown;
  context: {
    tabId: number;
    frameId: number;
    documentId?: string;
  };
};
```

The content script response includes actual context metadata:

```ts
type PiccoloToolResponseContext = {
  frameId: number;
  documentId?: string;
  url: string;
};
```

The runner validates that the response matches the expected context. If the frame navigated and the document changed, the runner rejects the response as stale.

### Snapshot And RefId Scope

DOM `refId` values are scoped to one content context and one snapshot. They are not globally valid.

Snapshot results include context identity:

```ts
type SnapshotResult = {
  snapshotId: string;
  context: {
    tabId: number;
    frameId: number;
    documentId?: string;
    url: string;
  };
  text: string;
  nodes: SnapshotNode[];
};
```

A click that uses a `refId` must resolve against the same context:

```text
snapshot:
  tab=12 frame=0 document=A snapshot=S1 refId=abc

click:
  valid only against tab=12 frame=0 document=A snapshot=S1
```

The runtime can track the latest page snapshot context:

```text
latest page snapshot:
  tabId=12
  frameId=0
  documentId=A
  snapshotId=S1
```

Then:

```lua
local snap = page.snapshot()
page.click({ refId = snap.nodes[1].refId })
```

resolves against the latest page snapshot context. Explicit context also works:

```lua
tab.click({
  tabId = snap.context.tabId,
  frameId = snap.context.frameId,
  snapshotId = snap.snapshotId,
  refId = snap.nodes[1].refId,
})
```

### Multiple Content Script Mental Model

```text
                    +----------------------+
                    | Static Tool Docs     |
                    | page.click           |
                    | page.fill            |
                    +----------+-----------+
                               |
                               v
                    +----------------------+
                    | Public Docs View     |
                    | deduped by API name  |
                    +----------+-----------+
                               |
          +--------------------+--------------------+
          |                    |                    |
          v                    v                    v
+----------------+   +----------------+   +----------------+
| Context A      |   | Context B      |   | Context C      |
| tab 1 frame 0  |   | tab 1 frame 2  |   | tab 2 frame 0  |
| ready          |   | ready          |   | blocked        |
+----------------+   +----------------+   +----------------+
```

The invariants are:

```text
1. static docs are global and always visible
2. content script runtime confirmation is per context
3. availability is per context
4. execution is routed to exactly one context
5. docs are deduped by publicName in the default runtime docs view
6. context docs are available only through explicit context-aware APIs
7. refIds are scoped to a snapshot and content context
8. blocked or not-injected content scripts do not hide docs; they change availability
```
