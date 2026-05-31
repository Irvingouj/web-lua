export interface Bridge {
  runnerAction: string;
  contentScriptAction: string;
  description: string;
}

export const bridges: Bridge[] = [
  // page_* actions
  {
    runnerAction: "page_click",
    contentScriptAction: "click",
    description: "Click element",
  },
  {
    runnerAction: "page_fill",
    contentScriptAction: "fill",
    description: "Fill input",
  },
  {
    runnerAction: "page_type",
    contentScriptAction: "type",
    description: "Type text",
  },
  {
    runnerAction: "page_append",
    contentScriptAction: "append",
    description: "Append text",
  },
  {
    runnerAction: "page_press",
    contentScriptAction: "press",
    description: "Press key",
  },
  {
    runnerAction: "page_select",
    contentScriptAction: "select",
    description: "Select option",
  },
  {
    runnerAction: "page_check",
    contentScriptAction: "check",
    description: "Check checkbox",
  },
  {
    runnerAction: "page_hover",
    contentScriptAction: "hover",
    description: "Hover element",
  },
  {
    runnerAction: "page_unhover",
    contentScriptAction: "unhover",
    description: "Unhover element",
  },
  {
    runnerAction: "page_scroll",
    contentScriptAction: "scroll",
    description: "Scroll page",
  },
  {
    runnerAction: "page_scroll_to",
    contentScriptAction: "scrollTo",
    description: "Scroll to element",
  },
  {
    runnerAction: "page_dblclick",
    contentScriptAction: "dblclick",
    description: "Double click element",
  },
  {
    runnerAction: "page_back",
    contentScriptAction: "back",
    description: "Go back",
  },

  // tab_* actions
  {
    runnerAction: "tab_click",
    contentScriptAction: "click",
    description: "Click element in tab",
  },
  {
    runnerAction: "tab_fill",
    contentScriptAction: "fill",
    description: "Fill input in tab",
  },
  {
    runnerAction: "tab_type",
    contentScriptAction: "type",
    description: "Type text in tab",
  },
  {
    runnerAction: "tab_scroll_to",
    contentScriptAction: "scrollTo",
    description: "Scroll to element in tab",
  },
  {
    runnerAction: "tab_press",
    contentScriptAction: "press",
    description: "Press key in tab",
  },
  {
    runnerAction: "tab_select",
    contentScriptAction: "select",
    description: "Select option in tab",
  },
  {
    runnerAction: "tab_check",
    contentScriptAction: "check",
    description: "Check checkbox in tab",
  },
  {
    runnerAction: "tab_hover",
    contentScriptAction: "hover",
    description: "Hover element in tab",
  },
  {
    runnerAction: "tab_unhover",
    contentScriptAction: "unhover",
    description: "Unhover element in tab",
  },
  {
    runnerAction: "tab_scroll",
    contentScriptAction: "scroll",
    description: "Scroll page in tab",
  },
  {
    runnerAction: "tab_dblclick",
    contentScriptAction: "dblclick",
    description: "Double click element in tab",
  },
  {
    runnerAction: "tab_back",
    contentScriptAction: "back",
    description: "Go back in tab",
  },
];

export function getContentScriptAction(
  runnerAction: string,
): string | undefined {
  return bridges.find((b) => b.runnerAction === runnerAction)
    ?.contentScriptAction;
}
