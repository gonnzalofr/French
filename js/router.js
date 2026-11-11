// Minimal hash router: #/today, #/history, #/settings (with optional ?query).

export function parseHash(hash) {
  const raw = hash.replace(/^#\/?/, "");
  const [path, query = ""] = raw.split("?");
  return { route: path || "today", params: new URLSearchParams(query) };
}

export function startRouter(routes, onRoute) {
  const go = () => {
    const { route, params } = parseHash(location.hash);
    const name = route in routes ? route : "today";
    document.querySelectorAll("[data-route]").forEach((a) => {
      if (a.dataset.route === name) a.setAttribute("aria-current", "page");
      else a.removeAttribute("aria-current");
    });
    onRoute(routes[name], params);
  };
  window.addEventListener("hashchange", go);
  go();
}
