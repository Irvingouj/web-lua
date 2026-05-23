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

test.describe("host.call() bridge", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await waitForKernelReady(page);
  });

  test("1: host.call returns error when no handler registered", async ({ page }) => {
    await setCellCode(
      page,
      0,
      `local ok, result = pcall(function()
    return host.call("missing_handler", {})
end)
print("caught:", not ok)`
    );

    await runCell(page, 0);
    await waitForCellStatus(page, 0, "success");

    const output = getCellOutput(page, 0);
    await expect(output).toContainText("caught:\ttrue");
  });

  test("2: host.call with registered handler returns value", async ({ page }) => {
    // Register handler via window.__hostHandlers
    await page.evaluate(() => {
      (window as any).__hostHandlers = {
        greet: async (params: any) => {
          return "Hello, " + (params.name || "stranger") + "!";
        },
      };
    });

    await setCellCode(
      page,
      0,
      `local result = host.call("greet", {name = "World"})
print(result)`
    );

    await runCell(page, 0);
    await waitForCellStatus(page, 0, "success");

    const output = getCellOutput(page, 0);
    await expect(output).toContainText("Hello, World!");
  });

  test("3: host.call with handler returning complex data", async ({ page }) => {
    await page.evaluate(() => {
      (window as any).__hostHandlers = {
        database: async (params: any) => {
          return [
            { id: 1, name: "Alice", score: 95 },
            { id: 2, name: "Bob", score: 87 },
          ];
        },
      };
    });

    await setCellCode(
      page,
      0,
      `local users = host.call("database", {query = "SELECT * FROM users"})
for i = 1, #users do
    print(users[i].name .. ": " .. users[i].score)
end`
    );

    await runCell(page, 0);
    await waitForCellStatus(page, 0, "success");

    const output = getCellOutput(page, 0);
    await expect(output).toContainText("Alice: 95");
    await expect(output).toContainText("Bob: 87");
  });

  test("4: host.call error from handler propagates to Lua", async ({ page }) => {
    await page.evaluate(() => {
      (window as any).__hostHandlers = {
        fail: async (params: any) => {
          throw new Error("Something went wrong!");
        },
      };
    });

    await setCellCode(
      page,
      0,
      `local ok, err = pcall(function()
    host.call("fail", {})
end)
print("caught:", not ok)`
    );

    await runCell(page, 0);
    await waitForCellStatus(page, 0, "success");

    const output = getCellOutput(page, 0);
    await expect(output).toContainText("caught:\ttrue");
  });

  test("5: host.call combined with built-in APIs", async ({ page }) => {
    await page.evaluate(() => {
      (window as any).__hostHandlers = {
        config: async (params: any) => {
          return { apiUrl: "https://api.mock.com", version: "2.0" };
        },
      };
    });

    // Mock fetch for this test
    await page.route("https://api.mock.com/status", (route) => {
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ status: "healthy" }),
      });
    });

    await setCellCode(
      page,
      0,
      `-- Get config from host, then use it with built-in web.fetch
local config = host.call("config", {})
local response = web.fetch(config.apiUrl .. "/status")
local data = json.decode(response.body)
print("api", config.version, "status:", data.status)`
    );

    await runCell(page, 0);
    await waitForCellStatus(page, 0, "success");

    const output = getCellOutput(page, 0);
    await expect(output).toContainText("api\t2.0\tstatus:\thealthy");
  });
});
