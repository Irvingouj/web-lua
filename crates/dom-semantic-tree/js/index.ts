// JS wrapper for @pi-oxide/dom-semantic-tree
// Self-contained WASM package for DOM snapshot extraction.

import wasmInit, {
  collect_document,
  collect_element,
  format_snapshot_js,
  type TreeSnapshot,
  type CollectOptions,
  type SnapshotFormat,
} from "./dom_semantic_tree.js";

export async function init(): Promise<void> {
  await wasmInit();
}

export function collectDocument(options: CollectOptions): TreeSnapshot {
  return collect_document(options);
}

export function collectElement(root: Element, options: CollectOptions): TreeSnapshot {
  return collect_element(root, options);
}

export function formatSnapshot(snapshot: TreeSnapshot, format?: SnapshotFormat): string {
  return format_snapshot_js(snapshot, format);
}

export type { TreeSnapshot, CollectOptions, SnapshotFormat };
