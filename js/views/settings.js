import { h, downloadFile, tag, fill } from "../dom.js";
import { topicStatus } from "../day.js";
import { makeBackup, parseBackup } from "../storage.js";
import { clearRecordings, exportRecordings, importRecordings, listAllRecordings, pruneRecordings } from "../recordings.js";
import { toLocalISODate } from "../schedule.js";
import { chooseVoice, frenchVoices, speak, speechSupported } from "../speech.js";

export function renderSettings(app) {
  const { store, content, config } = app;
  const state = store.state;
  const save = () => store.save();

  return h(
    "section",
    { class: "view", "aria-labelledby": "settings-title" },
    h("header", { class: "view-head" }, h("h2", { id: "settings-title" }, "Settings")),
    backupCard(store),
    grammarCard(state, content, save),
    preferencesCard(state, save),
    storageCard(config),
    dangerCard(store),
  );
}

// ---------- backup ----------

function backupCard(store) {
  const state = store.state;
  const status = h("p", { class: "field-hint", "aria-live": "polite" });
  const withAudio = h("input", { type: "checkbox", id: "backup-audio" });
  const fileInput = h("input", { type: "file", accept: "application/json,.json", id: "import-file", class: "visually-hidden" });

  async function exportBackup() {
    status.textContent = "Preparing backup…";
    let recordings = [];
    if (withAudio.checked) {
      try {
        recordings = await exportRecordings();
      } catch (err) {
        status.textContent = `Couldn’t read recordings: ${err.message}`;
        return;
      }
    }
    const now = new Date();
    state.settings.lastBackup = now.toISOString();
    store.save();
    downloadFile(`french-backup-${toLocalISODate(now)}.json`, JSON.stringify(makeBackup(state, recordings, now), null, 1));
    status.textContent = `Downloaded. Move it into the project’s backups/ folder (git ignores it) or anywhere safe.`;
    lastLine.textContent = lastBackupText(state);
  }

  fileInput.addEventListener("change", async () => {
    const file = fileInput.files?.[0];
    fileInput.value = "";
    if (!file) return;
    try {
      const backup = parseBackup(await file.text());
      const n = Object.keys(backup.state.days).length;
      const when = backup.exportedAt ? backup.exportedAt.slice(0, 10) : "an unknown date";
      const ok = confirm(
        `Replace ALL current progress with this backup from ${when} (${n} days${backup.recordings.length ? `, ${backup.recordings.length} recordings` : ""})?\n\nCurrent data will be overwritten.`,
      );
      if (!ok) return;
      store.replace(backup.state);
      if (backup.recordings.length) await importRecordings(backup.recordings);
      status.textContent = "Backup restored. Reloading…";
      setTimeout(() => location.reload(), 600);
    } catch (err) {
      status.textContent = err.message;
    }
  });

  const lastLine = h("p", { class: "muted" }, lastBackupText(state));

  return h(
    "div",
    { class: "card" },
    h("h3", {}, "Backup"),
    h("p", {}, "Your progress only lives in this browser. Export a backup now and then; import it to restore or move to another browser."),
    lastLine,
    h("p", { class: "check-row" }, withAudio, h("label", { for: "backup-audio" }, " Include speaking recordings (bigger file)")),
    h(
      "div",
      { class: "button-row" },
      h("button", { type: "button", class: "btn btn-primary", onclick: exportBackup }, "Export backup"),
      fileInput,
      h("label", { for: "import-file", class: "btn", role: "button", tabindex: "0", onkeydown: (e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          fileInput.click();
        }
      } }, "Import backup…"),
    ),
    status,
  );
}

function lastBackupText(state) {
  const last = state.settings.lastBackup;
  return last ? `Last backup: ${last.slice(0, 10)}.` : "No backup yet.";
}

// ---------- grammar position ----------

function grammarCard(state, content, save) {
  const topics = content.grammar.topics;
  const list = h("ol", { class: "topic-list" });
  const note = h("p", { class: "muted" });

  function paint() {
    const n = topics.length;
    const idx = state.grammar.currentIndex % n;
    const round = Math.floor(state.grammar.currentIndex / n) + 1;
    const status = topicStatus(state);
    note.textContent = round > 1 ? `Round ${round} through the list.` : "";
    fill(list,
      ...topics.map((t, i) =>
        h(
          "li",
          { "data-current": i === idx },
          h("span", { class: "topic-num", "aria-hidden": "true" }, `${i + 1}.`),
          h("span", { class: "topic-title" }, t.title, " "),
          tag(t.level, "tag-plain"),
          status[t.id] === "mastered" ? tag("got it", "tag-success") : status[t.id] === "again" ? tag("again", "tag-warn") : null,
          i === idx
            ? tag("current")
            : h(
                "button",
                {
                  type: "button",
                  class: "btn btn-small btn-quiet",
                  onclick: () => {
                    state.grammar.currentIndex = (round - 1) * n + i;
                    save();
                    paint();
                  },
                },
                "Make current",
              ),
        ),
      ),
    );
  }
  paint();

  return h(
    "div",
    { class: "card" },
    h("h3", {}, "Grammar topic"),
    h("p", { class: "muted" }, "The topic moves on when you mark Thursday’s drill as “Got it”. Jump around here if you need to. Takes effect from the next grammar day."),
    note,
    list,
  );
}

// ---------- preferences ----------

function preferencesCard(state, save) {
  const s = state.settings;
  const recStatus = h("p", { class: "field-hint", "aria-live": "polite" });
  listAllRecordings()
    .then((all) => {
      const bytes = all.reduce((n, r) => n + (r.blob?.size ?? 0), 0);
      recStatus.textContent = `${all.length} recording${all.length === 1 ? "" : "s"} stored (${(bytes / 1048576).toFixed(1)} MB), ${all.filter((r) => r.starred).length} starred.`;
    })
    .catch(() => {
      recStatus.textContent = "Recordings storage isn’t available in this browser.";
    });

  return h(
    "div",
    { class: "card" },
    h("h3", {}, "Preferences"),
    h(
      "p",
      { class: "check-row" },
      h("input", {
        type: "checkbox",
        id: "pref-chime",
        checked: s.chime,
        onchange: (e) => {
          s.chime = e.target.checked;
          save();
        },
      }),
      h("label", { for: "pref-chime" }, " Play a chime when a timer ends"),
    ),
    voicePicker(s, save),
    h(
      "p",
      { class: "inline-field" },
      h("label", { for: "pref-keep" }, "Keep unstarred recordings for "),
      h("input", {
        type: "number",
        id: "pref-keep",
        min: 1,
        max: 365,
        value: s.keepRecordingsDays,
        onchange: (e) => {
          const n = Math.min(365, Math.max(1, Math.round(Number(e.target.value)) || 14));
          e.target.value = n;
          s.keepRecordingsDays = n;
          save();
        },
      }),
      h("span", {}, " days"),
    ),
    recStatus,
    h(
      "button",
      {
        type: "button",
        class: "btn btn-small",
        onclick: async () => {
          const n = await pruneRecordings(s.keepRecordingsDays, toLocalISODate(new Date()));
          recStatus.textContent = `Deleted ${n} old recording${n === 1 ? "" : "s"}.`;
        },
      },
      "Clean up old recordings now",
    ),
  );
}

// ---------- storage info ----------

function storageCard(config) {
  const persisted = h("span", {}, "checking…");
  const askBtn = h("button", { type: "button", class: "btn btn-small", hidden: true }, "Ask the browser to keep it");

  async function check() {
    if (!navigator.storage?.persisted) {
      persisted.textContent = "unknown in this browser";
      return;
    }
    const yes = await navigator.storage.persisted();
    persisted.textContent = yes ? "yes, protected from automatic cleanup" : "no, the browser may clear it under storage pressure";
    askBtn.hidden = yes;
  }
  askBtn.addEventListener("click", async () => {
    await navigator.storage.persist?.();
    check();
  });
  check();

  return h(
    "div",
    { class: "card" },
    h("h3", {}, "Where your data lives"),
    h("p", {}, "Saved for this exact address: ", h("code", {}, location.origin), ". Always open the app here; another port or 127.0.0.1 would show an empty history."),
    h("p", {}, "Persistent storage: ", persisted, " ", askBtn),
    h("p", { class: "muted" }, "Content (podcasts, topics, prompts) lives in ", h("code", {}, "data/"), ". Edit those files and reload. Programme start date: ", h("code", {}, config.startDate), "."),
  );
}

// ---------- reset ----------

function dangerCard(store) {
  return h(
    "div",
    { class: "card card-danger" },
    h("h3", {}, "Reset"),
    h("p", {}, "Deletes all progress, notes and recordings in this browser. Export a backup first."),
    h(
      "button",
      {
        type: "button",
        class: "btn btn-danger",
        onclick: async () => {
          const answer = prompt("This permanently deletes everything. Type “effacer” to confirm.");
          if (answer?.trim().toLowerCase() !== "effacer") return;
          store.clear();
          try {
            await clearRecordings();
          } catch {
            /* nothing stored */
          }
          location.hash = "#/today";
          location.reload();
        },
      },
      "Delete all data…",
    ),
  );
}

// ---------- dictée voice ----------

function voicePicker(s, save) {
  const select = h("select", { id: "pref-voice", disabled: true }, h("option", {}, "Loading voices…"));
  const hint = h("p", { class: "field-hint muted" });
  const test = h("button", { type: "button", class: "btn btn-small", disabled: true }, "Test");
  frenchVoices().then((voices) => {
    if (!speechSupported() || !voices.length) {
      fill(select, h("option", {}, "No French voice found"));
      hint.textContent = "Install one on Windows: Settings → Time & language → Speech → Add voices → Français. Then restart the browser.";
      return;
    }
    const current = chooseVoice(voices, s.voice);
    fill(select,
      ...voices.map((v) => h("option", { value: v.name, selected: v === current }, `${v.name}${v.localService ? "" : " (online)"}`)),
    );
    select.disabled = false;
    test.disabled = false;
    hint.textContent = "Voices marked “online” need an internet connection.";
    select.addEventListener("change", () => {
      s.voice = select.value;
      save();
    });
    test.addEventListener("click", () =>
      speak("Bonjour ! Je lis la dictée à cette vitesse.", { voice: voices.find((v) => v.name === select.value) }),
    );
  });
  return h(
    "div",
    { class: "field" },
    h("label", { for: "pref-voice" }, "Dictée voice"),
    h("div", { class: "row" }, select, test),
    hint,
  );
}
