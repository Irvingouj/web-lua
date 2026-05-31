import { beforeEach, describe, expect, it } from "vitest";
import { z } from "zod";
import {
  clearRegistry,
  doctestTools,
  dispatchTool,
  getTool,
  listTools,
  register,
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
      expect(docs.find((doc) => doc.action === "test_register_shape")).toEqual(
        {
          action: "test_register_shape",
          namespace: "test",
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
        },
      );
    });

    it("does not collect doctests outside doctest mode", () => {
      register(
        "test_doctest_off",
        z.object({}),
        z.null(),
        {
          namespace: "test",
          description: "A doctestable tool",
          testScript: "expect(true).toBe(true)",
        },
        async () => null,
      );

      expect(doctestTools).toEqual([]);
    });

    it("throws on duplicate registration", () => {
      const tool: ToolDefinition<{ name: string }, string> = {
        action: "test_duplicate",
        namespace: "test",
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
      expect(found?.description).toBe("A listable tool");
      expect(found?.params).toHaveLength(1);
      expect(found?.params[0].name).toBe("name");
      expect(found?.params[0].type).toBe("string");
      expect(found?.params[0].required).toBe(true);
      expect(found?.errorCode).toBe("E_TEST");
    });

    it("returns empty array when no tools are registered", () => {
      expect(listTools()).toEqual([]);
    });

    it("uses paramTypes for documentation rather than zod introspection", () => {
      const tool: ToolDefinition<{ count: number; label?: string }, string> = {
        action: "test_param_types",
        namespace: "test",
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
});
