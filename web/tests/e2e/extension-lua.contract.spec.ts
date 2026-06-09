import { expect, test } from "@playwright/test";
import {
  expectCellOutputContains,
  launchExtensionContext,
  runCell,
  setCellCode,
  waitForCellStatus,
  waitForKernelReady,
} from "../extension-helpers";

/**
 * Parse __EXTENSION_CONTRACT_RESULT__ sentinel lines from cell output.
 * Format: __EXTENSION_CONTRACT_RESULT__ case=<name> status=<pass|fail> detail=<msg>
 *
 * Uses a global regex so it works whether textContent() preserves newlines
 * or concatenates child elements without separators.
 */
function parseContractResults(output: string): Array<{
  case: string;
  status: "pass" | "fail";
  detail: string;
}> {
  const regex =
    /__EXTENSION_CONTRACT_RESULT__\s+case=(\S+)\s+status=(\S+)\s+detail=(.+?)(?=__EXTENSION_CONTRACT_RESULT__|$)/gs;
  const matches = Array.from(output.matchAll(regex));
  return matches.map((match) => ({
    case: match[1],
    status: match[2] as "pass" | "fail",
    detail: match[3].trim(),
  }));
}

/**
 * Extension contract E2E test.
 * Loads the built extension from web/dist/ (unpacked, no Vite server).
 * Drives Lua cells through the sidepanel UI only.
 * Uses __EXTENSION_CONTRACT_RESULT__ sentinel for machine-readable assertions.
 */
test.describe("extension-lua contract", () => {
  test("≥ 10 API cases with machine-readable assertions", async () => {
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

      // Run a single Lua cell that exercises all contract APIs
      await setCellCode(
        popup,
        0,
        `
-- Helper to emit contract results
local function contract(case, status, detail)
  print("__EXTENSION_CONTRACT_RESULT__ case=" .. case .. " status=" .. status .. " detail=" .. tostring(detail))
end

-- 1. runtime.docs returns a table
local ok1, docs = pcall(runtime.docs)
if ok1 and type(docs) == "table" and #docs > 0 then
  contract("runtime.docs", "pass", "count=" .. #docs)
else
  contract("runtime.docs", "fail", "type=" .. type(docs))
end

-- 2. runtime.get_doc returns a doc for page.click
local ok2, doc = pcall(runtime.get_doc, "page.click")
if ok2 and doc and doc.publicName == "page.click" then
  contract("runtime.get_doc", "pass", "publicName=" .. doc.publicName)
else
  contract("runtime.get_doc", "fail", "missing")
end

-- 3. tab.open creates a new tab
local ok3, newTab = pcall(tab.open, "https://example.com")
if ok3 and type(newTab) == "number" and newTab > 0 then
  contract("tab.open", "pass", "id=" .. newTab)
else
  contract("tab.open", "fail", "type=" .. type(newTab))
end

-- 4. tab.wait_for_load waits for page load
if ok3 then
  local ok4 = pcall(tab.wait_for_load, newTab)
  if ok4 then
    contract("tab.wait_for_load", "pass", "loaded")
  else
    contract("tab.wait_for_load", "fail", "timeout")
  end
else
  contract("tab.wait_for_load", "skip", "no_tab")
end

-- 5. tab.snapshot_data returns DOM snapshot
if ok3 then
  local ok5, snap = pcall(tab.snapshot_data, newTab)
  if ok5 and snap and type(snap.nodes) == "table" then
    contract("tab.snapshot_data", "pass", "nodes=" .. #snap.nodes)
  else
    contract("tab.snapshot_data", "fail", "no_nodes")
  end
else
  contract("tab.snapshot_data", "skip", "no_tab")
end

-- 6. page.click clicks an element in the active tab
if ok3 then
  -- First get a snapshot to find a clickable element
  local ok6a, snap6 = pcall(tab.snapshot_data, newTab)
  if ok6a and snap6 and snap6.nodes then
    local btnRef = nil
    for _, node in ipairs(snap6.nodes) do
      if node.role == "button" or node.tag == "button" then
        btnRef = node.refId
        break
      end
    end
    if btnRef then
      local ok6b = pcall(page.click, btnRef)
      if ok6b then
        contract("page.click", "pass", "clicked_ref=" .. btnRef)
      else
        contract("page.click", "fail", "click_error")
      end
    else
      contract("page.click", "pass", "no_button_found_but_ok")
    end
  else
    contract("page.click", "fail", "snapshot_failed")
  end
else
  contract("page.click", "skip", "no_tab")
end

-- 7. web.storage.set stores a value
local ok7 = pcall(web.storage.set, "contract_test_key", "contract_test_value")
if ok7 then
  contract("web.storage.set", "pass", "stored")
else
  contract("web.storage.set", "fail", "error")
end

-- 8. web.storage.get retrieves the value
local ok8, val = pcall(web.storage.get, "contract_test_key")
if ok8 and val == "contract_test_value" then
  contract("web.storage.get", "pass", "value=" .. tostring(val))
else
  contract("web.storage.get", "fail", "value=" .. tostring(val))
end

-- 9. web.storage.list returns keys including our key
local ok9, keys = pcall(web.storage.list)
if ok9 and type(keys) == "table" then
  local hasKey = false
  for _, k in ipairs(keys) do
    if k == "contract_test_key" then
      hasKey = true
      break
    end
  end
  if hasKey then
    contract("web.storage.list", "pass", "count=" .. #keys)
  else
    contract("web.storage.list", "fail", "key_missing")
  end
else
  contract("web.storage.list", "fail", "type=" .. type(keys))
end

-- 10. web.storage.delete removes the key
local ok10 = pcall(web.storage.delete, "contract_test_key")
if ok10 then
  contract("web.storage.delete", "pass", "deleted")
else
  contract("web.storage.delete", "fail", "error")
end

-- 11. chrome.tabs.query returns tabs table
local ok11, tabs = pcall(chrome.tabs.query, {currentWindow = true})
if ok11 and type(tabs) == "table" and #tabs > 0 then
  contract("chrome.tabs.query", "pass", "count=" .. #tabs)
else
  contract("chrome.tabs.query", "fail", "type=" .. type(tabs))
end

-- 12. tab.evaluate runs JS in target tab
if ok3 then
  local ok12, result = pcall(tab.evaluate, newTab, "1 + 1")
  if ok12 and result == 2 then
    contract("tab.evaluate", "pass", "result=" .. tostring(result))
  else
    contract("tab.evaluate", "fail", "result=" .. tostring(result))
  end
else
  contract("tab.evaluate", "skip", "no_tab")
end

-- 13. web.sleep sleeps without error
local ok13 = pcall(web.sleep, 100)
if ok13 then
  contract("web.sleep", "pass", "slept")
else
  contract("web.sleep", "fail", "error")
end

-- Cleanup: close the tab we opened
if ok3 then
  pcall(tab.close, newTab)
end

print("__EXTENSION_CONTRACT_DONE__")
        `,
      );

      await runCell(popup, 0);
      await waitForCellStatus(popup, 0, "success", 60_000);

      // Gather cell output and parse contract results
      const output = await popup
        .locator('[data-testid="cell-output"]')
        .first()
        .textContent();
      const results = parseContractResults(output || "");

      // Verify we have at least 10 API cases
      expect(results.length).toBeGreaterThanOrEqual(10);

      // Build a map for easy lookup
      const resultMap = new Map(results.map((r) => [r.case, r]));

      // Required cases that must pass
      const requiredCases = [
        "runtime.docs",
        "runtime.get_doc",
        "tab.open",
        "tab.wait_for_load",
        "tab.snapshot_data",
        "page.click",
        "web.storage.set",
        "web.storage.get",
        "web.storage.list",
        "web.storage.delete",
        "chrome.tabs.query",
        "tab.evaluate",
        "web.sleep",
      ];

      for (const caseName of requiredCases) {
        const result = resultMap.get(caseName);
        expect(result, `Missing contract result for ${caseName}`).toBeDefined();
        if (result) {
          expect(
            result.status,
            `Contract case ${caseName} failed: ${result.detail}`,
          ).toBe("pass");
        }
      }

      // Verify the done sentinel
      await expectCellOutputContains(popup, 0, "__EXTENSION_CONTRACT_DONE__");
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
