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

async function addCell(page: Page) {
  await page.locator('[data-testid="add-cell-button"]').click();
}

// ─── Tests ──────────────────────────────────────────────────────

test.describe("web.storage", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await waitForKernelReady(page);
    // Clear any previous storage test data
    await page.evaluate(() => localStorage.clear());
  });

  test("1: web.storage.set and get", async ({ page }) => {
    // Set a value
    await setCellCode(
      page,
      0,
      `web.storage.set("test_key", "hello_storage")`
    );
    await runCell(page, 0);
    await waitForCellStatus(page, 0, "success");

    // Add a new cell and get the value
    await addCell(page);
    await page.waitForTimeout(100);
    await setCellCode(
      page,
      1,
      `print(web.storage.get("test_key"))`
    );
    await runCell(page, 1);
    await waitForCellStatus(page, 1, "success");

    const output = getCellOutput(page, 1);
    await expect(output).toContainText("hello_storage");
  });

  test("2: web.storage.get returns nil for missing key", async ({ page }) => {
    await setCellCode(
      page,
      0,
      `local val = web.storage.get("nonexistent_key_xyz")
print(val)`
    );
    await runCell(page, 0);
    await waitForCellStatus(page, 0, "success");

    const output = getCellOutput(page, 0);
    await expect(output).toContainText("nil");
  });

  test("3: web.storage.delete removes a key", async ({ page }) => {
    // Set first
    await setCellCode(
      page,
      0,
      `web.storage.set("del_key", "to_be_deleted")
print("set")`
    );
    await runCell(page, 0);
    await waitForCellStatus(page, 0, "success");

    // Delete
    await addCell(page);
    await page.waitForTimeout(100);
    await setCellCode(page, 1, `web.storage.delete("del_key")`);
    await runCell(page, 1);
    await waitForCellStatus(page, 1, "success");

    // Verify deleted
    await addCell(page);
    await page.waitForTimeout(100);
    await setCellCode(
      page,
      2,
      `local val = web.storage.get("del_key")
print(val)`
    );
    await runCell(page, 2);
    await waitForCellStatus(page, 2, "success");

    const output = getCellOutput(page, 2);
    await expect(output).toContainText("nil");
  });

  test("4: web.storage.list returns keys", async ({ page }) => {
    // Set a few values
    await setCellCode(
      page,
      0,
      `web.storage.set("list_a", "1")
web.storage.set("list_b", "2")`
    );
    await runCell(page, 0);
    await waitForCellStatus(page, 0, "success");

    // List keys - this is tricky because multiple async calls in one cell
    // Let's do them in separate cells
    await addCell(page);
    await page.waitForTimeout(100);
    await setCellCode(
      page,
      1,
      `local keys = web.storage.list()
-- keys should be a table
for i = 1, #keys do
    if keys[i] == "list_a" or keys[i] == "list_b" then
        print(keys[i])
    end
end`
    );
    await runCell(page, 1);
    await waitForCellStatus(page, 1, "success", 20_000);

    const output = getCellOutput(page, 1);
    await expect(output).toContainText("list_a");
    await expect(output).toContainText("list_b");
  });
});
