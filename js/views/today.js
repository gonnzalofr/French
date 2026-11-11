import { h, extLink } from "../dom.js";
import { findById } from "../content.js";
import { coreDoneCount, ensureDay, hasActivity, CORE_BLOCKS } from "../day.js";
import { currentStreak } from "../streak.js";
import { createTimer, formatMs } from "../timer.js";
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

export const shortDateFmt = new Intl.DateTimeFormat("fr-FR", { weekday: "long", day: "numeric", month: "long" });

export const capitalize = (s) => s.charAt(0).toUpperCase() + s.slice(1);

const timeFmt = new Intl.DateTimeFormat("fr-FR", { hour: "2-digit", minute: "2-digit" });

const reduceMotion = () => window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

/** One-line preview shown when a block is folded. */
function blockSummary(key, day, content) {
  const F = day.blocks.focus;
  if (key === "anki") return "Clear today’s due reviews.";
  if (key === "listening") return findById(content.podcasts.items, day.blocks.listening.itemId)?.name ?? "";
  if (key === "log") return "What went well, what to fix next time.";
  switch (day.focusType) {
    case "grammar-learn":
    case "grammar-drill":
      return findById(content.grammar.topics, F.grammarTopic)?.title ?? "";
    case "speaking":
      return findById(content.speaking.items, F.promptId)?.prompt ?? "";
    case "writing":
      return findById(content.writing.items, F.promptId)?.prompt ?? "";
    default:
      return "Mistakes quiz, week summary, catch-up.";
  }
}

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
  const total = totalMinutes(config);

  // ---- session bar (sticky) ----
  const segments = {};
  const bar = h(
    "div",
    { class: "session-bar", "aria-hidden": "true" },
    plan.map((b) => {
      const fill = h("span", { class: "seg-fill" });
      const seg = h(
        "button",
        {
          type: "button",
          class: "seg",
          tabindex: "-1",
          style: `flex-grow:${b.minutes}`,
          title: `${b.label} · ${b.minutes} min`,
          onclick: () => openBlock(b.key, true),
        },
        fill,
        h("span", { class: "seg-label" }, b.key === "focus" ? b.label.split(":")[0] : b.label),
      );
      segments[b.key] = { seg, fill, minutes: b.minutes };
      return seg;
    }),
  );
  const nowLabel = h("span", { class: "now-label" });
  const nowTime = h("span", { class: "now-time" });
  const nowBtn = h("button", { type: "button", class: "btn btn-small btn-primary now-btn" });
  const strip = h(
    "div",
    { class: "session-strip" },
    bar,
    h("div", { class: "strip-row" }, h("span", { class: "now" }, nowLabel, nowTime), nowBtn),
  );

  // ---- header ----
  const streakEl = h("span", { class: "streak-pill" });
  const completeBanner = h(
    "p",
    { class: "banner banner-success", role: "status", hidden: true },
    "Séance terminée. Bravo, à demain !",
  );
  const header = h(
    "header",
    { class: "view-head today-head" },
    h(
      "div",
      { class: "view-title-row" },
      h("h2", { id: "today-title", class: "date", lang: "fr" }, capitalize(dateFmt.format(date))),
      isToday ? null : h("span", { class: "tag" }, iso < todayIso ? "past day" : "future day"),
      streakEl,
    ),
    h(
      "p",
      { class: "meta-row muted" },
      `${config.sessionStart}–${plan.at(-1).end} · ${total} min`,
      isToday ? null : [" · ", h("a", { href: "#/today" }, "Back to today")],
    ),
    backupReminder(state, todayIso),
    completeBanner,
  );

  // ---- blocks ----
  const timers = {};
  const cards = {};
  const manual = new Map(); // blocks you opened or closed by hand
  let nextKey = null;
  onCleanup(() => Object.values(timers).forEach((t) => t.destroy()));

  const list = h(
    "ol",
    { class: "blocks" },
    plan.map((b, i) => {
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
          Object.values(timers).forEach((other) => other !== timer && other.pause());
          openBlock(b.key);
        },
        onFinish: () => {
          if (state.settings.chime) playChime();
          card.classList.add("flash");
          setTimeout(() => card.classList.remove("flash"), 3000);
        },
        onTick: () => paintStrip(),
      });
      timers[b.key] = timer;

      const checkbox = h("input", {
        type: "checkbox",
        id: `done-${b.key}`,
        checked: Boolean(blockState.done),
        onchange: (e) => {
          blockState.done = e.target.checked;
          blockState.doneAt = e.target.checked ? new Date().toISOString() : null;
          if (e.target.checked) timer.pause();
          manual.delete(b.key);
          save();
          refresh(e.target.checked);
        },
      });

      const summary = h("p", { class: "block-summary", lang: b.key === "anki" || b.key === "log" ? null : "fr" });
      const toggle = h(
        "button",
        {
          type: "button",
          class: "block-head",
          id: `head-${b.key}`,
          "aria-controls": `content-${b.key}`,
          onclick: () => {
            const open = toggle.getAttribute("aria-expanded") !== "true";
            manual.set(b.key, open);
            paintCards();
          },
        },
        h("span", { class: "block-step", "aria-hidden": "true" }, i + 1),
        h("span", { class: "block-title", id: `title-${b.key}` }, b.label),
        h(
          "span",
          { class: "block-time" },
          b.key === clockBlock ? h("span", { class: "tag" }, "now") : null,
          `${b.start}–${b.end}`,
          h("span", { class: "muted" }, ` · ${b.minutes} min`),
        ),
        h("span", { class: "chevron", "aria-hidden": "true" }),
      );

      const contentEl = h(
        "div",
        { class: "block-content", id: `content-${b.key}`, role: "region", "aria-labelledby": `title-${b.key}` },
        timer.el,
        h("div", { class: "block-body" }, body),
        h(
          "div",
          { class: "block-foot" },
          h("label", { class: "done-check", for: `done-${b.key}` }, checkbox, b.key === "log" ? "Log written" : "Done"),
        ),
      );

      const card = h("li", { class: "block", "data-block": b.key }, h("h3", { class: "block-heading" }, toggle), summary, contentEl);
      cards[b.key] = { card, toggle, summary, contentEl };
      return card;
    }),
  );

  function isOpen(key) {
    if (manual.has(key)) return manual.get(key);
    return key === nextKey;
  }

  function openBlock(key, scroll = false) {
    manual.set(key, true);
    paintCards();
    if (scroll) cards[key].card.scrollIntoView({ behavior: reduceMotion() ? "auto" : "smooth", block: "start" });
  }

  function paintCards() {
    for (const key of BLOCK_ORDER) {
      const { card, toggle, summary, contentEl } = cards[key];
      const blockState = day.blocks[key];
      const open = isOpen(key);
      toggle.setAttribute("aria-expanded", String(open));
      contentEl.hidden = !open;
      card.toggleAttribute("data-done", Boolean(blockState.done));
      card.toggleAttribute("data-next", key === nextKey);
      card.toggleAttribute("data-open", open);
      summary.hidden = open;
      summary.textContent = blockState.done
        ? `Done${blockState.doneAt ? ` at ${timeFmt.format(new Date(blockState.doneAt))}` : ""}`
        : blockSummary(key, day, content);
    }
  }

  function paintStrip() {
    const running = BLOCK_ORDER.find((k) => timers[k]?.isRunning());
    const focusKey = running ?? nextKey;
    for (const key of BLOCK_ORDER) {
      const { seg, fill, minutes } = segments[key];
      const left = timers[key]?.remaining() ?? minutes * 60_000;
      const pct = day.blocks[key].done ? 100 : (100 * (minutes * 60_000 - left)) / (minutes * 60_000);
      fill.style.width = `${pct}%`;
      seg.dataset.state = day.blocks[key].done ? "done" : key === focusKey ? "current" : "todo";
    }
    if (!focusKey) {
      nowLabel.textContent = "Session complete";
      nowTime.textContent = "";
      nowBtn.hidden = true;
      return;
    }
    const b = plan.find((p) => p.key === focusKey);
    const t = timers[focusKey];
    nowLabel.textContent = b.label;
    nowTime.textContent = ` · ${formatMs(t.remaining())} left`;
    nowBtn.hidden = false;
    nowBtn.textContent = t.isRunning() ? "Pause" : t.remaining() === 0 ? "Open" : "Start";
    nowBtn.onclick = () => {
      if (t.remaining() === 0) openBlock(focusKey, true);
      else t.toggle();
    };
  }

  function refresh(advance = false) {
    const done = coreDoneCount(day);
    const streak = currentStreak(state.days, todayIso);
    streakEl.textContent = streak ? `${streak}-day streak` : "No streak yet";
    streakEl.dataset.active = String(streak > 0);
    completeBanner.hidden = done < CORE_BLOCKS.length;
    nextKey = BLOCK_ORDER.find((k) => !day.blocks[k].done) ?? null;
    paintCards();
    paintStrip();
    if (advance && nextKey) {
      cards[nextKey].card.scrollIntoView({ behavior: reduceMotion() ? "auto" : "smooth", block: "start" });
    }
  }
  refresh();

  return h(
    "section",
    { class: "view", "aria-labelledby": "today-title" },
    header,
    strip,
    list,
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
    { class: "reminder" },
    last ? `Last backup ${last.slice(0, 10)}. ` : "No backup yet. ",
    h("a", { href: "#/settings" }, "Export one"),
    " so a cleared browser can’t wipe your progress.",
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
