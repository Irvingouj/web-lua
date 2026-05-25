import { test } from "@playwright/test";
import {
  expectCellOutputContains,
  runCell,
  setCellCode,
  waitForCellStatus,
  waitForKernelReady,
} from "../helpers";

test.describe("web.storage", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await waitForKernelReady(page);
  });

  test("1: web.storage.set and get", async ({ page }) => {
    await setCellCode(
      page,
      0,
      `web.storage.set("test_key", "test_value")
local val = web.storage.get("test_key")
print("Value: " .. tostring(val))`,
    );
    await runCell(page, 0);
    await waitForCellStatus(page, 0, "success");
    await expectCellOutputContains(page, 0, "Value: test_value");
  });

  test("2: web.storage.get returns nil for missing key", async ({ page }) => {
    await setCellCode(
      page,
      0,
      `local val = web.storage.get("nonexistent_key_xyz")
print("Value: " .. tostring(val))`,
    );
    await runCell(page, 0);
    await waitForCellStatus(page, 0, "success");
    await expectCellOutputContains(page, 0, "Value: nil");
  });

  test("3: web.storage.delete removes a key", async ({ page }) => {
    await setCellCode(
      page,
      0,
      `web.storage.set("to_delete", "hello")
web.storage.delete("to_delete")
local val = web.storage.get("to_delete")
print("After delete: " .. tostring(val))`,
    );
    await runCell(page, 0);
    await waitForCellStatus(page, 0, "success");
    await expectCellOutputContains(page, 0, "After delete: nil");
  });

  test("4: web.storage.list returns keys", async ({ page }) => {
    await setCellCode(
      page,
      0,
      `web.storage.set("list_a", "1")
web.storage.set("list_b", "2")
local keys = web.storage.list()
print("Has list_a: " .. tostring(false))
for _, k in ipairs(keys) do
  if k == "list_a" then print("Has list_a: true") end
end`,
    );
    await runCell(page, 0);
    await waitForCellStatus(page, 0, "success");
    await expectCellOutputContains(page, 0, "Has list_a: true");
  });
});
