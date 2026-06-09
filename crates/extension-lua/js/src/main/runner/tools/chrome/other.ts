import { z } from "zod";
import { registerTool } from "../../../../shared/tool-registry.js";
import {
  ChromeContextMenusCreateParamsSchema,
  ChromeContextMenusRemoveParamsSchema,
  ChromeRuntimeSendMessageParamsSchema,
  ChromeScriptingExecuteScriptParamsSchema,
  ChromeSidePanelSetOptionsParamsSchema,
} from "../../../../shared/schemas.js";
import {
  handleChromeContextMenusCreate,
  handleChromeContextMenusRemove,
  handleChromeRuntimeSendMessage,
  handleChromeScriptingExecuteScript,
  handleChromeSidePanelSetOptions,
} from "./handlers.js";

registerTool({
  action: "chrome_runtime_sendMessage",
  namespace: "chrome",
  name: "runtime.sendMessage",
  publicName: "chrome.runtime.sendMessage",
  source: "main_thread",
  transport: "chrome_api",
  description:
    "Send a message to the extension background script or another extension",
  params: ChromeRuntimeSendMessageParamsSchema,
  paramTypes: [
    {
      name: "message",
      type: "any",
      required: false,
      description: "Message payload",
    },
    {
      name: "options",
      type: "object",
      required: false,
      description: "Options: to, includeTlsChannelId",
    },
  ],
  returns: z.unknown(),
  returnDoc: "any",
  errorCode: "ECHROME",
  errorCategory: "extension",
  paramDocs: { message: "Message payload", options: "Options" },
  handler: handleChromeRuntimeSendMessage,
});

registerTool({
  action: "chrome_contextMenus_create",
  namespace: "chrome",
  name: "contextMenus.create",
  publicName: "chrome.contextMenus.create",
  source: "main_thread",
  transport: "chrome_api",
  description: "Create a context menu item",
  params: ChromeContextMenusCreateParamsSchema,
  paramTypes: [
    {
      name: "details",
      type: "object",
      required: true,
      description: "Menu item properties",
    },
  ],
  returns: z.unknown(),
  returnDoc: "string | number",
  errorCode: "ECHROME",
  errorCategory: "extension",
  paramDocs: { details: "Menu item properties" },
  handler: handleChromeContextMenusCreate,
});

registerTool({
  action: "chrome_contextMenus_remove",
  namespace: "chrome",
  name: "contextMenus.remove",
  publicName: "chrome.contextMenus.remove",
  source: "main_thread",
  transport: "chrome_api",
  description: "Remove a context menu item",
  params: ChromeContextMenusRemoveParamsSchema,
  paramTypes: [
    {
      name: "menuItemId",
      type: "string | number",
      required: false,
      description: "Menu item ID",
    },
  ],
  returns: z.null(),
  returnDoc: "null",
  errorCode: "ECHROME",
  errorCategory: "extension",
  paramDocs: { menuItemId: "Menu item ID" },
  handler: handleChromeContextMenusRemove,
});

registerTool({
  action: "chrome_sidePanel_setOptions",
  namespace: "chrome",
  name: "sidePanel.setOptions",
  publicName: "chrome.sidePanel.setOptions",
  source: "main_thread",
  transport: "chrome_api",
  description: "Set side panel options",
  params: ChromeSidePanelSetOptionsParamsSchema,
  paramTypes: [
    {
      name: "options",
      type: "object",
      required: true,
      description: "Side panel options",
    },
  ],
  returns: z.null(),
  returnDoc: "null",
  errorCode: "ECHROME",
  errorCategory: "extension",
  paramDocs: { options: "Side panel options" },
  handler: handleChromeSidePanelSetOptions,
});

registerTool({
  action: "chrome_scripting_executeScript",
  namespace: "chrome",
  name: "scripting.executeScript",
  publicName: "chrome.scripting.executeScript",
  source: "main_thread",
  transport: "chrome_api",
  description: "Execute a script in a tab",
  params: ChromeScriptingExecuteScriptParamsSchema,
  paramTypes: [
    {
      name: "target",
      type: "object",
      required: false,
      description: "Target: tabId",
    },
    {
      name: "func",
      type: "function",
      required: false,
      description: "Function to execute",
    },
    {
      name: "args",
      type: "array",
      required: false,
      description: "Function arguments",
    },
    {
      name: "world",
      type: "string",
      required: false,
      description: "Execution world: MAIN or ISOLATED",
    },
    {
      name: "files",
      type: "string[]",
      required: false,
      description: "Script files to inject",
    },
  ],
  returns: z.array(z.unknown()),
  returnDoc: "InjectionResult[]",
  errorCode: "ECHROME",
  errorCategory: "extension",
  paramDocs: {
    target: "Target",
    func: "Function",
    args: "Arguments",
    world: "Execution world",
    files: "Script files",
  },
  handler: handleChromeScriptingExecuteScript,
});
