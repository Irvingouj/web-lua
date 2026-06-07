import { test } from "@playwright/test";
import {
  expectCellOutputContains,
  launchExtensionContext,
  runCell,
  setCellCode,
  waitForCellStatus,
  waitForKernelReady,
} from "../extension-helpers";

test.describe("extension API demo", () => {
  test("exercises 20+ extension APIs in a single workflow", async () => {
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

      // Run the full extension API demo script
      await setCellCode(
        popup,
        0,
        `print("=== DEMO: Starting extension API workflow ===\\n")

-- 1. tab.open / tab.wait_for_load - Open a real web page first
print("[1] tab.open / tab.wait_for_load")
local newTab = tab.open("https://example.com")
tab.wait_for_load(newTab)
print("Opened new tab: " .. newTab)
print()

-- 2. tab.query - Get the newly opened tab info
print("[2] tab.query")
local tabs = tab.query({url = "https://example.com/*"})
local targetTab = tabs[1]
local url = targetTab.url
local title = targetTab.title
local tabId = targetTab.id
print("URL: " .. url)
print("Title: " .. title)
print("Tab ID: " .. tabId)
print()

-- 3. tab.snapshot_data
print("[3] tab.snapshot_data")
local snap = tab.snapshot_data({tabId = tabId, max_nodes = 10})
print("Found " .. #snap.nodes .. " nodes")
print("Snapshot text length: " .. string.len(snap.text))
print("Page title from snapshot: " .. snap.title)
print()

-- 4. page.find
print("[4] page.find")
local buttons = page.find("button")
print("Found " .. #buttons .. " buttons")
print()

-- 5. web.sleep
print("[5] web.sleep(500)")
web.sleep(500)
print("Slept for 500ms")
print()

-- 6. web.storage.set / web.storage.get
print("[6] web.storage.set / web.storage.get")
web.storage.set("demo_url", url)
web.storage.set("demo_title", title)
local saved_url = web.storage.get("demo_url")
print("Saved URL: " .. tostring(saved_url))
print()

-- 7. web.storage.list
print("[7] web.storage.list")
local keys = web.storage.list()
print("Storage keys: " .. table.concat(keys, ", "))
print()

-- 8. web.storage.delete
print("[8] web.storage.delete")
web.storage.delete("demo_title")
print("Deleted demo_title")
print()

-- 9. tab.snapshot_text
print("[9] tab.snapshot_text")
local text = tab.snapshot_text({tabId = tabId, max_nodes = 5})
print("Snapshot text (truncated): " .. string.sub(text, 1, 100))
print()

-- 10. chrome.tabs.get
print("[10] chrome.tabs.get")
local tabInfo = chrome.tabs.get(tabId)
print("Tab info URL: " .. tabInfo.url)
print("Tab info title: " .. tabInfo.title)
print()

-- 11. web.fetch
print("[11] web.fetch")
local resp = web.fetch("https://httpbin.org/get", {method = "GET", timeout = 5000})
print("Status: " .. resp.status)
print("OK: " .. tostring(resp.ok))
print("Body length: " .. string.len(resp.body))
print()

-- 12. web.fetch_dom
print("[12] web.fetch_dom")
local dom = web.fetch_dom("https://httpbin.org/html", {selector = "body", max_text = 20})
print("Fetched DOM status: " .. dom.status)
print("Matches count: " .. #dom.matches)
print()

-- 13. page.wait_for
print("[13] page.wait_for")
local found = page.wait_for("body", {timeout = 2000})
print("Wait for body: " .. tostring(found))
print()

-- 14. page.wait
print("[14] page.wait")
page.wait({duration = 200})
print("Waited 200ms")
print()

-- 15. sidepanel.url / sidepanel.title
print("[15] sidepanel.url / sidepanel.title")
local sp_url = sidepanel.url()
local sp_title = sidepanel.title()
print("Sidepanel URL: " .. sp_url)
print("Sidepanel title: " .. sp_title)
print()

-- 16. tab.click
print("[16] tab.click")
if #buttons > 0 and buttons[1].refId then
  local ok, err = pcall(function()
    tab.click(tabId, buttons[1].refId)
  end)
  print("Click result: " .. tostring(ok))
else
  print("No clickable buttons found")
end
print()

-- 17-20. Cleanup
print("[17-20] Cleanup")
web.storage.delete("demo_url")
tab.close(newTab)
print("Closed new tab")
print()

print("=== DEMO: All extension APIs exercised successfully! ===")`,
      );

      await runCell(popup, 0);
      await waitForCellStatus(popup, 0, "success", 60_000);

      // Verify key outputs from each API section
      await expectCellOutputContains(popup, 0, "=== DEMO: Starting extension API workflow ===");
      await expectCellOutputContains(popup, 0, "[1] tab.open / tab.wait_for_load");
      await expectCellOutputContains(popup, 0, "Opened new tab:");
      await expectCellOutputContains(popup, 0, "[2] tab.query");
      await expectCellOutputContains(popup, 0, "URL:");
      await expectCellOutputContains(popup, 0, "Title:");
      await expectCellOutputContains(popup, 0, "Tab ID:");
      await expectCellOutputContains(popup, 0, "[3] tab.snapshot_data");
      await expectCellOutputContains(popup, 0, "Found");
      await expectCellOutputContains(popup, 0, "nodes");
      await expectCellOutputContains(popup, 0, "[4] page.find");
      await expectCellOutputContains(popup, 0, "[5] web.sleep(500)");
      await expectCellOutputContains(popup, 0, "Slept for 500ms");
      await expectCellOutputContains(popup, 0, "[6] web.storage.set / web.storage.get");
      await expectCellOutputContains(popup, 0, "Saved URL:");
      await expectCellOutputContains(popup, 0, "[7] web.storage.list");
      await expectCellOutputContains(popup, 0, "Storage keys:");
      await expectCellOutputContains(popup, 0, "[8] web.storage.delete");
      await expectCellOutputContains(popup, 0, "Deleted demo_title");
      await expectCellOutputContains(popup, 0, "[9] tab.snapshot_text");
      await expectCellOutputContains(popup, 0, "Snapshot text (truncated):");
      await expectCellOutputContains(popup, 0, "[10] chrome.tabs.get");
      await expectCellOutputContains(popup, 0, "Tab info URL:");
      await expectCellOutputContains(popup, 0, "[11] web.fetch");
      await expectCellOutputContains(popup, 0, "Status:");
      await expectCellOutputContains(popup, 0, "OK:");
      await expectCellOutputContains(popup, 0, "[12] web.fetch_dom");
      await expectCellOutputContains(popup, 0, "Fetched DOM status:");
      await expectCellOutputContains(popup, 0, "[13] page.wait_for");
      await expectCellOutputContains(popup, 0, "Wait for body: true");
      await expectCellOutputContains(popup, 0, "[14] page.wait");
      await expectCellOutputContains(popup, 0, "Waited 200ms");
      await expectCellOutputContains(popup, 0, "[15] sidepanel.url / sidepanel.title");
      await expectCellOutputContains(popup, 0, "Sidepanel URL:");
      await expectCellOutputContains(popup, 0, "[16] tab.click");
      await expectCellOutputContains(popup, 0, "[17-20] Cleanup");
      await expectCellOutputContains(popup, 0, "Closed new tab");
      await expectCellOutputContains(popup, 0, "=== DEMO: All extension APIs exercised successfully! ===");
    } catch (e) {
      console.log("=== CONSOLE LOGS ===");
      logs.forEach((l) => console.log(l));
      console.log("=== END LOGS ===");
      throw e;
    } finally {
      await context.close();
    }
  });
});
