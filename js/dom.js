// Tiny DOM helpers. Text children are always inserted as text nodes (no innerHTML).

const PROPS = new Set(["value", "checked", "disabled", "selected"]);

/**
 * h("a", { href: "#", class: "x", onclick: fn }, "text", childNode)
 * Attributes set to false/null/undefined are skipped. value/checked/disabled are set as properties.
 */
export function h(tag, attrs = {}, ...children) {
  const el = document.createElement(tag);
  for (const [name, value] of Object.entries(attrs ?? {})) {
    if (PROPS.has(name)) {
      el[name] = value;
      continue;
    }
    if (value === false || value == null) continue;
    if (name.startsWith("on") && typeof value === "function") {
      el.addEventListener(name.slice(2), value);
    } else if (value === true) {
      el.setAttribute(name, "");
    } else {
      el.setAttribute(name, String(value));
    }
  }
  for (const child of children.flat(Infinity)) {
    if (child == null || child === false) continue;
    el.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
  return el;
}

/** External link that opens in a new tab; shows an "unverified" tag when verify is true. */
export function extLink(label, url, { verify = false } = {}) {
  const a = h("a", { href: url, target: "_blank", rel: "noopener noreferrer" }, label);
  if (!verify) return a;
  return h(
    "span",
    { class: "link-wrap" },
    a,
    h("span", { class: "tag tag-warn", title: "Link not checked yet. Set verify:false in data/ once you've checked it." }, "unverified"),
  );
}

export function debounce(fn, ms) {
  let t = null;
  const wrapped = (...args) => {
    clearTimeout(t);
    t = setTimeout(() => {
      t = null;
      fn(...args);
    }, ms);
  };
  wrapped.flush = (...args) => {
    if (t) {
      clearTimeout(t);
      t = null;
      fn(...args);
    }
  };
  return wrapped;
}

// Pending autosaves are flushed when the page is hidden or closed.
const pendingFlushes = new Set();
if (typeof window !== "undefined") {
  window.addEventListener("pagehide", () => pendingFlushes.forEach((f) => f()));
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") pendingFlushes.forEach((f) => f());
  });
}

/**
 * Textarea that saves itself while you type (debounced), on blur, and when the page hides.
 * @returns {{el: HTMLElement, textarea: HTMLTextAreaElement, flush: ()=>void}}
 */
export function autosaveField({ id, label, hint, value = "", rows = 4, placeholder, onSave, onInput, lang }) {
  const status = h("span", { class: "save-status", "aria-live": "polite" });
  const textarea = h("textarea", { id, rows, placeholder, lang, spellcheck: lang ? "true" : false, value });
  const save = debounce(() => {
    onSave(textarea.value);
    status.textContent = "Saved";
  }, 400);
  const flush = () => save.flush();
  textarea.addEventListener("input", () => {
    status.textContent = "";
    onInput?.(textarea.value);
    save();
  });
  textarea.addEventListener("blur", flush);
  pendingFlushes.add(flush);
  const el = h(
    "div",
    { class: "field" },
    h("div", { class: "field-head" }, h("label", { for: id }, label), status),
    hint ? h("p", { class: "field-hint muted" }, hint) : null,
    textarea,
  );
  return {
    el,
    textarea,
    flush,
    dispose() {
      flush();
      pendingFlushes.delete(flush);
    },
  };
}

/** Copy text; falls back to a hidden textarea when the Clipboard API isn't available. */
export async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const ta = h("textarea", { value: text, style: "position:fixed;opacity:0", "aria-hidden": "true" });
    document.body.append(ta);
    ta.select();
    let ok = false;
    try {
      ok = document.execCommand("copy");
    } catch {
      ok = false;
    }
    ta.remove();
    return ok;
  }
}

/** Trigger a file download of `text` (or a Blob). */
export function downloadFile(name, data, type = "application/json") {
  const blob = data instanceof Blob ? data : new Blob([data], { type });
  const url = URL.createObjectURL(blob);
  const a = h("a", { href: url, download: name, style: "display:none" });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** A button that briefly shows a confirmation message after its async action. */
export function actionButton(label, action, { className = "btn", doneLabel = "Done ✓" } = {}) {
  const btn = h("button", { type: "button", class: className }, label);
  btn.addEventListener("click", async () => {
    btn.disabled = true;
    let ok = true;
    try {
      ok = (await action()) !== false;
    } catch (err) {
      ok = false;
      console.error(err);
    }
    btn.textContent = ok ? doneLabel : "Didn't work";
    setTimeout(() => {
      btn.textContent = label;
      btn.disabled = false;
    }, 1600);
  });
  return btn;
}

export function tag(text, extra = "") {
  return h("span", { class: `tag ${extra}`.trim() }, text);
}
