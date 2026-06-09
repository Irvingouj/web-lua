// Network tools — fetch and fetch_dom

import { registerTool, type AsyncResponse } from "../../../shared/tool-registry.js";
import {
  FetchDomParamsSchema,
  FetchParamsSchema,
} from "../../../shared/schemas.js";
import { z } from "zod";
import { formatFetchError, performFetch } from "../runtime.js";

async function handleFetch(
  params: z.infer<typeof FetchParamsSchema>,
): Promise<AsyncResponse<{
  status: number;
  ok: boolean;
  headers: Record<string, string>;
  body: string;
}>> {
  const { url, method, headers, body, timeout } = params;
  const timeoutMs = Number(timeout) || 30_000;
  try {
    const {
      response,
      body: responseBody,
      headers: responseHeaders,
    } = await performFetch(
      url,
      {
        method: method || "GET",
        headers:
          typeof headers === "object" && headers !== null
            ? (headers as Record<string, string>)
            : {},
        body:
          body !== null && body !== undefined
            ? typeof body === "string"
              ? body
              : String(body)
            : undefined,
      },
      timeoutMs,
    );
    return {
      ok: true,
      value: {
        status: response.status,
        ok: response.ok,
        headers: responseHeaders,
        body: responseBody,
      },
    };
  } catch (err) {
    return formatFetchError(err, timeoutMs);
  }
}

async function handleFetchDom(
  params: z.infer<typeof FetchDomParamsSchema>,
): Promise<AsyncResponse<{
  status: number;
  ok: boolean;
  headers: Record<string, string>;
  body: string;
  matches: Array<{ tag: string; text: string }>;
}>> {
  const { url, selector, max_text } = params;
  const maxTextNum = Number(max_text ?? 500);
  try {
    const {
      response,
      body: responseBody,
      headers: responseHeaders,
    } = await performFetch(url, {}, 30_000);
    const parser = new DOMParser();
    const doc = parser.parseFromString(responseBody, "text/html");
    const matches: Array<{ tag: string; text: string }> = [];
    if (selector) {
      const elements = doc.querySelectorAll(selector);
      elements.forEach((el) => {
        const text = el.textContent?.trim().slice(0, maxTextNum) || "";
        matches.push({ tag: el.tagName.toLowerCase(), text });
      });
    }
    return {
      ok: true,
      value: {
        status: response.status,
        ok: response.ok,
        headers: responseHeaders,
        body: responseBody,
        matches,
      },
    };
  } catch (err) {
    return formatFetchError(err, 30_000);
  }
}

async function handleFetchWrapped(
  params: z.infer<typeof FetchParamsSchema>,
): Promise<{
  status: number;
  ok: boolean;
  headers: Record<string, string>;
  body: string;
}> {
  const result = await handleFetch(params);
  if (result.ok) {
    return result.value;
  }
  const error = new Error(result.error.message);
  (error as unknown as Record<string, unknown>).code = result.error.code;
  (error as unknown as Record<string, unknown>).category =
    result.error.category;
  throw error;
}

async function handleFetchDomWrapped(
  params: z.infer<typeof FetchDomParamsSchema>,
): Promise<{
  status: number;
  ok: boolean;
  headers: Record<string, string>;
  body: string;
  matches: Array<{ tag: string; text: string }>;
}> {
  const result = await handleFetchDom(params);
  if (result.ok) {
    return result.value;
  }
  const error = new Error(result.error.message);
  (error as unknown as Record<string, unknown>).code = result.error.code;
  (error as unknown as Record<string, unknown>).category =
    result.error.category;
  throw error;
}

registerTool({
  action: "fetch",
  namespace: "network",
  description: "Fetch a URL",
  params: FetchParamsSchema,
  paramTypes: [
    {
      name: "url",
      type: "string",
      required: true,
      description: "URL to fetch",
    },
    {
      name: "method",
      type: "string",
      required: false,
      description: "HTTP method",
    },
    {
      name: "headers",
      type: "object",
      required: false,
      description: "Request headers",
    },
    {
      name: "body",
      type: "string | null",
      required: true,
      description: "Request body",
    },
    {
      name: "timeout",
      type: "number",
      required: false,
      description: "Timeout in milliseconds",
    },
  ],
  returns: z.object({
    status: z.number(),
    ok: z.boolean(),
    headers: z.record(z.string()),
    body: z.string(),
  }),
  returnDoc: "FetchValue",
  errorCode: "EFETCH",
  errorCategory: "network",
  paramDocs: {
    url: "URL to fetch",
    method: "HTTP method",
    headers: "Request headers",
    body: "Request body",
    timeout: "Timeout in milliseconds",
  },
  handler: handleFetchWrapped,
});

registerTool({
  action: "fetch_dom",
  namespace: "network",
  description: "Fetch a URL and extract DOM elements",
  params: FetchDomParamsSchema,
  paramTypes: [
    {
      name: "url",
      type: "string",
      required: true,
      description: "URL to fetch",
    },
    {
      name: "selector",
      type: "string",
      required: true,
      description: "CSS selector",
    },
    {
      name: "max_text",
      type: "number",
      required: true,
      description: "Max text length per match",
    },
  ],
  returns: z.object({
    status: z.number(),
    ok: z.boolean(),
    headers: z.record(z.string()),
    body: z.string(),
    matches: z.array(z.object({ tag: z.string(), text: z.string() })),
  }),
  returnDoc: "FetchDomValue",
  errorCode: "EFETCH",
  errorCategory: "network",
  paramDocs: {
    url: "URL to fetch",
    selector: "CSS selector",
    max_text: "Max text length per match",
  },
  handler: handleFetchDomWrapped,
});
