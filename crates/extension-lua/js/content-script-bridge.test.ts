import { describe, expect, it } from "vitest";
import { bridges, getContentScriptAction } from "./content-script-bridge.js";

describe("content-script-bridge", () => {
  it("has 25 bridge entries", () => {
    expect(bridges).toHaveLength(25);
  });

  it("maps all expected runner actions", () => {
    const expectedRunnerActions = [
      // page_* actions
      "page_click",
      "page_fill",
      "page_type",
      "page_append",
      "page_press",
      "page_select",
      "page_check",
      "page_hover",
      "page_unhover",
      "page_scroll",
      "page_scroll_to",
      "page_dblclick",
      "page_back",
      // tab_* actions
      "tab_click",
      "tab_fill",
      "tab_type",
      "tab_scroll_to",
      "tab_press",
      "tab_select",
      "tab_check",
      "tab_hover",
      "tab_unhover",
      "tab_scroll",
      "tab_dblclick",
      "tab_back",
    ];

    const actualRunnerActions = bridges.map((b) => b.runnerAction);
    for (const action of expectedRunnerActions) {
      expect(actualRunnerActions).toContain(action);
    }
  });

  it("maps runner actions to correct content script actions", () => {
    expect(getContentScriptAction("page_click")).toBe("click");
    expect(getContentScriptAction("page_fill")).toBe("fill");
    expect(getContentScriptAction("page_type")).toBe("type");
    expect(getContentScriptAction("page_scroll")).toBe("scroll");
    expect(getContentScriptAction("page_back")).toBe("back");
    expect(getContentScriptAction("tab_click")).toBe("click");
    expect(getContentScriptAction("tab_fill")).toBe("fill");
    expect(getContentScriptAction("tab_back")).toBe("back");
  });

  it("returns undefined for unknown runner actions", () => {
    expect(getContentScriptAction("unknown_action")).toBeUndefined();
    expect(getContentScriptAction("fetch")).toBeUndefined();
    expect(getContentScriptAction("")).toBeUndefined();
  });

  it("has no duplicate runner actions", () => {
    const runnerActions = bridges.map((b) => b.runnerAction);
    const uniqueActions = new Set(runnerActions);
    expect(uniqueActions.size).toBe(runnerActions.length);
  });

  it("has no duplicate content script actions within page_* or tab_* groups", () => {
    const pageActions = bridges
      .filter((b) => b.runnerAction.startsWith("page_"))
      .map((b) => b.contentScriptAction);
    const tabActions = bridges
      .filter((b) => b.runnerAction.startsWith("tab_"))
      .map((b) => b.contentScriptAction);

    // page_* and tab_* can map to the same content script action (e.g. both -> "click")
    // but within each group there should be no duplicates
    expect(new Set(pageActions).size).toBe(pageActions.length);
    expect(new Set(tabActions).size).toBe(tabActions.length);
  });
});
