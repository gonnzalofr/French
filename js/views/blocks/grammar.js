import { h, extLink, autosaveField, tag } from "../../dom.js";
import { findById, grammarSearchUrl } from "../../content.js";
import { currentTopic, setGrammarVerdict } from "../../day.js";

export function grammarBlock({ content, day, state, iso, save, onCleanup }) {
  const F = day.blocks.focus;
  const topic = findById(content.grammar.topics, F.grammarTopic);
  const learn = day.focusType === "grammar-learn";
  const kind = learn ? "learn" : "drill";
  const sites = content.grammar.sites[kind];
  const extraLinks = topic[kind] ?? [];

  const steps = learn
    ? [
        "Read one explanation below (8 min).",
        "Write the rule in your own words (5 min).",
        "Write 3 sentences of your own that use it (7 min).",
      ]
    : [
        "Do exercises on two of the sites below (15 min).",
        "Note every mistake and why you made it.",
        "Decide: got it, or another week on this topic?",
      ];

  const notes = autosaveField({
    id: `grammar-notes-${iso}`,
    label: learn ? "Your rule + 3 example sentences" : "Mistakes I made",
    value: F.notes,
    rows: 5,
    lang: "fr",
    onSave: (v) => {
      F.notes = v;
      save();
    },
  });
  onCleanup(notes.dispose);

  return h(
    "div",
    { class: "grammar" },
    h(
      "div",
      { class: "topic-head" },
      h("h4", {}, topic.title),
      tag(topic.level),
      tag(learn ? "learn it" : "drill it", "tag-plain"),
    ),
    h("p", {}, topic.summary),
    topic.keyPoints?.length ? h("ul", { class: "key-points" }, topic.keyPoints.map((p) => h("li", {}, p))) : null,
    topic.examples?.length
      ? h(
          "ul",
          { class: "examples" },
          topic.examples.map((ex) =>
            h("li", {}, h("span", { lang: "fr" }, ex.fr), ex.en ? h("span", { class: "muted" }, ex.en) : null),
          ),
        )
      : null,
    h("ol", { class: "steps" }, steps.map((s) => h("li", {}, s))),
    h(
      "p",
      { class: "links" },
      h("span", { class: "muted" }, learn ? "Read about it:" : "Exercises:"),
      sites.map((s) => extLink(s.label, grammarSearchUrl(content.grammar, s, topic.query), { verify: s.verify })),
      extraLinks.map((l) => extLink(l.label, l.url, { verify: l.verify })),
    ),
    notes.el,
    learn ? null : verdictPicker({ content, state, iso, F, topic, save }),
  );
}

function verdictPicker({ content, state, iso, F, topic, save }) {
  const message = h("p", { class: "field-hint muted", "aria-live": "polite" });
  const choices = [
    { value: "got-it", label: "Got it: next topic on Monday" },
    { value: "again", label: "Needs another week" },
  ];
  const buttons = choices.map((c) =>
    h(
      "button",
      {
        type: "button",
        class: "btn segment",
        onclick: () => {
          setGrammarVerdict(state, iso, F.verdict === c.value ? null : c.value, content);
          save();
          paint();
        },
      },
      c.label,
    ),
  );

  function paint() {
    buttons.forEach((b, i) => b.setAttribute("aria-pressed", String(F.verdict === choices[i].value)));
    const { topic: next } = currentTopic(state, content);
    message.textContent =
      F.verdict === "got-it"
        ? `Monday’s topic: ${next.title}.`
        : F.verdict === "again"
          ? `You’ll stay on ${topic.title} next week.`
          : "";
  }
  paint();

  return h(
    "div",
    { class: "verdict" },
    h("p", { class: "field-label" }, "How did it go?"),
    h("div", { class: "segmented", role: "group", "aria-label": "Grammar verdict" }, buttons),
    message,
  );
}
