import { test } from "@playwright/test";
import {
  expectCellOutputContains,
  runCell,
  setCellCode,
  waitForCellStatus,
  waitForKernelReady,
} from "../helpers";

test.describe("page.agent", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await waitForKernelReady(page);
  });

  test("1: page.snapshot returns data and text", async ({ page }) => {
    await setCellCode(
      page,
      0,
      `
local snap = page.snapshot()
print(type(snap.data))
print(type(snap.text))
    `.trim(),
    );
    await runCell(page, 0);
    await waitForCellStatus(page, 0, "success");
    await expectCellOutputContains(page, 0, "table");
    await expectCellOutputContains(page, 0, "string");
  });

  test("2: page.snapshot data has nodes", async ({ page }) => {
    await setCellCode(
      page,
      0,
      `
local snap = page.snapshot()
print(type(snap.data.nodes))
print(#snap.data.nodes > 0)
    `.trim(),
    );
    await runCell(page, 0);
    await waitForCellStatus(page, 0, "success");
    await expectCellOutputContains(page, 0, "table");
    await expectCellOutputContains(page, 0, "true");
  });

  test("3: page.snapshot text has ref IDs", async ({ page }) => {
    await setCellCode(
      page,
      0,
      `
local snap = page.snapshot({ max_nodes = 3 })
print(string.sub(snap.text, 1, 2))
    `.trim(),
    );
    await runCell(page, 0);
    await waitForCellStatus(page, 0, "success");
    await expectCellOutputContains(page, 0, "[e");
  });

  test("4: page.snapshot with max_nodes", async ({ page }) => {
    await setCellCode(
      page,
      0,
      `
local snap = page.snapshot({ max_nodes = 10 })
print(#snap.data.nodes > 0)
    `.trim(),
    );
    await runCell(page, 0);
    await waitForCellStatus(page, 0, "success");
    await expectCellOutputContains(page, 0, "true");
  });

  test("5: page.snapshot nodes have roles", async ({ page }) => {
    await setCellCode(
      page,
      0,
      `
local snap = page.snapshot()
local node = snap.data.nodes[1]
print(type(node.refId))
print(type(node.role))
    `.trim(),
    );
    await runCell(page, 0);
    await waitForCellStatus(page, 0, "success");
    await expectCellOutputContains(page, 0, "string");
  });

  test("6: page.click invalid ref throws error", async ({ page }) => {
    await setCellCode(
      page,
      0,
      `
local ok, err = pcall(page.click, "e999")
print(tostring(ok))
    `.trim(),
    );
    await runCell(page, 0);
    await waitForCellStatus(page, 0, "success");
    await expectCellOutputContains(page, 0, "false");
  });

  test("7: page.hover and page.unhover work", async ({ page }) => {
    await setCellCode(
      page,
      0,
      `
local snap = page.snapshot({ interactive_only = true })
local btn_ref = nil
for _, node in ipairs(snap.data.nodes) do
  if node.role == "button" then
    btn_ref = node.refId
    break
  end
end
if btn_ref then
  local ok1 = page.hover(btn_ref)
  print("hover:" .. tostring(ok1))
  local ok2 = page.unhover(btn_ref)
  print("unhover:" .. tostring(ok2))
else
  print("no button")
end
    `.trim(),
    );
    await runCell(page, 0);
    await waitForCellStatus(page, 0, "success");
    await expectCellOutputContains(page, 0, "hover:");
  });

  test("8: page.url returns URL string", async ({ page }) => {
    await setCellCode(
      page,
      0,
      `
local url = page.url()
print(type(url))
    `.trim(),
    );
    await runCell(page, 0);
    await waitForCellStatus(page, 0, "success");
    await expectCellOutputContains(page, 0, "string");
  });

  test("9: page.title returns title string", async ({ page }) => {
    await setCellCode(
      page,
      0,
      `
local title = page.title()
print(type(title))
    `.trim(),
    );
    await runCell(page, 0);
    await waitForCellStatus(page, 0, "success");
    await expectCellOutputContains(page, 0, "string");
  });

  test("10: page.scroll works", async ({ page }) => {
    await setCellCode(
      page,
      0,
      `
local result = page.scroll("down", 100)
print(tostring(result))
    `.trim(),
    );
    await runCell(page, 0);
    await waitForCellStatus(page, 0, "success");
    await expectCellOutputContains(page, 0, "true");
  });

  test("11: page.wait completes", async ({ page }) => {
    await setCellCode(
      page,
      0,
      `
local result = page.wait(100)
print(tostring(result))
    `.trim(),
    );
    await runCell(page, 0);
    await waitForCellStatus(page, 0, "success");
    await expectCellOutputContains(page, 0, "true");
  });

  test("12: page.snapshot has version", async ({ page }) => {
    await setCellCode(
      page,
      0,
      `
local snap = page.snapshot()
print(type(snap.data.version))
    `.trim(),
    );
    await runCell(page, 0);
    await waitForCellStatus(page, 0, "success");
    await expectCellOutputContains(page, 0, "string");
  });

  test("13: page.snapshot has viewport", async ({ page }) => {
    await setCellCode(
      page,
      0,
      `
local snap = page.snapshot()
if snap.data.viewport then
  print(type(snap.data.viewport.width))
else
  print("no viewport")
end
    `.trim(),
    );
    await runCell(page, 0);
    await waitForCellStatus(page, 0, "success");
    await expectCellOutputContains(page, 0, "number");
  });

  test("14: page.snapshot text is non-empty", async ({ page }) => {
    await setCellCode(
      page,
      0,
      `
local snap = page.snapshot({ max_nodes = 5 })
print(#snap.text > 0)
    `.trim(),
    );
    await runCell(page, 0);
    await waitForCellStatus(page, 0, "success");
    await expectCellOutputContains(page, 0, "true");
  });

  test("15: page.snapshot with interactive_only", async ({ page }) => {
    await setCellCode(
      page,
      0,
      `
local snap = page.snapshot({ interactive_only = true })
print(#snap.data.nodes > 0)
    `.trim(),
    );
    await runCell(page, 0);
    await waitForCellStatus(page, 0, "success");
    await expectCellOutputContains(page, 0, "true");
  });
});
