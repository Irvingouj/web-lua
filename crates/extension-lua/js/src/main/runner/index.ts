// Side-effect imports — register all tools
import "./tools/runtime-docs.js";
import "./tools/storage.js";
import "./tools/network.js";
import "./tools/clipboard.js";
import "./tools/sleep.js";
import "./tools/sidepanel-handlers.js";
import "./tools/sidepanel.js";
import "./tools/page.js";
import "./tools/page-nav.js";
import "./tools/tab.js";
import "./tools/tab-evaluate.js";
import "./tools/tab-chrome.js";
import "./tools/tab-snapshot.js";
import "./tools/chrome/index.js";
import "./tools/aliases.js";
import "./tools/host-call.js";

import { listTools, freezeRegistry } from "../../shared/tool-registry.js";
import { initRuntimeDocs } from "./tools/runtime-docs.js";

// Initialize runtime docs after all tools are registered
initRuntimeDocs();

// Re-exports
export * from "./runtime.js";
export * from "./tab/messaging.js";
export * from "./tab/execute.js";
