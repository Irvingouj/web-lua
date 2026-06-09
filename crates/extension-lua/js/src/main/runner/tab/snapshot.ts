/// <reference types="chrome" />
// Inline snapshot helper for executeInTab
// All functions are inlined into the returned closure so they survive
// Chrome scripting.executeScript serialization into the page MAIN world.

export function createInlineSnapshotFunc(): (maxNodesArg: unknown, interactiveOnlyArg: unknown) => unknown {
  return function (maxNodesArg: unknown, interactiveOnlyArg: unknown) {
    const maxNodes = typeof maxNodesArg === "number" ? maxNodesArg : 500;
    const interactiveOnly = typeof interactiveOnlyArg === "boolean" ? interactiveOnlyArg : false;

    function getAccessibleRole(el: Element): string {
      const tag = el.tagName.toLowerCase();
      const ariaRole = el.getAttribute("role");
      if (ariaRole) return ariaRole;
      if (
        tag === "button" ||
        (tag === "input" && (el as HTMLInputElement).type === "submit")
      )
        return "button";
      if (tag === "a") return "link";
      if (tag === "input") {
        const type = (el as HTMLInputElement).type;
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
      if (
        tag === "h1" ||
        tag === "h2" ||
        tag === "h3" ||
        tag === "h4" ||
        tag === "h5" ||
        tag === "h6"
      )
        return "heading";
      if (tag === "li") return "listitem";
      if (tag === "ul" || tag === "ol") return "list";
      if (tag === "table") return "table";
      if (tag === "tr") return "row";
      if (tag === "td" || tag === "th") return "cell";
      if (tag === "nav") return "navigation";
      if (tag === "main") return "main";
      if (tag === "article") return "article";
      if (tag === "section") return "region";
      if (tag === "aside") return "complementary";
      if (tag === "form") return "form";
      if (tag === "dialog" || tag === "modal") return "dialog";
      if (tag === "figure") return "figure";
      if (tag === "figcaption") return "caption";
      if (el.getAttribute("onclick") || (el as HTMLElement).onclick)
        return "button";
      return "generic";
    }

    function getAccessibleName(el: Element): string {
      const ariaLabel = el.getAttribute("aria-label");
      if (ariaLabel) return ariaLabel;
      const labelledBy = el.getAttribute("aria-labelledby");
      if (labelledBy) {
        const labelEl = document.getElementById(labelledBy);
        if (labelEl) return labelEl.textContent?.slice(0, 60) || "";
      }
      const tag = el.tagName.toLowerCase();
      if (tag === "img") {
        const alt = el.getAttribute("alt");
        if (alt) return alt;
      }
      const title = (el as HTMLElement).title;
      if (title) return title;
      const role = getAccessibleRole(el);
      if (
        role !== "generic" &&
        role !== "list" &&
        role !== "table" &&
        role !== "row" &&
        role !== "region" &&
        role !== "navigation" &&
        role !== "main"
      ) {
        const text = el.textContent?.trim().slice(0, 60) || "";
        return text;
      }
      return "";
    }

    function shouldInclude(el: Element): boolean {
      const role = getAccessibleRole(el);
      if (role === "generic") return false;
      if (role === "presentation" || role === "none") return false;
      if ((el as HTMLElement).hidden) return false;
      const style = window.getComputedStyle(el);
      if (style.display === "none" || style.visibility === "hidden")
        return false;
      return true;
    }

    function isInteractiveRole(role: string): boolean {
      return (
        role === "button" ||
        role === "link" ||
        role === "textbox" ||
        role === "checkbox" ||
        role === "radio" ||
        role === "combobox"
      );
    }

    let nextRefId = 1;
    const nodes: Array<{
      refId: number;
      role: string;
      tag: string;
      name?: string;
    }> = [];
    const lines: string[] = [];

    function traverse(el: Element, depth: number) {
      if (nodes.length >= maxNodes) return;
      const tag = el.tagName.toLowerCase();
      if (
        tag === "script" ||
        tag === "style" ||
        tag === "noscript" ||
        tag === "template"
      )
        return;
      const included = shouldInclude(el);
      let currentDepth = depth;
      if (included) {
        const role = getAccessibleRole(el);
        if (!interactiveOnly || isInteractiveRole(role)) {
          const refId = nextRefId++;
          el.setAttribute("data-ref-id", String(refId));
          const name = getAccessibleName(el);
          const node: {
            refId: number;
            role: string;
            tag: string;
            name?: string;
          } = {
            refId,
            role,
            tag,
          };
          if (name) node.name = name;
          nodes.push(node);
          const indent = "  ".repeat(depth);
          const parts: string[] = [`${indent}- ${role}`];
          if (name) parts.push(`"${name.replace(/"/g, '\\"')}"`);
          parts.push(`[ref=${refId}]`);
          lines.push(parts.join(" "));
          currentDepth = depth + 1;
        }
      }
      for (const child of el.children) {
        traverse(child, currentDepth);
      }
    }

    if (document.body) {
      traverse(document.body, 0);
    }

    const header = [
      `URL: ${window.location.href}`,
      `Title: ${document.title}`,
      "",
    ];
    return {
      text: header.concat(lines).join("\n"),
      nodes,
      elements: nodes,
      url: window.location.href,
      title: document.title,
      viewport: {
        width: window.innerWidth,
        height: window.innerHeight,
      },
    };
  };
}
