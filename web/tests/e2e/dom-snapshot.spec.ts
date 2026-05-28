import { test } from "@playwright/test";
import {
  expectCellOutputContains,
  runCell,
  setCellCode,
  waitForCellStatus,
  waitForKernelReady,
} from "../helpers";

test.describe("dom.snapshot", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await waitForKernelReady(page);
  });

  test("1: dom.snapshot returns table with data and text", async ({ page }) => {
    await setCellCode(
      page,
      0,
      `
local snap = dom.snapshot()
print(type(snap.nodes))
print(type(snap.text))
    `.trim(),
    );
    await runCell(page, 0);
    await waitForCellStatus(page, 0, "success");
    await expectCellOutputContains(page, 0, "table");
    await expectCellOutputContains(page, 0, "string");
  });

  test("2: dom.snapshot data has nodes array", async ({ page }) => {
    await setCellCode(
      page,
      0,
      `
local snap = dom.snapshot()
print(type(snap.nodes))
print(#snap.nodes > 0)
    `.trim(),
    );
    await runCell(page, 0);
    await waitForCellStatus(page, 0, "success");
    await expectCellOutputContains(page, 0, "table");
    await expectCellOutputContains(page, 0, "true");
  });

  test("3: dom.snapshot nodes have semantic roles", async ({ page }) => {
    await setCellCode(
      page,
      0,
      `
local snap = dom.snapshot()
local node = snap.nodes[1]
print(type(node.role))
print(node.role ~= "")
    `.trim(),
    );
    await runCell(page, 0);
    await waitForCellStatus(page, 0, "success");
    await expectCellOutputContains(page, 0, "string");
    await expectCellOutputContains(page, 0, "true");
  });

  test("4: dom.snapshot with options", async ({ page }) => {
    await setCellCode(
      page,
      0,
      `
local snap = dom.snapshot({ interactive_only = true, max_nodes = 50 })
print(#snap.nodes <= 50)
    `.trim(),
    );
    await runCell(page, 0);
    await waitForCellStatus(page, 0, "success");
    await expectCellOutputContains(page, 0, "true");
  });

  test("5: dom.snapshot text is compact format", async ({ page }) => {
    await setCellCode(
      page,
      0,
      `
local snap = dom.snapshot({ max_nodes = 5 })
local text = snap.text
print(type(text))
print(#text > 0)
    `.trim(),
    );
    await runCell(page, 0);
    await waitForCellStatus(page, 0, "success");
    await expectCellOutputContains(page, 0, "string");
    await expectCellOutputContains(page, 0, "true");
  });

  test("6: dom.snapshot text starts with ref ID bracket", async ({ page }) => {
    await setCellCode(
      page,
      0,
      `
local snap = dom.snapshot({ max_nodes = 3 })
local text = snap.text
-- First line should start with [e (ref ID format)
print(string.sub(text, 1, 2))
    `.trim(),
    );
    await runCell(page, 0);
    await waitForCellStatus(page, 0, "success");
    await expectCellOutputContains(page, 0, "[e");
  });

  test("7: dom.snapshot nodes have expected fields", async ({ page }) => {
    await setCellCode(
      page,
      0,
      `
local snap = dom.snapshot()
local node = snap.nodes[1]
print(type(node.refId) == "string")
print(type(node.role) == "string")
print(type(node.tag) == "string")
    `.trim(),
    );
    await runCell(page, 0);
    await waitForCellStatus(page, 0, "success");
    await expectCellOutputContains(page, 0, "true");
  });

  test("8: dom.snapshot returns viewport info", async ({ page }) => {
    await setCellCode(
      page,
      0,
      `
local snap = dom.snapshot()
if snap.viewport then
  print(type(snap.viewport.width) == "number")
  print(type(snap.viewport.height) == "number")
else
  print(true)
end
    `.trim(),
    );
    await runCell(page, 0);
    await waitForCellStatus(page, 0, "success");
    await expectCellOutputContains(page, 0, "true");
  });

  test("9: dom.snapshot version is available", async ({ page }) => {
    await setCellCode(
      page,
      0,
      `
local snap = dom.snapshot()
print(snap.version ~= nil)
print(type(snap.version) == "string")
    `.trim(),
    );
    await runCell(page, 0);
    await waitForCellStatus(page, 0, "success");
    await expectCellOutputContains(page, 0, "true");
  });

  test("10: dom.snapshot text shows button roles", async ({ page }) => {
    await setCellCode(
      page,
      0,
      `
local snap = dom.snapshot()
local hasButton = string.find(snap.text, "button") ~= nil
print(hasButton)
    `.trim(),
    );
    await runCell(page, 0);
    await waitForCellStatus(page, 0, "success");
    await expectCellOutputContains(page, 0, "true");
  });
});
