import { listTools, getTool } from "../tool-registry.js";
import { CONTENT_SCRIPT_ACTIONS } from "./content-script-actions.js";

let registryFrozen = false;

/**
 * Returns whether the registry has been frozen.
 */
export function isRegistryFrozen(): boolean {
  return registryFrozen;
}

/**
 * Freeze the tool registry after all tools have been registered.
 *
 * Performs integrity checks:
 * 1. Every registered tool has a non-null handler.
 * 2. No duplicate publicName registrations exist.
 * 3. Every content-script-backed action (transport = active_tab_content_script
 *    or specific_tab_content_script) has its localName in CONTENT_SCRIPT_ACTIONS.
 * 4. Every action in the optional manifest has a registered handler.
 *
 * After freezing, any call to register() will throw.
 *
 * @param manifest - Optional array of action names that are expected to be
 *   registered. If provided, freezeRegistry throws if any manifest action
 *   is missing from the registry (orphan manifest entry).
 */
export function freezeRegistry(manifest?: string[]): void {
  if (registryFrozen) {
    throw new Error("Registry is already frozen");
  }

  const tools = listTools();
  const actions = new Set<string>();
  const publicNames = new Set<string>();

  // ─── Check 1: every tool has a handler, no duplicate publicNames ──
  for (const tool of tools) {
    const definition = getTool(tool.action);
    if (!definition) {
      throw new Error(
        `No handler registered: action "${tool.action}" is in docs but has no registered handler`,
      );
    }
    if (typeof definition.handler !== "function") {
      throw new Error(
        `No valid handler: action "${tool.action}" has a registered entry but handler is not a function`,
      );
    }

    actions.add(tool.action);

    if (publicNames.has(tool.publicName)) {
      throw new Error(
        `Duplicate publicName registration: "${tool.publicName}" (action: ${tool.action})`,
      );
    }
    publicNames.add(tool.publicName);
  }

  // ─── Check 2: content-script actions are in CONTENT_SCRIPT_ACTIONS ─
  for (const tool of tools) {
    if (
      tool.transport === "active_tab_content_script" ||
      tool.transport === "specific_tab_content_script"
    ) {
      const localName = tool.localName ?? tool.name;
      if (!CONTENT_SCRIPT_ACTIONS.has(localName)) {
        throw new Error(
          `Content-script action "${tool.action}" has localName "${localName}" ` +
            `which is not in CONTENT_SCRIPT_ACTIONS. ` +
            `Add it to src/shared/registry/content-script-actions.ts if intentional.`,
        );
      }
    }
  }

  // ─── Check 3: manifest actions are all registered ─────────────────
  if (manifest && manifest.length > 0) {
    const missing = manifest.filter((action) => !actions.has(action));
    if (missing.length > 0) {
      throw new Error(
        `Orphan manifest entries: ${missing.map((a) => `"${a}"`).join(", ")} — ` +
          `actions listed in manifest but no handler registered`,
      );
    }
  }

  registryFrozen = true;
}

/**
 * Reset the freeze state. Intended for test teardown only.
 */
export function resetFreezeState(): void {
  registryFrozen = false;
}

/**
 * Internal helper used by register() to enforce the freeze.
 * Throws if the registry has been frozen.
 */
export function assertRegistryNotFrozen(): void {
  if (registryFrozen) {
    throw new Error(
      "Registry is frozen. No new tools can be registered after freezeRegistry() has been called.",
    );
  }
}
