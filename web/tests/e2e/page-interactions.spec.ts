import { test } from "@playwright/test";
import {
  expectCellOutputContains,
  runCell,
  setCellCode,
  waitForCellStatus,
  waitForKernelReady,
} from "../helpers";

test.describe("page interactions", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await waitForKernelReady(page);
    // Inject a fixture with interactive elements for the tests
    await page.evaluate(() => {
      const fixture = document.createElement("div");
      fixture.id = "e2e-test-fixture";
      fixture.style.cssText = "padding: 20px;";
      fixture.innerHTML = `
        <input type="text" id="e2e-input" value="initial" />
        <select id="e2e-select">
          <option value="a">Option A</option>
          <option value="b">Option B</option>
        </select>
        <input type="checkbox" id="e2e-checkbox" />
        <button id="e2e-button" onclick="this.dataset.clicks=(parseInt(this.dataset.clicks||0)+1).toString()">Click me</button>
        <div id="e2e-tall" style="height: 2000px; width: 100px; background: #eee;"></div>
      `;
      document.body.appendChild(fixture);
    });
  });

  test("1: page.click on valid ref succeeds", async ({ page }) => {
    await setCellCode(
      page,
      0,
      `
local snap = page.snapshot_data({ interactive_only = true })
local btn_ref = nil
for _, node in ipairs(snap.data.nodes) do
  if node.role == "button" then
    btn_ref = node.refId
    break
  end
end
if btn_ref then
  local ok = page.click(btn_ref)
  print("clicked")
else
  print("no button")
end
      `.trim(),
    );
    await runCell(page, 0);
    await waitForCellStatus(page, 0, "success");
    await expectCellOutputContains(page, 0, "clicked");
  });

  test("2: page.dblclick on valid ref succeeds", async ({ page }) => {
    await setCellCode(
      page,
      0,
      `
local snap = page.snapshot_data({ interactive_only = true })
local btn_ref = nil
for _, node in ipairs(snap.data.nodes) do
  if node.role == "button" then
    btn_ref = node.refId
    break
  end
end
if btn_ref then
  local ok = page.dblclick(btn_ref)
  print("dblclicked")
else
  print("no button")
end
      `.trim(),
    );
    await runCell(page, 0);
    await waitForCellStatus(page, 0, "success");
    await expectCellOutputContains(page, 0, "dblclicked");
  });

  test("3: page.fill on input succeeds", async ({ page }) => {
    await setCellCode(
      page,
      0,
      `
local snap = page.snapshot_data()
local input_ref = nil
for _, node in ipairs(snap.data.nodes) do
  if node.tag == "input" and node.role == "textbox" then
    input_ref = node.refId
    break
  end
end
if input_ref then
  page.fill(input_ref, "hello world")
  print("filled")
else
  print("no input")
end
      `.trim(),
    );
    await runCell(page, 0);
    await waitForCellStatus(page, 0, "success");
    await expectCellOutputContains(page, 0, "filled");
  });

  test("4: page.type on input appends text", async ({ page }) => {
    await setCellCode(
      page,
      0,
      `
local snap = page.snapshot_data()
local input_ref = nil
for _, node in ipairs(snap.data.nodes) do
  if node.tag == "input" and node.role == "textbox" then
    input_ref = node.refId
    break
  end
end
if input_ref then
  page.type(input_ref, "abc")
  print("typed")
else
  print("no input")
end
      `.trim(),
    );
    await runCell(page, 0);
    await waitForCellStatus(page, 0, "success");
    await expectCellOutputContains(page, 0, "typed");
  });

  test("5: page.press dispatches key event", async ({ page }) => {
    await setCellCode(
      page,
      0,
      `
local snap = page.snapshot_data()
local input_ref = nil
for _, node in ipairs(snap.data.nodes) do
  if node.tag == "input" and node.role == "textbox" then
    input_ref = node.refId
    break
  end
end
if input_ref then
  page.fill(input_ref, "test")
  page.press("Enter")
  print("pressed")
else
  print("no input")
end
      `.trim(),
    );
    await runCell(page, 0);
    await waitForCellStatus(page, 0, "success");
    await expectCellOutputContains(page, 0, "pressed");
  });

  test("6: page.select on dropdown succeeds", async ({ page }) => {
    await setCellCode(
      page,
      0,
      `
local snap = page.snapshot_data()
local select_ref = nil
for _, node in ipairs(snap.data.nodes) do
  if node.tag == "select" or node.role == "combobox" then
    select_ref = node.refId
    break
  end
end
if select_ref then
  page.select(select_ref, "b")
  print("selected")
else
  print("no select")
end
      `.trim(),
    );
    await runCell(page, 0);
    await waitForCellStatus(page, 0, "success");
    await expectCellOutputContains(page, 0, "selected");
  });

  test("7: page.check on checkbox succeeds", async ({ page }) => {
    await setCellCode(
      page,
      0,
      `
local snap = page.snapshot_data()
local check_ref = nil
for _, node in ipairs(snap.data.nodes) do
  if node.role == "checkbox" then
    check_ref = node.refId
    break
  end
end
if check_ref then
  page.check(check_ref, true)
  print("checked")
else
  print("no checkbox")
end
      `.trim(),
    );
    await runCell(page, 0);
    await waitForCellStatus(page, 0, "success");
    await expectCellOutputContains(page, 0, "checked");
  });

  test("8: page.scroll_to on tall element succeeds", async ({ page }) => {
    await setCellCode(
      page,
      0,
      `
local snap = page.snapshot_data()
local tall_ref = nil
for _, node in ipairs(snap.data.nodes) do
  if node.tag == "div" and node.refId then
    -- The tall div is near the end of the snapshot
    tall_ref = node.refId
  end
end
if tall_ref then
  page.scroll_to(tall_ref)
  print("scrolled")
else
  print("no tall element")
end
      `.trim(),
    );
    await runCell(page, 0);
    await waitForCellStatus(page, 0, "success");
    await expectCellOutputContains(page, 0, "scrolled");
  });

  test("9: page.back after history push succeeds", async ({ page }) => {
    // Push a history entry from the Playwright side so page.back() has somewhere to go
    await page.evaluate(() => {
      history.pushState({}, "", "#before-back");
    });
    await setCellCode(
      page,
      0,
      `
page.back()
print("went back")
      `.trim(),
    );
    await runCell(page, 0);
    await waitForCellStatus(page, 0, "success");
    await expectCellOutputContains(page, 0, "went back");
  });

  test("10: page.forward after back succeeds", async ({ page }) => {
    // Push two entries, go back, then forward
    await page.evaluate(() => {
      history.pushState({}, "", "#step-1");
      history.pushState({}, "", "#step-2");
      history.back();
    });
    await setCellCode(
      page,
      0,
      `
page.forward()
print("went forward")
      `.trim(),
    );
    await runCell(page, 0);
    await waitForCellStatus(page, 0, "success");
    await expectCellOutputContains(page, 0, "went forward");
  });
});
