import { describe, expect, it } from "vitest";
import { z } from "zod";
import { dispatchValidated } from "../../src/shared/registry/dispatch.js";
import type { ToolDefinition } from "../../src/shared/tool-registry.js";

function makeTestTool<P, R>(
  action: string,
  params: z.ZodType<P, z.ZodTypeDef, unknown>,
  returns: z.ZodType<R, z.ZodTypeDef, unknown>,
  handler: (params: P) => Promise<R>,
  overrides?: Partial<ToolDefinition<P, R, unknown, unknown>>,
): ToolDefinition<P, R, unknown, unknown> {
  return {
    action,
    namespace: "test",
    name: action.replace("test_", ""),
    publicName: `test.${action.replace("test_", "")}`,
    source: "extension_worker",
    transport: "host_async",
    description: "Test tool",
    params,
    returns,
    handler,
    paramDocs: {},
    paramTypes: [],
    returnDoc: "",
    errorCode: "E_TEST",
    errorCategory: "test",
    ...overrides,
  };
}

describe("dispatch", () => {
  it("dispatches a validated tool with valid params", async () => {
    const tool = makeTestTool(
      "test_double",
      z.object({ value: z.number() }),
      z.number(),
      async (params) => params.value * 2,
      {
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
      },
    );

    const result = await dispatchValidated(tool, { value: 21 });
    expect(result).toEqual({ ok: true, value: 42 });
  });

  it("returns error for invalid params", async () => {
    const tool = makeTestTool(
      "test_validate",
      z.object({ value: z.number() }),
      z.number(),
      async (params) => params.value,
      {
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
      },
    );

    const result = await dispatchValidated(tool, {
      value: "not-a-number",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("E_INVALID_PARAMS");
      expect(result.error.category).toBe("validation");
    }
  });

  it("returns error for invalid return value", async () => {
    const tool = makeTestTool(
      "test_bad_return",
      z.object({ value: z.number() }),
      z.number(),
      async (_params) => "not-a-number" as unknown as number,
      {
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
      },
    );

    const result = await dispatchValidated(tool, { value: 42 });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("E_INVALID_RETURN");
      expect(result.error.category).toBe("validation");
      expect(result.error.message).toContain("test_bad_return");
    }
  });

  it("passes through valid return values unchanged", async () => {
    const tool = makeTestTool(
      "test_good_return",
      z.object({ value: z.number() }),
      z.number(),
      async (params) => params.value * 3,
      {
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
      },
    );

    const result = await dispatchValidated(tool, { value: 7 });
    expect(result).toEqual({ ok: true, value: 21 });
  });

  it("returns transformed data when returns schema has a transform", async () => {
    const tool = makeTestTool(
      "test_transform",
      z.object({ value: z.number() }),
      z.number().transform((v) => v * 10),
      async (params) => params.value * 2,
    );

    const result = await dispatchValidated(tool, { value: 5 });
    expect(result).toEqual({ ok: true, value: 100 });
  });

  it("catches handler errors and returns AsyncResponse", async () => {
    const tool = makeTestTool(
      "test_error",
      z.object({}),
      z.never(),
      async () => {
        throw new Error("Intentional failure");
      },
      {
        paramDocs: {},
        paramTypes: [],
        returnDoc: "Never returns",
        errorCode: "E_INTENTIONAL",
        errorCategory: "test",
      },
    );

    const result = await dispatchValidated(tool, {});
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.message).toBe("Intentional failure");
      expect(result.error.code).toBe("E_INTENTIONAL");
      expect(result.error.category).toBe("test");
    }
  });

  it("preserves error code and category from thrown error object", async () => {
    const tool = makeTestTool(
      "test_custom_error",
      z.object({}),
      z.never(),
      async () => {
        const err = new Error("Timeout");
        (err as unknown as Record<string, unknown>).code = "ETIMEDOUT";
        (err as unknown as Record<string, unknown>).category = "timeout";
        throw err;
      },
      {
        paramDocs: {},
        paramTypes: [],
        returnDoc: "Never returns",
        errorCode: "E_DEFAULT",
        errorCategory: "default",
      },
    );

    const result = await dispatchValidated(tool, {});
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.message).toBe("Timeout");
      expect(result.error.code).toBe("ETIMEDOUT");
      expect(result.error.category).toBe("timeout");
    }
  });

  it("normalizes primitive params to object using paramTypes", async () => {
    const tool = makeTestTool(
      "test_primitive",
      z.object({ name: z.string() }),
      z.string(),
      async (params) => `Hello, ${params.name}`,
      {
        paramDocs: { name: "The name" },
        paramTypes: [
          {
            name: "name",
            type: "string",
            required: true,
            description: "The name",
          },
        ],
        returnDoc: "Greeting",
      },
    );

    const result = await dispatchValidated(tool, "world");
    expect(result).toEqual({ ok: true, value: "Hello, world" });
  });

  it("normalizes array params to object using paramTypes", async () => {
    const tool = makeTestTool(
      "test_array",
      z.object({ a: z.string(), b: z.number() }),
      z.string(),
      async (params) => `${params.a} ${params.b}`,
      {
        paramDocs: { a: "First arg", b: "Second arg" },
        paramTypes: [
          {
            name: "a",
            type: "string",
            required: true,
            description: "First arg",
          },
          {
            name: "b",
            type: "number",
            required: true,
            description: "Second arg",
          },
        ],
        returnDoc: "Combined",
      },
    );

    const result = await dispatchValidated(tool, ["hello", 42]);
    expect(result).toEqual({ ok: true, value: "hello 42" });
  });

  it("returns E_INVALID_PARAMS for null params", async () => {
    const tool = makeTestTool(
      "test_null",
      z.object({ name: z.string() }),
      z.string(),
      async (params) => params.name,
      {
        paramTypes: [
          {
            name: "name",
            type: "string",
            required: true,
            description: "The name",
          },
        ],
      },
    );

    const result = await dispatchValidated(tool, null);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("E_INVALID_PARAMS");
    }
  });

  it("handles primitive throws with generic message", async () => {
    const tool = makeTestTool(
      "test_primitive_throw",
      z.object({}),
      z.never(),
      async () => {
        throw "string-error";
      },
    );

    const result = await dispatchValidated(tool, {});
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.message).toBe("Tool execution failed");
      expect(result.error.code).toBe("E_TEST");
    }
  });
});
