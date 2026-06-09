import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { z } from "zod";
import { setupMessageRouter } from "../../src/content-script/message-router.js";
import {
  csRegistry,
  register,
} from "../../src/content-script/registry.js";

describe("setupMessageRouter", () => {
  let listener: (
    request: unknown,
    sender: chrome.runtime.MessageSender,
    sendResponse: (response: unknown) => void,
  ) => boolean | void;
  let lastResponse: unknown;

  beforeEach(() => {
    // Mock chrome.runtime.onMessage
    (globalThis as unknown as Record<string, unknown>).chrome = {
      runtime: {
        onMessage: {
          addListener: (fn: typeof listener) => {
            listener = fn;
          },
        },
      },
    };
    lastResponse = undefined;
    setupMessageRouter();
  });

  afterEach(() => {
    csRegistry.clear();
    listener = () => false;
    delete (globalThis as unknown as Record<string, unknown>).chrome;
  });

  function sendResponse(response: unknown) {
    lastResponse = response;
  }

  function makeRequest(
    overrides: Partial<Record<string, unknown>> = {},
  ): Record<string, unknown> {
    return {
      channel: "piccolo-tool",
      version: 1,
      requestId: "req-1",
      action: "test_action",
      ...overrides,
    };
  }

  it("ping fast-path returns { value: 'pong' }", () => {
    const req = makeRequest({ action: "__ping" });
    const keepAlive = listener(req, {}, sendResponse);
    expect(keepAlive).toBe(false);
    expect(lastResponse).toEqual({
      channel: "piccolo-tool",
      version: 1,
      requestId: "req-1",
      value: "pong",
    });
  });

  it("malformed message (missing channel) returns error", () => {
    const req = { version: 1, requestId: "req-2", action: "ping" };
    const keepAlive = listener(req, {}, sendResponse);
    expect(keepAlive).toBe(false);
    expect(lastResponse).toEqual({
      channel: "piccolo-tool",
      version: 1,
      requestId: "req-2",
      error:
        "Malformed message: expected PiccoloToolRequest envelope with channel='piccolo-tool' and version=1",
    });
  });

  it("missing action/requestId returns error", () => {
    const req = makeRequest({ action: undefined, requestId: undefined });
    const keepAlive = listener(req, {}, sendResponse);
    expect(keepAlive).toBe(false);
    expect(lastResponse).toEqual({
      channel: "piccolo-tool",
      version: 1,
      requestId: "unknown",
      error: "Malformed message: expected action and requestId strings",
    });
  });

  it("unknown action returns error", () => {
    const req = makeRequest({ action: "unknown_action" });
    const keepAlive = listener(req, {}, sendResponse);
    expect(keepAlive).toBe(false);
    expect(lastResponse).toEqual({
      channel: "piccolo-tool",
      version: 1,
      requestId: "req-1",
      error: "Unknown content script action: unknown_action",
    });
  });

  it("sync handler with valid return value", async () => {
    register(
      "test_echo",
      z.object({ msg: z.string() }),
      z.string(),
      {
        namespace: "test",
        name: "echo",
        publicName: "test.echo",
        source: "content_script",
        transport: "active_tab_content_script",
        description: "Echo a message",
      },
      (params) => params.msg,
    );

    const req = makeRequest({ action: "test_echo", params: { msg: "hello" } });
    const keepAlive = listener(req, {}, sendResponse);
    expect(keepAlive).toBe(true);
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(lastResponse).toEqual({
      channel: "piccolo-tool",
      version: 1,
      requestId: "req-1",
      value: "hello",
    });
  });

  it("sync handler with invalid return value returns error", async () => {
    register(
      "test_bad_sync",
      z.object({}),
      z.number(),
      {
        namespace: "test",
        name: "bad_sync",
        publicName: "test.bad_sync",
        source: "content_script",
        transport: "active_tab_content_script",
        description: "Returns a string instead of number",
      },
      () => "not-a-number",
    );

    const req = makeRequest({ action: "test_bad_sync" });
    const keepAlive = listener(req, {}, sendResponse);
    expect(keepAlive).toBe(true);
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(lastResponse).toEqual({
      channel: "piccolo-tool",
      version: 1,
      requestId: "req-1",
      error: expect.stringContaining("Invalid return value:"),
    });
  });

  it("async handler with valid return value", async () => {
    register(
      "test_async",
      z.object({ value: z.number() }),
      z.number(),
      {
        namespace: "test",
        name: "async",
        publicName: "test.async",
        source: "content_script",
        transport: "active_tab_content_script",
        description: "Double a number asynchronously",
      },
      async (params) => params.value * 2,
    );

    const req = makeRequest({
      action: "test_async",
      params: { value: 21 },
    });
    const keepAlive = listener(req, {}, sendResponse);
    expect(keepAlive).toBe(true);

    // Wait for async resolution
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(lastResponse).toEqual({
      channel: "piccolo-tool",
      version: 1,
      requestId: "req-1",
      value: 42,
    });
  });

  it("async handler with invalid return value returns error", async () => {
    register(
      "test_bad_async",
      z.object({}),
      z.number(),
      {
        namespace: "test",
        name: "bad_async",
        publicName: "test.bad_async",
        source: "content_script",
        transport: "active_tab_content_script",
        description: "Returns wrong type async",
      },
      async () => "not-a-number",
    );

    const req = makeRequest({ action: "test_bad_async" });
    const keepAlive = listener(req, {}, sendResponse);
    expect(keepAlive).toBe(true);

    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(lastResponse).toEqual({
      channel: "piccolo-tool",
      version: 1,
      requestId: "req-1",
      error: expect.stringContaining("Invalid return value:"),
    });
  });

  it("handler error returns error response", () => {
    register(
      "test_throw",
      z.object({}),
      z.string(),
      {
        namespace: "test",
        name: "throw",
        publicName: "test.throw",
        source: "content_script",
        transport: "active_tab_content_script",
        description: "Always throws",
      },
      () => {
        throw new Error("Intentional failure");
      },
    );

    const req = makeRequest({ action: "test_throw" });
    const keepAlive = listener(req, {}, sendResponse);
    expect(keepAlive).toBe(false);
    expect(lastResponse).toEqual({
      channel: "piccolo-tool",
      version: 1,
      requestId: "req-1",
      error: "Intentional failure",
    });
  });

  it("async handler rejection returns error response", async () => {
    register(
      "test_async_reject",
      z.object({}),
      z.string(),
      {
        namespace: "test",
        name: "async_reject",
        publicName: "test.async_reject",
        source: "content_script",
        transport: "active_tab_content_script",
        description: "Always rejects",
      },
      async () => {
        throw new Error("Async intentional failure");
      },
    );

    const req = makeRequest({ action: "test_async_reject" });
    const keepAlive = listener(req, {}, sendResponse);
    expect(keepAlive).toBe(true);

    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(lastResponse).toEqual({
      channel: "piccolo-tool",
      version: 1,
      requestId: "req-1",
      error: "Async intentional failure",
    });
  });
});
