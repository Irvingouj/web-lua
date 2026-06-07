import { describe, expect, it, beforeEach } from "vitest";
import { z } from "zod";
import {
  clearRegistry,
  dispatchTool,
  getTool,
  listTools,
  MergedDocRegistry,
  register,
  registerHostHandler,
  registerHostHandlers,
  registerTool,
} from "./registry.js";

describe("webLuaRegistry", () => {
  beforeEach(() => {
    clearRegistry();
  });

  describe("register()", () => {
    it("registers a tool with full metadata", () => {
      const handler = async (params: { name: string }) => ({ greeting: `Hello ${params.name}` });
      register(
        "test.greet",
        z.object({ name: z.string() }),
        z.object({ greeting: z.string() }),
        {
          namespace: "test",
          name: "greet",
          publicName: "test.greet",
          source: "main_thread",
          transport: "host_async",
          description: "Greets someone",
          params: [
            { name: "name", type: "string", required: true, description: "Name to greet" },
          ],
          returnType: "object",
          returnDoc: "Greeting object",
        },
        handler,
      );

      const tool = getTool("test.greet");
      expect(tool).toBeDefined();
      expect(tool?.action).toBe("test.greet");
      expect(tool?.publicName).toBe("test.greet");
      expect(tool?.transport).toBe("host_async");
    });

    it("throws when registering duplicate action", () => {
      const handler = async () => ({}) as Record<string, unknown>;
      register(
        "test.duplicate",
        z.any(),
        z.any(),
        {
          namespace: "test",
          name: "duplicate",
          publicName: "test.duplicate",
          source: "main_thread",
          transport: "host_async",
          description: "",
        },
        handler,
      );

      expect(() =>
        register(
          "test.duplicate",
          z.any(),
          z.any(),
          {
            namespace: "test",
            name: "duplicate",
            publicName: "test.duplicate",
            source: "main_thread",
            transport: "host_async",
            description: "",
          },
          handler,
        ),
      ).toThrow('Tool "test.duplicate" is already registered');
    });
  });

  describe("registerTool()", () => {
    it("is an alias for register()", () => {
      const handler = async () => "ok";
      registerTool(
        "test.alias",
        z.any(),
        z.any(),
        {
          namespace: "test",
          name: "alias",
          publicName: "test.alias",
          source: "main_thread",
          transport: "host_async",
          description: "",
        },
        handler,
      );

      expect(getTool("test.alias")).toBeDefined();
    });
  });

  describe("registerHostHandler() backward compat", () => {
    it("registers a host handler via the legacy API", () => {
      const handler = async (params: unknown) => params;
      registerHostHandler("legacy.action", handler);

      const tool = getTool("legacy.action");
      expect(tool).toBeDefined();
      expect(tool?.action).toBe("legacy.action");
      expect(tool?.transport).toBe("host_async");
      expect(tool?.source).toBe("main_thread");
    });

    it("allows dispatching through the registered host handler", async () => {
      const handler = async (params: { value: number }) => ({ result: params.value * 2 });
      registerHostHandler("legacy.double", handler);

      const result = await dispatchTool("legacy.double", { value: 5 });
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toEqual({ result: 10 });
      }
    });
  });

  describe("registerHostHandlers() backward compat", () => {
    it("registers multiple host handlers at once", () => {
      registerHostHandlers({
        "legacy.a": async () => "a",
        "legacy.b": async () => "b",
      });

      expect(getTool("legacy.a")).toBeDefined();
      expect(getTool("legacy.b")).toBeDefined();
    });
  });

  describe("dispatchTool()", () => {
    it("returns error for unknown action", async () => {
      const result = await dispatchTool("unknown.action", {});
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe("E_TOOL_NOT_FOUND");
      }
    });

    it("validates params and returns success for valid input", async () => {
      register(
        "test.add",
        z.object({ a: z.number(), b: z.number() }),
        z.object({ sum: z.number() }),
        {
          namespace: "test",
          name: "add",
          publicName: "test.add",
          source: "main_thread",
          transport: "host_async",
          description: "Adds two numbers",
        },
        async (params) => ({ sum: params.a + params.b }),
      );

      const result = await dispatchTool("test.add", { a: 2, b: 3 });
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toEqual({ sum: 5 });
      }
    });

    it("returns E_INVALID_PARAMS for invalid params", async () => {
      register(
        "test.add",
        z.object({ a: z.number(), b: z.number() }),
        z.object({ sum: z.number() }),
        {
          namespace: "test",
          name: "add",
          publicName: "test.add",
          source: "main_thread",
          transport: "host_async",
          description: "Adds two numbers",
        },
        async (params) => ({ sum: params.a + params.b }),
      );

      const result = await dispatchTool("test.add", { a: "not a number", b: 3 });
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe("E_INVALID_PARAMS");
      }
    });

    it("returns E_INVALID_RETURN for invalid return value", async () => {
      register(
        "test.typed",
        z.any(),
        z.object({ count: z.number() }),
        {
          namespace: "test",
          name: "typed",
          publicName: "test.typed",
          source: "main_thread",
          transport: "host_async",
          description: "",
        },
        async () => ({ count: "not a number" } as unknown as { count: number }),
      );

      const result = await dispatchTool("test.typed", {});
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe("E_INVALID_RETURN");
      }
    });

    it("catches handler errors and returns structured error", async () => {
      register(
        "test.error",
        z.any(),
        z.any(),
        {
          namespace: "test",
          name: "error",
          publicName: "test.error",
          source: "main_thread",
          transport: "host_async",
          description: "",
        },
        async () => {
          throw new Error("Something went wrong");
        },
      );

      const result = await dispatchTool("test.error", {});
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.message).toBe("Something went wrong");
        expect(result.error.code).toBe("E_TOOL");
      }
    });
  });

  describe("listTools()", () => {
    it("returns empty array when no tools registered", () => {
      expect(listTools()).toEqual([]);
    });

    it("returns registered tools with full metadata", () => {
      register(
        "test.tool",
        z.object({ id: z.string() }),
        z.object({ name: z.string() }),
        {
          namespace: "test",
          name: "tool",
          publicName: "test.tool",
          localName: "local_tool",
          source: "main_thread",
          transport: "host_async",
          description: "A test tool",
          params: [
            { name: "id", type: "string", required: true, description: "Item ID" },
          ],
          returnType: "object",
          returnDoc: "Item data",
          errorCode: "E_TEST",
          errorCategory: "test",
        },
        async (params) => ({ name: `Item ${params.id}` }),
      );

      const docs = listTools();
      expect(docs).toHaveLength(1);
      expect(docs[0]).toMatchObject({
        action: "test.tool",
        namespace: "test",
        name: "tool",
        publicName: "test.tool",
        localName: "local_tool",
        source: "main_thread",
        transport: "host_async",
        description: "A test tool",
        params: [
          { name: "id", type: "string", required: true, description: "Item ID" },
        ],
        returns: {
          type: "object",
          description: "Item data",
        },
        errorCode: "E_TEST",
        errorCategory: "test",
      });
    });
  });

  describe("MergedDocRegistry", () => {
    it("lists static docs", () => {
      const registry = new MergedDocRegistry();
      registry.setStaticDocs([
        {
          action: "page_click",
          namespace: "page",
          name: "click",
          publicName: "page.click",
          source: "main_thread",
          transport: "host_async",
          description: "Click an element",
          params: [],
          returns: { type: "nil", description: "None" },
          errorCode: "E_AGENT",
          errorCategory: "agent",
        },
      ]);

      const docs = registry.list();
      expect(docs).toHaveLength(1);
      expect(docs[0].publicName).toBe("page.click");
    });

    it("gets a doc by public name", () => {
      const registry = new MergedDocRegistry();
      registry.setStaticDocs([
        {
          action: "page_click",
          namespace: "page",
          name: "click",
          publicName: "page.click",
          source: "main_thread",
          transport: "host_async",
          description: "Click an element",
          params: [],
          returns: { type: "nil", description: "None" },
          errorCode: "E_AGENT",
          errorCategory: "agent",
        },
      ]);

      expect(registry.get("page.click")?.name).toBe("click");
      expect(registry.get("page_click")?.name).toBe("click");
      expect(registry.get("unknown")).toBeUndefined();
    });

    it("merges runtime docs without overriding static docs", () => {
      const registry = new MergedDocRegistry();
      registry.setStaticDocs([
        {
          action: "page_click",
          namespace: "page",
          name: "click",
          publicName: "page.click",
          source: "main_thread",
          transport: "host_async",
          description: "Static click",
          params: [],
          returns: { type: "nil", description: "None" },
          errorCode: "E_AGENT",
          errorCategory: "agent",
        },
      ]);
      registry.mergeRuntimeDocs([
        {
          action: "tab_query",
          namespace: "tab",
          name: "query",
          publicName: "tab.query",
          source: "extension_worker",
          transport: "chrome_api",
          description: "Query tabs",
          params: [],
          returns: { type: "array", description: "Tabs" },
          errorCode: "E_TAB",
          errorCategory: "tab",
        },
      ]);

      const docs = registry.list();
      expect(docs).toHaveLength(2);
      expect(registry.get("page.click")?.description).toBe("Static click");
      expect(registry.get("tab.query")?.description).toBe("Query tabs");
    });

    it("searches docs by keyword", () => {
      const registry = new MergedDocRegistry();
      registry.setStaticDocs([
        {
          action: "page_click",
          namespace: "page",
          name: "click",
          publicName: "page.click",
          source: "main_thread",
          transport: "host_async",
          description: "Click an element",
          params: [],
          returns: { type: "nil", description: "None" },
          errorCode: "E_AGENT",
          errorCategory: "agent",
        },
        {
          action: "page_dblclick",
          namespace: "page",
          name: "dblclick",
          publicName: "page.dblclick",
          source: "main_thread",
          transport: "host_async",
          description: "Double-click an element",
          params: [],
          returns: { type: "nil", description: "None" },
          errorCode: "E_AGENT",
          errorCategory: "agent",
        },
      ]);

      const results = registry.search("click");
      expect(results.length).toBeGreaterThanOrEqual(1);
      expect(results[0].publicName).toBe("page.click");
    });

    it("clears runtime docs while keeping static docs", () => {
      const registry = new MergedDocRegistry();
      registry.setStaticDocs([
        {
          action: "page_click",
          namespace: "page",
          name: "click",
          publicName: "page.click",
          source: "main_thread",
          transport: "host_async",
          description: "Click an element",
          params: [],
          returns: { type: "nil", description: "None" },
          errorCode: "E_AGENT",
          errorCategory: "agent",
        },
      ]);
      registry.mergeRuntimeDocs([
        {
          action: "tab_query",
          namespace: "tab",
          name: "query",
          publicName: "tab.query",
          source: "extension_worker",
          transport: "chrome_api",
          description: "Query tabs",
          params: [],
          returns: { type: "array", description: "Tabs" },
          errorCode: "E_TAB",
          errorCategory: "tab",
        },
      ]);

      registry.clearRuntimeDocs();
      expect(registry.list()).toHaveLength(1);
      expect(registry.get("tab.query")).toBeUndefined();
    });
  });
});
