// Content script entry — thin orchestrator (< 40 lines)
import "./handlers.js";
import { setupMessageRouter } from "./message-router.js";

declare global {
  interface Window {
    __luaNotebookSetLogLevel?: (level: string) => void;
    __luaNotebookContentScriptInjected?: boolean;
  }
}

if (!window.__luaNotebookContentScriptInjected) {
  window.__luaNotebookContentScriptInjected = true;

  const __LOG_LEVELS = { debug: 0, info: 1, warn: 2, error: 3, none: 4 } as const;
  window.__luaNotebookSetLogLevel = (level: string) => {
    const numeric = __LOG_LEVELS[level as keyof typeof __LOG_LEVELS] ?? 3;
    // Bridge to shared logger if needed; for now keep numeric mapping
    // eslint-disable-next-line no-console
    if (numeric <= 0) console.log("[cs] log level set to", level);
  };

  setupMessageRouter();
}

export {
  csRegistry,
  register,
  contentScriptDocsByPublicName,
  contentScriptDocsByAction,
  listLocalToolDocs,
} from "./registry.js";
