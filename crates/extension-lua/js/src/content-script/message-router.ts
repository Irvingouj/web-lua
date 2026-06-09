// piccolo-tool message router for content script

import { logger } from "../shared/logger.js";
import { toErrorMessage } from "../shared/errors.js";
import { dispatchLocalTool } from "./registry.js";

export function setupMessageRouter(): void {
  chrome.runtime.onMessage.addListener((request, _sender, sendResponse) => {
    function reply(
      requestId: string,
      data: { error: string } | { value: unknown },
    ) {
      sendResponse({
        channel: "piccolo-tool",
        version: 1,
        requestId,
        ...data,
      });
    }

    // Validate PiccoloToolRequest envelope
    if (
      typeof request !== "object" ||
      request === null ||
      (request as Record<string, unknown>).channel !== "piccolo-tool" ||
      (request as Record<string, unknown>).version !== 1
    ) {
      const reqId =
        typeof (request as Record<string, unknown>)?.requestId === "string"
          ? (request as Record<string, unknown>).requestId
          : "unknown";
      sendResponse({
        channel: "piccolo-tool",
        version: 1,
        requestId: reqId,
        error:
          "Malformed message: expected PiccoloToolRequest envelope with channel='piccolo-tool' and version=1",
      });
      return false;
    }

    const { requestId, action, params } = request as Record<string, unknown>;

    const reqId = typeof requestId === "string" ? requestId : "unknown";

    if (typeof action !== "string") {
      reply(reqId, {
        error: "Malformed message: expected action and requestId strings",
      });
      return false;
    }

    // Fast-path for ping — just return pong
    if (action === "__ping") {
      reply(reqId, { value: "pong" });
      return false;
    }

    logger.debug("[content-script] received action:", action, "params:", params);

    const dispatchResult = dispatchLocalTool(action, params ?? {});
    if (!dispatchResult.ok) {
      logger.debug("[content-script] no handler for action:", action);
      reply(reqId, { error: dispatchResult.error });
      return false;
    }

    const { tool, parsed } = dispatchResult;

    function validateAndReply(value: unknown) {
      const validated = tool.returns.safeParse(value);
      if (!validated.success) {
        reply(reqId, {
          error: `Invalid return value: ${validated.error.message}`,
        });
        return;
      }
      logger.debug(
        "[content-script] response for",
        action,
        ":",
        typeof validated.data,
      );
      reply(reqId, { value: validated.data });
    }

    // ====== MANDATORY TRY-CATCH ======
    try {
      const result = tool.handler(parsed);
      Promise.resolve(result)
        .then((value: unknown) => {
          validateAndReply(value);
        })
        .catch((err: unknown) => {
          const msg = toErrorMessage(err);
          logger.error(`[ContentScript] ${action} failed:`, msg);
          reply(reqId, { error: msg });
        });
      return true;
    } catch (err) {
      const msg = toErrorMessage(err);
      logger.error(`[ContentScript] ${action} failed:`, msg);
      reply(reqId, { error: msg });
      return false;
    }
  });
}
