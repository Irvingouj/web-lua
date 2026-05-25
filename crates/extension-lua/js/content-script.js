// Content script for Lua Notebook extension
// Runs in isolated world, handles tab.* operations via chrome.runtime.onMessage.

function getElementByRefId(refId) {
  return document.querySelector(`[data-ref-id='${refId}']`);
}

function asRecord(obj) {
  return typeof obj === "object" && obj !== null && !Array.isArray(obj)
    ? obj
    : {};
}

function getStringParam(params, key) {
  const val = asRecord(params)[key];
  return typeof val === "string" ? val : "";
}

function getNumberParam(params, key, fallback) {
  const val = asRecord(params)[key];
  return typeof val === "number" ? val : fallback;
}

function getElementRole(el) {
  const tag = el.tagName.toLowerCase();
  const ariaRole = el.getAttribute("role");
  if (ariaRole) return ariaRole;
  if (
    tag === "button" ||
    (tag === "input" && el.type === "submit")
  )
    return "button";
  if (tag === "a") return "link";
  if (tag === "input") {
    const type = el.type;
    if (
      type === "text" ||
      type === "email" ||
      type === "password" ||
      type === "search"
    )
      return "textbox";
    if (type === "checkbox") return "checkbox";
    if (type === "radio") return "radio";
    if (type === "submit" || type === "button") return "button";
  }
  if (tag === "textarea") return "textbox";
  if (tag === "select") return "combobox";
  if (tag === "img") return "img";
  if (tag === "h1" || tag === "h2" || tag === "h3" || tag === "h4")
    return "heading";
  return "generic";
}

// ─── DOM snapshot (inline JS fallback) ───────────────────────────

function inlineSnapshot(maxNodes) {
  const all = document.body.querySelectorAll("*");
  const nodes = [];
  const lines = [];
  for (let i = 0; i < all.length && nodes.length < maxNodes; i++) {
    const el = all[i];
    const tag = el.tagName.toLowerCase();
    if (tag === "script" || tag === "style" || tag === "noscript") continue;
    const role = getElementRole(el);
    if (role === "generic") continue;
    const refId = i + 1;
    el.setAttribute("data-ref-id", String(refId));
    const node = {
      refId,
      role,
      tag,
    };
    const name =
      el.ariaLabel ||
      el.title ||
      el.textContent?.slice(0, 30) ||
      "";
    if (name) node.name = name;
    nodes.push(node);
    const parts = [`[${refId}]`, role];
    if (name) parts.push(`"${name.replace(/"/g, '\\"')}"`);
    lines.push(parts.join(" "));
  }
  return {
    data: {
      nodes,
      url: window.location.href,
      title: document.title,
      viewport: {
        width: window.innerWidth,
        height: window.innerHeight,
      },
    },
    text: lines.join("\n"),
  };
}

const handlers = {
  click: (params) => {
    const refId = getStringParam(params, "refId");
    const el = refId ? getElementByRefId(refId) : null;
    if (!el) throw new Error(`Element ${refId} not found`);
    el.click();
    return null;
  },

  fill: (params) => {
    const refId = getStringParam(params, "refId");
    const value = getStringParam(params, "value");
    const el = refId ? getElementByRefId(refId) : null;
    if (!el) throw new Error(`Element ${refId} not found`);
    if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
      el.value = value;
      const ev = new InputEvent("input", { bubbles: true });
      el.dispatchEvent(ev);
      return null;
    }
    throw new Error("Element is not an input");
  },

  scrollTo: (params) => {
    const refId = getStringParam(params, "refId");
    const x = getNumberParam(params, "x", 0);
    const y = getNumberParam(params, "y", 0);
    if (refId) {
      const el = getElementByRefId(refId);
      if (el) {
        el.scrollIntoView({ behavior: "smooth" });
        return true;
      }
      throw new Error(`Element ${refId} not found`);
    }
    window.scrollTo({ top: y, left: x, behavior: "smooth" });
    return true;
  },

  evaluate: (params) => {
    const code = getStringParam(params, "code");
    // biome-ignore lint/security/noGlobalEval: intentional eval for tab.evaluate API
    return eval(code);
  },

  back: () => {
    window.history.back();
    return true;
  },

  ping: () => {
    return { ok: true };
  },

  snapshot: async (params) => {
    const obj = asRecord(params);
    const maxNodes =
      typeof obj.max_nodes === "number" ? obj.max_nodes : 500;
    return inlineSnapshot(maxNodes);
  },

  fetch: async (params) => {
    const obj = asRecord(params);
    const url = obj.url;
    const method = (obj.method || "GET").toUpperCase();
    const headers = obj.headers || {};
    const body = obj.body ?? null;
    const timeout = typeof obj.timeout === "number" ? obj.timeout : 30_000;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout || 30_000);
    try {
      const fetchOpts = {
        method: method || "GET",
        headers:
          typeof headers === "object" && headers !== null ? headers : {},
        signal: controller.signal,
      };
      if (body !== null && body !== undefined) {
        fetchOpts.body = typeof body === "string" ? body : String(body);
      }
      const resp = await fetch(url, fetchOpts);
      clearTimeout(timeoutId);
      const text = await resp.text();
      return {
        status: resp.status,
        ok: resp.ok,
        headers: Object.fromEntries(resp.headers.entries()),
        body: text,
      };
    } catch (e) {
      clearTimeout(timeoutId);
      throw e;
    }
  },
};

chrome.runtime.onMessage.addListener((request, _sender, sendResponse) => {
  const action = request?.action;
  const handler = handlers[action];
  if (!handler) {
    sendResponse({
      ok: false,
      error: `Unknown content script action: ${action}`,
    });
    return false;
  }

  try {
    const result = handler(request.params);
    if (result instanceof Promise) {
      result
        .then((value) => sendResponse(value))
        .catch((err) => {
          const msg = err instanceof Error ? err.message : String(err);
          sendResponse({ ok: false, error: msg || String(err) });
        });
      return true;
    }
    sendResponse(result);
    return false;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    sendResponse({ ok: false, error: msg || String(err) });
    return false;
  }
});
