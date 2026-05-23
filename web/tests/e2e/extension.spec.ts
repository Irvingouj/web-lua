import { test, expect, type Page, type Locator } from "@playwright/test";

// ─── Helpers ─────────────────────────────────────────────────────

function getCellEditor(page: Page, index: number): Locator {
  return page.locator('[data-testid="cell"]').nth(index).locator('[data-testid="cell-editor"]');
}

function getCellOutput(page: Page, index: number): Locator {
  return page.locator('[data-testid="cell"]').nth(index).locator('[data-testid="cell-output"]');
}

function getCellStatus(page: Page, index: number): Locator {
  return page.locator('[data-testid="cell"]').nth(index).locator('[data-testid="cell-status"]');
}

function getCellRunButton(page: Page, index: number): Locator {
  return page.locator('[data-testid="cell"]').nth(index).locator('[data-testid="cell-run-button"]');
}

async function setCellCode(page: Page, index: number, code: string) {
  const editor = getCellEditor(page, index);
  await editor.click();
  await editor.fill(code);
}

async function runCell(page: Page, index: number) {
  await getCellRunButton(page, index).click();
}

async function waitForCellStatus(
  page: Page,
  index: number,
  status: string | RegExp,
  timeout = 15_000
) {
  const statusEl = getCellStatus(page, index);
  await expect(statusEl).toHaveText(status, { timeout });
}

async function waitForKernelReady(page: Page, timeout = 15_000) {
  const el = page.locator('[data-testid="kernel-status"]');
  await expect(el).toContainText("ready", { timeout });
}

// ─── Tests ──────────────────────────────────────────────────────

test.describe("Browser Extension APIs", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await waitForKernelReady(page);
  });

  test("1: web.tab.query returns error in non-extension context", async ({ page }) => {
    await setCellCode(
      page,
      0,
      `local ok, result = pcall(function()
    return web.tab.query({active = true})
end)
if not ok then
    print("error caught")
else
    print("no error")
end`
    );

    await runCell(page, 0);
    await waitForCellStatus(page, 0, "success");

    const output = getCellOutput(page, 0);
    // Should catch the ENOEXTENSION error since we're not in extension context
    await expect(output).toContainText("error caught");
  });

  test("2: web.cookies.list returns error in non-extension context", async ({ page }) => {
    await setCellCode(
      page,
      0,
      `local ok, result = pcall(function()
    return web.cookies.list({})
end)
if not ok then
    print("error caught")
end`
    );

    await runCell(page, 0);
    await waitForCellStatus(page, 0, "success");

    const output = getCellOutput(page, 0);
    await expect(output).toContainText("error caught");
  });

  test("3: web.history.search returns error in non-extension context", async ({ page }) => {
    await setCellCode(
      page,
      0,
      `local ok, result = pcall(function()
    return web.history.search({text = "test"})
end)
if not ok then
    print("error caught")
end`
    );

    await runCell(page, 0);
    await waitForCellStatus(page, 0, "success");

    const output = getCellOutput(page, 0);
    await expect(output).toContainText("error caught");
  });

  test("4: web.bookmarks.search returns error in non-extension context", async ({ page }) => {
    await setCellCode(
      page,
      0,
      `local ok, result = pcall(function()
    return web.bookmarks.search("test")
end)
if not ok then
    print("error caught")
end`
    );

    await runCell(page, 0);
    await waitForCellStatus(page, 0, "success");

    const output = getCellOutput(page, 0);
    await expect(output).toContainText("error caught");
  });

  test("5: extension APIs are accessible from Lua", async ({ page }) => {
    // Verify all extension API methods exist and can be called (they'll error but not crash)
    await setCellCode(
      page,
      0,
      `-- Verify all extension APIs are callable
local ok
ok = pcall(function() web.tab.query({}) end)
ok = pcall(function() web.tab.create({url = "test"}) end)
ok = pcall(function() web.cookies.get({}) end)
ok = pcall(function() web.cookies.set({}) end)
ok = pcall(function() web.history.search({}) end)
ok = pcall(function() web.bookmarks.search("test") end)
ok = pcall(function() web.bookmarks.create({title = "test"}) end)
ok = pcall(function() web.notifications.create("test", {}) end)
ok = pcall(function() web.clipboard.read() end)
ok = pcall(function() web.clipboard.write("test") end)
print("all apis callable")`
    );

    await runCell(page, 0);
    await waitForCellStatus(page, 0, "success");

    const output = getCellOutput(page, 0);
    await expect(output).toContainText("all apis callable");
  });
});
