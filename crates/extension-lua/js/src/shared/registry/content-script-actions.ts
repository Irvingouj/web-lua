/**
 * Set of local action names handled by the content script.
 * These are the `localName` values registered in the content-script registry.
 * Used by freezeRegistry() to validate that every content-script-backed
 * main-thread action has a corresponding content-script handler.
 */
export const CONTENT_SCRIPT_ACTIONS = new Set([
  "click",
  "fill",
  "type",
  "append",
  "press",
  "select",
  "check",
  "hover",
  "unhover",
  "scroll",
  "scrollTo",
  "dblclick",
  "forward",
  "reload",
  "evaluate",
  "back",
  "ping",
  "snapshot",
  "fetch",
  "__ping",
  "__tool_docs",
]);
