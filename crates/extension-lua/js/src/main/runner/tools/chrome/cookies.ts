import { z } from "zod";
import { registerTool } from "../../../../shared/tool-registry.js";
import {
  CookiesDeleteParamsSchema,
  CookiesGetParamsSchema,
  CookiesListParamsSchema,
  CookiesSetParamsSchema,
} from "../../../../shared/schemas.js";
import {
  handleChromeCookiesGet,
  handleChromeCookiesSet,
  handleChromeCookiesRemove,
  handleChromeCookiesGetAll,
} from "./handlers.js";


registerTool({
  action: "chrome_cookies_get",
  namespace: "chrome",
  name: "cookies.get",
  publicName: "chrome.cookies.get",
  source: "main_thread",
  transport: "chrome_api",
  description: "Get a cookie by details",
  params: CookiesGetParamsSchema,
  paramTypes: [
    {
      name: "details",
      type: "object",
      required: true,
      description: "Cookie details: name, url, storeId",
    },
  ],
  returns: z.unknown(),
  returnDoc: "Cookie | null",
  errorCode: "ECHROME",
  errorCategory: "extension",
  paramDocs: { details: "Cookie details" },
  handler: handleChromeCookiesGet,
});

registerTool({
  action: "chrome_cookies_set",
  namespace: "chrome",
  name: "cookies.set",
  publicName: "chrome.cookies.set",
  source: "main_thread",
  transport: "chrome_api",
  description: "Set a cookie",
  params: CookiesSetParamsSchema,
  paramTypes: [
    {
      name: "details",
      type: "object",
      required: true,
      description: "Cookie details: name, value, url, etc.",
    },
  ],
  returns: z.unknown(),
  returnDoc: "Cookie | null",
  errorCode: "ECHROME",
  errorCategory: "extension",
  paramDocs: { details: "Cookie details" },
  handler: handleChromeCookiesSet,
});

registerTool({
  action: "chrome_cookies_remove",
  namespace: "chrome",
  name: "cookies.remove",
  publicName: "chrome.cookies.remove",
  source: "main_thread",
  transport: "chrome_api",
  description: "Remove a cookie",
  params: CookiesDeleteParamsSchema,
  paramTypes: [
    {
      name: "details",
      type: "object",
      required: true,
      description: "Cookie details: name, url",
    },
  ],
  returns: z.unknown(),
  returnDoc: "Details",
  errorCode: "ECHROME",
  errorCategory: "extension",
  paramDocs: { details: "Cookie details" },
  handler: handleChromeCookiesRemove,
});

registerTool({
  action: "chrome_cookies_getAll",
  namespace: "chrome",
  name: "cookies.getAll",
  publicName: "chrome.cookies.getAll",
  source: "main_thread",
  transport: "chrome_api",
  description: "Get all cookies matching a filter",
  params: CookiesListParamsSchema,
  paramTypes: [
    {
      name: "details",
      type: "object",
      required: false,
      description: "Filter: url, name, domain, etc.",
    },
  ],
  returns: z.array(z.unknown()),
  returnDoc: "Cookie[]",
  errorCode: "ECHROME",
  errorCategory: "extension",
  paramDocs: { details: "Filter details" },
  handler: handleChromeCookiesGetAll,
});