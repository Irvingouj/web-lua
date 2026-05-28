import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "@playwright/test";
import {
  expectCellOutputContains,
  runCell,
  setCellCode,
  waitForCellStatus,
  waitForKernelReady,
} from "../helpers";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * E2E test for demo_script.lua — exercises 20+ core APIs against a real website.
 */
test.describe("demo_script.lua on real website", () => {
  test("all core APIs run successfully", async ({ page }) => {
    await page.goto("/");
    await waitForKernelReady(page, 30_000);

    // Inject a realistic fixture so page.* APIs have real DOM to work with
    await page.evaluate(() => {
      const fixture = document.createElement("div");
      fixture.id = "demo-fixture";
      fixture.innerHTML = `
        <h1>Herman Melville</h1>
        <h2>Moby Dick</h2>
        <button id="btn1">Click me</button>
        <button id="btn2">Submit</button>
        <input type="text" id="input1" placeholder="Enter text" />
        <input type="checkbox" id="check1" />
        <a href="https://example.com">Link</a>
        <div id="scrollable" style="height: 100px; overflow: auto;">
          <div style="height: 500px;">Tall content</div>
        </div>
      `;
      document.body.appendChild(fixture);
    });

    const scriptPath = path.join(__dirname, "../../demo_script.lua");
    const script = fs.readFileSync(scriptPath, "utf-8");
    await setCellCode(page, 0, script);
    await runCell(page, 0);
    await waitForCellStatus(page, 0, "success", 30_000);

    const requiredMarkers = [
      // Page info
      "URL:",
      "Title:",
      // Snapshot
      "Found",
      "interactive nodes",
      "Snapshot text length:",
      // Find
      "Found",
      "buttons",
      // Sleep
      "Slept for 500ms",
      // Storage
      "Saved URL:",
      "Storage keys: web-lua-theme, demo_url, demo_title",
      "Deleted demo_title",
      // File system
      "Wrote page info to /tmp/demo/page_info.txt",
      "File content:",
      "File exists: true",
      "File size:",
      "Files in /tmp/demo:",
      "Copy, move, delete done",
      "File hash:",
      "Appended timestamp to file",
      // Path
      "Joined: /tmp/demo/test.txt",
      "Basename: test.txt",
      "Dirname: /tmp/demo",
      "Extname: .txt",
      "Is absolute: true",
      // Fetch
      "Status: 200",
      "OK: true",
      "Body length:",
      // Fetch DOM
      "Fetched DOM status:",
      "Matches count:",
      // DOM snapshot
      "Snapshot nodes (again): 5",
      // Extract
      "Headings count:",
      // Wait
      "Wait for body: true",
      "Waited 200ms",
      // Snapshot text
      "Snapshot text (truncated):",
      // Host call
      "Host call error: No handler registered for 'echo'",
      // Sidepanel
      "Sidepanel URL:",
      "Sidepanel title:",
      // Cleanup
      "Deleted demo_url",
      "Deleted page_info.txt",
      "Remaining files in /tmp/demo: 0",
      // Final
      "All core APIs exercised successfully",
    ];

    const outputText = await page.evaluate(() => {
      const el = document.querySelector('[data-testid="cell-output"]');
      return el ? el.textContent || "" : "";
    });

    for (const marker of requiredMarkers) {
      expect(outputText).toContain(marker);
    }

    const errorCount = await page.locator('[data-testid="cell-error"]').count();
    expect(errorCount).toBe(0);
  });
});
