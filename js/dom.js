// Tiny DOM helpers. Text children are always inserted as text nodes (no innerHTML).

/**
 * h("a", { href: "#", class: "x", onclick: fn }, "text", childNode)
 * Attributes set to false/null/undefined are skipped.
 */
export function h(tag, attrs = {}, ...children) {
  const el = document.createElement(tag);
  for (const [name, value] of Object.entries(attrs ?? {})) {
    if (value === false || value == null) continue;
    if (name.startsWith("on") && typeof value === "function") {
      el.addEventListener(name.slice(2), value);
    } else if (value === true) {
      el.setAttribute(name, "");
    } else {
      el.setAttribute(name, String(value));
    }
  }
  for (const child of children.flat()) {
    if (child == null || child === false) continue;
    el.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
  return el;
}

/** External link that opens in a new tab and never leaks the opener. */
export function extLink(label, url) {
  return h("a", { href: url, target: "_blank", rel: "noopener noreferrer" }, label);
}
