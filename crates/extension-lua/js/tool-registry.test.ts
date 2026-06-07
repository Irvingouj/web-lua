import { beforeEach, describe, expect, it } from "vitest";
import { z } from "zod";
import {
  clearRegistry,
  dispatchTool,
  doctestTools,
  getTool,
  listTools,
  MergedDocRegistry,
  register,
  registerDoctest,
  registerTool,
  type ToolDefinition,
} from "./tool-registry.js";

describe("tool-registry", () => {
  beforeEach(() => {
    clearRegistry();
  });

  describe("registerTool", () => {
    it("registers a tool and retrieves it", () => {
      const tool: ToolDefinition<{ name: string }, string> = {
        action: "test_greet",
        namespace: "test",
        name: "greet",
        publicName: "test.greet",
        source: "extension_worker",
        transport: "host_async",
        description: "A test greeting tool",
        params: z.object({ name: z.string() }),
        returns: z.string(),
        handler: async (params) => `Hello, ${params.name}!`,
        paramDocs: { name: "The name to greet" },
        paramTypes: [
          {
            name: "name",
            type: "string",
            required: true,
            description: "The name to greet",
          },
        ],
        returnDoc: "A greeting string",
        errorCode: "E_TEST",
        errorCategory: "test",
      };

      registerTool(tool);
      const retrieved = getTool("test_greet");
      expect(retrieved).toBeDefined();
      expect(retrieved?.action).toBe("test_greet");
    });

    it("supports five-argument registration", async () => {
      register(
        "test_register_shape",
        z.object({ name: z.string() }),
        z.string(),
        {
          namespace: "test",
          name: "register_shape",
          publicName: "test.register_shape",
          source: "extension_worker",
          transport: "host_async",
          description: "A tool registered with the stable call shape",
          params: [
            {
              name: "name",
              type: "string",
              required: true,
              description: "The name to echo",
            },
          ],
          returnType: "string",
          returnDoc: "The echoed name",
          errorCode: "E_TEST",
          errorCategory: "test",
        },
        async (params) => params.name,
      );

      const result = await dispatchTool("test_register_shape", {
        name: "piccolo",
      });
      expect(result).toEqual({ ok: true, value: "piccolo" });

      const docs = listTools();
      expect(docs.find((doc) => doc.action === "test_register_shape")).toEqual({
        action: "test_register_shape",
        namespace: "test",
        name: "register_shape",
        publicName: "test.register_shape",
        source: "extension_worker",
        transport: "host_async",
        description: "A tool registered with the stable call shape",
        params: [
          {
            name: "name",
            type: "string",
            required: true,
            description: "The name to echo",
          },
        ],
        returns: {
          type: "string",
          description: "The echoed name",
        },
        errorCode: "E_TEST",
        errorCategory: "test",
      });
    });

    it("does not collect doctests outside doctest mode", () => {
      registerDoctest("test_doctest_off", "expect(true).toBe(true)");
      register(
        "test_doctest_off",
        z.object({}),
        z.null(),
        {
          namespace: "test",
          name: "doctest_off",
          publicName: "test.doctest_off",
          source: "extension_worker",
          transport: "host_async",
          description: "A doctestable tool",
        },
        async () => null,
      );

      expect(doctestTools).toEqual([]);
    });

    it("throws on duplicate registration", () => {
      const tool: ToolDefinition<{ name: string }, string> = {
        action: "test_duplicate",
        namespace: "test",
        name: "duplicate",
        publicName: "test.duplicate",
        source: "extension_worker",
        transport: "host_async",
        description: "A test tool",
        params: z.object({ name: z.string() }),
        returns: z.string(),
        handler: async (params) => params.name,
        paramDocs: { name: "The name" },
        paramTypes: [
          {
            name: "name",
            type: "string",
            required: true,
            description: "The name",
          },
        ],
        returnDoc: "The name",
        errorCode: "E_TEST",
        errorCategory: "test",
      };

      registerTool(tool);
      expect(() => registerTool(tool)).toThrow(
        'Tool "test_duplicate" is already registered',
      );
    });
  });

  describe("getTool", () => {
    it("returns undefined for unregistered action", () => {
      expect(getTool("nonexistent")).toBeUndefined();
    });
  });

  describe("dispatchTool", () => {
    it("dispatches a registered tool with valid params", async () => {
      const tool: ToolDefinition<{ value: number }, number> = {
        action: "test_double",
        namespace: "test",
        name: "double",
        publicName: "test.double",
        source: "extension_worker",
        transport: "host_async",
        description: "Doubles a number",
        params: z.object({ value: z.number() }),
        returns: z.number(),
        handler: async (params) => params.value * 2,
        paramDocs: { value: "The number to double" },
        paramTypes: [
          {
            name: "value",
            type: "number",
            required: true,
            description: "The number to double",
          },
        ],
        returnDoc: "The doubled number",
        errorCode: "E_TEST",
        errorCategory: "test",
      };

      registerTool(tool);
      const result = await dispatchTool("test_double", { value: 21 });
      expect(result).toEqual({ ok: true, value: 42 });
    });

    it("returns error for invalid params", async () => {
      const tool: ToolDefinition<{ value: number }, number> = {
        action: "test_validate",
        namespace: "test",
        name: "validate",
        publicName: "test.validate",
        source: "extension_worker",
        transport: "host_async",
        description: "Validates a number",
        params: z.object({ value: z.number() }),
        returns: z.number(),
        handler: async (params) => params.value,
        paramDocs: { value: "The number" },
        paramTypes: [
          {
            name: "value",
            type: "number",
            required: true,
            description: "The number",
          },
        ],
        returnDoc: "The number",
        errorCode: "E_TEST",
        errorCategory: "test",
      };

      registerTool(tool);
      const result = await dispatchTool("test_validate", {
        value: "not-a-number",
      });
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe("E_INVALID_PARAMS");
        expect(result.error.category).toBe("validation");
      }
    });

    it("returns error for invalid return value", async () => {
      const tool: ToolDefinition<{ value: number }, number> = {
        action: "test_bad_return",
        namespace: "test",
        name: "bad_return",
        publicName: "test.bad_return",
        source: "extension_worker",
        transport: "host_async",
        description: "Returns wrong type",
        params: z.object({ value: z.number() }),
        returns: z.number(),
        handler: async (_params) => "not-a-number" as unknown as number,
        paramDocs: { value: "The number" },
        paramTypes: [
          {
            name: "value",
            type: "number",
            required: true,
            description: "The number",
          },
        ],
        returnDoc: "The number",
        errorCode: "E_TEST",
        errorCategory: "test",
      };

      registerTool(tool);
      const result = await dispatchTool("test_bad_return", { value: 42 });
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe("E_INVALID_RETURN");
        expect(result.error.category).toBe("validation");
        expect(result.error.message).toContain("test_bad_return");
      }
    });

    it("passes through valid return values unchanged", async () => {
      const tool: ToolDefinition<{ value: number }, number> = {
        action: "test_good_return",
        namespace: "test",
        name: "good_return",
        publicName: "test.good_return",
        source: "extension_worker",
        transport: "host_async",
        description: "Returns correct type",
        params: z.object({ value: z.number() }),
        returns: z.number(),
        handler: async (params) => params.value * 3,
        paramDocs: { value: "The number" },
        paramTypes: [
          {
            name: "value",
            type: "number",
            required: true,
            description: "The number",
          },
        ],
        returnDoc: "The tripled number",
        errorCode: "E_TEST",
        errorCategory: "test",
      };

      registerTool(tool);
      const result = await dispatchTool("test_good_return", { value: 7 });
      expect(result).toEqual({ ok: true, value: 21 });
    });

    it("returns error for unregistered tool", async () => {
      const result = await dispatchTool("test_nonexistent", {});
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe("E_TOOL_NOT_FOUND");
      }
    });

    it("catches handler errors and returns AsyncResponse", async () => {
      const tool: ToolDefinition<Record<string, never>, never> = {
        action: "test_error",
        namespace: "test",
        name: "error",
        publicName: "test.error",
        source: "extension_worker",
        transport: "host_async",
        description: "Always throws",
        params: z.object({}),
        returns: z.never(),
        handler: async () => {
          throw new Error("Intentional failure");
        },
        paramDocs: {},
        paramTypes: [],
        returnDoc: "Never returns",
        errorCode: "E_INTENTIONAL",
        errorCategory: "test",
      };

      registerTool(tool);
      const result = await dispatchTool("test_error", {});
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.message).toBe("Intentional failure");
        expect(result.error.code).toBe("E_INTENTIONAL");
        expect(result.error.category).toBe("test");
      }
    });

    it("preserves error code and category from thrown error object", async () => {
      const tool: ToolDefinition<Record<string, never>, never> = {
        action: "test_custom_error",
        namespace: "test",
        name: "custom_error",
        publicName: "test.custom_error",
        source: "extension_worker",
        transport: "host_async",
        description: "Throws with custom code/category",
        params: z.object({}),
        returns: z.never(),
        handler: async () => {
          const err = new Error("Timeout");
          (err as unknown as Record<string, unknown>).code = "ETIMEDOUT";
          (err as unknown as Record<string, unknown>).category = "timeout";
          throw err;
        },
        paramDocs: {},
        paramTypes: [],
        returnDoc: "Never returns",
        errorCode: "E_DEFAULT",
        errorCategory: "default",
      };

      registerTool(tool);
      const result = await dispatchTool("test_custom_error", {});
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.message).toBe("Timeout");
        expect(result.error.code).toBe("ETIMEDOUT");
        expect(result.error.category).toBe("timeout");
      }
    });
  });

  describe("listTools", () => {
    it("returns docs for all registered tools", () => {
      const tool: ToolDefinition<{ name: string }, string> = {
        action: "test_list",
        namespace: "test",
        name: "list",
        publicName: "test.list",
        source: "extension_worker",
        transport: "host_async",
        description: "A listable tool",
        params: z.object({ name: z.string() }),
        returns: z.string(),
        handler: async (params) => params.name,
        paramDocs: { name: "The name" },
        paramTypes: [
          {
            name: "name",
            type: "string",
            required: true,
            description: "The name",
          },
        ],
        returnDoc: "The name",
        errorCode: "E_TEST",
        errorCategory: "test",
      };

      registerTool(tool);
      const docs = listTools();
      const found = docs.find((d) => d.action === "test_list");
      expect(found).toBeDefined();
      expect(found?.namespace).toBe("test");
      expect(found?.name).toBe("list");
      expect(found?.publicName).toBe("test.list");
      expect(found?.source).toBe("extension_worker");
      expect(found?.transport).toBe("host_async");
      expect(found?.description).toBe("A listable tool");
      expect(found?.params).toHaveLength(1);
      expect(found?.params[0].name).toBe("name");
      expect(found?.params[0].type).toBe("string");
      expect(found?.params[0].required).toBe(true);
      expect(found?.errorCode).toBe("E_TEST");
    });

    it("propagates localName through registration and listTools", () => {
      const tool: ToolDefinition<{ refId: string }, boolean> = {
        action: "test_click",
        namespace: "test",
        name: "click",
        publicName: "test.click",
        localName: "click",
        source: "extension_worker",
        transport: "active_tab_content_script",
        description: "Click an element",
        params: z.object({ refId: z.string() }),
        returns: z.boolean(),
        handler: async (_params) => true,
        paramDocs: { refId: "Element refId" },
        paramTypes: [
          {
            name: "refId",
            type: "string",
            required: true,
            description: "Element refId",
          },
        ],
        returnDoc: "true",
        errorCode: "E_TEST",
        errorCategory: "test",
      };

      registerTool(tool);
      const docs = listTools();
      const found = docs.find((d) => d.action === "test_click");
      expect(found).toBeDefined();
      expect(found?.localName).toBe("click");
    });

    it("returns empty array when no tools are registered", () => {
      expect(listTools()).toEqual([]);
    });

    it("uses paramTypes for documentation rather than zod introspection", () => {
      const tool: ToolDefinition<{ count: number; label?: string }, string> = {
        action: "test_param_types",
        namespace: "test",
        name: "param_types",
        publicName: "test.param_types",
        source: "extension_worker",
        transport: "host_async",
        description: "Tool with optional param",
        params: z.object({ count: z.number(), label: z.string().optional() }),
        returns: z.string(),
        handler: async (params) => `${params.count} ${params.label ?? ""}`,
        paramDocs: { count: "How many", label: "Optional label" },
        paramTypes: [
          {
            name: "count",
            type: "number",
            required: true,
            description: "How many",
          },
          {
            name: "label",
            type: "string",
            required: false,
            description: "Optional label",
          },
        ],
        returnDoc: "Combined string",
        errorCode: "E_TEST",
        errorCategory: "test",
      };

      registerTool(tool);
      const docs = listTools();
      const found = docs.find((d) => d.action === "test_param_types");
      expect(found).toBeDefined();
      expect(found?.params).toHaveLength(2);
      expect(found?.params[0]).toEqual({
        name: "count",
        type: "number",
        required: true,
        description: "How many",
      });
      expect(found?.params[1]).toEqual({
        name: "label",
        type: "string",
        required: false,
        description: "Optional label",
      });
    });
  });

  describe("MergedDocRegistry", () => {
    it("get returns doc by publicName", () => {
      const registry = new MergedDocRegistry();
      const doc = makeSampleDoc("page_click", "page", "click", "page.click");
      registry.setStaticDocs([doc]);

      const result = registry.get("page.click");
      expect(result).toBeDefined();
      expect(result?.action).toBe("page_click");
      expect(result?.publicName).toBe("page.click");
    });

    it("get returns same doc by action", () => {
      const registry = new MergedDocRegistry();
      const doc = makeSampleDoc("page_click", "page", "click", "page.click");
      registry.setStaticDocs([doc]);

      const byPublicName = registry.get("page.click");
      const byAction = registry.get("page_click");
      expect(byAction).toBeDefined();
      expect(byAction).toBe(byPublicName);
    });

    it("get returns undefined for unknown query", () => {
      const registry = new MergedDocRegistry();
      registry.setStaticDocs([makeSampleDoc("page_click", "page", "click", "page.click")]);

      expect(registry.get("nonexistent")).toBeUndefined();
      expect(registry.get("page.hover")).toBeUndefined();
    });

    it("list returns all docs sorted by publicName", () => {
      const registry = new MergedDocRegistry();
      registry.setStaticDocs([
        makeSampleDoc("tab_query", "tab", "query", "tab.query"),
        makeSampleDoc("page_click", "page", "click", "page.click"),
        makeSampleDoc("chrome_bookmarks", "chrome", "bookmarks", "chrome.bookmarks"),
      ]);

      const docs = registry.list();
      expect(docs).toHaveLength(3);
      expect(docs[0].publicName).toBe("chrome.bookmarks");
      expect(docs[1].publicName).toBe("page.click");
      expect(docs[2].publicName).toBe("tab.query");
    });

    it("list returns empty array when no docs", () => {
      const registry = new MergedDocRegistry();
      expect(registry.list()).toEqual([]);
    });

    it("search returns matching docs by publicName", () => {
      const registry = new MergedDocRegistry();
      registry.setStaticDocs([
        makeSampleDoc("page_click", "page", "click", "page.click"),
        makeSampleDoc("page_fill", "page", "fill", "page.fill"),
        makeSampleDoc("tab_query", "tab", "query", "tab.query"),
      ]);

      const results = registry.search("page.click");
      expect(results).toHaveLength(1);
      expect(results[0].publicName).toBe("page.click");
    });

    it("search returns matching docs by action", () => {
      const registry = new MergedDocRegistry();
      registry.setStaticDocs([
        makeSampleDoc("page_click", "page", "click", "page.click"),
        makeSampleDoc("page_fill", "page", "fill", "page.fill"),
      ]);

      const results = registry.search("page_click");
      expect(results).toHaveLength(1);
      expect(results[0].action).toBe("page_click");
    });

    it("search returns matching docs by partial name", () => {
      const registry = new MergedDocRegistry();
      registry.setStaticDocs([
        makeSampleDoc("page_click", "page", "click", "page.click"),
        makeSampleDoc("page_fill", "page", "fill", "page.fill"),
        makeSampleDoc("tab_query", "tab", "query", "tab.query"),
      ]);

      const results = registry.search("click");
      expect(results.length).toBeGreaterThanOrEqual(1);
      expect(results.some((d) => d.publicName === "page.click")).toBe(true);
    });

    it("search returns matching docs by description", () => {
      const registry = new MergedDocRegistry();
      registry.setStaticDocs([
        makeSampleDoc("page_click", "page", "click", "page.click", "Click an element on the page"),
        makeSampleDoc("page_fill", "page", "fill", "page.fill", "Fill a form field"),
      ]);

      const results = registry.search("element");
      expect(results).toHaveLength(1);
      expect(results[0].publicName).toBe("page.click");
    });

    it("search returns matching docs by param name", () => {
      const registry = new MergedDocRegistry();
      const doc = makeSampleDoc("page_click", "page", "click", "page.click");
      doc.params = [
        { name: "refId", type: "string", required: true, description: "Element reference ID" },
      ];
      registry.setStaticDocs([doc]);

      const results = registry.search("refId");
      expect(results).toHaveLength(1);
      expect(results[0].publicName).toBe("page.click");
    });

    it("search returns matching docs by param description", () => {
      const registry = new MergedDocRegistry();
      const doc = makeSampleDoc("page_click", "page", "click", "page.click");
      doc.params = [
        { name: "refId", type: "string", required: true, description: "Element reference ID" },
      ];
      registry.setStaticDocs([doc]);

      const results = registry.search("reference");
      expect(results).toHaveLength(1);
      expect(results[0].publicName).toBe("page.click");
    });

    it("search returns matching docs by return description", () => {
      const registry = new MergedDocRegistry();
      const doc = makeSampleDoc("page_click", "page", "click", "page.click");
      doc.returns = { type: "boolean", description: "Whether the click succeeded" };
      registry.setStaticDocs([doc]);

      const results = registry.search("succeeded");
      expect(results).toHaveLength(1);
      expect(results[0].publicName).toBe("page.click");
    });

    it("search returns empty array for no matches", () => {
      const registry = new MergedDocRegistry();
      registry.setStaticDocs([makeSampleDoc("page_click", "page", "click", "page.click")]);

      expect(registry.search("nonexistent")).toEqual([]);
    });

    it("search returns all docs for empty query", () => {
      const registry = new MergedDocRegistry();
      registry.setStaticDocs([
        makeSampleDoc("page_click", "page", "click", "page.click"),
        makeSampleDoc("page_fill", "page", "fill", "page.fill"),
      ]);

      const results = registry.search("");
      expect(results).toHaveLength(2);
    });

    it("static docs are always present regardless of content script state", () => {
      const registry = new MergedDocRegistry();
      const staticDoc = makeSampleDoc("page_click", "page", "click", "page.click");
      registry.setStaticDocs([staticDoc]);

      // No runtime docs merged yet
      expect(registry.get("page.click")).toBeDefined();
      expect(registry.get("page_click")).toBeDefined();

      // Merge runtime docs
      registry.mergeRuntimeDocs([
        makeSampleDoc("tab_query", "tab", "query", "tab.query"),
      ]);
      expect(registry.get("page.click")).toBeDefined();
      expect(registry.get("tab.query")).toBeDefined();

      // Clear runtime docs
      registry.clearRuntimeDocs();
      expect(registry.get("page.click")).toBeDefined();
      expect(registry.get("tab.query")).toBeUndefined();
    });

    it("runtime docs override static docs for the same action", () => {
      const registry = new MergedDocRegistry();
      const staticDoc = makeSampleDoc("page_click", "page", "click", "page.click", "Static click doc");
      const runtimeDoc = makeSampleDoc("page_click", "page", "click", "page.click", "Runtime click doc");
      registry.setStaticDocs([staticDoc]);
      registry.mergeRuntimeDocs([runtimeDoc]);

      const result = registry.get("page.click");
      expect(result?.description).toBe("Runtime click doc");
    });

    it("runtime docs fill in gaps for actions not in static docs", () => {
      const registry = new MergedDocRegistry();
      registry.setStaticDocs([makeSampleDoc("page_click", "page", "click", "page.click")]);
      registry.mergeRuntimeDocs([makeSampleDoc("tab_query", "tab", "query", "tab.query")]);

      expect(registry.get("page.click")).toBeDefined();
      expect(registry.get("tab.query")).toBeDefined();
      expect(registry.list()).toHaveLength(2);
    });

    it("byPublicName and byAction Maps are exposed", () => {
      const registry = new MergedDocRegistry();
      const doc = makeSampleDoc("page_click", "page", "click", "page.click");
      registry.setStaticDocs([doc]);

      expect(registry.byPublicName.get("page.click")).toBeDefined();
      expect(registry.byAction.get("page_click")).toBeDefined();
      expect(registry.byPublicName.get("page.click")).toBe(registry.byAction.get("page_click"));
    });

    it("setStaticDocs rebuilds indexes from scratch", () => {
      const registry = new MergedDocRegistry();
      registry.setStaticDocs([makeSampleDoc("page_click", "page", "click", "page.click")]);
      expect(registry.list()).toHaveLength(1);

      registry.setStaticDocs([
        makeSampleDoc("tab_query", "tab", "query", "tab.query"),
      ]);
      expect(registry.list()).toHaveLength(1);
      expect(registry.get("page.click")).toBeUndefined();
      expect(registry.get("tab.query")).toBeDefined();
    });

    it("handles docs with localName", () => {
      const registry = new MergedDocRegistry();
      const doc = makeSampleDoc("page_click", "page", "click", "page.click");
      doc.localName = "click";
      registry.setStaticDocs([doc]);

      const result = registry.get("page.click");
      expect(result?.localName).toBe("click");
    });
  });
});

function makeSampleDoc(
  action: string,
  namespace: string,
  name: string,
  publicName: string,
  description = "A sample tool",
): import("./tool-registry.js").ToolDoc {
  return {
    action,
    namespace,
    name,
    publicName,
    source: "main_thread",
    transport: "chrome_api",
    description,
    params: [],
    returns: { type: "unknown", description: "Unknown" },
    errorCode: "E_TEST",
    errorCategory: "test",
  };
}
