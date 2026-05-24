import { test, expect } from "@playwright/test";
import { launchExtensionContext, waitForKernelReady, setCellCode, runCell, waitForCellStatus, expectCellOutputContains } from "../extension-helpers";

test.describe("chrome.alarms", () => {
  test("chrome.alarms.create and clear", async () => {
    const { context, popup } = await launchExtensionContext();
    try {
      await waitForKernelReady(popup, 30_000);
      await popup.locator('.cm-content').first().waitFor({ state: 'visible', timeout: 10_000 });
      await popup.waitForTimeout(500);

      await setCellCode(popup, 0, `
chrome.alarms.create({name = "test-alarm", alarmInfo = {delayInMinutes = 0.1}})
print("alarm created")
local cleared = chrome.alarms.clear({name = "test-alarm"})
print("cleared: " .. tostring(cleared))
      `);
      await runCell(popup, 0);
      await waitForCellStatus(popup, 0, "success", 20_000);
      await expectCellOutputContains(popup, 0, "alarm created");
      await expectCellOutputContains(popup, 0, "cleared:");
    } finally {
      await context.close();
    }
  });
});

test.describe("chrome.contextMenus", () => {
  test("chrome.contextMenus.create returns menu id", async () => {
    const { context, popup } = await launchExtensionContext();
    try {
      await waitForKernelReady(popup, 30_000);
      await popup.locator('.cm-content').first().waitFor({ state: 'visible', timeout: 10_000 });
      await popup.waitForTimeout(500);

      await setCellCode(popup, 0, `
local menuId = chrome.contextMenus.create({id = "test-menu", title = "Test Menu", contexts = {"selection"}})
print("menu type: " .. type(menuId))
      `);
      await runCell(popup, 0);
      await waitForCellStatus(popup, 0, "success", 20_000);
      await expectCellOutputContains(popup, 0, "menu type:");
    } finally {
      await context.close();
    }
  });
});
