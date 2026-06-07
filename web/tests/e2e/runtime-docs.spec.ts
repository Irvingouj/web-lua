import { test } from "@playwright/test";
import {
  expectCellOutputContains,
  launchExtensionContext,
  runCell,
  setCellCode,
  waitForCellStatus,
  waitForKernelReady,
} from "../extension-helpers";

test.describe("runtime docs merging and content script discovery", () => {
  test("runtime.docs returns merged docs including content script tools after page interaction", async () => {
    const { context, popup } = await launchExtensionContext();
    const logs: string[] = [];
    popup.on("console", (msg) => logs.push(`[page] ${msg.text()}`));
    popup.on("worker", (worker) => {
      worker.on("console", (msg) => logs.push(`[worker] ${msg.text()}`));
    });
    try {
      await waitForKernelReady(popup, 30_000);
      await popup
        .locator(".cm-content")
        .first()
        .waitFor({ state: "visible", timeout: 10_000 });
      await popup.waitForTimeout(500);

      // Engage the content script by opening a tab and calling a bridge tool
      await setCellCode(
        popup,
        0,
        `
local newTab = tab.open("https://example.com")
tab.wait_for_load(newTab)

-- Calling a bridge tool triggers ensureContentScript and merges docs
local ok, err = pcall(function()
  tab.click(newTab, "dummy")
end)
print("engaged: " .. tostring(ok or not ok))
      `,
      );
      await runCell(popup, 0);
      await waitForCellStatus(popup, 0, "success", 30_000);
      await expectCellOutputContains(popup, 0, "engaged: true");

      // Now check runtime.docs includes content script tools
      await setCellCode(
        popup,
        0,
        `
local docs = runtime.docs()
local hasPageClick = false
local source = ""
for _, doc in ipairs(docs) do
  if doc.publicName == "page.click" then
    hasPageClick = true
    source = doc.source
  end
end
print("has_page_click: " .. tostring(hasPageClick))
print("source: " .. source)
      `,
      );
      await runCell(popup, 0);
      await waitForCellStatus(popup, 0, "success", 20_000);
      const output = await popup.locator('[data-testid="cell-output"]').first().innerText();
      await expectCellOutputContains(popup, 0, "has_page_click: true");
      await expectCellOutputContains(popup, 0, "source: content_script");
    } catch (e) {
      console.log("=== CONSOLE LOGS ===");
      logs.forEach((l) => console.log(l));
      console.log("=== END LOGS ===");
      throw e;
    } finally {
      await context.close();
    }
  });

  test("runtime.get_doc returns correct doc for page.click with source content_script", async () => {
    const { context, popup } = await launchExtensionContext();
    try {
      await waitForKernelReady(popup, 30_000);
      await popup
        .locator(".cm-content")
        .first()
        .waitFor({ state: "visible", timeout: 10_000 });
      await popup.waitForTimeout(500);

      // Engage the content script first
      await setCellCode(
        popup,
        0,
        `
local newTab = tab.open("https://example.com")
tab.wait_for_load(newTab)

-- Calling a bridge tool triggers ensureContentScript and merges docs
local ok, err = pcall(function()
  tab.click(newTab, "dummy")
end)
print("engaged: " .. tostring(ok or not ok))
      `,
      );
      await runCell(popup, 0);
      await waitForCellStatus(popup, 0, "success", 30_000);
      await expectCellOutputContains(popup, 0, "engaged: true");

      // Query specific doc
      await setCellCode(
        popup,
        0,
        `
local doc = runtime.get_doc("page.click")
print("has_doc: " .. tostring(doc ~= nil))
if doc then
  print("publicName: " .. doc.publicName)
  print("source: " .. doc.source)
end
      `,
      );
      await runCell(popup, 0);
      await waitForCellStatus(popup, 0, "success", 20_000);
      await expectCellOutputContains(popup, 0, "has_doc: true");
      await expectCellOutputContains(popup, 0, "publicName: page.click");
      await expectCellOutputContains(popup, 0, "source: content_script");
    } finally {
      await context.close();
    }
  });

  test("content script is re-injected after navigation and tools still work", async () => {
    const { context, popup } = await launchExtensionContext();
    try {
      await waitForKernelReady(popup, 30_000);
      await popup
        .locator(".cm-content")
        .first()
        .waitFor({ state: "visible", timeout: 10_000 });
      await popup.waitForTimeout(500);

      await setCellCode(
        popup,
        0,
        `
local newTab = tab.open("https://example.com")
tab.wait_for_load(newTab)

-- Engage content script before navigation
local ok1, err1 = pcall(function()
  tab.click(newTab, "dummy")
end)
print("before_nav: " .. tostring(ok1 or not ok1))

-- Verify docs are merged
local doc1 = runtime.get_doc("page.click")
print("before_source: " .. (doc1 and doc1.source or "none"))

-- Navigate to a new URL to trigger content script re-injection
local result = tab.evaluate(newTab, "window.location.href = 'https://example.org'")
tab.wait_for_load(newTab)

-- Re-engage content script after navigation
local ok2, err2 = pcall(function()
  tab.click(newTab, "dummy")
end)
print("after_nav: " .. tostring(ok2 or not ok2))

-- Verify docs are still merged after re-injection
local doc2 = runtime.get_doc("page.click")
print("after_source: " .. (doc2 and doc2.source or "none"))
      `,
      );
      await runCell(popup, 0);
      await waitForCellStatus(popup, 0, "success", 30_000);
      await expectCellOutputContains(popup, 0, "before_nav: true");
      await expectCellOutputContains(popup, 0, "before_source: content_script");
      await expectCellOutputContains(popup, 0, "after_nav: true");
      await expectCellOutputContains(popup, 0, "after_source: content_script");
    } finally {
      await context.close();
    }
  });
});
