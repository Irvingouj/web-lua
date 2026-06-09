import type { z } from "zod";

export interface Command {
  action: string;
  params: unknown;
}

export type AsyncError = {
  message: string;
  code: string;
  category?: string;
};

export type AsyncResponse<T = unknown> =
  | { ok: true; value: T }
  | { ok: false; error: AsyncError };

export type ToolSource =
  | "rust_core"
  | "extension_worker"
  | "main_thread"
  | "content_script"
  | "sidepanel";

export type ToolTransport =
  | "rust_sync"
  | "host_async"
  | "extension_worker"
  | "chrome_api"
  | "active_tab_content_script"
  | "specific_tab_content_script"
  | "sidepanel_dom";

export interface ToolDocParam {
  name: string;
  type: string;
  required: boolean;
  description: string;
}

export interface ToolReturnDoc {
  type: string;
  description: string;
}

export interface ToolDoc {
  action: string;
  namespace: string;
  name: string;
  publicName: string;
  localName?: string;
  source: ToolSource;
  transport: ToolTransport;
  description: string;
  params: ToolDocParam[];
  returns: ToolReturnDoc;
  errorCode: string;
  errorCategory: string;
}

export interface ToolDefinition<P, R, I = P, O = R> {
  action: string;
  namespace: string;
  name: string;
  publicName: string;
  localName?: string;
  source: ToolSource;
  transport: ToolTransport;
  description: string;
  params: z.ZodType<P, z.ZodTypeDef, I>;
  returns: z.ZodType<R, z.ZodTypeDef, O>;
  handler: (params: P) => R | Promise<R>;
  paramDocs: Record<string, string>;
  paramTypes: ToolDocParam[];
  returnType?: string;
  returnDoc: string;
  errorCode: string;
  errorCategory: string;
  allowShadowing?: boolean;
}

export interface ToolRegistrationDoc {
  namespace: string;
  name: string;
  publicName: string;
  localName?: string;
  source: ToolSource;
  transport: ToolTransport;
  description: string;
  params?: ToolDocParam[];
  returnType?: string;
  returnDoc?: string;
  errorCode?: string;
  errorCategory?: string;
  allowShadowing?: boolean;
}

export interface DoctestTool {
  action: string;
  script: string;
}

export type ToolInput<P, R, I = P, O = R> = Partial<
  Omit<ToolDefinition<P, R, I, O>, "action" | "params" | "returns" | "handler">
> & {
  action: string;
  params: z.ZodType<P, z.ZodTypeDef, I>;
  returns: z.ZodType<R, z.ZodTypeDef, O>;
  handler: (params: P) => R | Promise<R>;
};
