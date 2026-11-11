import { h, autosaveField, actionButton, copyText, extLink, tag, fill } from "../../dom.js";
import { findById } from "../../content.js";
import { buildCorrectionPrompt, countWords, currentTopic, pickAnother } from "../../day.js";
import { addMistake, parseCorrections } from "../../mistakes.js";
import { accentBar } from "../parts/accent-bar.js";
import { dictationPanel } from "../parts/dictation-panel.js";

const DEFAULT_TEMPLATE = [
  "Please correct my French text. List each mistake with a short explanation in English.",
  "",
  "Prompt: {prompt}",
  "",
  "{text}",
];

export function writingBlock({ config, content, day, state, iso, save, onCleanup }) {
  const F = day.blocks.focus;
  F.corrections ??= "";
  const promptBox = h("div", { class: "prompt-box" });
  const prompt = () => findById(content.writing.items, F.promptId);

  function paintPrompt() {
    const p = prompt();
    fill(promptBox,
      h("p", { class: "prompt", lang: "fr" }, p.prompt),
      h(
        "p",
        { class: "muted" },
        p.hint ?? "",
        " ",
        p.targetWords ? tag(`~${p.targetWords} words`, "tag-plain") : null,
        p.level ? tag(p.level) : null,
      ),
      h(
        "button",
        {
          type: "button",
          class: "btn btn-small",
          onclick: () => {
            if (F.text.trim() && !confirm("Switch prompt? Your text stays, but it was written for this prompt.")) return;
            pickAnother(state, iso, "writing", content);
            save();
            paintPrompt();
            paintCount(F.text);
          },
        },
        "Pick another prompt",
      ),
    );
  }
  paintPrompt();

  const count = h("span", { class: "muted", "aria-live": "polite" });
  const paintCount = (text) => {
    const target = prompt().targetWords;
    const n = countWords(text);
    count.textContent = target ? `${n} / ${target} words` : `${n} words`;
  };

  const text = autosaveField({
    id: `writing-${iso}`,
    label: "Your text",
    hint: "Spell-check is off on purpose: spelling is part of the practice.",
    value: F.text,
    rows: 12,
    lang: "fr",
    onInput: paintCount,
    onSave: (v) => {
      F.text = v;
      save();
    },
  });
  // autosaveField turns spellcheck on for lang fields; turn it back off here.
  text.textarea.spellcheck = false;
  text.el.insertBefore(accentBar(() => text.textarea), text.textarea);
  onCleanup(text.dispose);
  paintCount(F.text);

  const copyBtn = actionButton(
    "Copy for correction",
    async () => {
      text.flush();
      if (!F.text.trim()) {
        alert("Write something first.");
        return false;
      }
      const { topic } = currentTopic(state, content);
      const message = buildCorrectionPrompt(config.correctionPrompt ?? DEFAULT_TEMPLATE, {
        prompt: prompt().prompt,
        grammar: topic.title,
        text: F.text,
      });
      return copyText(message);
    },
    { className: "btn btn-primary", doneLabel: "Copied ✓" },
  );

  const corrections = autosaveField({
    id: `corrections-${iso}`,
    label: "Claude’s corrections",
    hint: "Paste the list of mistakes from Claude’s reply (lines like: original → correction — why). They also show up in Sunday’s review.",
    value: F.corrections,
    rows: 5,
    lang: "fr",
    onSave: (v) => {
      F.corrections = v;
      save();
    },
  });
  corrections.textarea.spellcheck = false;
  onCleanup(corrections.dispose);

  const importStatus = h("span", { class: "field-hint", "aria-live": "polite" });
  const importBtn = h(
    "button",
    {
      type: "button",
      class: "btn btn-small",
      onclick: () => {
        corrections.flush();
        const found = parseCorrections(F.corrections);
        if (!found.length) {
          importStatus.textContent = "No “original → correction” lines found.";
          return;
        }
        const added = found.map((m) => addMistake(state.mistakes, { ...m, source: "writing" }, iso)).filter(Boolean);
        save();
        fill(importStatus,
          `Added ${added.length} to `,
          h("a", { href: "#/mistakes" }, "your mistakes"),
          ".",
        );
      },
    },
    "Add to my mistakes",
  );

  const warmup = h(
    "details",
    { class: "warmup", open: !F.dictation?.length || F.dictation.length < (F.dictationIds?.length ?? 0) },
    h("summary", {}, "Warm-up (5 min): dictée"),
    dictationPanel({ state, iso, F, content, save, onCleanup }),
  );

  return h(
    "div",
    {},
    warmup,
    promptBox,
    text.el,
    h(
      "div",
      { class: "row" },
      count,
      h("span", { class: "row-end" }, copyBtn),
    ),
    h(
      "p",
      { class: "muted" },
      "Paste into ",
      extLink("Claude", "https://claude.ai"),
      ", read the corrections, then rewrite the sentences you got wrong.",
    ),
    corrections.el,
    h("div", { class: "row" }, importBtn, importStatus),
  );
}
