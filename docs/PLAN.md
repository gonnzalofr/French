# French study dashboard: plan

A local, single-user dashboard for one 60-minute French session a day
(17:30–18:30). It runs on `http://localhost:8765`, keeps all data in the
browser, and reads its content from plain JSON files you can edit by hand.

Status: **All eight milestones built** (11 Nov 2026). The design questions
were settled with the recommended defaults below; change any of them later by
editing the code or `data/config.json`.

---

## 1. Design decisions

| Question | Decision |
| --- | --- |
| Phone use | Laptop only. The layout works at phone width, but a phone on `http://192.168.x.x` isn't a secure context, so the mic and copy button wouldn't work there. |
| Where progress lives | In the browser only (`localStorage` + IndexedDB), with export/import backup files. `backups/` is git-ignored because the repo is public. |
| Streak rule | A day counts when Anki, Listening and Focus are ticked; the log is optional. A missed day resets to 0. Today stays open until midnight. Sunday counts the same. |
| Grammar progression | Mastery-driven: the topic moves on only when Thursday's drill is marked "Got it". Settings can jump to any topic. After the last topic, the list starts again (round 2). |
| Speaking recordings | Kept 14 days (changeable in Settings), starred takes kept forever. |
| Anki export | Yes: words noted as `mot = meaning` export as a tab-separated file for Anki's import. |
| UI language | English labels, French content and dates. |
| Timers | Don't auto-advance; the next unfinished block is highlighted. Starting one timer pauses the others. |
| Pronunciation | A 3-minute warm-up drill (nasals, u/ou, silent endings, liaison, R…) on speaking days, with Forvo links. |
| False friends | Two per week in Sunday review, for both English and Spanish traps. |

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
├── index.html              App shell: header, nav, <main>, error and warning banners
├── package.json            "type": "module" + start/test scripts. No dependencies.
├── README.md               How to run, edit content, back up
├── .gitignore              Ignores backups/ (personal data) and OS junk
├── .claude/launch.json     Preview-server config for Claude Code
├── css/
│   └── styles.css          Light/dark tokens, layout, cards, timer, forms, calendar
├── js/
│   ├── main.js             Boot: load config + content, open store, router, cleanups
│   ├── router.js           Hash router: #/today[?date=], #/history, #/settings
│   ├── content.js          fetch + validate data/*.json, link builders
│   ├── schedule.js         PURE: dates, weekday → focus, block times
│   ├── picks.js            PURE: least-used rotation for podcasts/prompts/drills
│   ├── day.js              PURE: day records, grammar verdicts, words, word count,
│   │                       correction-prompt template
│   ├── streak.js           PURE: streaks, totals, week summary, Anki export
│   ├── storage.js          Versioned localStorage store, migration, backup format
│   ├── recordings.js       IndexedDB store for audio, pruning, backup helpers
│   ├── recorder.js         MediaRecorder wrapper with codec detection
│   ├── timer.js            Timestamp-based countdown widget
│   ├── sound.js            Web Audio chime (no audio file)
│   ├── dom.js              h() builder, autosave field, copy, download helpers
│   └── views/
│       ├── today.js        The session page: header, four block cards, links
│       ├── history.js      Stats, 12-week calendar, word export, day list
│       ├── settings.js     Backup, grammar position, preferences, storage, reset
│       └── blocks/
│           ├── anki.js       Anki links
│           ├── listening.js  Today's pick, "Pick another", words field
│           ├── grammar.js    Topic, key points, examples, links, verdict
│           ├── speaking.js   Prompt, warm-up, recorder, takes, self-rating
│           ├── writing.js    Prompt, autosaving text, Copy for correction
│           ├── review.js     Sunday: week summary, catch-up, words, false friends
│           └── log.js        Went well / fix next, with last time's "fix"
├── data/                   ← edit these freely, no code involved
│   ├── config.json         Times, durations, weekday plan, Anki links,
│   │                       correction-prompt template
│   ├── podcasts.json       Listening rotation
│   ├── grammar.json        19 B1→B2 topics + learn/drill sites
│   ├── speaking-prompts.json
│   ├── writing-prompts.json
│   ├── pronunciation.json  Warm-up drills + audio link pattern
│   ├── false-friends.json  EN and ES false friends
│   └── resources.json      Always-available links
├── tests/
│   ├── schedule.test.js
│   ├── content.test.js     Validates every data file
│   └── logic.test.js       Storage, rotation, days, streaks, timers, pruning
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
      "query": "passé composé imparfait",
      "keyPoints": ["…"],
      "examples": [ { "fr": "…", "en": "…" } ]
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
    "2026-11-19": {
      "focusType": "grammar-drill",
      "pickedOn": "2026-11-19",
      "blocks": {
        "anki":      { "done": true,  "doneAt": "2026-11-19T16:41:02.000Z" },
        "listening": { "done": true,  "itemId": "innerfrench",
                       "words": ["avoir du mal à = to struggle to", "un chantier"] },
        "focus":     { "done": false, "grammarTopic": "pc-vs-imparfait",
                       "notes": "", "verdict": "got-it" },
        "log":       { "done": false, "wentWell": "", "fixNext": "" }
      },
      "timers": {
        "listening": { "remainingMs": 912000, "runningSince": null }
      }
    }
  },
  "grammar": {
    "currentIndex": 1,
    "log": [ { "date": "2026-11-19", "topicId": "pc-vs-imparfait", "verdict": "got-it" } ]
  },
  "settings": { "chime": true, "keepRecordingsDays": 14, "lastBackup": null }
}
```

The `focus` object depends on the day's type:
- grammar: `grammarTopic`, `notes`, `verdict` (Thursday: `"got-it" | "again" | null`)
- speaking: `promptId`, `drillId`, `rating` `{fluency, pronunciation, accuracy}`
  (1–5 or null), `notes`, `recordingIds`
- writing: `promptId`, `text`, `corrections`
- review: `notes`

Rotation isn't stored: each pick goes to the least-used item, counted from
past days whose block was ticked. `pickedOn` lets a day previewed in advance
get fresh picks when it actually arrives.

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

### M1 · Skeleton and schedule ✅
- `index.html`, `styles.css` (light/dark tokens, responsive), hash router with
  Today / History / Settings views, `config.json` loaded via `content.js`,
  error banner for missing or broken JSON, `schedule.js` (weekday → focus
  type, block order and times), first unit tests, README, `.gitignore`.
- **Done when:** the page loads at `http://localhost:8765` with no console
  errors; Today shows the date and the four blocks with the right focus for
  the weekday and their clock times (17:30–17:40…); nav switches views; the
  layout works at 375 px; `npm test` passes; breaking `config.json` shows a
  readable error instead of a blank page.

### M2 · Content files ✅
- Fill `podcasts.json`, `grammar.json` (about 16 B1→B2 topics), both prompt
  files (about 20 each), `resources.json`. Unverified links get
  `"verify": true`. `content.test.js` validates every file (required fields,
  unique ids, valid URLs, `grammarTopic` references exist).
- **Done when:** `npm test` validates all files; Today shows which podcast,
  topic and prompt today would use; a deliberately broken file fails the test
  with a clear message.

### M3 · Timers, checkboxes, persistence ✅
- `timer.js` (start / pause / reset, chime at zero), `storage.js` (versioned
  load/save), a "done" checkbox per block. Today's state survives a reload.
- **Done when:** a running timer keeps correct time across a reload and
  background tab; checkboxes persist; `storage.test.js` covers load, save and
  migration from an empty or corrupt store.

### M4 · Anki and Listening blocks ✅
- Anki links + checkbox. Listening: today's pick by date rotation, "pick
  another" button, words field (one per line, autosaved).
- **Done when:** the pick is stable across reloads on the same day and
  changes the next day; words persist.

### M5 · Grammar, Writing, Review blocks ✅
- Grammar: topic of the week, learn links (Mon) / drill links (Thu), "got it"
  / "needs another week". Writing: prompt, autosaving textarea with word
  count, **Copy for correction** builds the correction prompt with your text.
  Sunday review: lists the week's low ratings, flagged topics and new words.
- **Done when:** the textarea never loses text on reload; the copied prompt
  pastes cleanly into Claude; the grammar topic advances by the chosen rule.

### M6 · Speaking block ✅
- `recorder.js` + `recordings.js`: record / stop / replay, list of today's
  takes, 1–5 self-rating with short criteria (fluency, pronunciation,
  accuracy). Codec detected per browser. Old recordings pruned per Q5.
- **Done when:** you can record, reload, and still replay; mic denial shows a
  helpful message rather than an error.

### M7 · Log, streak, history ✅
- Final log block. `streak.js` (current and longest streak, per-week totals).
  History view: one row per day with blocks done, focus, words, log notes.
- **Done when:** `streak.test.js` covers gaps, today-in-progress, Sundays and
  timezone edges; history shows real saved days.

### M8 · Settings and polish ✅
- Export / import backup, reset with confirmation, grammar position
  override, show the storage origin, `navigator.storage.persist()`. Keyboard
  and accessibility pass, phone-width check.
- **Done when:** export → clear storage → import restores everything;
  Lighthouse accessibility ≥ 95 (rough target).

---

## 6. Risks

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

**Not covered by automated tests**
- Recording with a real microphone (the recorder UI, storage, starring,
  export and import were tested with a synthetic recording).
- The timer chime (needs a human ear).
- Links marked `"verify": true` still need a manual check.
