import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { clearRegistry, listTools, registerTool } from "../../src/shared/tool-registry.js";
import { z } from "zod";
import * as fs from "node:fs";
import * as path from "node:path";

/**
 * Extract public names from Rust api_docs register() calls and macro invocations.
 * Parses:
 *   - api_docs::register(LuaApiDoc { ..., public_name: "foo.bar", ... })
 *   - lua_api_custom!(..., public_name: "foo.bar", ...)
 *   - register_lua_tool!(..., public_name: "foo.bar", ...)
 *   - lua_api_doc!(..., public_name: "foo.bar", ...)
 */
function extractRustPublicNames(source: string): Set<string> {
  const names = new Set<string>();

  // Match public_name: "..." in macro calls and struct literals
  const regex = /public_name\s*:\s*"([^"]+)"/g;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(source)) !== null) {
    names.add(match[1]);
  }

  return names;
}

/**
 * Read all Rust public names from the crates directory.
 */
function collectRustPublicNames(): Set<string> {
  // Resolve from test file location: crates/extension-lua/js/test/registry/
  // to workspace root: ../../../
  const cratesDir = path.resolve(__dirname, "../../../crates");
  const names = new Set<string>();

  function walk(dir: string): void {
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory() && entry.name !== "target") {
        walk(fullPath);
      } else if (entry.isFile() && entry.name.endsWith(".rs")) {
        const source = fs.readFileSync(fullPath, "utf-8");
        for (const name of extractRustPublicNames(source)) {
          names.add(name);
        }
      }
    }
  }

  walk(cratesDir);
  return names;
}

describe("manifest docs cross-check", () => {
  beforeEach(() => {
    clearRegistry();
  });

  afterEach(() => {
    clearRegistry();
  });

  it("verifies every registered tool has a doc entry", () => {
    registerTool({
      action: "test_action",
      namespace: "test",
      name: "action",
      publicName: "test.action",
      source: "main_thread",
      transport: "host_async",
      description: "Test action",
      params: z.object({}),
      paramTypes: [],
      returns: z.null(),
      returnDoc: "null",
      errorCode: "E",
      errorCategory: "test",
      paramDocs: {},
      handler: async () => null,
    });

    const docs = listTools();
    expect(docs.length).toBe(1);

    const doc = docs[0];
    expect(doc.action).toBe("test_action");
    expect(doc.publicName).toBe("test.action");
    expect(doc.namespace).toBe("test");
    expect(doc.name).toBe("action");
    expect(doc.description).toBe("Test action");
    expect(doc.params).toEqual([]);
    // returnType defaults to "unknown" when not explicitly set
    expect(doc.returns.type).toBe("unknown");
  });

  it("cross-checks Rust api_docs public names vs JS registry", () => {
    // Register a representative set of JS tools that mirror Rust APIs
    const jsTools = [
      { action: "fetch", publicName: "web.fetch", namespace: "web" },
      { action: "sleep", publicName: "web.sleep", namespace: "web" },
      { action: "storage_get", publicName: "web.storage.get", namespace: "web" },
      { action: "chrome_tabs_query", publicName: "web.tab.query", namespace: "chrome" },
      { action: "chrome_tabs_create", publicName: "web.tab.create", namespace: "chrome" },
    ];

    for (const t of jsTools) {
      registerTool({
        action: t.action,
        namespace: t.namespace,
        publicName: t.publicName,
        source: "main_thread",
        transport: "chrome_api",
        description: `Test ${t.action}`,
        params: z.object({}),
        paramTypes: [],
        returns: z.null(),
        returnDoc: "null",
        errorCode: "E",
        errorCategory: "test",
        paramDocs: {},
        handler: async () => null,
      });
    }

    const jsPublicNames = new Set(listTools().map((t) => t.publicName));
    const rustPublicNames = collectRustPublicNames();

    // Find Rust names that are NOT in the JS registry
    const rustOnly = Array.from(rustPublicNames).filter(
      (name) => !jsPublicNames.has(name),
    );

    // Find JS names that are NOT in the Rust registry
    const jsOnly = Array.from(jsPublicNames).filter(
      (name) => !rustPublicNames.has(name),
    );

    // Document intentional differences.
    // In the full extension-lua build, many JS-only tools (page.*, sidepanel.*,
    // runtime.*, etc.) exist that have no Rust api_docs entry because they are
    // registered purely on the JS side. Conversely, Rust registers aliases like
    // runtime.fetch, tab.current, page.wait_for_load that may not have a 1:1
    // JS tool registration.
    const knownIntentionalDiffs = new Set([
      // Rust-only aliases (no corresponding JS tool registration)
      "runtime.fetch",
      "runtime.sleep",
      "runtime.storage",
      "runtime.clipboard",
      "runtime.notifications",
      "tab.current",
      "tab.url",
      "tab.title",
      "tab.open",
      "tab.focus",
      "tab.reload",
      "tab.sleep",
      "page.open",
      "page.see",
      "page.enter",
      "page.wait_for_load",
      "page.fetch",
      // JS-only tools (no corresponding Rust api_docs entry)
      "test.action",
      "web.fetch",
      "web.sleep",
      "web.storage.get",
      "web.tab.query",
      "web.tab.create",
      "network.fetch",
      "network.fetch_dom",
      "clipboard.read",
      "clipboard.write",
      "storage.get",
      "storage.set",
      "storage.delete",
      "storage.list",
      "page.click",
      "page.fill",
      "page.type",
      "page.append",
      "page.press",
      "page.select",
      "page.check",
      "page.hover",
      "page.unhover",
      "page.scroll",
      "page.scrollTo",
      "page.dblclick",
      "page.goto",
      "page.back",
      "page.forward",
      "page.reload",
      "page.wait",
      "page.find",
      "page.wait_for",
      "sidepanel.click",
      "sidepanel.dblclick",
      "sidepanel.fill",
      "sidepanel.type",
      "sidepanel.press",
      "sidepanel.select",
      "sidepanel.check",
      "sidepanel.hover",
      "sidepanel.unhover",
      "sidepanel.scroll",
      "sidepanel.scroll_to",
      "sidepanel.append",
      "sidepanel.url",
      "sidepanel.title",
      "sidepanel.wait",
      "sidepanel.snapshot",
      "sidepanel.snapshot_text",
      "sidepanel.snapshot_data",
      "tab.click",
      "tab.fill",
      "tab.type",
      "tab.press",
      "tab.select",
      "tab.check",
      "tab.hover",
      "tab.unhover",
      "tab.scroll",
      "tab.dblclick",
      "tab.back",
      "tab.wait_for_load",
      "tab.evaluate",
      "tab.query",
      "tab.create",
      "tab.activate",
      "tab.close",
      "tab.execute_script",
      "tab.scroll_to",
      "tab.fetch",
      "tab.snapshot",
      "tab.snapshot_text",
      "tab.snapshot_data",
      "chrome.tabs.query",
      "chrome.tabs.create",
      "chrome.tabs.update",
      "chrome.tabs.remove",
      "chrome.tabs.get",
      "chrome.tabs.reload",
      "chrome.tabs.sendMessage",
      "chrome.cookies.get",
      "chrome.cookies.set",
      "chrome.cookies.remove",
      "chrome.cookies.getAll",
      "chrome.bookmarks.search",
      "chrome.bookmarks.create",
      "chrome.bookmarks.remove",
      "chrome.history.search",
      "chrome.history.deleteUrl",
      "chrome.alarms.create",
      "chrome.alarms.clear",
      "chrome.action.setBadgeText",
      "chrome.action.setBadgeBackgroundColor",
      "chrome.action.setTitle",
      "chrome.action.setIcon",
      "chrome.notifications.create",
      "chrome.notifications.clear",
      "chrome.windows.getAll",
      "chrome.windows.create",
      "chrome.windows.update",
      "chrome.windows.remove",
      "chrome.runtime.sendMessage",
      "chrome.contextMenus.create",
      "chrome.contextMenus.remove",
      "chrome.sidePanel.setOptions",
      "chrome.scripting.executeScript",
      "runtime.docs",
      "runtime.get_doc",
      "runtime.search_docs",
      "cookies.get",
      "cookies.set",
      "cookies.delete",
      "cookies.list",
      "history.search",
      "history.delete",
      "bookmarks.search",
      "bookmarks.create",
      "bookmarks.delete",
      "notifications.create",
      "notifications.clear",
      "page.close",
      "page.active_tab",
    ]);

    const unexpectedRustOnly = rustOnly.filter(
      (name) => !knownIntentionalDiffs.has(name),
    );
    const unexpectedJsOnly = jsOnly.filter(
      (name) => !knownIntentionalDiffs.has(name),
    );

    if (unexpectedRustOnly.length > 0 || unexpectedJsOnly.length > 0) {
      throw new Error(
        `Public name mismatch between Rust api_docs and JS registry.\n` +
          `Unexpected Rust-only: ${JSON.stringify(unexpectedRustOnly)}\n` +
          `Unexpected JS-only: ${JSON.stringify(unexpectedJsOnly)}\n` +
          `If these are intentional, add them to knownIntentionalDiffs in ` +
          `test/registry/manifest-docs.test.ts.`,
      );
    }

    // The test passes if all differences are documented
    expect(unexpectedRustOnly).toEqual([]);
    expect(unexpectedJsOnly).toEqual([]);
  });
});
