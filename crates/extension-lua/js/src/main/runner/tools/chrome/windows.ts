import { z } from "zod";
import { registerTool } from "../../../../shared/tool-registry.js";
import {
  ChromeWindowsCreateParamsSchema,
  ChromeWindowsGetAllParamsSchema,
  ChromeWindowsRemoveParamsSchema,
  ChromeWindowsUpdateParamsSchema,
} from "../../../../shared/schemas.js";
import {
  handleChromeWindowsCreate,
  handleChromeWindowsGetAll,
  handleChromeWindowsRemove,
  handleChromeWindowsUpdate,
} from "./handlers.js";


registerTool({
  action: "chrome_windows_getAll",
  namespace: "chrome",
  name: "windows.getAll",
  publicName: "chrome.windows.getAll",
  source: "main_thread",
  transport: "chrome_api",
  description: "Get all windows",
  params: ChromeWindowsGetAllParamsSchema,
  paramTypes: [
    {
      name: "populate",
      type: "boolean",
      required: false,
      description: "Whether to populate tabs",
    },
    {
      name: "windowTypes",
      type: "string[]",
      required: false,
      description: "Window types to filter",
    },
  ],
  returns: z.array(z.unknown()),
  returnDoc: "Window[]",
  errorCode: "ECHROME",
  errorCategory: "extension",
  paramDocs: { populate: "Populate tabs", windowTypes: "Window types" },
  handler: handleChromeWindowsGetAll,
});

registerTool({
  action: "chrome_windows_create",
  namespace: "chrome",
  name: "windows.create",
  publicName: "chrome.windows.create",
  source: "main_thread",
  transport: "chrome_api",
  description: "Create a new window",
  params: ChromeWindowsCreateParamsSchema,
  paramTypes: [
    {
      name: "createData",
      type: "object",
      required: false,
      description: "Window properties",
    },
  ],
  returns: z.unknown(),
  returnDoc: "Window",
  errorCode: "ECHROME",
  errorCategory: "extension",
  paramDocs: { createData: "Window properties" },
  handler: handleChromeWindowsCreate,
});

registerTool({
  action: "chrome_windows_update",
  namespace: "chrome",
  name: "windows.update",
  publicName: "chrome.windows.update",
  source: "main_thread",
  transport: "chrome_api",
  description: "Update a window",
  params: ChromeWindowsUpdateParamsSchema,
  paramTypes: [
    {
      name: "windowId",
      type: "number",
      required: false,
      description: "Window ID",
    },
    {
      name: "update",
      type: "object",
      required: false,
      description: "Update properties",
    },
  ],
  returns: z.unknown(),
  returnDoc: "Window",
  errorCode: "ECHROME",
  errorCategory: "extension",
  paramDocs: { windowId: "Window ID", update: "Update properties" },
  handler: handleChromeWindowsUpdate,
});

registerTool({
  action: "chrome_windows_remove",
  namespace: "chrome",
  name: "windows.remove",
  publicName: "chrome.windows.remove",
  source: "main_thread",
  transport: "chrome_api",
  description: "Remove a window",
  params: ChromeWindowsRemoveParamsSchema,
  paramTypes: [
    {
      name: "windowId",
      type: "number",
      required: false,
      description: "Window ID",
    },
  ],
  returns: z.null(),
  returnDoc: "null",
  errorCode: "ECHROME",
  errorCategory: "extension",
  paramDocs: { windowId: "Window ID" },
  handler: handleChromeWindowsRemove,
});