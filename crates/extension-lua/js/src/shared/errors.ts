export function toErrorMessage(err: unknown): string {
    return err instanceof Error ? err.message : String(err);
}

export function createError(
    message: string,
    code?: string,
    category?: string,
): Error {
    const error = new Error(message);
    if (code) (error as unknown as Record<string, unknown>).code = code;
    if (category)
        (error as unknown as Record<string, unknown>).category = category;
    return error;
}

export function annotateError(
    err: unknown,
    code?: string,
    category?: string,
): Error {
    const error = err instanceof Error ? err : new Error(String(err));
    if (code) (error as unknown as Record<string, unknown>).code = code;
    if (category)
        (error as unknown as Record<string, unknown>).category = category;
    return error;
}

export function throwToolError(result: {
    ok: false;
    error: { message: string; code?: string; category?: string };
}): never {
    const error = new Error(result.error.message);
    (error as unknown as Record<string, unknown>).code = result.error.code ?? "E_TOOL";
    (error as unknown as Record<string, unknown>).category = result.error.category ?? "tool";
    throw error;
}
