# Dhvani — Web / macOS / Windows Parity

Every user-facing feature ships to every platform at the same commit
because there is **one codebase**. The Electron apps aren't separate
products; they're thin wrappers that load the Next.js app.

---

## How the three platforms share code

```
                   ┌───────────────────────────────┐
                   │   Next.js 14 App Router       │   ← single source
                   │   (app/, components/, lib/,   │
                   │    hooks/, contexts/)         │
                   └───────────────────────────────┘
                                 │
               ┌─────────────────┼─────────────────┐
               │                 │                 │
        ┌───────────────┐ ┌─────────────┐ ┌───────────────┐
        │ Browser       │ │ macOS       │ │ Windows       │
        │ (any modern)  │ │ Dhvani.app  │ │ Dhvani.exe    │
        └───────────────┘ └─────────────┘ └───────────────┘
                │                 │                 │
                │                 │                 │
                └─────── loads ───┴─── loads ───────┘
                                  │
                       http(s)://<configured-URL>
```

- **Web** users hit the deployed Next.js server directly.
- **Desktop** users run `Dhvani.app` / `Dhvani.exe`, which is an
  Electron shell that loads the same server URL in a `BrowserWindow`.

The Electron main process adds a handful of **platform-only**
capabilities — it doesn't fork the product logic:

| Electron-only | What it adds | Why |
|---|---|---|
| `session.setDisplayMediaRequestHandler` | System-audio loopback (ScreenCaptureKit / WASAPI) | Browsers can't capture arbitrary app audio without a virtual cable |
| Tray icon + global shortcut | Cmd/Ctrl+Shift+T to start/stop | Desktop affordance |
| `build-config.json` reader | Baked server URL per build | Internal-beta installs point at localhost without a wrapper script |
| Entra auth-host allowlist | Keeps OAuth inside the window | Cookie continuity for PKCE |

Everything else — Meeting mode, speaker picker, vocabulary priming,
UN-style .docx, Cmd+R, dark theme, the lot — lives in the renderer
and runs identically on all three.

---

## Verifying parity on a change

Any renderer-scoped change (which is >90% of commits) is verified on
one platform = verified on all three. For sanity:

- `npm run dev` in browser → fastest iteration loop.
- `npm run electron:dev` → same dev server, now loaded inside Electron.
- `npm run package:mac:localhost` → signed-ish DMG pointing at localhost.
- GitHub Actions `Release Desktop Installers` → macOS + Windows signed-
  optional installers from the same commit.

If a change touches **`electron/**`**, `setDisplayMediaRequestHandler`,
or the app-bundle build-config, re-run the Electron matrix. Otherwise
tsc + lint + one browser sanity check is sufficient.

---

## Platform-specific wrappers

| File | Scope | Notes |
|---|---|---|
| `electron/main.ts` | Main process | Loads URL, owns tray, registers request handlers |
| `electron/preload.ts` | Renderer bridge | Exposes `electronAPI.isElectron` + `onToggleCapture` |
| `scripts/write-electron-build-config.mjs` | Build-time | Writes `electron/dist/build-config.json` |
| `build/entitlements.mac.plist` | macOS-only | Hardened runtime entitlements |
| `.github/workflows/release.yml` | CI matrix | macOS + Windows, signing-optional |

Nothing else is platform-specific. If you catch a diff where the web
app does something the desktop app can't, or vice versa, that's a
bug — file it.

---

## Current distribution state

| Artifact | Where | Who for |
|---|---|---|
| `https://dhvani.itu.int` (web) | Azure App Service | everyone with Entra |
| `public/downloads/Dhvani-0.1.0-arm64.dmg` | Served by the web app | Apple Silicon Macs, internal beta |
| `public/downloads/Dhvani-0.1.0.dmg` | Served by the web app | Intel Macs, internal beta |
| `public/downloads/Dhvani-Setup-0.1.0.exe` | Served by the web app | Windows 10/11 x64, internal beta |

All three desktop files are **unsigned** — they work but Gatekeeper /
SmartScreen will warn on first install. See
`docs/CIO_ISD_HANDOVER.md` → Credentials section for the signing path.

The GitHub Actions release workflow produces the same three artifacts
on every `tag: v*` push (or `workflow_dispatch`), so the web app's
`/download` page will resolve to the latest signed installers the
moment signing certs are wired into repository secrets.

---

## FAQ

**Q: I edited a React component. Does the desktop app need a rebuild?**
A: No, not unless you're also editing `electron/`. The web deploy is
the source of truth; desktop installs load the web URL live.

**Q: I added a feature that uses a browser-only API.**
A: If it works in the Electron renderer (same Chromium), it works
everywhere. The only browser-only concern is `getDisplayMedia` for
system audio — see Meeting mode's mixer in `hooks/useAudioCapture.ts`.

**Q: The Windows EXE is out of date.**
A: Re-run the `Release Desktop Installers` workflow on GitHub; it
rebuilds from HEAD. Or wait for the next signed release tag — same
output.
