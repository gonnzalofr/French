import { loadConfig, loadContent } from "./content.js";
import { startRouter } from "./router.js";
import { createStore } from "./storage.js";
import { pruneRecordings } from "./recordings.js";
import { toLocalISODate } from "./schedule.js";
import { renderToday } from "./views/today.js";
import { renderHistory } from "./views/history.js";
import { renderMistakes } from "./views/mistakes.js";
import { renderSettings } from "./views/settings.js";

const routes = {
  today: renderToday,
  mistakes: renderMistakes,
  history: renderHistory,
  settings: renderSettings,
};

function showError(err) {
  const banner = document.getElementById("error");
  banner.querySelector("[data-message]").textContent = err.message;
  banner.hidden = false;
  console.error(err);
}

function showWarning(message) {
  const el = document.getElementById("warning");
  el.textContent = message;
  el.hidden = false;
}

async function boot() {
  const main = document.getElementById("main");
  let config;
  let content;
  try {
    [config, content] = await Promise.all([loadConfig(), loadContent()]);
  } catch (err) {
    showError(err);
    main.replaceChildren();
    return;
  }

  const store = createStore(window.localStorage);
  store.load();
  if (store.warning) showWarning(store.warning);

  // Housekeeping that must never block the app.
  pruneRecordings(store.state.settings.keepRecordingsDays, toLocalISODate(new Date())).catch(() => {});
  if (Object.keys(store.state.days).length) navigator.storage?.persist?.().catch(() => {});

  // Views register cleanups (timers, autosaves, open microphones) that run before the next view.
  let cleanups = [];
  const runCleanups = () => {
    cleanups.forEach((fn) => {
      try {
        fn();
      } catch (err) {
        console.error(err);
      }
    });
    cleanups = [];
  };
  const app = { config, content, store, onCleanup: (fn) => cleanups.push(fn) };

  let renderedOn = toLocalISODate(new Date());
  let showingToday = false;
  const rerender = startRouter(routes, (render, params) => {
    runCleanups();
    renderedOn = toLocalISODate(new Date());
    showingToday = render === renderToday && !params.has("date");
    try {
      main.replaceChildren(render(app, params));
      main.focus({ preventScroll: true });
      window.scrollTo(0, 0);
    } catch (err) {
      showError(err);
    }
  });

  // If the tab stays open past midnight, move "Today" to the new day instead of
  // writing tomorrow's session into yesterday's record.
  const checkDate = () => {
    if (showingToday && toLocalISODate(new Date()) !== renderedOn) rerender();
  };
  setInterval(checkDate, 60_000);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") checkDate();
  });
}

boot();
