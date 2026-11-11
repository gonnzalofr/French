import { loadConfig } from "./content.js";
import { startRouter } from "./router.js";
import { renderToday } from "./views/today.js";
import { renderHistory } from "./views/history.js";
import { renderSettings } from "./views/settings.js";

const routes = {
  today: renderToday,
  history: renderHistory,
  settings: renderSettings,
};

function showError(err) {
  const banner = document.getElementById("error");
  banner.querySelector("[data-message]").textContent = err.message;
  banner.hidden = false;
  console.error(err);
}

async function boot() {
  const main = document.getElementById("main");
  let config;
  try {
    config = await loadConfig();
  } catch (err) {
    showError(err);
    main.replaceChildren();
    return;
  }
  const ctx = { config };
  startRouter(routes, (render, params) => {
    try {
      main.replaceChildren(render(ctx, params));
      main.focus({ preventScroll: true });
    } catch (err) {
      showError(err);
    }
  });
}

boot();
