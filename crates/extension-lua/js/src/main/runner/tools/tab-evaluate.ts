import { z } from "zod";
import { registerTool } from "../../../shared/tool-registry.js";
import { TabEvaluateParamsSchema } from "../../../shared/schemas.js";

registerTool({
  action: "tab_evaluate",
  namespace: "tab",
  description: "Evaluate JavaScript in a target tab",
  params: TabEvaluateParamsSchema,
  paramTypes: [
    {
      name: "tabId",
      type: "number",
      required: true,
      description: "Target tab ID",
    },
    {
      name: "script",
      type: "string",
      required: true,
      description: "JavaScript code to evaluate",
    },
  ],
  returns: z.unknown(),
  returnDoc: "any",
  errorCode: "ETAB",
  errorCategory: "tab",
  paramDocs: {
    tabId: "Target tab ID",
    script: "JavaScript code to evaluate",
  },
  transport: "chrome_api",
  handler: async (params) => {
    const targetTab = Number(params.tabId);
    const codeStr = String(params.script);
    const evalFunc = (code: string) => {
      // biome-ignore lint/security/noGlobalEval: Chrome executeScript context only supports eval, not new Function()
      return eval(code);
    };
    const results = await chrome.scripting.executeScript({
      target: { tabId: targetTab },
      func: evalFunc,
      args: [codeStr],
      world: "MAIN",
    });
    if (results?.[0]) {
      const first = results[0] as (typeof results)[0] & { error?: unknown };
      if (first.error) {
        const error = new Error(String(first.error));
        (error as unknown as Record<string, unknown>).code =
          "E_SCRIPT_EXECUTION";
        (error as unknown as Record<string, unknown>).category = "script";
        throw error;
      }
      return first.result;
    }
    return null;
  },
});
