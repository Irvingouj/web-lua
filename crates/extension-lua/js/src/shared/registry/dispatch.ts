import type {
  AsyncResponse,
  ToolDefinition,
} from "./types.js";

/**
 * Validate params, execute handler, and validate return value.
 *
 * IMPORTANT: This function does NOT perform authorization, capability,
 * or scope checks. Callers must enforce these at a higher layer.
 */
export async function dispatchValidated<P, R>(
  tool: ToolDefinition<P, R, unknown, unknown>,
  params: unknown,
): Promise<AsyncResponse> {
  let normalizedParams = params;
  const isObject =
    typeof params === "object" && params !== null && !Array.isArray(params);
  if (!isObject && tool.paramTypes.length > 0) {
    // Single primitive arg or array: map to first parameter name(s)
    const obj: Record<string, unknown> = {};
    const args = Array.isArray(params) ? params : [params];
    for (let i = 0; i < args.length && i < tool.paramTypes.length; i++) {
      obj[tool.paramTypes[i].name] = args[i];
    }
    normalizedParams = obj;
  }

  const parseResult = tool.params.safeParse(normalizedParams);
  if (!parseResult.success) {
    return {
      ok: false,
      error: {
        message: parseResult.error.message || "Invalid parameters",
        code: "E_INVALID_PARAMS",
        category: "validation",
      },
    };
  }

  try {
    const value = await tool.handler(parseResult.data);
    const returnResult = tool.returns.safeParse(value);
    if (!returnResult.success) {
      return {
        ok: false,
        error: {
          message: `Tool "${tool.action}" returned invalid data: ${returnResult.error.message}`,
          code: "E_INVALID_RETURN",
          category: "validation",
        },
      };
    }
    return { ok: true, value: returnResult.data };
  } catch (err: unknown) {
    const code = (err != null ? (err as { code?: string }).code : undefined) ?? tool.errorCode;
    const category =
      (err != null ? (err as { category?: string }).category : undefined) ?? tool.errorCategory;
    const message =
      (err instanceof Error ? err.message : (err as { message?: string }).message) ??
      "Tool execution failed";
    return {
      ok: false,
      error: {
        message,
        code,
        category,
      },
    };
  }
}
