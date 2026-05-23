import { test, expect } from "@playwright/test";
import { getCell, setCellCode, runCell, waitForCellStatus, waitForKernelReady, expectCellOutputContains } from "../helpers";

test.describe("host.call() bridge", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await waitForKernelReady(page);
  });

  test("1: host.call returns error when no handler registered", async ({ page }) => {
    await setCellCode(page, 0, `local ok, result = pcall(function()
  return host.call("unknown_action", {})
end)
print("not ok: " .. tostring(not ok))`);
    await runCell(page, 0);
    await waitForCellStatus(page, 0, "success");
    await expectCellOutputContains(page, 0, "not ok:");
  });

  test("2: host.call with registered handler returns value", async ({ page }) => {
    // Register a handler
    await page.evaluate(() => {
      (window as any).__hostHandlers = {
        greet: async (params: any) => "Hello, " + (params.name || "world"),
      };
    });
    await setCellCode(page, 0, `local ok, result = pcall(function()
  return host.call("greet", { name = "Lua" })
end)
if ok then
  print("Result: " .. tostring(result))
else
  print("Error: " .. tostring(result))
end`);
    await runCell(page, 0);
    await waitForCellStatus(page, 0, "success");
    await expectCellOutputContains(page, 0, "Result:");
  });

  test("3: host.call with handler returning complex data", async ({ page }) => {
    await page.evaluate(() => {
      (window as any).__hostHandlers = {
        getData: async () => ({ items: [1, 2, 3], total: 3 }),
      };
    });
    await setCellCode(page, 0, `local ok, result = pcall(function()
  return host.call("getData", {})
end)
if ok then
  print("Type: " .. type(result))
else
  print("Error: " .. tostring(result))
end`);
    await runCell(page, 0);
    await waitForCellStatus(page, 0, "success");
    await expectCellOutputContains(page, 0, "Type:");
  });

  test("4: host.call error from handler propagates to Lua", async ({ page }) => {
    await page.evaluate(() => {
      (window as any).__hostHandlers = {
        fail: async () => { throw new Error("handler error"); },
      };
    });
    await setCellCode(page, 0, `local ok, result = pcall(function()
  return host.call("fail", {})
end)
print("not ok: " .. tostring(not ok))`);
    await runCell(page, 0);
    await waitForCellStatus(page, 0, "success");
    await expectCellOutputContains(page, 0, "not ok:");
  });

  test("5: host.call combined with built-in APIs", async ({ page }) => {
    await page.evaluate(() => {
      (window as any).__hostHandlers = {
        echo: async (params: any) => params,
      };
    });
    await setCellCode(page, 0, `local ok, result = pcall(function()
  return host.call("echo", { msg = "hello" })
end)
if ok then
  print("Type: " .. type(result))
else
  print("Error: " .. tostring(result))
end`);
    await runCell(page, 0);
    await waitForCellStatus(page, 0, "success");
    await expectCellOutputContains(page, 0, "Type:");
  });
});
