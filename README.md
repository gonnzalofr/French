# French Daily

A local, single-user dashboard that guides one 60-minute French session a day:
Anki → Listening → a weekday focus block (grammar, speaking, writing or review)
→ a quick log. No accounts, no cloud, no API keys, no dependencies.

See [docs/PLAN.md](docs/PLAN.md) for the design, data schemas and milestones.

## Run it

```bash
npm start
```

or, without npm:

```bash
python -m http.server 8765 --bind 127.0.0.1
```

Then open **http://localhost:8765**. Always use that exact address: progress
is stored in the browser per address, so `127.0.0.1:8765` or a different port
would start with an empty history.

Preview any day's plan with `http://localhost:8765/#/today?date=2026-11-19`.

## Edit the content

Everything you'd want to change lives in `data/` as plain JSON:

| File | What it holds |
| --- | --- |
| `data/config.json` | Session start time, block lengths, which focus runs on which weekday, Anki links |

More files (podcasts, grammar topics, prompts, resources) arrive in milestone 2.

Edit, save, reload the page. If a file has a typo, the page shows which file
and line. To check every file at once:

```bash
npm test
```

(`npm test` uses Node's built-in test runner; nothing to install.)

## Your data

Progress stays in your browser on this computer. Nothing is sent anywhere.
Exported backups go in `backups/`, which git ignores because this repo is
public.
