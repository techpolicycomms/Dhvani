# Dhvani headless QA

Unattended Playwright coverage for a subset of [docs/E2E_TESTING_PROMPT.md](../../docs/E2E_TESTING_PROMPT.md). A human still runs the full suite for anything that needs real audio routing or MFA.

## Scripts

| Script | Covers | Exit non-zero on |
| --- | --- | --- |
| `sweep.mjs` | Test 10 — all routes in both themes, Power mode | any route navigation failure |
| `record-smoke.mjs` | Test 2.4 — Personal-mode mic record, chunk-retry regression | `"chunk N was lost"` / `"X chunks failed"` toast |

`record-smoke.mjs` uses a Chromium fake media stream. On some dev envs, `MediaRecorder` never actually starts against a fake device — the script reports `started: false` and exits 0 as long as no lost-chunk toast appeared. The toast regression is the load-bearing assertion; "did it truly record" needs a human run.

## Run

```bash
npm run dev            # or have any server on :3001
DHVANI_URL=http://127.0.0.1:3001 npm run qa:sweep
DHVANI_URL=http://127.0.0.1:3001 npm run qa:smoke
npm run qa:all         # both, in sequence
```

Screenshots: `qa-report-screenshots/` (gitignored).

## Not covered here

Crash recovery (§5), tab-audio (§3), exports (§7), keyboard shortcuts (§11), accessibility spot-checks (§12). These need a human-driven session — see the main E2E doc.
