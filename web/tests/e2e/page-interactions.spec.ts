import { expect, test } from "@playwright/test";
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
for _, node in ipairs(snap.nodes) do
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
for _, node in ipairs(snap.nodes) do
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
for _, node in ipairs(snap.nodes) do
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

  test("4: page.type on input sets value", async ({ page }) => {
    await setCellCode(
      page,
      0,
      `
local snap = page.snapshot_data()
local input_ref = nil
for _, node in ipairs(snap.nodes) do
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
for _, node in ipairs(snap.nodes) do
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
for _, node in ipairs(snap.nodes) do
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
for _, node in ipairs(snap.nodes) do
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
for _, node in ipairs(snap.nodes) do
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

  test("11: page.append on input appends text", async ({ page }) => {
    await setCellCode(
      page,
      0,
      `
local snap = page.snapshot_data()
local input_ref = nil
for _, node in ipairs(snap.nodes) do
  if node.tag == "input" and node.role == "textbox" then
    input_ref = node.refId
    break
  end
end
if input_ref then
  page.fill(input_ref, "hello")
  page.append(input_ref, " world")
  print("appended")
else
  print("no input")
end
      `.trim(),
    );
    await runCell(page, 0);
    await waitForCellStatus(page, 0, "success");
    await expectCellOutputContains(page, 0, "appended");
  });

  test("12: page.scroll with ref_id scrolls overflow container", async ({ page }) => {
    await page.evaluate(() => {
      const fixture = document.getElementById("e2e-test-fixture");
      const container = document.createElement("div");
      container.id = "e2e-scrollable";
      container.style.cssText = "overflow-y: auto; height: 100px; width: 100px;";
      const inner = document.createElement("div");
      inner.style.cssText = "height: 500px; width: 100px; background: #ccc;";
      container.appendChild(inner);
      fixture?.appendChild(container);
    });
    const scrollTopBefore = await page.evaluate(() => {
      const el = document.getElementById("e2e-scrollable");
      return el?.scrollTop ?? 0;
    });
    const consoleLogs: string[] = [];
    page.on("console", msg => consoleLogs.push(msg.text()));
    await setCellCode(
      page,
      0,
      `
local snap = page.snapshot_data()
local ref = nil
for _, node in ipairs(snap.nodes) do
  if node.id == "e2e-scrollable" then
    ref = node.refId
    break
  end
end
if ref then
  page.scroll("down", 50, ref)
  print("scrolled")
else
  print("no ref")
end
      `.trim(),
    );
    await runCell(page, 0);
    await waitForCellStatus(page, 0, "success");
    await expectCellOutputContains(page, 0, "scrolled");
    const scrollTopAfter = await page.evaluate(() => {
      const el = document.getElementById("e2e-scrollable");
      return el?.scrollTop ?? 0;
    });
    console.log("console logs:", consoleLogs);
    console.log("scrollTopBefore:", scrollTopBefore, "scrollTopAfter:", scrollTopAfter);
    expect(scrollTopAfter).toBeGreaterThan(scrollTopBefore);
  });

  test("13: page.type appends text to input", async ({ page }) => {
    await setCellCode(
      page,
      0,
      `
local snap = page.snapshot_data()
local input_ref = nil
for _, node in ipairs(snap.nodes) do
  if node.tag == "input" and node.role == "textbox" then
    input_ref = node.refId
    break
  end
end
if input_ref then
  page.fill(input_ref, "hello")
  page.type(input_ref, " world")
  print("typed")
else
  print("no input")
end
      `.trim(),
    );
    await runCell(page, 0);
    await waitForCellStatus(page, 0, "success");
    await expectCellOutputContains(page, 0, "typed");
    const value = await page.locator("#e2e-input").inputValue();
    expect(value).toBe("hello world");
  });

  test("14: invalid refId error mentions snapshot scope", async ({ page }) => {
    await setCellCode(
      page,
      0,
      `
local ok, err = pcall(page.click, "e99999")
print(err)
      `.trim(),
    );
    await runCell(page, 0);
    await waitForCellStatus(page, 0, "success");
    await expectCellOutputContains(page, 0, "Handles are scoped to a single snapshot");
  });
});
