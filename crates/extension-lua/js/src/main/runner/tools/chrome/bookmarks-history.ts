import { z } from "zod";
import { registerTool } from "../../../../shared/tool-registry.js";
import {
  BookmarksCreateParamsSchema,
  BookmarksDeleteParamsSchema,
  BookmarksSearchParamsSchema,
  HistoryDeleteParamsSchema,
  HistorySearchParamsSchema,
} from "../../../../shared/schemas.js";
import {
  handleChromeBookmarksSearch,
  handleChromeBookmarksCreate,
  handleChromeBookmarksRemove,
  handleChromeHistorySearch,
  handleChromeHistoryDeleteUrl,
} from "./handlers.js";


registerTool({
  action: "chrome_bookmarks_search",
  namespace: "chrome",
  name: "bookmarks.search",
  publicName: "chrome.bookmarks.search",
  source: "main_thread",
  transport: "chrome_api",
  description: "Search bookmarks",
  params: BookmarksSearchParamsSchema,
  paramTypes: [
    {
      name: "query",
      type: "string | object",
      required: false,
      description: "Search string or query object",
    },
  ],
  returns: z.array(z.unknown()),
  returnDoc: "BookmarkTreeNode[]",
  errorCode: "ECHROME",
  errorCategory: "extension",
  paramDocs: { query: "Search query" },
  handler: handleChromeBookmarksSearch,
});

registerTool({
  action: "chrome_bookmarks_create",
  namespace: "chrome",
  name: "bookmarks.create",
  publicName: "chrome.bookmarks.create",
  source: "main_thread",
  transport: "chrome_api",
  description: "Create a bookmark",
  params: BookmarksCreateParamsSchema,
  paramTypes: [
    {
      name: "bookmark",
      type: "object",
      required: true,
      description: "Bookmark details: parentId, title, url, index",
    },
  ],
  returns: z.unknown(),
  returnDoc: "BookmarkTreeNode",
  errorCode: "ECHROME",
  errorCategory: "extension",
  paramDocs: { bookmark: "Bookmark details" },
  handler: handleChromeBookmarksCreate,
});

registerTool({
  action: "chrome_bookmarks_remove",
  namespace: "chrome",
  name: "bookmarks.remove",
  publicName: "chrome.bookmarks.remove",
  source: "main_thread",
  transport: "chrome_api",
  description: "Remove a bookmark",
  params: BookmarksDeleteParamsSchema,
  paramTypes: [
    {
      name: "id",
      type: "string",
      required: false,
      description: "Bookmark node ID",
    },
  ],
  returns: z.null(),
  returnDoc: "null",
  errorCode: "ECHROME",
  errorCategory: "extension",
  paramDocs: { id: "Bookmark node ID" },
  handler: handleChromeBookmarksRemove,
});

registerTool({
  action: "chrome_history_search",
  namespace: "chrome",
  name: "history.search",
  publicName: "chrome.history.search",
  source: "main_thread",
  transport: "chrome_api",
  description: "Search browser history",
  params: HistorySearchParamsSchema,
  paramTypes: [
    {
      name: "query",
      type: "object",
      required: true,
      description: "Query: text, startTime, endTime, maxResults",
    },
  ],
  returns: z.array(z.unknown()),
  returnDoc: "HistoryItem[]",
  errorCode: "ECHROME",
  errorCategory: "extension",
  paramDocs: { query: "Query object" },
  handler: handleChromeHistorySearch,
});

registerTool({
  action: "chrome_history_deleteUrl",
  namespace: "chrome",
  name: "history.deleteUrl",
  publicName: "chrome.history.deleteUrl",
  source: "main_thread",
  transport: "chrome_api",
  description: "Delete a URL from history",
  params: HistoryDeleteParamsSchema,
  paramTypes: [
    {
      name: "url",
      type: "string",
      required: false,
      description: "URL to remove",
    },
  ],
  returns: z.null(),
  returnDoc: "null",
  errorCode: "ECHROME",
  errorCategory: "extension",
  paramDocs: { url: "URL to remove" },
  handler: handleChromeHistoryDeleteUrl,
});