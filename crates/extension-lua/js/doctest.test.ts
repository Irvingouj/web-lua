import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { clearRegistry, dispatchTool, doctestTools } from "./tool-registry.js";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

describe("doctest runner", () => {
  beforeAll(async () => {
    // Provide minimal DOM fixture for tools that need it
    const mockDocument = {
      querySelector: vi.fn(),
      querySelectorAll: vi.fn(() => []),
      createElement: vi.fn((tag: string) => ({
        tagName: tag.toUpperCase(),
        setAttribute: vi.fn(),
        appendChild: vi.fn(),
        removeChild: vi.fn(),
        style: {},
        classList: {
          add: vi.fn(),
          remove: vi.fn(),
          contains: vi.fn(() => false),
        },
      })),
      body: {
        appendChild: vi.fn(),
        removeChild: vi.fn(),
        querySelector: vi.fn(),
        querySelectorAll: vi.fn(() => []),
      },
      documentElement: {
        scrollTop: 0,
        scrollLeft: 0,
        scrollHeight: 0,
        scrollWidth: 0,
        clientHeight: 0,
        clientWidth: 0,
      },
    };

    vi.stubGlobal("document", mockDocument);
    vi.stubGlobal("window", {
      chrome: undefined,
      document: mockDocument,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      location: { href: "https://example.com" },
    });

    // Clear registry before importing runner to ensure clean state
    clearRegistry();

    // Import runner.js to trigger all registerTool() calls
    await import("./runner.js");
  });

  afterAll(() => {
    vi.unstubAllGlobals();
  });

  it("imports runner and collects doctestTools array", () => {
    expect(Array.isArray(doctestTools)).toBe(true);
  });

  it("executes all doctest testScripts with callTool helper", async () => {
    if (doctestTools.length === 0) {
      // No doctests to run (normal mode or no tools with doctest)
      return;
    }

    const callTool = async (action: string, params: unknown): Promise<unknown> => {
      const result = await dispatchTool(action, params);
      if (!result.ok) {
        throw new Error(result.error.message);
      }
      return result.value;
    };

    const errors: string[] = [];

    for (const { action, script } of doctestTools) {
      try {
        const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
        const fn = new AsyncFunction("callTool", "expect", script);
        await fn(callTool, expect);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        errors.push(`Doctest failed for "${action}": ${message}`);
      }
    }

    expect(errors, `Doctest failures:\n${errors.join("\n")}`).toEqual([]);
  });

  it("has empty doctestTools in production builds", () => {
    if (typeof __DOCTEST__ !== "undefined" && __DOCTEST__ === true) {
      // In doctest mode, doctestTools may be populated — skip this assertion
      return;
    }
    expect(doctestTools.length).toBe(0);
  });

  it("has no testScript strings in compiled bundle", () => {
    const __dirname = path.dirname(fileURLToPath(import.meta.url));

    // Check extension-lua dist first (tsc output) — this is the bundle we control
    const extDist = path.resolve(__dirname, "./dist");
    const extJsFiles: string[] = [];
    if (fs.existsSync(extDist)) {
      for (const file of fs.readdirSync(extDist)) {
        if (file.endsWith(".js") && !file.endsWith(".test.js")) {
          extJsFiles.push(path.join(extDist, file));
        }
      }
    }

    // Also check web app production dist (Vite bundle) if it exists
    const webDist = path.resolve(__dirname, "../../../web/dist");
    const webAssets = path.join(webDist, "assets");
    const webJsFiles: string[] = [];
    if (fs.existsSync(webAssets)) {
      for (const file of fs.readdirSync(webAssets)) {
        if (file.endsWith(".js")) {
          webJsFiles.push(path.join(webAssets, file));
        }
      }
    }

    const bundlesToCheck = extJsFiles.length > 0 ? extJsFiles : webJsFiles;
    expect(
      bundlesToCheck.length,
      "No compiled bundle found to check (crates/extension-lua/js/dist or web/dist/assets)",
    ).toBeGreaterThan(0);

    const occurrences: string[] = [];
    for (const file of bundlesToCheck) {
      const content = fs.readFileSync(file, "utf-8");
      if (content.includes("testScript")) {
        occurrences.push(file);
      }
    }

    expect(
      occurrences,
      `Found "testScript" in compiled bundle(s): ${occurrences.join(", ")}`,
    ).toEqual([]);
  });
});
