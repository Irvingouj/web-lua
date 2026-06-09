import type { ToolDoc } from "./types.js";

/**
 * Merged documentation registry that combines static docs (from the runner
 * bundle) with runtime docs confirmed by content scripts.
 *
 * Static docs are always present. Runtime docs are merged in and
 * override static docs for the same action/publicName — content script
 * tools take precedence over static stubs.
 */
export class MergedDocRegistry {
  byPublicName = new Map<string, ToolDoc>();
  byAction = new Map<string, ToolDoc>();
  private staticDocs = new Map<string, ToolDoc>();
  private runtimeDocs = new Map<string, ToolDoc>();

  /**
   * Populate static docs from `listTools()` output.
   * Clears and rebuilds the static doc index.
   */
  setStaticDocs(docs: ToolDoc[]): void {
    this.staticDocs.clear();
    for (const doc of docs) {
      this.staticDocs.set(doc.action, doc);
    }
    this.rebuildIndexes();
  }

  /**
   * Merge runtime docs (e.g. from content script `__tool_docs`).
   * Runtime docs override static docs for the same action/publicName.
   */
  mergeRuntimeDocs(docs: ToolDoc[]): void {
    for (const doc of docs) {
      this.runtimeDocs.set(doc.action, doc);
    }
    this.rebuildIndexes();
  }

  /**
   * Clear only runtime docs. Static docs remain.
   */
  clearRuntimeDocs(): void {
    this.runtimeDocs.clear();
    this.rebuildIndexes();
  }

  /**
   * Get a doc by public Lua API name (e.g. "page.click") or by internal
   * action name (e.g. "page_click"). Returns undefined if not found.
   */
  get(query: string): ToolDoc | undefined {
    return this.byPublicName.get(query) ?? this.byAction.get(query);
  }

  /**
   * List all unique docs (static + runtime), sorted by publicName.
   */
  list(): ToolDoc[] {
    const seen = new Set<string>();
    const docs: ToolDoc[] = [];
    for (const doc of this.byPublicName.values()) {
      if (!seen.has(doc.action)) {
        seen.add(doc.action);
        docs.push(doc);
      }
    }
    docs.sort((a, b) => a.publicName.localeCompare(b.publicName));
    return docs;
  }

  /**
   * Fuzzy search over publicName, namespace, name, action, description,
   * param names, param descriptions, and return description.
   * Returns matching docs sorted by relevance (higher score first).
   */
  search(query: string): ToolDoc[] {
    const q = query.toLowerCase().trim();
    if (!q) {
      return this.list();
    }

    const scored: Array<{ doc: ToolDoc; score: number }> = [];
    for (const doc of this.list()) {
      const score = this.scoreDoc(doc, q);
      if (score > 0) {
        scored.push({ doc, score });
      }
    }

    scored.sort((a, b) => b.score - a.score);
    return scored.map((s) => s.doc);
  }

  private scoreDoc(doc: ToolDoc, q: string): number {
    let score = 0;

    // Exact matches in primary identifiers score highest
    if (doc.publicName.toLowerCase() === q) score += 100;
    if (doc.action.toLowerCase() === q) score += 90;
    if (doc.name.toLowerCase() === q) score += 80;
    if (doc.namespace.toLowerCase() === q) score += 70;

    // Partial matches in primary identifiers
    if (doc.publicName.toLowerCase().includes(q)) score += 50;
    if (doc.action.toLowerCase().includes(q)) score += 40;
    if (doc.name.toLowerCase().includes(q)) score += 30;
    if (doc.namespace.toLowerCase().includes(q)) score += 20;

    // Description match
    if (doc.description.toLowerCase().includes(q)) score += 10;

    // Param names and descriptions
    for (const param of doc.params) {
      if (param.name.toLowerCase().includes(q)) score += 15;
      if (param.description.toLowerCase().includes(q)) score += 5;
    }

    // Return description
    if (doc.returns.description.toLowerCase().includes(q)) score += 5;

    return score;
  }

  private rebuildIndexes(): void {
    this.byPublicName.clear();
    this.byAction.clear();

    // Static docs first — runtime docs override them for the same action/publicName
    for (const doc of this.staticDocs.values()) {
      this.byPublicName.set(doc.publicName, doc);
      this.byAction.set(doc.action, doc);
    }

    // Runtime docs win when both exist (content script tools override static stubs)
    for (const doc of this.runtimeDocs.values()) {
      this.byPublicName.set(doc.publicName, doc);
      this.byAction.set(doc.action, doc);
    }
  }
}
