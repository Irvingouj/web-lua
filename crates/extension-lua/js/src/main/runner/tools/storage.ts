// Storage tools — localStorage wrappers

import { registerTool } from "../../../shared/tool-registry.js";
import {
  StorageDeleteParamsSchema,
  StorageGetParamsSchema,
  StorageListParamsSchema,
  StorageSetParamsSchema,
} from "../../../shared/schemas.js";
import { z } from "zod";

registerTool({
  action: "storage_get",
  namespace: "storage",
  description: "Get a value from local storage by key",
  params: StorageGetParamsSchema,
  paramTypes: [
    {
      name: "key",
      type: "string",
      required: true,
      description: "Storage key",
    },
  ],
  returns: z.string().nullable(),
  returnDoc: "string | null",
  errorCode: "ESTORAGE",
  errorCategory: "storage",
  paramDocs: { key: "Storage key" },
  handler: async (params) => localStorage.getItem(params.key),
});

registerTool({
  action: "storage_set",
  namespace: "storage",
  description: "Set a value in local storage",
  params: StorageSetParamsSchema,
  paramTypes: [
    {
      name: "key",
      type: "string",
      required: true,
      description: "Storage key",
    },
    {
      name: "value",
      type: "string",
      required: true,
      description: "Value to store",
    },
  ],
  returns: z.null(),
  returnDoc: "null",
  errorCode: "ESTORAGE",
  errorCategory: "storage",
  paramDocs: { key: "Storage key", value: "Value to store" },
  handler: async (params) => {
    localStorage.setItem(params.key, params.value);
    return null;
  },
});

registerTool({
  action: "storage_delete",
  namespace: "storage",
  description: "Delete a key from local storage",
  params: StorageDeleteParamsSchema,
  paramTypes: [
    {
      name: "key",
      type: "string",
      required: true,
      description: "Storage key",
    },
  ],
  returns: z.null(),
  returnDoc: "null",
  errorCode: "ESTORAGE",
  errorCategory: "storage",
  paramDocs: { key: "Storage key" },
  handler: async (params) => {
    localStorage.removeItem(params.key);
    return null;
  },
});

registerTool({
  action: "storage_list",
  namespace: "storage",
  description: "List all keys in local storage",
  params: StorageListParamsSchema,
  paramTypes: [],
  returns: z.array(z.string()),
  returnDoc: "string[]",
  errorCode: "ESTORAGE",
  errorCategory: "storage",
  paramDocs: {},
  handler: async () => {
    const keys: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key) keys.push(key);
    }
    return keys;
  },
});
