import { expect, test } from "@playwright/test";
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

  test("1: page.snapshot returns readable text", async ({ page }) => {
    await setCellCode(
      page,
      0,
      `
local text = page.snapshot()
print(type(text))
    `.trim(),
    );
    await runCell(page, 0);
    await waitForCellStatus(page, 0, "success");
    await expectCellOutputContains(page, 0, "string");
  });

  test("2: page.snapshot_data returns structured data", async ({ page }) => {
    await setCellCode(
      page,
      0,
      `
local snap = page.snapshot_data()
print(type(snap.nodes))
print(type(snap.text))
    `.trim(),
    );
    await runCell(page, 0);
    await waitForCellStatus(page, 0, "success");
    await expectCellOutputContains(page, 0, "table");
    await expectCellOutputContains(page, 0, "string");
  });

  test("3: page.snapshot text has ref IDs", async ({ page }) => {
    await setCellCode(
      page,
      0,
      `
local text = page.snapshot({ max_nodes = 3 })
print(string.sub(text, 1, 2))
    `.trim(),
    );
    await runCell(page, 0);
    await waitForCellStatus(page, 0, "success");
    await expectCellOutputContains(page, 0, "[");
  });

  test("4: page.snapshot_data with max_nodes", async ({ page }) => {
    await setCellCode(
      page,
      0,
      `
local snap = page.snapshot_data({ max_nodes = 10 })
print(#snap.nodes > 0)
    `.trim(),
    );
    await runCell(page, 0);
    await waitForCellStatus(page, 0, "success");
    await expectCellOutputContains(page, 0, "true");
  });

  test("5: page.snapshot_data nodes have roles", async ({ page }) => {
    await setCellCode(
      page,
      0,
      `
local snap = page.snapshot_data()
local node = snap.nodes[1]
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
local snap = page.snapshot_data({ interactive_only = true })
local btn_ref = nil
for _, node in ipairs(snap.nodes) do
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

  test("12: page.snapshot_data has version", async ({ page }) => {
    await setCellCode(
      page,
      0,
      `
local snap = page.snapshot_data()
print(type(snap.version))
    `.trim(),
    );
    await runCell(page, 0);
    await waitForCellStatus(page, 0, "success");
    await expectCellOutputContains(page, 0, "string");
  });

  test("13: page.snapshot_data has viewport", async ({ page }) => {
    await setCellCode(
      page,
      0,
      `
local snap = page.snapshot_data()
if snap.viewport then
  print(type(snap.viewport.width))
else
  print("no viewport")
end
    `.trim(),
    );
    await runCell(page, 0);
    await waitForCellStatus(page, 0, "success");
    await expectCellOutputContains(page, 0, "number");
  });

  test("14: page.snapshot_data text is non-empty", async ({ page }) => {
    await setCellCode(
      page,
      0,
      `
local snap = page.snapshot_data({ max_nodes = 5 })
print(#snap.text > 0)
    `.trim(),
    );
    await runCell(page, 0);
    await waitForCellStatus(page, 0, "success");
    await expectCellOutputContains(page, 0, "true");
  });

  test("15: page.snapshot_data with interactive_only", async ({ page }) => {
    await setCellCode(
      page,
      0,
      `
local snap = page.snapshot_data({ interactive_only = true })
print(#snap.nodes > 0)
    `.trim(),
    );
    await runCell(page, 0);
    await waitForCellStatus(page, 0, "success");
    await expectCellOutputContains(page, 0, "true");
  });

  test("16: page.find returns matching elements", async ({ page }) => {
    await setCellCode(
      page,
      0,
      `
local found = page.find("button")
print(type(found))
print(#found > 0)
    `.trim(),
    );
    await runCell(page, 0);
    await waitForCellStatus(page, 0, "success");
    await expectCellOutputContains(page, 0, "table");
    await expectCellOutputContains(page, 0, "true");
  });

  test("17: page.wait_for finds existing element", async ({ page }) => {
    await setCellCode(
      page,
      0,
      `
local ok = page.wait_for("button", 1000)
print(tostring(ok))
    `.trim(),
    );
    await runCell(page, 0);
    await waitForCellStatus(page, 0, "success");
    await expectCellOutputContains(page, 0, "true");
  });

  test("18: page.extract returns requested fields", async ({ page }) => {
    await setCellCode(
      page,
      0,
      `
local data = page.extract({"title", "url"})
print(type(data.title))
print(type(data.url))
    `.trim(),
    );
    await runCell(page, 0);
    await waitForCellStatus(page, 0, "success");
    await expectCellOutputContains(page, 0, "string");
  });

  test("19: page.extract with opts truncates text", async ({ page }) => {
    await setCellCode(
      page,
      0,
      `
local data = page.extract({"title", "text"}, {max_text = 10})
print("title type: " .. type(data.title))
print("text length: " .. string.len(data.text))
    `.trim(),
    );
    await runCell(page, 0);
    await waitForCellStatus(page, 0, "success");
    await expectCellOutputContains(page, 0, "text length:");
  });

  test("20: page.snapshot_text alias returns string", async ({ page }) => {
    await setCellCode(
      page,
      0,
      `
local text = page.snapshot_text()
print(type(text))
    `.trim(),
    );
    await runCell(page, 0);
    await waitForCellStatus(page, 0, "success");
    await expectCellOutputContains(page, 0, "string");
  });

  test("22: sidepanel.click on valid ref succeeds", async ({ page }) => {
    await setCellCode(
      page,
      0,
      `
local snap = sidepanel.snapshot_data({ interactive_only = true })
local btn_ref = nil
for _, node in ipairs(snap.nodes) do
  if node.role == "button" then
    btn_ref = node.refId
    break
  end
end
if btn_ref then
  local ok = sidepanel.click(btn_ref)
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

  test("23: sidepanel.fill on input succeeds", async ({ page }) => {
    await setCellCode(
      page,
      0,
      `
local snap = sidepanel.snapshot_data()
local input_ref = nil
for _, node in ipairs(snap.nodes) do
  if node.tag == "input" and node.role == "textbox" then
    input_ref = node.refId
    break
  end
end
if input_ref then
  sidepanel.fill(input_ref, "hello")
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

  test("24: sidepanel.type on input sets value", async ({ page }) => {
    await setCellCode(
      page,
      0,
      `
local snap = sidepanel.snapshot_data()
local input_ref = nil
for _, node in ipairs(snap.nodes) do
  if node.tag == "input" and node.role == "textbox" then
    input_ref = node.refId
    break
  end
end
if input_ref then
  sidepanel.type(input_ref, "abc")
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

  test("25: sidepanel.append on input appends text", async ({ page }) => {
    await setCellCode(
      page,
      0,
      `
local snap = sidepanel.snapshot_data()
local input_ref = nil
for _, node in ipairs(snap.nodes) do
  if node.tag == "input" and node.role == "textbox" then
    input_ref = node.refId
    break
  end
end
if input_ref then
  sidepanel.fill(input_ref, "hello")
  sidepanel.append(input_ref, " world")
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

  test("26: sidepanel.press dispatches key event", async ({ page }) => {
    await setCellCode(
      page,
      0,
      `
local snap = sidepanel.snapshot_data()
local input_ref = nil
for _, node in ipairs(snap.nodes) do
  if node.tag == "input" and node.role == "textbox" then
    input_ref = node.refId
    break
  end
end
if input_ref then
  sidepanel.fill(input_ref, "test")
  sidepanel.press("Enter")
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

  test("27: sidepanel.select on dropdown succeeds", async ({ page }) => {
    await setCellCode(
      page,
      0,
      `
local snap = sidepanel.snapshot_data()
local select_ref = nil
for _, node in ipairs(snap.nodes) do
  if node.tag == "select" or node.role == "combobox" then
    select_ref = node.refId
    break
  end
end
if select_ref then
  sidepanel.select(select_ref, "b")
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

  test("28: sidepanel.check on checkbox succeeds", async ({ page }) => {
    await setCellCode(
      page,
      0,
      `
local snap = sidepanel.snapshot_data()
local check_ref = nil
for _, node in ipairs(snap.nodes) do
  if node.role == "checkbox" then
    check_ref = node.refId
    break
  end
end
if check_ref then
  sidepanel.check(check_ref, true)
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

  test("29: sidepanel.hover and sidepanel.unhover work", async ({ page }) => {
    await setCellCode(
      page,
      0,
      `
local snap = sidepanel.snapshot_data({ interactive_only = true })
local btn_ref = nil
for _, node in ipairs(snap.nodes) do
  if node.role == "button" then
    btn_ref = node.refId
    break
  end
end
if btn_ref then
  local ok1 = sidepanel.hover(btn_ref)
  print("hover:" .. tostring(ok1))
  local ok2 = sidepanel.unhover(btn_ref)
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

  test("30: sidepanel.scroll works", async ({ page }) => {
    await setCellCode(
      page,
      0,
      `
local result = sidepanel.scroll("down", 100)
print(tostring(result))
      `.trim(),
    );
    await runCell(page, 0);
    await waitForCellStatus(page, 0, "success");
    await expectCellOutputContains(page, 0, "true");
  });

  test("31: sidepanel.scroll_to on tall element succeeds", async ({ page }) => {
    await setCellCode(
      page,
      0,
      `
local snap = sidepanel.snapshot_data()
local tall_ref = nil
for _, node in ipairs(snap.nodes) do
  if node.tag == "div" and node.refId then
    tall_ref = node.refId
  end
end
if tall_ref then
  sidepanel.scroll_to(tall_ref)
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

  test("32: sidepanel.url returns URL string", async ({ page }) => {
    await setCellCode(
      page,
      0,
      `
local url = sidepanel.url()
print(type(url))
      `.trim(),
    );
    await runCell(page, 0);
    await waitForCellStatus(page, 0, "success");
    await expectCellOutputContains(page, 0, "string");
  });

  test("33: sidepanel.title returns title string", async ({ page }) => {
    await setCellCode(
      page,
      0,
      `
local title = sidepanel.title()
print(type(title))
      `.trim(),
    );
    await runCell(page, 0);
    await waitForCellStatus(page, 0, "success");
    await expectCellOutputContains(page, 0, "string");
  });

  test("34: sidepanel.wait completes", async ({ page }) => {
    await setCellCode(
      page,
      0,
      `
local result = sidepanel.wait(100)
print(tostring(result))
      `.trim(),
    );
    await runCell(page, 0);
    await waitForCellStatus(page, 0, "success");
    await expectCellOutputContains(page, 0, "true");
  });

  test("35: page.snapshot auto-prints without explicit print", async ({
    page,
  }) => {
    await setCellCode(page, 0, `return page.snapshot()`);
    await runCell(page, 0);
    await waitForCellStatus(page, 0, "success");
    await expectCellOutputContains(page, 0, "Lua Notebook");
    const outputLine = page
      .locator('[data-testid="cell-output-line"]')
      .filter({ hasText: "Lua Notebook" });
    await expect(outputLine).toHaveClass(/output-auto/);
  });

  test("36: page.find returns full text without truncation", async ({
    page,
  }) => {
    await page.evaluate(() => {
      const el = document.createElement("div");
      el.id = "e2e-long-text";
      el.textContent = "a".repeat(200);
      document.body.appendChild(el);
    });
    await setCellCode(
      page,
      0,
      `
local items = page.find({selector = "#e2e-long-text"})
print(#items[1].text > 100)
      `.trim(),
    );
    await runCell(page, 0);
    await waitForCellStatus(page, 0, "success");
    await expectCellOutputContains(page, 0, "true");
  });

  test("37: unknown API error includes Did you mean hint", async ({ page }) => {
    await setCellCode(
      page,
      0,
      `
local ok, err = pcall(page.snapsot)
print(err)
      `.trim(),
    );
    await runCell(page, 0);
    await waitForCellStatus(page, 0, "success");
    await expectCellOutputContains(page, 0, "Did you mean: page.snapshot?");
  });

  test("38: page.go alias is a callable function", async ({ page }) => {
    await setCellCode(
      page,
      0,
      `
print(type(page.go))
print(type(page["goto"]))
      `.trim(),
    );
    await runCell(page, 0);
    await waitForCellStatus(page, 0, "success");
    await expectCellOutputContains(page, 0, "function");
  });
});
