// Zod schemas for content-script tool params/returns

import { z } from "zod";

// ─── Page action schemas (content-script variants) ───────────────

export const CsClickParamsSchema = z.object({
  refId: z.string().optional(),
  label: z.string().optional(),
});

export const CsFillParamsSchema = z.object({
  refId: z.string().optional(),
  label: z.string().optional(),
  value: z.string().optional(),
});

export const CsTypeParamsSchema = z.object({
  refId: z.string().optional(),
  label: z.string().optional(),
  text: z.string().optional(),
});

export const CsAppendParamsSchema = z.object({
  refId: z.string().optional(),
  label: z.string().optional(),
  text: z.string().optional(),
});

export const CsPressParamsSchema = z.object({
  key: z.string(),
});

export const CsSelectParamsSchema = z.object({
  refId: z.string().optional(),
  value: z.string().optional(),
});

export const CsCheckParamsSchema = z.object({
  refId: z.string().optional(),
  checked: z.boolean().optional(),
});

export const CsHoverParamsSchema = z.object({
  refId: z.string().optional(),
});

export const CsUnhoverParamsSchema = z.object({});

export const CsScrollParamsSchema = z.object({
  direction: z.string().optional(),
  amount: z.number().optional(),
  refId: z.string().optional(),
});

export const CsScrollToParamsSchema = z.object({
  refId: z.string().optional(),
  x: z.number().optional(),
  y: z.number().optional(),
});

export const CsDblClickParamsSchema = z.object({
  refId: z.string().optional(),
});

export const CsForwardParamsSchema = z.object({});

export const CsReloadParamsSchema = z.object({});

export const CsEvaluateParamsSchema = z.object({
  code: z.string().optional(),
});

export const CsBackParamsSchema = z.object({});

export const CsPingParamsSchema = z.object({});

export const CsPingReturnSchema = z.object({
  ok: z.literal(true),
});

export const CsSnapshotParamsSchema = z.object({
  max_nodes: z.number().optional(),
});

export const CsSnapshotReturnSchema = z.object({
  text: z.string(),
  nodes: z.array(
    z.object({
      refId: z.number(),
      role: z.string(),
      tag: z.string(),
      name: z.string().optional(),
    }),
  ),
  url: z.string(),
  title: z.string(),
  viewport: z.object({
    width: z.number(),
    height: z.number(),
  }),
});

export const CsFetchParamsSchema = z.object({
  url: z.string(),
  method: z.string().optional(),
  headers: z.record(z.unknown()).optional(),
  body: z.unknown().optional(),
  timeout: z.number().optional(),
});

export const CsFetchReturnSchema = z.object({
  status: z.number(),
  ok: z.boolean(),
  headers: z.record(z.string()),
  body: z.string(),
});

export const CsInternalPingParamsSchema = z.object({});

export const CsInternalPingReturnSchema = z.object({
  ready: z.literal(true),
  version: z.string(),
  toolsHash: z.string(),
});

export const CsToolDocsParamsSchema = z.object({});

export const CsToolDocsReturnSchema = z.array(z.unknown());

// ─── Schema builder ────────────────────────────────────────────

import type { ToolDoc } from "../shared/registry/types.js";
import { listLocalToolDocs } from "./registry.js";

/**
 * Build the current content-script tool specification list.
 * Returns a snapshot of all registered local tools as ToolDoc objects.
 */
export function buildContentScriptSpecs(): ToolDoc[] {
  return listLocalToolDocs();
}
