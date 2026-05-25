// Host handler registry for web-lua
// Provides registerHostHandler / registerHostHandlers for the optional
// host.call() extension point.

const hostHandlers: Record<string, (params: unknown) => Promise<unknown>> = {};

export function registerHostHandler(
  action: string,
  handler: (params: unknown) => Promise<unknown>,
) {
  hostHandlers[action] = handler;
}

export function registerHostHandlers(
  handlers: Record<string, (params: unknown) => Promise<unknown>>,
) {
  Object.assign(hostHandlers, handlers);
}
