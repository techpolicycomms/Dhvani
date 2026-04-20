# Mobile native (Capacitor) roadmap

## Status (2026-04-20)

Web PWA is the primary mobile strategy — [`public/manifest.json`](../public/manifest.json),
[`public/sw.js`](../public/sw.js), and [`components/InstallPrompt.tsx`](../components/InstallPrompt.tsx)
are in place. Iterated this sprint:

- Graceful iOS audio-capture preflight: mic-only, with clear
  explanation when a user picks Tab / Meeting mode on iOS.
  See [`lib/platform.ts`](../lib/platform.ts) and
  [`components/MobileCapabilityBanner.tsx`](../components/MobileCapabilityBanner.tsx).
- Storage-persistence denial banner so users know recordings can be
  evicted by Safari after 7 days of non-use.
- Haptic feedback on record start/stop (Android only — iOS Safari
  doesn't expose `navigator.vibrate`).
- Fixed-bottom ControlBar on mobile with `env(safe-area-inset-bottom)`
  for iPhone home indicator.
- Touch-target floor of 44px on coarse-pointer devices via
  [`app/globals.css`](../app/globals.css).

## Why Capacitor next

The PWA is good enough for a laptop-near-phone-mic use case, but
the flagship ITU flow — **capture a Teams meeting in the user's
pocket** — hits hard limits:

1. **iOS Safari cannot capture tab or system audio.** `getDisplayMedia`
   only returns video. This is a WebKit policy, not a bug we can fix.
2. **iOS backgrounds MediaRecorder** as soon as Safari loses focus.
   Wake Lock keeps the screen on but doesn't keep recording alive.
3. **No Siri Shortcut from a PWA.** Siri "Hey, start Dhvani" is a ●●●
   Mobile UX + Integration JTBD win we cannot unlock from the web.
4. **No lock-screen controls or Now Playing integration.**

Capacitor wraps the existing Next.js build in a native shell that can
use AVAudioSession on iOS and MediaSession / ForegroundService on
Android, unlocking all four.

## Why Capacitor, not React Native / Flutter

- Reuses 100% of the Next.js app, the TranscriptionContext, the
  Electron code paths. No rewrite.
- Same Azure OpenAI pipeline; the native shell is just an audio
  source + lifecycle manager.
- Small team; shipping three codebases (web, Electron, native) is
  already enough.
- JTBD gate lists "mobile-native app" as a **non-goal** of the PWA
  plan, not of the product — this is the sanctioned path to cover
  it if/when we decide to.

## Plan

### Phase 0 — scaffold (0.5d)

- [ ] `npm install @capacitor/core @capacitor/cli @capacitor/ios @capacitor/android`
- [ ] Create `capacitor.config.ts` targeting the Next.js static export.
- [ ] `npx cap add ios && npx cap add android` — commit the generated
      `ios/` and `android/` dirs.
- [ ] Add npm scripts: `mobile:sync`, `mobile:run:ios`, `mobile:run:android`.
- [ ] CI build matrix extension (can be deferred; spike first).

### Phase 1 — native audio capture plugin (2d)

- [ ] Swift plugin wraps `AVAudioEngine` — microphone today, system
      audio tomorrow. System audio on iOS requires Broadcast Upload
      Extension (shared with ReplayKit), which is a separate App
      Store review path.
- [ ] Kotlin plugin wraps `AudioRecord` + `MediaProjection` for
      Android system audio (supported since API 29).
- [ ] Plugin emits PCM frames to JS via `@capacitor/core` events;
      existing `useAudioCapture` hook swaps its MediaRecorder branch
      for a Capacitor branch when running inside the wrapper
      (analogous to the existing `isElectron()` detection).

### Phase 2 — lifecycle + UX polish (1d)

- [ ] iOS `AVAudioSession` category `.record` with `.mixWithOthers` —
      so recording survives a backgrounded app (critical).
- [ ] `MediaSession` metadata + lock-screen controls (start/stop from
      the Dynamic Island / Now Playing widget).
- [ ] Siri Shortcut: "Start Dhvani recording" → Capacitor plugin
      receives intent → fires the same `startCapture("microphone")`
      path the UI uses.
- [ ] Android foreground service + persistent notification so the OS
      doesn't kill recording in the background.

### Phase 3 — distribution (0.5d + review time)

- [ ] Apple Developer Program enrolment check (Org already has one
      for Electron notarization).
- [ ] TestFlight internal build for the ITU IS Directorate pilot.
- [ ] Privacy manifest (`PrivacyInfo.xcprivacy`) — microphone access,
      no tracking identifiers.
- [ ] Google Play internal track.

## JTBD alignment

| Capability | Mobile UX | Info Entry | 360° View | AI Cons. | Integ. | Cost |
|---|---|---|---|---|---|---|
| Background recording | ●●● | ●●● | · | · | · | · |
| Siri Shortcut | ●●● | ●● | · | · | ●●● | · |
| Lock-screen controls | ●●● | · | · | · | · | · |
| System audio (iOS) | ●● | ●●● | ● | · | ●●● | · |

Primary driver for **Mobile UX** (●●●) and **Integrations** (●●●) —
clears the JTBD gate on its own.

## Open questions

- iOS system-audio capture via Broadcast Upload Extension is a
  screen-recording-class permission. Does the ITU Privacy Review
  approve it? If not, mic-only + "point phone at speaker" remains
  the iOS path — still a lot better than today's PWA.
- Do we ship Capacitor alongside the PWA, or as a replacement? The
  first few releases should be alongside: PWA stays the "try before
  you install" surface, Capacitor is the "daily driver".
