import { describe, expect, it, beforeEach, afterEach } from "vitest";
import {
  clearRegistry,
  listTools,
  register,
  registerTool,
  freezeRegistry,
  isRegistryFrozen,
  CONTENT_SCRIPT_ACTIONS,
} from "../../src/shared/tool-registry.js";
import { z } from "zod";

describe("content-script registry integrity", () => {
  beforeEach(() => {
    clearRegistry();
  });

  afterEach(() => {
    clearRegistry();
  });

  it("verifies all content-script actions are registered with valid handlers", () => {
    // Register a subset of content-script-backed tools
    registerTool({
      action: "page_click",
      namespace: "page",
      name: "click",
      publicName: "page.click",
      localName: "click",
      source: "main_thread",
      transport: "active_tab_content_script",
      description: "Click an element",
      params: z.object({ refId: z.string() }),
      paramTypes: [
        {
          name: "refId",
          type: "string",
          required: true,
          description: "Element refId",
        },
      ],
      returns: z.null(),
      returnDoc: "null",
      errorCode: "EPAGE",
      errorCategory: "page",
      paramDocs: { refId: "Element refId" },
      handler: async () => null,
    });

    registerTool({
      action: "tab_click",
      namespace: "tab",
      name: "click",
      publicName: "tab.click",
      localName: "click",
      source: "main_thread",
      transport: "specific_tab_content_script",
      description: "Click an element in a target tab",
      params: z.object({ tabId: z.number(), refId: z.string() }),
      paramTypes: [
        { name: "tabId", type: "number", required: true, description: "Tab ID" },
        {
          name: "refId",
          type: "string",
          required: true,
          description: "Element refId",
        },
      ],
      returns: z.null(),
      returnDoc: "null",
      errorCode: "ETAB",
      errorCategory: "tab",
      paramDocs: { tabId: "Tab ID", refId: "Element refId" },
      handler: async () => null,
    });

    freezeRegistry();

    const tools = listTools();
    const csTools = tools.filter(
      (t) =>
        t.transport === "active_tab_content_script" ||
        t.transport === "specific_tab_content_script",
    );

    expect(csTools.length).toBeGreaterThan(0);

    for (const tool of csTools) {
      const localName = tool.localName ?? tool.name;
      expect(CONTENT_SCRIPT_ACTIONS.has(localName)).toBe(true);
    }
  });

  it("throws when a content-script action has an unknown localName", () => {
    registerTool({
      action: "page_unknown",
      namespace: "page",
      name: "unknown",
      publicName: "page.unknown",
      localName: "unknown_action",
      source: "main_thread",
      transport: "active_tab_content_script",
      description: "Unknown action",
      params: z.object({}),
      paramTypes: [],
      returns: z.null(),
      returnDoc: "null",
      errorCode: "EPAGE",
      errorCategory: "page",
      paramDocs: {},
      handler: async () => null,
    });

    expect(() => freezeRegistry()).toThrow(
      /which is not in CONTENT_SCRIPT_ACTIONS/,
    );
  });

  it("verifies no duplicate publicName registrations", () => {
    registerTool({
      action: "tool_a",
      namespace: "ns",
      name: "a",
      publicName: "ns.a",
      source: "main_thread",
      transport: "host_async",
      description: "Tool A",
      params: z.object({}),
      paramTypes: [],
      returns: z.null(),
      returnDoc: "null",
      errorCode: "E",
      errorCategory: "test",
      paramDocs: {},
      handler: async () => null,
    });

    registerTool({
      action: "tool_b",
      namespace: "ns",
      name: "b",
      publicName: "ns.a", // duplicate publicName
      source: "main_thread",
      transport: "host_async",
      description: "Tool B",
      params: z.object({}),
      paramTypes: [],
      returns: z.null(),
      returnDoc: "null",
      errorCode: "E",
      errorCategory: "test",
      paramDocs: {},
      handler: async () => null,
    });

    expect(() => freezeRegistry()).toThrow(
      /Duplicate publicName registration: "ns.a"/,
    );
  });

  it("prevents further registrations after freezing", () => {
    register(
      "early_tool",
      z.object({}),
      z.null(),
      {
        namespace: "test",
        name: "early",
        publicName: "test.early",
        source: "main_thread",
        transport: "host_async",
        description: "Early tool",
      },
      async () => null,
    );

    freezeRegistry();
    expect(isRegistryFrozen()).toBe(true);

    expect(() =>
      register(
        "late_tool",
        z.object({}),
        z.null(),
        {
          namespace: "test",
          name: "late",
          publicName: "test.late",
          source: "main_thread",
          transport: "host_async",
          description: "Late tool",
        },
        async () => null,
      ),
    ).toThrow(/Registry is frozen/);
  });

  it("throws on orphan manifest entries", () => {
    register(
      "registered_tool",
      z.object({}),
      z.null(),
      {
        namespace: "test",
        name: "registered",
        publicName: "test.registered",
        source: "main_thread",
        transport: "host_async",
        description: "Registered tool",
      },
      async () => null,
    );

    expect(() =>
      freezeRegistry(["registered_tool", "missing_tool"]),
    ).toThrow(/Orphan manifest entries: "missing_tool"/);
  });

  it("passes when manifest actions are all registered", () => {
    register(
      "tool_one",
      z.object({}),
      z.null(),
      {
        namespace: "test",
        name: "one",
        publicName: "test.one",
        source: "main_thread",
        transport: "host_async",
        description: "Tool one",
      },
      async () => null,
    );

    register(
      "tool_two",
      z.object({}),
      z.null(),
      {
        namespace: "test",
        name: "two",
        publicName: "test.two",
        source: "main_thread",
        transport: "host_async",
        description: "Tool two",
      },
      async () => null,
    );

    expect(() => freezeRegistry(["tool_one", "tool_two"])).not.toThrow();
  });
});
