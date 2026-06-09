// Sidepanel local handlers — operate on the extension popup/sidepanel DOM

import {
  collectDocument,
  formatSnapshot,
  init as initDomSnapshot,
} from "@pi-oxide/dom-semantic-tree";
import { createError, toErrorMessage } from "../../../shared/errors.js";

let domSnapshotReady: Promise<void> | null = null;

function ensureDomSnapshot(): Promise<void> {
  if (!domSnapshotReady) {
    domSnapshotReady = initDomSnapshot();
  }
  return domSnapshotReady;
}

async function handleDomSnapshot(
  params: { max_nodes: number | bigint; interactive_only: boolean },
): Promise<
  | { ok: true; value: { data: unknown; text: string } }
  | { ok: false; error: { message: string; code: string } }
> {
  try {
    await ensureDomSnapshot();
    const { max_nodes, interactive_only } = params;
    const options = {
      maxNodes: Number(max_nodes),
      interactiveOnly: interactive_only,
    };
    const snap = collectDocument(options);
    const text = formatSnapshot(snap, "compact-text");
    return {
      ok: true,
      value: { data: snap, text },
    };
  } catch (err: unknown) {
    const message = toErrorMessage(err);
    return {
      ok: false,
      error: { message: message || String(err), code: "E_SNAPSHOT" },
    };
  }
}

function getElementByRefId(refId: string): Element | null {
  return document.querySelector(`[data-ref-id='${CSS.escape(refId)}']`);
}

export function resolveElement(params: string | { refId: string }): HTMLElement {
  const refId = typeof params === "string" ? params : params.refId;
  const element = getElementByRefId(refId);
  if (!element) {
    throw new Error(`Element ${refId} not found`);
  }
  return element as HTMLElement;
}

export function dispatchEventOnElement<E extends Event>(
  refId: string,
  eventType: string,
  EventClass: new (type: string, init?: EventInit) => E,
): void {
  const element = resolveElement({ refId });
  const ev = new EventClass(eventType, { bubbles: true });
  element.dispatchEvent(ev);
}

export function setInputValue(
  refId: string,
  text: string,
  mode: "set" | "append",
): void {
  const element = resolveElement({ refId });
  if (
    element instanceof HTMLInputElement ||
    element instanceof HTMLTextAreaElement
  ) {
    element.value = mode === "append" ? element.value + text : text;
  } else {
    throw new Error("Element is not an input");
  }
  const ev = new InputEvent("input", { bubbles: true });
  element.dispatchEvent(ev);
}

async function runSnapshot(
  params: { max_nodes?: number; interactive_only?: boolean },
): Promise<{ data: unknown; text: string }> {
  const result = await handleDomSnapshot({
    max_nodes: params.max_nodes ?? 500,
    interactive_only: params.interactive_only ?? false,
  });
  if (!result.ok) {
    throw createError(result.error.message, result.error.code);
  }
  return result.value;
}

export function handleSidepanelClick(
  params: string | { refId: string },
): null {
  const element = resolveElement(params);
  element.click();
  return null;
}

export function handleSidepanelDblClick(
  params: string | { refId: string },
): null {
  const element = resolveElement(params);
  const ev = new MouseEvent("dblclick", { bubbles: true });
  element.dispatchEvent(ev);
  return null;
}

export function handleSidepanelHover(
  params: string | { refId: string },
): null {
  const element = resolveElement(params);
  const ev = new MouseEvent("mouseenter", { bubbles: true });
  element.dispatchEvent(ev);
  return null;
}

export function handleSidepanelUnhover(): null {
  const ev = new MouseEvent("mouseleave", { bubbles: true });
  document.body.dispatchEvent(ev);
  return null;
}

export function handleSidepanelFill(params: {
  refId: string;
  value?: string;
}): null {
  setInputValue(params.refId, params.value ?? "", "set");
  return null;
}

export function handleSidepanelType(params: {
  refId: string;
  text?: string;
}): null {
  setInputValue(params.refId, params.text ?? "", "append");
  return null;
}

export function handleSidepanelAppend(params: {
  refId: string;
  text?: string;
}): null {
  setInputValue(params.refId, params.text ?? "", "append");
  return null;
}

export function handleSidepanelPress(params: { key?: string }): null {
  const key = params.key ?? "";
  const evDown = new KeyboardEvent("keydown", { key, bubbles: true });
  document.dispatchEvent(evDown);
  const evUp = new KeyboardEvent("keyup", { key, bubbles: true });
  document.dispatchEvent(evUp);
  return null;
}

export function handleSidepanelSelect(params: {
  refId: string;
  value?: string;
}): null {
  const element = resolveElement(params);
  if (element instanceof HTMLSelectElement) {
    element.value = params.value ?? "";
    element.dispatchEvent(new Event("change", { bubbles: true }));
  } else {
    throw new Error("Element is not a select");
  }
  return null;
}

export function handleSidepanelCheck(params: {
  refId: string;
  checked?: boolean;
}): null {
  const element = resolveElement(params);
  if (element instanceof HTMLInputElement && element.type === "checkbox") {
    element.checked = params.checked ?? true;
    element.dispatchEvent(new Event("change", { bubbles: true }));
  } else {
    throw new Error("Element is not a checkbox");
  }
  return null;
}

export function handleSidepanelScroll(params: {
  direction?: string;
  amount?: number;
}): null {
  const direction = params.direction ?? "down";
  const amount = params.amount ?? 300;
  window.scrollBy({
    top: direction === "down" ? amount : -amount,
    behavior: "smooth",
  });
  return null;
}

export function handleSidepanelScrollTo(
  params: string | { refId?: string; x?: number; y?: number },
): null {
  if (typeof params === "string") {
    const element = resolveElement(params);
    element.scrollIntoView({ behavior: "smooth" });
  } else if (params.refId) {
    const element = resolveElement({ refId: params.refId });
    element.scrollIntoView({ behavior: "smooth" });
  } else {
    window.scrollTo({
      top: params.y ?? 0,
      left: params.x ?? 0,
      behavior: "smooth",
    });
  }
  return null;
}

export function handleSidepanelUrl(): string {
  return window.location.href;
}

export function handleSidepanelTitle(): string {
  return document.title;
}

export async function handleSidepanelWait(params: {
  duration: number;
}): Promise<boolean> {
  await new Promise((resolve) => setTimeout(resolve, Number(params.duration)));
  return true;
}

export async function handleSidepanelSnapshot(params: {
  max_nodes?: number;
  interactive_only?: boolean;
}): Promise<string> {
  const value = await runSnapshot(params);
  return value.text;
}

export async function handleSidepanelSnapshotText(params: {
  max_nodes?: number;
  interactive_only?: boolean;
}): Promise<string> {
  return handleSidepanelSnapshot(params);
}

export async function handleSidepanelSnapshotData(params: {
  max_nodes?: number;
  interactive_only?: boolean;
}): Promise<{ data: unknown; text: string }> {
  return runSnapshot(params);
}
