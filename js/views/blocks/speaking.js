import { h, autosaveField, extLink, tag } from "../../dom.js";
import { audioUrl, findById } from "../../content.js";
import { pickAnother } from "../../day.js";
import { formatMs } from "../../timer.js";
import { micErrorMessage, recorderUnsupportedReason, startRecording } from "../../recorder.js";
import { deleteRecording, listRecordingsByDate, putRecording, setStarred } from "../../recordings.js";

const MAX_TAKE_MS = 5 * 60_000;

export const RATING_CRITERIA = [
  { key: "fluency", label: "Fluency", hint: "kept going without long pauses" },
  { key: "pronunciation", label: "Pronunciation", hint: "nasals, u/ou, silent endings, R" },
  { key: "accuracy", label: "Accuracy", hint: "tenses, agreement, gender" },
];

export function speakingBlock({ content, day, state, iso, save, onCleanup }) {
  const F = day.blocks.focus;
  F.recordingIds ??= [];

  // ---- prompt ----
  const promptBox = h("div", { class: "prompt-box" });
  function paintPrompt() {
    const p = findById(content.speaking.items, F.promptId);
    promptBox.replaceChildren(
      h("p", { class: "prompt", lang: "fr" }, p.prompt),
      p.hint ? h("p", { class: "muted" }, p.hint, " ", p.level ? tag(p.level) : null) : null,
      h(
        "button",
        {
          type: "button",
          class: "btn btn-small",
          onclick: () => {
            pickAnother(state, iso, "speaking", content);
            save();
            paintPrompt();
          },
        },
        "Pick another prompt",
      ),
    );
  }
  paintPrompt();

  // ---- pronunciation warm-up ----
  const drill = findById(content.pronunciation.drills, F.drillId);
  const warmup = h(
    "details",
    { class: "warmup" },
    h("summary", {}, `Warm-up (3 min): ${drill.title}`),
    h("p", {}, drill.tip),
    h(
      "p",
      { class: "chips", lang: "fr" },
      drill.words.map((w) => extLink(w, audioUrl(content.pronunciation, w))),
    ),
    h(
      "p",
      { class: "muted" },
      "Say each word, then click it to hear a native speaker.",
      content.pronunciation.verify ? " " : "",
      content.pronunciation.verify ? tag("audio links unverified", "tag-warn") : null,
    ),
  );

  const steps = h(
    "ol",
    { class: "steps" },
    h("li", {}, "Take 1: answer for about 2 minutes without stopping."),
    h("li", {}, "Listen back and note what to fix."),
    h("li", {}, "Take 2: same prompt, fixing those things."),
    h("li", {}, "Rate yourself honestly."),
  );

  const notes = autosaveField({
    id: `speaking-notes-${iso}`,
    label: "What to fix (sounds, words, grammar)",
    value: F.notes,
    rows: 3,
    onSave: (v) => {
      F.notes = v;
      save();
    },
  });
  onCleanup(notes.dispose);

  return h(
    "div",
    {},
    promptBox,
    warmup,
    steps,
    recorderPanel({ F, iso, save, onCleanup }),
    notes.el,
    ratingPanel({ F, iso, save }),
  );
}

function recorderPanel({ F, iso, save, onCleanup }) {
  const status = h("p", { class: "field-hint", "aria-live": "polite" });
  const list = h("ol", { class: "takes" });
  const unsupported = recorderUnsupportedReason();
  const urls = [];
  let active = null;
  let tickId = null;

  onCleanup(() => {
    active?.cancel();
    clearInterval(tickId);
    urls.forEach((u) => URL.revokeObjectURL(u));
  });

  const recordBtn = h("button", { type: "button", class: "btn btn-record", disabled: Boolean(unsupported) }, "● Record");

  async function toggle() {
    if (active) return stop();
    status.textContent = "Opening the microphone…";
    try {
      active = await startRecording();
    } catch (err) {
      status.textContent = micErrorMessage(err);
      status.classList.add("error-text");
      return;
    }
    status.classList.remove("error-text");
    recordBtn.textContent = "■ Stop";
    recordBtn.classList.add("recording");
    tickId = setInterval(() => {
      const elapsed = Date.now() - active.startedAt;
      status.textContent = `Recording… ${formatMs(elapsed)}`;
      if (elapsed >= MAX_TAKE_MS) stop();
    }, 250);
  }

  async function stop() {
    const rec = active;
    active = null;
    clearInterval(tickId);
    recordBtn.textContent = "● Record";
    recordBtn.classList.remove("recording");
    const { blob, mimeType, durationMs } = await rec.stop();
    const id = `rec-${iso}-${Date.now()}`;
    try {
      await putRecording({ id, date: iso, promptId: F.promptId, mimeType, durationMs, starred: false, createdAt: new Date().toISOString(), blob });
      F.recordingIds.push(id);
      save();
      status.textContent = `Saved a ${formatMs(durationMs)} take.`;
    } catch (err) {
      status.textContent = `Couldn't save the recording: ${err.message}`;
    }
    paintList();
  }

  recordBtn.addEventListener("click", toggle);

  async function paintList() {
    let recs = [];
    try {
      recs = (await listRecordingsByDate(iso)).sort((a, b) => a.id.localeCompare(b.id));
    } catch (err) {
      status.textContent = `Couldn't read recordings: ${err.message}`;
    }
    urls.splice(0).forEach((u) => URL.revokeObjectURL(u));
    list.replaceChildren(
      ...recs.map((r, i) => {
        const url = URL.createObjectURL(r.blob);
        urls.push(url);
        const star = h(
          "button",
          {
            type: "button",
            class: "btn btn-small btn-icon",
            "aria-pressed": String(Boolean(r.starred)),
            title: "Starred takes are kept forever; others are deleted after the keep period.",
            onclick: async () => {
              await setStarred(r.id, !r.starred);
              paintList();
            },
          },
          r.starred ? "★ Starred" : "☆ Keep",
        );
        const del = h(
          "button",
          {
            type: "button",
            class: "btn btn-small btn-quiet",
            onclick: async () => {
              if (!confirm(`Delete take ${i + 1}? This can't be undone.`)) return;
              await deleteRecording(r.id);
              F.recordingIds = F.recordingIds.filter((x) => x !== r.id);
              save();
              paintList();
            },
          },
          "Delete",
        );
        return h(
          "li",
          { class: "take" },
          h("span", { class: "take-label" }, `Take ${i + 1} · ${formatMs(r.durationMs)}`),
          h("audio", { controls: true, src: url, preload: "metadata" }),
          h("span", { class: "take-actions" }, star, del),
        );
      }),
    );
  }
  paintList();

  if (unsupported) status.textContent = unsupported;

  return h("div", { class: "recorder" }, h("div", { class: "row" }, recordBtn), status, list);
}

function ratingPanel({ F, iso, save }) {
  return h(
    "div",
    { class: "rating" },
    h("p", { class: "field-label" }, "Self-rating (1 = rough, 5 = smooth)"),
    RATING_CRITERIA.map(({ key, label, hint }) =>
      h(
        "fieldset",
        { class: "rating-row" },
        h("legend", {}, h("span", {}, label), h("span", { class: "muted" }, ` · ${hint}`)),
        h(
          "div",
          { class: "rating-options" },
          [1, 2, 3, 4, 5].map((n) =>
            h(
              "label",
              { class: "rating-option" },
              h("input", {
                type: "radio",
                name: `rating-${key}-${iso}`,
                value: n,
                checked: F.rating[key] === n,
                onchange: () => {
                  F.rating[key] = n;
                  save();
                },
              }),
              h("span", {}, n),
            ),
          ),
        ),
      ),
    ),
  );
}
