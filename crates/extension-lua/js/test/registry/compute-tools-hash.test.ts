import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { z } from "zod";
import {
  csRegistry,
  register,
  computeToolsHash,
} from "../../src/content-script/registry.js";

describe("computeToolsHash", () => {
  beforeEach(() => {
    csRegistry.clear();
  });

  afterEach(() => {
    csRegistry.clear();
  });

  it("returns a consistent 8-char hex string", () => {
    register(
      "tool_a",
      z.object({}),
      z.null(),
      {
        namespace: "ns",
        name: "a",
        publicName: "ns.a",
        source: "content_script",
        transport: "active_tab_content_script",
        description: "Tool A",
      },
      () => null,
    );

    const hash = computeToolsHash();
    expect(hash).toMatch(/^[0-9a-f]{8}$/);
    expect(hash).toBe(computeToolsHash());
  });

  it("same set of tools gives same hash", () => {
    register(
      "tool_x",
      z.object({}),
      z.null(),
      {
        namespace: "ns",
        name: "x",
        publicName: "ns.x",
        source: "content_script",
        transport: "active_tab_content_script",
        description: "Tool X",
      },
      () => null,
    );
    register(
      "tool_y",
      z.object({}),
      z.null(),
      {
        namespace: "ns",
        name: "y",
        publicName: "ns.y",
        source: "content_script",
        transport: "active_tab_content_script",
        description: "Tool Y",
      },
      () => null,
    );

    const hash1 = computeToolsHash();
    // clear and re-register same tools
    csRegistry.clear();
    register(
      "tool_x",
      z.object({}),
      z.null(),
      {
        namespace: "ns",
        name: "x",
        publicName: "ns.x",
        source: "content_script",
        transport: "active_tab_content_script",
        description: "Tool X",
      },
      () => null,
    );
    register(
      "tool_y",
      z.object({}),
      z.null(),
      {
        namespace: "ns",
        name: "y",
        publicName: "ns.y",
        source: "content_script",
        transport: "active_tab_content_script",
        description: "Tool Y",
      },
      () => null,
    );

    const hash2 = computeToolsHash();
    expect(hash1).toBe(hash2);
  });

  it("different set of tools gives different hash", () => {
    register(
      "tool_a",
      z.object({}),
      z.null(),
      {
        namespace: "ns",
        name: "a",
        publicName: "ns.a",
        source: "content_script",
        transport: "active_tab_content_script",
        description: "Tool A",
      },
      () => null,
    );

    const hash1 = computeToolsHash();

    csRegistry.clear();
    register(
      "tool_b",
      z.object({}),
      z.null(),
      {
        namespace: "ns",
        name: "b",
        publicName: "ns.b",
        source: "content_script",
        transport: "active_tab_content_script",
        description: "Tool B",
      },
      () => null,
    );

    const hash2 = computeToolsHash();
    expect(hash1).not.toBe(hash2);
  });

  it("adding duplicate tools with different localNames does NOT change hash", () => {
    register(
      "tool_a",
      z.object({}),
      z.null(),
      {
        namespace: "ns",
        name: "a",
        publicName: "ns.a",
        localName: "a1",
        source: "content_script",
        transport: "active_tab_content_script",
        description: "Tool A v1",
      },
      () => null,
    );

    const hash1 = computeToolsHash();

    register(
      "tool_a_alias",
      z.object({}),
      z.null(),
      {
        namespace: "ns",
        name: "a",
        publicName: "ns.a",
        localName: "a2",
        source: "content_script",
        transport: "active_tab_content_script",
        description: "Tool A v2",
      },
      () => null,
    );

    const hash2 = computeToolsHash();
    expect(hash1).toBe(hash2);
  });
});
