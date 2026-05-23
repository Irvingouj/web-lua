import { test, expect, type Page, type Locator } from "@playwright/test";

// ─── Helpers (shared pattern) ─────────────────────────────────────

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

test.describe("web.fetch", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await waitForKernelReady(page);
  });

  test("1: web.fetch returns response from mock API", async ({ page }) => {
    // Intercept fetch requests
    await page.route("https://api.mock.com/data", (route) => {
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ name: "test", count: 42 }),
      });
    });

    await setCellCode(
      page,
      0,
      `local response = web.fetch("https://api.mock.com/data")
local data = json.decode(response.body)
print(data.name)
print(data.count)`
    );

    await runCell(page, 0);
    await waitForCellStatus(page, 0, "success");

    const output = getCellOutput(page, 0);
    await expect(output).toContainText("test");
    await expect(output).toContainText("42");
  });

  test("2: web.fetch handles HTTP 404", async ({ page }) => {
    await page.route("https://api.mock.com/notfound", (route) => {
      route.fulfill({ status: 404, body: "Not Found" });
    });

    await setCellCode(
      page,
      0,
      `local response = web.fetch("https://api.mock.com/notfound")
print(response.status)
print(response.ok)`
    );

    await runCell(page, 0);
    await waitForCellStatus(page, 0, "success");

    const output = getCellOutput(page, 0);
    await expect(output).toContainText("404");
    await expect(output).toContainText("false");
  });

  test("3: web.fetch handles network error with pcall", async ({ page }) => {
    await page.route("https://api.mock.com/fail", (route) => {
      route.abort("connectionrefused");
    });

    await setCellCode(
      page,
      0,
      `local ok, result = pcall(function()
    return web.fetch("https://api.mock.com/fail")
end)
print("caught error:", not ok)`
    );

    await runCell(page, 0);
    await waitForCellStatus(page, 0, "success");

    const output = getCellOutput(page, 0);
    await expect(output).toContainText("caught error:	true");
  });

  test("4: web.fetch with POST method", async ({ page }) => {
    await page.route("https://api.mock.com/submit", async (route) => {
      route.fulfill({
        status: 201,
        contentType: "application/json",
        body: JSON.stringify({ created: true }),
      });
    });

    await setCellCode(
      page,
      0,
      `local payload = json.encode({name = "lua"})
local response = web.fetch("https://api.mock.com/submit", {
    method = "POST",
    body = payload,
    headers = {["Content-Type"] = "application/json"}
})
print(response.status)`
    );

    await runCell(page, 0);
    await waitForCellStatus(page, 0, "success");

    const output = getCellOutput(page, 0);
    await expect(output).toContainText("201");
  });

  test("5: multiple fetch calls in one cell", async ({ page }) => {
    let callCount = 0;
    await page.route("https://api.mock.com/**", (route) => {
      callCount++;
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ id: callCount }),
      });
    });

    await setCellCode(
      page,
      0,
      `local r1 = web.fetch("https://api.mock.com/first")
local r2 = web.fetch("https://api.mock.com/second")
local d1 = json.decode(r1.body)
local d2 = json.decode(r2.body)
print(d1.id, d2.id)`
    );

    await runCell(page, 0);
    await waitForCellStatus(page, 0, "success");

    const output = getCellOutput(page, 0);
    await expect(output).toContainText("1");
    await expect(output).toContainText("2");
  });
});
