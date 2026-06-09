// Clipboard tools — read/write system clipboard

import { registerTool } from "../../../shared/tool-registry.js";
import {
  ClipboardReadParamsSchema,
  ClipboardWriteParamsSchema,
} from "../../../shared/schemas.js";
import { z } from "zod";

registerTool({
  action: "clipboard_read",
  namespace: "clipboard",
  description: "Read text from the clipboard",
  params: ClipboardReadParamsSchema,
  paramTypes: [],
  returns: z.string(),
  returnDoc: "string",
  errorCode: "ECLIPBOARD",
  errorCategory: "permission",
  paramDocs: {},
  handler: async () => navigator.clipboard.readText(),
});

registerTool({
  action: "clipboard_write",
  namespace: "clipboard",
  description: "Write text to the clipboard",
  params: ClipboardWriteParamsSchema,
  paramTypes: [
    {
      name: "text",
      type: "string",
      required: true,
      description: "Text to write",
    },
  ],
  returns: z.null(),
  returnDoc: "null",
  errorCode: "ECLIPBOARD",
  errorCategory: "permission",
  paramDocs: { text: "Text to write" },
  handler: async (
    params: { text: string } | { value: string } | [string],
  ) => {
    const text = Array.isArray(params)
      ? params[0]
      : "text" in params
        ? params.text
        : params.value;
    await navigator.clipboard.writeText(text);
    return null;
  },
});
