import { test, expect } from "@playwright/test";
import { launchExtensionContext, waitForKernelReady, setCellCode, runCell, waitForCellStatus, expectCellOutputContains } from "../extension-helpers";

test.describe("chrome.tabs", () => {
  test("chrome.tabs.query returns tabs", async () => {
    const { context, popup } = await launchExtensionContext();
    try {
      await waitForKernelReady(popup, 30_000);
      await popup.locator('.cm-content').first().waitFor({ state: 'visible', timeout: 10_000 });
      await popup.waitForTimeout(500);

      await setCellCode(popup, 0, `
local tabs = chrome.tabs.query({currentWindow = true})
print("count: " .. #tabs)
print("type: " .. type(tabs))
      `);
      await runCell(popup, 0);
      await waitForCellStatus(popup, 0, "success", 20_000);
      await expectCellOutputContains(popup, 0, "type: table");
      await expectCellOutputContains(popup, 0, "count:");
    } finally {
      await context.close();
    }
  });

  test("chrome.tabs.create opens a new tab", async () => {
    const { context, popup } = await launchExtensionContext();
    try {
      await waitForKernelReady(popup, 30_000);
      await popup.locator('.cm-content').first().waitFor({ state: 'visible', timeout: 10_000 });
      await popup.waitForTimeout(500);

      await setCellCode(popup, 0, `
local tab = chrome.tabs.create({url = "https://example.com"})
print("created: " .. type(tab.id))
      `);
      await runCell(popup, 0);
      await waitForCellStatus(popup, 0, "success", 20_000);
      await expectCellOutputContains(popup, 0, "created: number");
    } finally {
      await context.close();
    }
  });

  test("chrome.tabs.create then chrome.tabs.remove", async () => {
    const { context, popup } = await launchExtensionContext();
    try {
      await waitForKernelReady(popup, 30_000);
      await popup.locator('.cm-content').first().waitFor({ state: 'visible', timeout: 10_000 });
      await popup.waitForTimeout(500);

      await setCellCode(popup, 0, `
local tab = chrome.tabs.create({url = "https://example.com"})
local tabId = tab.id
print("created: " .. tabId)
chrome.tabs.remove({tabId = tabId})
print("removed")
      `);
      await runCell(popup, 0);
      await waitForCellStatus(popup, 0, "success", 20_000);
      await expectCellOutputContains(popup, 0, "created:");
      await expectCellOutputContains(popup, 0, "removed");
    } finally {
      await context.close();
    }
  });

  test("chrome.tabs.query with active filter", async () => {
    const { context, popup } = await launchExtensionContext();
    try {
      await waitForKernelReady(popup, 30_000);
      await popup.locator('.cm-content').first().waitFor({ state: 'visible', timeout: 10_000 });
      await popup.waitForTimeout(500);

      await setCellCode(popup, 0, `
local tabs = chrome.tabs.query({active = true, currentWindow = true})
print("active tabs: " .. #tabs)
print("has id: " .. tostring(tabs[1] ~= nil and tabs[1].id ~= nil))
      `);
      await runCell(popup, 0);
      await waitForCellStatus(popup, 0, "success", 20_000);
      await expectCellOutputContains(popup, 0, "active tabs: 1");
      await expectCellOutputContains(popup, 0, "has id: true");
    } finally {
      await context.close();
    }
  });
});

test.describe("chrome.runtime", () => {
  test("chrome.runtime.sendMessage to background", async () => {
    const { context, popup } = await launchExtensionContext();
    try {
      await waitForKernelReady(popup, 30_000);
      await popup.locator('.cm-content').first().waitFor({ state: 'visible', timeout: 10_000 });
      await popup.waitForTimeout(500);

      await setCellCode(popup, 0, `
local resp = chrome.runtime.sendMessage({action = "ping"})
print("type: " .. type(resp))
print("pong: " .. tostring(resp.pong))
      `);
      await runCell(popup, 0);
      await waitForCellStatus(popup, 0, "success", 20_000);
      await expectCellOutputContains(popup, 0, "type: table");
      await expectCellOutputContains(popup, 0, "pong: true");
    } finally {
      await context.close();
    }
  });
});
