import { test } from "@playwright/test";
import {
  expectCellOutputContains,
  launchExtensionContext,
  runCell,
  setCellCode,
  waitForCellStatus,
  waitForKernelReady,
} from "../extension-helpers";

test.describe("chrome.tabs", () => {
  test("chrome.tabs.query returns tabs", async () => {
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
local tabs = chrome.tabs.query({currentWindow = true})
print("count: " .. #tabs)
print("type: " .. type(tabs))
      `,
      );
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
      await popup
        .locator(".cm-content")
        .first()
        .waitFor({ state: "visible", timeout: 10_000 });
      await popup.waitForTimeout(500);

      await setCellCode(
        popup,
        0,
        `
local tab = chrome.tabs.create({url = "https://example.com"})
print("created: " .. type(tab.id))
      `,
      );
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
      await popup
        .locator(".cm-content")
        .first()
        .waitFor({ state: "visible", timeout: 10_000 });
      await popup.waitForTimeout(500);

      await setCellCode(
        popup,
        0,
        `
local tab = chrome.tabs.create({url = "https://example.com"})
local tabId = tab.id
print("created: " .. tabId)
chrome.tabs.remove({tabId = tabId})
print("removed")
      `,
      );
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
      await popup
        .locator(".cm-content")
        .first()
        .waitFor({ state: "visible", timeout: 10_000 });
      await popup.waitForTimeout(500);

      await setCellCode(
        popup,
        0,
        `
local tabs = chrome.tabs.query({active = true, currentWindow = true})
print("active tabs: " .. #tabs)
print("has id: " .. tostring(tabs[1] ~= nil and tabs[1].id ~= nil))
      `,
      );
      await runCell(popup, 0);
      await waitForCellStatus(popup, 0, "success", 20_000);
      await expectCellOutputContains(popup, 0, "active tabs: 1");
      await expectCellOutputContains(popup, 0, "has id: true");
    } finally {
      await context.close();
    }
  });
});

test.describe("tab.* high-level APIs", () => {
  test("tab.open creates a new tab and returns id", async () => {
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
local id = tab.open("https://example.com")
print("id_type: " .. type(id))
print("id_val: " .. tostring(id))
      `,
      );
      await runCell(popup, 0);
      await waitForCellStatus(popup, 0, "success", 20_000);
      await expectCellOutputContains(popup, 0, "id_type: number");
    } finally {
      await context.close();
    }
  });

  test("tab.current returns active tab id", async () => {
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
local id = tab.current()
print("type: " .. type(id))
print("has_id: " .. tostring(id ~= nil))
      `,
      );
      await runCell(popup, 0);
      await waitForCellStatus(popup, 0, "success", 20_000);
      await expectCellOutputContains(popup, 0, "has_id: true");
    } finally {
      await context.close();
    }
  });

  test("tab.url and tab.title return strings", async () => {
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
local id = tab.current()
local url = tab.url(id)
local title = tab.title(id)
print("url_type: " .. type(url))
print("title_type: " .. type(title))
      `,
      );
      await runCell(popup, 0);
      await waitForCellStatus(popup, 0, "success", 20_000);
      await expectCellOutputContains(popup, 0, "url_type: string");
      await expectCellOutputContains(popup, 0, "title_type: string");
    } finally {
      await context.close();
    }
  });

  test("tab.reload returns tab id", async () => {
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
local reloaded = tab.reload(newTab)
print("reloaded: " .. tostring(reloaded == newTab))
      `,
      );
      await runCell(popup, 0);
      await waitForCellStatus(popup, 0, "success", 20_000);
      await expectCellOutputContains(popup, 0, "reloaded: true");
    } finally {
      await context.close();
    }
  });
});

test.describe("tab content-script APIs", () => {
  test("tab.evaluate runs JS in target tab", async () => {
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
local result = tab.evaluate(newTab, "1 + 1")
print("result: " .. tostring(result))
      `,
      );
      await runCell(popup, 0);
      await waitForCellStatus(popup, 0, "success", 20_000);
      await expectCellOutputContains(popup, 0, "result: 2");
    } finally {
      await context.close();
    }
  });

  test("tab.snapshot returns DOM snapshot from target tab", async () => {
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
local snap = tab.snapshot_data(newTab)
print("has_nodes: " .. tostring(snap.nodes ~= nil))
print("has_url: " .. tostring(snap.url ~= nil))
      `,
      );
      await runCell(popup, 0);
      await waitForCellStatus(popup, 0, "success", 20_000);
      await expectCellOutputContains(popup, 0, "has_nodes: true");
      await expectCellOutputContains(popup, 0, "has_url: true");
    } finally {
      await context.close();
    }
  });

  test("tab.fetch runs fetch in target tab origin", async () => {
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
local resp = tab.fetch(newTab, "https://example.com")
print("status: " .. tostring(resp.status))
print("has_body: " .. tostring(resp.body ~= nil))
      `,
      );
      await runCell(popup, 0);
      await waitForCellStatus(popup, 0, "success", 20_000);
      await expectCellOutputContains(popup, 0, "status: 200");
      await expectCellOutputContains(popup, 0, "has_body: true");
    } finally {
      await context.close();
    }
  });
});

test.describe("page.fetch", () => {
  test("page.fetch uses active tab origin and cookie", async () => {
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
local resp = page.fetch("https://example.com")
print("status: " .. tostring(resp.status))
print("has_body: " .. tostring(resp.body ~= nil))
      `,
      );
      await runCell(popup, 0);
      await waitForCellStatus(popup, 0, "success", 20_000);
      await expectCellOutputContains(popup, 0, "status: 200");
      await expectCellOutputContains(popup, 0, "has_body: true");
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
      await popup
        .locator(".cm-content")
        .first()
        .waitFor({ state: "visible", timeout: 10_000 });
      await popup.waitForTimeout(500);

      await setCellCode(
        popup,
        0,
        `
local resp = chrome.runtime.sendMessage({action = "ping"})
print("type: " .. type(resp))
print("pong: " .. tostring(resp.pong))
      `,
      );
      await runCell(popup, 0);
      await waitForCellStatus(popup, 0, "success", 20_000);
      await expectCellOutputContains(popup, 0, "type: table");
      await expectCellOutputContains(popup, 0, "pong: true");
    } finally {
      await context.close();
    }
  });
});
