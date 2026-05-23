# Chrome Extension Testing Guide

## Why Playwright + Bundled Chromium

Chrome extensions can only be tested in a **Chromium persistent context**.
Playwright ships its own Chromium binary that still supports the flags needed
to side-load extensions. Google Chrome and Edge have removed some of those
flags, so always use the Playwright-bundled Chromium.

## Test Scope

| Component | How to Test |
|---|---|
| **Content script** | Open a real/local page, check DOM injection |
| **Popup** | Navigate to `chrome-extension://<id>/popup.html` |
| **Background service worker** | Find service worker via context, verify events/storage/messages |

> **MV3 note:** `background.page` is gone. Use `background.service_worker`
> instead. Service workers have their own lifecycle and are not persistent.

## Setup

```bash
npm i -D @playwright/test
npx playwright install chromium
```

## Recommended Directory Structure

```
your-extension/
  manifest.json
  popup.html
  src/
  dist/              # built unpacked extension
  tests/
    extension.spec.ts
    fixtures/
      page.html      # local test page for content scripts
```

## Playwright Test Template

```ts
import { test, expect, chromium, type BrowserContext } from "@playwright/test";
import path from "node:path";

const extensionPath = path.resolve(__dirname, "../dist");

test.describe("Chrome extension", () => {
  let context: BrowserContext;
  let extensionId: string;

  test.beforeAll(async () => {
    context = await chromium.launchPersistentContext("", {
      headless: false,
      args: [
        `--disable-extensions-except=${extensionPath}`,
        `--load-extension=${extensionPath}`,
      ],
    });

    let [serviceWorker] = context.serviceWorkers();
    if (!serviceWorker) {
      serviceWorker = await context.waitForEvent("serviceworker");
    }

    extensionId = serviceWorker.url().split("/")[2];
  });

  test.afterAll(async () => {
    await context.close();
  });

  test("popup renders", async () => {
    const page = await context.newPage();
    await page.goto(`chrome-extension://${extensionId}/popup.html`);
    await expect(page.locator("body")).toBeVisible();
  });

  test("content script modifies page", async () => {
    const page = await context.newPage();
    await page.goto("https://example.com");
    // Replace with your content script's injected element
    await expect(page.locator("[data-extension-root]")).toBeVisible();
  });

  test("background service worker is alive", async () => {
    const [serviceWorker] = context.serviceWorkers();
    expect(serviceWorker.url()).toContain(extensionId);
  });
});
```

The key flags are:

```
--disable-extensions-except=./dist
--load-extension=./dist
```

## Testing Content Scripts with Fixture Pages

Don't rely on external websites. Create a local fixture HTML page:

```html
<!-- tests/fixtures/page.html -->
<!doctype html>
<html>
  <body>
    <button id="target">Click me</button>
    <div id="result"></div>
  </body>
</html>
```

Test against it:

```ts
test("content script works on fixture page", async () => {
  const page = await context.newPage();
  await page.goto(`file://${path.resolve(__dirname, "fixtures/page.html")}`);
  await page.locator("#target").click();
  await expect(page.locator("[data-extension-root]")).toBeVisible();
});
```

> **Note:** If your manifest doesn't grant `file://` access, use a local HTTP
> server instead:
> ```ts
> await page.goto("http://127.0.0.1:4173/fixtures/page.html");
> ```

## Testing Popup Interactions

```ts
test("popup button saves setting", async () => {
  const page = await context.newPage();
  await page.goto(`chrome-extension://${extensionId}/popup.html`);
  await page.getByRole("checkbox", { name: "Enable" }).check();
  await expect(page.getByText("Enabled")).toBeVisible();
});
```

## Testing Persistence

Service workers are not always alive. Trigger behavior from popup/content
script, then verify from the page side.

```ts
test("popup persists setting after reload", async () => {
  const popup = await context.newPage();
  await popup.goto(`chrome-extension://${extensionId}/popup.html`);

  await popup.getByRole("checkbox", { name: "Enable" }).check();
  await popup.reload();

  await expect(popup.getByRole("checkbox", { name: "Enable" })).toBeChecked();
});
```

## Testing Our Lua Notebook Extension

Our extension exposes Lua notebook APIs (`web.tab`, `web.cookies`, etc.) that
route through the worker's async relay system. To test:

1. Build the extension: `npm run build` → produces `dist/`
2. Load it as an unpacked extension
3. Open the popup (which is the notebook UI)
4. Run Lua cells that call extension APIs
5. Verify results

### Example Test

```ts
test("web.tab.query returns tabs from extension context", async () => {
  const popup = await context.newPage();
  await popup.goto(`chrome-extension://${extensionId}/popup.html`);

  // Wait for kernel to be ready
  await popup.waitForFunction(() => {
    const el = document.querySelector('[data-testid="kernel-status"]');
    return el?.textContent?.includes('ready');
  });

  // Type code using CodeMirror
  const editor = popup.locator('.cm-content').first();
  await editor.click();
  await popup.keyboard.insertText(
    'local ok, result = pcall(function()\n' +
    '  return web.tab.query({})\n' +
    'end)\n' +
    'if ok then\n' +
    '  print("tabs: " .. type(result))\n' +
    'else\n' +
    '  print("error: " .. tostring(result))\n' +
    'end'
  );

  // Run the cell
  await popup.locator('[data-testid="cell-run-button"]').first().click();

  // Check output
  await popup.waitForFunction(() => {
    const output = document.querySelector('[data-testid="cell-output"]');
    return output?.textContent?.includes('tabs:');
  }, { timeout: 10_000 });
});
```

## npm Scripts

```json
{
  "scripts": {
    "test:e2e": "playwright test",
    "test:e2e:headed": "playwright test --headed",
    "test:e2e:extension": "playwright test tests/extension.spec.ts"
  }
}
```

## Anti-patterns

- **Don't use Selenium** — harder to control extension context, service workers, and popup pages
- **Don't test against real websites** — use fixture pages or local servers
- **Don't assume service worker is always running** — MV3 workers idle after ~30s
- **Don't use `headless: true`** — extension loading requires headed mode in most Chromium builds

## References

- [Playwright Chrome Extensions docs](https://playwright.dev/docs/chrome-extensions)
- [Chrome MV3 Service Worker Lifecycle](https://developer.chrome.com/docs/extensions/develop/concepts/service-workers/lifecycle)
- [Content Scripts Guide](https://developer.chrome.com/docs/extensions/develop/concepts/content-scripts)
- [Migrate to Service Workers](https://developer.chrome.com/docs/extensions/develop/migrate/to-service-workers)
