# French study dashboard: plan

A local, single-user dashboard for one 60-minute French session a day
(17:30–18:30). It runs on `http://localhost:8765`, keeps all data in the
browser, and reads its content from plain JSON files you can edit by hand.

Status: **Milestone 1 built.** Milestones 2–8 are waiting on your approval and
your answers to the questions in section 1.

---

## 1. Clarifying questions

These are the ones that would change the design. Until you answer, the plan
uses the default shown in *italics*.

1. **Phone use.** Will you open the app *on your phone* (over Wi-Fi), or only in
   a narrow browser window on the laptop? A phone hitting
   `http://192.168.x.x:8000` is not a "secure context", so the microphone
   recorder and the clipboard button will not work there, and the phone would
   have its own separate storage. Supporting real phone use means a small
   Python server with HTTPS and a JSON file on disk.
   *Default: laptop only; layout still works at phone width.*
2. **Where progress lives.** The GitHub repo `French` is **public**. Should
   progress (logs, writing, words) stay in the browser only, with a manual
   export/import backup file that git ignores? Or do you want it written to a
   file in the repo (which means either a private repo or a gitignored file plus
   a tiny server)?
   *Default: browser storage only, plus export/import to a gitignored
   `backups/` folder.*
3. **Streak rule.** What counts as a day? All three blocks? Any one block? Does
   Sunday count the same, and does a missed day reset the streak to 0?
   *Default: a day counts when Anki, Listening and Focus are all ticked; the log
   is optional; any missed day resets to 0; today stays open until midnight.*
4. **Grammar progression.** Should the topic move on *automatically every
   Monday* (calendar-driven), or only when you mark Thursday's drill as
   "got it" (mastery-driven, so a hard topic can take two weeks)?
   *Default: mastery-driven, with a manual "skip / go back" in Settings.*
5. **Speaking recordings.** Keep a history of recordings so you can hear
   progress over months (stored in IndexedDB, roughly 0.5–1 MB a minute), or
   only keep the last N days?
   *Default: keep the last 14 days, plus any you star.*

---

## 2. Tech stack

| Choice | Why |
| --- | --- |
| **Plain HTML + CSS + JavaScript (ES modules)**, no framework, no build step | The UI is a handful of cards, timers and forms. A framework would add a build and `node_modules` for no real gain. ES modules give clean file boundaries natively. |
| **`python -m http.server 8765`** to serve it | Already on your machine; zero install. A server is needed (rather than double-clicking `index.html`) because browsers block `fetch()` of local JSON from `file://`. |
| **JSON** for content files | Parsed natively by the browser. YAML would be nicer to hand-edit (comments, no trailing-comma errors) but needs a parser library; JSON keeps it at zero dependencies. Files allow a `"_comment"` key for notes, and a validation test catches typos. |
| **`localStorage`** for progress, **IndexedDB** for audio | Both built into the browser and fully offline. `localStorage` is simple and synchronous for small JSON; IndexedDB is the only built-in store suited to audio blobs. |
| **`node --test`** for unit tests (optional) | Node's built-in test runner; no packages. Only the pure logic (schedule, streak, storage migration, content validation) is unit-tested. `package.json` exists only to hold `npm start` / `npm test` shortcuts and has **no dependencies**. |
| **Web platform APIs**: `MediaRecorder`, `navigator.clipboard`, Web Audio | Recorder, copy button, and an end-of-timer chime with no audio file. All work on `localhost`, which browsers treat as a secure context. |

Dependencies added: **none.**

---

## 3. Repo structure

```
French/
├── index.html              App shell: header, nav, <main> mount point, error banner
├── package.json            "type": "module" + start/test scripts. No dependencies.
├── README.md               How to run, how to edit content, how to back up
├── .gitignore              Ignores backups/, OS junk
├── css/
│   └── styles.css          Design tokens (light/dark), layout, cards, timer, forms
├── js/
│   ├── main.js             Boot: load config + content, start router, render
│   ├── router.js           Hash router: #/today, #/history, #/settings
│   ├── content.js          fetch() JSON files (no-store cache), validate, friendly errors
│   ├── schedule.js         PURE: date → weekday plan, focus type, grammar topic,
│   │                       podcast/prompt rotation. No DOM, no storage.
│   ├── streak.js           PURE: streak, totals, per-week stats from history
│   ├── storage.js          localStorage wrapper: versioned schema, migrations,
│   │                       export/import, persist() request
│   ├── recordings.js       IndexedDB store for speaking recordings
│   ├── timer.js            Countdown component based on timestamps (survives
│   │                       reload and background-tab throttling)
│   ├── recorder.js         MediaRecorder wrapper with codec detection
│   ├── dom.js              Tiny helpers: h() element builder, escaping, debounce
│   └── views/
│       ├── today.js        The session page: renders the blocks in order
│       ├── history.js      Calendar/list of past days, streak, stats
│       ├── settings.js     Start date, grammar position, export/import, reset
│       └── blocks/
│           ├── anki.js       Links to Anki + checkbox
│           ├── listening.js  Today's pick, "another one" button, words field
│           ├── grammar.js    Topic of the week, learn/drill, links
│           ├── speaking.js   Prompt, recorder, playback, self-rating
│           ├── writing.js    Prompt, autosaving textarea, "copy for correction"
│           ├── review.js     Sunday: suggests weak areas from the week
│           └── log.js        Went well / fix next time
├── data/                   ← edit these freely, no code involved
│   ├── config.json         Durations, session time, start date, Anki links
│   ├── podcasts.json       Rotating listening list
│   ├── grammar.json        Ordered B1→B2 topic list with links
│   ├── speaking-prompts.json
│   ├── writing-prompts.json
│   └── resources.json      Always-available links (dictionary, conjugation…)
├── tests/
│   ├── schedule.test.js
│   ├── streak.test.js
│   ├── storage.test.js
│   └── content.test.js     Validates every data/*.json file against its schema
└── docs/
    └── PLAN.md             This file
```

---

## 4. Data schemas

### 4.1 Content files (`data/`)

Every item has a stable `id` (kebab-case). Progress refers to items by `id`,
so you can reorder or reword items without breaking history. Any link you
haven't checked yourself carries `"verify": true`, which the UI shows as a
small "unverified" tag until you remove it.

**`config.json`**
```json
{
  "schemaVersion": 1,
  "startDate": "2026-11-16",
  "sessionStart": "17:30",
  "blocks": {
    "anki":      { "minutes": 10 },
    "listening": { "minutes": 25 },
    "focus":     { "minutes": 20 },
    "log":       { "minutes": 5 }
  },
  "focusByWeekday": {
    "mon": "grammar-learn", "tue": "speaking", "wed": "writing",
    "thu": "grammar-drill", "fri": "speaking", "sat": "writing",
    "sun": "review"
  },
  "anki": {
    "links": [
      { "label": "AnkiWeb", "url": "https://ankiweb.net" },
      { "label": "Anki desktop", "url": "https://apps.ankiweb.net" }
    ]
  }
}
```

**`podcasts.json`**
```json
{
  "items": [
    {
      "id": "innerfrench",
      "name": "InnerFrench",
      "url": "https://innerfrench.com",
      "level": "B1",
      "type": "podcast",
      "notes": "Slow, clear, interesting topics. Good default.",
      "verify": false
    }
  ]
}
```
`type` is one of `podcast | youtube | radio | show`. `level` is an
approximate CEFR label used only for display and filtering.

**`grammar.json`**
```json
{
  "topics": [
    {
      "id": "pc-vs-imparfait",
      "title": "Passé composé vs imparfait",
      "level": "B1",
      "summary": "Completed actions vs background, habits and descriptions.",
      "learn": [ { "label": "…", "url": "…", "verify": true } ],
      "drill": [ { "label": "…", "url": "…", "verify": true } ]
    }
  ]
}
```

**`speaking-prompts.json`** / **`writing-prompts.json`**
```json
{
  "items": [
    {
      "id": "sp-weekend",
      "prompt": "Raconte ton dernier week-end en deux minutes.",
      "hint": "Use passé composé for events, imparfait for the background.",
      "grammarTopic": "pc-vs-imparfait",
      "level": "B1"
    }
  ]
}
```
`grammarTopic` is optional; when set, the prompt is preferred during and just
after that grammar week. Writing prompts also take an optional
`"targetWords": 150`.

**`resources.json`**
```json
{ "links": [ { "label": "WordReference", "url": "https://www.wordreference.com", "tags": ["dictionary"] } ] }
```

### 4.2 Saved progress (`localStorage`, key `french-dashboard`)

```json
{
  "schemaVersion": 1,
  "days": {
    "2026-11-16": {
      "focusType": "grammar-learn",
      "blocks": {
        "anki":      { "done": true,  "doneAt": "2026-11-16T17:41:02" },
        "listening": { "done": true,  "itemId": "innerfrench",
                       "words": ["avoir du mal à", "un chantier"] },
        "focus":     { "done": false, "grammarTopic": "pc-vs-imparfait",
                       "promptId": null, "text": null,
                       "rating": null, "recordingIds": [] },
        "log":       { "wentWell": "", "fixNext": "" }
      },
      "timers": {
        "listening": { "remainingMs": 912000, "runningSince": null }
      }
    }
  },
  "grammar": {
    "currentIndex": 0,
    "history": [ { "topicId": "pc-vs-imparfait", "startedOn": "2026-11-16",
                   "status": "learning" } ]
  },
  "rotation": { "podcastOffset": 0, "speakingOffset": 0, "writingOffset": 0 },
  "settings": { "chime": true }
}
```

- Days are keyed by **local date** (`YYYY-MM-DD`), never UTC, so an evening
  session can't land on the wrong day.
- `schemaVersion` + a migration function in `storage.js` let the format change
  later without losing history.
- Streak and stats are **computed** from `days`, never stored, so they can't
  drift out of sync.

### 4.3 Recordings (IndexedDB, database `french-dashboard`, store `recordings`)

```json
{ "id": "rec-2026-11-17-1", "date": "2026-11-17", "promptId": "sp-weekend",
  "mimeType": "audio/webm;codecs=opus", "durationMs": 118000,
  "starred": false, "blob": "<Blob>" }
```

### 4.4 Backup file (export/import)

`backups/french-backup-YYYY-MM-DD.json` = the `localStorage` object above plus,
optionally, recordings as base64. `backups/` is in `.gitignore` so personal
data never reaches the public repo.

---

## 5. Milestones

Each one runs with `npm start` (or `python -m http.server 8765`) and leaves
the app working.

### M1 · Skeleton and schedule ✅ built
- `index.html`, `styles.css` (light/dark tokens, responsive), hash router with
  Today / History / Settings views, `config.json` loaded via `content.js`,
  error banner for missing or broken JSON, `schedule.js` (weekday → focus
  type, block order and times), first unit tests, README, `.gitignore`.
- **Done when:** the page loads at `http://localhost:8765` with no console
  errors; Today shows the date and the four blocks with the right focus for
  the weekday and their clock times (17:30–17:40…); nav switches views; the
  layout works at 375 px; `npm test` passes; breaking `config.json` shows a
  readable error instead of a blank page.

### M2 · Content files
- Fill `podcasts.json`, `grammar.json` (about 16 B1→B2 topics), both prompt
  files (about 20 each), `resources.json`. Unverified links get
  `"verify": true`. `content.test.js` validates every file (required fields,
  unique ids, valid URLs, `grammarTopic` references exist).
- **Done when:** `npm test` validates all files; Today shows which podcast,
  topic and prompt today would use; a deliberately broken file fails the test
  with a clear message.

### M3 · Timers, checkboxes, persistence
- `timer.js` (start / pause / reset, chime at zero), `storage.js` (versioned
  load/save), a "done" checkbox per block. Today's state survives a reload.
- **Done when:** a running timer keeps correct time across a reload and
  background tab; checkboxes persist; `storage.test.js` covers load, save and
  migration from an empty or corrupt store.

### M4 · Anki and Listening blocks
- Anki links + checkbox. Listening: today's pick by date rotation, "pick
  another" button, words field (one per line, autosaved).
- **Done when:** the pick is stable across reloads on the same day and
  changes the next day; words persist.

### M5 · Grammar, Writing, Review blocks
- Grammar: topic of the week, learn links (Mon) / drill links (Thu), "got it"
  / "needs another week". Writing: prompt, autosaving textarea with word
  count, **Copy for correction** builds the correction prompt with your text.
  Sunday review: lists the week's low ratings, flagged topics and new words.
- **Done when:** the textarea never loses text on reload; the copied prompt
  pastes cleanly into Claude; the grammar topic advances by the chosen rule.

### M6 · Speaking block
- `recorder.js` + `recordings.js`: record / stop / replay, list of today's
  takes, 1–5 self-rating with short criteria (fluency, pronunciation,
  accuracy). Codec detected per browser. Old recordings pruned per Q5.
- **Done when:** you can record, reload, and still replay; mic denial shows a
  helpful message rather than an error.

### M7 · Log, streak, history
- Final log block. `streak.js` (current and longest streak, per-week totals).
  History view: one row per day with blocks done, focus, words, log notes.
- **Done when:** `streak.test.js` covers gaps, today-in-progress, Sundays and
  timezone edges; history shows real saved days.

### M8 · Settings and polish
- Export / import backup, reset with confirmation, grammar position
  override, show the storage origin, `navigator.storage.persist()`. Keyboard
  and accessibility pass, phone-width check.
- **Done when:** export → clear storage → import restores everything;
  Lighthouse accessibility ≥ 95 (rough target).

---

## 6. Risks and open decisions

**Risks**
- **Storage is tied to the exact origin.** `localhost:8765`,
  `127.0.0.1:8765` and `localhost:8080` are three separate stores. Fix: always
  use `http://localhost:8765` (README + `npm start`), show the origin in
  Settings, and keep the export/import backup.
- **Browsers can clear storage** (clearing site data, some privacy settings).
  Fix: `navigator.storage.persist()`, a "last backup" reminder after 7 days.
- **Microphone and clipboard need a secure context.** Fine on `localhost`,
  broken on a LAN IP from a phone (see Q1).
- **Recording formats differ** (Chrome/Firefox: WebM/Opus; Safari: MP4/AAC).
  Fix: `MediaRecorder.isTypeSupported()` detection; store the MIME type.
- **Timers drift in background tabs** if they count ticks. Fix: store the end
  timestamp and compute remaining time from `Date.now()`.
- **Hand-edited JSON breaks easily** (trailing commas, missing quotes). Fix:
  `content.test.js`, plus an in-page banner naming the file and line.
- **Edited JSON may be cached.** Fix: `fetch(url, { cache: "no-store" })`.
- **Link rot / wrong URLs.** Fix: `"verify": true` tag, mostly root domains
  rather than deep links.
- **Port 8000 is reserved by Windows on this machine** (Hyper-V/WinNAT excluded range), so the app uses **8765**. If that is ever taken, change it in `package.json`, `.claude/launch.json` and README; note that changing port means a new, empty storage origin (export first).
- **Public repo.** Never commit `backups/` or anything personal.

**Open decisions** (beyond section 1)
- Export the week's new words as an **Anki-importable CSV** (front/back)?
  Cheap to add in M7, closes the loop between Listening and Anki.
- UI language: English labels with French content (current), or French UI
  for extra exposure?
- Should timers auto-advance to the next block, or wait for you?
  *Current: wait; the next block is highlighted.*
- Pronunciation focus (your weak point): add a recurring nasal-vowel and
  spelling-vs-sound mini-drill to speaking days, using Forvo for reference
  audio?
