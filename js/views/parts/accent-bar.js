import { h } from "../../dom.js";

const KEYS = ["é", "è", "ê", "ë", "à", "â", "ç", "î", "ï", "ô", "û", "ù", "œ", "«", "»"];
const NBSP = " ";

/**
 * A row of French characters that types into the last focused field.
 * Shift-click inserts the capital. Buttons don't steal focus from the field.
 * @param {() => HTMLInputElement|HTMLTextAreaElement|null} getTarget
 */
export function accentBar(getTarget) {
  return h(
    "div",
    { class: "accent-bar", role: "toolbar", "aria-label": "Insert French characters (shift-click for capitals)" },
    KEYS.map((ch) =>
      h(
        "button",
        {
          type: "button",
          class: "accent-key",
          lang: "fr",
          title: ch === "«" || ch === "»" ? "Guillemet (with a non-breaking space)" : `${ch} · shift: ${ch.toUpperCase()}`,
          onmousedown: (e) => e.preventDefault(),
          onclick: (e) => {
            const text = ch === "«" ? `«${NBSP}` : ch === "»" ? `${NBSP}»` : e.shiftKey ? ch.toUpperCase() : ch;
            insertAtCaret(getTarget(), text);
          },
        },
        ch,
      ),
    ),
  );
}

export function insertAtCaret(el, text) {
  if (!el) return;
  el.focus();
  const start = el.selectionStart ?? el.value.length;
  const end = el.selectionEnd ?? start;
  el.setRangeText(text, start, end, "end");
  el.dispatchEvent(new Event("input", { bubbles: true }));
}

/** Track the last focused text field inside `root`, for the accent bar to type into. */
export function lastFocusedField(root, fallback = null) {
  let last = fallback;
  root.addEventListener("focusin", (e) => {
    if (e.target.matches("textarea, input[type=text]")) last = e.target;
  });
  return () => last;
}
