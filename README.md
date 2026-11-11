# French Daily

A local, single-user dashboard that guides one 60-minute French session a day:
**Anki → Listening → a weekday focus block → a quick log.** No accounts, no
cloud, no API keys, no dependencies.

| Day | Focus block (20 min) |
| --- | --- |
| Mon | Grammar: learn this week's topic |
| Tue, Fri | Speaking: prompt, recorder, self-rating, pronunciation warm-up |
| Wed, Sat | Writing: prompt, autosaving text, "Copy for correction" for Claude |
| Thu | Grammar: drill the topic, then "Got it" or "Needs another week" |
| Sun | Review: week summary, catch-up suggestions, words, false friends |

See [docs/PLAN.md](docs/PLAN.md) for the design, data schemas and decisions.

## Run it

```bash
npm start
```

or, without npm:

```bash
python -m http.server 8765 --bind 127.0.0.1
```

Then open **http://localhost:8765**. Always use that exact address: progress
is stored in the browser per address, so `127.0.0.1:8765` or another port
starts with an empty history. (Port 8000 is reserved by Windows on this
machine, which is why it's 8765.)

Open any other day with `#/today?date=YYYY-MM-DD`, e.g.
`http://localhost:8765/#/today?date=2026-11-19`. Handy for ticking a session
you forgot to log.

## How a session works

- Each block has a countdown (start/pause/reset) and a **Done** box. Timers
  survive reloads; starting one pauses the others; a chime plays at zero.
- The next unfinished block is outlined. A day counts toward your streak once
  Anki, Listening and Focus are done (the log is optional).
- Listening, prompts and pronunciation drills rotate: the least-used item comes
  first, with prompts that match the current grammar topic preferred.
  "Pick another" skips to the next one.
- In the Listening notes, write `mot = meaning` to get a proper Anki card.
  History → **Words for Anki** copies or downloads a tab-separated file for
  Anki's File → Import.
- Speaking recordings stay in the browser for 14 days; star a take to keep it
  forever.

## Edit the content

Everything you'd want to change lives in `data/` as plain JSON:

| File | What it holds |
| --- | --- |
| `config.json` | Session time, block lengths, weekday plan, Anki links, the correction-prompt template |
| `podcasts.json` | Listening rotation |
| `grammar.json` | B1→B2 grammar topics in order, plus the learn/drill sites |
| `speaking-prompts.json` | Speaking prompts (optionally tied to a grammar topic) |
| `writing-prompts.json` | Writing prompts with a target length |
| `pronunciation.json` | Warm-up drills and the audio-link pattern |
| `false-friends.json` | English and Spanish false friends for Sunday |
| `resources.json` | Dictionaries and other always-on links |

Links marked `"verify": true` show an **unverified** tag in the app. Check
them, then set `"verify": false`.

Edit, save, reload. If a file has a typo, the page shows which file and what's
wrong. To check every file at once:

```bash
npm test
```

`npm test` uses Node's built-in test runner, so there's nothing to install.
It runs the content checks plus unit tests for the scheduling, rotation,
streak, storage and timer logic.

## Your data

Progress stays in your browser on this computer. Nothing is sent anywhere.
Settings → **Export backup** downloads a JSON file (optionally with
recordings); **Import backup** restores it. Keep backups in `backups/`, which
git ignores because this repo is public. The Today page reminds you if your
last backup is more than a week old.
