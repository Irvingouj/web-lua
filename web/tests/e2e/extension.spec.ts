import { test } from "@playwright/test";
import {
  expectCellOutputContains,
  runCell,
  setCellCode,
  waitForCellStatus,
  waitForKernelReady,
} from "../helpers";

test.describe("Browser Extension APIs", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await waitForKernelReady(page);
  });

  test("1: web.tab.query returns error in non-extension context", async ({
    page,
  }) => {
    await setCellCode(
      page,
      0,
      `local ok, result = pcall(function()
  return web.tab.query({})
end)
print("not ok: " .. tostring(not ok))`,
    );
    await runCell(page, 0);
    await waitForCellStatus(page, 0, "success");
    await expectCellOutputContains(page, 0, "not ok:");
  });

  test("2: web.cookies.list returns error in non-extension context", async ({
    page,
  }) => {
    await setCellCode(
      page,
      0,
      `local ok, result = pcall(function()
  return web.cookies.list({})
end)
print("not ok: " .. tostring(not ok))`,
    );
    await runCell(page, 0);
    await waitForCellStatus(page, 0, "success");
    await expectCellOutputContains(page, 0, "not ok:");
  });

  test("3: web.history.search returns error in non-extension context", async ({
    page,
  }) => {
    await setCellCode(
      page,
      0,
      `local ok, result = pcall(function()
  return web.history.search({})
end)
print("not ok: " .. tostring(not ok))`,
    );
    await runCell(page, 0);
    await waitForCellStatus(page, 0, "success");
    await expectCellOutputContains(page, 0, "not ok:");
  });

  test("4: web.bookmarks.search returns error in non-extension context", async ({
    page,
  }) => {
    await setCellCode(
      page,
      0,
      `local ok, result = pcall(function()
  return web.bookmarks.search("test")
end)
print("not ok: " .. tostring(not ok))`,
    );
    await runCell(page, 0);
    await waitForCellStatus(page, 0, "success");
    await expectCellOutputContains(page, 0, "not ok:");
  });

  test("5: extension APIs are accessible from Lua", async ({ page }) => {
    await setCellCode(
      page,
      0,
      `-- Verify the API table exists
print("tab: " .. type(web.tab))
print("cookies: " .. type(web.cookies))
print("history: " .. type(web.history))
print("bookmarks: " .. type(web.bookmarks))`,
    );
    await runCell(page, 0);
    await waitForCellStatus(page, 0, "success");
    await expectCellOutputContains(page, 0, "tab: table");
  });
});
