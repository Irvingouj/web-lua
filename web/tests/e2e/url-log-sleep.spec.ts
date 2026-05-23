import { test, expect, type Page, type Locator } from "@playwright/test";

// ─── Helpers ─────────────────────────────────────────────────────

function getCell(page: Page, index: number): Locator {
  return page.locator('[data-testid="cell"]').nth(index);
}

function getCellEditor(page: Page, index: number): Locator {
  return getCell(page, index).locator('[data-testid="cell-editor"]');
}

function getCellOutput(page: Page, index: number): Locator {
  return getCell(page, index).locator('[data-testid="cell-output"]');
}

function getCellStatus(page: Page, index: number): Locator {
  return getCell(page, index).locator('[data-testid="cell-status"]');
}

function getCellRunButton(page: Page, index: number): Locator {
  return getCell(page, index).locator('[data-testid="cell-run-button"]');
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

test.describe("web.url / web.log / web.sleep", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await waitForKernelReady(page);
  });

  test("1: web.url.parse extracts URL components", async ({ page }) => {
    await setCellCode(
      page,
      0,
      `local u = web.url.parse("https://example.com/path?q=hello#section")
print(u.scheme)
print(u.host)
print(u.path)
print(u.fragment)`
    );

    await runCell(page, 0);
    await waitForCellStatus(page, 0, "success");

    const output = getCellOutput(page, 0);
    await expect(output).toContainText("https");
    await expect(output).toContainText("example.com");
    await expect(output).toContainText("/path");
    await expect(output).toContainText("section");
  });

  test("2: web.url.encode encodes table to query string", async ({ page }) => {
    await setCellCode(
      page,
      0,
      `local qs = web.url.encode({a = "1", b = "hello world"})
print(qs)`
    );

    await runCell(page, 0);
    await waitForCellStatus(page, 0, "success");

    const output = getCellOutput(page, 0);
    await expect(output).toContainText("a=1");
    await expect(output).toContainText("b=hello%20world");
  });

  test("3: web.sleep pauses execution", async ({ page }) => {
    await setCellCode(
      page,
      0,
      `print("before")
web.sleep(100)
print("after")`
    );

    await runCell(page, 0);
    await waitForCellStatus(page, 0, "success");

    const output = getCellOutput(page, 0);
    await expect(output).toContainText("before");
    await expect(output).toContainText("after");
  });

  test("4: web.log does not crash", async ({ page }) => {
    await setCellCode(
      page,
      0,
      `web.log("test message")
web.log("key", 42, true)
print("logged")`
    );

    await runCell(page, 0);
    await waitForCellStatus(page, 0, "success");

    const output = getCellOutput(page, 0);
    await expect(output).toContainText("logged");
  });
});
