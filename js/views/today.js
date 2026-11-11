import { h, extLink } from "../dom.js";
import { coreDoneCount, ensureDay, hasActivity, CORE_BLOCKS } from "../day.js";
import { currentStreak } from "../streak.js";
import { createTimer } from "../timer.js";
import { playChime, unlockAudio } from "../sound.js";
import {
  BLOCK_ORDER,
  currentBlockKey,
  daysBetween,
  parseLocalDate,
  sessionPlan,
  toLocalISODate,
  totalMinutes,
} from "../schedule.js";
import { ankiBlock } from "./blocks/anki.js";
import { listeningBlock } from "./blocks/listening.js";
import { grammarBlock } from "./blocks/grammar.js";
import { speakingBlock } from "./blocks/speaking.js";
import { writingBlock } from "./blocks/writing.js";
import { reviewBlock } from "./blocks/review.js";
import { logBlock } from "./blocks/log.js";

const FOCUS_BLOCKS = {
  "grammar-learn": grammarBlock,
  "grammar-drill": grammarBlock,
  speaking: speakingBlock,
  writing: writingBlock,
  review: reviewBlock,
};

const BODIES = { anki: ankiBlock, listening: listeningBlock, log: logBlock };

export const dateFmt = new Intl.DateTimeFormat("fr-FR", {
  weekday: "long",
  day: "numeric",
  month: "long",
  year: "numeric",
});

export const capitalize = (s) => s.charAt(0).toUpperCase() + s.slice(1);

export function renderToday(app, params) {
  const { config, content, store, onCleanup } = app;
  const state = store.state;

  // ?date=YYYY-MM-DD opens another day (to preview it, or to tick a session you forgot).
  const now = new Date();
  const todayIso = toLocalISODate(now);
  const override = parseLocalDate(params.get("date"));
  const date = override ?? now;
  const iso = toLocalISODate(date);
  const isToday = iso === todayIso;

  const day = ensureDay(state, iso, { config, content, todayIso });
  store.save();
  const save = () => store.save();
  const plan = sessionPlan(date, config, day.focusType);
  const clockBlock = isToday ? currentBlockKey(plan, now) : null;

  // ---- header ----
  const progress = h("span", { class: "progress-text" });
  const streakEl = h("span", { class: "streak" });
  const completeBanner = h(
    "p",
    { class: "banner banner-success", role: "status", hidden: true },
    "Séance terminée. Bravo, à demain !",
  );

  const header = h(
    "header",
    { class: "view-head" },
    h(
      "div",
      { class: "view-title-row" },
      h("h2", { id: "today-title", class: "date" }, capitalize(dateFmt.format(date))),
      isToday ? null : h("span", { class: "tag" }, iso < todayIso ? "past day" : "future day"),
    ),
    h(
      "p",
      { class: "meta-row" },
      h("span", { class: "muted" }, `${config.sessionStart}–${plan.at(-1).end} · ${totalMinutes(config)} min`),
      progress,
      streakEl,
    ),
    isToday ? null : h("p", {}, h("a", { href: "#/today" }, "← Back to today")),
    backupReminder(state, todayIso),
    completeBanner,
  );

  // ---- blocks ----
  const timers = [];
  onCleanup(() => timers.forEach((t) => t.destroy()));

  const cards = plan.map((b, i) => {
    const blockState = day.blocks[b.key];
    const ctx = { ...app, state, iso, date, day, save, isToday, block: blockState, plan: b };
    const body = (b.key === "focus" ? FOCUS_BLOCKS[day.focusType] : BODIES[b.key])(ctx);

    const timer = createTimer({
      label: b.label,
      totalMs: b.minutes * 60_000,
      state: day.timers[b.key],
      onChange: (t) => {
        day.timers[b.key] = t;
        save();
      },
      onStart: () => {
        unlockAudio();
        timers.forEach((other) => other !== timer && other.pause());
      },
      onFinish: () => {
        if (state.settings.chime) playChime();
        card.classList.add("flash");
        setTimeout(() => card.classList.remove("flash"), 3000);
      },
    });
    timers.push(timer);

    const checkbox = h("input", {
      type: "checkbox",
      id: `done-${b.key}`,
      checked: Boolean(blockState.done),
      onchange: (e) => {
        blockState.done = e.target.checked;
        blockState.doneAt = e.target.checked ? new Date().toISOString() : null;
        if (e.target.checked) timer.pause();
        save();
        refresh();
      },
    });

    const card = h(
      "li",
      { class: "block", "data-block": b.key, "aria-labelledby": `title-${b.key}` },
      h(
        "div",
        { class: "block-head" },
        h("span", { class: "block-step", "aria-hidden": "true" }, i + 1),
        h("h3", { id: `title-${b.key}` }, b.label),
        h(
          "span",
          { class: "block-time" },
          `${b.start}–${b.end}`,
          h("span", { class: "muted" }, ` · ${b.minutes} min`),
          b.key === clockBlock ? h("span", { class: "tag" }, "now") : null,
        ),
      ),
      timer.el,
      h("div", { class: "block-body" }, body),
      h(
        "div",
        { class: "block-foot" },
        h("label", { class: "done-check", for: `done-${b.key}` }, checkbox, b.key === "log" ? "Log written" : "Done"),
      ),
    );
    return card;
  });

  function refresh() {
    const done = coreDoneCount(day);
    progress.textContent = `${done}/${CORE_BLOCKS.length} blocks done`;
    const streak = currentStreak(state.days, todayIso);
    streakEl.textContent = streak ? `Streak: ${streak} day${streak === 1 ? "" : "s"}` : "No streak yet";
    completeBanner.hidden = done < CORE_BLOCKS.length;
    const next = BLOCK_ORDER.find((k) => !day.blocks[k].done);
    cards.forEach((card) => {
      const key = card.dataset.block;
      card.toggleAttribute("data-done", Boolean(day.blocks[key].done));
      card.toggleAttribute("data-next", key === next);
    });
  }
  refresh();

  return h(
    "section",
    { class: "view", "aria-labelledby": "today-title" },
    header,
    h("ol", { class: "blocks" }, cards),
    resourcesFooter(content),
  );
}

function backupReminder(state, todayIso) {
  const daysUsed = Object.values(state.days).filter(hasActivity).length;
  const last = state.settings.lastBackup;
  const stale = !last || daysBetween(last.slice(0, 10), todayIso) >= 7;
  if (daysUsed < 3 || !stale) return null;
  return h(
    "p",
    { class: "banner" },
    last ? `Last backup was on ${last.slice(0, 10)}. ` : "You haven't backed up your progress yet. ",
    h("a", { href: "#/settings" }, "Export a backup"),
    " so a cleared browser can't wipe it.",
  );
}

function resourcesFooter(content) {
  return h(
    "footer",
    { class: "resources" },
    h("h3", {}, "Handy links"),
    h(
      "p",
      { class: "links" },
      content.resources.links.map((l) => extLink(l.label, l.url, { verify: l.verify })),
    ),
  );
}
