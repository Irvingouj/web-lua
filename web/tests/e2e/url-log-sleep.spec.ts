import { test } from "@playwright/test";
import {
  expectCellOutputContains,
  runCell,
  setCellCode,
  waitForCellStatus,
  waitForKernelReady,
} from "../helpers";

test.describe("web.url / web.log / web.sleep", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await waitForKernelReady(page);
  });

  test("1: web.url.parse extracts URL components", async ({ page }) => {
    await setCellCode(
      page,
      0,
      `local u = web.url.parse("https://example.com:8080/path?q=1#section")
print("scheme: " .. tostring(u.scheme))
print("host: " .. tostring(u.host))`,
    );
    await runCell(page, 0);
    await waitForCellStatus(page, 0, "success");
    await expectCellOutputContains(page, 0, "scheme: https");
    await expectCellOutputContains(page, 0, "host: example.com");
  });

  test("2: web.url.encode encodes table to query string", async ({ page }) => {
    await setCellCode(
      page,
      0,
      `local qs = web.url.encode({ a = "1", b = "hello world" })
print("qs: " .. qs)`,
    );
    await runCell(page, 0);
    await waitForCellStatus(page, 0, "success");
    await expectCellOutputContains(page, 0, "qs:");
  });

  test("3: web.sleep pauses execution", async ({ page }) => {
    await setCellCode(
      page,
      0,
      `print("before sleep")
web.sleep(100)
print("slept")`,
    );
    await runCell(page, 0);
    await waitForCellStatus(page, 0, "success", 20_000);
    await expectCellOutputContains(page, 0, "slept");
  });

  test("4: web.log does not crash", async ({ page }) => {
    await setCellCode(
      page,
      0,
      `web.log("test message")
print("logged")`,
    );
    await runCell(page, 0);
    await waitForCellStatus(page, 0, "success");
    await expectCellOutputContains(page, 0, "logged");
  });
});
