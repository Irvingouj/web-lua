// JS wrapper for @pi-oxide/dom-semantic-tree
// Self-contained WASM package for DOM snapshot extraction.

import wasmInit, {
  collect_document,
  collect_element,
  format_snapshot_js,
  version_js,
} from "./dom_semantic_tree.js";

export async function init(): Promise<void> {
  await wasmInit();
}

export function collectDocument(options: unknown): unknown {
  return collect_document(options);
}

export function collectElement(root: Element, options: unknown): unknown {
  return collect_element(root, options);
}

export function formatSnapshot(snapshot: unknown, format?: string): string {
  return format_snapshot_js(snapshot, format);
}

export function version(): string {
  return version_js();
}
