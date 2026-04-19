# Dhvani — Desktop build & signing

How to produce signed, notarized `.dmg` / `.exe` installers for Dhvani,
and how to build unsigned local installers for internal testing without
waiting on certificate procurement.

---

## tl;dr commands

```bash
# Compile the Electron main + preload bundle.
npm run build:electron

# Produce a macOS .dmg in ./dist-electron/.
# Without CSC_LINK env: unsigned, works on your machine, Gatekeeper
# will warn other users. With CSC_LINK: fully signed + notarized.
npm run package:mac

# Windows .exe.
npm run package:win

# Both in one shot (macOS host only — Windows builds require a
# Windows runner).
npm run package:all
```

Everything lands in `dist-electron/`.

---

## Signing prerequisites

### macOS

You need a **Developer ID Application** certificate from an Apple
Developer Program account (individual or organization). Self-signed
certs and Mac App Store certs will NOT satisfy Gatekeeper for
directly-distributed DMGs.

**To produce the `CSC_LINK` secret**:

1. In Keychain Access, export the cert + private key as a `.p12` with
   a strong password.
2. Base64-encode the file: `base64 -i cert.p12 | pbcopy`.
3. Paste into GitHub → Settings → Secrets → Actions → `CSC_LINK`
   (as a base64 string; electron-builder will decode it).
4. Store the .p12 password in `CSC_KEY_PASSWORD`.

**For notarization** (required on macOS 10.15+ to avoid "app is damaged"
errors on other machines):

- `APPLE_ID` — the Apple Developer email.
- `APPLE_APP_SPECIFIC_PASSWORD` — generated at appleid.apple.com →
  Security → App-specific passwords. Not your Apple ID password.
- `APPLE_TEAM_ID` — 10-character team id from developer.apple.com →
  Membership.

electron-builder automatically notarizes when all three are present.

### Windows

Two cert options, listed from most to least Windows-reputation-friendly:

1. **EV code-signing cert** (Extended Validation) — ~USD 300/year from
   Sectigo, DigiCert, GlobalSign. Requires an HSM (hardware token). The
   big win: SmartScreen trusts EV-signed binaries immediately, no
   reputation-building warm-up period.
2. **OV code-signing cert** (Organization Validation) — ~USD 100/year.
   Works out of an environment variable, but SmartScreen shows the
   "Unknown publisher" warning for the first few hundred downloads
   until reputation accrues.

**To produce the Windows secrets**:

- `WIN_CSC_LINK` — base64 of the .pfx file.
- `WIN_CSC_KEY_PASSWORD` — the .pfx password.

EV certs on hardware tokens typically cannot be used from GitHub Actions
directly; production EV signing usually requires a self-hosted Windows
runner with the token plugged in.

---

## GitHub Actions secrets

The `.github/workflows/release.yml` workflow reads these secrets. All
are optional — missing secrets produce unsigned builds with a warning,
not a failed workflow.

| Secret | Purpose |
|---|---|
| `CSC_LINK` | base64 of macOS .p12 |
| `CSC_KEY_PASSWORD` | password for the .p12 |
| `APPLE_ID` | Apple Developer account email (for notarization) |
| `APPLE_APP_SPECIFIC_PASSWORD` | app-specific password |
| `APPLE_TEAM_ID` | 10-char Apple Team ID |
| `WIN_CSC_LINK` | base64 of Windows .pfx |
| `WIN_CSC_KEY_PASSWORD` | password for the .pfx |

`GITHUB_TOKEN` is provided automatically by Actions; no setup needed.

---

## Local unsigned build (internal testing)

```bash
# Prevent electron-builder from searching for a cert in your login
# keychain; it will otherwise pick up any leftover dev certs and
# produce a build signed with the wrong identity.
export CSC_IDENTITY_AUTO_DISCOVERY=false

npm run build
npm run build:electron
npm run package:mac   # or package:win
open dist-electron/Dhvani-*.dmg
```

To quiet Gatekeeper on *your* machine only:

```bash
xattr -cr "/Applications/Dhvani.app"
```

This is fine for internal handoffs but is not a substitute for signing
before distributing outside the team.

---

## Release flow (signed + notarized)

1. Bump the version in `package.json` and commit.
2. `git tag v0.2.0 && git push --tags`.
3. GitHub Actions runs matrix build on `macos-14` + `windows-latest`.
4. When signing secrets are present: fully signed + notarized .dmg and
   signed .exe are attached to the Release for the pushed tag.
5. Users can download from `https://github.com/techpolicycomms/Dhvani/releases`.

`workflow_dispatch` is also enabled — use it to build a test installer
from any branch without tagging. Those builds upload as workflow
artifacts (visible on the run page) but do NOT create a Release.

---

## macOS system-audio permissions

Layer A of the capture pipeline (`electron/main.ts`) calls
`session.defaultSession.setDisplayMediaRequestHandler(...)` with
`audio: "loopback"`. For this to work the bundled `.app` must carry:

- `NSMicrophoneUsageDescription` — for user-mic capture.
- `NSCameraUsageDescription` — **required by ScreenCaptureKit** even
  though Dhvani strips the video track immediately.
- `com.apple.security.device.audio-input` entitlement.
- `com.apple.security.device.camera` entitlement.

Both are set up already:

- usage strings via `build.mac.extendInfo` in `package.json`,
- entitlements in `build/entitlements.mac.plist`.

If a user reports "no audio on macOS 13+", check:

1. System Settings → Privacy & Security → Screen Recording → Dhvani is
   enabled. The OS prompt fires on first capture attempt.
2. `codesign -d --entitlements :- /Applications/Dhvani.app` shows both
   `audio-input` and `camera` entitlements.
3. `open /Applications/Dhvani.app/Contents/Info.plist` contains the
   usage-description keys.

On macOS 12 and earlier, ScreenCaptureKit doesn't exist and system-audio
loopback is unavailable. `useAudioCapture` surfaces a clean error and
the user can fall back to Microphone or virtual-cable mode.
