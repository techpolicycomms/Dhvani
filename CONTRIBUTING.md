# Contributing to Dhvani

Thanks for your interest in Dhvani! This document explains the workflow, conventions, and areas where help is especially welcome.

## Getting Set Up

```bash
git clone https://github.com/techpolicycomms/dhvani.git
cd dhvani
npm install
cp .env.local.example .env.local   # add your OPENAI_API_KEY
npm run dev
```

For the Electron wrapper:

```bash
npm run electron:dev
```

For the Python companion:

```bash
cd companion
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
python capture.py --list
```

## Development Workflow

1. Fork the repo and create a feature branch:
   ```bash
   git checkout -b feat/your-idea
   ```
2. Make your change. Keep PRs focused — one concern per PR makes review much faster.
3. Run the lint + type checks:
   ```bash
   npm run lint
   npx tsc --noEmit
   ```
4. Commit with a clear message (prefix `feat:`, `fix:`, `docs:`, `refactor:`, `chore:`).
5. Open a PR against `main` and describe:
   - What changed and why
   - How you tested it (which OS, browser, meeting platform)
   - Any screenshots / screen recordings for UI work

## Code Style

- **TypeScript everywhere** in the web app. Use strict types — no `any` unless unavoidable (e.g., Electron IPC payloads).
- **Tailwind CSS** for styling. Prefer utility classes over custom CSS; extend `tailwind.config.ts` for new tokens.
- **React hooks** for state; we intentionally do not pull in a global store library. `localStorage` handles persistence.
- **Comments that say why, not what.** A single descriptive comment at the top of a non-obvious function is worth ten inline comments restating the code.
- **Keep it simple.** Dhvani is a tool, not a platform. Resist adding config knobs unless a real use case demands them.

## Testing

We don't yet have an automated test suite — contributing one is high-value! At minimum, please manually test:

- Start/stop/reconnect in each capture mode you touched
- Long-running (10+ minute) recordings for memory leaks and `localStorage` persistence
- A non-English language (Hindi, French, Japanese) to make sure UTF-8 round-trips cleanly

## Areas We'd Love Help With

- **Tests.** Vitest + Playwright for the transcript pipeline, export formats, and the capture hook.
- **Internationalization.** UI strings are currently English-only; extract them into a locale dictionary.
- **macOS native capture.** A CoreAudio-based companion that avoids the BlackHole install step entirely.
- **Streaming Whisper.** Swap the chunked REST API for the streaming transcription endpoint once broadly available.
- **Speaker diarization.** Integrate an optional diarization pass (e.g., pyannote) in the Python companion.
- **Accessibility.** Screen-reader audits, keyboard-only flows, high-contrast theme.
- **Better PWA icons.** The current icons are procedurally generated placeholders — polished art would be much appreciated.

## Reporting Issues

Please include:

- OS + version, browser + version
- Meeting platform (Zoom desktop/web, Teams desktop/web, Meet, …)
- Capture mode (Tab Audio / Microphone / Virtual Cable / Electron)
- Exact steps to reproduce, plus console errors and any relevant logs

## Code of Conduct

Be kind. Assume good faith. We follow the [Contributor Covenant](https://www.contributor-covenant.org/version/2/1/code_of_conduct/).

## License

By contributing, you agree that your contributions are licensed under the [MIT License](LICENSE).
