// The two automatic EaseVoice behaviours. Each one starts listening when called and returns a
// function that stops it. They take the window and document so they can be tested without a browser.

type Win = Pick<Window, "addEventListener" | "removeEventListener" | "setTimeout" | "clearTimeout" | "getSelection">;
type Doc = Pick<Document, "addEventListener" | "removeEventListener" | "hidden" | "activeElement">;

/** Selections shorter than this are almost always a stray click, not something to read. */
const MIN_CHARACTERS = 2;
/** Touch and keyboard selections settle over several events; wait this long after the last one. */
const SETTLE_MS = 600;

const EDITABLE = 'input, textarea, select, [contenteditable=""], [contenteditable="true"]';

/** Never read back what someone is typing (form fields, editors): it may be personal. */
function insideEditableField(selection: Selection, doc: Doc): boolean {
  // Browsers report a selection inside <input>/<textarea> against the surrounding element,
  // so the focused element is the reliable signal; the anchor covers rich-text editors.
  if (doc.activeElement?.closest?.(EDITABLE)) return true;
  const node = selection.anchorNode;
  const element = node && (node.nodeType === 1 ? (node as Element) : node.parentElement);
  return Boolean(element?.closest?.(EDITABLE));
}

/**
 * Read text aloud as soon as someone highlights it, on any page.
 * Mouse: when the button is released. Touch and keyboard: once the selection stops changing.
 * The same selection is never read twice in a row; clearing it lets the same words be read again.
 */
export function watchSelection(win: Win, doc: Doc, onText: (text: string) => void): () => void {
  let pointerDown = false;
  let lastRead = "";
  let settle: ReturnType<Window["setTimeout"]> | undefined;

  const readSelection = () => {
    const selection = win.getSelection();
    const text = selection?.toString().replace(/\s+/g, " ").trim() ?? "";
    if (!selection || text.length < MIN_CHARACTERS) {
      lastRead = "";
      return;
    }
    if (text === lastRead || insideEditableField(selection, doc)) return;
    lastRead = text;
    onText(text);
  };

  const onPointerDown = () => {
    pointerDown = true;
  };
  const onPointerUp = () => {
    pointerDown = false;
    win.clearTimeout(settle);
    win.setTimeout(readSelection, 0); // let the browser finish updating the selection first
  };
  const onSelectionChange = () => {
    win.clearTimeout(settle);
    if (pointerDown) return; // still dragging with the mouse: wait for pointerup
    settle = win.setTimeout(readSelection, SETTLE_MS);
  };

  doc.addEventListener("pointerdown", onPointerDown, true);
  doc.addEventListener("pointerup", onPointerUp, true);
  doc.addEventListener("selectionchange", onSelectionChange);
  return () => {
    win.clearTimeout(settle);
    doc.removeEventListener("pointerdown", onPointerDown, true);
    doc.removeEventListener("pointerup", onPointerUp, true);
    doc.removeEventListener("selectionchange", onSelectionChange);
  };
}

const ACTIVITY_EVENTS = ["pointerdown", "pointermove", "keydown", "wheel", "scroll", "touchstart"] as const;

/**
 * Call onIdle once after `seconds` with no mouse, keyboard, touch or scrolling.
 * It does not repeat until the person is active again and then idle again, and it waits
 * while the browser tab is hidden so a background tab never starts talking.
 */
export function watchIdle(win: Win, doc: Doc, seconds: number, onIdle: () => void): () => void {
  let timer: ReturnType<Window["setTimeout"]> | undefined;
  let prompted = false;

  const arm = () => {
    win.clearTimeout(timer);
    timer = win.setTimeout(() => {
      if (doc.hidden) return; // re-armed by the next activity or when the tab is shown again
      prompted = true;
      onIdle();
    }, seconds * 1000);
  };
  const onActivity = () => {
    prompted = false;
    arm();
  };
  const onVisibility = () => {
    if (!doc.hidden && !prompted) arm();
  };

  ACTIVITY_EVENTS.forEach((name) => win.addEventListener(name, onActivity, { capture: true, passive: true }));
  doc.addEventListener("visibilitychange", onVisibility);
  arm();
  return () => {
    win.clearTimeout(timer);
    ACTIVITY_EVENTS.forEach((name) => win.removeEventListener(name, onActivity, { capture: true }));
    doc.removeEventListener("visibilitychange", onVisibility);
  };
}
