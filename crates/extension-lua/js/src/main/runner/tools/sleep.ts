// Sleep tool — pause execution for a specified duration

import { z } from "zod";
import { registerTool } from "../../../shared/tool-registry.js";
import { SleepParamsSchema } from "../../../shared/schemas.js";

registerTool({
  action: "sleep",
  namespace: "runtime",
  description: "Sleep for a specified duration",
  params: SleepParamsSchema,
  paramTypes: [
    {
      name: "duration",
      type: "number",
      required: true,
      description: "Duration in milliseconds",
    },
  ],
  returns: z.null(),
  returnDoc: "null",
  errorCode: "ESLEEP",
  errorCategory: "runtime",
  paramDocs: { duration: "Duration in milliseconds" },
  handler: async (params) => {
    await new Promise((resolve) =>
      setTimeout(resolve, Number(params.duration)),
    );
    return null;
  },
});
