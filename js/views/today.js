import { h, extLink } from "../dom.js";
import {
  currentBlockKey,
  parseLocalDate,
  sessionPlan,
  toLocalISODate,
  totalMinutes,
} from "../schedule.js";

const PLACEHOLDER = {
  anki: "Do today's reviews, then tick the box.",
  listening: "Podcast pick and word notes arrive in milestone 4.",
  focus: "Focus content arrives in milestones 5 and 6.",
  log: "What went well, what to fix next time (milestone 7).",
};

const dateFmt = new Intl.DateTimeFormat("fr-FR", {
  weekday: "long",
  day: "numeric",
  month: "long",
  year: "numeric",
});

export function renderToday({ config }, params) {
  // ?date=YYYY-MM-DD lets you preview any day, e.g. #/today?date=2026-11-19
  const override = parseLocalDate(params.get("date"));
  const now = new Date();
  const date = override ?? now;
  const isToday = toLocalISODate(date) === toLocalISODate(now);
  const plan = sessionPlan(date, config);
  const active = isToday ? currentBlockKey(plan, now) : null;

  const blocks = plan.map((b, i) =>
    h(
      "li",
      { class: "block", "data-block": b.key, "data-active": b.key === active },
      h(
        "div",
        { class: "block-head" },
        h("span", { class: "block-step", "aria-hidden": "true" }, i + 1),
        h("h3", {}, b.label),
        h("span", { class: "block-time" }, `${b.start}–${b.end}`, h("span", { class: "muted" }, ` · ${b.minutes} min`)),
      ),
      b.key === "anki"
        ? h("p", { class: "links" }, ...config.anki.links.map((l) => extLink(l.label, l.url)))
        : null,
      h("p", { class: "muted" }, PLACEHOLDER[b.key]),
    ),
  );

  return h(
    "section",
    { class: "view", "aria-labelledby": "today-title" },
    h(
      "header",
      { class: "view-head" },
      h("h2", { id: "today-title", class: "date" }, capitalize(dateFmt.format(date))),
      h(
        "p",
        { class: "muted" },
        `${config.sessionStart}–${plan.at(-1).end} · ${totalMinutes(config)} min`,
        override && !isToday ? h("span", { class: "tag" }, "preview") : null,
      ),
    ),
    h("ol", { class: "blocks" }, blocks),
  );
}

function capitalize(s) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
