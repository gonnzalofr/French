import { h, fill } from "../../dom.js";
import { findById } from "../../content.js";
import { diffWords, scoreDiff } from "../../dictation.js";
import { addMistake } from "../../mistakes.js";
import { chooseVoice, frenchVoices, speak, speechSupported, stopSpeaking } from "../../speech.js";
import { accentBar, lastFocusedField } from "./accent-bar.js";

/** Replace the first occurrence of `word` in `sentence` with a blank, for quiz context. */
export function blankOut(sentence, word) {
  const i = sentence.toLowerCase().indexOf(word.toLowerCase());
  return i < 0 ? sentence : `${sentence.slice(0, i)}…${sentence.slice(i + word.length)}`;
}

/**
 * Dictée: listen to each sentence, type it, check. The words you get wrong on the
 * first check go into your mistakes list.
 */
export function dictationPanel({ state, iso, F, content, save, onCleanup }) {
  const items = (F.dictationIds ?? []).map((id) => findById(content.dictation.items, id)).filter(Boolean);
  const status = h("p", { class: "field-hint muted" });
  let voice = null;
  const ready = frenchVoices().then((voices) => {
    voice = chooseVoice(voices, state.settings.voice);
    if (!speechSupported()) {
      status.textContent = "This browser can’t read text aloud. Use “Flash it” instead.";
    } else if (!voices.length) {
      status.textContent =
        "No French voice is installed. On Windows: Settings → Time & language → Speech → Add voices → Français. Until then, use “Flash it”.";
    } else {
      status.textContent = `Voice: ${voice.name}${voice.localService ? "" : " (online)"}. Change it in Settings.`;
    }
  });
  onCleanup(stopSpeaking);

  const rows = items.map((item, i) => sentenceRow(item, i));
  const list = h("ol", { class: "dictee" }, rows);
  const target = lastFocusedField(list, rows[0]?.querySelector("input"));

  function sentenceRow(item, i) {
    const prev = F.dictation.find((r) => r.id === item.id);
    let logged = Boolean(prev?.logged);
    const input = h("input", {
      type: "text",
      class: "dictee-input",
      lang: "fr",
      spellcheck: "false",
      autocomplete: "off",
      autocapitalize: "off",
      "aria-label": `Sentence ${i + 1}: type what you hear`,
      value: prev?.typed ?? "",
    });
    const result = h("div", { class: "dictee-result", "aria-live": "polite" });
    const flash = h("p", { class: "dictee-flash", lang: "fr", hidden: true }, item.text);

    const play = (rate) => {
      ready.then(() => speak(item.text, { voice, rate }));
      input.focus();
    };
    const flashIt = () => {
      flash.hidden = false;
      setTimeout(() => {
        flash.hidden = true;
        input.focus();
      }, 3000);
    };
    const check = () => {
      const ops = diffWords(item.text, input.value);
      const score = scoreDiff(ops);
      const record = { id: item.id, typed: input.value, correct: score.correct, total: score.total, logged: true };
      if (!logged) {
        // Only the first attempt is honest; log its misspellings.
        for (const o of ops.filter((x) => x.type === "wrong")) {
          addMistake(state.mistakes, { wrong: o.typed, right: o.expected, note: `Dictée: ${blankOut(item.text, o.expected)}`, source: "dictation" }, iso);
        }
        logged = true;
      }
      F.dictation = F.dictation.filter((r) => r.id !== item.id).concat(record);
      save();
      paintResult(ops, score);
    };
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        check();
      }
    });

    function paintResult(ops, score) {
      fill(result,
        h(
          "p",
          { class: "dictee-diff", lang: "fr" },
          ops.map((o) => {
            if (o.type === "same") return [h("span", { class: "w-ok" }, o.expected), " "];
            if (o.type === "wrong") return [h("del", { class: "w-bad" }, o.typed), h("ins", { class: "w-fix" }, o.expected), " "];
            if (o.type === "missing") return [h("ins", { class: "w-fix w-missing" }, o.expected), " "];
            return [h("del", { class: "w-bad" }, o.typed), " "];
          }),
        ),
        h(
          "p",
          { class: score.perfect ? "dictee-score perfect" : "dictee-score" },
          score.perfect ? "Parfait. " : `${score.correct}/${score.total} words right. `,
          h("span", { class: "muted" }, item.trap),
        ),
      );
    }
    if (prev) paintResult(diffWords(item.text, prev.typed), scoreDiff(diffWords(item.text, prev.typed)));

    const btn = (label, onclick, cls = "btn btn-small") => h("button", { type: "button", class: cls, onclick }, label);
    return h(
      "li",
      { class: "dictee-row" },
      h(
        "div",
        { class: "row" },
        btn("▶ Play", () => play(0.9)),
        btn("Slower", () => play(0.65)),
        btn("Flash it (3 s)", flashIt, "btn btn-small btn-quiet"),
      ),
      flash,
      input,
      h("div", { class: "row" }, btn("Check", check, "btn btn-small btn-primary"), h("span", { class: "muted field-hint" }, "or press Enter")),
      result,
    );
  }

  if (!items.length) return h("p", { class: "muted" }, "No dictée sentences found in data/dictation.json.");
  return h(
    "div",
    { class: "dictee-panel" },
    h("p", {}, "Listen, type exactly what you hear, then check. Misspelled words go to your mistakes list."),
    status,
    accentBar(target),
    list,
  );
}
