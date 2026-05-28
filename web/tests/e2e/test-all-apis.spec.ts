import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "@playwright/test";
import {
  expectCellOutputContains,
  runCell,
  waitForCellStatus,
  waitForKernelReady,
} from "../helpers";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

test.describe("test_all_apis.lua smoke test", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await waitForKernelReady(page);
    // Inject a fixture with all interactive element types needed by the script
    await page.evaluate(() => {
      const fixture = document.createElement("div");
      fixture.id = "e2e-test-fixture";
      fixture.style.cssText = "padding: 20px;";
      fixture.innerHTML = `
        <input type="text" id="e2e-input" value="initial" />
        <button id="e2e-button" onclick="this.dataset.clicks=(parseInt(this.dataset.clicks||0)+1).toString()">Click me</button>
      `;
      document.body.appendChild(fixture);
    });
  });

  test("all APIs produce OK markers", async ({ page }) => {
    // Read the Lua script from fixtures
    const scriptPath = path.join(__dirname, "../fixtures/test_all_apis.lua");
    const script = fs.readFileSync(scriptPath, "utf-8");

    // Set the cell source directly via the exposed notebookRef
    await page.evaluate((code) => {
      const notebookRef = (
        window as {
          __notebookRef?: { current?: { cells: { source: string }[] } };
        }
      ).__notebookRef;
      if (notebookRef?.current) {
        const cell = notebookRef.current.cells[0];
        if (cell) {
          cell.source = code;
        }
      }
    }, script);

    // Debug: verify source was set before running
    const debugBefore = await page.evaluate(() => {
      const notebookRef = (
        window as {
          __notebookRef?: { current?: { cells: { source: string }[] } };
        }
      ).__notebookRef;
      return {
        source: notebookRef?.current?.cells?.[0]?.source?.substring(0, 100),
      };
    });
    console.log("Debug before:", debugBefore);

    await runCell(page, 0);
    await waitForCellStatus(page, 0, "success", 30_000);

    const output = await page
      .locator('[data-testid="cell-output"]')
      .first()
      .textContent();
    const errorTexts = await page
      .locator('[data-testid="cell-error"]')
      .allTextContents();
    console.log("Output length:", output?.length || 0);
    console.log("Output:", output?.substring(0, 1000));
    console.log("Errors:", errorTexts);

    // ── Expected OK markers ──
    const requiredMarkers = [
      "TEST_API_OK:page.snapshot_data",
      "TEST_API_OK:page.snapshot",
      "TEST_API_OK:page.snapshot_text",
      "TEST_API_OK:page.see",
      "TEST_API_OK:page.url",
      "TEST_API_OK:page.title",
      "TEST_API_OK:page.find",
      "TEST_API_OK:page.extract",
      "TEST_API_OK:page.wait_for",
      "TEST_API_OK:page.wait",
      "TEST_API_OK:fs.write",
      "TEST_API_OK:fs.write_text",
      "TEST_API_OK:fs.exists",
      "TEST_API_OK:fs.read",
      "TEST_API_OK:fs.read_text",
      "TEST_API_OK:fs.stat",
      "TEST_API_OK:fs.list",
      "TEST_API_OK:fs.append",
      "TEST_API_OK:fs.append_text",
      "TEST_API_OK:fs.hash",
      "TEST_API_OK:fs.copy",
      "TEST_API_OK:fs.move",
      "TEST_API_OK:fs.delete",
      "TEST_API_OK:fs.mkdir",
      "TEST_API_OK:web.sleep",
      "TEST_API_OK:web.mock_async",
      "TEST_API_OK:dom.snapshot",
      "TEST_API_OK:dom.format",
      "TEST_API_OK:path.join",
      "TEST_API_OK:path.basename",
      "TEST_API_OK:path.dirname",
      "TEST_API_OK:path.extname",
      "TEST_API_OK:path.normalize",
      "TEST_API_OK:path.is_absolute",
      "TEST_API_OK:web.storage.set",
      "TEST_API_OK:web.storage.get",
      "TEST_API_OK:web.storage.list",
      "TEST_API_OK:web.storage.delete",
      "TEST_API_ERR:host.call",
      "TEST_API_OK:sidepanel.url",
      "TEST_API_OK:sidepanel.title",
      "TEST_API_OK:page.click",
      "TEST_API_OK:page.dblclick",
      "TEST_API_OK:page.hover",
      "TEST_API_OK:page.unhover",
      "TEST_API_ERR:page.fill",
      "TEST_API_ERR:page.type",
      "TEST_API_ERR:page.append",
      "TEST_API_OK:page.press",
      "TEST_API_SKIP:page.check",
      "TEST_API_SKIP:page.select",
      "TEST_API_OK:page.scroll",
      "TEST_API_OK:page.scroll_to",
      "TEST_API_SKIP:page.back",
      "TEST_API_SKIP:page.forward",
      "TEST_API_SKIP:page.reload",
      "TEST_API_OK:page.screenshot:E_NOT_IMPLEMENTED",
      "TEST_API_OK:web.log",
      "TEST_ALL_APIS_DONE",
    ];

    for (const marker of requiredMarkers) {
      await expectCellOutputContains(page, 0, marker);
    }

    // Ensure no unexpected errors occurred
    const errorCount = await page.locator('[data-testid="cell-error"]').count();
    expect(errorCount).toBe(0);
  });
});
